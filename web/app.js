// web/app.js - Final integrated version with managers
import { chatService } from '../src/services/ChatService.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { ConnectionState, MessageStatus } from '../src/types/chat.ts';
import { ConversationManager } from './managers/ConversationManager.js';
import { MessageManager } from './managers/MessageManager.js';
import { SocketEventManager } from './managers/SocketEventManager.js';
import { ConversationList } from './components/ConversationList.js';
import { EventBus } from './utils/EventBus.js';

const USER_PROFILES = [
  {
    id: '091e4c17-47ab-4150-8b45-ea36dd2c2de9',
    name: 'Babar Khan',
    role: 'usta',
    email: 'babarkh0302@gmail.com',
    phone: '+923046998634',
    password: 'Password123@',
    receiverId: 'customer-001',
    receiverName: 'Customer'
  },
  {
    id: 'customer-001',
    name: 'John Doe',
    role: 'customer',
    email: 'john@example.com',
    phone: '+355987654321',
    password: 'Password123@',
    receiverId: '091e4c17-47ab-4150-8b45-ea36dd2c2de9',
    receiverName: 'Babar Khan'
  }
];

class ChatApp {
  constructor() {
    this.currentUser = null;
    this.conversationId = null;
    this.jobId = `job-${Date.now()}`;
    this.jobTitle = 'Service Request';
    
    // Managers
    this.conversationManager = null;
    this.messageManager = null;
    this.socketEventManager = null;
    
    // Components
    this.conversationList = null;
    
    this.init();
  }

  init() {
    this.renderUserSelection();
    this.attachRoleSelectionEvents();
  }

  renderUserSelection() {
    const userList = document.getElementById('user-list');
    userList.innerHTML = USER_PROFILES.map((user, index) => `
      <li>
        <label class="flex items-center gap-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
          <input 
            type="radio" 
            name="user" 
            value="${index}"
            class="w-4 h-4 text-indigo-600"
          />
          <div class="flex-1">
            <div class="font-semibold text-gray-800">${user.name}</div>
            <div class="text-sm text-gray-500">${user.role} • ${user.email}</div>
          </div>
          <div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
            ${user.name.charAt(0)}
          </div>
        </label>
      </li>
    `).join('');
  }

  attachRoleSelectionEvents() {
    const connectBtn = document.getElementById('connect-btn');
    const radioButtons = document.querySelectorAll('input[name="user"]');

    radioButtons.forEach(radio => {
      radio.addEventListener('change', () => {
        connectBtn.disabled = false;
      });
    });

    connectBtn.addEventListener('click', async () => {
      const selectedIndex = document.querySelector('input[name="user"]:checked')?.value;
      if (selectedIndex !== undefined) {
        this.currentUser = USER_PROFILES[parseInt(selectedIndex)];
        await this.performLogin();
      }
    });
  }

  async performLogin() {
    try {
      console.log('🔐 Attempting login...');
      
      const connectBtn = document.getElementById('connect-btn');
      connectBtn.textContent = 'Logging in...';
      connectBtn.disabled = true;

      const loginResult = await AuthService.login(
        this.currentUser.email,
        this.currentUser.password,
        this.currentUser.role
      );

      if (!loginResult.success) {
        throw new Error(loginResult.error || 'Login failed');
      }

      console.log('✅ Login successful!', loginResult);

      this.currentUser.token = loginResult.token;
      this.currentUser.userData = loginResult.user;

      await this.connectToChat();

    } catch (error) {
      console.error('❌ Login failed:', error);
      
      const connectBtn = document.getElementById('connect-btn');
      connectBtn.textContent = 'Connect to Chat';
      connectBtn.disabled = false;
      
      alert('Login failed: ' + error.message);
    }
  }

