// src/services/interfaces/index.ts - All service interfaces

import { 
  Message, 
  ServerConversation, 
  ConversationType,
  ConversationStatus,
  MessageLoadOptions,
  MessageLoadResult,
  Attachment,
  AttachmentType,
  ConnectionState,
  UserRegistrationData,
  ConversationSettings,
  ConversationParticipant
} from '../../types/chat';

// ==========================================
// Message Service Interface
// ==========================================
export interface IMessageService {
  // Send operations
  sendMessage(
    conversationId: string, 
    content: string, 
    receiverId: string,
    options?: {
      replyTo?: string;
      attachments?: Attachment[];
      metadata?: Record<string, any>;
    }
  ): Promise<Message>;

  sendAttachment(
    conversationId: string,
    file: any,
    type: AttachmentType,
    receiverId: string
  ): Promise<Message>;

  // Fetch operations
  getMessages(
    conversationId: string, 
    options?: MessageLoadOptions
  ): Promise<MessageLoadResult>;

  getMessage(messageId: string): Promise<Message | null>;

  // Update operations
  markAsRead(
    conversationId: string, 
    messageIds?: string[]
  ): Promise<void>;

  editMessage(
    messageId: string, 
    content: string
  ): Promise<Message>;

  deleteMessage(messageId: string): Promise<void>;

  // Retry operations
  retryFailedMessage(
    conversationId: string,
    messageId: string,
    clientTempId?: string
  ): Promise<Message | null>;
}

// ==========================================
// Conversation Service Interface
// ==========================================
export interface IConversationService {
  // Create operations
  createConversation(params: {
    participantIds: string[];
    type: ConversationType;
    jobId?: string;
    jobTitle?: string;
    status?: ConversationStatus;
  }): Promise<{
    success: boolean;
    existing: boolean;
    conversation: ServerConversation;
  }>;

  // Fetch operations
  getConversation(id: string): Promise<ServerConversation>;
  
  getConversations(params?: {
    limit?: number;
    offset?: number;
    type?: ConversationType;
    status?: ConversationStatus;
    isPinned?: boolean;
    isMuted?: boolean;
  }): Promise<{
    conversations: ServerConversation[];
    hasMore: boolean;
    total: number;
  }>;

  searchConversations(
    searchTerm: string,
    options?: {
      limit?: number;
      offset?: number;
      type?: ConversationType;
      includeArchived?: boolean;
      searchFields?: ('jobTitle' | 'userName' | 'messageContent')[];
    }
  ): Promise<ServerConversation[]>;

  findJobConversation(
    jobId: string, 
    otherUserId: string
  ): Promise<ServerConversation | null>;

  // Update operations
  updateConversationSettings(
    conversationId: string,
    settings: Partial<ConversationSettings>
  ): Promise<void>;

  updateConversationStatus(
    conversationId: string,
    status: ConversationStatus
  ): Promise<void>;

  pinConversation(conversationId: string): Promise<void>;
  unpinConversation(conversationId: string): Promise<void>;
  archiveConversation(conversationId: string): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
}

// ==========================================
// User Service Interface
// ==========================================
export interface IUserService {
  // User operations
  checkUserExists(userId: string): Promise<{
    success: boolean;
    user?: any;
    error?: any;
  }>;

  registerUser(userData: UserRegistrationData): Promise<{
    success: boolean;
    user?: any;
    error?: any;
  }>;

  getUserDetails(userId: string): Promise<any | null>;

  // Block operations
  blockUser(userId: string): Promise<void>;
  unblockUser(userId: string): Promise<void>;
  isUserBlocked(userId: string): Promise<boolean>;
  getBlockedUsers(): Promise<string[]>;
}

// ==========================================
// File Service Interface
// ==========================================
export interface IFileService {
  uploadFile(file: any, type: AttachmentType): Promise<Attachment>;
  uploadImage(image: any): Promise<Attachment>;
  uploadAudio(audio: any): Promise<Attachment>;
  deleteFile(fileId: string): Promise<void>;
  getFileUrl(fileId: string): Promise<string>;
}

// ==========================================
// Realtime Service Interface
// ==========================================
export interface IRealtimeService {
  // Connection management
  connect(userId: string, token: string): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
  getConnectionState(): ConnectionState;

  // Message operations (real-time)
  sendMessage(message: Message): void;
  sendTypingIndicator(
    conversationId: string, 
    receiverId: string, 
    isTyping: boolean
  ): void;

  // Event subscriptions
  onMessage(callback: (message: Message) => void): () => void;
  onMessageSent(callback: (data: {
    messageId: string;
    clientTempId?: string;
    conversationId: string;
    status: string;
  }) => void): () => void;
  onMessageError(callback: (error: any) => void): () => void;
  
  onTyping(callback: (data: {
    userId: string;
    conversationId: string;
    isTyping: boolean;
  }) => void): () => void;
  
  onUserStatus(callback: (data: {
    userId: string;
    isOnline: boolean;
    lastSeen?: string;
  }) => void): () => void;
  
  onConnectionChange(callback: (state: ConnectionState) => void): () => void;
}

// ==========================================
// Offline Queue Service Interface
// ==========================================
export interface IOfflineQueueService {
  // Queue management
  queueMessage(message: Message): Promise<void>;
  processQueue(): Promise<void>;
  getQueuedMessages(): Message[];
  clearQueue(): Promise<void>;
  removeFromQueue(clientTempId: string): Promise<void>;

  // Queue status
  getQueueSize(): number;
  isProcessing(): boolean;
  
  // Persistence
  saveQueue(): Promise<void>;
  loadQueue(): Promise<void>;
}

// ==========================================
// Storage Service Interface
// ==========================================
export interface IStorageService {
  // Basic operations
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  
  // Bulk operations
  multiGet<T>(keys: string[]): Promise<Map<string, T>>;
  multiSet(items: Map<string, any>): Promise<void>;
  multiRemove(keys: string[]): Promise<void>;
  
  // Query operations
  getAllKeys(): Promise<string[]>;
  getItemsByPrefix(prefix: string): Promise<Map<string, any>>;
}

// ==========================================
// Cache Service Interface
// ==========================================
export interface ICacheService {
  // Message cache
  cacheMessage(conversationId: string, message: Message): void;
  getCachedMessages(conversationId: string): Message[];
  clearMessageCache(conversationId?: string): void;
  
  // Conversation cache
  cacheConversation(conversation: ServerConversation): void;
  getCachedConversation(conversationId: string): ServerConversation | null;
  getCachedConversations(): ServerConversation[];
  clearConversationCache(): void;
  
  // User cache
  cacheUser(userId: string, userData: any): void;
  getCachedUser(userId: string): any | null;
  clearUserCache(): void;
  
  // Cache management
  clearAllCache(): void;
  getCacheSize(): number;
  trimCache(maxSize: number): void;
}

// ==========================================
// Analytics Service Interface (Optional)
// ==========================================
export interface IAnalyticsService {
  trackEvent(eventName: string, properties?: Record<string, any>): void;
  trackScreen(screenName: string): void;
  trackError(error: Error, context?: Record<string, any>): void;
  setUserProperty(key: string, value: any): void;
  setUserId(userId: string): void;
}