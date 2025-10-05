// types/chat.ts - Complete optimized chat types (Single Source of Truth)

// ========================================
// ENUMS - All possible values defined once
// ========================================

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
  FILE = 'file',
  ATTACHMENT = 'attachment',
  SYSTEM = 'system', //  ADDED: For system messages,
   VIDEO = 'video',
}



export enum MessageStatus {
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
  EXPIRED = 'expired',
  QUEUED = "queued", //  ADDED: For expired temporary messages
}

export enum AttachmentType {
  IMAGE = 'image',
  AUDIO = 'audio',
  FILE = 'file',
  VIDEO = 'video', //  ADDED: Video support
  DOCUMENT = 'document', //  ADDED: Document type
}

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

export enum UserRole {
  CUSTOMER = 'customer',
  USTA = 'usta',
  ADMIN = 'admin',
  SYSTEM = 'system', //  ADDED: System role
}

export enum ConversationStatus {
  ACTIVE = 'active',
  CLOSED = 'closed',
  ARCHIVED = 'archived',
  PENDING = 'pending', //  ADDED: For pending conversations
}

export enum ConversationType {
  JOB_CHAT = 'job_chat',
  DIRECT_MESSAGE = 'direct_message',
  GROUP_CHAT = 'group_chat', //  ADDED: Group chat support
}

// ========================================
// CORE INTERFACES - Main data structures
// ========================================

export interface Attachment {
  id: string;
  type: AttachmentType;
  url: string;
  name: string;
  size: number;
  thumbnailUrl?: string;
  mimeType?: string;
  duration?: number; // For audio/video files
  width?: number; //  ADDED: For images/videos
  height?: number; //  ADDED: For images/videos
  uploadedAt?: string; //  ADDED: Upload timestamp
  metadata?: Record<string, any>; //  ADDED: Additional metadata
}

export interface Message {
  id: string;
  clientTempId?: string; //  CONFIRMED: This property exists and is optional
  senderId: string;
  receiverId?: string; //  ENHANCED: Made optional for group chats
  content: string;
  timestamp: string;
  type: MessageType;
  status: MessageStatus;
  replyTo?: string;
  attachments?: Attachment[];
  conversationId: string;
  jobId?: string;
  isEdited?: boolean;
  editedAt?: string;
  //  NEW: Additional properties for enhanced functionality
  mentions?: string[]; // User IDs mentioned in the message
  reactions?: MessageReaction[]; // Message reactions
  metadata?: Record<string, any>; // Additional message metadata
  expiresAt?: string; // For temporary messages
  deliveredAt?: string; // Delivery timestamp
  readAt?: string; // Read timestamp
}

//  NEW: Message reactions interface
export interface MessageReaction {
  emoji: string;
  userId: string;
  timestamp: string;
}

export interface ConversationParticipant {
  userId: string;
  role: UserRole;
  joinedAt: string;
  isActive: boolean;
  name: string;
  avatar?: string;
  isOnline: boolean;
  lastSeen?: string;
  //  NEW: Additional participant properties
  permissions?: ConversationPermissions;
  nickname?: string; // Custom name in conversation
  leftAt?: string; // When user left the conversation
}

// Queued message for offline support
export interface QueuedMessage {
  message: Message;
  retryCount: number;
  maxRetries: number;
  addedAt: number;
}

//  NEW: Conversation permissions
export interface ConversationPermissions {
  canSendMessages: boolean;
  canSendAttachments: boolean;
  canDeleteMessages: boolean;
  canEditMessages: boolean;
  canMentionAll: boolean;
  canInviteUsers: boolean;
  canManageConversation: boolean;
}

export interface ConversationMetadata {
  jobId?: string;
  jobTitle?: string;
  status: ConversationStatus;
  createdBy: string;
  closedAt?: string;
  //  NEW: Enhanced metadata
  description?: string;
  category?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  tags?: string[];
  customFields?: Record<string, any>;
}

