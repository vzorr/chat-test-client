// socket-test-production.js - Production-ready Socket.IO client
const io = require('socket.io-client');
const EventEmitter = require('events');

// Configuration
const SERVER_URL = 'https://myusta.al';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjA5MWU0YzE3LTQ3YWItNDE1MC04YjQ1LWVhMzZkZDJjMmRlOSIsInJvbGUiOiJ1c3RhIiwibmFtZSI6IkJhYmFyIEtoYW4iLCJlbWFpbCI6ImJhYmFya2gwMzAyQGdtYWlsLmNvbSIsInBob25lIjoiOTIzMDQ2OTk4NjM0IiwiaWF0IjoxNzU5MDcyODYxLCJleHAiOjE3NTk2Nzc2NjF9.g04d7uKDI8tjQDdT6HiWgFimhLp5iIziMYchou3qUrM';

// User and job details
const USER_ID = '091e4c17-47ab-4150-8b45-ea36dd2c2de9';
const USER_NAME = 'Babar Khan';
const RECEIVER_ID = '6e8ae482-0196-43ec-8b74-fc01c2d6ff00';
const JOB_ID = generateUUID();
const JOB_TITLE = 'Plumbing Service - Kitchen Sink Repair';

// UUID generator
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Production-ready message queue manager
 * Prevents duplicates and handles retries
 */
class MessageQueueManager extends EventEmitter {
  constructor() {
    super();
    this.pendingMessages = new Map(); // Track messages being sent
    this.sentMessages = new Set(); // Track successfully sent messages
    this.messageQueue = []; // Queue for messages waiting to be sent
    this.retryAttempts = new Map(); // Track retry attempts per message
    this.maxRetries = 3;
    this.retryDelay = 2000;
  }

  /**
   * Generate unique message ID
   */
  generateMessageId() {
    return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add message to queue with deduplication
   */
  queueMessage(message) {
    const messageId = message.clientTempId || this.generateMessageId();
    
    // Check if message already sent or pending
    if (this.sentMessages.has(messageId) || this.pendingMessages.has(messageId)) {
      console.log(`[DUPLICATE PREVENTED] Message ${messageId} already processed`);
      return null;
    }

    // Add to pending
    this.pendingMessages.set(messageId, message);
    message.clientTempId = messageId;
    
    return message;
  }

  /**
   * Mark message as sent successfully
   */
  markAsSent(clientTempId) {
    if (this.pendingMessages.has(clientTempId)) {
      this.sentMessages.add(clientTempId);
      this.pendingMessages.delete(clientTempId);
      this.retryAttempts.delete(clientTempId);
      console.log(`[SUCCESS] Message ${clientTempId} marked as sent`);
      return true;
    }
    return false;
  }

  /**
   * Handle message failure with retry logic
   */
  markAsFailed(clientTempId, error) {
    const attempts = (this.retryAttempts.get(clientTempId) || 0) + 1;
    
    if (attempts >= this.maxRetries) {
      console.error(`[FAILED] Message ${clientTempId} failed after ${attempts} attempts`);
      this.pendingMessages.delete(clientTempId);
      this.retryAttempts.delete(clientTempId);
      this.emit('message_failed', { clientTempId, error, attempts });
      return false;
    }

    this.retryAttempts.set(clientTempId, attempts);
    console.log(`[RETRY] Message ${clientTempId} will retry (attempt ${attempts}/${this.maxRetries})`);
    return true;
  }

  /**
   * Check if message is duplicate
   */
  isDuplicate(clientTempId) {
    return this.sentMessages.has(clientTempId) || this.pendingMessages.has(clientTempId);
  }

  /**
   * Clear old sent messages (memory management)
   */
  clearOldSentMessages(maxAge = 300000) { // 5 minutes default
    const cutoffTime = Date.now() - maxAge;
    for (const messageId of this.sentMessages) {
      const timestamp = parseInt(messageId.split('_')[1]);
      if (timestamp < cutoffTime) {
        this.sentMessages.delete(messageId);
      }
    }
  }
}

/**
 * Socket.IO Client wrapper with best practices
 */
class ChatClient {
  constructor(config) {
    this.config = config;
    this.socket = null;
    this.messageQueue = new MessageQueueManager();
    this.conversationId = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.scheduledMessages = new Map(); // Track scheduled follow-ups
    
    this.setupMessageQueueListeners();
  }

  /**
   * Setup message queue event listeners
   */
  setupMessageQueueListeners() {
    this.messageQueue.on('message_failed', ({ clientTempId, error }) => {
      console.error(`[QUEUE] Message permanently failed: ${clientTempId}`, error);
    });
  }

  /**
   * Connect to server
   */
  connect() {
    console.log('[CONNECTING] Initiating connection...');
    
    this.socket = io(this.config.serverUrl, {
      transports: ['polling', 'websocket'],
      upgrade: true,
      auth: {
        token: this.config.token,
        userId: this.config.userId
      },
      query: {
        userId: this.config.userId,
        platform: 'web',
        version: '1.0.0'
      },
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000
    });

    this.setupSocketHandlers();
  }

  /**
   * Setup all socket event handlers
   */
  setupSocketHandlers() {
    // Connection events
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('[CONNECTED] Successfully connected');
      console.log('  Socket ID:', this.socket.id);
      console.log('  Transport:', this.socket.io.engine.transport.name);
      
      // Send initial message after connection
      this.sendInitialMessage();
    });

