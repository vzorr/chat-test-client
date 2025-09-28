// SocketService.ts - Updated to use AppConfig
import io, { Socket } from 'socket.io-client';
import { Attachment, AttachmentType, Message, MessageStatus, MessageType } from '../types/chat';
import { AppConfig, SocketConfig, AppLogger } from '../config/AppConfig'; // Updated imports

type SocketCallback = (...args: any[]) => void;

// Connection state enum for clearer state management
enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

class SocketService {
  private socket: Socket | null = null;
  private readonly serverUrl: string;
  private userId: string | null = null;
  private listeners: Map<string, SocketCallback[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;

  // New properties for connection state tracking
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private isConnecting: boolean = false;
  private connectionPromise: Promise<void> | null = null;

  constructor() {
    this.serverUrl = SocketConfig.url;
    this.maxReconnectAttempts = SocketConfig.reconnectionAttempts || 5;
    
    AppLogger.info('SocketService initialized', {
      serverUrl: this.serverUrl,
      environment: AppConfig.environment,
      maxReconnectAttempts: this.maxReconnectAttempts
    });
  }

  // Connect to socket server with environment-aware configuration
  async connect(userId: string, token: string): Promise<void> {
    // Check if already connected with same userId
    if (this.socket?.connected && this.userId === userId) {
      AppLogger.info('Already connected with same userId');
      return Promise.resolve();
    }

    // If connection is in progress, return the existing promise
    if (this.connectionPromise) {
      AppLogger.info('Connection already in progress, returning existing promise');
      return this.connectionPromise;
    }

    // Check if socket exists but with different userId - disconnect first
    if (this.socket && this.userId !== userId) {
      AppLogger.info('Different user detected, disconnecting previous socket...');
      this.disconnect();
    }

    this.userId = userId;
    this.reconnectAttempts = 0;
    this.isConnecting = true;
    this.setConnectionState(ConnectionState.CONNECTING);

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        AppLogger.info("Connecting to socket server", {
          serverUrl: this.serverUrl,
          userId,
          hasToken: !!token,
          environment: AppConfig.environment,
          socketPath: SocketConfig.path,
          timestamp: new Date().toISOString()
        });

        // Clean up existing socket if any
        if (this.socket) {
          AppLogger.info('Cleaning up existing socket before creating new one');
          this.socket.removeAllListeners();
          this.socket.disconnect();
          this.socket = null;
        }

        // Create socket with environment-specific configuration based on v4 docs
        const socketOptions = {
          // IO factory options
          forceNew: SocketConfig.forceNew,
          multiplex: true, // Default but explicit

          // Low-level engine options
          transports: SocketConfig.transports as ('polling' | 'websocket')[],
          upgrade: true,
          rememberUpgrade: true,
          path: SocketConfig.path, // Can be undefined for default
          timestampRequests: false,
          timestampParam: 't',
          
          // Manager options
          autoConnect: SocketConfig.autoConnect,
          reconnection: SocketConfig.reconnection,
          reconnectionAttempts: SocketConfig.reconnectionAttempts,
          reconnectionDelay: SocketConfig.reconnectionDelay,
          reconnectionDelayMax: SocketConfig.reconnectionDelayMax,
          randomizationFactor: 0.5,
          timeout: SocketConfig.timeout,
          
          // Socket options
          auth: {
            token,
            userId
          },
          
          // Additional query parameters
          query: {
            userId,
            platform: 'react-native',
            version: '1.0.0',
            environment: AppConfig.environment
          },

          // Parser options (using default JSON parser)
          parser: undefined, // Use default parser

          // Headers for polling transport
          extraHeaders: {
            'Accept': 'application/json',
            'User-Agent': `MyUSTACustomer/1.0.0 (React Native)`,
            'X-Environment': AppConfig.environment
          },

          // CORS and credentials
          withCredentials: SocketConfig.withCredentials,

          // Additional v4 specific options
          closeOnBeforeunload: true, // Close connection when page unloads
          ackTimeout: 5000, // Timeout for acknowledgments
          retries: 3 // Number of retries for failed packets
        };

        AppLogger.info('Socket options', socketOptions);

        this.socket = io(this.serverUrl, socketOptions);

        // Connection timeout handling
        const connectionTimeout = setTimeout(() => {
          if (!this.socket?.connected) {
            AppLogger.error(`Connection timeout after ${SocketConfig.timeout}ms`);
            this.socket?.disconnect();
            this.setConnectionState(ConnectionState.ERROR);
            reject(new Error('Connection timeout'));
          }
        }, SocketConfig.timeout);

        // Enhanced connection event handlers
        this.socket.on('connect', () => {
          const connectionInfo = {
            socketId: this.socket?.id,
            transport: this.socket?.io?.engine?.transport?.name,
            url: this.serverUrl, // Use serverUrl instead of private uri property
            connected: this.socket?.connected,
            recovered: this.socket?.recovered, // v4.6.0+ feature
            environment: AppConfig.environment
          };

          AppLogger.info('Socket connected successfully!', connectionInfo);

          clearTimeout(connectionTimeout);
          this.reconnectAttempts = 0;
          this.isConnecting = false;
          this.setConnectionState(ConnectionState.CONNECTED);
          this.emit('connection_change', true);
          resolve();
        });

        this.socket.on('disconnect', (reason, details) => {
          const disconnectInfo = {
            reason,
            details,
            socketId: this.socket?.id,
            active: this.socket?.active,
            environment: AppConfig.environment
          };

          AppLogger.info('Socket disconnected', disconnectInfo);

          clearTimeout(connectionTimeout);
          this.setConnectionState(ConnectionState.DISCONNECTED);
          this.emit('connection_change', false);

          // Handle different disconnect reasons based on v4 docs
          if (reason === 'io server disconnect') {
            AppLogger.info('Server disconnected, manual reconnect required');
          } else if (reason === 'io client disconnect') {
            AppLogger.info('Client disconnected manually');
          } else if (reason === 'ping timeout') {
            AppLogger.info('Ping timeout, will auto-reconnect');
          } else if (reason === 'transport close' || reason === 'transport error') {
            AppLogger.info('Transport issue, will auto-reconnect');
          }
        });

        this.socket.on('connect_error', (error: any) => {
          const errorInfo = {
            message: error?.message || error?.toString() || 'Unknown error',
            type: error?.type || error?.name || 'Unknown type',
            code: error?.code || 'No code',
            transport: error?.transport || 'Unknown transport',
            url: this.serverUrl,
            userId: this.userId,
            active: this.socket?.active,
            environment: AppConfig.environment,
            socketPath: SocketConfig.path,
            // Include the full error object for debugging
            fullError: error
          };

          if (SocketConfig.enableLogging) {
            AppLogger.error("Detailed connection error", errorInfo);
          }

          clearTimeout(connectionTimeout);
          this.reconnectAttempts++;

          // Check socket.active to determine if auto-reconnect will happen
          if (this.socket?.active) {
            AppLogger.info('Temporary failure, socket will auto-reconnect');
            this.setConnectionState(ConnectionState.RECONNECTING);
          } else {
            AppLogger.error('Connection denied by server, manual reconnect required');
            this.isConnecting = false;
            this.setConnectionState(ConnectionState.ERROR);
            this.emit('connection_change', false);
            this.emit('socket_error', {
              code: 'CONNECTION_FAILED',
              message: 'Unable to connect to chat server',
              details: error,
              attempts: this.reconnectAttempts,
              environment: AppConfig.environment
            });
            reject(error);
          }
        });

        // Enhanced reconnection event handlers
        this.socket.on('reconnect', (attemptNumber) => {
          AppLogger.info(`Reconnected successfully after ${attemptNumber} attempts`);
          this.setConnectionState(ConnectionState.CONNECTED);
          this.emit('connection_change', true);
        });

        this.socket.on('reconnect_attempt', (attemptNumber) => {
          AppLogger.info(`Reconnecting... attempt ${attemptNumber}`);
          this.setConnectionState(ConnectionState.RECONNECTING);
        });

        this.socket.on('reconnect_error', (error) => {
          AppLogger.error('Reconnection error:', {
            message: error?.message || error?.toString() || 'Unknown reconnection error',
            type: error?.type || error?.name || 'Unknown type',
            fullError: error
          });
          this.emit('socket_error', {
            code: 'RECONNECT_FAILED',
            message: 'Failed to reconnect to chat server',
            details: error
          });
        });

        this.socket.on('reconnect_failed', () => {
          AppLogger.error('All reconnection attempts failed');
          this.setConnectionState(ConnectionState.ERROR);
          this.emit('socket_error', {
            code: 'RECONNECT_EXHAUSTED',
            message: 'All reconnection attempts failed'
          });
        });

        // Additional v4 events with proper React Native error handling
        if (SocketConfig.enableLogging) {
          this.socket.on('ping', () => {
            AppLogger.info('Ping received from server');
          });

          this.socket.on('pong', (latency) => {
            AppLogger.info(`Pong received, latency: ${latency}ms`);
          });

          // Additional error event for debugging
          this.socket.on('error', (error) => {
            AppLogger.error('Socket error event:', {
              message: error?.message || error?.toString() || 'Unknown socket error',
              type: error?.type || error?.name || 'Unknown type',
              stack: error?.stack || 'No stack trace',
              fullError: error
            });
          });
        }

        // Set up message event handlers
        this.setupMessageHandlers();

      } catch (error) {
        AppLogger.error('Socket setup error:', error);
        this.isConnecting = false;
        this.setConnectionState(ConnectionState.ERROR);
        reject(error);
      }
    });

    // Clear promise when done (success or failure)
    this.connectionPromise.finally(() => {
      this.connectionPromise = null;
    });

    return this.connectionPromise;
  }

  // Set connection state and emit event
  private setConnectionState(state: ConnectionState): void {
    const previousState = this.connectionState;
    this.connectionState = state;
    if (previousState !== state) {
      AppLogger.info(`Connection state changed: ${previousState} -> ${state}`);
      this.emit('connection_state_change', state);
    }
  }

  // Get  connection state
  getConnectionStateEnum(): ConnectionState {
    return this.connectionState;
  }

  // Set up all message-related event handlers
  private setupMessageHandlers(): void {
    if (!this.socket) return;

    // Message sent confirmation from server
    this.socket.on('message_sent', (data) => {
      if (SocketConfig.enableLogging) {
        AppLogger.info('Message sent confirmation:', {
          messageId: data.id || data.messageId,
          clientTempId: data.clientTempId,
          conversationId: data.conversationId,
          status: data.status,
          timestamp: data.timestamp
        });
      }

      this.emit('message_sent', data);
    });

    // Message send errors from server
    this.socket.on('message_send_error', (data) => {
      AppLogger.error('Message send error from server:', {
        clientTempId: data.clientTempId,
        error: data.error,
        code: data.code,
        timestamp: data.timestamp
      });

      this.emit('message_send_error', data);
    });

    // New message received
    this.socket.on('new_message', (data) => {
      if (SocketConfig.enableLogging) {
        AppLogger.info('New Message received:', data.messageId || data.id);
      }
      const message = this.transformIncomingMessage(data);
      this.emit('message_received', message);
    });

    this.socket.on('message_updated', (data) => {
      if (SocketConfig.enableLogging) {
        AppLogger.info('Message updated:', data.messageId);
      }
      this.emit('message_updated', data.messageId, data.content);
    });

    this.socket.on('message_deleted', (data) => {
      if (SocketConfig.enableLogging) {
        AppLogger.info('Message deleted:', data.messageId);
      }
      this.emit('message_deleted', data.messageId);
    });

    // Typing events
    this.socket.on('user_typing', (data) => {
      if (SocketConfig.enableLogging) {
        AppLogger.info('User typing:', data.userId, data.isTyping ? 'started' : 'stopped');
      }
      this.emit('typing', data.userId, data.isTyping);
    });

    // User status events
    this.socket.on('user_online', (data) => {
      if (SocketConfig.enableLogging) {
        AppLogger.info('User online:', data.id);
      }
      this.emit('user_status', data.id, true);
    });

    this.socket.on('user_offline', (data) => {
      if (SocketConfig.enableLogging) {
        AppLogger.info('User offline:', data.id);
      }
      this.emit('user_status', data.id, false);
    });

    // Conversation events
    this.socket.on('added_to_conversation', (data) => {
      if (SocketConfig.enableLogging) {
        AppLogger.info('Added to conversation:', data.conversationId);
      }
      this.emit('added_to_conversation', data);
    });

    // Error events
    this.socket.on('error', (error) => {
      AppLogger.error('Socket error:', error);
      this.emit('socket_error', error);
    });

    // Additional typing events
    this.socket.on('typing_status_updated', (data) => {
      if (SocketConfig.enableLogging) {
        AppLogger.info('Typing status updated:', data);
      }
      this.emit('typing_status_updated', data);
    });

    this.socket.on('typing_users', (data) => {
      if (SocketConfig.enableLogging) {
        AppLogger.info('Users typing:', data.userIds);
      }
      this.emit('typing_users', data);
    });
  }

  // Disconnect from socket server
  disconnect(): void {
    if (this.socket) {
      AppLogger.info('Disconnecting socket...');
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.userId = null;
      this.listeners.clear();
      this.isConnecting = false;
      this.connectionPromise = null;
      this.setConnectionState(ConnectionState.DISCONNECTED);
      this.emit('connection_change', false);
    }
  }

  // Check connection status
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // Send a message with proper v4 emit patterns
  sendMessage(message: Message): void {
    if (!this.socket || !this.userId || !this.socket.connected) {
      throw new Error('Socket not connected');
    }

    if (!message.clientTempId || !message.conversationId) {
      throw new Error('Message missing required fields');
    }

    const socketMessage = {
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

    if (SocketConfig.enableLogging) {
      AppLogger.info("Sending message:", socketMessage);
    }

    try {
      // v4 emit with optional timeout and callback
      this.socket.emit('send_message', socketMessage, (response: any) => {
        if (SocketConfig.enableLogging) {
          AppLogger.info('Message acknowledgment received:', response);
        }
      });
      
      if (SocketConfig.enableLogging) {
        AppLogger.info('Message emit successful');
      }
    } catch (error) {
      AppLogger.error('Failed to emit message:', error);
      throw error;
    }
  }

  // Send typing status with environment-aware logging
  sendTypingStatus(conversationId: string, receiverId: string, isTyping: boolean): void {
    if (!this.socket || !this.userId) {
      AppLogger.error('Cannot send typing status: Socket not connected');
      return;
    }

    if (!this.socket.connected) {
      AppLogger.error('Cannot send typing status: Socket not connected');
      return;
    }

    // Validation
    if (!conversationId?.trim()) {
      AppLogger.error('Cannot send typing status: Invalid conversationId');
      return;
    }

    if (!receiverId?.trim()) {
      AppLogger.error('Cannot send typing status: Invalid receiverId');
      return;
    }

    if (typeof isTyping !== 'boolean') {
      AppLogger.error('Cannot send typing status: Invalid isTyping value');
      return;
    }

    const typingData = {
      conversationId: conversationId.toString(),
      userId: this.userId.toString(),
      receiverId: receiverId.toString(),
      isTyping: Boolean(isTyping),
      timestamp: Date.now()
    };

    if (SocketConfig.enableLogging) {
      AppLogger.info('Sending typing status:', {
        conversationId,
        userId: this.userId,
        receiverId,
        isTyping,
        socketConnected: this.socket.connected,
        socketId: this.socket.id
      });
    }

    try {
      this.socket.emit('typing', typingData);
      if (SocketConfig.enableLogging) {
        AppLogger.info('Typing status sent successfully');
      }
    } catch (error) {
      AppLogger.error('Failed to send typing status:', error);
    }
  }

  // Mark messages as read
  markMessagesAsRead(messageIds: string[], conversationId: string): void {
    if (!this.socket || !this.userId) {
      AppLogger.error('Cannot mark as read: Socket not connected');
      return;
    }

    this.socket.emit('mark_read', {
      messageIds,
      conversationId,
      userId: this.userId
    });
  }

  // Event listener management
  on(event: string, callback: SocketCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    const callbacks = this.listeners.get(event)!;
    callbacks.push(callback);

    if (SocketConfig.enableLogging) {
      AppLogger.info(`Listener added for event: ${event} (${callbacks.length} listeners)`);
    }

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
          if (SocketConfig.enableLogging) {
            AppLogger.info(`Listener removed for event: ${event} (${callbacks.length} listeners)`);
          }
        }
      }
    };
  }

  // Emit event to all listeners
  private emit(event: string, ...args: any[]): void {
    if (SocketConfig.enableLogging) {
      AppLogger.info(`Emitting internal event: ${event} with ${args.length} args`);
    }
    
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      if (SocketConfig.enableLogging) {
        AppLogger.info(`Found ${callbacks.length} listeners for ${event}`);
      }
      callbacks.forEach((callback, index) => {
        try {
          if (SocketConfig.enableLogging) {
            AppLogger.info(`Calling listener ${index + 1} for ${event}`);
          }
          callback(...args);
        } catch (error) {
          AppLogger.error(`Error in ${event} listener:`, error);
        }
      });
    } else {
      if (SocketConfig.enableLogging) {
        AppLogger.info(`No listeners found for ${event}`);
      }
    }
  }

  // Update attachment transformation
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

    if (content.attachments?.length) {
      content.attachments.forEach((att: any, index: number) => {
        attachments.push({
          id: att.id || `file-${index}`,
          type: att.type || AttachmentType.FILE,
          url: att.url,
          name: att.name || `file-${index}`,
          size: att.size || 0
        });
      });
    }

    return attachments;
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

  // Get socket ID
  getSocketId(): string | null {
    return this.socket?.id || null;
  }

  // Enhanced connection state with environment info
  getConnectionState(): {
    isConnected: boolean;
    socketId: string | null;
    userId: string | null;
    reconnectAttempts: number;
    state: ConnectionState;
    isConnecting: boolean;
    active: boolean | undefined;
    recovered: boolean | undefined;
    environment: string;
    serverUrl: string;
    socketPath: string | undefined;
  } {
    return {
      isConnected: this.isConnected(),
      socketId: this.getSocketId(),
      userId: this.userId,
      reconnectAttempts: this.reconnectAttempts,
      state: this.connectionState,
      isConnecting: this.isConnecting,
      active: this.socket?.active,
      recovered: this.socket?.recovered,
      environment: AppConfig.environment,
      serverUrl: this.serverUrl,
      socketPath: SocketConfig.path
    };
  }
}

export const socketService = new SocketService();
export { ConnectionState };