  async connectToChat() {
    try {
      document.getElementById('role-selection').classList.add('hidden');
      document.getElementById('chat-interface').classList.remove('hidden');

      document.getElementById('user-avatar').textContent = this.currentUser.name.charAt(0);
      document.getElementById('user-name').textContent = this.currentUser.name;
      document.getElementById('user-role').textContent = this.currentUser.role.toUpperCase();
      this.updateConnectionStatus('connecting', 'Connecting...');

      window.currentUserId = this.currentUser.userData.id || this.currentUser.id;

      await chatService.initialize(
        window.currentUserId,
        this.currentUser.role,
        this.currentUser.token,
        undefined,
        {
          id: window.currentUserId,
          externalId: window.currentUserId,
          name: this.currentUser.name,
          email: this.currentUser.email,
          phone: this.currentUser.phone,
          role: this.currentUser.role
        }
      );

      // Initialize managers
      this.socketEventManager = new SocketEventManager(chatService);
      this.socketEventManager.initialize();

      this.messageManager = new MessageManager(chatService);
      this.messageManager.initialize();

      this.conversationManager = new ConversationManager(chatService);
      await this.conversationManager.initialize();

      // Initialize UI components
      this.conversationList = new ConversationList();
      this.conversationList.init('conversation-list');

      // Setup event listeners
      this.setupEventListeners();
      this.attachInputEvents();

      // Setup initial conversation
      await this.setupInitialConversation();

      this.updateConnectionStatus('connected', 'Connected');
      console.log('✅ Chat connected successfully');

    } catch (error) {
      console.error('❌ Connection failed:', error);
      this.updateConnectionStatus('error', 'Connection Error');
      alert('Failed to connect: ' + error.message);
      
      document.getElementById('chat-interface').classList.add('hidden');
      document.getElementById('role-selection').classList.remove('hidden');
      
      const connectBtn = document.getElementById('connect-btn');
      connectBtn.textContent = 'Connect to Chat';
      connectBtn.disabled = false;
    }
  }

  setupEventListeners() {
    // Connection state
    EventBus.on('connection:state', (state) => {
      const stateMap = {
        [ConnectionState.CONNECTED]: { status: 'connected', text: 'Connected' },
        [ConnectionState.CONNECTING]: { status: 'connecting', text: 'Connecting...' },
        [ConnectionState.RECONNECTING]: { status: 'connecting', text: 'Reconnecting...' },
        [ConnectionState.DISCONNECTED]: { status: 'disconnected', text: 'Disconnected' },
        [ConnectionState.ERROR]: { status: 'error', text: 'Error' }
      };
      
      const { status, text } = stateMap[state] || stateMap[ConnectionState.DISCONNECTED];
      this.updateConnectionStatus(status, text);
    });

    // Messages loaded
    EventBus.on('messages:loaded', (data) => {
      this.renderMessages(data.messages);
    });

    // Message received
    EventBus.on('socket:message_received', (message) => {
      if (message.conversationId === this.conversationId) {
        this.renderMessage(message);
      }
    });

    // Message status updates
    EventBus.on('socket:message_sent', (data) => {
      this.updateMessageStatus(data.messageId, MessageStatus.SENT);
    });

    EventBus.on('socket:message_delivered', (data) => {
      this.updateMessageStatus(data.messageId, MessageStatus.DELIVERED);
    });

    EventBus.on('socket:message_read', (data) => {
      if (data.messageIds) {
        data.messageIds.forEach(msgId => {
          this.updateMessageStatus(msgId, MessageStatus.READ);
        });
      }
    });

    EventBus.on('socket:messages_read', (data) => {
      if (data.messageIds) {
        data.messageIds.forEach(msgId => {
          this.updateMessageStatus(msgId, MessageStatus.READ);
        });
      }
    });

    EventBus.on('message:error', (data) => {
      if (data.clientTempId) {
        this.updateMessageStatusByTempId(data.clientTempId, MessageStatus.FAILED);
      }
    });

    // Typing indicator
    EventBus.on('socket:user_typing', ({ userId, isTyping }) => {
      if (userId !== window.currentUserId) {
        this.showTypingIndicator(isTyping);
      }
    });

    // Conversation selected
    EventBus.on('conversation:selected', (conversationId) => {
      this.loadConversation(conversationId);
    });
  }

  async setupInitialConversation() {
    try {
      const conversation = await this.conversationManager.findOrCreateConversation(
        this.jobId,
        this.currentUser.receiverId
      );

      this.conversationId = conversation.id;
      await this.loadConversation(this.conversationId);
      
    } catch (error) {
      console.error('❌ Failed to setup initial conversation:', error);
    }
  }

  async loadConversation(conversationId) {
    this.conversationId = conversationId;
    this.messageManager.setActiveConversation(conversationId);

    const container = document.getElementById('messages-container');
    container.innerHTML = '<div class="text-center py-4"><div class="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto"></div></div>';
    
    try {
      await this.messageManager.loadMessages(conversationId);
    } catch (error) {
      console.error('❌ Failed to load messages:', error);
      container.innerHTML = '<div class="text-center text-red-500 py-8">Failed to load messages</div>';
    }
  }

