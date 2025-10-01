// web/managers/MessageManager.js
import { EventBus } from '../utils/EventBus.js';

export class MessageManager {
  constructor(chatService) {
    this.chatService = chatService;
    this.messagesByConversation = new Map();
    this.activeConversationId = null;
  }

  initialize() {
    this.setupSocketListeners();
    console.log('✅ MessageManager initialized');
  }

  setupSocketListeners() {
    // Message received - auto-mark as delivered
    this.chatService.onNewMessage((message) => {
      this.handleMessageReceived(message);
    });

    // Message sent confirmation
    this.chatService.onMessageSent((data) => {
      this.handleMessageSent(data);
    });

    // Message send error
    this.chatService.onMessageSendError((data) => {
      this.handleMessageError(data);
    });

    // Message read
    if (this.chatService.onMessageRead) {
      this.chatService.onMessageRead((data) => {
        this.handleMessageRead(data);
      });
    }
  }

  handleMessageReceived(message) {
    console.log('💬 Message received:', message.id);
    
    // Cache message
    this.cacheMessage(message);
    
    // Auto-mark as delivered
    if (message.senderId !== this.chatService.currentUserId) {
      this.sendDeliveryReceipt(message);
    }
    
    // Auto-mark as read if conversation is active
    if (message.conversationId === this.activeConversationId) {
      this.sendReadReceipt(message);
    }
    
    EventBus.emit('message:received', message);
  }

  handleMessageSent(data) {
    console.log('✅ Message sent:', data.messageId);
    EventBus.emit('message:sent', data);
  }

  handleMessageError(data) {
    console.error('❌ Message error:', data);
    EventBus.emit('message:error', data);
  }

  handleMessageRead(data) {
    console.log('👁️ Messages read:', data);
    EventBus.emit('message:read', data);
  }

  async sendDeliveryReceipt(message) {
    try {
      // Emit socket event to mark as delivered
      if (this.chatService.markMessagesAsDelivered) {
        await this.chatService.markMessagesAsDelivered([message.id], message.conversationId);
      }
    } catch (error) {
      console.error('Failed to send delivery receipt:', error);
    }
  }

  async sendReadReceipt(message) {
    try {
      await this.chatService.markMessagesAsRead(message.conversationId, [message.id]);
    } catch (error) {
      console.error('Failed to send read receipt:', error);
    }
  }

  setActiveConversation(conversationId) {
    this.activeConversationId = conversationId;
    
    // Mark all messages in this conversation as read
    const messages = this.messagesByConversation.get(conversationId) || [];
    const unreadMessages = messages.filter(m => 
      m.senderId !== this.chatService.currentUserId && 
      m.status !== 'read'
    );
    
    if (unreadMessages.length > 0) {
      this.markConversationAsRead(conversationId);
    }
  }

  async markConversationAsRead(conversationId) {
    try {
      await this.chatService.markMessagesAsRead(conversationId);
      EventBus.emit('conversation:read', conversationId);
    } catch (error) {
      console.error('Failed to mark conversation as read:', error);
    }
  }

  cacheMessage(message) {
    if (!this.messagesByConversation.has(message.conversationId)) {
      this.messagesByConversation.set(message.conversationId, []);
    }
    
    const messages = this.messagesByConversation.get(message.conversationId);
    
    // Check if message already exists
    const exists = messages.find(m => 
      m.id === message.id || m.clientTempId === message.clientTempId
    );
    
    if (!exists) {
      messages.push(message);
    }
  }

  getMessages(conversationId) {
    return this.messagesByConversation.get(conversationId) || [];
  }

  async loadMessages(conversationId, options = {}) {
    try {
      const result = await this.chatService.loadMessages(conversationId, {
        page: options.page || 1,
        limit: options.limit || 50
      });

      // Cache messages
      this.messagesByConversation.set(conversationId, result.messages);
      
      EventBus.emit('messages:loaded', {
        conversationId,
        messages: result.messages,
        hasMore: result.hasMore
      });

      return result;
    } catch (error) {
      console.error('Failed to load messages:', error);
      throw error;
    }
  }

  async sendMessage(conversationId, content, receiverId, options = {}) {
    try {
      const message = await this.chatService.sendTextMessage(
        conversationId,
        content,
        receiverId,
        options.replyTo
      );

      this.cacheMessage(message);
      return message;
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }

  destroy() {
    this.messagesByConversation.clear();
  }
}