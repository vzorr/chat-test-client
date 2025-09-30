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
  UploadFileResponse
} from '../types/chat';

// Import store types
import { IChatStore, IChatActions, NoOpStore } from '../types/store';

// =========================================================================
// FIX: Replace dynamic 'require' for Redux actions with static 'import'
// =========================================================================
// Since Redux is a project dependency, we can safely use a static import
// and let the bundler (Vite) handle the resolution.
import * as messagingReducer from '../stores/reducer/messagingReducer';

// Platform detection
const isNodeEnvironment = typeof window === 'undefined' && typeof global !== 'undefined';

// FIX: Change `require('react-native')` to a safe implementation
// We'll use a local variable and rely on the Vite alias for `react-native`.
// If the environment is not Node, we will assign the shim's Platform object.
let Platform: { OS: 'node' | 'web' | 'ios' | 'android', Version: string | undefined } = {
  OS: isNodeEnvironment ? 'node' : 'web',
  Version: isNodeEnvironment ? process.version : 'v-shim'
};

// This line is prone to error if the bundler does not resolve the conditional require correctly.
// Instead of the original line 44:
// const Platform = isNodeEnvironment 
//   ? { OS: 'node', Version: process.version } 
//   : require('react-native').Platform; 
// We are skipping the runtime require and relying on the static assignment above.

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
// =========================================================================
// END FIX
// =========================================================================


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

    // Message sent confirmations
    const sentCleanup = this.realtimeService.onMessageSent((data) => {
      console.log('✅ Message sent:', data.messageId);
      
      // Remove from offline queue if exists
      if (data.clientTempId) {
        this.offlineQueueService.removeFromQueue(data.clientTempId);
      }
    });
    this.eventCleanupFunctions.push(sentCleanup);

    // Typing indicators
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
    return this.userService.blockUser(userId);
  }

  async isUserBlocked(userId: string): Promise<boolean> {
    this.checkInitialized();
    return this.userService.isUserBlocked(userId);
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