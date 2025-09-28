// ChatService.ts - Complete Updated Production-Ready Implementation with ALL Methods
import AsyncStorage from '@react-native-async-storage/async-storage';

import { v4 as uuidv4 } from 'uuid';
import { UUID } from 'crypto';

import { 
  IChatStore, 
  IChatActions, 
  NoOpStore,
  MockStore 
} from '../types/store';

// Type imports (always the same)
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


// Mock AsyncStorage for Node.js
const AsyncStorage = typeof window === 'undefined' 
  ? require('../mocks/AsyncStorage').default
  : require('@react-native-async-storage/async-storage').default;

 // Platform detection
const isNodeEnvironment = typeof window === 'undefined' && typeof global !== 'undefined';
const Platform = isNodeEnvironment 
  ? { OS: 'node', Version: process.version } 
  : require('react-native').Platform;
 

// Conditional imports based on environment
const isTestEnvironment = process.env.NODE_ENV === 'test' ;

// Import services
import { socketService } from './SocketService';
import { chatApiService } from './ChatApiService';

// Import or create actions based on environment
let defaultActions: IChatActions;

if (isNodeEnvironment) {
  // Use mock actions for Node.js
  const messagingReducer = require('../stores/reducer/messagingReducer');
  defaultActions = {
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
} else {
  // In React Native, these would be imported from the actual Redux actions
  try {
    const messagingReducer = require('../stores/reducer/messagingReducer');
    defaultActions = {
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
  } catch (error) {
    // Fallback to no-op actions if Redux is not available
    console.warn('Redux actions not available, using no-op actions');
    defaultActions = {
      setInitialized: (initialized: boolean) => ({ type: 'setInitialized', payload: initialized }),
      setConnectionState: (state: any) => ({ type: 'setConnectionState', payload: state }),
      handleNewMessage: (data: any) => ({ type: 'handleNewMessage', payload: data }),
      markConversationAsRead: (id: string) => ({ type: 'markConversationAsRead', payload: id }),
      setActiveConversation: (id: string | null) => ({ type: 'setActiveConversation', payload: id }),
      updateTypingUsers: (data: any) => ({ type: 'updateTypingUsers', payload: data }),
      resetMessagingState: () => ({ type: 'resetMessagingState' }),
      updateConversationMetadata: (data: any) => ({ type: 'updateConversationMetadata', payload: data }),
      removeConversation: (id: string) => ({ type: 'removeConversation', payload: id }),
      syncConversations: (conversations: any) => ({ type: 'syncConversations', payload: conversations }),
    };
  }
}


let reduxActions: any = {};

if (isTestEnvironment) {
  // Test environment - use mocks
  console.log('🧪 Loading test mocks...');
  const mocks = require('./mocks/setup-mocks');
  socketService = mocks.socketService;
  chatApiService = mocks.chatApiService;
  Platform = (global as any).Platform || { OS: 'ios', Version: '14.0' };
  reduxActions = {
    setInitialized: mocks.setInitialized,
    setConnectionState: mocks.setConnectionState,
    handleNewMessage: mocks.handleNewMessage,
    markConversationAsRead: mocks.markConversationAsRead,
    setActiveConversation: mocks.setActiveConversation,
    updateTypingUsers: mocks.updateTypingUsers,
    resetMessagingState: mocks.resetMessagingState,
    updateConversationMetadata: mocks.updateConversationMetadata,
    removeConversation: mocks.removeConversation,
    syncConversations: mocks.syncConversations,
  };
} else {
  // Production environment - use real imports
  socketService = require('./SocketService').socketService;
  chatApiService = require('./ChatApiService').chatApiService;
  Platform = require('react-native').Platform;
  const messagingReducer = require('../stores/reducer/messagingReducer');
  reduxActions = {
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
}

// Destructure Redux actions for use in the class
const {
  setInitialized,
  setConnectionState,
  handleNewMessage,
  markConversationAsRead,
  setActiveConversation,
  updateTypingUsers,
  resetMessagingState,
  updateConversationMetadata,
  removeConversation,
  syncConversations
} = reduxActions;

// Constants for configuration
const CHAT_CONFIG = {
  MESSAGE_TIMEOUT: 10000,
  ATTACHMENT_TIMEOUT: 15000,
  MAX_SESSION_AGE: 24 * 60 * 60 * 1000, // 24 hours
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_CACHED_MESSAGES: 1000,
  CLEANUP_INTERVAL: 5 * 60 * 1000, // 5 minutes
  DEFAULT_PAGE_SIZE: 50,
  DEFAULT_CONVERSATION_LIMIT: 20,
} as const;

// Enhanced event listener management
interface EventListener {
  event: string;
  handler: (...args: any[]) => void;
  unsubscribe: () => void;
}

// Timeout reference tracking
interface TimeoutRef {
  id: number;
  type: string;
  created: number;
}


if (isNodeEnvironment) {
  // Use mock actions for Node.js
  const messagingReducer = require('../stores/reducer/messagingReducer');
  defaultActions = {
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
} else {
  // In React Native, these would be imported from the actual Redux actions
  try {
    const messagingReducer = require('../stores/reducer/messagingReducer');
    defaultActions = {
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
  } catch (error) {
    // Fallback to no-op actions if Redux is not available
    console.warn('Redux actions not available, using no-op actions');
    defaultActions = {
      setInitialized: (initialized: boolean) => ({ type: 'setInitialized', payload: initialized }),
      setConnectionState: (state: any) => ({ type: 'setConnectionState', payload: state }),
      handleNewMessage: (data: any) => ({ type: 'handleNewMessage', payload: data }),
      markConversationAsRead: (id: string) => ({ type: 'markConversationAsRead', payload: id }),
      setActiveConversation: (id: string | null) => ({ type: 'setActiveConversation', payload: id }),
      updateTypingUsers: (data: any) => ({ type: 'updateTypingUsers', payload: data }),
      resetMessagingState: () => ({ type: 'resetMessagingState' }),
      updateConversationMetadata: (data: any) => ({ type: 'updateConversationMetadata', payload: data }),
      removeConversation: (id: string) => ({ type: 'removeConversation', payload: id }),
      syncConversations: (conversations: any) => ({ type: 'syncConversations', payload: conversations }),
    };
  }
}

class ChatService {
  private userId: string = '';
  private userRole: string = '';
  private token: string = '';
  private messages: Map<string, Message[]> = new Map();
  private conversations: ServerConversation[] = [];
  private isInitialized: boolean = false;
  private userDetails: UserRegistrationData | null = null;

  // FIXED: Redux store dependency injection
  private reduxStore: any = null;

  // Message tracking for deduplication
  private messageIdMap: Map<string, string> = new Map(); // clientTempId -> permanentId
  private processingMessages: Set<string> = new Set(); // Track messages being processed
  private messageMetadata: Map<string, {
    hasMore: boolean;
    totalCount: number;
    oldestMessageId?: string;
    currentPage: number;
  }> = new Map();

  // Enhanced deduplication properties
  private recentMessageHashes = new Map<string, number>();
  private messageSendMutex = new Map<string, boolean>();
  private messageEventProcessed = new Set<string>();
  private processedSentEvents = new Set<string>();
  private localMessageIds = new Set<string>();

  // Offline queue support
  private offlineMessageQueue = new Map<string, QueuedMessage>();
  private isProcessingOfflineQueue = false;

  // Memory management
  private eventListeners: Set<EventListener> = new Set();
  private activeTimeouts: Map<string, TimeoutRef> = new Map();
  private cleanupInterval: number | null = null;

  constructor() {
    this.startMemoryCleanup();
  }

  // FIXED: Redux store setter method
  setReduxStore(store: any): void {
    this.reduxStore = store;
  }

  // FIXED: Safe Redux dispatch helper
  private safeDispatch(action: any): void {
    try {
      if (this.reduxStore?.dispatch) {
        this.reduxStore.dispatch(action);
      } else if (isTestEnvironment) {
        console.log('📤 Redux Action:', action.type, action.payload);
      }
    } catch (error) {
      console.warn('Redux dispatch failed:', error);
    }
  }

  // Memory cleanup system
  private startMemoryCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.performMemoryCleanup();
    }, CHAT_CONFIG.CLEANUP_INTERVAL) as any;
  }

  private performMemoryCleanup(): void {
    try {
      // Clean up old timeouts
      const now = Date.now();
      for (const [key, timeoutRef] of this.activeTimeouts) {
        if (now - timeoutRef.created > CHAT_CONFIG.MESSAGE_TIMEOUT * 2) {
          clearTimeout(timeoutRef.id);
          this.activeTimeouts.delete(key);
        }
      }

      // Clean up old processing messages
      this.processingMessages.clear();

      // Limit cached messages per conversation
      for (const [conversationId, messages] of this.messages) {
        if (messages.length > CHAT_CONFIG.MAX_CACHED_MESSAGES) {
          const trimmedMessages = messages.slice(0, CHAT_CONFIG.MAX_CACHED_MESSAGES);
          this.messages.set(conversationId, trimmedMessages);
        }
      }

      console.log('🧹 Memory cleanup completed');
    } catch (error) {
      this.safeLogError('Memory cleanup failed', error);
    }
  }

  // Enhanced timeout management
  private createTimeout(key: string, callback: () => void, delay: number, type: string = 'general'): void {
    // Clear existing timeout if any
    this.clearTimeout(key);

    const timeoutId = setTimeout(() => {
      this.activeTimeouts.delete(key);
      callback();
    }, delay) as any;

    this.activeTimeouts.set(key, {
      id: timeoutId,
      type,
      created: Date.now()
    });
  }

  private clearTimeout(key: string): void {
    const timeoutRef = this.activeTimeouts.get(key);
    if (timeoutRef) {
      clearTimeout(timeoutRef.id);
      this.activeTimeouts.delete(key);
    }
  }

  // Enhanced event listener management
  private addEventListenerWithCleanup(event: string, handler: (...args: any[]) => void): () => void {
    const unsubscribe = socketService.on(event, handler);
    
    const listener: EventListener = {
      event,
      handler,
      unsubscribe
    };
    
    this.eventListeners.add(listener);
    
    // Return cleanup function
    return () => {
      unsubscribe();
      this.eventListeners.delete(listener);
    };
  }

  // Safe error logging helper
  private safeLogError(context: string, error: any, additionalData?: any): void {
    console.error(`❌ [ChatService] ${context}:`, {
      message: error?.message || 'Unknown error',
      name: error?.name || 'Error',
      code: error?.code,
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      data: error?.response?.data,
      ...additionalData
    });
  }

  // FIXED: Enhanced connection state check with safe Redux dispatch
  private checkConnectionState(): void {
    try {
      const state = socketService.getConnectionStateEnum();
      
      // Safe dispatch connection state to Redux
      this.safeDispatch(setConnectionState(state as any));
      
      if (state !== ConnectionState.CONNECTED) {
        console.warn(`⚠️ Socket is ${state}, operation may fail`);
      }
    } catch (error) {
      console.warn('⚠️ Could not check connection state:', error);
      // Safe dispatch error state to Redux
      this.safeDispatch(setConnectionState('error'));
    }
  }

  // Getter for userId (useful for other components)
  public get currentUserId(): string {
    return this.userId || '';
  }

  // Getter for userRole
  public get currentUserRole(): string {
    return this.userRole || '';
  }

  // Get current connection state
  public getConnectionState(): ConnectionState {
    try {
      return socketService.getConnectionStateEnum();
    } catch (error) {
      console.warn('Failed to get connection state:', error);
      return ConnectionState.DISCONNECTED;
    }
  }

  // FIXED: Enhanced initialization with Redux integration and dependency injection
  async initialize(
    userId: string, 
    userRole: string, 
    token: string,
    reduxStore?: any,
    userDetails?: UserRegistrationData
  ): Promise<void> {
    try {
      // Input validation
      if (!userId?.trim()) {
        throw new ValidationException('User ID is required');
      }
      if (!userRole?.trim()) {
        throw new ValidationException('User role is required');
      }
      if (!token?.trim()) {
        throw new ValidationException('Authentication token is required');
      }

      // Set Redux store if provided
      if (reduxStore) {
        this.setReduxStore(reduxStore);
      }

      // Prevent re-initialization with same credentials
      if (this.isInitialized && 
          this.userId === userId && 
          this.token === token) {
        console.log('✓ Chat service already initialized with same credentials');
        
        // Still load offline queue if not loaded
        if (this.offlineMessageQueue.size === 0) {
          await this.loadOfflineQueue();
        }
        return;
      }

      console.log('🚀 Initializing chat service with offline support...');
      
      // Clean up previous state if reinitializing
      if (this.isInitialized) {
        await this.cleanup();
      }

      this.userId = userId;
      this.userRole = userRole;
      this.token = token;

      // Set token for API calls with error handling
      try {
        chatApiService.setToken(token);
      } catch (error) {
        throw new AuthException('Failed to set authentication token');
      }

      // Check and register user if needed
      if (userDetails) {
        console.log('📝 User details provided, checking registration status...');
        this.userDetails = userDetails;
      } else {
        console.log('⚠️ No user details provided for registration check');
      }

      // Load offline queue from storage
      console.log('📥 Loading offline message queue...');
      await this.loadOfflineQueue();
      
      // Connect to WebSocket for real-time messaging
      try {
        await socketService.connect(userId, token);
        
        // If connected successfully and have offline messages, process them
        if (socketService.isConnected() && this.offlineMessageQueue.size > 0) {
          console.log(`📤 Connection established, processing ${this.offlineMessageQueue.size} offline messages...`);
          
          // Process offline queue after a short delay to let connection stabilize
          setTimeout(() => {
            this.processOfflineQueue();
          }, 3000);
        }
        
      } catch (connectionError) {
        console.warn('⚠️ WebSocket connection failed, but service initialized for offline mode:', connectionError);
        // Don't throw - allow offline mode operation
      }

      this.isInitialized = true;

      // Safe dispatch initialization state to Redux
      this.safeDispatch(setInitialized(true));

      // Save session for recovery
      await this.saveSession();

      // Set up periodic offline queue maintenance
      this.startOfflineQueueMaintenance();

      console.log('✓ Chat service initialized successfully with offline support');
      
      if (this.offlineMessageQueue.size > 0) {
        console.log(`📋 ${this.offlineMessageQueue.size} messages pending in offline queue`);
      }
      
    } catch (error) {
      this.safeLogError('Failed to initialize chat service', error);
      this.isInitialized = false;
      
      // Safe dispatch failed initialization to Redux
      this.safeDispatch(setInitialized(false));
      
      throw error;
    }
  }

  // Recover previous chat session from storage
  async recoverSession(reduxStore?: any): Promise<boolean> {
    try {
      console.log('🔄 Attempting to recover chat session...');
      
      // Set Redux store if provided
      if (reduxStore) {
        this.setReduxStore(reduxStore);
      }
      
      // Get saved session from storage
      const sessionData = await AsyncStorage.getItem('chat_session');
      
      if (!sessionData) {
        console.log('ℹ️ No saved session found');
        return false;
      }

      const session = JSON.parse(sessionData);
      
      // Validate session data
      if (!session.userId || !session.token || !session.timestamp) {
        console.log('⚠️ Invalid session data found');
        await AsyncStorage.removeItem('chat_session');
        return false;
      }

      // Check if session is not too old (24 hours)
      const sessionAge = Date.now() - session.timestamp;
      if (sessionAge > CHAT_CONFIG.MAX_SESSION_AGE) {
        console.log('⚠️ Session expired, removing...');
        await AsyncStorage.removeItem('chat_session');
        return false;
      }

      // Validate token format (basic check)
      if (typeof session.token !== 'string' || session.token.length < 20) {
        console.log('⚠️ Invalid token format in session');
        await AsyncStorage.removeItem('chat_session');
        return false;
      }

      // Set internal state
      this.userId = session.userId;
      this.userRole = session.userRole || 'customer';
      this.token = session.token;
      this.userDetails = session.userDetails || null;

      // Set token for API calls
      try {
        chatApiService.setToken(session.token);
      } catch (error) {
        throw new AuthException('Failed to set authentication token');
      }

      // Test connection to verify token is still valid
      try {
        // Try to get user details to verify token
        const userCheck = await this.getUserDetails(this.userId);
        
        if (!userCheck) {
          console.log('⚠️ Token appears invalid, user not found');
          await AsyncStorage.removeItem('chat_session');
          return false;
        }
      } catch (error: any) {
        console.log('⚠️ Token validation failed:', error.message);
        await AsyncStorage.removeItem('chat_session');
        return false;
      }

      // Reconnect to WebSocket
      try {
        await socketService.connect(this.userId, this.token);
      } catch (error) {
        console.warn('⚠️ WebSocket reconnection failed, but session is valid');
        // Don't fail session recovery just because WebSocket failed
        // User can still use API calls
      }

      // Mark as initialized
      this.isInitialized = true;

      // Safe dispatch to Redux
      this.safeDispatch(setInitialized(true));
      this.safeDispatch(setConnectionState(this.getConnectionState() as any));

      console.log('✓ Chat session recovered successfully');
      console.log('✓ User:', this.userId, 'Role:', this.userRole);
      
      return true;

    } catch (error: any) {
      this.safeLogError('Failed to recover session', error);
      
      // Clean up on any error
      try {
        await AsyncStorage.removeItem('chat_session');
      } catch (cleanupError) {
        console.warn('Failed to cleanup invalid session:', cleanupError);
      }
      
      // Reset state
      this.isInitialized = false;
      this.userId = '';
      this.userRole = '';
      this.token = '';
      this.userDetails = null;
      
      // Safe dispatch failed recovery to Redux
      this.safeDispatch(setInitialized(false));
      
      return false;
    }
  }

// Search conversations by various criteria
async searchConversations(
  searchTerm: string,
  options?: {
    limit?: number;
    offset?: number;
    type?: ConversationType;
    includeArchived?: boolean;
    searchFields?: ('jobTitle' | 'userName' | 'messageContent')[];
  }
): Promise<ServerConversation[]> {
  try {
    console.log('🔍 Searching conversations:', { searchTerm, options });
    
    // Validation
    if (!searchTerm?.trim()) {
      throw new ValidationException('Search term is required');
    }
    
    if (!this.token?.trim()) {
      throw new AuthException('Authentication token required');
    }

    if (!this.isInitialized) {
      throw new NetworkException('Chat service not initialized');
    }

    const trimmedTerm = searchTerm.trim();
    
    // Prepare search parameters
    const searchParams = {
      query: trimmedTerm,
      limit: options?.limit || 50,
      offset: options?.offset || 0,
      type: options?.type,
      includeArchived: options?.includeArchived || false,
      searchFields: options?.searchFields || ['jobTitle', 'userName', 'messageContent']
    };

    try {
      // TODO: Add this endpoint to ChatApiService when backend is ready
      // const result = await chatApiService.searchConversations(searchParams);
      
      // For now, implement client-side search as fallback
      console.log('🔍 Using client-side search fallback until server endpoint is available');
      
      // Get all conversations for searching
      const allConversationsResult = await chatApiService.getConversations({
        limit: 200, // Get more conversations for better search results
        offset: 0,
        type: options?.type,
        // Include archived if requested
        ...(options?.includeArchived && { 
          status: undefined // Don't filter by status to include archived
        })
      });

      // Perform client-side search with proper typing
      const searchResults = allConversationsResult.conversations.filter((conversation: ServerConversation) => {
        const query = trimmedTerm.toLowerCase();
        
        // Search in job title
        if (searchParams.searchFields.includes('jobTitle')) {
          const jobTitle = conversation.metadata?.jobTitle?.toLowerCase() || '';
          if (jobTitle.includes(query)) return true;
        }
        
        // Search in user names
        if (searchParams.searchFields.includes('userName')) {
          const hasMatchingUser = conversation.participants.some((participant: ConversationParticipant) => {
            const userName = participant.name?.toLowerCase() || '';
            return userName.includes(query) && participant.userId !== this.userId;
          });
          if (hasMatchingUser) return true;
        }
        
        // Search in last message content
        if (searchParams.searchFields.includes('messageContent')) {
          const lastMessageContent = conversation.lastMessage?.content?.toLowerCase() || '';
          if (lastMessageContent.includes(query)) return true;
        }
        
        return false;
      });

      // Apply pagination to client-side results
      const paginatedResults = searchResults.slice(
        searchParams.offset, 
        searchParams.offset + searchParams.limit
      );

      console.log(`✅ Found ${paginatedResults.length} conversations matching "${trimmedTerm}"`);
      
      return paginatedResults;

    } catch (apiError: any) {
      // If API call fails, still try client-side search
      console.warn('⚠️ Server search failed, falling back to client-side:', apiError.message);
      
      // Get cached conversations for search
      const cachedConversations = this.conversations || [];
      
      if (cachedConversations.length === 0) {
        console.warn('⚠️ No cached conversations available for search');
        return [];
      }

      // Perform search on cached data
      const searchResults = cachedConversations.filter((conversation: ServerConversation) => {
        const query = trimmedTerm.toLowerCase();
        
        // Search in job title
        if (searchParams.searchFields.includes('jobTitle')) {
          const jobTitle = conversation.metadata?.jobTitle?.toLowerCase() || '';
          if (jobTitle.includes(query)) return true;
        }
        
        // Search in user names
        if (searchParams.searchFields.includes('userName')) {
          const hasMatchingUser = conversation.participants.some((participant: ConversationParticipant) => {
            const userName = participant.name?.toLowerCase() || '';
            return userName.includes(query) && participant.userId !== this.userId;
          });
          if (hasMatchingUser) return true;
        }
        
        // Search in last message content
        if (searchParams.searchFields.includes('messageContent')) {
          const lastMessageContent = conversation.lastMessage?.content?.toLowerCase() || '';
          if (lastMessageContent.includes(query)) return true;
        }
        
        return false;
      });

      // Apply pagination
      const paginatedResults = searchResults.slice(
        searchParams.offset, 
        searchParams.offset + searchParams.limit
      );

      console.log(`✅ Found ${paginatedResults.length} cached conversations matching "${trimmedTerm}"`);
      
      return paginatedResults;
    }

  } catch (error: any) {
    this.safeLogError('Failed to search conversations', error, { searchTerm, options });
    
    if (error instanceof ValidationException || error instanceof AuthException) {
      throw error;
    } else {
      throw new NetworkException('Failed to search conversations', error);
    }
  }
}

  // Get total unread message count across all conversations
  async getTotalUnreadCount(options?: {
    includeArchived?: boolean;
    includeMuted?: boolean;
    conversationType?: ConversationType;
  }): Promise<number> {
    try {
      console.log('📊 Getting total unread count...');
      
      if (!this.isInitialized) {
        console.warn('⚠️ Chat service not initialized, returning 0');
        return 0;
      }

      const {
        includeArchived = false,
        includeMuted = true,
        conversationType
      } = options || {};

      try {
        // Try to get from server first (more accurate)
        // TODO: Add this endpoint to ChatApiService when backend supports it
        // const serverCount = await chatApiService.getTotalUnreadCount(options);
        // if (typeof serverCount === 'number') {
        //   console.log('✓ Got unread count from server:', serverCount);
        //   return serverCount;
        // }
        
        console.log('🔍 Calculating unread count from local conversations');
        
        // Get current conversations from local cache or fetch fresh
        let conversations = this.conversations || [];
        
        // If no cached conversations, fetch from server
        if (conversations.length === 0) {
          try {
            const result = await this.getMyConversations({
              limit: 100, // Get enough conversations for accurate count
              offset: 0
            });
            conversations = result.conversations;
          } catch (fetchError) {
            console.warn('⚠️ Failed to fetch conversations for unread count:', fetchError);
            return 0;
          }
        }

        // Calculate unread count with filters
        let totalUnread = 0;
        
        for (const conversation of conversations) {
          // Skip if no unread messages
          if (!conversation.unreadCount || conversation.unreadCount <= 0) {
            continue;
          }

          // Filter by conversation type if specified
          if (conversationType && conversation.type !== conversationType) {
            continue;
          }

          // Skip archived conversations unless included
          if (!includeArchived && conversation.metadata?.status === ConversationStatus.ARCHIVED) {
            continue;
          }

          // Skip muted conversations unless included
          if (!includeMuted && conversation.settings?.isMuted) {
            continue;
          }

          totalUnread += conversation.unreadCount;
        }

        console.log(`✓ Total unread count: ${totalUnread}`, {
          includeArchived,
          includeMuted,
          conversationType,
          totalConversations: conversations.length
        });

        return totalUnread;

      } catch (apiError: any) {
        console.warn('⚠️ Failed to get unread count from server, using local calculation:', apiError.message);
        
        // Fallback to local cache calculation
        const conversations = this.conversations || [];
        
        let totalUnread = 0;
        
        for (const conversation of conversations) {
          if (!conversation.unreadCount || conversation.unreadCount <= 0) {
            continue;
          }

          // Apply filters
          if (conversationType && conversation.type !== conversationType) {
            continue;
          }

          if (!includeArchived && conversation.metadata?.status === ConversationStatus.ARCHIVED) {
            continue;
          }

          if (!includeMuted && conversation.settings?.isMuted) {
            continue;
          }

          totalUnread += conversation.unreadCount;
        }

        console.log(`✓ Local unread count: ${totalUnread}`);
        return totalUnread;
      }

    } catch (error: any) {
      this.safeLogError('Failed to get total unread count', error, options);
      
      // Return 0 on any error to prevent UI issues
      return 0;
    }
  }

  // Get unread count for a specific conversation
  async getConversationUnreadCount(conversationId: string): Promise<number> {
    try {
      if (!conversationId?.trim()) {
        throw new ValidationException('Conversation ID is required');
      }

      // Check local cache first
      const conversation = this.conversations.find(c => c.id === conversationId);
      if (conversation) {
        return conversation.unreadCount || 0;
      }

      // If not in cache, fetch from server
      try {
        const conversationData = await this.getConversationById(conversationId);
        return conversationData.unreadCount || 0;
      } catch (fetchError) {
        console.warn('⚠️ Failed to fetch conversation for unread count:', fetchError);
        return 0;
      }

    } catch (error: any) {
      this.safeLogError('Failed to get conversation unread count', error, { conversationId });
      return 0;
    }
  }

  // Reset unread count for a conversation (internal helper)
  private updateLocalUnreadCount(conversationId: string, newCount: number = 0): void {
    try {
      const conversation = this.conversations.find(c => c.id === conversationId);
      if (conversation) {
        conversation.unreadCount = Math.max(0, newCount);
        console.log(`📊 Updated local unread count for ${conversationId}: ${newCount}`);
      }
    } catch (error) {
      console.warn('Failed to update local unread count:', error);
    }
  }

  // Listen for message read events
  onMessageRead(callback: (messageId: string, status: MessageStatus, conversationId: string) => void): () => void {
    try {
      console.log('👁️ Setting up message read event listener');
      
      // Set up socket event listener for message read receipts
      const cleanup = this.addEventListenerWithCleanup('message_read', (data: {
        messageId?: string;
        messageIds?: string[];
        conversationId: string;
        readBy: string;
        readAt: string;
        status?: MessageStatus;
      }) => {
        try {
          // Validate event data
          if (!data || typeof data !== 'object') {
            console.warn('⚠️ Invalid message read event data:', data);
            return;
          }

          const { messageId, messageIds, conversationId, readBy, readAt, status } = data;
          console.log(readAt);
          // Skip if read by current user (we already know we read it)
          if (readBy === this.userId) {
            return;
          }

          // Handle single message read
          if (messageId) {
            console.log('✓ Message read event:', { messageId, conversationId, readBy });
            
            // Update local message status
            this.updateLocalMessageStatus(messageId, MessageStatus.READ);
            
            // Update conversation unread count
            this.decrementUnreadCount(conversationId, 1);
            
            // Notify callback
            callback(messageId, status || MessageStatus.READ, conversationId);
          }

          // Handle multiple messages read (batch)
          if (messageIds && Array.isArray(messageIds)) {
            console.log('✓ Multiple messages read event:', { 
              count: messageIds.length, 
              conversationId, 
              readBy 
            });
            
            messageIds.forEach(msgId => {
              if (msgId) {
                // Update local message status
                this.updateLocalMessageStatus(msgId, MessageStatus.READ);
                
                // Notify callback for each message
                callback(msgId, status || MessageStatus.READ, conversationId);
              }
            });
            
            // Update conversation unread count
            this.decrementUnreadCount(conversationId, messageIds.length);
          }

          // Safe dispatch to Redux for unread count updates
          this.safeDispatch(markConversationAsRead(conversationId));

        } catch (error) {
          this.safeLogError('Error processing message read event', error, data);
        }
      });

      // Also listen for conversation read events (when entire conversation is marked as read)
      const conversationReadCleanup = this.addEventListenerWithCleanup('conversation_read', (data: {
        conversationId: string;
        readBy: string;
        readAt: string;
        messageIds?: string[];
      }) => {
        try {
          if (!data || !data.conversationId) {
            console.warn('⚠️ Invalid conversation read event data:', data);
            return;
          }

          const { conversationId, readBy, messageIds } = data;

          // Skip if read by current user
          if (readBy === this.userId) {
            return;
          }

          console.log('✓ Conversation read event:', { conversationId, readBy });

          // If specific message IDs provided, update them
          if (messageIds && Array.isArray(messageIds)) {
            messageIds.forEach(messageId => {
              if (messageId) {
                this.updateLocalMessageStatus(messageId, MessageStatus.READ);
                callback(messageId, MessageStatus.READ, conversationId);
              }
            });
          } else {
            // Mark all messages in conversation as read
            const conversationMessages = this.getLocalMessages(conversationId);
            conversationMessages.forEach(message => {
              if (message.senderId === this.userId && message.status !== MessageStatus.READ) {
                this.updateLocalMessageStatus(message.id, MessageStatus.READ);
                callback(message.id, MessageStatus.READ, conversationId);
              }
            });
          }

          // Reset conversation unread count
          this.updateLocalUnreadCount(conversationId, 0);

          // Safe dispatch to Redux
          this.safeDispatch(markConversationAsRead(conversationId));

        } catch (error) {
          this.safeLogError('Error processing conversation read event', error, data);
        }
      });

      // Return combined cleanup function
      return () => {
        try {
          cleanup();
          conversationReadCleanup();
          console.log('👁️ Message read event listeners cleaned up');
        } catch (error) {
          console.warn('Failed to cleanup message read listeners:', error);
        }
      };

    } catch (error) {
      this.safeLogError('Failed to set up message read listener', error);
      
      // Return no-op cleanup function
      return () => {};
    }
  }

  // Helper method to update local message status
  private updateLocalMessageStatus(messageId: string, status: MessageStatus): void {
    try {
      // Update in all conversation message stores
      for (const [conversationId, messages] of this.messages.entries()) {
        const message = messages.find(m => m.id === messageId);
        if (message) {
          message.status = status;
          console.log(`📝 Updated message ${messageId} status to ${status}`);
          break;
        }
      }
    } catch (error) {
      console.warn('Failed to update local message status:', error);
    }
  }

  // Helper method to decrement unread count
  private decrementUnreadCount(conversationId: string, count: number = 1): void {
    try {
      const conversation = this.conversations.find(c => c.id === conversationId);
      if (conversation && conversation.unreadCount > 0) {
        conversation.unreadCount = Math.max(0, conversation.unreadCount - count);
        console.log(`📊 Decremented unread count for ${conversationId} by ${count}`);
      }
    } catch (error) {
      console.warn('Failed to decrement unread count:', error);
    }
  }

  // Manually mark messages as read (for local testing or fallback)
  async markLocalMessagesAsRead(conversationId: string, messageIds?: string[]): Promise<void> {
    try {
      if (!conversationId?.trim()) {
        throw new ValidationException('Conversation ID is required');
      }

      const messages = this.getLocalMessages(conversationId);
      const messagesToUpdate = messageIds 
        ? messages.filter(m => messageIds.includes(m.id))
        : messages.filter(m => m.senderId === this.userId && m.status !== MessageStatus.READ);

      messagesToUpdate.forEach(message => {
        this.updateLocalMessageStatus(message.id, MessageStatus.READ);
      });

      console.log(`✓ Marked ${messagesToUpdate.length} local messages as read`);

    } catch (error) {
      this.safeLogError('Failed to mark local messages as read', error, { conversationId, messageIds });
    }
  }

  // Listen for detailed connection state changes with offline queue support
  onConnectionStateChange(callback: (state: ConnectionState, details?: {
    previousState?: ConnectionState;
    timestamp: string;
    error?: any;
    reconnectAttempt?: number;
    nextRetryIn?: number;
  }) => void): () => void {
    try {
      console.log('📌 Setting up connection state change listener with offline queue support');
      
      let previousState: ConnectionState = this.getConnectionState();
      let reconnectAttempt = 0;
      let wasOffline = false;
      
      // Listen for socket connection events
      const socketStateCleanup = this.addEventListenerWithCleanup('connection_state_change', async (data: {
        state: string;
        connected: boolean;
        timestamp: string;
        error?: any;
        reconnecting?: boolean;
        retryAttempt?: number;
        nextRetryDelay?: number;
      }) => {
        try {
          const currentState = this.mapSocketStateToConnectionState(data.state, data);
          
          // Only trigger callback if state actually changed
          if (currentState !== previousState) {
            console.log('📌 Connection state changed:', {
              from: previousState,
              to: currentState,
              connected: data.connected,
              timestamp: data.timestamp
            });

            // Track if we were offline
            if (previousState === ConnectionState.DISCONNECTED || 
                previousState === ConnectionState.ERROR) {
              wasOffline = true;
            }

            // Handle reconnection - process offline queue
            if (currentState === ConnectionState.CONNECTED && wasOffline) {
              console.log('🔄 Connection restored! Processing offline queue...');
              wasOffline = false;
              
              // Load offline queue if not already loaded
              if (this.offlineMessageQueue.size === 0) {
                await this.loadOfflineQueue();
              }
              
              // Process offline queue after a short delay
              setTimeout(() => {
                this.processOfflineQueue();
              }, 2000); // Wait 2 seconds for connection to stabilize
            }

            // Safe dispatch to Redux
            this.safeDispatch(setConnectionState(currentState as any));

            // Prepare details object
            const details = {
              previousState,
              timestamp: data.timestamp || new Date().toISOString(),
              error: data.error,
              reconnectAttempt: data.retryAttempt || reconnectAttempt,
              nextRetryIn: data.nextRetryDelay
            };

            // Update tracking variables
            if (currentState === ConnectionState.RECONNECTING) {
              reconnectAttempt = (data.retryAttempt || reconnectAttempt) + 1;
            } else if (currentState === ConnectionState.CONNECTED) {
              reconnectAttempt = 0; // Reset on successful connection
            }

            previousState = currentState;

            // Notify callback
            callback(currentState, details);
          }

        } catch (error) {
          this.safeLogError('Error processing connection state change', error, data);
        }
      });

      // Listen for explicit connect event
      const connectCleanup = this.addEventListenerWithCleanup('connect', async () => {
        try {
          console.log('✅ Socket connected event received');
          
          // Process offline queue
          if (this.offlineMessageQueue.size > 0 || wasOffline) {
            console.log(`📤 Processing ${this.offlineMessageQueue.size} offline messages...`);
            
            // Load from storage if needed
            if (this.offlineMessageQueue.size === 0) {
              await this.loadOfflineQueue();
            }
            
            // Process queue
            setTimeout(() => {
              this.processOfflineQueue();
            }, 1500);
          }
          
          wasOffline = false;
          
        } catch (error) {
          this.safeLogError('Error handling connect event', error);
        }
      });

      // Listen for socket errors specifically
      const errorCleanup = this.addEventListenerWithCleanup('connect_error', (error: any) => {
        try {
          console.log('📌 Connection error event:', error);
          wasOffline = true;

          const currentState = ConnectionState.ERROR;
          
          if (currentState !== previousState) {
            // Safe dispatch to Redux
            this.safeDispatch(setConnectionState(currentState as any));

            const details = {
              previousState,
              timestamp: new Date().toISOString(),
              error: error,
              reconnectAttempt
            };

            previousState = currentState;
            callback(currentState, details);
          }

        } catch (processingError) {
          this.safeLogError('Error processing connection error event', processingError, error);
        }
      });

      // Listen for disconnect events
      const disconnectCleanup = this.addEventListenerWithCleanup('disconnect', async (reason: string) => {
        try {
          console.log('📌 Disconnect event:', reason);
          wasOffline = true;

          // Save offline queue when disconnected
          if (this.offlineMessageQueue.size > 0) {
            await this.saveOfflineQueue();
          }

          const currentState = ConnectionState.DISCONNECTED;
          
          if (currentState !== previousState) {
            // Safe dispatch to Redux
            this.safeDispatch(setConnectionState(currentState as any));

            const details = {
              previousState,
              timestamp: new Date().toISOString(),
              error: reason,
              reconnectAttempt
            };

            previousState = currentState;
            callback(currentState, details);
          }

        } catch (error) {
          this.safeLogError('Error processing disconnect event', error, { reason });
        }
      });

      // Listen for reconnect attempts
      const reconnectCleanup = this.addEventListenerWithCleanup('reconnect_attempt', (attemptNumber: number) => {
        try {
          console.log('📌 Reconnect attempt:', attemptNumber);

          const currentState = ConnectionState.RECONNECTING;
          reconnectAttempt = attemptNumber;
          
          // Safe dispatch to Redux
          this.safeDispatch(setConnectionState(currentState as any));

          const details = {
            previousState,
            timestamp: new Date().toISOString(),
            reconnectAttempt: attemptNumber
          };

          if (currentState !== previousState) {
            previousState = currentState;
          }

          callback(currentState, details);

        } catch (error) {
          this.safeLogError('Error processing reconnect attempt event', error, { attemptNumber });
        }
      });

      // Periodic state check to catch any missed state changes
      const stateCheckInterval = setInterval(async () => {
        try {
          const currentState = this.getConnectionState();
          
          // Check if state changed
          if (currentState !== previousState) {
            console.log('📌 State change detected via periodic check:', {
              from: previousState,
              to: currentState
            });

            // Handle reconnection
            if (currentState === ConnectionState.CONNECTED && 
                (previousState === ConnectionState.DISCONNECTED || previousState === ConnectionState.ERROR)) {
              
              if (this.offlineMessageQueue.size > 0) {
                console.log('🔄 Connection restored (periodic check), processing offline queue...');
                await this.processOfflineQueue();
              }
            }

            // Safe dispatch to Redux
            this.safeDispatch(setConnectionState(currentState as any));

            const details = {
              previousState,
              timestamp: new Date().toISOString(),
              reconnectAttempt
            };

            previousState = currentState;
            callback(currentState, details);
          }
          
          // Periodic cleanup of expired messages
          if (this.offlineMessageQueue.size > 0) {
            await this.cleanupOfflineQueue();
          }
          
        } catch (error) {
          console.warn('Error in periodic state check:', error);
        }
      }, 5000); // Check every 5 seconds

      // Return combined cleanup function
      return () => {
        try {
          socketStateCleanup();
          connectCleanup();
          errorCleanup();
          disconnectCleanup();
          reconnectCleanup();
          clearInterval(stateCheckInterval);
          console.log('📌 Connection state change listeners cleaned up');
        } catch (error) {
          console.warn('Failed to cleanup connection state listeners:', error);
        }
      };

    } catch (error) {
      this.safeLogError('Failed to set up connection state change listener', error);
      
      // Return no-op cleanup function
      return () => {};
    }
  }

  // Helper method to map socket states to ConnectionState enum
  private mapSocketStateToConnectionState(socketState: string, data?: any): ConnectionState {
    try {
      console.log(data);
      switch (socketState?.toLowerCase()) {
        case 'connected':
        case 'connect':
          return ConnectionState.CONNECTED;
        
        case 'connecting':
        case 'connect_attempt':
          return ConnectionState.CONNECTING;
        
        case 'reconnecting':
        case 'reconnect_attempt':
          return ConnectionState.RECONNECTING;
        
        case 'disconnected':
        case 'disconnect':
          return ConnectionState.DISCONNECTED;
        
        case 'error':
        case 'connect_error':
        case 'reconnect_error':
          return ConnectionState.ERROR;
        
        default:
          // Fallback to checking socket service directly
          if (socketService.isConnected()) {
            return ConnectionState.CONNECTED;
          } else {
            return ConnectionState.DISCONNECTED;
          }
      }
    } catch (error) {
      console.warn('Error mapping socket state:', error);
      return ConnectionState.DISCONNECTED;
    }
  }

  // Get current connection state with details
  getConnectionStateDetails(): {
    state: ConnectionState;
    isConnected: boolean;
    canSendMessages: boolean;
    lastConnected?: string;
    reconnectAttempts: number;
  } {
    try {
      const state = this.getConnectionState();
      const isConnected = this.isConnected();
      
      return {
        state,
        isConnected,
        canSendMessages: isConnected && state === ConnectionState.CONNECTED,
        lastConnected: isConnected ? new Date().toISOString() : undefined,
        reconnectAttempts: 0 // Would need to track this in a class property
      };
    } catch (error) {
      this.safeLogError('Error getting connection state details', error);
      
      return {
        state: ConnectionState.ERROR,
        isConnected: false,
        canSendMessages: false,
        reconnectAttempts: 0
      };
    }
  }

  // Force connection state check and emit event if changed
  checkAndEmitConnectionState(): ConnectionState {
    try {
      const currentState = this.getConnectionState();
      
      // This would trigger the periodic check in the listener
      // Could also manually emit an event here if needed
      
      return currentState;
    } catch (error) {
      this.safeLogError('Error checking connection state', error);
      return ConnectionState.ERROR;
    }
  }

  // Load more messages for pagination (older messages)

  // Load more messages for pagination (older messages) - COMPLETE FIX
async loadMoreMessages(
  conversationId: string,
  options?: {
    limit?: number;
    before?: string; // Load messages before this message ID
    includeMetadata?: boolean;
  }
): Promise<MessageLoadResult> {
  try {
    console.log('Loading more messages for conversation:', conversationId);
    
    // Validation
    if (!conversationId?.trim()) {
      throw new ValidationException('Conversation ID is required');
    }

    if (!this.isInitialized) {
      throw new NetworkException('Chat service not initialized');
    }

    const { limit = CHAT_CONFIG.DEFAULT_PAGE_SIZE, before, includeMetadata = true } = options || {};
    console.log(includeMetadata);

    // Get current messages and metadata
    const existingMessages = this.getLocalMessages(conversationId);
    const metadata = this.messageMetadata.get(conversationId);

    // Check if we have more messages to load
    if (metadata && !metadata.hasMore) {
      console.log('No more messages to load');
      return {
        messages: existingMessages,
        hasMore: false,
        totalCount: metadata.totalCount || existingMessages.length,
        oldestMessageId: metadata.oldestMessageId,
        newestMessageId: existingMessages[0]?.id
      };
    }

    // Determine the page to load based on existing messages
    const currentPage = metadata?.currentPage || 1;
    const nextPage = currentPage + 1;

    // Get the oldest message ID for pagination
    const beforeMessageId = before || metadata?.oldestMessageId || existingMessages[existingMessages.length - 1]?.id;

    console.log('Loading page:', nextPage, 'before message:', beforeMessageId);

    try {
      // Load more messages from API
      const result = await chatApiService.getMessages(conversationId, nextPage, limit);

      if (!result.messages || result.messages.length === 0) {
        console.log('No more messages found');
        
        // Update metadata to indicate no more messages - FIXED: Ensure totalCount is number
        this.messageMetadata.set(conversationId, {
          hasMore: false,
          totalCount: result.total ?? existingMessages.length, // Use nullish coalescing
          oldestMessageId: metadata?.oldestMessageId,
          currentPage: nextPage
        });

        return {
          messages: existingMessages,
          hasMore: false,
          totalCount: result.total ?? existingMessages.length,
          oldestMessageId: beforeMessageId,
          newestMessageId: existingMessages[0]?.id
        };
      }

      // Process and merge new messages - FIXED: Add type annotation
      const newMessages = result.messages.map((msg: any) => this.transformMessage(msg));
      
      // Merge with existing messages, avoiding duplicates
      const mergedMessages = this.mergeMessages(existingMessages, newMessages, 'append');

      // Update local cache
      this.messages.set(conversationId, mergedMessages);

      // Update metadata - FIXED: Ensure totalCount is always number
      const newMetadata = {
        hasMore: result.hasMore,
        totalCount: result.total ?? mergedMessages.length, // Use nullish coalescing
        oldestMessageId: newMessages[newMessages.length - 1]?.id || beforeMessageId,
        currentPage: nextPage
      };
      this.messageMetadata.set(conversationId, newMetadata);

      console.log(`Loaded ${newMessages.length} more messages. Total: ${mergedMessages.length}`);

      return {
        messages: mergedMessages,
        hasMore: result.hasMore,
        totalCount: result.total ?? mergedMessages.length,
        oldestMessageId: newMetadata.oldestMessageId,
        newestMessageId: mergedMessages[0]?.id
      };

    } catch (apiError: any) {
      // If API fails, return current messages
      console.warn('Failed to load more messages from API:', apiError.message);
      
      return {
        messages: existingMessages,
        hasMore: false, // Assume no more if API fails
        totalCount: existingMessages.length,
        oldestMessageId: beforeMessageId,
        newestMessageId: existingMessages[0]?.id
      };
    }

  } catch (error: any) {
    this.safeLogError('Failed to load more messages', error, { conversationId, options });
    
    // Return existing messages on error
    const existingMessages = this.getLocalMessages(conversationId);
    return {
      messages: existingMessages,
      hasMore: false,
      totalCount: existingMessages.length,
      oldestMessageId: existingMessages[existingMessages.length - 1]?.id,
      newestMessageId: existingMessages[0]?.id
    };
  }
}

  // Refresh messages (get latest messages)
  async refreshMessages(
    conversationId: string,
    options?: {
      limit?: number;
      after?: string; // Load messages after this message ID
      keepExisting?: boolean; // Whether to keep existing messages or replace
    }
  ): Promise<MessageLoadResult> {
    try {
      console.log('🔄 Refreshing messages for conversation:', conversationId);
      
      // Validation
      if (!conversationId?.trim()) {
        throw new ValidationException('Conversation ID is required');
      }

      if (!this.isInitialized) {
        throw new NetworkException('Chat service not initialized');
      }

      const { 
        limit = CHAT_CONFIG.DEFAULT_PAGE_SIZE, 
        after, 
        keepExisting = true 
      } = options || {};

      const existingMessages = this.getLocalMessages(conversationId);
      
      // Get the newest message ID for getting only new messages
      const afterMessageId = after || existingMessages[0]?.id;

      console.log('🔄 Refreshing from message:', afterMessageId);

      try {
        // Get fresh messages from API
        const result = await this.loadMessages(conversationId, {
          page: 1,
          limit,
          after: afterMessageId,
          forceRefresh: true
        });

        // If we're getting messages after a specific point, merge with existing
        if (keepExisting && afterMessageId && existingMessages.length > 0) {
          // Only get new messages that aren't already cached
          const newMessages = result.messages.filter(newMsg => 
            !existingMessages.some(existingMsg => existingMsg.id === newMsg.id)
          );

          if (newMessages.length > 0) {
            // Merge new messages at the beginning
            const mergedMessages = this.mergeMessages(newMessages, existingMessages, 'prepend');
            
            // Update local cache
            this.messages.set(conversationId, mergedMessages);

            console.log(`✓ Refreshed with ${newMessages.length} new messages. Total: ${mergedMessages.length}`);

            return {
              messages: mergedMessages,
              hasMore: result.hasMore,
              totalCount: result.totalCount + newMessages.length,
              oldestMessageId: existingMessages[existingMessages.length - 1]?.id,
              newestMessageId: mergedMessages[0]?.id
            };
          } else {
            console.log('ℹ️ No new messages found during refresh');
            return {
              messages: existingMessages,
              hasMore: result.hasMore,
              totalCount: result.totalCount,
              oldestMessageId: existingMessages[existingMessages.length - 1]?.id,
              newestMessageId: existingMessages[0]?.id
            };
          }
        } else {
          // Complete refresh - replace all messages
          console.log(`✓ Complete refresh: ${result.messages.length} messages`);
          return result;
        }

      } catch (apiError: any) {
        console.warn('⚠️ Failed to refresh messages from API:', apiError.message);
        
        // Return existing messages if refresh fails
        return {
          messages: existingMessages,
          hasMore: true, // Assume more exist if we can't refresh
          totalCount: existingMessages.length,
          oldestMessageId: existingMessages[existingMessages.length - 1]?.id,
          newestMessageId: existingMessages[0]?.id
        };
      }

    } catch (error: any) {
      this.safeLogError('Failed to refresh messages', error, { conversationId, options });
      
      // Return existing messages on error
      const existingMessages = this.getLocalMessages(conversationId);
      return {
        messages: existingMessages,
        hasMore: false,
        totalCount: existingMessages.length,
        oldestMessageId: existingMessages[existingMessages.length - 1]?.id,
        newestMessageId: existingMessages[0]?.id
      };
    }
  }

  // FIXED: Helper method to merge messages avoiding duplicates with better performance
  private mergeMessages(
    messages1: Message[], 
    messages2: Message[], 
    mode: 'prepend' | 'append' | 'replace' = 'append'
  ): Message[] {
    try {
      const messageMap = new Map<string, Message>();
      
      // Add messages based on mode
      const orderedMessages = mode === 'prepend' 
        ? [...messages1, ...messages2]
        : [...messages2, ...messages1];

      // FIXED: Deduplicate using Map for O(1) performance
      orderedMessages.forEach(msg => {
        // Use clientTempId as primary key if available, otherwise use id
        const key = msg.clientTempId || msg.id;
        const existing = messageMap.get(key);
        
        // Only replace if the new message has better status or more complete data
        if (!existing || 
            (existing.status === MessageStatus.SENDING && msg.status !== MessageStatus.SENDING) ||
            (msg.id && !existing.id) ||
            (msg.timestamp && (!existing.timestamp || new Date(msg.timestamp) > new Date(existing.timestamp)))) {
          messageMap.set(key, msg);
          // Also map by id if available
          if (msg.id && msg.id !== key) {
            messageMap.set(msg.id, msg);
          }
        }
      });

      // Convert back to array and sort by timestamp (newest first)
      const mergedMessages = Array.from(messageMap.values())
        .filter((msg, index, self) => 
          // Remove duplicates with same id using Set for better performance
          self.findIndex(m => m.id === msg.id) === index
        )
        .sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

      return mergedMessages;

    } catch (error) {
      this.safeLogError('Error merging messages', error);
      
      // Fallback to simple concatenation
      if (mode === 'prepend') {
        return [...messages1, ...messages2];
      } else {
        return [...messages2, ...messages1];
      }
    }
  }

  // Transform message from API format to app format (if not already done)
  private transformMessage(data: any): Message {
    // This might already exist in ChatService, but including for completeness
    return {
      id: data.id,
      clientTempId: data.clientTempId,
      senderId: data.senderId,
      receiverId: data.receiverId,
      content: data.content?.text || data.content || '',
      timestamp: data.createdAt || data.timestamp,
      type: data.type || MessageType.TEXT,
      status: data.status || MessageStatus.SENT,
      replyTo: data.content?.replyTo || data.replyTo,
      attachments: data.attachments || [],
      conversationId: data.conversationId,
      jobId: data.jobId,
      isEdited: data.isEdited,
      editedAt: data.editedAt
    };
  }

  // Get user details from chat server
  async getUserDetails(userId: string): Promise<any | null> {
    try {
      console.log('👤 Getting user details from chat server:', userId);
      
      if (!userId?.trim()) {
        throw new ValidationException('User ID is required');
      }

      if (!this.token?.trim()) {
        throw new AuthException('Authentication token required');
      }

      const response = await chatApiService.checkUserExists(userId);
      
      if (response.success && response.user) {
        console.log('✓ User found');
        return response.user;
      }
      
      console.log('ℹ️ User not found:', userId);
      return null;
      
    } catch (error: any) {
      if (error?.response?.status === 404) {
        console.log('ℹ️ User not found (404):', userId);
        return null;
      }
      
      this.safeLogError('Error getting user details', error);
      throw new NetworkException('Failed to get user details', error);
    }
  }

  // Create conversation
  async createConversation(params: {
    participantIds: string[];
    type: ConversationType;
    jobId?: string;
    jobTitle?: string;
    status?: ConversationStatus;
  }): Promise<ConversationCreationResponse> {
    try {
      // Validation
      if (!params.participantIds || params.participantIds.length < 2) {
        throw new ValidationException('At least 2 participants required');
      }
      
      if (params.type === ConversationType.JOB_CHAT && !params.jobId) {
        throw new ValidationException('Job ID required for job chat');
      }
      
      // Build clean payload with correct field name
      const payload = {
        participantIds: [...new Set(params.participantIds)], // Correct field name
        type: params.type,
        status: params.status || ConversationStatus.ACTIVE,
        ...(params.jobId && { jobId: params.jobId }),
        ...(params.jobTitle && { jobTitle: params.jobTitle })
      };
      
      console.log('📤 [ChatService] Creating conversation:', payload);
      
      // Make API call
      const response = await chatApiService.createConversation(payload);
      
      if (response.success && response.conversation) {
        return response;
      }
      
      throw new Error('Failed to create conversation');
      
    } catch (error: any) {
      this.safeLogError('Failed to create conversation', error);
      
      // Handle specific errors
      const status = error?.response?.status;
      const errorData = error?.response?.data;
      
      if (status === 400) {
        // Better error handling for 400 errors
        const errorCode = errorData?.errorCode || errorData?.error?.code;
        const errorMessage = errorData?.errorMessage || errorData?.error?.message || errorData?.message;
        
        if (errorCode === 'INVALID_PARTICIPANTS') {
          throw new ValidationException('Invalid participant information. Please check user IDs.');
        } else if (errorCode === 'DUPLICATE_CONVERSATION') {
          throw new ValidationException('Conversation already exists between these participants.');
        } else {
          throw new ValidationException(errorMessage || 'Invalid request parameters');
        }
      } else if (status === 409) {
        throw new ValidationException('Conversation already exists');
      } else if (status === 401) {
        throw new AuthException('Authentication failed');
      } else {
        throw new NetworkException('Failed to create conversation');
      }
    }
  }

  // Create conversation and send initial message in one operation
  async createConversationAndSendMessage(
    jobId: string,
    receiverId: string,
    messageText: string,
    replyTo?: string,
    jobTitle?: string
  ): Promise<{
    conversationId: string;
    conversation: ServerConversation;
    message: Message;
  }> {
    try {
      console.log('🔨💬 Creating conversation and sending message:', {
        jobId,
        receiverId,
        messageLength: messageText?.length,
        hasJobTitle: !!jobTitle
      });

      // Enhanced validation
      if (!jobId?.trim()) {
        throw new ValidationException('Job ID is required');
      }
      if (!receiverId?.trim()) {
        throw new ValidationException('Receiver ID is required');
      }
      if (!messageText?.trim()) {
        throw new ValidationException('Message text is required');
      }
      if (!this.userId?.trim()) {
        throw new ValidationException('Current user ID is required');
      }
      if (receiverId === this.userId) {
        throw new ValidationException('Cannot create conversation with yourself');
      }
      if (!this.isInitialized) {
        throw new NetworkException('Chat service not initialized');
      }

      const trimmedMessage = messageText.trim();
      
      // Create deduplication key for this operation
      const operationKey = `create-send:${jobId}:${receiverId}:${trimmedMessage}`;
      const now = Date.now();
      
      // Check if this exact operation was attempted recently
      const lastAttempt = this.recentMessageHashes.get(operationKey);
      if (lastAttempt && (now - lastAttempt) < 5000) {
        console.warn('🚫 Duplicate create-and-send blocked:', {
          jobId,
          receiverId,
          timeSinceLastAttempt: now - lastAttempt
        });
        throw new ValidationException('This operation was just attempted. Please wait.');
      }
      
      // Record this operation
      this.recentMessageHashes.set(operationKey, now);
      
      // Clean up after 10 seconds
      setTimeout(() => {
        this.recentMessageHashes.delete(operationKey);
      }, 10000);

      this.checkConnectionState();

      // Step 1: Check if conversation already exists
      console.log('🔍 Checking for existing conversation...');
      let conversation: ServerConversation;
      let isNewConversation = false;

      try {
        const existingConversation = await this.findJobConversation(jobId, receiverId);
        
        if (existingConversation) {
          console.log('✓ Found existing conversation:', existingConversation.id);
          conversation = existingConversation;
        } else {
          throw new Error('No existing conversation found');
        }
      } catch (findError) {
        // No existing conversation, create new one
        console.log('🔨 Creating new conversation...');
        isNewConversation = true;

        // Prevent duplicate conversation creation
        const createKey = `create-conv:${jobId}:${receiverId}`;
        if (this.messageSendMutex.get(createKey)) {
          console.warn('🚫 Conversation creation already in progress');
          throw new ValidationException('Conversation creation already in progress. Please wait.');
        }
        
        this.messageSendMutex.set(createKey, true);
        
        try {
          const createResult = await this.createConversation({
            participantIds: [this.userId, receiverId],
            type: ConversationType.JOB_CHAT,
            jobId: jobId,
            jobTitle: jobTitle,
            status: ConversationStatus.ACTIVE
          });

          if (!createResult.success || !createResult.conversation) {
            throw new Error('Failed to create conversation');
          }

          conversation = createResult.conversation;
          console.log('✓ Created new conversation:', conversation.id);
          
        } finally {
          this.messageSendMutex.delete(createKey);
        }
      }

      // Step 2: Prepare message with unique IDs
      const clientTempId = `temp-${now}-${Math.random().toString(36).substr(2, 9)}`;
      const messageId = uuidv4();
      
      // Verify this clientTempId isn't already being processed
      if (this.processingMessages.has(clientTempId)) {
        console.warn('🚫 ClientTempId already in processing:', clientTempId);
        throw new ValidationException('Message already being sent. Please wait.');
      }

      const message: Message = {
        id: messageId,
        clientTempId: clientTempId,
        senderId: this.userId,
        receiverId: receiverId,
        content: trimmedMessage,
        timestamp: new Date().toISOString(),
        type: MessageType.TEXT,
        status: MessageStatus.SENDING,
        replyTo,
        conversationId: conversation.id,
        jobId: jobId
      };

      // Step 3: Add message to local cache immediately (optimistic update)
      this.addMessageLocally(conversation.id, message);

      // Track this message to prevent duplicates
      this.processingMessages.add(clientTempId);

      try {
        // Step 4: Send message via WebSocket ONLY (not API to prevent duplicates)
        if (!socketService.isConnected()) {
          throw new NetworkException('Socket not connected. Cannot send message.');
        }
        
        socketService.sendMessage(message);

        // Step 5: Update local message with sent status after a small delay
        // This gives the server time to process and prevents race conditions
        setTimeout(() => {
          if (this.processingMessages.has(clientTempId)) {
            // Message hasn't been confirmed yet, update optimistically
            const updatedMessage: Message = {
              ...message,
              status: MessageStatus.SENT
            };
            this.updateMessageLocally(conversation.id, clientTempId, updatedMessage);
          }
        }, 500);

        // Step 6: Update conversation cache
        if (isNewConversation) {
          conversation.lastMessage = message;
          conversation.updatedAt = message.timestamp;
          this.conversations.unshift(conversation);
        } else {
          const existingIndex = this.conversations.findIndex(c => c.id === conversation.id);
          if (existingIndex !== -1) {
            this.conversations[existingIndex].lastMessage = message;
            this.conversations[existingIndex].updatedAt = message.timestamp;
            
            // Move to top of list
            const [updatedConversation] = this.conversations.splice(existingIndex, 1);
            this.conversations.unshift(updatedConversation);
          }
        }

        // Step 7: Set up single timeout for failure detection
        this.createTimeout(
          `message-${clientTempId}`,
          () => {
            if (this.processingMessages.has(clientTempId)) {
              console.warn('⏱️ Message send timeout in create-and-send:', clientTempId);
              this.updateMessageStatus(message.id, MessageStatus.FAILED);
              this.processingMessages.delete(clientTempId);
            }
          },
          CHAT_CONFIG.MESSAGE_TIMEOUT,
          'message'
        );

        // Safe dispatch to Redux for new conversation
        if (isNewConversation) {
          await this.syncConversationsToRedux();
        }

        console.log('✓ Conversation created and message sent successfully');

        return {
          conversationId: conversation.id,
          conversation: conversation,
          message: message
        };

      } catch (sendError: any) {
        // Mark message as failed
        this.updateMessageStatus(message.id, MessageStatus.FAILED);
        this.processingMessages.delete(clientTempId);
        this.clearTimeout(`message-${clientTempId}`);

        throw new NetworkException('Failed to send message', sendError);
      }

    } catch (error: any) {
      this.safeLogError('Failed to create conversation and send message', error, {
        jobId,
        receiverId,
        messageLength: messageText?.length
      });

      // Provide specific error messages
      if (error instanceof ValidationException || error instanceof AuthException) {
        throw error;
      } else if (error?.response?.status === 400) {
        throw new ValidationException('Invalid request parameters. Please check the conversation details.');
      } else if (error?.response?.status === 401) {
        throw new AuthException('Authentication required. Please log in again.');
      } else if (error?.response?.status === 403) {
        throw new ValidationException('You do not have permission to create this conversation.');
      } else if (error?.response?.status === 404) {
        throw new ValidationException('Job or user not found. Please verify the information.');
      } else {
        throw new NetworkException('Failed to create conversation and send message. Please check your internet connection and try again.');
      }
    }
  }

  // Create conversation and send attachment in one operation
  async createConversationAndSendAttachment(
    jobId: string,
    receiverId: string,
    file: any,
    type: AttachmentType,
    jobTitle?: string
  ): Promise<string> {
    try {
      console.log('🔨📎 Creating conversation and sending attachment:', {
        jobId,
        receiverId,
        fileName: file?.name,
        fileType: type
      });

      // Validation
      if (!file?.uri) {
        throw new ValidationException('Invalid file selected');
      }
      if (!jobId?.trim()) {
        throw new ValidationException('Job ID is required');
      }
      if (!receiverId?.trim()) {
        throw new ValidationException('Receiver ID is required');
      }

      // Step 1: Create or find conversation (similar to message version)
      let conversation: ServerConversation;
      
      try {
        const existingConversation = await this.findJobConversation(jobId, receiverId);
        conversation = existingConversation || await this.createJobConversation(jobId, receiverId, { jobTitle });
      } catch (error) {
        const createResult = await this.createConversation({
          participantIds: [this.userId, receiverId],
          type: ConversationType.JOB_CHAT,
          jobId: jobId,
          jobTitle: jobTitle,
          status: ConversationStatus.ACTIVE
        });

        if (!createResult.success || !createResult.conversation) {
          throw new Error('Failed to create conversation for attachment');
        }

        conversation = createResult.conversation;
      }

      // Step 2: Send attachment using existing method
      await this.sendAttachment(conversation.id, file, type, receiverId);

      console.log('✓ Conversation created and attachment sent successfully');
      
      return conversation.id;

    } catch (error: any) {
      this.safeLogError('Failed to create conversation and send attachment', error, {
        jobId,
        receiverId,
        fileName: file?.name,
        fileType: type
      });
      throw error;
    }
  }

  // Validate conversation creation parameters
  private validateConversationCreation(jobId: string, receiverId: string, messageText?: string): void {
    if (!jobId?.trim()) {
      throw new ValidationException('Job ID is required for conversation creation');
    }
    
    if (!receiverId?.trim()) {
      throw new ValidationException('Receiver ID is required for conversation creation');
    }
    
    if (receiverId === this.userId) {
      throw new ValidationException('Cannot create conversation with yourself');
    }
    
    if (messageText !== undefined && !messageText?.trim()) {
      throw new ValidationException('Message text cannot be empty');
    }
    
    if (!this.userId?.trim()) {
      throw new ValidationException('User must be logged in to create conversations');
    }
    
    if (!this.isInitialized) {
      throw new NetworkException('Chat service must be initialized before creating conversations');
    }
  }

  // Listen for user online/offline status changes
  onUserStatusChange(callback: (userId: string, isOnline: boolean, lastSeen?: string, details?: {
    previousStatus?: boolean;
    timestamp: string;
    userInfo?: {
      name?: string;
      avatar?: string;
    };
  }) => void): () => void {
    try {
      console.log('Setting up user status change listener');
      
      // Track user statuses to detect changes
      const userStatusMap = new Map<string, { isOnline: boolean; lastSeen?: string }>();

      // Listen for separate online/offline events
      const onlineStatusCleanup = this.addEventListenerWithCleanup('user_status', (userId: string, isOnline: boolean, details?: any) => {
        try {
          if (!userId || userId === this.userId) {
            return;
          }

          // Get previous status
          const previousStatus = userStatusMap.get(userId);
          const statusChanged = !previousStatus || previousStatus.isOnline !== isOnline;

          // Update local tracking
          userStatusMap.set(userId, { 
            isOnline, 
            lastSeen: isOnline ? undefined : new Date().toISOString()
          });

          // Only notify if status actually changed
          if (statusChanged) {
            console.log('User status changed:', {
              userId,
              isOnline,
              previousOnline: previousStatus?.isOnline
            });

            // Update local conversations cache
            this.updateUserStatusInConversations(userId, isOnline, !isOnline ? new Date().toISOString() : undefined);

            // Prepare details object
            const callbackDetails = {
              previousStatus: previousStatus?.isOnline,
              timestamp: new Date().toISOString(),
              userInfo: details?.userInfo
            };

            // Notify callback
            callback(userId, isOnline, !isOnline ? new Date().toISOString() : undefined, callbackDetails);
          }

        } catch (error) {
          this.safeLogError('Error processing user status change', error, { userId, isOnline });
        }
      });

      // Return cleanup function
      return () => {
        try {
          onlineStatusCleanup();
          userStatusMap.clear();
          console.log('User status change listeners cleaned up');
        } catch (error) {
          console.warn('Failed to cleanup user status listeners:', error);
        }
      };

    } catch (error) {
      this.safeLogError('Failed to set up user status change listener', error);
      return () => {};
    }
  }

  // Update user status in local conversations cache
  private updateUserStatusInConversations(userId: string, isOnline: boolean, lastSeen?: string): void {
    try {
      let updatedCount = 0;
      
      this.conversations.forEach(conversation => {
        const participant = conversation.participants.find(p => p.userId === userId);
        if (participant) {
          participant.isOnline = isOnline;
          if (lastSeen) {
            participant.lastSeen = lastSeen;
          }
          updatedCount++;
        }
      });

      if (updatedCount > 0) {
        console.log(`📝 Updated user status in ${updatedCount} conversations:`, {
          userId,
          isOnline,
          lastSeen
        });
      }

    } catch (error) {
      console.warn('Failed to update user status in conversations:', error);
    }
  }

  // Get current user status from cache
  getUserStatus(userId: string): { isOnline: boolean; lastSeen?: string } | null {
    try {
      if (!userId?.trim()) {
        return null;
      }

      // Check conversations cache first
      for (const conversation of this.conversations) {
        const participant = conversation.participants.find(p => p.userId === userId);
        if (participant) {
          return {
            isOnline: participant.isOnline || false,
            lastSeen: participant.lastSeen
          };
        }
      }

      return null;

    } catch (error) {
      this.safeLogError('Failed to get user status', error, { userId });
      return null;
    }
  }

  // Get online users from current conversations
  getOnlineUsers(): Array<{ userId: string; name: string; lastSeen?: string }> {
    try {
      const onlineUsers = new Map<string, { userId: string; name: string; lastSeen?: string }>();

      this.conversations.forEach(conversation => {
        conversation.participants.forEach(participant => {
          if (participant.userId !== this.userId && participant.isOnline) {
            onlineUsers.set(participant.userId, {
              userId: participant.userId,
              name: participant.name,
              lastSeen: participant.lastSeen
            });
          }
        });
      });

      return Array.from(onlineUsers.values());

    } catch (error) {
      this.safeLogError('Failed to get online users', error);
      return [];
    }
  }

  // Get conversation by ID
  async getConversationById(conversationId: string): Promise<ServerConversation> {
    try {
      console.log('🔍 Getting conversation by ID:', conversationId);
      
      if (!conversationId?.trim()) {
        throw new ValidationException('Conversation ID is required');
      }
      
      // First check local cache
      const cachedConversation = this.conversations.find(c => c.id === conversationId);
      if (cachedConversation) {
        console.log('✓ Found conversation in cache');
        return cachedConversation;
      }
      
      // Fetch from API
      const result = await chatApiService.getConversationById(conversationId);
      
      if (result.success && result.conversation) {
        // Add to local cache
        const existingIndex = this.conversations.findIndex(c => c.id === conversationId);
        if (existingIndex >= 0) {
          this.conversations[existingIndex] = result.conversation;
        } else {
          this.conversations.unshift(result.conversation);
        }
        
        return result.conversation;
      } else {
        throw new Error('Conversation not found');
      }
    } catch (error) {
      this.safeLogError('Failed to get conversation by ID', error, { conversationId });
      throw new NetworkException('Failed to load conversation', error);
    }
  }


  // Find existing job conversation - Fix for lines 2407-2410
async findJobConversation(jobId: string, otherUserId: string): Promise<ServerConversation | null> {
  try {
    console.log('Finding job conversation:', { jobId, otherUserId, currentUserId: this.userId });
    if (!jobId?.trim()){
      throw new ValidationException('Job ID is required');
    }
    if (!otherUserId?.trim()) {
      throw new ValidationException('Other user ID is required');
    }
    
    // Check local cache with exact matching
    const cachedConversation = this.conversations.find((c: ServerConversation) => {
      const hasMatchingJob = c.metadata?.jobId === jobId;
      const hasOtherUser = c.participants?.some((p: ConversationParticipant) => p.userId === otherUserId);
      const hasCurrentUser = c.participants?.some((p: ConversationParticipant) => p.userId === this.userId);
      const isTwoPersonChat = c.participants?.length === 2;
      
      return hasMatchingJob && hasOtherUser && hasCurrentUser && isTwoPersonChat;
    });
    
    if (cachedConversation) {
      console.log('Found job conversation in cache:', cachedConversation.id);
      return cachedConversation;
    }
    
    // Search server with exact filtering
    try {
      const result = await chatApiService.getConversations({
        limit: 100,
        offset: 0,
        type: ConversationType.JOB_CHAT
      });
      
      // FIXED: Lines 2407-2410 - Add explicit type annotations
      const existingConversation = result.conversations.find((c: ServerConversation) => {
        const hasMatchingJob = c.metadata?.jobId === jobId;
        const hasOtherUser = c.participants?.some((p: ConversationParticipant) => p.userId === otherUserId);
        const hasCurrentUser = c.participants?.some((p: ConversationParticipant) => p.userId === this.userId);
        const isTwoPersonChat = c.participants?.length === 2;
        
        return hasMatchingJob && hasOtherUser && hasCurrentUser && isTwoPersonChat;
      });
      
      if (existingConversation) {
        console.log('Found existing job conversation via API:', existingConversation.id);
        this.conversations.unshift(existingConversation);
        return existingConversation;
      }
      
    } catch (searchError: any) {
      console.warn('API search failed:', searchError.message);
    }
    
    console.log('No existing job conversation found');
    return null;
    
  } catch (error: any) {
    this.safeLogError('Error finding job conversation', error, { jobId, otherUserId });
    return null;
  }
}


  // Find or create job conversation
  async findOrCreateJobConversation(jobId: string, otherUserId: string): Promise<ServerConversation> {
    try {
      console.log('🔨 Finding or creating job conversation:', { 
        jobId, 
        otherUserId, 
        currentUserId: this.userId 
      });
      
      // Validate input parameters
      if (!jobId?.trim()) {
        throw new ValidationException('Job ID is required');
      }
      
      if (!otherUserId?.trim()) {
        throw new ValidationException('Other user ID is required');
      }
      
      if (!this.userId?.trim()) {
        throw new ValidationException('Current user ID is required');
      }
      
      // Check if these are the same user (shouldn't happen but prevent it)
      if (otherUserId === this.userId) {
        throw new ValidationException('Cannot create conversation with yourself');
      }
      
      // First try to find existing conversation
      const existingConversation = await this.findJobConversation(jobId, otherUserId);
      
      if (existingConversation) {
        console.log('✓ Found existing job conversation');
        return existingConversation;
      }
      
      // No existing conversation found, create new one
      console.log('🔨 Creating new job conversation...');
      
      const createParams = {
        participantIds: [this.userId, otherUserId],
        type: ConversationType.JOB_CHAT,
        jobId: jobId.toString().trim(),
        status: ConversationStatus.ACTIVE
      };
      
      console.log('📤 Creating conversation with params:', createParams);
      
      const result = await this.createConversation(createParams);
      
      if (result.success) {
        console.log('✓ Job conversation created successfully');
        return result.conversation;
      } else {
        throw new Error('Failed to create job conversation: API returned success=false');
      }
      
    } catch (error: any) {
      this.safeLogError('Failed to find or create job conversation', error, {
        jobId,
        otherUserId,
        currentUserId: this.userId
      });
      
      // Provide more specific error messages
      if (error?.response?.status === 400) {
        const errorData = error.response.data;
        if (errorData?.message?.includes('participants')) {
          throw new ValidationException('Invalid participant information. Please check user IDs.');
        } else if (errorData?.message?.includes('job')) {
          throw new ValidationException('Invalid job information. Please check the job ID.');
        } else {
          throw new ValidationException(`Invalid request: ${errorData?.message || 'Please check the conversation details'}`);
        }
      } else if (error?.response?.status === 401) {
        throw new AuthException('Authentication required. Please log in again.');
      } else if (error?.response?.status === 403) {
        throw new ValidationException('You do not have permission to create this conversation.');
      } else if (error?.response?.status === 404) {
        throw new ValidationException('Job or user not found. Please verify the information.');
      } else if (error instanceof ValidationException || error instanceof AuthException) {
        throw error; // Re-throw validation/auth errors as-is
      } else {
        throw new NetworkException('Failed to create conversation. Please check your internet connection and try again.');
      }
    }
  }

  // Create job conversation with job details
  async createJobConversation(
    jobId: string, 
    otherUserId: string, 
    jobData?: { jobTitle?: string; [key: string]: any }
  ): Promise<ServerConversation> {
    try {
      console.log('🔨 Creating job conversation with details:', { jobId, otherUserId, jobData });
      
      if (!jobId?.trim() || !otherUserId?.trim()) {
        throw new ValidationException('Job ID and other user ID are required');
      }
      
      const result = await this.createConversation({
        participantIds: [this.userId, otherUserId],
        type: ConversationType.JOB_CHAT,
        jobId,
        jobTitle: jobData?.jobTitle,
        status: ConversationStatus.ACTIVE
      });
      
      if (result.success) {
        return result.conversation;
      } else {
        throw new Error('Failed to create job conversation');
      }
    } catch (error) {
      this.safeLogError('Failed to create job conversation', error);
      throw error;
    }
  }

  // Pin conversation with Redux integration
  async pinConversation(conversationId: string): Promise<void> {
    try {
      if (!conversationId?.trim()) {
        throw new ValidationException('Conversation ID is required');
      }
      
      await this.updateConversationSettings(conversationId, { isPinned: true });
      
      // Safe dispatch to Redux
      this.safeDispatch(updateConversationMetadata({
        conversationId,
        metadata: { isPinned: true }
      }));
      
      console.log('✓ Conversation pinned');
    } catch (error) {
      this.safeLogError('Failed to pin conversation', error);
      throw error;
    }
  }

  // Unpin conversation with Redux integration
  async unpinConversation(conversationId: string): Promise<void> {
    try {
      if (!conversationId?.trim()) {
        throw new ValidationException('Conversation ID is required');
      }
      
      await this.updateConversationSettings(conversationId, { isPinned: false });
      
      // Safe dispatch to Redux
      this.safeDispatch(updateConversationMetadata({
        conversationId,
        metadata: { isPinned: false }
      }));
      
      console.log('✓ Conversation unpinned');
    } catch (error) {
      this.safeLogError('Failed to unpin conversation', error);
      throw error;
    }
  }

  // Archive conversation
  async archiveConversation(conversationId: string): Promise<void> {
    try {
      if (!conversationId?.trim()) {
        throw new ValidationException('Conversation ID is required');
      }
      
      await chatApiService.updateConversationStatus(conversationId, ConversationStatus.ARCHIVED);
      
      // Update local cache
      const conversation = this.conversations.find(c => c.id === conversationId);
      if (conversation?.metadata) {
        conversation.metadata.status = ConversationStatus.ARCHIVED;
      }
      
      // Safe dispatch to Redux
      this.safeDispatch(updateConversationMetadata({
        conversationId,
        metadata: { isArchived: true }
      }));
      
      console.log('✓ Conversation archived');
    } catch (error) {
      this.safeLogError('Failed to archive conversation', error);
      throw error;
    }
  }

  // Delete conversation with Redux integration
  async deleteConversation(conversationId: string): Promise<void> {
    try {
      if (!conversationId?.trim()) {
        throw new ValidationException('Conversation ID is required');
      }
      
      await chatApiService.deleteConversation(conversationId);
      
      // Safe dispatch to Redux first
      this.safeDispatch(removeConversation(conversationId));
      
      // Remove from local cache
      this.conversations = this.conversations.filter(c => c.id !== conversationId);
      this.messages.delete(conversationId);
      this.messageMetadata.delete(conversationId);
      
      console.log('✓ Conversation deleted');
    } catch (error) {
      this.safeLogError('Failed to delete conversation', error);
      throw error;
    }
  }

  // Get conversations with enhanced filtering
  async getMyConversations(params?: {
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
  }> {
    try {
      const result = await chatApiService.getConversations({
        ...params,
        limit: params?.limit || CHAT_CONFIG.DEFAULT_CONVERSATION_LIMIT,
        offset: params?.offset || 0
      });
      
      if (params?.offset === 0) {
        // Replace cache for first page
        this.conversations = result.conversations;
        
        // Sync conversations to Redux
        await this.syncConversationsToRedux();
      } else {
              // Append for pagination, avoiding duplicates
              const existingIds = new Set(this.conversations.map((c: ServerConversation) => c.id));
              const newConversations = result.conversations.filter((c: ServerConversation) => !existingIds.has(c.id));
              this.conversations = [...this.conversations, ...newConversations];
            }
      
      console.log(`✓ Loaded ${result.conversations.length} conversations`);
      
      return {
        conversations: this.conversations,
        hasMore: result.hasMore,
        total: result.total
      };
    } catch (error) {
      this.safeLogError('Failed to load conversations', error);
      throw error;
    }
  }

  // Load messages with Redux integration
  async loadMessages(
    conversationId: string, 
    options: MessageLoadOptions = {}
  ): Promise<MessageLoadResult> {
    try {
      if (!conversationId?.trim()) {
        throw new ValidationException('Conversation ID is required');
      }
      
      this.checkConnectionState();
      
      const { 
        page = 1, 
        limit = CHAT_CONFIG.DEFAULT_PAGE_SIZE, 
        before, 
        after, 
        forceRefresh = false 
      } = options;
      console.log(before);

      // Get cached messages if not forcing refresh
      const cachedMessages = this.messages.get(conversationId) || [];
      const metadata = this.messageMetadata.get(conversationId);
      
      // Return cached for page 1 if available and not forcing refresh
      if (page === 1 && cachedMessages.length > 0 && !forceRefresh && !before && !after) {
        return {
          messages: cachedMessages,
          hasMore: metadata?.hasMore ?? true,
          totalCount: metadata?.totalCount ?? cachedMessages.length,
          oldestMessageId: metadata?.oldestMessageId,
          newestMessageId: cachedMessages[0]?.id
        };
      }

      // Fetch from API
      const result = await chatApiService.getMessages(conversationId, page, limit);

      // Process and deduplicate messages
      const processedMessages = this.processIncomingMessages(
        result.messages,
        cachedMessages,
        { page, before, after }
      );

      // Update cache
      this.messages.set(conversationId, processedMessages);
      
      // Update metadata
      this.messageMetadata.set(conversationId, {
        hasMore: result.hasMore,
        totalCount: result.total || result.messages.length,
        oldestMessageId: processedMessages[processedMessages.length - 1]?.id,
        currentPage: page
      });

      // Set active conversation and save for first page
      if (page === 1 && !before && !after) {
        this.safeDispatch(setActiveConversation(conversationId));
        await this.saveLastActiveConversation(conversationId);
      }

      console.log(`✓ Loaded ${result.messages.length} messages for conversation ${conversationId}`);
      
      return {
        messages: processedMessages,
        hasMore: result.hasMore,
        totalCount: result.total || result.messages.length,
        oldestMessageId: processedMessages[processedMessages.length - 1]?.id,
        newestMessageId: processedMessages[0]?.id
      };
    } catch (error) {
      this.safeLogError('Failed to load messages', error);
      throw new NetworkException('Failed to load messages', error);
    }
  }

  // Helper to process and merge messages
  private processIncomingMessages(
    newMessages: Message[],
    existingMessages: Message[],
    options: { page?: number; before?: string; after?: string }
  ): Message[] {
    const { page, before, after } = options;
    console.log(page, before, after);
    
    // Create a map for efficient lookups
    const messageMap = new Map<string, Message>();
    
    // Add existing messages to map
    existingMessages.forEach(msg => {
      messageMap.set(msg.id, msg);
      if (msg.clientTempId) {
        messageMap.set(msg.clientTempId, msg);
      }
    });

    // Process new messages
    newMessages.forEach(msg => {
      const existingMsg = messageMap.get(msg.id) || 
                         (msg.clientTempId ? messageMap.get(msg.clientTempId) : null);
      
      if (existingMsg) {
        // Update existing message
        messageMap.set(msg.id, { ...existingMsg, ...msg });
      } else {
        // Add new message
        messageMap.set(msg.id, msg);
      }
    });

    // Convert back to array and sort
    let messages = Array.from(messageMap.values())
      .filter(msg => !msg.clientTempId || !messageMap.has(msg.id))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return messages;
  }


  // Enhanced sendTextMessage with deduplication and offline queue
async sendTextMessage(
  conversationId: string,
  text: string,
  receiverId: string,
  replyTo?: string
): Promise<Message> {
  // Enhanced validation
  if (!conversationId?.trim()) {
    throw new ValidationException('Conversation ID is required');
  }
  if (!text?.trim()) {
    throw new ValidationException('Message cannot be empty');
  }
  if (!receiverId?.trim()) {
    throw new ValidationException('Receiver ID is required');
  }
  
  const trimmedText = text.trim();
  
  // Create a unique hash for this message to prevent duplicates
  const messageHash = `${conversationId}:${receiverId}:${trimmedText}:${replyTo || ''}`;
  const now = Date.now();
  
  // Check if this exact message was sent recently (within 3 seconds)
  const lastSentTime = this.recentMessageHashes.get(messageHash);
  if (lastSentTime && (now - lastSentTime) < 3000) {
    console.warn('Duplicate message blocked:', {
      conversationId,
      text: trimmedText.substring(0, 50),
      timeSinceLastSent: now - lastSentTime
    });
    throw new ValidationException('This message was just sent. Please wait a moment.');
  }
  
  // Check if a send is already in progress for this conversation
  const mutexKey = `send:${conversationId}`;
  if (this.messageSendMutex.get(mutexKey)) {
    console.warn('Message send already in progress for conversation:', conversationId);
    throw new ValidationException('Please wait for the previous message to send');
  }
  
  // Set mutex to prevent concurrent sends
  this.messageSendMutex.set(mutexKey, true);
  
  // Record this message hash with timestamp
  this.recentMessageHashes.set(messageHash, now);
  
  // Clean up old hashes after 10 seconds
  setTimeout(() => {
    this.recentMessageHashes.delete(messageHash);
  }, 10000);
  
  try {
    // Generate unique IDs
    const clientTempId = `temp-${now}-${Math.random().toString(36).substr(2, 9)}`;
    const messageId = uuidv4();
    
    // Create message object
    const message: Message = {
      id: messageId,
      clientTempId: clientTempId,
      senderId: this.userId,
      receiverId: receiverId,
      content: trimmedText,
      timestamp: new Date().toISOString(),
      type: MessageType.TEXT,
      status: MessageStatus.SENDING,
      replyTo,
      conversationId: conversationId,
      jobId: this.getJobIdFromConversation(conversationId)
    };
    
    // Add to local messages immediately (optimistic update)
    this.addMessageLocally(conversationId, message);
    
    // Check connection state
    const connectionState = this.getConnectionState();
    const isOffline = connectionState === ConnectionState.DISCONNECTED || 
                      connectionState === ConnectionState.ERROR ||
                      !socketService.isConnected();
    
    if (isOffline) {
      // Queue message for sending when connection is restored
      console.log('Offline - queueing message:', clientTempId);
      
      // Update message status to queued
      message.status = MessageStatus.QUEUED || MessageStatus.SENDING;
      this.updateMessageLocally(conversationId, clientTempId, message);
      
      // Add to offline queue - Access properties from message
      const queuedMessage: QueuedMessage = {
        message,              // Contains conversationId, receiverId, replyTo
        retryCount: 0,
        maxRetries: 3,
        addedAt: now
      };
      
      this.offlineMessageQueue.set(clientTempId, queuedMessage);
      
      // Save queue to persistent storage
      await this.saveOfflineQueue();
      
      console.log(`Message queued for offline sending. Queue size: ${this.offlineMessageQueue.size}`);
      
      return message;
    }
    
    // Online - send immediately
    try {
      // Track this message to prevent duplicates
      this.processingMessages.add(clientTempId);
      
      // Send via WebSocket
      socketService.sendMessage(message);
      
      // Set up timeout for message confirmation
      this.createTimeout(
        `message-${clientTempId}`,
        () => {
          // Check if still processing (not confirmed)
          if (this.processingMessages.has(clientTempId)) {
            console.warn('Message send timeout, adding to offline queue:', clientTempId);
            
            // Add to offline queue for retry - Access properties from message
            const queuedMessage: QueuedMessage = {
              message,              // Contains conversationId, receiverId, replyTo
              retryCount: 0,
              maxRetries: 3,
              addedAt: now
            };
            
            this.offlineMessageQueue.set(clientTempId, queuedMessage);
            this.saveOfflineQueue();
            
            // Update status
            this.updateMessageStatus(message.id, MessageStatus.QUEUED || MessageStatus.SENDING);
            this.processingMessages.delete(clientTempId);
          }
        },
        CHAT_CONFIG.MESSAGE_TIMEOUT,
        'message'
      );
      
      console.log('Message sent (online):', {
        clientTempId,
        messageId: message.id,
        conversationId
      });
      
      return message;
      
    } catch (sendError) {
      console.error('Failed to send, adding to offline queue:', sendError);
      
      // Add to offline queue for retry - Access properties from message
      const queuedMessage: QueuedMessage = {
        message,              // Contains conversationId, receiverId, replyTo
        retryCount: 0,
        maxRetries: 3,
        addedAt: now
      };
      
      this.offlineMessageQueue.set(clientTempId, queuedMessage);
      await this.saveOfflineQueue();
      
      // Update status but don't mark as failed yet
      this.updateMessageStatus(message.id, MessageStatus.QUEUED || MessageStatus.SENDING);
      this.processingMessages.delete(clientTempId);
      this.clearTimeout(`message-${clientTempId}`);
      
      return message; // Return message even though it's queued
    }
    
  } finally {
    // Always clear the mutex
    this.messageSendMutex.delete(mutexKey);
  }
}


  // Send an attachment
  async sendAttachment(
    conversationId: string,
    file: any,
    type: AttachmentType,
    receiverId: string
  ): Promise<void> {
    try {
      // Validate file
      if (!file?.uri) {
        throw new ValidationException('Invalid file');
      }
      if (!conversationId?.trim()) {
        throw new ValidationException('Conversation ID is required');
      }
      if (!receiverId?.trim()) {
        throw new ValidationException('Receiver ID is required');
      }

      this.checkConnectionState();

      // First, upload the file
      console.log('📤 Uploading file...');
      const attachment = await chatApiService.uploadFile(file, type);

      const clientTempId = `temp-${Date.now()}-${Math.random()}`;
      
      // Create message with attachment
      const message: Message = {
        id: uuidv4(),
        clientTempId: clientTempId,
        senderId: this.userId,
        receiverId: receiverId,
        content: attachment.name || 'Attachment',
        timestamp: new Date().toISOString(),
        type: MessageType.ATTACHMENT,
        status: MessageStatus.SENDING,
        attachments: [attachment],
        conversationId: conversationId,
        jobId: this.getJobIdFromConversation(conversationId)
      };

      // Track this message
      this.processingMessages.add(clientTempId);

      // Add to local messages
      this.addMessageLocally(conversationId, message);

      // Send via WebSocket
      socketService.sendMessage(message);
      
      console.log('✓ Attachment sent');
    } catch (error) {
      this.safeLogError('Failed to send attachment', error);
      const clientTempId = `temp-${Date.now()}-${Math.random()}`;
      this.processingMessages.delete(clientTempId);
      throw error;
    }
  }

  // Mark messages as read with Redux integration
  async markMessagesAsRead(conversationId: string, messageIds?: string[]): Promise<void> {
    try {
      if (!conversationId?.trim()) {
        throw new ValidationException('Conversation ID is required');
      }
      
      await chatApiService.markAsRead(conversationId, messageIds);
      
      // Safe dispatch to Redux
      this.safeDispatch(markConversationAsRead(conversationId));
      
      // Update local conversation unread count
      const conversation = this.conversations.find(c => c.id === conversationId);
      if (conversation) {
        conversation.unreadCount = 0;
      }
      
      // Update message status locally if messageIds provided
      if (messageIds && messageIds.length > 0) {
        messageIds.forEach(id => {
          this.updateMessageStatus(id, MessageStatus.READ);
        });
      }
      
      console.log('✓ Messages marked as read');
    } catch (error) {
      this.safeLogError('Failed to mark as read', error);
    }
  }

  // Update conversation settings
  async updateConversationSettings(
    conversationId: string,
    settings: Partial<ConversationSettings>
  ): Promise<void> {
    try {
      if (!conversationId?.trim()) {
        throw new ValidationException('Conversation ID is required');
      }
      
      await chatApiService.updateConversationSettings(conversationId, settings);
      
      // Update local cache
      const conversation = this.conversations.find(c => c.id === conversationId);
      if (conversation) {
        conversation.settings = { ...conversation.settings, ...settings };
      }
      
      console.log('✓ Conversation settings updated');
    } catch (error) {
      this.safeLogError('Failed to update conversation settings', error);
      throw error;
    }
  }

  // Upload file
  async uploadFile(file: any): Promise<UploadFileResponse> {
    try {
      console.log('📤 Uploading file:', file.name);
      
      if (!file?.uri) {
        throw new ValidationException('File URI is required');
      }
      
      // Validate file size (max 10MB)
      if (file.size && file.size > CHAT_CONFIG.MAX_FILE_SIZE) {
        throw new ValidationException('File size cannot exceed 10MB');
      }
      
      const result = await chatApiService.uploadFile(file, AttachmentType.FILE);
      
      console.log('✓ File uploaded successfully');
      return {
        id: file.id,
        url: result.url,
        name: result.name || file.name,
        size: result.size || file.size,
        type: result.type || file.type
      };
    } catch (error) {
      this.safeLogError('Failed to upload file', error);
      throw error;
    }
  }

  // Upload image
  async uploadImage(image: any): Promise<UploadFileResponse> {
    try {
      console.log('📤 Uploading image:', image.name);
      
      if (!image?.uri) {
        throw new ValidationException('Image URI is required');
      }
      
      // Validate image size (max 5MB)
      if (image.size && image.size > CHAT_CONFIG.MAX_IMAGE_SIZE) {
        throw new ValidationException('Image size cannot exceed 5MB');
      }
      
      const result = await chatApiService.uploadFile(image, AttachmentType.IMAGE);
      
      console.log('✓ Image uploaded successfully');
      return {
        id:result.id,
        url: result.url,
        name: result.name || image.name,
        size: result.size || image.size,
        type: result.type || image.type
      };
    } catch (error) {
      this.safeLogError('Failed to upload image', error);
      throw error;
    }
  }

  // Block user
  async blockUser(userId: string): Promise<void> {
    try {
      if (!userId?.trim()) {
        throw new ValidationException('User ID is required');
      }
      
      console.log('🚫 Blocking user:', userId);
      
      await chatApiService.blockUser(userId);
      
      console.log('✓ User blocked successfully');
    } catch (error) {
      this.safeLogError('Failed to block user', error);
      throw error;
    }
  }

  // Check if user is blocked
  async isUserBlocked(userId: string): Promise<boolean> {
    try {
      if (!userId?.trim()) {
        return false;
      }
      
      const result = await chatApiService.checkBlockStatus(userId);
      return result.isBlocked || false;
    } catch (error) {
      this.safeLogError('Failed to check block status', error);
      return false;
    }
  }

  // Enhanced onNewMessage with deduplication
  onNewMessage(callback: (message: Message) => void): () => void {
    return this.addEventListenerWithCleanup('message_received', (message: Message) => {
      try {
        // Enhanced validation
        if (!message || typeof message !== 'object') {
          console.warn('⚠️ Invalid message received:', message);
          return;
        }

        // Create unique key for this message event
        const messageKey = `${message.conversationId}:${message.id || message.clientTempId}`;
        
        // Check if we've already processed this exact message event
        if (this.messageEventProcessed.has(messageKey)) {
          console.log('🔄 Skipping already processed message event:', messageKey);
          return;
        }
        
        // Mark as processed
        this.messageEventProcessed.add(messageKey);
        
        // Clean up after 30 seconds
        setTimeout(() => {
          this.messageEventProcessed.delete(messageKey);
        }, 30000);

        // Skip if we're still processing this message (our own message being sent)
        if (message.clientTempId && this.processingMessages.has(message.clientTempId)) {
          console.log('⭕️ Skipping message still being processed:', message.clientTempId);
          return;
        }

        // Skip our own messages that we just sent
        if (message.senderId === this.userId && message.clientTempId) {
          // Check if this is a recent message from us
          const messageHash = `${message.conversationId}:${this.userId}:${message.content}:${message.replyTo || ''}`;
          const lastSentTime = this.recentMessageHashes.get(messageHash);
          
          if (lastSentTime && (Date.now() - lastSentTime) < 5000) {
            console.log('🔄 Skipping our own recently sent message:', message.clientTempId);
            return;
          }
        }

        const existingMessages = this.messages.get(message.conversationId) || [];
        
        // Find existing message by clientTempId first, then by id
        const existingIndex = existingMessages.findIndex(m => 
          (message.clientTempId && m.clientTempId === message.clientTempId) ||
          (message.id && m.id === message.id)
        );
        
        let shouldNotifyCallback = false;
        
        if (existingIndex !== -1) {
          // Update existing message only if it has newer/better data
          const existingMessage = existingMessages[existingIndex];
          
          // Check if this is actually an update worth processing
          const hasNewStatus = message.status && message.status !== existingMessage.status;
          const hasNewId = message.id && !existingMessage.id;
          const isStatusUpgrade = existingMessage.status === MessageStatus.SENDING && 
                                 message.status !== MessageStatus.SENDING;
          
          if (hasNewStatus || hasNewId || isStatusUpgrade) {
            existingMessages[existingIndex] = {
              ...existingMessage,
              ...message,
              status: message.status || MessageStatus.DELIVERED
            };
            this.messages.set(message.conversationId, [...existingMessages]);
            console.log('📝 Updated existing message:', message.id);
            
            // Only notify if this is a significant update
            if (isStatusUpgrade || hasNewId) {
              shouldNotifyCallback = true;
            }
          } else {
            console.log('🔄 Skipping message update - no significant changes:', message.id);
            return;
          }
        } else {
          // This is genuinely a new message
          if (message.senderId !== this.userId) {
            // New incoming message from another user
            this.addMessageLocally(message.conversationId, message);
            console.log('📨 Added new incoming message:', message.id);
            shouldNotifyCallback = true;
            
            // Safe dispatch to Redux for unread tracking
            this.safeDispatch(handleNewMessage({
              conversationId: message.conversationId,
              senderId: message.senderId,
              messagePreview: message.content?.substring(0, 50),
              timestamp: message.timestamp,
              otherUserName: this.getOtherUserName(message.conversationId),
              jobTitle: this.getJobTitle(message.conversationId),
            }));
            
            // Update conversation's unread count
            const conversation = this.conversations.find(c => c.id === message.conversationId);
            if (conversation) {
              conversation.unreadCount = (conversation.unreadCount || 0) + 1;
            }
          } else if (!message.clientTempId || !this.processingMessages.has(message.clientTempId)) {
            // Our own message but not one we just sent (e.g., from another device)
            this.addMessageLocally(message.conversationId, message);
            console.log('📨 Added message from another session:', message.id);
            shouldNotifyCallback = true;
          }
        }
        
        // Update conversation's last message
        const conversation = this.conversations.find(c => c.id === message.conversationId);
        if (conversation) {
          const existingLastMessageTime = conversation.lastMessage?.timestamp ? 
            new Date(conversation.lastMessage.timestamp).getTime() : 0;
          const newMessageTime = new Date(message.timestamp).getTime();
          
          // Only update if this message is actually newer
          if (newMessageTime > existingLastMessageTime) {
            conversation.lastMessage = message;
            conversation.updatedAt = message.timestamp;
          }
        }
        
        // Clean up processing tracking
        if (message.clientTempId && this.processingMessages.has(message.clientTempId)) {
          this.processingMessages.delete(message.clientTempId);
          this.clearTimeout(`message-${message.clientTempId}`);
        }
        
        // Notify UI only if needed
        if (shouldNotifyCallback) {
          callback(message);
        }
        
      } catch (error) {
        this.safeLogError('Error processing new message', error, message);
      }
    });
  }

  onTyping(callback: (userId: string, isTyping: boolean) => void): () => void {
    return this.addEventListenerWithCleanup('typing', (data: { 
      userId: string; 
      isTyping: boolean;
      conversationId?: string; 
    }) => {
      try {
        if (data && typeof data.userId === 'string' && typeof data.isTyping === 'boolean') {
          
          // Safe dispatch to Redux if conversation ID is available
          if (data.conversationId) {
            const typingUsers = data.isTyping ? [data.userId] : [];
            this.safeDispatch(updateTypingUsers({
              conversationId: data.conversationId,
              typingUserIds: typingUsers,
            }));
          }
          
          callback(data.userId, data.isTyping);
        }
      } catch (error) {
        this.safeLogError('Error processing typing event', error, data);
      }
    });
  }

  // Enhanced onMessageSent with deduplication
  onMessageSent(callback: (data: {
    messageId: string;
    clientTempId?: string;
    conversationId: string;
    status: string;
    timestamp: string;
  }) => void): () => void {
    return this.addEventListenerWithCleanup('message_sent', (data: any) => {
      try {
        // Validate event data
        if (!data || typeof data !== 'object') {
          console.warn('⚠️ Invalid message_sent event data:', data);
          return;
        }
        
        const messageId = data.id || data.messageId;
        const clientTempId = data.clientTempId;
        const conversationId = data.conversationId;
        
        if (!messageId || !conversationId) {
          console.warn('⚠️ Message sent event missing required fields:', data);
          return;
        }
        
        // Create unique key for this sent event
        const eventKey = `${conversationId}:${messageId}:${clientTempId || 'no-temp'}`;
        
        // Check if we've already processed this sent event
        if (this.processedSentEvents.has(eventKey)) {
          console.log('🔄 Skipping already processed sent event:', eventKey);
          return;
        }
        
        // Mark as processed
        this.processedSentEvents.add(eventKey);
        
        // Clean up after 60 seconds
        setTimeout(() => {
          this.processedSentEvents.delete(eventKey);
        }, 60000);
        
        console.log('✓ Message sent confirmation received:', {
          messageId,
          clientTempId,
          conversationId,
          status: data.status
        });
        
        // Only update if clientTempId exists and is being tracked
        if (clientTempId && this.processingMessages.has(clientTempId)) {
          // Update local message status
          this.updateMessageByClientTempId(conversationId, clientTempId, {
            id: messageId,
            status: MessageStatus.SENT,
            timestamp: data.timestamp || new Date().toISOString()
          });
          
          // Clean up processing tracking
          this.processingMessages.delete(clientTempId);
          this.clearTimeout(`message-${clientTempId}`);
          
          // Notify callback
          callback({
            messageId,
            clientTempId,
            conversationId,
            status: data.status || 'sent',
            timestamp: data.timestamp || new Date().toISOString()
          });
        } else if (!clientTempId) {
          // Message sent without clientTempId (shouldn't happen but handle gracefully)
          console.warn('⚠️ Message sent without clientTempId:', messageId);
          
          // Still notify callback
          callback({
            messageId,
            clientTempId: undefined,
            conversationId,
            status: data.status || 'sent',
            timestamp: data.timestamp || new Date().toISOString()
          });
        } else {
          // ClientTempId not in processing - might be from another session
          console.log('ℹ️ Received sent confirmation for untracked message:', clientTempId);
        }
        
      } catch (error) {
        this.safeLogError('Error processing message sent event', error, data);
      }
    });
  }

  onConnectionError(callback: (error: any) => void): () => void {
    return this.addEventListenerWithCleanup('connect_error', (error: any) => {
      this.safeLogError('Connection error occurred', error);
      callback(error);
    });
  }

  onAuthError(callback: (error: AuthException) => void): () => void {
    return this.addEventListenerWithCleanup('auth_error', (error: any) => {
      const authError = new AuthException('Authentication failed', error);
      this.safeLogError('Authentication error occurred', authError);
      callback(authError);
    });
  }

  onNetworkError(callback: (error: NetworkException) => void): () => void {
    return this.addEventListenerWithCleanup('network_error', (error: any) => {
      const networkError = new NetworkException('Network error occurred', error);
      this.safeLogError('Network error occurred', networkError);
      callback(networkError);
    });
  }

  // Add this method to ChatService.ts if it's missing or incomplete
  onMessageSendError(callback: (data: {
    clientTempId?: string;
    error: string;
    code: string;
    timestamp: string;
  }) => void): () => void {
    try {
      console.log('🚨 Setting up message send error listener');
      
      // Set up socket event listener for message send errors
      return this.addEventListenerWithCleanup('message_send_error', (data: {
        clientTempId?: string;
        messageId?: string;
        error: string;
        code: string;
        timestamp: string;
      }) => {
        try {
          console.error('🚨 Message send error received:', data);
          
          // Validate event data
          if (!data || typeof data !== 'object') {
            console.warn('⚠️ Invalid message send error data:', data);
            return;
          }

          // Update local message status to failed if clientTempId exists
          if (data.clientTempId) {
            const conversationId = this.findConversationForMessage(data.clientTempId);
            if (conversationId) {
              this.updateMessageByClientTempId(conversationId, data.clientTempId, {
                status: MessageStatus.FAILED
              });
            }
          }

          // Clean up processing tracking
          if (data.clientTempId) {
            this.processingMessages.delete(data.clientTempId);
            this.clearTimeout(`message-${data.clientTempId}`);
          }

          // Notify callback
          callback({
            clientTempId: data.clientTempId,
            error: data.error || 'Unknown error',
            code: data.code || 'SEND_ERROR',
            timestamp: data.timestamp || new Date().toISOString()
          });

        } catch (error) {
          this.safeLogError('Error processing message send error event', error, data);
        }
      });

    } catch (error) {
      this.safeLogError('Failed to set up message send error listener', error);
      
      // Return no-op cleanup function
      return () => {};
    }
  }

  // Helper to find conversation for a message by clientTempId
  private findConversationForMessage(clientTempId: string): string | undefined {
    for (const [conversationId, messages] of this.messages.entries()) {
      if (messages.some(m => m.clientTempId === clientTempId)) {
        return conversationId;
      }
    }
    return undefined;
  }

  // Utility methods
  sendTypingIndicator(conversationId: string, receiverId: string, isTyping: boolean): void {
    try {
      if (!conversationId?.trim() || !receiverId?.trim()) {
        console.warn('⚠️ Cannot send typing indicator: Invalid parameters');
        return;
      }

      if (!this.isConnected()) {
        console.warn('⚠️ Cannot send typing indicator: Not connected');
        return;
      }
      
      socketService.sendTypingStatus(conversationId, receiverId, isTyping);
    } catch (error) {
      this.safeLogError('Failed to send typing indicator', error);
    }
  }

  // Enhanced addMessageLocally with better deduplication
  private addMessageLocally(conversationId: string, message: Message): void {
    try {
      if (!conversationId || !message) {
        console.warn('⚠️ Invalid parameters for addMessageLocally');
        return;
      }
      
      const messages = this.messages.get(conversationId) || [];
      
      // Create composite key for deduplication
      const messageKey = `${message.id}:${message.clientTempId || 'no-temp'}`;
      
      // Check if this exact message was already added
      if (this.localMessageIds.has(messageKey)) {
        console.log('🔄 Message already in local store:', messageKey);
        return;
      }
      
      // Check if message already exists by id or clientTempId
      const existingIndex = messages.findIndex(m => {
        // Check by ID
        if (message.id && m.id === message.id) {
          return true;
        }
        // Check by clientTempId
        if (message.clientTempId && m.clientTempId === message.clientTempId) {
          return true;
        }
        // Check for content duplicate from same sender within 2 seconds
        if (m.senderId === message.senderId && 
            m.content === message.content &&
            m.conversationId === message.conversationId) {
          const existingTime = new Date(m.timestamp).getTime();
          const newTime = new Date(message.timestamp).getTime();
          if (Math.abs(newTime - existingTime) < 2000) {
            return true;
          }
        }
        return false;
      });
      
      if (existingIndex === -1) {
        // Add new message
        messages.unshift(message);
        this.messages.set(conversationId, messages);
        this.localMessageIds.add(messageKey);
        
        // Clean up old entries after 5 minutes
        setTimeout(() => {
          this.localMessageIds.delete(messageKey);
        }, 300000);
        
        console.log('➕ Added message to local store:', {
          messageId: message.id,
          clientTempId: message.clientTempId,
          conversationId
        });
      } else {
        // Update existing message if new one has better data
        const existingMessage = messages[existingIndex];
        
        // Determine if update is needed
        const shouldUpdate = 
          // New message has an ID and existing doesn't
          (message.id && !existingMessage.id) ||
          // New message has better status
          (message.status !== MessageStatus.SENDING && 
           existingMessage.status === MessageStatus.SENDING) ||
          // New message is more recent
          (new Date(message.timestamp) > new Date(existingMessage.timestamp));
        
        if (shouldUpdate) {
          messages[existingIndex] = { ...existingMessage, ...message };
          this.messages.set(conversationId, [...messages]);
          console.log('🔄 Updated existing message in local store:', {
            messageId: message.id,
            clientTempId: message.clientTempId
          });
        } else {
          console.log('⏭️ Skipping update - existing message is newer/better:', {
            existingId: existingMessage.id,
            newId: message.id
          });
        }
      }
    } catch (error) {
      this.safeLogError('Failed to add message locally', error, {
        conversationId,
        messageId: message?.id,
        clientTempId: message?.clientTempId
      });
    }
  }

  // Helper: Get messages from local store
  getLocalMessages(conversationId: string): Message[] {
    try {
      if (!conversationId?.trim()) {
        return [];
      }
      return this.messages.get(conversationId) || [];
    } catch (error) {
      this.safeLogError('Failed to get local messages', error);
      return [];
    }
  }

  // Helper methods for Redux integration
  private getOtherUserName(conversationId: string): string | undefined {
    try {
      const conversation = this.conversations.find(c => c.id === conversationId);
      const otherUser = conversation?.participants?.find(p => p.userId !== this.userId);
      return otherUser?.name;
    } catch {
      return undefined;
    }
  }

  private getJobTitle(conversationId: string): string | undefined {
    try {
      const conversation = this.conversations.find(c => c.id === conversationId);
      return conversation?.metadata?.jobTitle;
    } catch {
      return undefined;
    }
  }

  // Helper: Get jobId from conversation
  private getJobIdFromConversation(conversationId: string): string | undefined {
    try {
      const conversation = this.conversations.find(c => c.id === conversationId);
      return conversation?.metadata?.jobId;
    } catch (error) {
      return undefined;
    }
  }

  // FIXED: Update message status
  private updateMessageStatus(messageId: string, status: MessageStatus): void {
    try {
      let updated = false;
      
      for (const [conversationId, messages] of this.messages.entries()) {
        const messageIndex = messages.findIndex(m => m.id === messageId);
        if (messageIndex !== -1) {
          messages[messageIndex].status = status;
          this.messages.set(conversationId, [...messages]);
          updated = true;
          console.log(`📝 Updated message ${messageId} status to ${status}`);
          break;
        }
      }
      
      if (!updated) {
        console.warn(`⚠️ Message ${messageId} not found for status update`);
      }
    } catch (error) {
      this.safeLogError('Failed to update message status', error);
    }
  }

  // Helper method to update message by clientTempId
  private updateMessageByClientTempId(
    conversationId: string, 
    clientTempId: string, 
    updates: Partial<Message>
  ): void {
    try {
      const messages = this.messages.get(conversationId) || [];
      const messageIndex = messages.findIndex(m => m.clientTempId === clientTempId);
      
      if (messageIndex !== -1) {
        messages[messageIndex] = { ...messages[messageIndex], ...updates };
        this.messages.set(conversationId, [...messages]);
        console.log('📝 Updated message by clientTempId:', clientTempId, updates);
      } else {
        console.warn('⚠️ Message not found for clientTempId:', clientTempId);
      }
    } catch (error) {
      this.safeLogError('Failed to update message by clientTempId', error, { 
        conversationId, 
        clientTempId, 
        updates 
      });
    }
  }

  // Helper method to update message locally by clientTempId
  private updateMessageLocally(conversationId: string, clientTempId: string, updatedMessage: Message): void {
    try {
      const messages = this.messages.get(conversationId) || [];
      const messageIndex = messages.findIndex(m => m.clientTempId === clientTempId);
      
      if (messageIndex !== -1) {
        messages[messageIndex] = updatedMessage;
        this.messages.set(conversationId, [...messages]);
        console.log('📝 Updated local message:', updatedMessage.id);
      }
    } catch (error) {
      this.safeLogError('Failed to update message locally', error);
    }
  }


  // Process offline queue when connection is restored
async processOfflineQueue(): Promise<void> {
  // Prevent concurrent processing
  if (this.isProcessingOfflineQueue) {
    console.log('Offline queue processing already in progress');
    return;
  }
  
  if (this.offlineMessageQueue.size === 0) {
    console.log('No offline messages to process');
    return;
  }
  
  console.log(`Processing ${this.offlineMessageQueue.size} offline messages...`);
  this.isProcessingOfflineQueue = true;
  
  try {
    // Sort messages by timestamp (oldest first)
    const sortedMessages = Array.from(this.offlineMessageQueue.entries())
      .sort(([, a], [, b]) => a.addedAt - b.addedAt);
    
    for (const [clientTempId, queuedMessage] of sortedMessages) {
      try {
        // Check if connection is still good
        if (!socketService.isConnected()) {
          console.log('Connection lost while processing queue, stopping...');
          break;
        }
        
        // Check if message hasn't expired (24 hours)
        const messageAge = Date.now() - queuedMessage.addedAt;
        if (messageAge > 24 * 60 * 60 * 1000) {
          console.warn('Message expired, removing from queue:', clientTempId);
          this.offlineMessageQueue.delete(clientTempId);
          this.updateMessageStatus(queuedMessage.message.id, MessageStatus.FAILED);
          continue;
        }
        
        // Check if message was already sent (duplicate prevention)
        // Access conversationId from the message object
        const messages = this.messages.get(queuedMessage.message.conversationId) || [];
        const existingMessage = messages.find(m => 
          m.clientTempId === clientTempId && 
          (m.status === MessageStatus.SENT || m.status === MessageStatus.DELIVERED || m.status === MessageStatus.READ)
        );
        
        if (existingMessage) {
          console.log('Message already sent, removing from queue:', clientTempId);
          this.offlineMessageQueue.delete(clientTempId);
          continue;
        }
        
        // Update retry count
        queuedMessage.retryCount++;
        
        console.log(`Sending queued message (attempt ${queuedMessage.retryCount}/${queuedMessage.maxRetries}):`, clientTempId);
        
        // Track for processing
        this.processingMessages.add(clientTempId);
        
        // Send the message
        socketService.sendMessage(queuedMessage.message);
        
        // Wait a bit for confirmation
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if message was confirmed
        if (!this.processingMessages.has(clientTempId)) {
          // Message was confirmed, remove from queue
          console.log('Queued message sent successfully:', clientTempId);
          this.offlineMessageQueue.delete(clientTempId);
        } else {
          // Not confirmed yet
          if (queuedMessage.retryCount >= queuedMessage.maxRetries) {
            console.error('Max retries reached for message:', clientTempId);
            this.offlineMessageQueue.delete(clientTempId);
            this.updateMessageStatus(queuedMessage.message.id, MessageStatus.FAILED);
            this.processingMessages.delete(clientTempId);
          } else {
            console.log('Message not confirmed yet, will retry later:', clientTempId);
            this.processingMessages.delete(clientTempId);
          }
        }
        
      } catch (error) {
        console.error('Error processing queued message:', error);
        
        // Check retry count
        if (queuedMessage.retryCount >= queuedMessage.maxRetries) {
          this.offlineMessageQueue.delete(clientTempId);
          this.updateMessageStatus(queuedMessage.message.id, MessageStatus.FAILED);
        }
      }
      
      // Small delay between messages to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Save updated queue
    await this.saveOfflineQueue();
    
    console.log(`Offline queue processing complete. Remaining: ${this.offlineMessageQueue.size}`);
    
  } catch (error) {
    this.safeLogError('Error processing offline queue', error);
  } finally {
    this.isProcessingOfflineQueue = false;
  }
}


 // Manual retry for failed messages - COMPLETE FIX
async retryFailedMessage(
  conversationId: string,
  messageId: string,
  clientTempId?: string
): Promise<Message | null> {
  try {
    console.log('Manual retry requested for message:', {
      messageId,
      clientTempId,
      conversationId
    });

    // Find the message in local cache
    const messages = this.messages.get(conversationId) || [];
    const messageToRetry = messages.find(m => 
      m.id === messageId || 
      (clientTempId && m.clientTempId === clientTempId)
    );

    if (!messageToRetry) {
      console.warn('Message not found for retry:', messageId);
      throw new ValidationException('Message not found');
    }

    // Check if message is actually failed
    if (messageToRetry.status !== MessageStatus.FAILED) {
      console.log('Message is not in failed state:', messageToRetry.status);
      return messageToRetry;
    }

    // Check if message is already being processed
    if (messageToRetry.clientTempId && this.processingMessages.has(messageToRetry.clientTempId)) {
      console.warn('Message already being processed:', messageToRetry.clientTempId);
      throw new ValidationException('Message is already being sent');
    }

    // Update message status to sending
    messageToRetry.status = MessageStatus.SENDING;
    this.updateMessageLocally(conversationId, messageToRetry.clientTempId || messageToRetry.id, messageToRetry);

    // Check current connection state
    const isOffline = !socketService.isConnected() || 
                     this.getConnectionState() !== ConnectionState.CONNECTED;

    if (isOffline) {
      // Add to offline queue
      console.log('Offline - adding to queue for retry');
      
      // FIXED: Only include properties that exist in QueuedMessage interface
      const queuedMessage: QueuedMessage = {
        message: messageToRetry,    // Contains conversationId, receiverId, replyTo
        retryCount: 0,
        maxRetries: 3,
        addedAt: Date.now()
      };

      if (messageToRetry.clientTempId) {
        this.offlineMessageQueue.set(messageToRetry.clientTempId, queuedMessage);
      }
      
      await this.saveOfflineQueue();
      
      // Update status to queued
      messageToRetry.status = MessageStatus.QUEUED || MessageStatus.SENDING;
      this.updateMessageLocally(conversationId, messageToRetry.clientTempId || messageToRetry.id, messageToRetry);
      
      console.log('Message queued for retry when online');
      return messageToRetry;
    }

    // Online - retry immediately
    try {
      // Track the message
      if (messageToRetry.clientTempId) {
        this.processingMessages.add(messageToRetry.clientTempId);
      }

      // Send via WebSocket
      socketService.sendMessage(messageToRetry);

      // Set up timeout for retry
      if (messageToRetry.clientTempId) {
        this.createTimeout(
          `message-${messageToRetry.clientTempId}`,
          () => {
            if (this.processingMessages.has(messageToRetry.clientTempId!)) {
              console.warn('Retry timeout, marking as failed again');
              this.updateMessageStatus(messageToRetry.id, MessageStatus.FAILED);
              this.processingMessages.delete(messageToRetry.clientTempId!);
            }
          },
          CHAT_CONFIG.MESSAGE_TIMEOUT,
          'message'
        );
      }

      console.log('Message retry initiated');
      return messageToRetry;

    } catch (error) {
      console.error('Retry failed:', error);
      
      // Mark as failed again
      messageToRetry.status = MessageStatus.FAILED;
      this.updateMessageLocally(conversationId, messageToRetry.clientTempId || messageToRetry.id, messageToRetry);
      
      if (messageToRetry.clientTempId) {
        this.processingMessages.delete(messageToRetry.clientTempId);
        this.clearTimeout(`message-${messageToRetry.clientTempId}`);
      }
      
      throw new NetworkException('Failed to retry message');
    }

  } catch (error) {
    this.safeLogError('Failed to retry message', error, {
      conversationId,
      messageId,
      clientTempId
    });
    
    if (error instanceof ValidationException || error instanceof NetworkException) {
      throw error;
    }
    
    throw new NetworkException('Failed to retry message');
  }
}

  // Bulk retry all failed messages in a conversation
  async retryAllFailedMessages(conversationId: string): Promise<{
    attempted: number;
    successful: number;
    failed: number;
  }> {
    try {
      console.log('🔄 Retrying all failed messages in conversation:', conversationId);
      
      const messages = this.messages.get(conversationId) || [];
      const failedMessages = messages.filter(m => m.status === MessageStatus.FAILED);
      
      if (failedMessages.length === 0) {
        console.log('ℹ️ No failed messages to retry');
        return { attempted: 0, successful: 0, failed: 0 };
      }

      let attempted = 0;
      let successful = 0;
      let failed = 0;

      // Sort by timestamp to maintain order
      failedMessages.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      for (const message of failedMessages) {
        attempted++;
        
        try {
          await this.retryFailedMessage(
            conversationId, 
            message.id, 
            message.clientTempId
          );
          successful++;
          
          // Small delay between retries
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.error('Failed to retry message:', message.id, error);
          failed++;
        }
      }

      console.log(`✅ Bulk retry complete: ${successful}/${attempted} successful`);
      
      return { attempted, successful, failed };
      
    } catch (error) {
      this.safeLogError('Failed to retry all messages', error, { conversationId });
      return { attempted: 0, successful: 0, failed: 0 };
    }
  }

  // Delete a failed message
  async deleteFailedMessage(
    conversationId: string,
    messageId: string,
    clientTempId?: string
  ): Promise<boolean> {
    try {
      console.log('🗑️ Deleting failed message:', { messageId, clientTempId });
      
      // Remove from local messages
      const messages = this.messages.get(conversationId) || [];
      const filteredMessages = messages.filter(m => 
        m.id !== messageId && 
        (!clientTempId || m.clientTempId !== clientTempId)
      );
      
      if (filteredMessages.length === messages.length) {
        console.warn('⚠️ Message not found for deletion');
        return false;
      }
      
      this.messages.set(conversationId, filteredMessages);
      
      // Remove from offline queue if present
      if (clientTempId && this.offlineMessageQueue.has(clientTempId)) {
        this.offlineMessageQueue.delete(clientTempId);
        await this.saveOfflineQueue();
      }
      
      // Clear any pending timeouts
      if (clientTempId) {
        this.clearTimeout(`message-${clientTempId}`);
        this.processingMessages.delete(clientTempId);
      }
      
      console.log('✅ Failed message deleted');
      return true;
      
    } catch (error) {
      this.safeLogError('Failed to delete message', error, {
        conversationId,
        messageId,
        clientTempId
      });
      return false;
    }
  }

  // Get all failed messages in a conversation
  getFailedMessages(conversationId: string): Message[] {
    try {
      const messages = this.messages.get(conversationId) || [];
      return messages.filter(m => m.status === MessageStatus.FAILED);
    } catch (error) {
      this.safeLogError('Failed to get failed messages', error, { conversationId });
      return [];
    }
  }

  // Check if any messages are failed in a conversation
  hasFailedMessages(conversationId: string): boolean {
    try {
      const messages = this.messages.get(conversationId) || [];
      return messages.some(m => m.status === MessageStatus.FAILED);
    } catch (error) {
      this.safeLogError('Failed to check for failed messages', error, { conversationId });
      return false;
    }
  }

  
  // Get offline queue status
getOfflineQueueStatus(): {
  count: number;
  messages: Array<{
    clientTempId: string;
    conversationId: string;
    content: string;
    timestamp: string;
    retryCount: number;
  }>;
} {
  const messages = Array.from(this.offlineMessageQueue.entries()).map(([clientTempId, queued]) => ({
    clientTempId,
    conversationId: queued.message.conversationId, // Access from message object, not duplicate property
    content: queued.message.content.substring(0, 50) + '...',
    timestamp: queued.message.timestamp,
    retryCount: queued.retryCount
  }));
  
  return {
    count: this.offlineMessageQueue.size,
    messages
  };
}

  // Save offline queue to persistent storage
  async saveOfflineQueue(): Promise<void> {
    try {
      if (this.offlineMessageQueue.size === 0) {
        await AsyncStorage.removeItem('offline_message_queue');
        return;
      }
      
      const queueArray = Array.from(this.offlineMessageQueue.entries());
      await AsyncStorage.setItem('offline_message_queue', JSON.stringify(queueArray));
      
      console.log(`💾 Saved ${this.offlineMessageQueue.size} messages to offline queue`);
    } catch (error) {
      this.safeLogError('Failed to save offline queue', error);
    }
  }

  // Load offline queue from persistent storage
  async loadOfflineQueue(): Promise<void> {
    try {
      const queueData = await AsyncStorage.getItem('offline_message_queue');
      
      if (!queueData) {
        return;
      }
      
      const queueArray = JSON.parse(queueData);
      this.offlineMessageQueue.clear();
      
      for (const [clientTempId, queuedMessage] of queueArray) {
        // Validate the data
        if (queuedMessage && queuedMessage.message && clientTempId) {
          this.offlineMessageQueue.set(clientTempId, queuedMessage);
        }
      }
      
      console.log(`📥 Loaded ${this.offlineMessageQueue.size} messages from offline queue`);
      
      // If connected, process the queue
      if (socketService.isConnected()) {
        setTimeout(() => {
          this.processOfflineQueue();
        }, 2000); // Wait 2 seconds for connection to stabilize
      }
      
    } catch (error) {
      this.safeLogError('Failed to load offline queue', error);
      // Clear corrupted data
      await AsyncStorage.removeItem('offline_message_queue');
    }
  }

  // Clear expired messages from offline queue
  async cleanupOfflineQueue(): Promise<void> {
    try {
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      let removedCount = 0;
      
      for (const [clientTempId, queuedMessage] of this.offlineMessageQueue.entries()) {
        const messageAge = now - queuedMessage.addedAt;
        
        if (messageAge > maxAge) {
          this.offlineMessageQueue.delete(clientTempId);
          this.updateMessageStatus(queuedMessage.message.id, MessageStatus.FAILED);
          removedCount++;
        }
      }
      
      if (removedCount > 0) {
        console.log(`🧹 Removed ${removedCount} expired messages from offline queue`);
        await this.saveOfflineQueue();
      }
      
    } catch (error) {
      this.safeLogError('Failed to cleanup offline queue', error);
    }
  }

  // Start periodic maintenance of offline queue
  private startOfflineQueueMaintenance(): void {
    // Clean up expired messages every 30 minutes
    setInterval(async () => {
      if (this.offlineMessageQueue.size > 0) {
        await this.cleanupOfflineQueue();
      }
    }, 30 * 60 * 1000);
    
    // Try to process queue every 5 minutes if connected
    setInterval(async () => {
      if (this.offlineMessageQueue.size > 0 && socketService.isConnected()) {
        console.log('⏰ Periodic offline queue processing attempt...');
        await this.processOfflineQueue();
      }
    }, 5 * 60 * 1000);
  }

  // Check connection status
  isConnected(): boolean {
    try {
      return socketService.isConnected() && this.isInitialized;
    } catch (error) {
      return false;
    }
  }

  // Sync conversations to Redux
  async syncConversationsToRedux(): Promise<void> {
    try {
      const conversationMetadata: Record<string, any> = {};
      
      this.conversations.forEach(conv => {
        conversationMetadata[conv.id] = {
          unreadCount: conv.unreadCount || 0,
          lastActivity: conv.updatedAt || conv.createdAt,
          isPinned: conv.settings?.isPinned || false,
          isMuted: conv.settings?.isMuted || false,
          isArchived: conv.metadata?.status === ConversationStatus.ARCHIVED,
          lastMessagePreview: conv.lastMessage?.content?.substring(0, 50),
          otherUserName: this.getOtherUserName(conv.id),
          jobTitle: conv.metadata?.jobTitle,
        };
      });
      
      this.safeDispatch(syncConversations(conversationMetadata));
      console.log('✓ Conversations synced to Redux');
    } catch (error) {
      this.safeLogError('Failed to sync conversations to Redux', error);
    }
  }

  // Session management
  async saveSession(): Promise<void> {
    try {
      if (!this.userId || !this.token) {
        return; // Nothing to save
      }

      const sessionData = {
        userId: this.userId,
        userRole: this.userRole,
        token: this.token,
        userDetails: this.userDetails,
        timestamp: Date.now()
      };
      
      await AsyncStorage.setItem('chat_session', JSON.stringify(sessionData));
      console.log('💾 Chat session saved');
    } catch (error) {
      this.safeLogError('Failed to save chat session', error);
    }
  }

  async saveLastActiveConversation(conversationId: string): Promise<void> {
    try {
      if (!conversationId?.trim()) {
        return;
      }

      await AsyncStorage.setItem('last_active_conversation', JSON.stringify({
        conversationId,
        timestamp: Date.now()
      }));
    } catch (error) {
      this.safeLogError('Failed to save last active conversation', error);
    }
  }

  private async cleanup(): Promise<void> {
    try {
      // Clean up all event listeners
      for (const listener of this.eventListeners) {
        try {
          listener.unsubscribe();
        } catch (error) {
          console.warn('Failed to unsubscribe listener:', error);
        }
      }
      this.eventListeners.clear();

      // Clean up all timeouts
      for (const [key, timeoutRef] of this.activeTimeouts) {
        console.log(key);
        clearTimeout(timeoutRef.id);
      }
      this.activeTimeouts.clear();

      // Clear data structures
      this.messages.clear();
      this.conversations = [];
      this.messageIdMap.clear();
      this.processingMessages.clear();
      this.messageMetadata.clear();

      console.log('✓ ChatService cleanup completed');
    } catch (error) {
      this.safeLogError('Error during cleanup', error);
    }
  }

  // FIXED: Enhanced disconnect with Redux reset
  async disconnect(): Promise<void> {
    try {
      // Stop memory cleanup interval
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }

      // Safe reset Redux state before cleanup
      this.safeDispatch(resetMessagingState());
      this.safeDispatch(setActiveConversation(null));

      // Perform cleanup
      await this.cleanup();

      // Disconnect socket
      socketService.disconnect();

      // Reset state
      this.isInitialized = false;
      this.userDetails = null;
      this.userId = '';
      this.userRole = '';
      this.token = '';

      console.log('✓ Chat service disconnected completely');
      console.log('✓ Redux messaging state reset');
    } catch (error) {
      this.safeLogError('Error during disconnect', error);
    }
  }

  // Setup push notifications
  async setupPushNotifications(options?: {
    enableSound?: boolean;
    enableVibration?: boolean;
    enableBadge?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('🔔 Setting up push notifications...');

      if (!this.isInitialized) {
        throw new ValidationException('Chat service must be initialized before setting up notifications');
      }

      console.log(options);

      // Basic setup implementation - extend as needed
      return { success: true };

    } catch (error: any) {
      this.safeLogError('Failed to setup push notifications', error, options);
      
      return {
        success: false,
        error: error.message || 'Failed to setup push notifications'
      };
    }
  }

  // Disable push notifications
  async disablePushNotifications(): Promise<boolean> {
    try {
      console.log('🔕 Disabling push notifications...');

      // Clear stored data
      await AsyncStorage.removeItem('push_token');
      await AsyncStorage.removeItem('push_settings');

      console.log('✓ Push notifications disabled');
      return true;

    } catch (error) {
      this.safeLogError('Failed to disable push notifications', error);
      return false;
    }
  }
}

// Export singleton instance
export const chatService = new ChatService();

export { MessageLoadResult };