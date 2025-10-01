// src/services/implementations/SocketService.ts - Final Complete Version with Online Users
import io, { Socket } from 'socket.io-client';
import { Attachment, AttachmentType, Message, MessageStatus, MessageType, OnlineUser } from '../../types/chat';
import { AppConfig, SocketConfig, AppLogger } from '../../config/AppConfig';
import { IRealtimeService } from '../interfaces';

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

type MessageCallback = (message: Message) => void;
type MessageSentCallback = (data: any) => void;
type MessageErrorCallback = (error: any) => void;
type TypingCallback = (data: any) => void;
type UserStatusCallback = (data: any) => void;
type ConnectionCallback = (state: ConnectionState) => void;
type OnlineUsersCallback = (users: OnlineUser[]) => void;
type SocketCallback = (...args: any[]) => void;

interface TrackedListener {
  event: string;
  callback: SocketCallback;
  originalCallback: SocketCallback;
  timestamp: number;
}

class SocketService implements IRealtimeService {
  private socket: Socket | null = null;
  private readonly serverUrl: string;
  private userId: string | null = null;
  private listeners: Map<string, TrackedListener[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private isConnecting: boolean = false;
  private connectionPromise: Promise<void> | null = null;
  
  // Online users tracking
  private onlineUsers: Map<string, OnlineUser> = new Map();
  private onlineUsersCallbacks: OnlineUsersCallback[] = [];
  
  // Memory leak prevention
  private listenerIdCounter = 0;
  private activeListeners = new Map<string, TrackedListener>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly MAX_LISTENER_AGE = 60 * 60 * 1000; // 1 hour
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.serverUrl = SocketConfig.url;
    this.maxReconnectAttempts = SocketConfig.reconnectionAttempts || 5;
    
    AppLogger.info('SocketService initialized', {
      serverUrl: this.serverUrl,
      environment: AppConfig.environment,
      maxReconnectAttempts: this.maxReconnectAttempts
    });
    
    this.startPeriodicCleanup();
  }

  // ==========================================
  // ONLINE USERS METHODS
  // ==========================================

  /**
   * Request all online users from server
   */
  getAllOnlineUsers(): void {
    if (!this.socket?.connected) {
      AppLogger.warn('Cannot get online users: Socket not connected');
      return;
    }
    
    AppLogger.debug('Requesting all online users');
    this.socket.emit('get_all_online_users');
  }

  /**
   * Get online users from local cache (synchronous)
   */
  getOnlineUsersSync(): OnlineUser[] {
    return Array.from(this.onlineUsers.values());
  }

  /**
   * Check if specific user is online
   */
  isUserOnline(userId: string): boolean {
    return this.onlineUsers.has(userId);
  }

  /**
   * Get count of online users
   */
  getOnlineCount(): number {
    return this.onlineUsers.size;
  }

