import { v4 as uuidv4 } from 'uuid';

// Import modular services
import { ServiceFactory } from './factories/ServiceFactory';
import {
  IMessageService,
  IConversationService,
  IUserService,
  IFileService,
  IRealtimeService,
  IOfflineQueueService,
  IStorageService,
  ICacheService
} from './interfaces';

// Import types
import { 
  Message,
  QueuedMessage, 
  MessageStatus, 
  AttachmentType, 
  ChatConversation, 
  MessageType,
  ServerConversation,
  ConversationParticipant,
  ConversationMetadata,
  ConversationSettings,
  MessageLoadResult,
  MessageLoadOptions,
  UserRegistrationData,
  ConversationCreationResponse,
  ConnectionState,
  UserRole,
  ConversationStatus,
  ConversationType,
  ValidationException,
  NetworkException,
  AuthException,
  UploadFileResponse,
  OnlineUser,
  Attachment
} from '../types/chat';

// Import store types
import { IChatStore, IChatActions, NoOpStore } from '../types/store';

import * as messagingReducer from '../stores/reducer/messagingReducer';

// Platform detection
const isNodeEnvironment = typeof window === 'undefined' && typeof global !== 'undefined';

let Platform: { OS: 'node' | 'web' | 'ios' | 'android', Version: string | undefined } = {
  OS: isNodeEnvironment ? 'node' : 'web',
  Version: isNodeEnvironment ? process.version : 'v-shim'
};

// Define default actions using the static import
const defaultActions: IChatActions = {
  setInitialized: messagingReducer.setInitialized,
  setConnectionState: messagingReducer.setConnectionState,
  handleNewMessage: messagingReducer.handleNewMessage,
  markConversationAsRead: messagingReducer.markConversationAsRead,
  setActiveConversation: messagingReducer.setActiveConversation,
  updateTypingUsers: messagingReducer.updateTypingUsers,
  resetMessagingState: messagingReducer.resetMessagingState,
  updateConversationMetadata: messagingReducer.updateConversationMetadata,
  removeConversation: messagingReducer.removeConversation,
  syncConversations: messagingReducer.syncConversations,
};

// Configuration constants
const CHAT_CONFIG = {
  MESSAGE_TIMEOUT: 10000,
  ATTACHMENT_TIMEOUT: 15000,
  MAX_SESSION_AGE: 24 * 60 * 60 * 1000, // 24 hours
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
  CLEANUP_INTERVAL: 5 * 60 * 1000, // 5 minutes
  DEFAULT_PAGE_SIZE: 50,
  DEFAULT_CONVERSATION_LIMIT: 20,
  ONLINE_USERS_TIMEOUT: 5000, // 5 seconds
} as const;

/**
 * Refactored ChatService using modular services
 * This maintains the same external API but uses decomposed services internally
 */
class ChatService {
  // Service instances
  private messageService!: IMessageService;
  private conversationService!: IConversationService;
  private userService!: IUserService;
  private fileService!: IFileService;
  private realtimeService!: IRealtimeService;
  private offlineQueueService!: IOfflineQueueService;
  private storageService!: IStorageService;
  private cacheService!: ICacheService;

  // State (keeping essential state that coordinates between services)
  private userId: string = '';
  private userRole: string = '';
  private token: string = '';
  private isInitialized: boolean = false;
  private userDetails: UserRegistrationData | null = null;
  private reduxStore: any = null;
  private reduxActions: IChatActions = defaultActions;

  // Event cleanup functions
  private eventCleanupFunctions: Array<() => void> = [];
  private cleanupInterval: number | null = null;

  constructor() {
    this.startMemoryCleanup();
  }

  // ==========================================
  // INITIALIZATION & LIFECYCLE
  // ==========================================

