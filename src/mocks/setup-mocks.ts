// mocks/setup-mocks.ts - Mock implementations for test client
import { EventEmitter } from 'events';

/**
 * Mock AsyncStorage for Node.js environment
 */
const mockStorage = new Map<string, string>();

(global as any).AsyncStorage = {
  getItem: async (key: string) => {
    return mockStorage.get(key) || null;
  },
  setItem: async (key: string, value: string) => {
    mockStorage.set(key, value);
  },
  removeItem: async (key: string) => {
    mockStorage.delete(key);
  },
  clear: async () => {
    mockStorage.clear();
  }
};

/**
 * Mock Platform for React Native
 */
(global as any).Platform = {
  OS: 'ios',
  Version: '14.0',
  select: (obj: any) => obj.ios || obj.default
};

/**
 * Mock Socket Service
 */
class MockSocketService extends EventEmitter {
  private connected: boolean = false;
  private connectionState: string = 'disconnected';
  private messageQueue: any[] = [];
  private simulateOffline: boolean = false;

  constructor() {
    super();
    
    // Auto-connect after a delay
    setTimeout(() => {
      if (!this.simulateOffline) {
        this.simulateConnection();
      }
    }, 1000);
  }

  async connect(userId: string, token: string): Promise<void> {
    console.log(`[MockSocket] Connecting as ${userId}...`);
    
    return new Promise((resolve) => {
      setTimeout(() => {
        if (!this.simulateOffline) {
          this.connected = true;
          this.connectionState = 'connected';
          this.emit('connect');
          this.emit('connection_state_change', {
            state: 'connected',
            connected: true,
            timestamp: new Date().toISOString()
          });
        }
        resolve();
      }, 500);
    });
  }

  disconnect(): void {
    console.log('[MockSocket] Disconnecting...');
    this.connected = false;
    this.connectionState = 'disconnected';
    this.emit('disconnect', 'client disconnect');
  }

  isConnected(): boolean {
    return this.connected && !this.simulateOffline;
  }

  getConnectionStateEnum(): string {
    if (this.simulateOffline) return 'disconnected';
    return this.connected ? 'connected' : 'disconnected';
  }

  sendMessage(message: any): void {
    if (!this.connected || this.simulateOffline) {
      console.log('[MockSocket] Message queued (offline):', message.clientTempId);
      this.messageQueue.push(message);
      return;
    }

    console.log('[MockSocket] Sending message:', message.clientTempId);
    
    // Simulate server processing
    setTimeout(() => {
      // Emit sent confirmation
      this.emit('message_sent', {
        id: message.id,
        clientTempId: message.clientTempId,
        conversationId: message.conversationId || 'conv_123',
        status: 'sent',
        timestamp: new Date().toISOString()
      });

      // Simulate message received event
      setTimeout(() => {
        this.emit('message_received', {
          ...message,
          status: 'delivered'
        });
      }, 500);
    }, 1000);
  }

  sendTypingStatus(conversationId: string, receiverId: string, isTyping: boolean): void {
    console.log(`[MockSocket] Typing: ${isTyping}`);
  }

  on(event: string, handler: (...args: any[]) => void): () => void {
    super.on(event, handler);
    return () => {
      this.removeListener(event, handler);
    };
  }

  simulateConnection(): void {
    this.connected = true;
    this.connectionState = 'connected';
    
    // Process queued messages
    if (this.messageQueue.length > 0) {
      console.log(`[MockSocket] Processing ${this.messageQueue.length} queued messages`);
      const messages = [...this.messageQueue];
      this.messageQueue = [];
      
      messages.forEach(msg => {
        this.sendMessage(msg);
      });
    }
  }

  simulateDisconnection(): void {
    this.connected = false;
    this.connectionState = 'disconnected';
    this.emit('disconnect', 'transport close');
  }

  toggleOfflineMode(offline: boolean): void {
    this.simulateOffline = offline;
    
    if (offline) {
      this.simulateDisconnection();
    } else {
      this.simulateConnection();
    }
  }
}

// Create global mock instance
const mockSocketService = new MockSocketService();
(global as any).socketService = mockSocketService;

// Export for direct imports
export { mockSocketService as socketService };

/**
 * Mock Chat API Service
 */
class MockChatApiService {
  private token: string = '';
  private conversations: Map<string, any> = new Map();
  private messages: Map<string, any[]> = new Map();