  /**
   * Subscribe to online users updates
   */
  onOnlineUsersUpdate(callback: OnlineUsersCallback): () => void {
    this.onlineUsersCallbacks.push(callback);
    
    // Immediately call with current users if we have any
    if (this.onlineUsers.size > 0) {
      callback(this.getOnlineUsersSync());
    }
    
    return () => {
      const index = this.onlineUsersCallbacks.indexOf(callback);
      if (index > -1) {
        this.onlineUsersCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Notify all subscribers of online users update
   */
  private notifyOnlineUsersUpdate(): void {
    const users = this.getOnlineUsersSync();
    this.onlineUsersCallbacks.forEach(callback => {
      try {
        callback(users);
      } catch (error) {
        AppLogger.error('Error in online users callback:', error);
      }
    });
  }

  // ==========================================
  // CONNECTION MANAGEMENT
  // ==========================================

  async connect(userId: string, token: string): Promise<void> {
    if (this.socket?.connected && this.userId === userId) {
      AppLogger.info('Already connected with same userId');
      return;
    }

    if (this.connectionPromise) {
      AppLogger.info('Connection already in progress, returning existing promise');
      return this.connectionPromise;
    }

    if (this.socket && this.userId !== userId) {
      AppLogger.info('Different user detected, disconnecting previous socket...');
      this.disconnect();
    }

    this.userId = userId;
    this.reconnectAttempts = 0;
    this.isConnecting = true;
    this.setConnectionState(ConnectionState.CONNECTING);

    this.connectionPromise = this.createConnection(userId, token);
    
    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  disconnect(): void {
    if (this.socket) {
      AppLogger.info('Disconnecting socket...');
      
      // Clean up all listeners first
      this.removeAllListeners();
      
      // Remove socket event listeners
      this.socket.removeAllListeners();
      
      // Disconnect socket
      this.socket.disconnect();
      this.socket = null;
      
      // Reset state
      this.userId = null;
      this.isConnecting = false;
      this.connectionPromise = null;
      this.setConnectionState(ConnectionState.DISCONNECTED);
      
      // Clear online users
      this.onlineUsers.clear();
      this.notifyOnlineUsersUpdate();
      
      // Stop cleanup timer
      this.stopPeriodicCleanup();
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  getConnectionStateEnum(): ConnectionState {
    return this.connectionState;
  }

  // ==========================================
  // MESSAGE OPERATIONS
  // ==========================================

  sendMessage(message: Message): void {
    if (!this.socket || !this.userId || !this.socket.connected) {
      throw new Error('Socket not connected');
    }

    const socketMessage = this.transformOutgoingMessage(message);
    
    try {
      this.socket.emit('send_message', socketMessage, (response: any) => {
        if (SocketConfig.enableLogging) {
          AppLogger.info('Message acknowledgment received:', response);
        }
      });
    } catch (error) {
      AppLogger.error('Failed to emit message:', error);
      throw error;
    }
  }

  sendTypingIndicator(conversationId: string, receiverId: string, isTyping: boolean): void {
    this.sendTypingStatus(conversationId, receiverId, isTyping);
  }

  sendTypingStatus(conversationId: string, receiverId: string, isTyping: boolean): void {
    if (!this.socket?.connected || !this.userId) {
      AppLogger.error('Cannot send typing status: Socket not connected');
      return;
    }

    const typingData = {
      conversationId: conversationId.toString(),
      userId: this.userId.toString(),
      receiverId: receiverId.toString(),
      isTyping: Boolean(isTyping),
      timestamp: Date.now()
    };

    try {
      this.socket.emit('typing', typingData);
    } catch (error) {
      AppLogger.error('Failed to send typing status:', error);
    }
  }

  markMessagesAsRead(messageIds: string[], conversationId: string): void {
    if (!this.socket?.connected || !this.userId) {
      AppLogger.error('Cannot mark as read: Socket not connected');
      return;
    }

    this.socket.emit('mark_read', {
      messageIds,
      conversationId,
      userId: this.userId
    });
  }

  // ==========================================
  // EVENT SUBSCRIPTIONS
  // ==========================================

  onMessage(callback: MessageCallback): () => void {
    return this.on('message_received', callback);
  }

  onMessageSent(callback: MessageSentCallback): () => void {
    return this.on('message_sent', callback);
  }

  onMessageError(callback: MessageErrorCallback): () => void {
    return this.on('message_send_error', callback);
  }

  onTyping(callback: TypingCallback): () => void {
    return this.on('typing', (data: any) => {
      callback({
        userId: data.userId,
        conversationId: data.conversationId,
        isTyping: data.isTyping
      });
    });
  }

  onUserStatus(callback: UserStatusCallback): () => void {
    return this.on('user_status', (userId: string, isOnline: boolean, lastSeen?: string) => {
      callback({ userId, isOnline, lastSeen });
    });
  }

  onConnectionChange(callback: ConnectionCallback): () => void {
    return this.on('connection_state_change', callback);
  }

  on(event: string, callback: SocketCallback): () => void {
    const listenerId = `${event}_${++this.listenerIdCounter}_${Date.now()}`;
    
    const trackedListener: TrackedListener = {
      event,
      callback,
      originalCallback: callback,
      timestamp: Date.now()
    };
    
    this.activeListeners.set(listenerId, trackedListener);
    
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(trackedListener);
    
    if (SocketConfig.enableLogging) {
      AppLogger.info(`Listener added for event: ${event} (ID: ${listenerId})`);
    }
    
    return () => {
      this.removeListener(listenerId, event);
    };
  }

  // ==========================================
  // PRIVATE CONNECTION METHODS
  // ==========================================

  private async createConnection(userId: string, token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        AppLogger.info("Connecting to socket server", {
          serverUrl: this.serverUrl,
          userId,
          hasToken: !!token
        });

        if (this.socket) {
          this.socket.removeAllListeners();
          this.socket.disconnect();
          this.socket = null;
        }

        const socketOptions = this.buildSocketOptions(userId, token);
        this.socket = io(this.serverUrl, socketOptions);

        const connectionTimeout = setTimeout(() => {
          if (!this.socket?.connected) {
            AppLogger.error(`Connection timeout after ${SocketConfig.timeout}ms`);
            this.socket?.disconnect();
            this.setConnectionState(ConnectionState.ERROR);
            reject(new Error('Connection timeout'));
          }
        }, SocketConfig.timeout);

        this.setupSocketEventHandlers(connectionTimeout, resolve, reject);
        this.setupMessageHandlers();
        this.setupOnlineUsersHandlers();

      } catch (error) {
        AppLogger.error('Socket setup error:', error);
        this.isConnecting = false;
        this.setConnectionState(ConnectionState.ERROR);
        reject(error);
      }
    });
  }

  private buildSocketOptions(userId: string, token: string): any {
    return {
      forceNew: SocketConfig.forceNew,
      multiplex: true,
      transports: SocketConfig.transports as ('polling' | 'websocket')[],
      upgrade: true,
      rememberUpgrade: true,
      path: SocketConfig.path,
      autoConnect: SocketConfig.autoConnect,
      reconnection: SocketConfig.reconnection,
      reconnectionAttempts: SocketConfig.reconnectionAttempts,
      reconnectionDelay: SocketConfig.reconnectionDelay,
      reconnectionDelayMax: SocketConfig.reconnectionDelayMax,
      randomizationFactor: 0.5,
      timeout: SocketConfig.timeout,
      auth: { token, userId },
      query: {
        userId,
        platform: 'react-native',
        version: '1.0.0',
        environment: AppConfig.environment
      }
    };
  }

  private setupSocketEventHandlers(
    connectionTimeout: NodeJS.Timeout,
    resolve: () => void,
    reject: (error: any) => void
  ): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      AppLogger.info('Socket connected successfully!');
      clearTimeout(connectionTimeout);
      this.reconnectAttempts = 0;
      this.isConnecting = false;
      this.setConnectionState(ConnectionState.CONNECTED);
      this.emit('connection_change', true);
      
      // Request online users after connection
      this.getAllOnlineUsers();
      
      resolve();
    });

    this.socket.on('disconnect', (reason) => {
      AppLogger.info('Socket disconnected', { reason });
      clearTimeout(connectionTimeout);
      this.setConnectionState(ConnectionState.DISCONNECTED);
      this.emit('connection_change', false);
      
      // Clear online users on disconnect
      this.onlineUsers.clear();
      this.notifyOnlineUsersUpdate();
    });

    this.socket.on('connect_error', (error: any) => {
      AppLogger.error("Connection error", error);
      clearTimeout(connectionTimeout);
      this.reconnectAttempts++;
      
      if (this.socket?.active) {
        this.setConnectionState(ConnectionState.RECONNECTING);
      } else {
        this.isConnecting = false;
        this.setConnectionState(ConnectionState.ERROR);
        this.emit('connection_change', false);
        reject(error);
      }
    });

    this.socket.on('reconnect', (attemptNumber) => {
      AppLogger.info(`Reconnected successfully after ${attemptNumber} attempts`);
      this.setConnectionState(ConnectionState.CONNECTED);
      this.emit('connection_change', true);
      
      // Request online users after reconnection
      this.getAllOnlineUsers();
    });
  }

