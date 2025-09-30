// web/main.ts - Browser version of the chat client
import { chatService } from '../src/services/ChatService';
import { ConnectionState, MessageStatus } from '../src/types/chat';
import type { Message } from '../src/types/chat';

// Get configuration from environment variables or use defaults
const CONFIG = {
  TOKEN: import.meta.env.VITE_AUTH_TOKEN || '',
  USER_ID: import.meta.env.VITE_USER_ID || '',
  USER_NAME: import.meta.env.VITE_USER_NAME || 'Test User',
  USER_EMAIL: import.meta.env.VITE_USER_EMAIL || 'test@example.com',
  USER_PHONE: import.meta.env.VITE_USER_PHONE || '',
  USER_ROLE: import.meta.env.VITE_USER_ROLE || 'usta',
  RECEIVER_ID: import.meta.env.VITE_RECEIVER_ID || '',
  RECEIVER_NAME: import.meta.env.VITE_RECEIVER_NAME || 'Customer',
  JOB_ID: import.meta.env.VITE_JOB_ID || `job-${Date.now()}`,
  JOB_TITLE: import.meta.env.VITE_JOB_TITLE || 'Service Request'
};

class WebChatClient {
  private conversationId: string | null = null;
  private messageHistory: Message[] = [];
  
  async start() {
    console.log('🚀 Starting Web Chat Client...');
    this.renderUI();
    await this.initialize();
  }

  private renderUI() {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
      <div class="chat-container">
        <!-- Header -->
        <div class="chat-header">
          <div>
            <h1>MyUsta Chat Client v2.0</h1>
            <p>User: ${CONFIG.USER_NAME} (${CONFIG.USER_ROLE})</p>
          </div>
          <div class="status-container">
            <div id="status-dot" class="status-dot disconnected"></div>
            <span id="status-text">Initializing...</span>
          </div>
        </div>

        <!-- Messages Area -->
        <div class="messages-wrapper">
          <div id="messages" class="messages-container"></div>
        </div>

        <!-- Input Area -->
        <div class="input-container">
          <input 
            id="message-input" 
            type="text" 
            placeholder="Type a message..." 
            class="message-input"
          />
          <button id="send-btn" class="send-button">
            Send
          </button>
        </div>

        <!-- Commands -->
        <div class="commands-bar">
          <span style="opacity: 0.7;">Commands:</span>
          <button class="cmd-btn" data-cmd="/status">Status</button>
          <button class="cmd-btn" data-cmd="/retry">Retry Failed</button>
          <button class="cmd-btn" data-cmd="/queue">Queue</button>
          <button class="cmd-btn" data-cmd="/history">History</button>
          <button class="cmd-btn" data-cmd="/clear">Clear</button>
        </div>
      </div>
    `;

    this.injectStyles();
    this.attachEventListeners();
  }

  private injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        height: 100vh;
        overflow: hidden;
      }

      .chat-container {
        width: 100%;
        max-width: 1200px;
        height: 100vh;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        background: white;
      }

      .chat-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      }

      .chat-header h1 {
        font-size: 24px;
        font-weight: 600;
        margin-bottom: 5px;
      }

      .chat-header p {
        font-size: 14px;
        opacity: 0.9;
      }

      .status-container {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
      }

      .status-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        transition: background 0.3s;
      }

      .status-dot.connected {
        background: #10b981;
        box-shadow: 0 0 10px #10b981;
      }

      .status-dot.connecting {
        background: #f59e0b;
        animation: pulse 1.5s infinite;
      }

      .status-dot.disconnected {
        background: #ef4444;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .messages-wrapper {
        flex: 1;
        overflow: hidden;
        background: #f9fafb;
      }

      .messages-container {
        height: 100%;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .message {
        display: flex;
        animation: slideIn 0.3s ease-out;
      }

      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .message.mine {
        justify-content: flex-end;
      }

      .message.theirs {
        justify-content: flex-start;
      }

      .message-bubble {
        max-width: 70%;
        padding: 12px 16px;
        border-radius: 12px;
        word-wrap: break-word;
      }

      .message.mine .message-bubble {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border-bottom-right-radius: 4px;
      }

      .message.theirs .message-bubble {
        background: white;
        color: #1f2937;
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }

      .message-content {
        font-size: 14px;
        line-height: 1.5;
        margin-bottom: 4px;
      }

      .message-meta {
        font-size: 11px;
        opacity: 0.7;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .input-container {
        padding: 20px;
        background: white;
        border-top: 1px solid #e5e7eb;
        display: flex;
        gap: 12px;
      }

      .message-input {
        flex: 1;
        padding: 12px 16px;
        border: 2px solid #e5e7eb;
        border-radius: 8px;
        font-size: 14px;
        transition: border-color 0.2s;
      }

      .message-input:focus {
        outline: none;
        border-color: #667eea;
      }

      .send-button {
        padding: 12px 32px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        transition: transform 0.2s, box-shadow 0.2s;
      }

      .send-button:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      }

      .send-button:active {
        transform: translateY(0);
      }

      .commands-bar {
        padding: 12px 20px;
        background: #f9fafb;
        border-top: 1px solid #e5e7eb;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
      }

      .cmd-btn {
        padding: 6px 12px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
      }

      .cmd-btn:hover {
        background: #667eea;
        color: white;
        border-color: #667eea;
      }

      /* Scrollbar styling */
      .messages-container::-webkit-scrollbar {
        width: 8px;
      }

      .messages-container::-webkit-scrollbar-track {
        background: #f1f1f1;
      }

      .messages-container::-webkit-scrollbar-thumb {
        background: #888;
        border-radius: 4px;
      }

      .messages-container::-webkit-scrollbar-thumb:hover {
        background: #555;
      }
    `;
    document.head.appendChild(style);
  }

