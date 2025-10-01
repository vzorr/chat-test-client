// web/app.js - Enhanced with Online Users Panel
import { chatService } from '../src/services/ChatService.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { ConnectionState, MessageStatus } from '../src/types/chat.ts';

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
    name: 'Amir Sohail',
    role: 'customer',
    email: 'amirsohail681@gmail.com',
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
    this.messageHistory = [];
    this.onlineUsers = [];
    this.jobId = `job-${Date.now()}`;
    this.jobTitle = 'Service Request';
    this.searchTerm = '';
    
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
      const originalText = connectBtn.textContent;
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
      
      alert('Login failed: ' + error.message + '\n\nPlease check your credentials.');
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

      console.log('🚀 Initializing chat with token:', this.currentUser.token.substring(0, 20) + '...');

      await chatService.initialize(
        this.currentUser.userData.id || this.currentUser.id,
        this.currentUser.role,
        this.currentUser.token,
        undefined,
        {
          id: this.currentUser.userData.id || this.currentUser.id,
          externalId: this.currentUser.userData.id || this.currentUser.id,
          name: this.currentUser.name,
          email: this.currentUser.email,
          phone: this.currentUser.phone,
          role: this.currentUser.role
        }
      );

      this.setupEventListeners();
      this.setupOnlineUsersPanel(); // NEW
      await this.setupConversation();
      this.attachInputEvents();
      this.attachOnlineUsersPanelEvents(); // NEW

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
    chatService.onConnectionStateChange((state) => {
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

    chatService.onNewMessage((message) => {
      console.log('💬 New message:', message);
      this.messageHistory.push(message);
      this.renderMessage(message);
    });

    chatService.onMessageSent((data) => {
      console.log('✅ Message sent:', data.messageId);
    });

    chatService.onMessageSendError((data) => {
      console.error('❌ Send error:', data.error);
      this.showError('Failed to send message');
    });

    chatService.onTyping((userId, isTyping) => {
      if (userId !== this.currentUser.id) {
        this.showTypingIndicator(isTyping);
      }
    });
  }

  // ==========================================
  // ONLINE USERS PANEL - NEW
  // ==========================================

  setupOnlineUsersPanel() {
    // Subscribe to online users updates
    chatService.onOnlineUsersChange((users) => {
      console.log('👥 Online users updated:', users.length);
      this.onlineUsers = users;
      this.renderOnlineUsers();
    });

    // Request initial list
    chatService.getAllOnlineUsers();

    // Auto-refresh every 30 seconds as fallback
    setInterval(() => {
      chatService.getAllOnlineUsers();
    }, 30000);
  }

  renderOnlineUsers() {
    const container = document.getElementById('online-users-list');
    const countBadge = document.getElementById('online-count');
    
    // Filter by search term
    const filtered = this.searchTerm
      ? this.onlineUsers.filter(user => 
          user.name.toLowerCase().includes(this.searchTerm.toLowerCase())
        )
      : this.onlineUsers;

    // Update count
    countBadge.textContent = this.onlineUsers.length;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8 text-gray-500">
          <svg class="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <p>${this.searchTerm ? 'No users found' : 'No users online'}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(user => `
      <div class="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer group">
        <div class="relative">
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-semibold">
            ${user.name.charAt(0).toUpperCase()}
          </div>
          <div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-medium text-gray-800 truncate">${this.escapeHtml(user.name)}</div>
          <div class="text-xs text-gray-500 capitalize">${user.role || 'user'}</div>
        </div>
        ${user.id !== this.currentUser.userData.id && user.id !== this.currentUser.id ? `
          <button 
            class="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-600 hover:text-indigo-700 text-sm font-medium"
            onclick="window.chatApp.startChatWith('${user.id}', '${this.escapeHtml(user.name)}')"
          >
            Chat
          </button>
        ` : ''}
      </div>
    `).join('');
  }

  attachOnlineUsersPanelEvents() {
    // Toggle panel
    const toggleBtn = document.getElementById('toggle-panel');
    const panelBody = document.getElementById('panel-body');
    
    toggleBtn.addEventListener('click', () => {
      panelBody.classList.toggle('hidden');
      toggleBtn.textContent = panelBody.classList.contains('hidden') ? '▼' : '▲';
    });

    // Search users
    const searchInput = document.getElementById('user-search');
    searchInput.addEventListener('input', (e) => {
      this.searchTerm = e.target.value;
      this.renderOnlineUsers();
    });

    // Make this available for onclick handlers
    window.chatApp = this;
  }

  async startChatWith(userId, userName) {
    console.log(`💬 Starting chat with ${userName} (${userId})`);
    // You can implement this to switch conversations
    alert(`Starting chat with ${userName} - Coming soon!`);
  }

  // ==========================================
  // EXISTING METHODS (unchanged)
  // ==========================================

  async setupConversation() {
    console.log('🔍 Setting up conversation...');
    
    const conversation = await chatService.findOrCreateJobConversation(
      this.jobId,
      this.currentUser.receiverId
    );

    this.conversationId = conversation.id;
    console.log('✅ Conversation ready:', this.conversationId);

    const result = await chatService.loadMessages(this.conversationId, {
      page: 1,
      limit: 50
    });

    this.messageHistory = result.messages;
    console.log(`📜 Loaded ${result.messages.length} messages`);

    result.messages.forEach(msg => this.renderMessage(msg, false));

    if (result.messages.length === 0) {
      setTimeout(() => {
        chatService.sendTextMessage(
          this.conversationId,
          `Hello! I'm ${this.currentUser.name}. How can I help you today?`,
          this.currentUser.receiverId
        );
      }, 1000);
    }
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

      await chatService.sendTextMessage(
        this.conversationId,
        text,
        this.currentUser.receiverId
      );

    } catch (error) {
      console.error('❌ Failed to send:', error);
      this.showError('Failed to send message');
      input.value = text;
    }
  }

  renderMessage(message, animate = true) {
    const container = document.getElementById('messages-container');
    const isMine = message.senderId === this.currentUser.userData?.id || message.senderId === this.currentUser.id;
    const statusIcon = this.getStatusIcon(message.status);

    const messageDiv = document.createElement('div');
    messageDiv.className = `message flex ${isMine ? 'justify-end' : 'justify-start'} mb-4`;
    
    if (!animate) {
      messageDiv.style.animation = 'none';
    }

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
            ${isMine ? `<span>${statusIcon}</span>` : ''}
          </div>
        </div>
      </div>
    `;

    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
  }

  getStatusIcon(status) {
    const icons = {
      [MessageStatus.SENDING]: '⏳',
      [MessageStatus.SENT]: '✓',
      [MessageStatus.DELIVERED]: '✓✓',
      [MessageStatus.READ]: '✓✓',
      [MessageStatus.FAILED]: '❌',
      [MessageStatus.QUEUED]: '📥',
      [MessageStatus.EXPIRED]: '⏰'
    };
    return icons[status] || '';
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

  showError(message) {
    console.error(message);
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