  private setupMessageHandlers(): void {
    if (!this.socket) return;

    this.socket.on('message_sent', (data) => {
      this.emit('message_sent', data);
    });

    this.socket.on('message_send_error', (data) => {
      this.emit('message_send_error', data);
    });

    this.socket.on('new_message', (data) => {
      const message = this.transformIncomingMessage(data);
      this.emit('message_received', message);
    });

    this.socket.on('user_typing', (data) => {
      this.emit('typing', data);
    });

    this.socket.on('user_online', (data) => {
      this.emit('user_status', data.id, true);
    });

    this.socket.on('user_offline', (data) => {
      this.emit('user_status', data.id, false);
    });
  }

  private setupOnlineUsersHandlers(): void {
    if (!this.socket) return;

    // Initial data with online users list
    this.socket.on('initial_data', (data: any) => {
      AppLogger.info('Initial data received', { 
        hasOnlineUsers: !!data.onlineUsers,
        count: data.onlineUsers?.length || 0
      });
      
      if (data.onlineUsers && Array.isArray(data.onlineUsers)) {
        this.onlineUsers.clear();
        data.onlineUsers.forEach((user: OnlineUser) => {
          this.onlineUsers.set(user.id, user);
        });
        AppLogger.info(`Loaded ${this.onlineUsers.size} online users from initial data`);
        this.notifyOnlineUsersUpdate();
      }
    });

    // User comes online
    this.socket.on('user_online', (data: any) => {
      const user: OnlineUser = {
        id: data.id,
        name: data.name,
        avatar: data.avatar,
        isOnline: true,
        lastSeen: data.lastSeen,
        role: data.role,
        status: data.status
      };
      
      this.onlineUsers.set(user.id, user);
      AppLogger.debug(`User ${user.name} (${user.id}) came online`);
      this.notifyOnlineUsersUpdate();
    });

    // User goes offline
    this.socket.on('user_offline', (data: any) => {
      const userId = data.id;
      const userName = data.name || this.onlineUsers.get(userId)?.name || 'Unknown';
      
      this.onlineUsers.delete(userId);
      AppLogger.debug(`User ${userName} (${userId}) went offline`);
      this.notifyOnlineUsersUpdate();
    });

    // Response to get_all_online_users
    this.socket.on('all_online_users', (data: any) => {
      AppLogger.info(`Received all_online_users response: ${data.count} users`);
      
      this.onlineUsers.clear();
      if (data.users && Array.isArray(data.users)) {
        data.users.forEach((user: OnlineUser) => {
          this.onlineUsers.set(user.id, user);
        });
      }
      this.notifyOnlineUsersUpdate();
    });
  }

