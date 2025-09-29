// SocketService.ts - Enhanced with proper types and memory leak prevention
import io, { Socket } from 'socket.io-client';
import { Attachment, AttachmentType, Message, MessageStatus, MessageType } from '../../types/chat';
import { AppConfig, SocketConfig, AppLogger } from '../../config/AppConfig';
import { IRealtimeService } from '../interfaces';

// Typed event callbacks
type MessageCallback = (message: Message) => void;
type MessageSentCallback = (data: {
  messageId: string;
  clientTempId?: string;
  conversationId: string;
  status: string;
  timestamp?: string;
}) => void;
type MessageErrorCallback = (error: any) => void;
type TypingCallback = (data: {
  userId: string;
  conversationId: string;
  isTyping: boolean;
}) => void;
type UserStatusCallback = (data: {
  userId: string;
  isOnline: boolean;
  lastSeen?: string;
}) => void;
type ConnectionCallback = (state: ConnectionState) => void;
type SocketCallback = (...args: any[]) => void;

// Connection state enum for clearer state management
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

// Event listener tracking for memory management
interface TrackedListener {
  event: string;
  callback: SocketCallback;
  originalCallback: SocketCallback; // Keep reference to original for removal
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
    
    // Start periodic cleanup to prevent memory leaks
    this.startPeriodicCleanup();
  }

  // IRealtimeService Implementation

  async connect(userId: string, token: string): Promise<void> {
    if (this.socket?.connected && this.userId === userId) {
      AppLogger.info('Already connected with same userId');
      return Promise.resolve();
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
    
    // Clear promise when done
    this.connectionPromise.finally(() => {
      this.connectionPromise = null;
    });

    return this.connectionPromise;
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

  // Message operations
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

  // Enhanced event subscription with memory leak prevention

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

  // Enhanced listener management with memory leak prevention
  on(event: string, callback: SocketCallback): () => void {
    const listenerId = `${event}_${++this.listenerIdCounter}_${Date.now()}`;
    
    const trackedListener: TrackedListener = {
      event,
      callback,
      originalCallback: callback,
      timestamp: Date.now()
    };
    
    // Store in tracked listeners
    this.activeListeners.set(listenerId, trackedListener);
    
    // Add to event-specific list
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(trackedListener);
    
    if (SocketConfig.enableLogging) {
      AppLogger.info(`Listener added for event: ${event} (ID: ${listenerId})`);
    }
    
    // Return unsubscribe function
    return () => {
      this.removeListener(listenerId, event);
    };
  }

  // Private methods

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
      resolve();
    });

    this.socket.on('disconnect', (reason) => {
      AppLogger.info('Socket disconnected', { reason });
      clearTimeout(connectionTimeout);
      this.setConnectionState(ConnectionState.DISCONNECTED);
      this.emit('connection_change', false);
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
    // Remove from active listeners
    this.activeListeners.delete(listenerId);
    
    // Remove from event-specific list
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
    AppLogger.info('All listeners removed');
  }

  // Memory leak prevention methods

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

  // Message transformation methods

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

  // Utility methods

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