  renderMessages(messages) {
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    messages.forEach(msg => this.renderMessage(msg, false));
  }

  renderMessage(message, animate = true) {
    const container = document.getElementById('messages-container');
    const isMine = message.senderId === window.currentUserId;
    const statusIcon = this.getStatusIcon(message.status);

    const messageDiv = document.createElement('div');
    messageDiv.className = `message flex ${isMine ? 'justify-end' : 'justify-start'} mb-4`;
    messageDiv.dataset.messageId = message.id;
    messageDiv.dataset.clientTempId = message.clientTempId;
    
    if (!animate) messageDiv.style.animation = 'none';

    messageDiv.innerHTML = `
      <div class="max-w-[70%]">
        ${!isMine ? `<div class="text-xs text-gray-500 mb-1 ml-2">${this.currentUser.receiverName}</div>` : ''}
        <div class="rounded-2xl px-4 py-3 ${
          isMine 
            ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-br-sm' 
            : 'bg-white text-gray-800 rounded-bl-sm shadow-sm'
        }">
          <div class="break-words">${this.escapeHtml(message.content)}</div>
          <div class="text-xs mt-1 flex items-center gap-1 ${isMine ? 'text-indigo-100' : 'text-gray-400'}">
            <span>${this.formatTime(message.timestamp)}</span>
            ${isMine ? `<span class="message-status">${statusIcon}</span>` : ''}
          </div>
        </div>
      </div>
    `;

    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
  }

  updateMessageStatus(messageId, status) {
    const messageDiv = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageDiv) {
      const statusEl = messageDiv.querySelector('.message-status');
      if (statusEl) {
        statusEl.innerHTML = this.getStatusIcon(status);
      }
    }
  }

  updateMessageStatusByTempId(clientTempId, status) {
    const messageDiv = document.querySelector(`[data-client-temp-id="${clientTempId}"]`);
    if (messageDiv) {
      const statusEl = messageDiv.querySelector('.message-status');
      if (statusEl) {
        statusEl.innerHTML = this.getStatusIcon(status);
      }
    }
  }

  getStatusIcon(status) {
    const icons = {
      [MessageStatus.SENDING]: '⏳',
      [MessageStatus.SENT]: '✓',
      [MessageStatus.DELIVERED]: '✓✓',
      [MessageStatus.READ]: '<span class="text-blue-300">✓✓</span>',
      [MessageStatus.FAILED]: '❌',
      [MessageStatus.QUEUED]: '📥'
    };
    return icons[status] || '';
  }

  attachInputEvents() {
    const input = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');

    let typingTimeout;

    input.addEventListener('input', () => {
      if (this.conversationId) {
        chatService.sendTypingIndicator(
          this.conversationId,
          this.currentUser.receiverId,
          true
        );

        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
          chatService.sendTypingIndicator(
            this.conversationId,
            this.currentUser.receiverId,
            false
          );
        }, 3000);
      }
    });

    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    sendBtn.addEventListener('click', () => {
      this.handleSend();
    });
  }

  async handleSend() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();

    if (!text || !this.conversationId) return;

    try {
      input.value = '';

      chatService.sendTypingIndicator(
        this.conversationId,
        this.currentUser.receiverId,
        false
      );

      await this.messageManager.sendMessage(
        this.conversationId,
        text,
        this.currentUser.receiverId
      );

    } catch (error) {
      console.error('❌ Failed to send:', error);
      input.value = text;
    }
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  updateConnectionStatus(status, text) {
    const statusDot = document.getElementById('status-dot');
    const connectionText = document.getElementById('connection-text');

    const colors = {
      connected: 'bg-green-500',
      connecting: 'bg-yellow-500',
      disconnected: 'bg-gray-300',
      error: 'bg-red-500'
    };

    statusDot.className = `w-2 h-2 rounded-full ${colors[status] || colors.disconnected}`;
    
    if (status === 'connected') {
      statusDot.classList.add('connected');
    } else {
      statusDot.classList.remove('connected');
    }

    connectionText.textContent = text;
  }

  showTypingIndicator(show) {
    const indicator = document.getElementById('typing-indicator');
    if (show) {
      indicator.classList.remove('hidden');
    } else {
      indicator.classList.add('hidden');
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
  });
} else {
  new ChatApp();
}