  async initialize(
    userId: string, 
    userRole: string, 
    token: string,
    reduxStore?: any,
    userDetails?: UserRegistrationData
  ): Promise<void> {
    try {
      // Validation
      if (!userId?.trim()) throw new ValidationException('User ID is required');
      if (!userRole?.trim()) throw new ValidationException('User role is required');
      if (!token?.trim()) throw new ValidationException('Authentication token is required');

      // Check if already initialized
      if (this.isInitialized && 
          this.userId === userId && 
          this.token === token) {
        console.log('✓ Chat service already initialized with same credentials');
        return;
      }

      console.log('🚀 Initializing chat service with modular architecture...');
      
      // Clean up if reinitializing
      if (this.isInitialized) {
        await this.cleanup();
      }

      // Set state
      this.userId = userId;
      this.userRole = userRole;
      this.token = token;
      this.userDetails = userDetails || null;
      if (reduxStore) {
        this.setReduxStore(reduxStore);
      }

      // Configure and create services
      ServiceFactory.configure({ 
        token,
        platform: Platform.OS as any,
        enableLogging: process.env.NODE_ENV === 'development'
      });
      this.createServices();

      // Connect realtime service
      await this.realtimeService.connect(userId, token);

      // Setup event listeners
      this.setupEventListeners();

      // Load offline queue
      await this.offlineQueueService.loadQueue();
      
      // Process offline queue if connected
      if (this.realtimeService.isConnected() && this.offlineQueueService.getQueueSize() > 0) {
        console.log(`📤 Processing ${this.offlineQueueService.getQueueSize()} offline messages...`);
        setTimeout(() => {
          this.offlineQueueService.processQueue();
        }, 3000);
      }

      this.isInitialized = true;
      this.safeDispatch(this.reduxActions.setInitialized(true));

      // Save session
      await this.saveSession();

      console.log('✓ Chat service initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize chat service:', error);
      this.isInitialized = false;
      this.safeDispatch(this.reduxActions.setInitialized(false));
      throw error;
    }
  }

  private createServices(): void {
    // Create all services using factory
    this.messageService = ServiceFactory.createMessageService();
    this.conversationService = ServiceFactory.createConversationService();
    this.userService = ServiceFactory.createUserService();
    this.fileService = ServiceFactory.createFileService();
    this.realtimeService = ServiceFactory.createRealtimeService();
    this.offlineQueueService = ServiceFactory.createOfflineQueueService();
    this.storageService = ServiceFactory.createStorageService();
    this.cacheService = ServiceFactory.createCacheService();

    // Configure offline queue with send function
    this.offlineQueueService.setSendFunction(
      (message: Message) => this.messageService.sendMessage(
        message.conversationId,
        message.content,
        message.receiverId || '',
        {
          replyTo: message.replyTo,
          attachments: message.attachments
        }
      )
    );
  }


  private setupEventListeners(): void {
  // Connection state changes
  const connectionCleanup = this.realtimeService.onConnectionChange((state) => {
    console.log('📡 Connection state changed:', state);
    this.safeDispatch(this.reduxActions.setConnectionState(state));
    
    // Process offline queue when reconnected
    if (state === ConnectionState.CONNECTED && this.offlineQueueService.getQueueSize() > 0) {
      this.offlineQueueService.processQueue();
    }
  });
  this.eventCleanupFunctions.push(connectionCleanup);

  // New messages
  const messageCleanup = this.realtimeService.onMessage((message) => {
    console.log('💬 New message received:', message.id);
    
    // Cache the message
    this.cacheService.cacheMessage(message.conversationId, message);

    // Update Redux for incoming messages
    if (message.senderId !== this.userId) {
      const conversation = this.cacheService.getCachedConversation(message.conversationId);
      this.safeDispatch(this.reduxActions.handleNewMessage({
        conversationId: message.conversationId,
        senderId: message.senderId,
        messagePreview: message.content.substring(0, 50),
        timestamp: message.timestamp,
        otherUserName: this.getOtherUserName(conversation),
        jobTitle: conversation?.metadata?.jobTitle
      }));
    }
  });
  this.eventCleanupFunctions.push(messageCleanup);

  // ✅ UPDATED: Message sent confirmations
  const sentCleanup = this.realtimeService.onMessageSent((data) => {
    console.log('✅ Message sent confirmation:', {
      messageId: data.messageId,
      clientTempId: data.clientTempId,
      conversationId: data.conversationId,
      status: data.status
    });
    
    // ✅ NEW: Handle clientTempId matching for optimistic updates
    if (data.clientTempId && data.conversationId) {
      // Find the optimistic/temp message
      const cachedMessages = this.cacheService.getCachedMessages(data.conversationId);
      const tempMessage = cachedMessages.find(m => 
        m.clientTempId === data.clientTempId && 
        (m.status === MessageStatus.SENDING || m.status === MessageStatus.QUEUED)
      );
      
      if (tempMessage) {
        console.log('✅ Updating temp message:', {
          oldId: tempMessage.id,
          newId: data.messageId,
          clientTempId: data.clientTempId
        });
        
        // Update the message with server ID and status
        const updatedMessage: Message = {
          ...tempMessage,
          id: data.messageId,
          status: MessageStatus.SENT,
          //timestamp: data.timestamp || tempMessage.timestamp
        };
        
        // Update in cache
        this.cacheService.cacheMessage(data.conversationId, updatedMessage);
        
        console.log('✅ Temp message updated to SENT');
      } else {
        console.warn('⚠️ No temp message found for clientTempId:', data.clientTempId);
      }
    }
    
    // Remove from offline queue if exists
    if (data.clientTempId) {
      this.offlineQueueService.removeFromQueue(data.clientTempId);
    }
  });
  this.eventCleanupFunctions.push(sentCleanup);

  // Typing indicators (unchanged)
  const typingCleanup = this.realtimeService.onTyping((data) => {
    this.safeDispatch(this.reduxActions.updateTypingUsers({
      conversationId: data.conversationId,
      typingUserIds: data.isTyping ? [data.userId] : []
    }));
  });
  this.eventCleanupFunctions.push(typingCleanup);
}

