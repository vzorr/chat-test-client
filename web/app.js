// web/app.js - Main application logic for web chat client
import { chatService } from '../src/services/ChatService.ts';
import { ConnectionState, MessageStatus } from '../src/types/chat.ts';

// Predefined user profiles for testing
const USER_PROFILES = [
  {
    id: '091e4c17-47ab-4150-8b45-ea36dd2c2de9',
    name: 'Babar Khan',
    role: 'usta',
    email: 'babar@myusta.al',
    phone: '+355123456789',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    receiverId: 'customer-001',
    receiverName: 'Customer'
  },
  {
    id: 'customer-001',
    name: 'John Doe',
    role: 'customer',
    email: 'john@example.com',
    phone: '+355987654321',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    receiverId: '091e4c17-47ab-4150-8b45-ea36dd2c2de9',
    receiverName: 'Babar Khan'
  }
];

class ChatApp {
  constructor() {
    this.currentUser = null;
    this.conversationId = null;
    this.messageHistory = [];
    this.jobId = `job-${Date.now()}`;
    this.jobTitle = 'Service Request';
    
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
        await this.connectToChat();
      }
    });
  }

  async connectToChat() {
    try {
      // Show chat interface
      document.getElementById('role-selection').classList.add('hidden');
      document.getElementById('chat-interface').classList.remove('hidden');

      // Update header
      document.getElementById('user-avatar').textContent = this.currentUser.name.charAt(0);
      document.getElementById('user-name').textContent = this.currentUser.name;
      document.getElementById('user-role').textContent = this.currentUser.role.toUpperCase();
      this.updateConnectionStatus('connecting', 'Connecting...');

      // Initialize chat service
      await chatService.initialize(
        this.currentUser.id,
        this.currentUser.role,
        this.currentUser.token,
        undefined,
        {
          id: this.currentUser.id,
          externalId: this.currentUser.id,
          name: this.currentUser.name,
          email: this.currentUser.email,
          phone: this.currentUser.phone,
          role: this.currentUser.role
        }
      );

      // Setup event listeners
      this.setupEventListeners();

      // Setup conversation
      await this.setupConversation();

      // Attach input events
      this.attachInputEvents();

      this.updateConnectionStatus('connected', 'Connected');
      console.log('✅ Chat connected successfully');

    } catch (error) {
      console.error('❌ Connection failed:', error);
      this.updateConnectionStatus('error', 'Connection Error');
      alert('Failed to connect: ' + error.message);
    }
  }

  setupEventListeners() {
    // Connection state changes
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

    // New messages
    chatService.onNewMessage((message) => {
      console.log('💬 New message:', message);
      this.messageHistory.push(message);
      this.renderMessage(message);
    });

    // Message sent
    chatService.onMessageSent((data) => {
      console.log('✅ Message sent:', data.messageId);
    });

    // Message error
    chatService.onMessageSendError((data) => {
      console.error('❌ Send error:', data.error);
      this.showError('Failed to send message');
    });

    // Typing indicator
    chatService.onTyping((userId, isTyping) => {
      if (userId !== this.currentUser.id) {
        this.showTypingIndicator(isTyping);
      }
    });
  }

  async setupConversation() {
    console.log('🔍 Setting up conversation...');
    
    const conversation = await chatService.findOrCreateJobConversation(
      this.jobId,
      this.currentUser.receiverId
    );

    this.conversationId = conversation.id;
    console.log('✅ Conversation ready:', this.conversationId);

    // Load existing messages
    const result = await chatService.loadMessages(this.conversationId, {
      page: 1,
      limit: 50
    });

    this.messageHistory = result.messages;
    console.log(`📜 Loaded ${result.messages.length} messages`);

    // Render messages
    result.messages.forEach(msg => this.renderMessage(msg, false));

    // Send greeting if new conversation
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
      // Send typing indicator
      if (this.conversationId) {
        chatService.sendTypingIndicator(
          this.conversationId,
          this.currentUser.receiverId,
          true
        );

        // Clear previous timeout
        clearTimeout(typingTimeout);

        // Stop typing after 3 seconds
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
      // Clear input immediately
      input.value = '';

      // Stop typing indicator
      chatService.sendTypingIndicator(
        this.conversationId,
        this.currentUser.receiverId,
        false
      );

      // Send message
      await chatService.sendTextMessage(
        this.conversationId,
        text,
        this.currentUser.receiverId
      );

    } catch (error) {
      console.error('❌ Failed to send:', error);
      this.showError('Failed to send message');
      // Restore text in input
      input.value = text;
    }
  }

  renderMessage(message, animate = true) {
    const container = document.getElementById('messages-container');
    const isMine = message.senderId === this.currentUser.id;
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
    
    // Scroll to bottom
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
    // Simple alert for now - could be improved with toast notifications
    console.error(message);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
  });
} else {
  new ChatApp();
}