// web/managers/ConversationManager.js
import { EventBus } from '../utils/EventBus.js';

export class ConversationManager {
  constructor(chatService) {
    this.chatService = chatService;
    this.conversations = [];
    this.activeConversationId = null;
    this.loading = false;
    this.pollingInterval = null;
    this.POLL_INTERVAL = 30000; // 30 seconds
  }

  /**
   * Initialize manager and load conversations
   */
  async initialize() {
    console.log('📋 Initializing ConversationManager...');
    
    try {
      await this.loadConversations();
      this.setupEventListeners();
      this.startPolling();
      
      console.log('✅ ConversationManager initialized');
    } catch (error) {
      console.error('❌ Failed to initialize ConversationManager:', error);
      throw error;
    }
  }

  /**
   * Load conversations from chat service
   */
  async loadConversations() {
    if (this.loading) return;
    
    this.loading = true;
    EventBus.emit('conversations:loading', true);
    
    try {
      console.log('📥 Loading conversations...');
      
      const result = await this.chatService.getMyConversations({
        limit: 50,
        offset: 0
      });

      this.conversations = result.conversations || [];
      
      console.log(`✅ Loaded ${this.conversations.length} conversations`);
      
      EventBus.emit('conversations:loaded', this.conversations);
      
    } catch (error) {
      console.error('❌ Failed to load conversations:', error);
      EventBus.emit('conversations:error', error);
      throw error;
    } finally {
      this.loading = false;
      EventBus.emit('conversations:loading', false);
    }
  }

  /**
   * Refresh conversations (reload from server)
   */
  async refresh() {
    console.log('🔄 Refreshing conversations...');
    await this.loadConversations();
  }

  /**
   * Setup event listeners from EventBus
   */
  setupEventListeners() {
    // Socket events via EventBus
    EventBus.on('socket:message_received', (message) => {
      this.handleNewMessage(message);
    });

    EventBus.on('socket:message_sent', (data) => {
      this.handleMessageSent(data);
    });

    EventBus.on('socket:user_online', (data) => {
      this.updateUserStatus(data.userId, true);
    });

    EventBus.on('socket:user_offline', (data) => {
      this.updateUserStatus(data.userId, false);
    });

    EventBus.on('socket:user_status', (data) => {
      this.updateUserStatus(data.userId, data.isOnline);
    });

    EventBus.on('socket:conversation_created', (data) => {
      this.handleConversationCreated(data);
    });

    EventBus.on('socket:conversation_updated', (data) => {
      this.handleConversationUpdated(data);
    });

    // UI events
    EventBus.on('conversation:select', (conversationId) => {
      this.selectConversation(conversationId);
    });
  }

  handleConversationCreated(data) {
    console.log('🆕 New conversation created:', data);
    // Add to list if not exists
    const exists = this.conversations.find(c => c.id === data.conversationId);
    if (!exists && data.conversation) {
      this.conversations.unshift(data.conversation);
      EventBus.emit('conversations:loaded', this.conversations);
    }
  }

  handleConversationUpdated(data) {
    console.log('🔄 Conversation updated:', data);
    const conversation = this.conversations.find(c => c.id === data.conversationId);
    if (conversation && data.updates) {
      Object.assign(conversation, data.updates);
      EventBus.emit('conversation:updated', conversation);
      EventBus.emit('conversations:loaded', this.conversations);
    }
  }

  /**
   * Handle new incoming message
   */
  handleNewMessage(message) {
    console.log('💬 New message for conversation:', message.conversationId);
    
    const conversation = this.conversations.find(c => c.id === message.conversationId);
    
    if (conversation) {
      // Update last message
      conversation.lastMessage = message;
      conversation.updatedAt = message.timestamp;
      
      // Update unread count if not active
      if (message.conversationId !== this.activeConversationId) {
        conversation.unreadCount = (conversation.unreadCount || 0) + 1;
      }
      
      // Sort conversations (newest first)
      this.sortConversations();
      
      // Emit update
      EventBus.emit('conversation:updated', conversation);
      EventBus.emit('conversations:loaded', this.conversations);
    }
  }

  /**
   * Handle message sent confirmation
   */
  handleMessageSent(data) {
    // Update conversation's last message when we send a message
    const conversation = this.conversations.find(c => c.id === data.conversationId);
    
    if (conversation) {
      conversation.updatedAt = new Date().toISOString();
      this.sortConversations();
      EventBus.emit('conversations:loaded', this.conversations);
    }
  }

  /**
   * Select a conversation
   */
  async selectConversation(conversationId) {
    console.log('📍 Selecting conversation:', conversationId);
    
    this.activeConversationId = conversationId;
    
    const conversation = this.conversations.find(c => c.id === conversationId);
    
    if (conversation) {
      // Mark as read
      if (conversation.unreadCount > 0) {
        conversation.unreadCount = 0;
        EventBus.emit('conversation:updated', conversation);
        
        // Mark messages as read via chat service
        try {
          await this.chatService.markMessagesAsRead(conversationId);
        } catch (error) {
          console.error('Failed to mark as read:', error);
        }
      }
      
      EventBus.emit('conversation:selected', conversationId);
    }
  }

  /**
   * Create or find conversation
   */
  async findOrCreateConversation(jobId, otherUserId) {
    console.log('🔍 Finding or creating conversation...', { jobId, otherUserId });
    
    try {
      const conversation = await this.chatService.findOrCreateJobConversation(
        jobId,
        otherUserId
      );
      
      // Add to list if not exists
      const exists = this.conversations.find(c => c.id === conversation.id);
      if (!exists) {
        this.conversations.unshift(conversation);
        EventBus.emit('conversations:loaded', this.conversations);
      }
      
      return conversation;
    } catch (error) {
      console.error('❌ Failed to find/create conversation:', error);
      throw error;
    }
  }

  /**
   * Get conversation by ID
   */
  getConversation(conversationId) {
    return this.conversations.find(c => c.id === conversationId);
  }

  /**
   * Get active conversation
   */
  getActiveConversation() {
    return this.conversations.find(c => c.id === this.activeConversationId);
  }

  /**
   * Update user online status
   */
  updateUserStatus(userId, isOnline) {
    console.log('👤 User status changed:', userId, isOnline ? 'online' : 'offline');
    
    // Update status in all conversations with this user
    let updated = false;
    
    this.conversations.forEach(conv => {
      const participant = conv.participants?.find(p => p.userId === userId);
      if (participant) {
        participant.isOnline = isOnline;
        if (!isOnline) {
          participant.lastSeen = new Date().toISOString();
        }
        updated = true;
      }
    });
    
    if (updated) {
      EventBus.emit('user:status:changed', { userId, isOnline });
      EventBus.emit('conversations:loaded', this.conversations);
    }
  }

  /**
   * Start polling for conversation updates
   */
  startPolling() {
    // Clear any existing interval
    this.stopPolling();
    
    // Poll every 30 seconds
    this.pollingInterval = setInterval(() => {
      this.refresh();
    }, this.POLL_INTERVAL);
    
    console.log('⏱️  Started polling conversations every', this.POLL_INTERVAL / 1000, 'seconds');
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('⏱️  Stopped polling conversations');
    }
  }

  /**
   * Sort conversations by last activity
   */
  sortConversations() {
    this.conversations.sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt).getTime();
      return timeB - timeA;
    });
  }

  /**
   * Get total unread count
   */
  getTotalUnreadCount() {
    return this.conversations.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
  }

  /**
   * Cleanup
   */
  destroy() {
    this.stopPolling();
    EventBus.off('conversation:select');
    console.log('🗑️  ConversationManager destroyed');
  }
}