  // ==========================================
  // CONVERSATION METHODS (delegating to ConversationService)
  // ==========================================

  async createConversation(params: {
    participantIds: string[];
    type: ConversationType;
    jobId?: string;
    jobTitle?: string;
    status?: ConversationStatus;
  }): Promise<ConversationCreationResponse> {
    this.checkInitialized();
    return this.conversationService.createConversation(params);
  }

  async getConversationById(conversationId: string): Promise<ServerConversation> {
    this.checkInitialized();
    return this.conversationService.getConversation(conversationId);
  }

  async findJobConversation(jobId: string, otherUserId: string): Promise<ServerConversation | null> {
    this.checkInitialized();
    return this.conversationService.findJobConversation(jobId, otherUserId);
  }

  async findOrCreateJobConversation(jobId: string, otherUserId: string): Promise<ServerConversation> {
    this.checkInitialized();
    
    // Try to find existing
    const existing = await this.conversationService.findJobConversation(jobId, otherUserId);
    if (existing) {
      return existing;
    }
    
    // Create new
    const result = await this.conversationService.createConversation({
      participantIds: [this.userId, otherUserId],
      type: ConversationType.JOB_CHAT,
      jobId,
      status: ConversationStatus.ACTIVE
    });
    
    return result.conversation;
  }

  async getMyConversations(params?: any) {
    this.checkInitialized();
    const result = await this.conversationService.getConversations(params);
    
    // Sync to Redux
    await this.syncConversationsToRedux(result.conversations);
    
    return result;
  }

  async pinConversation(conversationId: string): Promise<void> {
    this.checkInitialized();
    await this.conversationService.pinConversation(conversationId);
    this.safeDispatch(this.reduxActions.updateConversationMetadata({
      conversationId,
      metadata: { isPinned: true }
    }));
  }

  async unpinConversation(conversationId: string): Promise<void> {
    this.checkInitialized();
    await this.conversationService.unpinConversation(conversationId);
    this.safeDispatch(this.reduxActions.updateConversationMetadata({
      conversationId,
      metadata: { isPinned: false }
    }));
  }

  async archiveConversation(conversationId: string): Promise<void> {
    this.checkInitialized();
    await this.conversationService.archiveConversation(conversationId);
    this.safeDispatch(this.reduxActions.updateConversationMetadata({
      conversationId,
      metadata: { isArchived: true }
    }));
  }

  async deleteConversation(conversationId: string): Promise<void> {
    this.checkInitialized();
    await this.conversationService.deleteConversation(conversationId);
    this.safeDispatch(this.reduxActions.removeConversation(conversationId));
    
    // Clear message cache
    this.cacheService.clearMessageCache(conversationId);
  }

  async updateConversationSettings(
    conversationId: string,
    settings: Partial<ConversationSettings>
  ): Promise<void> {
    this.checkInitialized();
    return this.conversationService.updateConversationSettings(conversationId, settings);
  }

  async searchConversations(searchTerm: string, options?: any): Promise<ServerConversation[]> {
    this.checkInitialized();
    return this.conversationService.searchConversations(searchTerm, options);
  }

  async getTotalUnreadCount(options?: any): Promise<number> {
    this.checkInitialized();
    const conversations = this.cacheService.getCachedConversations();
    
    let totalUnread = 0;
    for (const conv of conversations) {
      if (!options?.includeMuted && conv.settings?.isMuted) continue;
      if (!options?.includeArchived && conv.metadata?.status === ConversationStatus.ARCHIVED) continue;
      totalUnread += conv.unreadCount || 0;
    }
    
    return totalUnread;
  }

  // ==========================================
  // MESSAGE METHODS (delegating to MessageService)
  // ==========================================