  private attachEventListeners() {
    const input = document.getElementById('message-input') as HTMLInputElement;
    const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
    
    sendBtn?.addEventListener('click', () => this.handleSend());
    input?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    // Command buttons
    document.querySelectorAll('.cmd-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cmd = (e.target as HTMLElement).dataset.cmd;
        if (cmd) this.handleCommand(cmd);
      });
    });
  }

  private async initialize() {
    try {
      this.updateStatus('connecting', 'Connecting...');
      this.log('🚀 Initializing chat service...');
      
      // Validate configuration
      if (!CONFIG.TOKEN) {
        throw new Error('AUTH_TOKEN is required. Please set VITE_AUTH_TOKEN in .env');
      }
      if (!CONFIG.USER_ID) {
        throw new Error('USER_ID is required. Please set VITE_USER_ID in .env');
      }
      if (!CONFIG.RECEIVER_ID) {
        throw new Error('RECEIVER_ID is required. Please set VITE_RECEIVER_ID in .env');
      }

      await chatService.initialize(
        CONFIG.USER_ID,
        CONFIG.USER_ROLE,
        CONFIG.TOKEN,
        undefined,
        {
          id: CONFIG.USER_ID,
          externalId: CONFIG.USER_ID,
          name: CONFIG.USER_NAME,
          email: CONFIG.USER_EMAIL,
          phone: CONFIG.USER_PHONE,
          role: CONFIG.USER_ROLE as any
        }
      );

      this.setupEventListeners();
      await this.setupConversation();
      
      this.updateStatus('connected', 'Connected');
      this.log('✅ Chat service initialized successfully');
      
    } catch (error: any) {
      this.log('❌ Initialization failed: ' + error.message);
      this.updateStatus('disconnected', 'Connection Error');
      this.showError('Failed to initialize: ' + error.message);
    }
  }

  private setupEventListeners() {
    // Connection state changes
    chatService.onConnectionStateChange((state) => {
      const statusMap: Record<ConnectionState, { class: string; text: string }> = {
        [ConnectionState.CONNECTED]: { class: 'connected', text: 'Connected' },
        [ConnectionState.CONNECTING]: { class: 'connecting', text: 'Connecting...' },
        [ConnectionState.RECONNECTING]: { class: 'connecting', text: 'Reconnecting...' },
        [ConnectionState.DISCONNECTED]: { class: 'disconnected', text: 'Disconnected' },
        [ConnectionState.ERROR]: { class: 'disconnected', text: 'Connection Error' }
      };
      
      const status = statusMap[state] || statusMap[ConnectionState.DISCONNECTED];
      this.updateStatus(status.class, status.text);
    });

    // New messages
    chatService.onNewMessage((message) => {
      this.log('💬 New message received: ' + message.id);
      this.messageHistory.push(message);
      this.renderMessage(message);
    });

    // Message sent confirmation
    chatService.onMessageSent((data) => {
      this.log('✅ Message sent: ' + data.messageId);
    });

    // Message send error
    chatService.onMessageSendError((data) => {
      this.log('❌ Send error: ' + data.error);
      this.showError('Failed to send message: ' + data.error);
    });

    // Typing indicator
    chatService.onTyping((userId, isTyping) => {
      if (userId !== CONFIG.USER_ID && isTyping) {
        this.log(`✏️  ${CONFIG.RECEIVER_NAME} is typing...`);
      }
    });
  }

  private async setupConversation() {
    this.log('🔍 Setting up conversation...');
    
    const conversation = await chatService.findOrCreateJobConversation(
      CONFIG.JOB_ID,
      CONFIG.RECEIVER_ID
    );

    this.conversationId = conversation.id;
    this.log('✅ Conversation ready: ' + this.conversationId);

    // Load existing messages
    const result = await chatService.loadMessages(this.conversationId, { 
      page: 1, 
      limit: 50 
    });
    
    this.messageHistory = result.messages;
    this.log(`📜 Loaded ${result.messages.length} messages`);
    
    result.messages.forEach(msg => this.renderMessage(msg, false));

    // Send greeting if new conversation
    if (result.messages.length === 0) {
      await chatService.sendTextMessage(
        this.conversationId,
        `Hello! I'm ${CONFIG.USER_NAME}, your ${CONFIG.USER_ROLE} for the ${CONFIG.JOB_TITLE}.`,
        CONFIG.RECEIVER_ID
      );
    }
  }

  private async handleSend() {
    const input = document.getElementById('message-input') as HTMLInputElement;
    const text = input.value.trim();
    
    if (!text || !this.conversationId) return;

    // Handle commands
    if (text.startsWith('/')) {
      this.handleCommand(text);
      input.value = '';
      return;
    }

    try {
      await chatService.sendTextMessage(
        this.conversationId,
        text,
        CONFIG.RECEIVER_ID
      );
      input.value = '';
      
      // Send typing indicator stop
      chatService.sendTypingIndicator(this.conversationId, CONFIG.RECEIVER_ID, false);
    } catch (error: any) {
      this.log('❌ Failed to send: ' + error.message);
      this.showError('Failed to send message');
    }
  }

  private async handleCommand(cmd: string) {
    const command = cmd.toLowerCase().split(' ')[0];
    
    switch (command) {
      case '/status':
        this.showStatus();
        break;
      case '/retry':
        await this.retryFailed();
        break;
      case '/queue':
        this.showQueue();
        break;
      case '/history':
        this.showHistory();
        break;
      case '/clear':
        this.clearMessages();
        break;
      case '/help':
        this.showHelp();
        break;
      default:
        this.log('❓ Unknown command: ' + cmd);
        this.log('Type /help for available commands');
    }
  }

  private showStatus() {
    const state = chatService.getConnectionState();
    const queue = chatService.getOfflineQueueStatus();
    const isConnected = chatService.isConnected();
    
    this.log('📊 Status Report:');
    this.log(`  Connection: ${state} (${isConnected ? 'Connected' : 'Disconnected'})`);
    this.log(`  Conversation: ${this.conversationId || 'None'}`);
    this.log(`  Messages: ${this.messageHistory.length}`);
    this.log(`  Offline Queue: ${queue.count} messages`);
    
    if (this.conversationId) {
      const hasFailed = chatService.hasFailedMessages(this.conversationId);
      this.log(`  Failed Messages: ${hasFailed ? 'Yes' : 'No'}`);
    }
  }

  private async retryFailed() {
    if (!this.conversationId) {
      this.log('⚠️  No active conversation');
      return;
    }
    
    const result = await chatService.retryAllFailedMessages(this.conversationId);
    
    if (result.attempted === 0) {
      this.log('ℹ️  No failed messages to retry');
    } else {
      this.log(`✅ Retried ${result.successful}/${result.attempted} messages`);
      if (result.failed > 0) {
        this.log(`❌ ${result.failed} messages still failed`);
      }
    }
  }

  private showQueue() {
    const queue = chatService.getOfflineQueueStatus();
    
    this.log(`📥 Offline Queue: ${queue.count} messages`);
    
    if (queue.count === 0) {
      this.log('  Queue is empty');
    } else {
      queue.messages.forEach((msg, i) => {
        const age = Math.floor(msg.age / 1000);
        this.log(`  ${i + 1}. "${msg.content.substring(0, 30)}..." (${msg.retryCount} retries, ${age}s old)`);
      });
    }
  }

  private showHistory() {
    this.log(`📜 Message History: ${this.messageHistory.length} messages`);
    
    const recent = this.messageHistory.slice(-10);
    recent.forEach((msg, i) => {
      const sender = msg.senderId === CONFIG.USER_ID ? 'You' : CONFIG.RECEIVER_NAME;
      const time = new Date(msg.timestamp).toLocaleTimeString();
      const status = this.getStatusIcon(msg.status);
      this.log(`  ${i + 1}. [${time}] ${sender}: ${msg.content.substring(0, 40)}... ${status}`);
    });
  }

  private showHelp() {
    this.log('📋 Available Commands:');
    this.log('  /status   - Show connection and queue status');
    this.log('  /retry    - Retry failed messages');
    this.log('  /queue    - Show offline queue');
    this.log('  /history  - Show message history');
    this.log('  /clear    - Clear message display');
    this.log('  /help     - Show this help menu');
  }

  private clearMessages() {
    const container = document.getElementById('messages');
    if (container) {
      container.innerHTML = '';
    }
    this.log('🗑️  Display cleared (messages still in memory)');
  }

  private renderMessage(message: Message, animate = true) {
    const container = document.getElementById('messages');
    if (!container) return;

    const isMine = message.senderId === CONFIG.USER_ID;
    const statusIcon = this.getStatusIcon(message.status);
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isMine ? 'mine' : 'theirs'}`;
    if (!animate) msgDiv.style.animation = 'none';
    
    msgDiv.innerHTML = `
      <div class="message-bubble">
        <div class="message-content">${this.escapeHtml(message.content)}</div>
        <div class="message-meta">
          <span>${new Date(message.timestamp).toLocaleTimeString()}</span>
          <span>${statusIcon}</span>
        </div>
      </div>
    `;

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
  }

  private getStatusIcon(status: MessageStatus): string {
    const icons: Record<MessageStatus, string> = {
      [MessageStatus.SENDING]: '⏳',
      [MessageStatus.SENT]: '✓',
      [MessageStatus.DELIVERED]: '✓✓',
      [MessageStatus.READ]: '👁️',
      [MessageStatus.FAILED]: '❌',
      [MessageStatus.QUEUED]: '📥',
      [MessageStatus.EXPIRED]: '⏰'
    };
    return icons[status] || '';
  }

  private log(message: string) {
    console.log(message);
  }

  private showError(message: string) {
    // Could add a toast notification here
    console.error(message);
  }

  private updateStatus(className: string, text: string) {
    const dot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    
    if (dot) {
      dot.className = `status-dot ${className}`;
    }
    if (statusText) {
      statusText.textContent = text;
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Start the client when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const client = new WebChatClient();
    client.start();
  });
} else {
  const client = new WebChatClient();
  client.start();
}