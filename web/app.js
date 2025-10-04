// web/app.js - COMPLETE VERSION with Phase 1.1 + 1.2 + 1.3 + 2.1 + 3.1 + 3.2
console.log('========================================');
console.log('APP.JS LOADING STARTED');
console.log('========================================');

// ==========================================
// DYNAMIC IMPORTS
// ==========================================
async function loadModules() {
  console.log('\n[STEP 1] Starting module imports...');
  
  try {
    const chatServiceModule = await import('../src/services/chatService');
    const { chatService } = chatServiceModule;
    console.log('  chatService loaded');
    
    const authModule = await import('../src/services/AuthService');
    const { AuthService } = authModule;
    console.log('  AuthService loaded');
    
    const typesModule = await import('../src/types/chat');
    const { ConnectionState, MessageStatus } = typesModule;
    console.log('  Types loaded');
    
    console.log('\n[STEP 1] All modules loaded!\n');
    
    return { chatService, AuthService, ConnectionState, MessageStatus };
    
  } catch (error) {
    console.error('\n[STEP 1] Import failed!', error);
    throw error;
  }
}

// ==========================================
// USER PROFILES
// ==========================================
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

// ==========================================
// CONVERSATION STATE MANAGER (Phase 1.2)
// ==========================================
class ConversationStateManager {
  constructor() {
    this.conversations = new Map();
    this.messagesByConversation = new Map();
    this.unreadCounts = new Map();
    this.typingByConversation = new Map();
    this.activeConversationId = null;
    this.onlineUsers = new Map();
    
    console.log('ConversationStateManager initialized');
  }

  addConversation(conversation) {
    this.conversations.set(conversation.id, {
      id: conversation.id,
      participants: conversation.participants || [],
      metadata: conversation.metadata || {},
      settings: conversation.settings || {},
      lastMessage: conversation.lastMessage || null,
      unreadCount: conversation.unreadCount || 0,
      createdAt: conversation.createdAt || new Date().toISOString(),
      updatedAt: conversation.updatedAt || new Date().toISOString(),
      lastActivity: conversation.lastActivity || new Date().toISOString()
    });
    
    console.log(`Conversation added/updated: ${conversation.id}`);
    return this.conversations.get(conversation.id);
  }

  getConversation(conversationId) {
    return this.conversations.get(conversationId) || null;
  }

  getAllConversations() {
    return Array.from(this.conversations.values());
  }

  removeConversation(conversationId) {
    this.conversations.delete(conversationId);
    this.messagesByConversation.delete(conversationId);
    this.unreadCounts.delete(conversationId);
    this.typingByConversation.delete(conversationId);
    
    if (this.activeConversationId === conversationId) {
      this.activeConversationId = null;
    }
    
    console.log(`Conversation removed: ${conversationId}`);
  }

  updateConversation(conversationId, updates) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return null;
    
    Object.assign(conversation, updates);
    conversation.updatedAt = new Date().toISOString();
    
    this.conversations.set(conversationId, conversation);
    return conversation;
  }

  findConversationByParticipants(userId1, userId2) {
    for (const conv of this.conversations.values()) {
      const participantIds = conv.participants.map(p => p.userId);
      if (participantIds.includes(userId1) && participantIds.includes(userId2)) {
        return conv;
      }
    }
    return null;
  }

  getSortedConversations() {
    const conversations = this.getAllConversations();
    return conversations.sort((a, b) => {
      const timeA = new Date(a.lastActivity || a.updatedAt).getTime();
      const timeB = new Date(b.lastActivity || b.updatedAt).getTime();
      return timeB - timeA;
    });
  }

  addMessage(conversationId, message) {
    if (!this.messagesByConversation.has(conversationId)) {
      this.messagesByConversation.set(conversationId, []);
    }
    
    const messages = this.messagesByConversation.get(conversationId);
    messages.push(message);
    
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.lastMessage = message;
      conversation.lastActivity = message.timestamp;
      conversation.updatedAt = new Date().toISOString();
    }
    
    return message;
  }

  getMessages(conversationId) {
    return this.messagesByConversation.get(conversationId) || [];
  }

  clearMessages(conversationId) {
    this.messagesByConversation.delete(conversationId);
  }

  updateMessageStatus(conversationId, messageId, status) {
    const messages = this.getMessages(conversationId);
    const message = messages.find(m => m.id === messageId || m.clientTempId === messageId);
    
    if (message) {
      message.status = status;
      return true;
    }
    
    return false;
  }

  incrementUnread(conversationId) {
    const current = this.unreadCounts.get(conversationId) || 0;
    this.unreadCounts.set(conversationId, current + 1);
    
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.unreadCount = current + 1;
    }
    
    return current + 1;
  }

  clearUnread(conversationId) {
    this.unreadCounts.set(conversationId, 0);
    
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.unreadCount = 0;
    }
  }

  getUnread(conversationId) {
    return this.unreadCounts.get(conversationId) || 0;
  }

  getTotalUnread() {
    let total = 0;
    for (const count of this.unreadCounts.values()) {
      total += count;
    }
    return total;
  }

  setTyping(conversationId, userId, isTyping) {
    if (!this.typingByConversation.has(conversationId)) {
      this.typingByConversation.set(conversationId, new Set());
    }
    
    const typingUsers = this.typingByConversation.get(conversationId);
    
    if (isTyping) {
      typingUsers.add(userId);
    } else {
      typingUsers.delete(userId);
    }
  }

  getTypingUsers(conversationId) {
    const typingUsers = this.typingByConversation.get(conversationId);
    return typingUsers ? Array.from(typingUsers) : [];
  }

  setOnlineUsers(users) {
    this.onlineUsers.clear();
    users.forEach(user => {
      this.onlineUsers.set(user.id, user);
    });
  }

  getOnlineUsers() {
    return Array.from(this.onlineUsers.values());
  }

  isUserOnline(userId) {
    return this.onlineUsers.has(userId);
  }

  getOnlineUser(userId) {
    return this.onlineUsers.get(userId) || null;
  }

  setActiveConversation(conversationId) {
    this.activeConversationId = conversationId;
    
    if (conversationId) {
      this.clearUnread(conversationId);
    }
  }

  getActiveConversationId() {
    return this.activeConversationId;
  }

  getActiveConversation() {
    if (!this.activeConversationId) return null;
    return this.getConversation(this.activeConversationId);
  }

  saveToStorage() {
    try {
      const state = {
        conversations: Array.from(this.conversations.entries()),
        messages: Array.from(this.messagesByConversation.entries()),
        unreadCounts: Array.from(this.unreadCounts.entries()),
        activeConversationId: this.activeConversationId
      };
      
      localStorage.setItem('chat_state', JSON.stringify(state));
      console.log('State saved to localStorage');
    } catch (error) {
      console.error('Failed to save state:', error);
    }
  }

  loadFromStorage() {
    try {
      const saved = localStorage.getItem('chat_state');
      if (!saved) return false;
      
      const state = JSON.parse(saved);
      
      this.conversations = new Map(state.conversations);
      this.messagesByConversation = new Map(state.messages);
      this.unreadCounts = new Map(state.unreadCounts);
      this.activeConversationId = state.activeConversationId;
      
      console.log('State loaded from localStorage');
      return true;
    } catch (error) {
      console.error('Failed to load state:', error);
      return false;
    }
  }

  clear() {
    this.conversations.clear();
    this.messagesByConversation.clear();
    this.unreadCounts.clear();
    this.typingByConversation.clear();
    this.onlineUsers.clear();
    this.activeConversationId = null;
    
    console.log('State cleared');
  }
}