  async loadMessages(
    conversationId: string, 
    options: MessageLoadOptions = {}
  ): Promise<MessageLoadResult> {
    this.checkInitialized();
    
    const result = await this.messageService.getMessages(conversationId, options);
    
    // Set active conversation
    if (options.page === 1 || !options.page) {
      this.safeDispatch(this.reduxActions.setActiveConversation(conversationId));
      await this.saveLastActiveConversation(conversationId);
    }
    
    return result;
  }

  async sendTextMessage(
    conversationId: string,
    text: string,
    receiverId: string,
    replyTo?: string
  ): Promise<Message> {
    this.checkInitialized();
    
    // Check connection state
    const connectionState = this.realtimeService.getConnectionState();
    
    // If offline, queue the message
    if (connectionState === ConnectionState.DISCONNECTED || 
        connectionState === ConnectionState.ERROR) {
      
      const message = this.createOfflineMessage(conversationId, text, receiverId, replyTo);
      await this.offlineQueueService.queueMessage(message);
      return message;
    }
    
    // Send via message service
    return this.messageService.sendMessage(conversationId, text, receiverId, { replyTo });
  }

  
  async sendAttachment(
    conversationId: string,
    file: any,
    type: AttachmentType,
    receiverId: string
  ): Promise<void> {
    this.checkInitialized();
    
    // Upload file first
    const attachment = await this.fileService.uploadFile(file, type);
    
    // Send as message
    await this.messageService.sendAttachment(conversationId, file, type, receiverId);
  }

  async markMessagesAsRead(conversationId: string, messageIds?: string[]): Promise<void> {
    this.checkInitialized();
    await this.messageService.markAsRead(conversationId, messageIds);
    this.safeDispatch(this.reduxActions.markConversationAsRead(conversationId));
  }


  // Add to ChatService.ts after sendAttachment method (around line 430)