  // ==========================================
  // PRIVATE HELPER METHODS
  // ==========================================

  private setConnectionState(state: ConnectionState): void {
    const previousState = this.connectionState;
    this.connectionState = state;
    if (previousState !== state) {
      AppLogger.info(`Connection state changed: ${previousState} -> ${state}`);
      this.emit('connection_state_change', state);
    }
  }

  private emit(event: string, ...args: any[]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(listener => {
        try {
          listener.callback(...args);
        } catch (error) {
          AppLogger.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  private removeListener(listenerId: string, event: string): void {
    this.activeListeners.delete(listenerId);
    
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.findIndex(l => 
        l.timestamp.toString() === listenerId.split('_')[2]
      );
      if (index > -1) {
        callbacks.splice(index, 1);
        if (callbacks.length === 0) {
          this.listeners.delete(event);
        }
      }
    }
    
    if (SocketConfig.enableLogging) {
      AppLogger.info(`Listener removed: ${listenerId}`);
    }
  }

  private removeAllListeners(): void {
    this.activeListeners.clear();
    this.listeners.clear();
    this.onlineUsersCallbacks = [];
    AppLogger.info('All listeners removed');
  }

  private startPeriodicCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleListeners();
    }, this.CLEANUP_INTERVAL);
  }

  private stopPeriodicCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private cleanupStaleListeners(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [id, listener] of this.activeListeners.entries()) {
      if (now - listener.timestamp > this.MAX_LISTENER_AGE) {
        this.removeListener(id, listener.event);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      AppLogger.info(`Cleaned up ${cleaned} stale listeners`);
    }
  }

  // ==========================================
  // MESSAGE TRANSFORMATION
  // ==========================================

  private transformOutgoingMessage(message: Message): any {
    return {
      clientTempId: message.clientTempId,
      conversationId: message.conversationId,
      jobId: message.jobId,
      receiverId: message.receiverId,
      textMsg: message.content,
      messageType: message.type || 'text',
      messageImages: message.attachments?.filter(att => att.type === 'image')?.map(att => att.url) || [],
      audioFile: message.attachments?.find(att => att.type === 'audio')?.url || '',
      attachments: message.attachments || [],
      replyToMessageId: message.replyTo
    };
  }

  private transformIncomingMessage(data: any): Message {
    return {
      id: data.id || data.messageId,
      senderId: data.senderId || data.sender?.id,
      receiverId: data.receiverId,
      content: data.content?.text || data.textMsg || '',
      timestamp: data.createdAt || data.timestamp,
      type: data.type || MessageType.TEXT,
      status: data.status || MessageStatus.DELIVERED,
      replyTo: data.content?.replyTo || data.replyToMessageId,
      attachments: this.transformAttachments(data.content),
      conversationId: data.conversationId,
      jobId: data.jobId,
      isEdited: data.content?.edited || false,
      editedAt: data.content?.editedAt
    };
  }

  private transformAttachments(content: any): Attachment[] {
    if (!content) return [];
    const attachments: Attachment[] = [];

    if (content.images?.length) {
      content.images.forEach((url: string, index: number) => {
        attachments.push({
          id: `img-${index}`,
          type: AttachmentType.IMAGE,
          url,
          name: `image-${index}`,
          size: 0
        });
      });
    }

    if (content.audio) {
      attachments.push({
        id: 'audio-0',
        type: AttachmentType.AUDIO,
        url: content.audio,
        name: 'audio',
        size: 0
      });
    }

    return attachments;
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  getSocketId(): string | null {
    return this.socket?.id || null;
  }

  getListenerCount(): { total: number; byEvent: Record<string, number> } {
    const byEvent: Record<string, number> = {};
    for (const [event, listeners] of this.listeners.entries()) {
      byEvent[event] = listeners.length;
    }
    return {
      total: this.activeListeners.size,
      byEvent
    };
  }
}

export const socketService = new SocketService();