  setToken(token: string): void {
    this.token = token;
  }

  async createConversation(params: any): Promise<any> {
    const conversationId = 'conv_' + Date.now();
    const conversation = {
      id: conversationId,
      participants: params.participantIds.map((id: string) => ({
        userId: id,
        name: id === '091e4c17-47ab-4150-8b45-ea36dd2c2de9' ? 'Babar Khan' : 'Customer',
        role: id === '091e4c17-47ab-4150-8b45-ea36dd2c2de9' ? 'usta' : 'customer',
        isOnline: true
      })),
      type: params.type,
      metadata: {
        jobId: params.jobId,
        jobTitle: params.jobTitle,
        status: params.status
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      unreadCount: 0
    };

    this.conversations.set(conversationId, conversation);
    
    return {
      success: true,
      conversation
    };
  }

  async getConversations(params?: any): Promise<any> {
    const conversations = Array.from(this.conversations.values());
    
    return {
      success: true,
      conversations,
      hasMore: false,
      total: conversations.length
    };
  }

  async getConversationById(conversationId: string): Promise<any> {
    const conversation = this.conversations.get(conversationId);
    
    if (!conversation) {
      throw new Error('Conversation not found');
    }
    
    return {
      success: true,
      conversation
    };
  }

  async getMessages(conversationId: string, page: number = 1, limit: number = 50): Promise<any> {
    const messages = this.messages.get(conversationId) || [];
    
    return {
      success: true,
      messages,
      hasMore: false,
      total: messages.length
    };
  }

  async sendTextMessage(conversationId: string, text: string, receiverId: string, replyTo?: string): Promise<any> {
    const message = {
      id: 'msg_' + Date.now(),
      conversationId,
      senderId: '091e4c17-47ab-4150-8b45-ea36dd2c2de9',
      receiverId,
      content: text,
      timestamp: new Date().toISOString(),
      type: 'text',
      status: 'sent',
      replyTo
    };

    const messages = this.messages.get(conversationId) || [];
    messages.push(message);
    this.messages.set(conversationId, messages);
    
    return message;
  }

  async markAsRead(conversationId: string, messageIds?: string[]): Promise<void> {
    // Mock implementation
    console.log(`[MockAPI] Marked messages as read in ${conversationId}`);
  }

  async updateConversationSettings(conversationId: string, settings: any): Promise<void> {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.settings = { ...conversation.settings, ...settings };
    }
  }

  async updateConversationStatus(conversationId: string, status: string): Promise<void> {
    const conversation = this.conversations.get(conversationId);
    if (conversation && conversation.metadata) {
      conversation.metadata.status = status;
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    this.conversations.delete(conversationId);
    this.messages.delete(conversationId);
  }

  async uploadFile(file: any, type: string): Promise<any> {
    return {
      url: 'https://example.com/file.jpg',
      name: file.name || 'file.jpg',
      size: file.size || 1024,
      type: type
    };
  }

  async blockUser(userId: string): Promise<void> {
    console.log(`[MockAPI] Blocked user ${userId}`);
  }

  async checkBlockStatus(userId: string): Promise<any> {
    return { isBlocked: false };
  }

  async checkUserExists(userId: string): Promise<any> {
    return {
      success: true,
      user: {
        id: userId,
        name: userId === '091e4c17-47ab-4150-8b45-ea36dd2c2de9' ? 'Babar Khan' : 'Customer',
        role: userId === '091e4c17-47ab-4150-8b45-ea36dd2c2de9' ? 'usta' : 'customer'
      }
    };
  }
}

// Create global mock instance
const mockChatApiService = new MockChatApiService();
(global as any).chatApiService = mockChatApiService;

// Export for direct imports
export { mockChatApiService as chatApiService };

// Override console.warn and console.error for cleaner output in test mode
if (process.env.NODE_ENV === 'test') {
  const originalWarn = console.warn;
  const originalError = console.error;
  
  console.warn = (...args: any[]) => {
    if (!args[0]?.includes('Redux dispatch failed')) {
      originalWarn.apply(console, args);
    }
  };
  
  console.error = (...args: any[]) => {
    if (!args[0]?.includes('[ChatService]')) {
      originalError.apply(console, args);
    }
  };
}

console.log('[Mocks] All mocks initialized successfully');