  /**
 * Helper: Determine message type from MIME type
 * @private
 */
private getMessageTypeFromMime(mimeType: string): MessageType {
  const mime = mimeType.toLowerCase();
  
  if (mime.startsWith('image/')) {
    return MessageType.IMAGE;
  }
  
  if (mime.startsWith('video/')) {
    return MessageType.VIDEO;
  }
  
  if (mime.startsWith('audio/')) {
    return MessageType.AUDIO;
  }
  
  // Default to FILE type
  return MessageType.FILE;
}


/**
 * Send a message with an already-uploaded file attachment
 * Use this when the file has been uploaded separately and you have the URL
 * 
 * @param conversationId - The conversation ID
 * @param fileUrl - The uploaded file URL (e.g., "/uploads/images/abc123.png")
 * @param fileName - Original filename
 * @param fileSize - File size in bytes
 * @param fileType - MIME type (e.g., "image/png")
 * @param receiverId - Recipient user ID
 * @param caption - Optional text caption
 * @param replyTo - Optional message ID to reply to
 * @param clientTempId - Optional client-side temporary ID for optimistic updates
 * @returns Promise<Message> - The sent message
 */
async sendFileMessage(
  conversationId: string,
  fileUrl: string,
  fileName: string,
  fileSize: number,
  fileType: string,
  receiverId: string,
  caption?: string,
  replyTo?: string,
  clientTempId?: string  // ✅ ADDED THIS PARAMETER
): Promise<Message> {
  this.checkInitialized();
  
  // Validate inputs
  if (!conversationId?.trim()) {
    throw new ValidationException('Conversation ID is required');
  }
  if (!fileUrl?.trim()) {
    throw new ValidationException('File URL is required');
  }
  if (!fileName?.trim()) {
    throw new ValidationException('File name is required');
  }
  if (!receiverId?.trim()) {
    throw new ValidationException('Receiver ID is required');
  }
  if (fileSize <= 0) {
    throw new ValidationException('File size must be positive');
  }
  
  // Check connection state
  const connectionState = this.realtimeService.getConnectionState();
  
  // ✅ Use provided clientTempId or generate new one
  const tempId = clientTempId || `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const messageId = uuidv4();
  
  // Create attachment object
  const attachment: Attachment = {
    id: uuidv4(),
    url: fileUrl,
    name: fileName,
    size: fileSize,
    type: this.getAttachmentTypeFromMime(fileType),
    mimeType: fileType
  };
  
  // Determine message type from MIME type
  const messageType = this.getMessageTypeFromMime(fileType);
  
  // Create message object
  const message: Message = {
    id: messageId,
    clientTempId: tempId,  // ✅ Use the tempId
    senderId: this.userId,
    receiverId,
    content: caption || `Sent ${fileName}`,
    timestamp: new Date().toISOString(),
    type: messageType,
    status: MessageStatus.SENDING,
    attachments: [attachment],
    replyTo: replyTo || undefined,
    conversationId,
    jobId: undefined
  };
  
  console.log('[ChatService] Sending file message:', {
    conversationId,
    fileName,
    fileSize,
    fileType: fileType,
    messageType,
    hasCaption: !!caption,
    clientTempId: tempId  // ✅ Log it
  });
  
  // If offline, queue the message
  if (connectionState === ConnectionState.DISCONNECTED || 
      connectionState === ConnectionState.ERROR) {
    console.log('[ChatService] Offline - queuing file message');
    message.status = MessageStatus.QUEUED;
    await this.offlineQueueService.queueMessage(message);
    
    // Cache for local display
    this.cacheService.cacheMessage(conversationId, message);
    
    return message;
  }
  
  // Cache immediately for optimistic UI
  this.cacheService.cacheMessage(conversationId, message);
  
  // Send via message service
  try {
    // ✅ Pass clientTempId through options
    const sentMessage = await this.messageService.sendMessage(
      conversationId,
      caption || '',
      receiverId,
      {
        replyTo,
        attachments: [attachment],
        clientTempId: tempId,  // ✅ CRITICAL: Pass it here
        metadata: {
          originalFileName: fileName,
          fileType: fileType
        }
      }
    );
    
    // Update cache with server response
    const finalMessage: Message = {
      ...message,
      ...sentMessage,
      status: MessageStatus.SENT,
      attachments: [attachment], // Preserve attachment info
      clientTempId: tempId  // ✅ Keep clientTempId for matching
    };
    
    this.cacheService.cacheMessage(conversationId, finalMessage);
    
    console.log('[ChatService] File message sent successfully:', sentMessage.id);
    
    return finalMessage;
    
  } catch (error) {
    console.error('[ChatService] Failed to send file message:', error);
    
    // Update status to failed
    message.status = MessageStatus.FAILED;
    this.cacheService.cacheMessage(conversationId, message);
    
    // Rethrow for caller to handle
    throw error;
  }
}

/**
 * Helper: Determine attachment type from MIME type
 * @private
 */
private getAttachmentTypeFromMime(mimeType: string): AttachmentType {
  const mime = mimeType.toLowerCase();
  
  if (mime.startsWith('image/')) {
    return AttachmentType.IMAGE;
  }
  
  if (mime.startsWith('video/')) {
    return AttachmentType.VIDEO;
  }
  
  if (mime.startsWith('audio/')) {
    return AttachmentType.AUDIO;
  }
  
  // Check for document types
  if (mime.includes('pdf') || 
      mime.includes('document') || 
      mime.includes('word') || 
      mime.includes('excel') ||
      mime.includes('sheet') ||
      mime.includes('text')) {
    return AttachmentType.DOCUMENT;
  }
  
  // Default to FILE
  return AttachmentType.FILE;
}


  async retryFailedMessage(
    conversationId: string,
    messageId: string,
    clientTempId?: string
  ): Promise<Message | null> {
    this.checkInitialized();
    return this.messageService.retryFailedMessage(conversationId, messageId, clientTempId);
  }

  async retryAllFailedMessages(conversationId: string): Promise<{
    attempted: number;
    successful: number;
    failed: number;
  }> {
    this.checkInitialized();
    
    const messages = this.cacheService.getCachedMessages(conversationId);
    const failedMessages = messages.filter(m => m.status === MessageStatus.FAILED);
    
    let attempted = 0;
    let successful = 0;
    let failed = 0;

    for (const message of failedMessages) {
      attempted++;
      try {
        await this.retryFailedMessage(conversationId, message.id, message.clientTempId);
        successful++;
      } catch (error) {
        failed++;
      }
    }

    return { attempted, successful, failed };
  }

  getLocalMessages(conversationId: string): Message[] {
    return this.cacheService.getCachedMessages(conversationId);
  }

  hasFailedMessages(conversationId: string): boolean {
    const messages = this.cacheService.getCachedMessages(conversationId);
    return messages.some(m => m.status === MessageStatus.FAILED);
  }

  // ==========================================
  // FILE METHODS (delegating to FileService)
  // ==========================================

  async uploadFile(file: any): Promise<UploadFileResponse> {
    this.checkInitialized();
    const attachment = await this.fileService.uploadFile(file, AttachmentType.FILE);
    return {
      id: attachment.id,
      url: attachment.url,
      name: attachment.name,
      size: attachment.size,
      type: attachment.type
    };
  }

  async uploadImage(image: any): Promise<UploadFileResponse> {
    this.checkInitialized();
    const attachment = await this.fileService.uploadImage(image);
    return {
      id: attachment.id,
      url: attachment.url,
      name: attachment.name,
      size: attachment.size,
      type: attachment.type
    };
  }

  // ==========================================
  // USER METHODS (delegating to UserService)
  // ==========================================

  async getUserDetails(userId: string): Promise<any | null> {
    this.checkInitialized();
    return this.userService.getUserDetails(userId);
  }

  async blockUser(userId: string): Promise<void> {
    this.checkInitialized();
    try {
      return await this.userService.blockUser(userId);
    } catch (error) {
      console.warn('Block user feature not available:', error);
      throw error;
    }
  }

  async isUserBlocked(userId: string): Promise<boolean> {
    this.checkInitialized();
    try {
      return await this.userService.isUserBlocked(userId);
    } catch (error) {
      console.warn('Blocked users check not available:', error);
      return false; // Default to not blocked if feature unavailable
    }
  }

  /**
   * Get list of blocked users (optional feature)
   */
  async getBlockedUsers(): Promise<string[]> {
    this.checkInitialized();
    try {
      return await this.userService.getBlockedUsers?.() || [];
    } catch (error) {
      console.warn('Get blocked users not available:', error);
      return [];
    }
  }

  // ==========================================
  // ONLINE USERS METHODS
  // ==========================================

  /**
   * Get all online users from server (async version)
   * Requests fresh data from server and returns it
   */
  async getAllOnlineUsersAsync(): Promise<OnlineUser[]> {
    this.checkInitialized();
    
    return new Promise((resolve) => {
      // Subscribe to next update
      const unsubscribe = this.realtimeService.onOnlineUsersUpdate((users) => {
        unsubscribe();
        resolve(users);
      });
      
      // Request from server
      this.realtimeService.getAllOnlineUsers();
      
      // Timeout after configured seconds
      setTimeout(() => {
        unsubscribe();
        resolve(this.realtimeService.getOnlineUsersSync());
      }, CHAT_CONFIG.ONLINE_USERS_TIMEOUT);
    });
  }

  /**
   * Get all online users from server (fire and forget)
   */
  getAllOnlineUsers(): void {
    if (!this.isInitialized) {
      console.warn('⚠️ Cannot get online users - service not initialized');
      return;
    }
    try {
      this.realtimeService.getAllOnlineUsers();
    } catch (error) {
      console.warn('⚠️ Failed to request online users:', error);
    }
  }

  /**
   * Get online users from local cache (synchronous)
   */
  getOnlineUsers(): OnlineUser[] {
    if (!this.isInitialized) {
      return [];
    }
    try {
      return this.realtimeService.getOnlineUsersSync();
    } catch (error) {
      console.warn('⚠️ Failed to get online users from cache:', error);
      return [];
    }
  }

  /**
   * Check if a specific user is online
   */
  isUserOnline(userId: string): boolean {
    this.checkInitialized();
    return this.realtimeService.isUserOnline(userId);
  }

  /**
   * Get count of online users
   */
  getOnlineCount(): number {
    this.checkInitialized();
    return this.realtimeService.getOnlineCount();
  }

  /**
   * Subscribe to online users changes
   * Returns unsubscribe function
   */
  onOnlineUsersChange(callback: (users: OnlineUser[]) => void): () => void {
    this.checkInitialized();
    return this.realtimeService.onOnlineUsersUpdate(callback);
  }

  /**
   * Get detailed online user info by ID
   */
  getOnlineUserDetails(userId: string): OnlineUser | null {
    this.checkInitialized();
    
    const users = this.getOnlineUsers();
    return users.find(u => u.id === userId) || null;
  }

  /**
   * Get detailed online user info by ID (async version with refresh)
   */
  async getOnlineUserDetailsAsync(userId: string): Promise<OnlineUser | null> {
    this.checkInitialized();
    
    // First check cache
    const cached = this.getOnlineUserDetails(userId);
    if (cached) {
      return cached;
    }
    
    // If not in cache, request fresh list
    await this.getAllOnlineUsersAsync();
    
    // Check again
    return this.getOnlineUserDetails(userId);
  }

  /**
   * Search online users by name
   */
  searchOnlineUsers(searchTerm: string): OnlineUser[] {
    this.checkInitialized();
    
    if (!searchTerm?.trim()) {
      return this.getOnlineUsers();
    }
    
    const term = searchTerm.toLowerCase();
    return this.getOnlineUsers().filter(user => 
      user.name.toLowerCase().includes(term) ||
      user.email?.toLowerCase().includes(term) ||
      user.role?.toLowerCase().includes(term)
    );
  }

  /**
   * Get online users grouped by role
   */
  getOnlineUsersByRole(): Record<string, OnlineUser[]> {
    this.checkInitialized();
    
    const users = this.getOnlineUsers();
    const grouped: Record<string, OnlineUser[]> = {};
    
    users.forEach(user => {
      const role = user.role || 'unknown';
      if (!grouped[role]) {
        grouped[role] = [];
      }
      grouped[role].push(user);
    });
    
    return grouped;
  }

  /**
   * Get online statistics
   */
  getOnlineStats(): {
    total: number;
    byRole: Record<string, number>;
    byStatus: Record<string, number>;
  } {
    this.checkInitialized();
    
    const users = this.getOnlineUsers();
    const stats = {
      total: users.length,
      byRole: {} as Record<string, number>,
      byStatus: {} as Record<string, number>
    };
    
    users.forEach(user => {
      // Count by role
      const role = user.role || 'unknown';
      stats.byRole[role] = (stats.byRole[role] || 0) + 1;
      
      // Count by status
      const status = user.status || 'available';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
    });
    
    return stats;
  }

  // ==========================================
  // REALTIME METHODS
  // ==========================================

  sendTypingIndicator(conversationId: string, receiverId: string, isTyping: boolean): void {
    if (!this.isInitialized) return;
    this.realtimeService.sendTypingIndicator(conversationId, receiverId, isTyping);
  }

  isConnected(): boolean {
    return this.realtimeService?.isConnected() || false;
  }

  getConnectionState(): ConnectionState {
    return this.realtimeService?.getConnectionState() || ConnectionState.DISCONNECTED;
  }

  // ==========================================
  // OFFLINE QUEUE METHODS
  // ==========================================

  getOfflineQueueStatus() {
    return this.offlineQueueService.getQueueStatus();
  }

  async processOfflineQueue(): Promise<void> {
    if (!this.isInitialized) return;
    return this.offlineQueueService.processQueue();
  }

  // ==========================================
  // EVENT LISTENERS (maintaining backward compatibility)
  // ==========================================

  onNewMessage(callback: (message: Message) => void): () => void {
    return this.realtimeService.onMessage(callback);
  }

  onMessageSent(callback: (data: any) => void): () => void {
    return this.realtimeService.onMessageSent(callback);
  }

  onMessageSendError(callback: (data: any) => void): () => void {
    return this.realtimeService.onMessageError(callback);
  }

  onTyping(callback: (userId: string, isTyping: boolean) => void): () => void {
    return this.realtimeService.onTyping((data) => {
      callback(data.userId, data.isTyping);
    });
  }

  onConnectionStateChange(callback: (state: ConnectionState, details?: any) => void): () => void {
    return this.realtimeService.onConnectionChange((state) => {
      callback(state, { timestamp: new Date().toISOString() });
    });
  }

  onMessageRead(callback: (messageId: string, status: MessageStatus, conversationId: string) => void): () => void {
    // This would need to be implemented in the realtime service
    return () => {};
  }

  onUserStatusChange(callback: (userId: string, isOnline: boolean, lastSeen?: string) => void): () => void {
    return this.realtimeService.onUserStatus((data) => {
      callback(data.userId, data.isOnline, data.lastSeen);
    });
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private checkInitialized(): void {
    if (!this.isInitialized) {
      throw new ValidationException('Chat service not initialized');
    }
  }

  setReduxStore(store: any): void {
    this.reduxStore = store;
  }

  private safeDispatch(action: any): void {
    try {
      if (this.reduxStore?.dispatch) {
        this.reduxStore.dispatch(action);
      } else if (process.env.NODE_ENV === 'development') {
        console.log('📤 Redux Action:', action.type, action.payload);
      }
    } catch (error) {
      console.warn('Redux dispatch failed:', error);
    }
  }

  private createOfflineMessage(
    conversationId: string,
    content: string,
    receiverId: string,
    replyTo?: string
  ): Message {
    const now = Date.now();
    const clientTempId = `temp-${now}-${Math.random().toString(36).substr(2, 9)}`;
    const messageId = uuidv4();
    
    return {
      id: messageId,
      clientTempId,
      senderId: this.userId,
      receiverId,
      content,
      timestamp: new Date().toISOString(),
      type: MessageType.TEXT,
      status: MessageStatus.QUEUED,
      replyTo,
      conversationId,
      jobId: undefined
    };
  }

  private getOtherUserName(conversation: ServerConversation | null): string | undefined {
    if (!conversation) return undefined;
    const otherUser = conversation.participants.find(p => p.userId !== this.userId);
    return otherUser?.name;
  }

  private async syncConversationsToRedux(conversations: ServerConversation[]): Promise<void> {
    const conversationMetadata: Record<string, any> = {};
    
    conversations.forEach(conv => {
      conversationMetadata[conv.id] = {
        unreadCount: conv.unreadCount || 0,
        lastActivity: conv.updatedAt || conv.createdAt,
        isPinned: conv.settings?.isPinned || false,
        isMuted: conv.settings?.isMuted || false,
        isArchived: conv.metadata?.status === ConversationStatus.ARCHIVED,
        lastMessagePreview: conv.lastMessage?.content?.substring(0, 50),
        otherUserName: this.getOtherUserName(conv),
        jobTitle: conv.metadata?.jobTitle,
      };
    });
    
    this.safeDispatch(this.reduxActions.syncConversations(conversationMetadata));
  }

  private async saveSession(): Promise<void> {
    try {
      const sessionData = {
        userId: this.userId,
        userRole: this.userRole,
        token: this.token,
        userDetails: this.userDetails,
        timestamp: Date.now()
      };
      
      await this.storageService.set('chat_session', sessionData);
      console.log('💾 Chat session saved');
    } catch (error) {
      console.error('Failed to save chat session:', error);
    }
  }

  private async saveLastActiveConversation(conversationId: string): Promise<void> {
    try {
      await this.storageService.set('last_active_conversation', {
        conversationId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Failed to save last active conversation:', error);
    }
  }

  async recoverSession(reduxStore?: any): Promise<boolean> {
    try {
      console.log('🔄 Attempting to recover chat session...');
      
      if (reduxStore) {
        this.setReduxStore(reduxStore);
      }
      
      const sessionData = await this.storageService.get<any>('chat_session');
      
      if (!sessionData || !sessionData.userId || !sessionData.token) {
        console.log('ℹ️ No valid session found');
        return false;
      }

      // Check if session is not too old
      const sessionAge = Date.now() - sessionData.timestamp;
      if (sessionAge > CHAT_CONFIG.MAX_SESSION_AGE) {
        console.log('⚠️ Session expired');
        await this.storageService.remove('chat_session');
        return false;
      }

      // Initialize with recovered session
      await this.initialize(
        sessionData.userId,
        sessionData.userRole || 'customer',
        sessionData.token,
        reduxStore,
        sessionData.userDetails
      );

      console.log('✓ Chat session recovered successfully');
      return true;

    } catch (error) {
      console.error('Failed to recover session:', error);
      return false;
    }
  }

  private startMemoryCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      // Trim cache if needed
      this.cacheService.trimCache(1000);
      
      // Clean up expired messages from offline queue
      this.offlineQueueService?.cleanupExpiredMessages?.();
      
      console.log('🧹 Memory cleanup completed');
    }, CHAT_CONFIG.CLEANUP_INTERVAL) as any;
  }

  private async cleanup(): Promise<void> {
    // Clean up event listeners
    this.eventCleanupFunctions.forEach(cleanup => cleanup());
    this.eventCleanupFunctions = [];

    // Clear caches
    this.cacheService?.clearAllCache();

    console.log('✓ ChatService cleanup completed');
  }

  async disconnect(): Promise<void> {
    try {
      // Stop cleanup interval
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }

      // Reset Redux state
      this.safeDispatch(this.reduxActions.resetMessagingState());
      this.safeDispatch(this.reduxActions.setActiveConversation(null));

      // Cleanup
      await this.cleanup();

      // Disconnect realtime
      this.realtimeService?.disconnect();

      // Clear instances (factory will create new ones next time)
      ServiceFactory.clearInstances();

      // Reset state
      this.isInitialized = false;
      this.userDetails = null;
      this.userId = '';
      this.userRole = '';
      this.token = '';

      console.log('✓ Chat service disconnected completely');
    } catch (error) {
      console.error('Error during disconnect:', error);
    }
  }

  // Getters for backward compatibility
  get currentUserId(): string { return this.userId; }
  get currentUserRole(): string { return this.userRole; }
}

// Export singleton instance
export const chatService = new ChatService();