/**
 * Main Chat Application
 * Uses existing ChatService from src/services/ChatService.ts
 */

import { chatService } from '../src/services/ChatService';
import { UserProfiles, ChatConfig } from './config.js';

class ChatApp {
  constructor() {
    // State
    this.currentUser = null;
    this.conversationId = null;
    this.otherUser = null;
    this.cleanupFunctions = [];
    this.typingTimeout = null;

    // DOM Elements
    this.elements = {
      // Role selection
      roleSelection: document.getElementById('role-selection'),
      userList: document.getElementById('user-list'),
      connectBtn: document.getElementById('connect-btn'),

      // Chat interface
      chatInterface: document.getElementById('chat-interface'),
      userAvatar: document.getElementById('user-avatar'),
      userName: document.getElementById('user-name'),
      userRole: document.getElementById('user-role'),
      statusDot: document.getElementById('status-dot'),
      connectionText: document.getElementById('connection-text'),
      messagesContainer: document.getElementById('messages-container'),
      messageInput: document.getElementById('message-input'),
      sendBtn: document.getElementById('send-btn'),
      typingIndicator: document.getElementById('typing-indicator')
    };

    this.init();
  }

  /**
   * Initialize application
   */
  async init() {
    console.log('🚀 Initializing Chat App...');

    // Render user selection
    this.renderUserList();

    // Setup event listeners
    this.setupEventListeners();

    // Try to restore session
    await this.restoreSession();

    console.log('✅ Chat App initialized');
  }

  /**
   * Render user selection list
   */
  renderUserList() {
    const users = UserProfiles.getAll();
    
    const html = users.map(user => `
      <li 
        class="p-4 bg-gray-50 border-2 border-transparent rounded-lg cursor-pointer hover:bg-gray-100 hover:border-indigo-500 transition-all user-item" 
        data-user-id="${user.id}"
      >
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold">
            ${user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <span class="font-semibold block">${user.name}</span>
            <span class="text-sm text-gray-500 block mt-1">${user.role.toUpperCase()} • ${user.email}</span>
          </div>
        </div>
      </li>
    `).join('');

    this.elements.userList.innerHTML = html;

    // Add click handlers
    document.querySelectorAll('.user-item').forEach(item => {
      item.addEventListener('click', () => this.selectUser(item));
    });
  }

  /**
   * Handle user selection
   */
  selectUser(item) {
    // Remove previous selection
    document.querySelectorAll('.user-item').forEach(i => {
      i.classList.remove('bg-indigo-500', 'text-white', 'border-indigo-500');
      i.querySelector('.bg-gradient-to-br').classList.remove('hidden');
    });

    // Add selection
    item.classList.add('bg-indigo-500', 'text-white', 'border-indigo-500');
    
    const userId = item.dataset.userId;
    this.currentUser = UserProfiles.getById(userId);
    
    // Enable connect button
    this.elements.connectBtn.disabled = false;
    
    console.log('Selected user:', this.currentUser.name);
  }