    this.socket.on('connect_error', (error) => {
      this.isConnected = false;
      console.error('[CONNECTION ERROR]', error.message);
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      console.log('[DISCONNECTED]', reason);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      this.reconnectAttempts = attemptNumber;
      console.log('[RECONNECTED] After', attemptNumber, 'attempts');
    });

    // Message events
    this.socket.on('message_sent', (data) => {
      console.log('[MESSAGE CONFIRMED]');
      console.log('  Message ID:', data.id);
      console.log('  Conversation:', data.conversationId);
      console.log('  Status:', data.status);
      
      // Mark message as sent in queue
      if (data.clientTempId) {
        this.messageQueue.markAsSent(data.clientTempId);
      }
      
      // Store conversation ID for future messages
      if (data.conversationId && !this.conversationId) {
        this.conversationId = data.conversationId;
        console.log('✅ Conversation established:', this.conversationId);
        
        // Schedule follow-up only once
        this.scheduleFollowUpMessage();
      }
    });

    this.socket.on('message_send_error', (error) => {
      console.error('[MESSAGE ERROR]', error);
      
      // Handle retry logic
      if (error.clientTempId) {
        const shouldRetry = this.messageQueue.markAsFailed(error.clientTempId, error.error);
        
        if (shouldRetry) {
          // Retry after delay
          setTimeout(() => {
            const message = this.messageQueue.pendingMessages.get(error.clientTempId);
            if (message) {
              this.sendMessage(message);
            }
          }, this.messageQueue.retryDelay);
        }
      }
    });

    this.socket.on('new_message', (data) => {
      console.log('[NEW MESSAGE]');
      console.log('  From:', data.senderId === this.config.userId ? 'Me' : 'Other');
      console.log('  Content:', (data.content?.text || data.textMsg || '').substring(0, 50) + '...');
    });

    this.socket.on('error', (error) => {
      console.error('[SOCKET ERROR]', error);
    });
  }

  /**
   * Send a message with deduplication
   */
  sendMessage(messageData) {
    if (!this.isConnected) {
      console.error('[ERROR] Not connected to server');
      return false;
    }

    // Check for duplicates
    if (messageData.clientTempId && this.messageQueue.isDuplicate(messageData.clientTempId)) {
      console.log('[DUPLICATE BLOCKED] Message already sent or pending');
      return false;
    }

    // Queue the message
    const message = this.messageQueue.queueMessage(messageData);
    if (!message) {
      return false;
    }

    console.log(`[SENDING] Message ${message.clientTempId}`);
    
    // Emit with acknowledgment
    this.socket.emit('send_message', message, (ack) => {
      if (ack && ack.success) {
        console.log('[ACK] Server acknowledged:', message.clientTempId);
      }
    });

    return true;
  }

  /**
   * Send initial message
   */
  sendInitialMessage() {
    const message = {
      clientTempId: this.messageQueue.generateMessageId(),
      receiverId: this.config.receiverId,
      jobId: this.config.jobId,
      jobTitle: this.config.jobTitle,
      textMsg: `Hello! I'm ${this.config.userName}, your usta for the ${this.config.jobTitle}. I'm ready to help you with this service request.`,
      messageType: 'text',
      messageImages: [],
      audioFile: '',
      attachments: [],
      timestamp: Date.now()
    };

    this.sendMessage(message);
  }

  /**
   * Schedule follow-up message with duplicate prevention
   */
  scheduleFollowUpMessage() {
    const followUpKey = 'follow_up_1';
    
    // Check if already scheduled
    if (this.scheduledMessages.has(followUpKey)) {
      console.log('[SCHEDULE] Follow-up already scheduled');
      return;
    }

    // Mark as scheduled
    this.scheduledMessages.set(followUpKey, true);

    setTimeout(() => {
      if (!this.conversationId) {
        console.log('[SKIP] No conversation ID available for follow-up');
        return;
      }

      const message = {
        clientTempId: this.messageQueue.generateMessageId(),
        conversationId: this.conversationId,
        receiverId: this.config.receiverId,
        jobId: this.config.jobId,
        textMsg: 'When would be a good time for me to visit and assess the issue?',
        messageType: 'text',
        messageImages: [],
        audioFile: '',
        attachments: [],
        timestamp: Date.now()
      };

      this.sendMessage(message);
      
      // Schedule disconnect
      setTimeout(() => {
        this.disconnect();
      }, 3000);
    }, 2000);
  }

  /**
   * Disconnect gracefully
   */
  disconnect() {
    console.log('[DISCONNECTING] Closing connection...');
    
    // Clear scheduled messages
    this.scheduledMessages.clear();
    
    // Clear message queue
    this.messageQueue.pendingMessages.clear();
    
    // Disconnect socket
    if (this.socket) {
      this.socket.disconnect();
    }
    
    console.log('✅ Disconnected successfully');
    process.exit(0);
  }

  /**
   * Start periodic cleanup
   */
  startCleanup() {
    setInterval(() => {
      this.messageQueue.clearOldSentMessages();
    }, 60000); // Every minute
  }
}

// Initialize and run
const client = new ChatClient({
  serverUrl: SERVER_URL,
  token: TOKEN,
  userId: USER_ID,
  userName: USER_NAME,
  receiverId: RECEIVER_ID,
  jobId: JOB_ID,
  jobTitle: JOB_TITLE
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n[SIGINT] Shutting down gracefully...');
  client.disconnect();
});

process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION]', error);
  client.disconnect();
});

// Start the client
console.log('========================================');
console.log('Production Socket.IO Client');
console.log('========================================');
console.log('User:', USER_NAME);
console.log('Job:', JOB_TITLE);
console.log('');

client.connect();
client.startCleanup();