export interface ConversationSettings {
  isMuted: boolean;
  isPinned: boolean;
  notificationEnabled: boolean;
  //  NEW: Additional settings
  muteUntil?: string; // Temporary mute
  autoDeleteMessages?: boolean;
  messageRetention?: number; // Days to keep messages
  allowExternalSharing?: boolean;
  requireApprovalForNewMembers?: boolean;
}

export interface ServerConversation {
  id: string;
  type: ConversationType;
  participants: ConversationParticipant[];
  metadata: ConversationMetadata;
  settings: ConversationSettings;
  lastMessage?: Message;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
  //  NEW: Enhanced conversation properties
  totalMessageCount?: number;
  lastActivity?: string;
  encryptionEnabled?: boolean;
  adminIds?: string[]; // Conversation administrators
}

// ========================================
// USER & REGISTRATION INTERFACES
// ========================================

export interface UserRegistrationData {
  id: string;
  externalId: string;
  name: string;
  phone: string;
  email?: string;
  avatar?: string;
  role?: UserRole;
  //  NEW: Additional registration fields
  department?: string;
  title?: string;
  timezone?: string;
  preferredLanguage?: string;
  notificationPreferences?: NotificationPreferences;
}

//  NEW: Notification preferences
export interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  mentions: boolean;
  directMessages: boolean;
  groupMessages: boolean;
  jobUpdates: boolean;
  quietHours?: {
    enabled: boolean;
    startTime: string; // HH:MM format
    endTime: string; // HH:MM format
    timezone: string;
  };
}

export interface ChatUser {
  id: string;
  name: string;
  avatar?: string;
  isOnline: boolean;
  lastSeen?: string;
  role: UserRole;
  //  NEW: Additional user properties
  status?: 'available' | 'busy' | 'away' | 'do_not_disturb';
  statusMessage?: string;
  timezone?: string;
  isVerified?: boolean;
}

// ========================================
// UI COMPATIBILITY INTERFACES
// ========================================

// Legacy interface for backward compatibility with existing UI components
export interface ChatConversation {
  id: string;
  jobId?: string;
  jobTitle?: string;
  otherUser: ChatUser;
  lastMessage?: Message;
  unreadCount: number;
  isBlocked: boolean;
  updatedAt: string;
  participants: ChatUser[];
  createdAt: string;
  isPinned?: boolean;
  isMuted?: boolean;
  type?: ConversationType;
  status?: ConversationStatus;
  //  NEW: Additional UI properties
  hasUnreadMentions?: boolean;
  lastReadMessageId?: string;
  draftMessage?: string; // Unsent draft message
}

// ========================================
// PAGINATION & LOADING INTERFACES
// ========================================

export interface MessageLoadResult {
  messages: Message[];
  hasMore: boolean;
  totalCount: number;
  oldestMessageId?: string;
  newestMessageId?: string;
  //  NEW: Enhanced pagination info
  nextCursor?: string;
  previousCursor?: string;
  loadedRange?: {
    start: string;
    end: string;
  };
}

export interface MessageLoadOptions {
  page?: number;
  limit?: number;
  before?: string;
  after?: string;
  forceRefresh?: boolean;
  //  NEW: Additional load options
  cursor?: string;
  direction?: 'before' | 'after';
  includeReactions?: boolean;
  includeMentions?: boolean;
  messageTypes?: MessageType[];
}

// ========================================
// API RESPONSE INTERFACES
// ========================================

export interface ChatApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  //  NEW: Additional response metadata
  timestamp?: string;
  requestId?: string;
  warnings?: string[];
}

export interface ConversationListResponse {
  conversations: ServerConversation[];
  hasMore: boolean;
  total: number;
  page?: number;
  limit?: number;
  //  NEW: Enhanced list response
  nextCursor?: string;
  filters?: ConversationFilters;
  sortOptions?: SortOptions;
}

export interface MessageListResponse {
  messages: Message[];
  hasMore: boolean;
  total: number;
  page?: number;
  limit?: number;
  //  NEW: Enhanced message list response
  conversationInfo?: {
    id: string;
    participantCount: number;
    messageCount: number;
    oldestMessageDate?: string;
    newestMessageDate?: string;
  };
}