  /**
   * Setup all event listeners
   */
  setupEventListeners() {
    // Connect button
    this.elements.connectBtn.addEventListener('click', () => {
      this.connect();
    });

    // Send button
    this.elements.sendBtn.addEventListener('click', () => {
      this.sendMessage();
    });

    // Message input - Enter key
    this.elements.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Message input - Typing indicator
    this.elements.messageInput.addEventListener('input', () => {
      this.handleTyping();
    });

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      this.cleanup();
    });
  }

  /**
   * Connect to chat service
   */
  async connect() {
    if (!this.currentUser) {
      alert('Please select a user first');
      return;
    }

    try {
      console.log('🔌 Connecting to chat service...');
      this.elements.connectBtn.disabled = true;
      this.elements.connectBtn.textContent = 'Connecting...';

      // Initialize ChatService with user details
      await chatService.initialize(
        this.currentUser.userId,
        this.currentUser.role,
        this.currentUser.token,
        null, // No Redux store in browser
        {
          id: this.currentUser.userId,
          externalId: this.currentUser.userId,
          name: this.currentUser.name,
          email: this.currentUser.email,
          phone: this.currentUser.phone,
          role: this.currentUser.role
        }
      );

      console.log('✅ Connected to chat service');

      // Find or create conversation with other user
      await this.setupConversation();

      // Setup event listeners for chat service
      this.setupChatServiceListeners();

      // Show chat interface
      this.showChatInterface();

      // Save session
      this.saveSession();

      console.log('✅ Chat ready');

    } catch (error) {
      console.error('❌ Connection failed:', error);
      alert('Failed to connect: ' + error.message);
      this.elements.connectBtn.disabled = false;
      this.elements.connectBtn.textContent = 'Connect to Chat';
    }
  }

  /**
   * Setup or find conversation
   */
  async setupConversation() {
    // Find other user (opposite role)
    const otherUsers = UserProfiles.getOtherUsers(this.currentUser.role);
    this.otherUser = otherUsers[0]; // Take first available

    if (!this.otherUser) {
      throw new Error('No other user available for chat');
    }

    console.log('🔍 Setting up conversation with:', this.otherUser.name);

    // Find or create job conversation
    const conversation = await chatService.findOrCreateJobConversation(
      ChatConfig.defaultJobId,
      this.otherUser.userId
    );

    this.conversationId = conversation.id;
    console.log('✅ Conversation ready:', this.conversationId);

    // Load existing messages
    await this.loadMessages();
  }

  /**
   * Load messages for conversation
   */
  async loadMessages() {
    if (!this.conversationId) return;

    try {
      console.log('📥 Loading messages...');

      const result = await chatService.loadMessages(this.conversationId, {
        page: 1,
        limit: ChatConfig.messagesPerPage
      });

      console.log(`✅ Loaded ${result.messages.length} messages`);

      // Render messages
      result.messages.forEach(message => {
        this.renderMessage(message, message.senderId === this.currentUser.userId);
      });

      this.scrollToBottom();

    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  }

  /**
   * Setup ChatService event listeners
   */
  setupChatServiceListeners() {
    console.log('📡 Setting up event listeners...');

    // Connection state changes
    const cleanup1 = chatService.onConnectionStateChange((state, details) => {
      console.log('Connection state:', state);
      
      const isConnected = state === 'connected';
      this.updateConnectionStatus(isConnected);

      if (details?.error) {
        console.error('Connection error:', details.error);
      }
    });
    this.cleanupFunctions.push(cleanup1);

    // New messages
    const cleanup2 = chatService.onNewMessage((message) => {
      console.log('💬 New message:', message);
      
      const isMine = message.senderId === this.currentUser.userId;
      this.renderMessage(message, isMine);
      
      if (!isMine) {
        this.scrollToBottom();
      }
    });
    this.cleanupFunctions.push(cleanup2);

    // Message sent confirmation
    const cleanup3 = chatService.onMessageSent((data) => {
      console.log('✅ Message sent:', data.messageId);
      // Update message status in UI if needed
    });
    this.cleanupFunctions.push(cleanup3);

    // Message send errors
    const cleanup4 = chatService.onMessageSendError((data) => {
      console.error('❌ Message failed:', data.error);
      alert('Failed to send message: ' + data.error);
    });
    this.cleanupFunctions.push(cleanup4);

    // Typing indicators
    const cleanup5 = chatService.onTyping((userId, isTyping) => {
      if (userId !== this.currentUser.userId) {
        console.log('✏️ Other user typing:', isTyping);
        this.showTypingIndicator(isTyping);
      }
    });
    this.cleanupFunctions.push(cleanup5);

    console.log('✅ Event listeners ready');
  }

  /**
   * Send message
   */
  async sendMessage() {
    const content = this.elements.messageInput.value.trim();
    
    if (!content) return;
    if (!this.conversationId || !this.otherUser) {
      alert('Conversation not ready');
      return;
    }

    if (content.length > ChatConfig.maxMessageLength) {
      alert(`Message too long. Max ${ChatConfig.maxMessageLength} characters.`);
      return;
    }

    try {
      // Clear input immediately
      this.elements.messageInput.value = '';
      
      console.log('📤 Sending message...');

      // Send via ChatService
      const message = await chatService.sendTextMessage(
        this.conversationId,
        content,
        this.otherUser.userId
      );

      console.log('✅ Message sent:', message.id);

      // Render message (will show as "sending" initially)
      this.renderMessage(message, true);
      this.scrollToBottom();

    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message');
    }
  }

  /**
   * Handle typing indicator
   */
  handleTyping() {
    if (!this.conversationId || !this.otherUser) return;

    // Send typing indicator
    chatService.sendTypingIndicator(
      this.conversationId,
      this.otherUser.userId,
      true
    );

    // Clear previous timeout
    clearTimeout(this.typingTimeout);

    // Stop typing after delay
    this.typingTimeout = setTimeout(() => {
      chatService.sendTypingIndicator(
        this.conversationId,
        this.otherUser.userId,
        false
      );
    }, ChatConfig.typingIndicatorDelay);
  }

  /**
   * Render message in UI
   */
  renderMessage(message, isSent) {
    const messageEl = document.createElement('div');
    messageEl.className = `message max-w-[70%] mb-4 ${isSent ? 'ml-auto' : ''}`;
    messageEl.dataset.messageId = message.id;

    const time = new Date(message.timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const statusIcons = {
      sending: '⏳',
      sent: '✓',
      delivered: '✓✓',
      read: '👁️',
      failed: '❌',
      queued: '📥'
    };

    messageEl.innerHTML = `
      <div class="px-4 py-3 rounded-xl break-words ${
        isSent
          ? 'bg-indigo-500 text-white rounded-br-sm'
          : 'bg-white text-gray-800 rounded-bl-sm shadow-sm'
      }">
        ${this.escapeHtml(message.content)}
      </div>
      <div class="text-xs opacity-60 mt-1 ${isSent ? 'text-right' : 'text-left'} text-gray-600">
        ${time} ${isSent && message.status ? statusIcons[message.status] || '' : ''}
      </div>
    `;

    this.elements.messagesContainer.appendChild(messageEl);
  }

  /**
   * Show/hide typing indicator
   */
  showTypingIndicator(show) {
    this.elements.typingIndicator.classList.toggle('hidden', !show);
    if (show) {
      this.scrollToBottom();
    }
  }

  /**
   * Update connection status UI
   */
  updateConnectionStatus(connected) {
    if (connected) {
      this.elements.statusDot.classList.remove('bg-gray-300');
      this.elements.statusDot.classList.add('bg-green-500', 'connected');
      this.elements.connectionText.textContent = 'Connected';
      this.elements.connectionText.classList.remove('text-gray-600');
      this.elements.connectionText.classList.add('text-green-600');
    } else {
      this.elements.statusDot.classList.remove('bg-green-500', 'connected');
      this.elements.statusDot.classList.add('bg-gray-300');
      this.elements.connectionText.textContent = 'Disconnected';
      this.elements.connectionText.classList.remove('text-green-600');
      this.elements.connectionText.classList.add('text-gray-600');
    }
  }

  /**
   * Show chat interface
   */
  showChatInterface() {
    this.elements.roleSelection.classList.add('hidden');
    this.elements.chatInterface.classList.remove('hidden');
    this.elements.chatInterface.classList.add('flex');

    // Update header
    this.elements.userAvatar.textContent = this.currentUser.name.charAt(0).toUpperCase();
    this.elements.userName.textContent = this.currentUser.name;
    this.elements.userRole.textContent = this.currentUser.role.toUpperCase();

    // Focus message input
    this.elements.messageInput.focus();
  }

  /**
   * Scroll messages to bottom
   */
  scrollToBottom() {
    this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
  }

  /**
   * Save session to localStorage
   */
  saveSession() {
    try {
      const session = {
        userId: this.currentUser.id,
        conversationId: this.conversationId,
        timestamp: Date.now()
      };
      localStorage.setItem('chat_session', JSON.stringify(session));
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  /**
   * Restore previous session
   */
  async restoreSession() {
    try {
      const session = JSON.parse(localStorage.getItem('chat_session'));
      
      if (!session) return;

      // Check if session is not too old (24 hours)
      const age = Date.now() - session.timestamp;
      if (age > 24 * 60 * 60 * 1000) {
        localStorage.removeItem('chat_session');
        return;
      }

      // Auto-select user and connect
      const user = UserProfiles.getById(session.userId);
      if (user) {
        console.log('🔄 Restoring session for:', user.name);
        this.currentUser = user;
        // You could auto-connect here if desired
      }

    } catch (error) {
      console.error('Failed to restore session:', error);
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Cleanup on app close
   */
  async cleanup() {
    console.log('🧹 Cleaning up...');

    // Remove event listeners
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions = [];

    // Disconnect chat service
    try {
      await chatService.disconnect();
    } catch (error) {
      console.error('Error disconnecting:', error);
    }

    console.log('✅ Cleanup complete');
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.chatApp = new ChatApp();
  });
} else {
  window.chatApp = new ChatApp();
}