// ==========================================
// CHAT APP CLASS
// ==========================================
class ChatApp {
  constructor(modules) {
    console.log('\n[STEP 2] Initializing ChatApp...');
    
    this.chatService = modules.chatService;
    this.AuthService = modules.AuthService;
    this.ConnectionState = modules.ConnectionState;
    this.MessageStatus = modules.MessageStatus;
    
    console.log('  Modules assigned to ChatApp');
    
    this.state = new ConversationStateManager();
    console.log('  State manager initialized');
    
    this.currentUser = null;
    this.jobId = `job-${Date.now()}`;
    this.jobTitle = 'Service Request';
    this.searchTerm = '';
    this.conversationSearchTerm = '';
    this.isInitializing = false;
    
    // Phase 3.1 + 3.2 properties
    this.replyingTo = null;
    this.editingMessage = null;
    
    console.log('  State initialized');
    console.log('  Job ID:', this.jobId);
    
    this.init();
  }

  init() {
    console.log('\n[STEP 3] Starting UI initialization...');
    this.renderUserSelection();
    console.log('  User selection rendered');
    
    this.attachRoleSelectionEvents();
    console.log('  Events attached');
    
    console.log('\n[STEP 3] ChatApp initialization complete!');
    console.log('========================================');
    console.log('APPLICATION READY - Select a user to continue');
    console.log('========================================\n');
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
        console.log('User selected:', USER_PROFILES[parseInt(radio.value)].name);
      });
    });

    connectBtn.addEventListener('click', async () => {
      const selectedIndex = document.querySelector('input[name="user"]:checked')?.value;
      if (selectedIndex !== undefined) {
        this.currentUser = USER_PROFILES[parseInt(selectedIndex)];
        console.log('\nLogin initiated for:', this.currentUser.name);
        await this.performLogin();
      }
    });
  }

  async performLogin() {
    try {
      console.log('[LOGIN] Starting authentication...');
      
      const connectBtn = document.getElementById('connect-btn');
      connectBtn.textContent = 'Logging in...';
      connectBtn.disabled = true;

      console.log('  Calling AuthService.login()');
      const loginResult = await this.AuthService.login(
        this.currentUser.email,
        this.currentUser.password,
        this.currentUser.role
      );

      if (!loginResult.success) {
        throw new Error(loginResult.error || 'Login failed');
      }

      console.log('  Login successful!');
      console.log('  Token:', loginResult.token.substring(0, 20) + '...');
      console.log('  User data:', loginResult.user);

      this.currentUser.token = loginResult.token;
      this.currentUser.userData = loginResult.user;

      await this.connectToChat();

    } catch (error) {
      console.error('[LOGIN] Failed:', error);
      console.error('Full error:', error.stack);
      
      const connectBtn = document.getElementById('connect-btn');
      connectBtn.textContent = 'Connect to Chat';
      connectBtn.disabled = false;
      
      alert('Login failed: ' + error.message);
    }
  }

  async connectToChat() {
    if (this.isInitializing) {
      console.log('[CONNECT] Already initializing, skipping...');
      return;
    }

    this.isInitializing = true;

    try {
      console.log('\n[CONNECT] Establishing chat connection...');
      console.log('  Current user:', this.currentUser.name);
      console.log('  User ID:', this.currentUser.userData.id || this.currentUser.id);
      console.log('  Role:', this.currentUser.role);
      console.log('  Has token:', !!this.currentUser.token);
      
      document.getElementById('role-selection').classList.add('hidden');
      document.getElementById('chat-interface').classList.remove('hidden');

      document.getElementById('user-avatar').textContent = this.currentUser.name.charAt(0);
      document.getElementById('user-name').textContent = this.currentUser.name;
      document.getElementById('user-role').textContent = this.currentUser.role.toUpperCase();
      this.updateConnectionStatus('connecting', 'Connecting...');

      console.log('\n[CONNECT] About to call chatService.initialize()');
      console.log('  chatService exists:', !!this.chatService);
      console.log('  chatService.initialize exists:', typeof this.chatService.initialize);

      try {
        console.log('  Calling chatService.initialize...');
        
        await this.chatService.initialize(
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

        console.log('  chatService.initialize() completed');

      } catch (initError) {
        console.error('  chatService.initialize() threw error:', initError);
        console.error('  Error name:', initError.name);
        console.error('  Error message:', initError.message);
        console.error('  Error stack:', initError.stack);
        throw initError;
      }

      console.log('  chatService initialized');

      this.setupEventListeners();
      console.log('  Event listeners attached');
      
      this.setupOnlineUsersPanel();
      console.log('  Online users panel setup');
      
      this.setupConversationsPanel();
      console.log('  Conversations panel setup');
      
      await this.setupConversation();
      console.log('  Ready for user selection');
      
      this.attachInputEvents();
      console.log('  Input events attached');
      
      this.attachOnlineUsersPanelEvents();
      console.log('  Panel events attached');

      this.updateConnectionStatus('connected', 'Connected');
      console.log('\n[CONNECT] Chat connected successfully!\n');

    } catch (error) {
      console.error('[CONNECT] Connection failed:', error);
      console.error('Full error stack:', error.stack);
      
      this.updateConnectionStatus('error', 'Connection Error');
      
      const errorMsg = `Failed to connect: ${error.message}\n\nCheck console for details.`;
      alert(errorMsg);
      
      document.getElementById('chat-interface').classList.add('hidden');
      document.getElementById('role-selection').classList.remove('hidden');
      
      const connectBtn = document.getElementById('connect-btn');
      connectBtn.textContent = 'Connect to Chat';
      connectBtn.disabled = false;
    } finally {
      this.isInitializing = false;
    }
  }

  setupEventListeners() {
    console.log('\n[EVENTS] Setting up socket event listeners...');

    this.chatService.onConnectionStateChange((state) => {
      console.log('[EVENT] Connection state changed:', state);
      
      const stateMap = {
        [this.ConnectionState.CONNECTED]: { status: 'connected', text: 'Connected' },
        [this.ConnectionState.CONNECTING]: { status: 'connecting', text: 'Connecting...' },
        [this.ConnectionState.RECONNECTING]: { status: 'connecting', text: 'Reconnecting...' },
        [this.ConnectionState.DISCONNECTED]: { status: 'disconnected', text: 'Disconnected' },
        [this.ConnectionState.ERROR]: { status: 'error', text: 'Error' }
      };
      
      const { status, text } = stateMap[state] || stateMap[this.ConnectionState.DISCONNECTED];
      this.updateConnectionStatus(status, text);
    });

    this.chatService.onNewMessage((message) => {
      console.log('[EVENT] New message received:', {
        messageId: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        content: message.content.substring(0, 50)
      });
      
      let conversation = this.state.getConversation(message.conversationId);
      
      if (!conversation) {
        console.log('[EVENT] Creating new conversation from message:', message.conversationId);
        conversation = {
          id: message.conversationId,
          participants: [
            { userId: this.currentUser.userData?.id || this.currentUser.id },
            { userId: message.senderId }
          ],
          metadata: {},
          settings: {},
          lastMessage: null,
          unreadCount: 0,
          createdAt: message.timestamp,
          updatedAt: message.timestamp,
          lastActivity: message.timestamp
        };
        this.state.addConversation(conversation);
      }
      
      this.state.addMessage(message.conversationId, message);
      
      this.state.updateConversation(message.conversationId, {
        lastMessage: message,
        lastActivity: message.timestamp,
        updatedAt: message.timestamp
      });
      
      const activeConvId = this.state.getActiveConversationId();
      
      if (message.conversationId === activeConvId) {
        console.log('[EVENT] Message for active conversation - rendering');
        this.renderMessage(message);
        
        if (message.senderId !== (this.currentUser.userData?.id || this.currentUser.id)) {
          setTimeout(() => {
            this.chatService.markMessagesAsRead(message.conversationId, [message.id]);
          }, 500);
        }
      } else {
        if (message.senderId !== (this.currentUser.userData?.id || this.currentUser.id)) {
          console.log('[EVENT] Message for inactive conversation - incrementing unread');
          this.state.incrementUnread(message.conversationId);
        }
      }
      
      this.renderConversations();
    });

    this.chatService.onMessageSent((data) => {
      console.log('[EVENT] Message sent confirmation:', {
        messageId: data.messageId,
        conversationId: data.conversationId,
        clientTempId: data.clientTempId
      });
      
      if (data.conversationId && data.messageId) {
        const updated = this.state.updateMessageStatus(
          data.conversationId,
          data.messageId,
          this.MessageStatus.SENT
        );
        
        if (updated) {
          console.log('[EVENT] Message status updated to SENT');
        }
      }
    });

    this.chatService.onMessageSendError((data) => {
      console.error('[EVENT] Message send error:', {
        error: data.error,
        conversationId: data.conversationId,
        messageId: data.messageId
      });
      
      if (data.conversationId && data.messageId) {
        this.state.updateMessageStatus(
          data.conversationId,
          data.messageId,
          this.MessageStatus.FAILED
        );
      }
      
      this.showErrorNotification('Failed to send message: ' + (data.error || 'Unknown error'));
    });

    this.chatService.onTyping((userId, isTyping) => {
      console.log('[EVENT] Typing indicator:', {
        userId,
        isTyping,
        currentUser: this.currentUser.userData?.id || this.currentUser.id
      });
      
      if (userId === (this.currentUser.userData?.id || this.currentUser.id)) {
        return;
      }
      
      const activeConvId = this.state.getActiveConversationId();
      
      if (activeConvId) {
        this.state.setTyping(activeConvId, userId, isTyping);
        
        const typingUsers = this.state.getTypingUsers(activeConvId);
        
        this.showTypingIndicator(typingUsers.length > 0);
        
        console.log('[EVENT] Active conversation typing users:', typingUsers.length);
      }
    });

    this.chatService.onUserStatusChange((data) => {
      console.log('[EVENT] User status changed:', {
        userId: data.userId,
        isOnline: data.isOnline
      });
      
      this.chatService.getAllOnlineUsers();
    });

    console.log('[EVENTS] All event listeners setup complete');
  }

  setupOnlineUsersPanel() {
    console.log('\n[ONLINE USERS] Setting up panel...');
    this.renderOnlineUsersLoading();
    
    let initialDataReceived = false;
    let requestSent = false;
    
    console.log('  Setting up onOnlineUsersChange listener');
    this.chatService.onOnlineUsersChange((users) => {
      console.log('  [ONLINE USERS] Received update:', users.length, 'users');
      initialDataReceived = true;
      
      this.state.setOnlineUsers(users);
      this.renderOnlineUsers();
    });

    const requestUsers = () => {
      const isConnected = this.chatService.isConnected();
      const state = this.chatService.getConnectionState();
      
      console.log('  [ONLINE USERS] Connection check:', {
        isConnected,
        state,
        requestSent
      });
      
      if (!isConnected) {
        console.log('  [ONLINE USERS] Not connected, waiting...');
        setTimeout(requestUsers, 1000);
        return;
      }
      
      if (requestSent) {
        console.log('  [ONLINE USERS] Request already sent, waiting for response...');
        return;
      }
      
      console.log('  [ONLINE USERS] Sending request...');
      requestSent = true;
      
      try {
        this.chatService.getAllOnlineUsers();
        console.log('  [ONLINE USERS] Request sent successfully');
      } catch (error) {
        console.error('  [ONLINE USERS] Failed to send request:', error);
        requestSent = false;
      }
    };

    setTimeout(() => {
      console.log('\n[ONLINE USERS] Starting request sequence...');
      requestUsers();
    }, 2000);

    setTimeout(() => {
      if (!initialDataReceived) {
        console.warn('[ONLINE USERS] No response after 10s');
        this.state.setOnlineUsers([]);
        this.renderOnlineUsers();
      }
    }, 12000);

    setInterval(() => {
      if (initialDataReceived && this.chatService.isConnected()) {
        console.log('[ONLINE USERS] Periodic refresh...');
        this.chatService.getAllOnlineUsers();
      }
    }, 30000);
  }

  setupConversationsPanel() {
    console.log('\n[CONVERSATIONS] Setting up panel...');
    
    this.renderConversations();
    
    const searchInput = document.getElementById('conversation-search');
    searchInput.addEventListener('input', (e) => {
      this.conversationSearchTerm = e.target.value;
      this.renderConversations();
    });
    
    const toggleBtn = document.getElementById('toggle-conversations-panel');
    const panelBody = document.getElementById('conversations-panel-body');
    
    toggleBtn.addEventListener('click', () => {
      panelBody.classList.toggle('hidden');
      toggleBtn.textContent = panelBody.classList.contains('hidden') ? '▼' : '▲';
    });
    
    console.log('[CONVERSATIONS] Panel setup complete');
  }

  renderOnlineUsersLoading() {
    const container = document.getElementById('online-users-list');
    container.innerHTML = `
      <div class="text-center py-8 text-gray-500">
        <div class="animate-spin w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto mb-2"></div>
        <p class="text-sm">Loading users...</p>
      </div>
    `;
  }

  renderOnlineUsers() {
    const container = document.getElementById('online-users-list');
    const countBadge = document.getElementById('online-count');
    
    const allUsers = this.state.getOnlineUsers();
    const currentUserId = this.currentUser.userData?.id || this.currentUser.id;
    
    const filtered = this.searchTerm
      ? allUsers.filter(user => 
          user.name.toLowerCase().includes(this.searchTerm.toLowerCase())
        )
      : allUsers;

    countBadge.textContent = allUsers.length;

    if (filtered.length === 0) {
      const emptyMessage = this.searchTerm 
        ? 'No users found' 
        : 'No users online';
      
      container.innerHTML = `
        <div class="text-center py-8 text-gray-500">
          <svg class="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <p>${emptyMessage}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(user => {
      const isCurrentUser = user.id === currentUserId;
      
      return `
        <div 
          class="flex items-center gap-3 p-3 rounded-lg transition-colors border-l-4 ${
            isCurrentUser 
              ? 'bg-indigo-50 border-indigo-500 cursor-not-allowed opacity-75' 
              : 'hover:bg-indigo-50 cursor-pointer group border-transparent hover:border-indigo-500'
          }"
          ${!isCurrentUser ? `onclick="window.chatApp.startConversationWithUser(${this.escapeHtml(JSON.stringify(user))})"` : ''}
          ${isCurrentUser ? 'title="You cannot message yourself"' : ''}
        >
          <div class="relative">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br ${
              isCurrentUser 
                ? 'from-purple-400 to-indigo-500' 
                : 'from-indigo-400 to-purple-500'
            } flex items-center justify-center text-white font-semibold shadow-lg">
              ${user.name.charAt(0).toUpperCase()}
            </div>
            ${!isCurrentUser ? `
              <div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
            ` : ''}
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-medium text-gray-800 truncate ${!isCurrentUser ? 'group-hover:text-indigo-600' : ''}">
              ${this.escapeHtml(user.name)}
              ${isCurrentUser ? '<span class="ml-2 px-2 py-0.5 text-xs font-semibold bg-indigo-100 text-indigo-700 rounded-full">You</span>' : ''}
            </div>
            <div class="text-xs text-gray-500 capitalize flex items-center gap-1">
              ${!isCurrentUser ? '<span class="w-1.5 h-1.5 bg-green-500 rounded-full"></span>' : ''}
              ${user.role || 'user'}
            </div>
          </div>
          ${!isCurrentUser ? `
            <svg class="w-5 h-5 text-gray-400 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  renderConversations() {
    const container = document.getElementById('conversations-list');
    const emptyState = document.getElementById('conversations-empty-state');
    const countBadge = document.getElementById('conversations-count');
    const totalUnreadBadge = document.getElementById('total-unread-badge');
    
    let conversations = this.state.getSortedConversations();
    
    if (this.conversationSearchTerm) {
      const term = this.conversationSearchTerm.toLowerCase();
      conversations = conversations.filter(conv => {
        const participantNames = conv.participants
          .map(p => p.name || '')
          .join(' ')
          .toLowerCase();
        
        const lastMessage = conv.lastMessage?.content?.toLowerCase() || '';
        
        return participantNames.includes(term) || lastMessage.includes(term);
      });
    }
    
    countBadge.textContent = conversations.length;
    
    const totalUnread = this.state.getTotalUnread();
    if (totalUnread > 0) {
      totalUnreadBadge.textContent = totalUnread > 99 ? '99+' : totalUnread;
      totalUnreadBadge.classList.remove('hidden');
    } else {
      totalUnreadBadge.classList.add('hidden');
    }
    
    if (conversations.length === 0) {
      emptyState.classList.remove('hidden');
      container.innerHTML = '';
      return;
    }
    
    emptyState.classList.add('hidden');
    
    const currentUserId = this.currentUser.userData?.id || this.currentUser.id;
    const activeConvId = this.state.getActiveConversationId();
    
    container.innerHTML = conversations.map(conv => {
      const otherParticipants = conv.participants.filter(p => p.userId !== currentUserId);
      const otherUser = otherParticipants[0];
      
      if (!otherUser) return '';
      
      const isOnline = this.state.isUserOnline(otherUser.userId);
      
      const lastMessage = conv.lastMessage;
      const lastMessageText = lastMessage ? lastMessage.content : 'No messages yet';
      const lastMessageTime = lastMessage ? this.formatConversationTime(lastMessage.timestamp) : '';
      
      const isActive = conv.id === activeConvId;
      
      const unreadCount = conv.unreadCount || 0;
      
      const typingUsers = this.state.getTypingUsers(conv.id);
      const isTyping = typingUsers.length > 0;
      
      return `
        <div 
          class="flex items-center gap-3 p-4 hover:bg-purple-50 cursor-pointer transition-colors border-l-4 ${
            isActive 
              ? 'bg-purple-50 border-purple-500' 
              : 'border-transparent hover:border-purple-300'
          }"
          onclick="window.chatApp.selectConversation('${conv.id}')"
        >
          <div class="relative flex-shrink-0">
            <div class="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white font-semibold shadow-md">
              ${(otherUser.name || 'U').charAt(0).toUpperCase()}
            </div>
            ${isOnline ? `
              <div class="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full"></div>
            ` : ''}
          </div>
          
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between mb-1">
              <div class="font-semibold text-gray-800 truncate ${isActive ? 'text-purple-600' : ''}">
                ${this.escapeHtml(otherUser.name || 'Unknown User')}
              </div>
              ${lastMessageTime ? `
                <div class="text-xs text-gray-500 flex-shrink-0 ml-2">
                  ${lastMessageTime}
                </div>
              ` : ''}
            </div>
            
            <div class="flex items-center justify-between">
              <div class="text-sm text-gray-600 truncate flex-1">
                ${isTyping ? `
                  <span class="text-purple-600 italic">typing...</span>
                ` : `
                  ${lastMessage && lastMessage.senderId === currentUserId ? 'You: ' : ''}${this.escapeHtml(lastMessageText.substring(0, 50))}${lastMessageText.length > 50 ? '...' : ''}
                `}
              </div>
              
              ${unreadCount > 0 ? `
                <div class="flex-shrink-0 ml-2">
                  <span class="px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                    ${unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  attachOnlineUsersPanelEvents() {
    const toggleBtn = document.getElementById('toggle-panel');
    const panelBody = document.getElementById('panel-body');
    
    toggleBtn.addEventListener('click', () => {
      panelBody.classList.toggle('hidden');
      toggleBtn.textContent = panelBody.classList.contains('hidden') ? '▼' : '▲';
    });

    const searchInput = document.getElementById('user-search');
    searchInput.addEventListener('input', (e) => {
      this.searchTerm = e.target.value;
      this.renderOnlineUsers();
    });

    window.chatApp = this;
  }

  async setupConversation() {
    console.log('Skipping automatic conversation setup');
    console.log('User will select who to chat with from online users');
    
    const container = document.getElementById('messages-container');
    container.innerHTML = `
      <div class="flex items-center justify-center h-full">
        <div class="text-center text-gray-500">
          <svg class="w-20 h-20 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p class="text-lg font-medium mb-2">Select a user to start chatting</p>
          <p class="text-sm">Click on a user from the online users panel</p>
        </div>
      </div>
    `;
  }

  async startConversationWithUser(user) {
    const currentUserId = this.currentUser.userData?.id || this.currentUser.id;
    if (user.id === currentUserId) {
      alert('You cannot start a conversation with yourself');
      console.warn('[CONVERSATION] Attempted to start conversation with self - blocked');
      return;
    }
    
    console.log('[CONVERSATION] Starting conversation with:', user.name);
    
    let existingConv = this.state.findConversationByParticipants(currentUserId, user.id);
    
    if (existingConv) {
      console.log('[CONVERSATION] Found existing conversation in state:', existingConv.id);
      
      await this.selectConversation(existingConv.id);
      return;
    }
    
    const container = document.getElementById('messages-container');
    const emptyState = document.getElementById('chat-empty-state');
    
    if (emptyState) {
      emptyState.classList.add('hidden');
    }
    
    container.innerHTML = `
      <div class="flex items-center justify-center h-full">
        <div class="text-center text-gray-500">
          <div class="animate-spin w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto mb-4"></div>
          <p class="text-lg font-medium">Setting up conversation with ${user.name}...</p>
        </div>
      </div>
    `;
    
    try {
      this.currentUser.receiverId = user.id;
      this.currentUser.receiverName = user.name;
      
      const conversation = await this.chatService.findOrCreateJobConversation(
        this.jobId,
        user.id
      );

      console.log('[CONVERSATION] Got conversation from server:', conversation.id);

      this.state.addConversation({
        id: conversation.id,
        participants: conversation.participants || [
          { 
            userId: currentUserId,
            name: this.currentUser.name,
            isOnline: true,
            isActive: true
          },
          {
            userId: user.id,
            name: user.name,
            isOnline: this.state.isUserOnline(user.id),
            isActive: true
          }
        ],
        metadata: conversation.metadata || {
          jobId: this.jobId,
          jobTitle: this.jobTitle
        },
        settings: conversation.settings || {
          isMuted: false,
          isPinned: false,
          notificationEnabled: true
        },
        lastMessage: conversation.lastMessage || null,
        unreadCount: 0,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        lastActivity: conversation.updatedAt
      });
      
      this.renderConversations();

      console.log('[CONVERSATION] Added to state manager');

      const result = await this.chatService.loadMessages(conversation.id, {
        page: 1,
        limit: 50
      });

      result.messages.forEach(msg => {
        this.state.addMessage(conversation.id, msg);
      });

      console.log(`[CONVERSATION] Loaded ${result.messages.length} messages from server`);

      await this.selectConversation(conversation.id);

      if (result.messages.length === 0) {
        setTimeout(() => {
          this.chatService.sendTextMessage(
            conversation.id,
            `Hello ${user.name}! I'm ${this.currentUser.name}.`,
            user.id
          );
        }, 500);
      }
      
      console.log('[CONVERSATION] Ready');
      
    } catch (error) {
      console.error('[CONVERSATION] Failed to setup:', error);
      
      container.innerHTML = `
        <div class="flex items-center justify-center h-full">
          <div class="text-center text-red-500">
            <svg class="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="text-lg font-medium mb-2">Failed to setup conversation</p>
            <p class="text-sm">${this.escapeHtml(error.message)}</p>
            <button onclick="window.chatApp.startConversationWithUser(${this.escapeHtml(JSON.stringify(user))})" class="mt-4 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600">
              Try Again
            </button>
          </div>
        </div>
      `;
    }
  }

  async selectConversation(conversationId) {
    console.log('[CONVERSATION] Selecting conversation:', conversationId);
    
    const conversation = this.state.getConversation(conversationId);
    
    if (!conversation) {
      console.error('[CONVERSATION] Conversation not found:', conversationId);
      return;
    }
    
    this.state.setActiveConversation(conversationId);
    
    this.state.clearUnread(conversationId);
    
    this.renderConversations();
    
    const currentUserId = this.currentUser.userData?.id || this.currentUser.id;
    const otherParticipant = conversation.participants.find(p => p.userId !== currentUserId);
    
    if (otherParticipant) {
      this.currentUser.receiverId = otherParticipant.userId;
      this.currentUser.receiverName = otherParticipant.name;
    }
    
    const messages = this.state.getMessages(conversationId);
    
    const container = document.getElementById('messages-container');
    const emptyState = document.getElementById('chat-empty-state');
    
    if (emptyState) {
      emptyState.classList.add('hidden');
    }
    
    container.innerHTML = '';
    messages.forEach(msg => this.renderMessage(msg, false));
    
    container.scrollTop = container.scrollHeight;
    
    if (messages.length > 0) {
      const messageIds = messages.slice(-10).map(m => m.id).filter(id => id);
      if (messageIds.length > 0) {
        this.chatService.markMessagesAsRead(conversationId, messageIds);
      }
    }
    
    console.log('[CONVERSATION] Selected, showing', messages.length, 'messages');
  }

  attachInputEvents() {
    const input = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');

    let typingTimeout;

    input.addEventListener('input', () => {
      const conversationId = this.state.getActiveConversationId();
      if (conversationId) {
        this.chatService.sendTypingIndicator(
          conversationId,
          this.currentUser.receiverId,
          true
        );

        clearTimeout(typingTimeout);

        typingTimeout = setTimeout(() => {
          this.chatService.sendTypingIndicator(
            conversationId,
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
    const conversationId = this.state.getActiveConversationId();
    
    if (!text || !conversationId) return;
    
    try {
      input.value = '';
      
      this.chatService.sendTypingIndicator(
        conversationId,
        this.currentUser.receiverId,
        false
      );
      
      if (this.editingMessage) {
        console.log('[SEND] Editing message:', this.editingMessage.messageId);
        
        const messages = this.state.getMessages(conversationId);
        const message = messages.find(m => 
          m.id === this.editingMessage.messageId || 
          m.clientTempId === this.editingMessage.messageId
        );
        
        if (message) {
          message.content = text;
          message.isEdited = true;
          message.editedAt = new Date().toISOString();
          
          const messageElement = document.querySelector(`[data-message-id="${this.editingMessage.messageId}"]`);
          if (messageElement) {
            messageElement.remove();
          }
          this.renderMessage(message, false);
        }
        
        this.cancelEdit();
        this.showToast('Message edited');
        return;
      }
      
      const replyTo = this.replyingTo ? this.replyingTo.messageId : undefined;
      
      console.log('[SEND] Sending message:', {
        conversationId,
        receiverId: this.currentUser.receiverId,
        textLength: text.length,
        replyTo
      });
      
      await this.chatService.sendTextMessage(
        conversationId,
        text,
        this.currentUser.receiverId,
        replyTo
      );
      
      if (this.replyingTo) {
        this.cancelReply();
      }
      
      console.log('[SEND] Message sent successfully');
      
    } catch (error) {
      console.error('[SEND] Failed to send message:', error);
      input.value = text;
      this.showErrorNotification('Failed to send message: ' + error.message);
    }
  }

  // ==========================================
  // PHASE 3.1 + 3.2: ENHANCED MESSAGE DISPLAY
  // ==========================================

  renderMessage(message, animate = true) {
    const container = document.getElementById('messages-container');
    const isMine = message.senderId === this.currentUser.userData?.id || message.senderId === this.currentUser.id;
    
    const messages = Array.from(container.children).filter(el => el.classList.contains('message-wrapper'));
    const lastMessage = messages[messages.length - 1];
    
    let shouldGroup = false;
    if (lastMessage) {
      const prevSenderId = lastMessage.dataset.senderId;
      const prevTimestamp = lastMessage.dataset.timestamp;
      const timeDiff = new Date(message.timestamp) - new Date(prevTimestamp);
      shouldGroup = prevSenderId === message.senderId && timeDiff < 300000;
    }
    
    const needsDateSeparator = this.needsDateSeparator(container, message.timestamp);
    
    if (needsDateSeparator) {
      const separator = this.createDateSeparator(message.timestamp);
      container.appendChild(separator);
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message-wrapper ${shouldGroup ? 'mb-1' : 'mb-4'}`;
    messageDiv.dataset.messageId = message.id || message.clientTempId;
    messageDiv.dataset.senderId = message.senderId;
    messageDiv.dataset.timestamp = message.timestamp;
    
    if (!animate) {
      messageDiv.style.animation = 'none';
    }
    
    const statusIcon = this.getEnhancedStatusIcon(message.status);
    const canEdit = isMine && this.canEditMessage(message);
    const canDelete = isMine;
    
    messageDiv.innerHTML = `
      <div class="flex ${isMine ? 'justify-end' : 'justify-start'}">
        <div class="flex gap-2 max-w-[70%] ${isMine ? 'flex-row-reverse' : 'flex-row'}">
          ${!shouldGroup ? `
            <div class="flex-shrink-0">
              <div class="w-8 h-8 rounded-full bg-gradient-to-br ${
                isMine 
                  ? 'from-indigo-400 to-purple-500' 
                  : 'from-purple-400 to-pink-500'
              } flex items-center justify-center text-white text-xs font-semibold shadow">
                ${(isMine ? this.currentUser.name : this.currentUser.receiverName || 'U').charAt(0).toUpperCase()}
              </div>
            </div>
          ` : '<div class="w-8"></div>'}
          
          <div class="flex-1 min-w-0">
            ${!shouldGroup && !isMine ? `
              <div class="text-xs text-gray-500 mb-1 ml-2 font-medium">${this.escapeHtml(this.currentUser.receiverName || 'User')}</div>
            ` : ''}
            
            ${message.replyTo ? `
              <div class="mb-1 ml-2">
                <div class="text-xs p-2 rounded-lg bg-gray-100 border-l-2 ${isMine ? 'border-indigo-400' : 'border-purple-400'} cursor-pointer hover:bg-gray-200 transition-colors"
                     onclick="window.chatApp.scrollToMessage('${message.replyTo}')">
                  <div class="text-gray-600 font-medium mb-0.5">↩ Replying to</div>
                  <div class="text-gray-700 truncate">${this.escapeHtml(this.getReplyPreview(message.replyTo))}</div>
                </div>
              </div>
            ` : ''}
            
            <div class="group relative">
              <div class="message-bubble rounded-2xl px-4 py-2.5 ${
                isMine 
                  ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-br-sm' 
                  : 'bg-white text-gray-800 rounded-bl-sm shadow-sm border border-gray-100'
              } ${message.status === this.MessageStatus.FAILED ? 'opacity-60 border-red-300' : ''}">
                
                <div class="break-words whitespace-pre-wrap" id="message-content-${message.id || message.clientTempId}">
                  ${this.escapeHtml(message.content)}
                </div>
                
                ${message.isEdited ? `
                  <div class="text-xs ${isMine ? 'text-indigo-200' : 'text-gray-400'} mt-1">
                    (edited)
                  </div>
                ` : ''}
                
                <div class="text-xs mt-1 flex items-center gap-1.5 ${isMine ? 'text-indigo-100' : 'text-gray-400'}">
                  <span>${this.formatTime(message.timestamp)}</span>
                  ${isMine ? `<span>${statusIcon}</span>` : ''}
                </div>
              </div>
              
              ${message.status === this.MessageStatus.FAILED ? `
                <button 
                  onclick="window.chatApp.retryMessage('${message.id || message.clientTempId}')"
                  class="mt-1 text-xs px-3 py-1 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors flex items-center gap-1"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Retry
                </button>
              ` : ''}
              
              <div class="message-actions absolute ${isMine ? 'left-0' : 'right-0'} top-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 -translate-y-8">
                <button 
                  onclick="window.chatApp.replyToMessage('${message.id || message.clientTempId}')"
                  class="p-1.5 bg-white rounded-lg shadow-md hover:bg-gray-50 transition-colors"
                  title="Reply"
                >
                  <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </button>
                
                <button 
                  onclick="window.chatApp.copyMessage('${message.id || message.clientTempId}')"
                  class="p-1.5 bg-white rounded-lg shadow-md hover:bg-gray-50 transition-colors"
                  title="Copy"
                >
                  <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                
                ${canEdit ? `
                  <button 
                    onclick="window.chatApp.editMessage('${message.id || message.clientTempId}')"
                    class="p-1.5 bg-white rounded-lg shadow-md hover:bg-gray-50 transition-colors"
                    title="Edit"
                  >
                    <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                ` : ''}
                
                ${canDelete ? `
                  <button 
                    onclick="window.chatApp.deleteMessage('${message.id || message.clientTempId}')"
                    class="p-1.5 bg-white rounded-lg shadow-md hover:bg-red-50 transition-colors"
                    title="Delete"
                  >
                    <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
  }

  needsDateSeparator(container, timestamp) {
    const messages = Array.from(container.children).filter(el => 
      el.classList.contains('message-wrapper')
    );
    
    if (messages.length === 0) return true;
    
    const lastMessage = messages[messages.length - 1];
    const lastTimestamp = lastMessage.dataset.timestamp;
    
    if (!lastTimestamp) return false;
    
    const lastDate = new Date(lastTimestamp);
    const currentDate = new Date(timestamp);
    
    return lastDate.toDateString() !== currentDate.toDateString();
  }

  createDateSeparator(timestamp) {
    const separator = document.createElement('div');
    separator.className = 'date-separator flex items-center gap-3 my-6';
    
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    let dateText;
    if (date.toDateString() === today.toDateString()) {
      dateText = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      dateText = 'Yesterday';
    } else {
      dateText = date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric' 
      });
    }
    
    separator.innerHTML = `
      <div class="flex-1 h-px bg-gray-200"></div>
      <div class="text-xs font-medium text-gray-500 px-3 py-1 bg-gray-100 rounded-full">
        ${dateText}
      </div>
      <div class="flex-1 h-px bg-gray-200"></div>
    `;
    
    return separator;
  }

  getEnhancedStatusIcon(status) {
    const icons = {
      [this.MessageStatus.SENDING]: `
        <svg class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      `,
      [this.MessageStatus.SENT]: `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      `,
      [this.MessageStatus.DELIVERED]: `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7M5 13l4 4L19 7" />
        </svg>
      `,
      [this.MessageStatus.READ]: `
        <svg class="w-4 h-4 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7M5 13l4 4L19 7" />
        </svg>
      `,
      [this.MessageStatus.FAILED]: `
        <svg class="w-4 h-4 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      `,
      [this.MessageStatus.QUEUED]: `
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      `
    };
    return icons[status] || '';
  }

  canEditMessage(message) {
    const messageTime = new Date(message.timestamp).getTime();
    const now = Date.now();
    const fifteenMinutes = 15 * 60 * 1000;
    
    return (now - messageTime) < fifteenMinutes;
  }

  getReplyPreview(messageId) {
    const conversationId = this.state.getActiveConversationId();
    if (!conversationId) return 'Original message';
    
    const messages = this.state.getMessages(conversationId);
    const originalMessage = messages.find(m => 
      m.id === messageId || m.clientTempId === messageId
    );
    
    if (!originalMessage) return 'Original message';
    
    const preview = originalMessage.content.substring(0, 50);
    return preview + (originalMessage.content.length > 50 ? '...' : '');
  }

  replyToMessage(messageId) {
    console.log('[ACTION] Reply to message:', messageId);
    
    const conversationId = this.state.getActiveConversationId();
    if (!conversationId) return;
    
    const messages = this.state.getMessages(conversationId);
    const message = messages.find(m => m.id === messageId || m.clientTempId === messageId);
    
    if (!message) {
      console.error('[ACTION] Message not found for reply');
      return;
    }
    
    this.replyingTo = {
      messageId: message.id || message.clientTempId,
      content: message.content,
      senderName: message.senderId === (this.currentUser.userData?.id || this.currentUser.id)
        ? 'You'
        : this.currentUser.receiverName
    };
    
    this.showReplyPreview();
    
    document.getElementById('message-input').focus();
  }

  showReplyPreview() {
    if (!this.replyingTo) return;
    
    const inputContainer = document.querySelector('#message-input').parentElement;
    
    const existingPreview = inputContainer.querySelector('.reply-preview');
    if (existingPreview) {
      existingPreview.remove();
    }
    
    const preview = document.createElement('div');
    preview.className = 'reply-preview mb-2 p-3 bg-purple-50 border-l-4 border-purple-500 rounded flex items-start gap-2';
    preview.innerHTML = `
      <div class="flex-1 min-w-0">
        <div class="text-xs font-medium text-purple-700 mb-1">
          Replying to ${this.escapeHtml(this.replyingTo.senderName)}
        </div>
        <div class="text-sm text-gray-700 truncate">
          ${this.escapeHtml(this.replyingTo.content.substring(0, 100))}
        </div>
      </div>
      <button 
        onclick="window.chatApp.cancelReply()"
        class="flex-shrink-0 p-1 hover:bg-purple-100 rounded transition-colors"
      >
        <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    `;
    
    inputContainer.insertBefore(preview, inputContainer.firstChild);
  }

  cancelReply() {
    this.replyingTo = null;
    
    const preview = document.querySelector('.reply-preview');
    if (preview) {
      preview.remove();
    }
  }

  async copyMessage(messageId) {
    console.log('[ACTION] Copy message:', messageId);
    
    const conversationId = this.state.getActiveConversationId();
    if (!conversationId) return;
    
    const messages = this.state.getMessages(conversationId);
    const message = messages.find(m => m.id === messageId || m.clientTempId === messageId);
    
    if (!message) return;
    
    try {
      await navigator.clipboard.writeText(message.content);
      this.showToast('Message copied to clipboard');
    } catch (error) {
      console.error('[ACTION] Failed to copy:', error);
      this.showToast('Failed to copy message', 'error');
    }
  }

  editMessage(messageId) {
    console.log('[ACTION] Edit message:', messageId);
    
    const conversationId = this.state.getActiveConversationId();
    if (!conversationId) return;
    
    const messages = this.state.getMessages(conversationId);
    const message = messages.find(m => m.id === messageId || m.clientTempId === messageId);
    
    if (!message) return;
    
    if (!this.canEditMessage(message)) {
      this.showToast('Message can only be edited within 15 minutes', 'error');
      return;
    }
    
    this.editingMessage = {
      messageId: message.id || message.clientTempId,
      originalContent: message.content
    };
    
    const input = document.getElementById('message-input');
    input.value = message.content;
    input.focus();
    
    this.showEditingIndicator();
  }

  showEditingIndicator() {
    if (!this.editingMessage) return;
    
    const inputContainer = document.querySelector('#message-input').parentElement;
    
    const existingIndicator = inputContainer.querySelector('.editing-indicator');
    if (existingIndicator) {
      existingIndicator.remove();
    }
    
    const indicator = document.createElement('div');
    indicator.className = 'editing-indicator mb-2 p-3 bg-blue-50 border-l-4 border-blue-500 rounded flex items-center gap-2';
    indicator.innerHTML = `
      <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
      <div class="flex-1 text-sm font-medium text-blue-700">
        Editing message
      </div>
      <button 
        onclick="window.chatApp.cancelEdit()"
        class="text-sm text-blue-600 hover:text-blue-800 font-medium"
      >
        Cancel
      </button>
    `;
    
    inputContainer.insertBefore(indicator, inputContainer.firstChild);
  }

  cancelEdit() {
    this.editingMessage = null;
    
    const indicator = document.querySelector('.editing-indicator');
    if (indicator) {
      indicator.remove();
    }
    
    const input = document.getElementById('message-input');
    input.value = '';
  }

  async deleteMessage(messageId) {
    console.log('[ACTION] Delete message:', messageId);
    
    if (!confirm('Delete this message?')) {
      return;
    }
    
    const conversationId = this.state.getActiveConversationId();
    if (!conversationId) return;
    
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      const bubble = messageElement.querySelector('.message-bubble');
      if (bubble) {
        bubble.innerHTML = '<div class="text-gray-400 italic">This message was deleted</div>';
        bubble.classList.add('opacity-50');
      }
      
      const actions = messageElement.querySelector('.message-actions');
      if (actions) {
        actions.remove();
      }
    }
    
    this.showToast('Message deleted');
  }

  async retryMessage(messageId) {
    console.log('[ACTION] Retry message:', messageId);
    
    const conversationId = this.state.getActiveConversationId();
    if (!conversationId) return;
    
    const messages = this.state.getMessages(conversationId);
    const message = messages.find(m => m.id === messageId || m.clientTempId === messageId);
    
    if (!message) return;
    
    try {
      this.state.updateMessageStatus(conversationId, messageId, this.MessageStatus.SENDING);
      
      const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
      if (messageElement) {
        messageElement.remove();
      }
      this.renderMessage(message, false);
      
      await this.chatService.sendTextMessage(
        conversationId,
        message.content,
        this.currentUser.receiverId,
        message.replyTo
      );
      
    } catch (error) {
      console.error('[ACTION] Retry failed:', error);
      this.state.updateMessageStatus(conversationId, messageId, this.MessageStatus.FAILED);
      this.showToast('Failed to send message', 'error');
    }
  }

  scrollToMessage(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      messageElement.classList.add('bg-yellow-100');
      setTimeout(() => {
        messageElement.classList.remove('bg-yellow-100');
      }, 2000);
    }
  }

  showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 animate-slide-in ${
      type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
    }`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  formatConversationTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
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

  showErrorNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-slide-in';
    notification.innerHTML = `
      <div class="flex items-center gap-3">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>${this.escapeHtml(message)}</span>
        <button onclick="this.parentElement.parentElement.remove()" class="ml-2 hover:bg-red-600 rounded p-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// ==========================================
// MAIN START
// ==========================================
async function startApp() {
  console.log('Starting app...');
  
  try {
    const modules = await loadModules();
    
    if (document.readyState === 'loading') {
      await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve);
      });
    }
    
    new ChatApp(modules);
    
  } catch (error) {
    console.error('Fatal error:', error);
    console.error('Error stack:', error.stack);
    alert('Failed to start: ' + error.message);
  }
}

startApp();