export interface UserRegistrationResponse {
  success: boolean;
  user?: any;
  error?: {
    code: string;
    message: string;
  };
  //  NEW: Enhanced registration response
  requiresVerification?: boolean;
  verificationMethod?: 'email' | 'sms' | 'both';
  sessionToken?: string;
}

export interface ConversationCreationResponse {
  success: boolean;
  existing: boolean;
  conversation: ServerConversation;
  //  NEW: Additional creation info
  participantsAdded?: string[];
  participantsFailed?: string[];
  invitesSent?: string[];
}

export interface UploadFileResponse {
  url: string;
  name: string;
  size: number;
  type: string;
  //  NEW: Enhanced upload response
  id: string;
  thumbnailUrl?: string;
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    checksum?: string;
  };
  expiresAt?: string;
}

export interface InitializeChatResponse {
  conversationId: string;
  canInitiate: boolean;
  message?: string;
  //  NEW: Enhanced initialization
  existingConversation?: ServerConversation;
  permissions?: ConversationPermissions;
  restrictions?: string[];
}

// ========================================
// SOCKET EVENT INTERFACES
// ========================================

export interface SocketMessage {
  messageId: string;
  clientTempId?: string;
  jobId?: string;
  conversationId: string;
  userId: string;
  receiverId?: string; //  ENHANCED: Made optional for group messages
  textMsg: string;
  messageType: string;
  timestamp: string;
  attachments?: Attachment[];
  replyToMessageId?: string;
  //  NEW: Additional socket message properties
  mentions?: string[];
  reactions?: MessageReaction[];
  isEdited?: boolean;
  editedAt?: string;
}

export interface TypingEvent {
  conversationId: string;
  userId: string;
  receiverId?: string;
  isTyping: boolean;
  //  NEW: Enhanced typing event
  timestamp: string;
  typingType?: 'text' | 'audio' | 'file'; // What type of content is being prepared
}

export interface UserStatusEvent {
  userId: string;
  isOnline: boolean;
  lastSeen?: string;
  //  NEW: Enhanced status event
  status?: 'available' | 'busy' | 'away' | 'do_not_disturb';
  statusMessage?: string;
  timestamp: string;
}

export interface ConnectionEvent {
  state: ConnectionState;
  connected: boolean;
  timestamp: string;
  //  NEW: Additional connection info
  reason?: string;
  reconnectAttempt?: number;
  lastSuccessfulConnection?: string;
}

// ========================================
// SESSION & STORAGE INTERFACES
// ========================================

export interface ChatSession {
  userId: string;
  userRole: string;
  token: string;
  userDetails?: UserRegistrationData;
  timestamp: number;
  //  NEW: Enhanced session data
  expiresAt: number;
  refreshToken?: string;
  deviceId?: string;
  permissions?: string[];
}

export interface LastActiveConversation {
  conversationId: string;
  timestamp: number;
  //  NEW: Additional tracking
  lastMessageId?: string;
  scrollPosition?: number;
  draftMessage?: string;
}

// ========================================
// UTILITY FUNCTIONS - Message handling
// ========================================

//  ENHANCED: Add utility functions for message handling
export const createTempMessageId = (): string => {
  return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const isTemporaryMessage = (message: Message): boolean => {
  return !!(message.clientTempId && (!message.id || message.id.startsWith('temp-')));
};

export const getMessageKey = (message: Message): string => {
  return message.clientTempId || message.id;
};

//  ENHANCED: Message validation utility with better validation
export const validateMessage = (message: Partial<Message>): boolean => {
  const hasIdentifier = !!(message.id || message.clientTempId);
  const hasRequiredFields = !!(
    message.senderId &&
    message.content &&
    message.conversationId &&
    message.type &&
    message.timestamp
  );
  
  // Validate content based on message type
  if (message.type === MessageType.TEXT && !message.content?.trim()) {
    return false;
  }
  
  if ([MessageType.IMAGE, MessageType.AUDIO, MessageType.FILE, MessageType.VIDEO].includes(message.type as MessageType)) {
    if (!message.attachments?.length) {
      return false;
    }
  }
  
  return hasIdentifier && hasRequiredFields;
};

//  ENHANCED: Helper to update message status with better type safety
export const updateMessageStatus = (
  messages: Message[], 
  identifier: string, 
  newStatus: MessageStatus,
  useClientTempId: boolean = false
): Message[] => {
  return messages.map(msg => {
    const matches = useClientTempId 
      ? msg.clientTempId === identifier
      : msg.id === identifier;
    
    if (matches) {
      const updatedMessage = { ...msg, status: newStatus };
      
      // Add timestamps for status changes
      if (newStatus === MessageStatus.DELIVERED && !msg.deliveredAt) {
        updatedMessage.deliveredAt = new Date().toISOString();
      } else if (newStatus === MessageStatus.READ && !msg.readAt) {
        updatedMessage.readAt = new Date().toISOString();
      }
      
      return updatedMessage;
    }
    
    return msg;
  });
};

//  NEW: Additional utility functions
export const findMessageByClientTempId = (
  messages: Message[], 
  clientTempId: string
): Message | undefined => {
  return messages.find(msg => msg.clientTempId === clientTempId);
};

export const replaceTemporaryMessage = (
  messages: Message[], 
  clientTempId: string, 
  serverMessage: Message
): Message[] => {
  return messages.map(msg => 
    msg.clientTempId === clientTempId ? { ...serverMessage, clientTempId } : msg
  );
};

export const sortMessagesByTimestamp = (messages: Message[]): Message[] => {
  return [...messages].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
};

export const groupMessagesByDate = (messages: Message[]): Record<string, Message[]> => {
  return messages.reduce((groups, message) => {
    const date = new Date(message.timestamp).toDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {} as Record<string, Message[]>);
};

export const getUnreadMessageCount = (
  messages: Message[], 
  lastReadMessageId?: string
): number => {
  if (!lastReadMessageId) return messages.length;
  
  const lastReadIndex = messages.findIndex(msg => msg.id === lastReadMessageId);
  return lastReadIndex === -1 ? messages.length : messages.length - lastReadIndex - 1;
};

//  NEW: Conversation utilities
export const getOtherParticipants = (
  conversation: ServerConversation, 
  currentUserId: string
): ConversationParticipant[] => {
  return conversation.participants.filter(p => p.userId !== currentUserId && p.isActive);
};

export const isGroupConversation = (conversation: ServerConversation): boolean => {
  return conversation.type === ConversationType.GROUP_CHAT || 
         conversation.participants.filter(p => p.isActive).length > 2;
};

export const canUserPerformAction = (
  conversation: ServerConversation,
  userId: string,
  action: keyof ConversationPermissions
): boolean => {
  const participant = conversation.participants.find(p => p.userId === userId);
  return participant?.permissions?.[action] ?? false;
};

// ========================================
// HOOK RETURN TYPE INTERFACES (keeping existing)
// ========================================

export interface UseChatProps {
  jobId: string;
  receiverId: string;
  conversationId?: string;
  jobTitle?: string;
}

export interface UseChatReturn {
  conversationId: string;
  messages: Message[];
  loading: boolean;
  connected: boolean;
  connectionState: ConnectionState;
  sending: boolean;
  error: string | null;
  typing: { [userId: string]: boolean };
  hasMore: boolean;
  totalMessageCount: number;
  sendMessage: (text: string, replyTo?: string) => Promise<void>;
  sendAttachment: (file: any, type: AttachmentType) => Promise<void>;
  sendTypingStatus: (isTyping: boolean) => void;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  markAsRead: () => Promise<void>;
  retryMessage: (message: Message) => Promise<void>;
  clearError: () => void;
  reconnect: () => Promise<void>;
  //  NEW: Additional hook methods
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  addReaction: (messageId: string, emoji: string) => Promise<void>;
  removeReaction: (messageId: string, emoji: string) => Promise<void>;
  saveDraft: (content: string) => void;
  loadDraft: () => string | null;
}

export interface UseConversationsReturn {
  // Core data
  conversations: ChatConversation[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  hasMore: boolean;
  searchTerm: string;
  totalUnread: number;
  unreadConversations: ChatConversation[];

  // Basic actions
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  search: (term: string) => Promise<void>;
  markConversationAsRead: (conversationId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  pinConversation: (conversationId: string, isPinned: boolean) => Promise<void>;
  muteConversation: (conversationId: string, isMuted: boolean) => Promise<void>;

  // Enhanced features (new from useChatList)
  updateFilters: (filters: Partial<ConversationFilters>) => void;
  updateSort: (sort: Partial<SortOptions>) => void;
  clearSearch: () => void;
  archiveConversation: (conversationId: string, isArchived: boolean) => Promise<void>;
  
  // State checks
  isPinned: (conversationId: string) => boolean;
  isArchived: (conversationId: string) => boolean;
}

export interface UseChatListReturn {
  chatRooms: ServerConversation[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  searchQuery: string;
  totalUnreadCount: number;
  hasUnreadConversations: boolean;
  refresh: () => void;
  retry: () => void;
  searchConversations: (query: string) => void;
  clearSearch: () => void;
  togglePinConversation: (conversationId: string) => Promise<void>;
  toggleArchiveConversation: (conversationId: string) => Promise<void>;
  markConversationAsRead: (conversationId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  isPinned: (conversationId: string) => boolean;
  isArchived: (conversationId: string) => boolean;
}

export interface UseChatHelpersReturn {
  // File and image handling
  handleFileAttachment: () => Promise<FileUploadResult | null>;
  handleImageUpload: (source: 'camera' | 'gallery') => Promise<ImageUploadResult | null>;
  showImagePickerOptions: () => Promise<ImageUploadResult | null>;
  uploadingFile: boolean;
  uploadingImage: boolean;
  
  // Navigation helpers
  navigateToProfile: (userId: string) => void;
  navigateToJob: (jobId: string) => void;
  handleLinkPress: (url: string) => Promise<void>;
  
  // Time formatting
  formatMessageTime: (timestamp: string | Date) => string;
  formatDetailedTime: (timestamp: string | Date) => string;
  formatChatDate: (timestamp: string | Date) => string;
  isRecentMessage: (timestamp: string | Date) => boolean;
  
  // Audio recording
  startAudioRecording: () => Promise<boolean>;
  stopAudioRecording: () => Promise<string | null>;
  cancelAudioRecording: () => Promise<void>;
  recordingAudio: boolean;
  
  // Message utilities
  validateMessageContent: (content: string) => boolean;
  copyToClipboard: (text: string) => Promise<void>;
  shareMessage: (message: string) => Promise<void>;
  formatFileSize: (bytes: number) => string;
}

// ========================================
// SERVICE INTERFACE (Contract for ChatService)
// ========================================

export interface ChatServiceInterface {
  // Properties
  readonly currentUserId: string;
  readonly currentUserRole: string;

  // Initialization
  initialize(userId: string, userRole: string, token: string, userDetails?: UserRegistrationData): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getConnectionState(): ConnectionState;
  
  getUserDetails(userId: string): Promise<any | null>;

  // Conversation Management
  createConversation(params: {
    participantIds: string[];
    type: ConversationType;
    jobId?: string;
    jobTitle?: string;
    status?: ConversationStatus;
  }): Promise<ConversationCreationResponse>;
  
  getConversationById(conversationId: string): Promise<ServerConversation>;
  findJobConversation(jobId: string, otherUserId: string): Promise<ServerConversation | null>;
  findOrCreateJobConversation(jobId: string, otherUserId: string): Promise<ServerConversation>;
  
  getMyConversations(params?: any): Promise<{
    conversations: ServerConversation[];
    hasMore: boolean;
    total: number;
  }>;
  
  // Conversation Actions
  pinConversation(conversationId: string): Promise<void>;
  unpinConversation(conversationId: string): Promise<void>;
  archiveConversation(conversationId: string): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
  markConversationAsRead(conversationId: string): Promise<void>;

  // Message Management
  loadMessages(conversationId: string, options?: MessageLoadOptions): Promise<MessageLoadResult>;
  sendTextMessage(conversationId: string, text: string, receiverId: string, replyTo?: string): Promise<Message>;
  sendAttachment(conversationId: string, file: any, type: AttachmentType, receiverId: string): Promise<void>;
  markMessagesAsRead(conversationId: string, messageIds?: string[]): Promise<void>;
  getLocalMessages(conversationId: string): Message[];

  // File Upload
  uploadFile(file: any): Promise<UploadFileResponse>;
  uploadImage(image: any): Promise<UploadFileResponse>;

  // User Blocking
  blockUser(userId: string): Promise<void>;
  isUserBlocked(userId: string): Promise<boolean>;

  // Utility Methods
  sendTypingIndicator(conversationId: string, receiverId: string, isTyping: boolean): void;
  
  // Event Listeners
  onNewMessage(callback: (message: Message) => void): () => void;
  onMessageSent(callback: (messageId: string, conversationId: string) => void): () => void;
  onTyping(callback: (userId: string, isTyping: boolean) => void): () => void;
  onConnectionChange(callback: (connected: boolean) => void): () => void;
  onError(callback: (error: any) => void): () => void;
}

// ========================================
// COMPONENT PROPS INTERFACES
// ========================================

export interface ChatInboxProps {
  jobId: string;
  jobTitle: string;
  userName: string;
  isOnline: boolean;
  isBlocked: boolean;
  messages: Message[];
  sending: boolean;
  connected: boolean;
  connectionState?: ConnectionState;
  typing: { [userId: string]: boolean };
  conversationId?: string;
  currentUserId?: string;
  hasMore?: boolean;
  loading?: boolean;
  error?: string | null;
  onSendMessage: (content: string, replyTo?: string) => void;
  onSendAttachment: (file: any, type: AttachmentType) => void;
  onLoadMore: () => void;
  onRefresh?: () => void;
  onTyping: (isTyping: boolean) => void;
  onRetryMessage?: (message: Message) => void;
  onClearError?: () => void;
  navigation: any;
}

export interface ChatListProps {
  conversations: ChatConversation[];
  loading: boolean;
  refreshing: boolean;
  totalUnread: number;
  searchText: string;
  error?: string | null;
  onConversationPress: (conversation: ChatConversation) => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  onSearch: (text: string) => void;
  onPinConversation?: (conversationId: string) => void;
  onArchiveConversation?: (conversationId: string) => void;
  onDeleteConversation?: (conversationId: string) => void;
  onMarkAsRead?: (conversationId: string) => void;
  navigation: any;
}

export interface MessageItemProps {
  message: Message;
  onReply: (message: Message) => void;
  onProfilePress: () => void;
  onRetry?: (message: Message) => void;
  onCopy?: (text: string) => void;
  onShare?: (message: Message) => void;
  currentUserId?: string;
  isConsecutive?: boolean;
  showTimestamp?: boolean;
}

// ========================================
// NAVIGATION & ROUTING INTERFACES
// ========================================

export interface ChatData {
  otherUserId: string;
  jobId: string;
  jobTitle: string;
  userName: string;
  isOnline: boolean;
  isBlocked: boolean;
  conversationId?: string;
}

export interface ChatNavigationParams {
  ChatInbox: ChatData;
  ChatList: undefined;
  Profile: { userId: string };
  JobDetails: { jobId: string };
}

// ========================================
// FILE & MEDIA INTERFACES
// ========================================

export interface FilePickerResult {
  uri: string;
  type: string;
  name: string;
  size: number;
}

export interface FileUploadResult {
  uri: string;
  type: string;
  name: string;
  size: number;
}

export interface ImageUploadResult extends FileUploadResult {
  width?: number;
  height?: number;
}

export interface AudioRecordingResult {
  uri: string;
  duration: number;
  size: number;
  name: string;
}

// ========================================
// FILTERING & SORTING INTERFACES
// ========================================

export interface ConversationFilters {
  jobStatus?: ConversationStatus;
  hasUnread?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  isPinned?: boolean;
  isArchived?: boolean;
  //  NEW: Additional filters
  conversationType?: ConversationType;
  participantCount?: {
    min?: number;
    max?: number;
  };
  hasAttachments?: boolean;
  messageTypes?: MessageType[];
}

export interface SortOptions {
  by: 'lastMessage' | 'jobTitle' | 'userName' | 'unreadCount' | 'createdAt' | 'messageCount';
  direction: 'asc' | 'desc';
}

// ========================================
// CONFIGURATION INTERFACE
// ========================================

export interface ChatConfig {
  MESSAGE_TIMEOUT: number;
  ATTACHMENT_TIMEOUT: number;
  MAX_SESSION_AGE: number;
  MAX_FILE_SIZE: number;
  MAX_IMAGE_SIZE: number;
  MAX_CACHED_MESSAGES: number;
  CLEANUP_INTERVAL: number;
  DEFAULT_PAGE_SIZE: number;
  DEFAULT_CONVERSATION_LIMIT: number;
  //  NEW: Additional configuration
  MAX_MESSAGE_LENGTH: number;
  MAX_ATTACHMENT_COUNT: number;
  SUPPORTED_FILE_TYPES: string[];
  SUPPORTED_IMAGE_TYPES: string[];
  TYPING_INDICATOR_TIMEOUT: number;
  MESSAGE_RETRY_ATTEMPTS: number;
  CONNECTION_RETRY_DELAY: number;
}

// ========================================
// NOTIFICATION INTERFACE
// ========================================

export interface ChatNotification {
  conversationId: string;
  messageId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
  type: 'message' | 'typing' | 'status' | 'mention' | 'reaction';
  jobId?: string;
  jobTitle?: string;
  //  NEW: Enhanced notification properties
  priority: 'low' | 'normal' | 'high';
  category: string;
  actionData?: Record<string, any>;
  expiresAt?: string;
}

// ========================================
// ERROR HANDLING - Exception Classes
// ========================================

export interface ChatError {
  code: string;
  message: string;
  details?: any;
}

export class ChatException extends Error implements ChatError {
  public readonly code: string;
  public readonly details?: any;

  constructor(code: string, message: string, details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack
    };
  }
}

// Specific Exception Classes
export class ValidationException extends ChatException {
  constructor(message: string, details?: any) {
    super('VALIDATION_ERROR', message, details);
  }
}

export class NetworkException extends ChatException {
  constructor(message: string, details?: any) {
    super('NETWORK_ERROR', message, details);
  }
}

export class AuthException extends ChatException {
  constructor(message: string, details?: any) {
    super('AUTH_ERROR', message, details);
  }
}

export class ConnectionException extends ChatException {
  constructor(message: string, details?: any) {
    super('CONNECTION_ERROR', message, details);
  }
}

export class FileUploadException extends ChatException {
  constructor(message: string, details?: any) {
    super('FILE_UPLOAD_ERROR', message, details);
  }
}

export class ConversationException extends ChatException {
  constructor(message: string, details?: any) {
    super('CONVERSATION_ERROR', message, details);
  }
}

export class MessageException extends ChatException {
  constructor(message: string, details?: any) {
    super('MESSAGE_ERROR', message, details);
  }
}

export class PermissionException extends ChatException {
  constructor(message: string, details?: any) {
    super('PERMISSION_ERROR', message, details);
  }
}

export class TimeoutException extends ChatException {
  constructor(message: string, details?: any) {
    super('TIMEOUT_ERROR', message, details);
  }
}

export class StorageException extends ChatException {
  constructor(message: string, details?: any) {
    super('STORAGE_ERROR', message, details);
  }
}

// Legacy error interfaces for backward compatibility
export interface ValidationError extends ChatError {
  code: 'VALIDATION_ERROR';
}

export interface NetworkError extends ChatError {
  code: 'NETWORK_ERROR';
}

export interface AuthError extends ChatError {
  code: 'AUTH_ERROR';
}

// ========================================
// TYPE GUARDS & VALIDATORS
// ========================================

//  NEW: Type guards for runtime type checking
export const isMessage = (obj: any): obj is Message => {
  return obj && 
    typeof obj === 'object' &&
    (typeof obj.id === 'string' || typeof obj.clientTempId === 'string') &&
    typeof obj.senderId === 'string' &&
    typeof obj.content === 'string' &&
    typeof obj.conversationId === 'string' &&
    Object.values(MessageType).includes(obj.type) &&
    Object.values(MessageStatus).includes(obj.status);
};

export const isServerConversation = (obj: any): obj is ServerConversation => {
  return obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    Object.values(ConversationType).includes(obj.type) &&
    Array.isArray(obj.participants) &&
    typeof obj.unreadCount === 'number';
};

export const isAttachment = (obj: any): obj is Attachment => {
  return obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.url === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.size === 'number' &&
    Object.values(AttachmentType).includes(obj.type);
};

// ========================================
// CONSTANTS
// ========================================

export const DEFAULT_CONFIG: ChatConfig = {
  MESSAGE_TIMEOUT: 30000,
  ATTACHMENT_TIMEOUT: 60000,
  MAX_SESSION_AGE: 86400000, // 24 hours
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_CACHED_MESSAGES: 1000,
  CLEANUP_INTERVAL: 300000, // 5 minutes
  DEFAULT_PAGE_SIZE: 50,
  DEFAULT_CONVERSATION_LIMIT: 20,
  MAX_MESSAGE_LENGTH: 4000,
  MAX_ATTACHMENT_COUNT: 10,
  SUPPORTED_FILE_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv'
  ],
  SUPPORTED_IMAGE_TYPES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ],
  TYPING_INDICATOR_TIMEOUT: 3000,
  MESSAGE_RETRY_ATTEMPTS: 3,
  CONNECTION_RETRY_DELAY: 5000,
};

export const MESSAGE_STATUS_PRIORITY: Record<MessageStatus, number> = {
  [MessageStatus.FAILED]: 0,
  [MessageStatus.QUEUED]: 0,     // Same priority as failed
  [MessageStatus.SENDING]: 1,
  [MessageStatus.SENT]: 2,
  [MessageStatus.DELIVERED]: 3,
  [MessageStatus.READ]: 4,
  [MessageStatus.EXPIRED]: -1,   // Lower than failed
};

export const USER_ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  [UserRole.ADMIN]: ['all'],
  [UserRole.USTA]: ['manage_conversations', 'send_messages', 'send_attachments'],
  [UserRole.CUSTOMER]: ['send_messages', 'send_attachments'],
  [UserRole.SYSTEM]: ['send_system_messages'],
};

// Add these to your existing src/types/chat.ts file

// ========================================
// ONLINE USERS INTERFACES
// ========================================

/**
 * Online user information for real-time presence
 */
export interface OnlineUser {
  id: string;
  name: string;
  avatar?: string;
  isOnline: boolean;
  lastSeen?: string;
  role?: UserRole;
  status?: 'available' | 'busy' | 'away' | 'do_not_disturb';
  email?: string;
  phone?: string;
}

/**
 * Response from server with online users list
 */
export interface OnlineUsersResponse {
  users: OnlineUser[];
  count: number;
  timestamp: string;
}

/**
 * User status change event
 */
export interface UserStatusChangeEvent {
  userId: string;
  userName: string;
  isOnline: boolean;
  lastSeen?: string;
  timestamp: string;
}

/**
 * Online users statistics
 */
export interface OnlineUsersStats {
  total: number;
  byRole: Record<string, number>;
  byStatus: Record<string, number>;
}

/**
 * Online users grouped by role
 */
export interface OnlineUsersByRole {
  [role: string]: OnlineUser[];
}

