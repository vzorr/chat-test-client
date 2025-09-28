// chat-test-client.ts - Production-ready test client for ChatService
import readline from 'readline';
import { EventEmitter } from 'events';
import chalk from 'chalk';
import { chatService } from './services/chatService';
import { 
  Message, 
  MessageStatus, 
  ConversationType,
  ConversationStatus,
  ConnectionState,
  MessageType
} from './types/chat';

// Mock implementations for dependencies
import './mocks/setup-mocks';

// Configuration
const CONFIG = {
  TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjA5MWU0YzE3LTQ3YWItNDE1MC04YjQ1LWVhMzZkZDJjMmRlOSIsInJvbGUiOiJ1c3RhIiwibmFtZSI6IkJhYmFyIEtoYW4iLCJlbWFpbCI6ImJhYmFya2gwMzAyQGdtYWlsLmNvbSIsInBob25lIjoiOTIzMDQ2OTk4NjM0IiwiaWF0IjoxNzU5MDcyODYxLCJleHAiOjE3NTk2Nzc2NjF9.g04d7uKDI8tjQDdT6HiWgFimhLp5iIziMYchou3qUrM',
  USER_ID: '091e4c17-47ab-4150-8b45-ea36dd2c2de9',
  USER_NAME: 'Babar Khan',
  USER_ROLE: 'usta',
  RECEIVER_ID: '6e8ae482-0196-43ec-8b74-fc01c2d6ff00',
  RECEIVER_NAME: 'Customer',
  JOB_ID: generateUUID(),
  JOB_TITLE: 'Plumbing Service - Kitchen Sink Repair'
};

// UUID generator
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Enhanced Test Client for ChatService
 */
class ChatTestClient extends EventEmitter {
  private rl: readline.Interface;
  private conversationId: string | null = null;
  private isRunning: boolean = false;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private messageListeners: (() => void)[] = [];
  private simulateOffline: boolean = false;
  private autoRetryFailed: boolean = true;

  constructor() {
    super();
    
    // Setup readline interface for user input
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Initialize the chat service
   */
  async initialize(): Promise<void> {
    console.log(chalk.cyan('\n🚀 Initializing Chat Service...\n'));
    
    try {
      // Initialize chat service
      await chatService.initialize(
        CONFIG.USER_ID,
        CONFIG.USER_ROLE,
        CONFIG.TOKEN,
        undefined, // Redux store not needed for test
        {
          id: CONFIG.USER_ID,
          name: CONFIG.USER_NAME,
          email: 'babar@example.com',
          phone: '923046998634'
        } as any
      );

      // Setup event listeners
      this.setupEventListeners();
      
      // Check offline queue
      const queueStatus = chatService.getOfflineQueueStatus();
      if (queueStatus.count > 0) {
        console.log(chalk.yellow(`📥 ${queueStatus.count} messages in offline queue`));
        queueStatus.messages.forEach(msg => {
          console.log(chalk.gray(`  - ${msg.content} (${msg.retryCount} retries)`));
        });
      }

      console.log(chalk.green('✅ Chat Service initialized successfully\n'));
      
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to initialize:'), error.message);
      throw error;
    }
  }

  /**
   * Setup all event listeners
   */
  private setupEventListeners(): void {
    // Connection state changes
    const cleanupConnection = chatService.onConnectionStateChange((state, details) => {
      this.connectionState = state;
      
      const stateColors: Record<ConnectionState, any> = {
        [ConnectionState.CONNECTED]: chalk.green,
        [ConnectionState.CONNECTING]: chalk.yellow,
        [ConnectionState.RECONNECTING]: chalk.yellow,
        [ConnectionState.DISCONNECTED]: chalk.red,
        [ConnectionState.ERROR]: chalk.red
      };

      const color = stateColors[state] || chalk.gray;
      console.log(color(`\n📡 Connection: ${state}`));
      
      if (details?.error) {
        console.log(chalk.red(`  Error: ${details.error}`));
      }
      
      if (state === ConnectionState.CONNECTED) {
        this.handleReconnection();
      }
    });
    this.messageListeners.push(cleanupConnection);

    // New messages
    const cleanupNewMessage = chatService.onNewMessage((message) => {
      this.handleIncomingMessage(message);
    });
    this.messageListeners.push(cleanupNewMessage);

    // Message sent confirmations
    const cleanupMessageSent = chatService.onMessageSent((data) => {
      console.log(chalk.green(`\n✅ Message sent: ${data.messageId}`));
      
      // Check if we should retry failed messages
      if (this.autoRetryFailed && this.conversationId) {
        this.checkAndRetryFailed();
      }
    });
    this.messageListeners.push(cleanupMessageSent);

    // Message errors
    const cleanupMessageError = chatService.onMessageSendError((data) => {
      console.log(chalk.red(`\n❌ Message failed: ${data.error}`));
      
      if (data.clientTempId) {
        console.log(chalk.yellow('  Tip: Type "retry" to retry failed messages'));
      }
    });
    this.messageListeners.push(cleanupMessageError);

    // Typing indicators
    const cleanupTyping = chatService.onTyping((userId, isTyping) => {
      if (userId !== CONFIG.USER_ID && isTyping) {
        console.log(chalk.gray(`\n✏️ ${CONFIG.RECEIVER_NAME} is typing...`));
      }
    });
    this.messageListeners.push(cleanupTyping);
  }

  /**
   * Handle incoming messages
   */
  private handleIncomingMessage(message: Message): void {
    const isMine = message.senderId === CONFIG.USER_ID;
    const sender = isMine ? 'You' : CONFIG.RECEIVER_NAME;
    const color = isMine ? chalk.blue : chalk.white;
    const statusIcon = this.getStatusIcon(message.status);
    
    console.log(color(`\n💬 [${sender}]: ${message.content} ${statusIcon}`));
    
    if (message.status === MessageStatus.FAILED) {
      console.log(chalk.red('  ⚠️ Message failed to send'));
    }
  }

  /**
   * Get status icon for message
   */
  private getStatusIcon(status: MessageStatus): string {
    const icons: Record<MessageStatus, string> = {
      [MessageStatus.SENDING]: '⏳',
      [MessageStatus.SENT]: '✓',
      [MessageStatus.DELIVERED]: '✓✓',
      [MessageStatus.READ]: '👁️',
      [MessageStatus.FAILED]: '❌',
      [MessageStatus.QUEUED]: '📥',
      [MessageStatus.EXPIRED]: '❌❌'
    };
    return icons[status] || '';
  }

  /**
   * Handle reconnection
   */
  private async handleReconnection(): Promise<void> {
    console.log(chalk.green('\n🔄 Reconnected! Processing offline queue...'));
    
    const queueStatus = chatService.getOfflineQueueStatus();
    if (queueStatus.count > 0) {
      console.log(chalk.yellow(`  Processing ${queueStatus.count} queued messages...`));
    }
  }

  /**
   * Create or find conversation
   */
  private async ensureConversation(): Promise<string> {
    if (this.conversationId) {
      return this.conversationId;
    }

    console.log(chalk.cyan('\n🔍 Finding or creating conversation...'));
    
    try {
      const conversation = await chatService.findOrCreateJobConversation(
        CONFIG.JOB_ID,
        CONFIG.RECEIVER_ID
      );
      
      this.conversationId = conversation.id;
      console.log(chalk.green(`✅ Conversation ready: ${this.conversationId}`));
      
      // Load messages
      await this.loadMessages();
      
      return this.conversationId;
      
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to create conversation:'), error.message);
      throw error;
    }
  }

  /**
   * Load messages for current conversation
   */
  private async loadMessages(): Promise<void> {
    if (!this.conversationId) return;
    
    try {
      const result = await chatService.loadMessages(this.conversationId, {
        page: 1,
        limit: 10
      });
      
      console.log(chalk.gray(`\n📜 Loaded ${result.messages.length} messages`));
      
      // Display recent messages
      result.messages.slice(0, 5).reverse().forEach(msg => {
        this.handleIncomingMessage(msg);
      });
      
    } catch (error: any) {
      console.error(chalk.red('Failed to load messages:'), error.message);
    }
  }

  /**
   * Send a message
   */
  private async sendMessage(text: string): Promise<void> {
    try {
      // Ensure we have a conversation
      const convId = await this.ensureConversation();
      
      // Simulate offline if enabled
      if (this.simulateOffline) {
        console.log(chalk.yellow('\n📵 Simulating offline mode...'));
      }
      
      // Send message
      const message = await chatService.sendTextMessage(
        convId,
        text,
        CONFIG.RECEIVER_ID
      );
      
      console.log(chalk.gray(`\n📤 Sending: ${message.clientTempId}`));
      
      // Show in UI immediately (optimistic update)
      this.handleIncomingMessage(message);
      
    } catch (error: any) {
      console.error(chalk.red('\n❌ Send failed:'), error.message);
      
      if (error.message.includes('wait')) {
        console.log(chalk.yellow('  Please wait a moment before sending again'));
      }
    }
  }

  /**
   * Retry failed messages
   */
  private async retryFailedMessages(): Promise<void> {
    if (!this.conversationId) {
      console.log(chalk.yellow('No active conversation'));
      return;
    }
    
    const failedMessages = chatService.getFailedMessages(this.conversationId);
    
    if (failedMessages.length === 0) {
      console.log(chalk.gray('No failed messages to retry'));
      return;
    }
    
    console.log(chalk.yellow(`\n🔄 Retrying ${failedMessages.length} failed messages...`));
    
    for (const msg of failedMessages) {
      try {
        await chatService.retryFailedMessage(
          this.conversationId,
          msg.id,
          msg.clientTempId
        );
        console.log(chalk.green(`  ✅ Retrying: ${msg.content.substring(0, 30)}...`));
      } catch (error: any) {
        console.log(chalk.red(`  ❌ Failed: ${error.message}`));
      }
    }
  }

  /**
   * Check and auto-retry failed messages
   */
  private async checkAndRetryFailed(): Promise<void> {
    if (!this.conversationId || !this.autoRetryFailed) return;
    
    const hasFailed = chatService.hasFailedMessages(this.conversationId);
    if (hasFailed) {
      console.log(chalk.yellow('\n🔄 Auto-retrying failed messages...'));
      await this.retryFailedMessages();
    }
  }

  /**
   * Show help menu
   */
  private showHelp(): void {
    console.log(chalk.cyan('\n📋 Available Commands:'));
    console.log(chalk.white('  /help           - Show this help menu'));
    console.log(chalk.white('  /status         - Show connection and queue status'));
    console.log(chalk.white('  /retry          - Retry all failed messages'));
    console.log(chalk.white('  /queue          - Show offline queue'));
    console.log(chalk.white('  /offline        - Toggle offline simulation'));
    console.log(chalk.white('  /auto-retry     - Toggle auto-retry for failed messages'));
    console.log(chalk.white('  /clear          - Clear screen'));
    console.log(chalk.white('  /exit           - Exit the client'));
    console.log(chalk.white('  <text>          - Send a message'));
  }

  /**
   * Show status
   */
  private showStatus(): void {
    console.log(chalk.cyan('\n📊 Status:'));
    console.log(chalk.white(`  Connection: ${this.connectionState}`));
    console.log(chalk.white(`  Conversation: ${this.conversationId || 'Not created'}`));
    console.log(chalk.white(`  Offline Mode: ${this.simulateOffline ? 'ON' : 'OFF'}`));
    console.log(chalk.white(`  Auto-Retry: ${this.autoRetryFailed ? 'ON' : 'OFF'}`));
    
    const queueStatus = chatService.getOfflineQueueStatus();
    console.log(chalk.white(`  Offline Queue: ${queueStatus.count} messages`));
    
    if (this.conversationId) {
      const failedCount = chatService.getFailedMessages(this.conversationId).length;
      console.log(chalk.white(`  Failed Messages: ${failedCount}`));
    }
  }

  /**
   * Handle user input
   */
  private async handleInput(input: string): Promise<void> {
    const trimmed = input.trim();
    
    if (!trimmed) return;
    
    // Handle commands
    if (trimmed.startsWith('/')) {
      const command = trimmed.toLowerCase();
      
      switch (command) {
        case '/help':
          this.showHelp();
          break;
          
        case '/status':
          this.showStatus();
          break;
          
        case '/retry':
          await this.retryFailedMessages();
          break;
          
        case '/queue':
          const queue = chatService.getOfflineQueueStatus();
          console.log(chalk.cyan(`\n📥 Offline Queue (${queue.count} messages):`));
          queue.messages.forEach(msg => {
            console.log(chalk.gray(`  - ${msg.content}`));
          });
          break;
          
        case '/offline':
          this.simulateOffline = !this.simulateOffline;
          console.log(chalk.yellow(`\n📵 Offline mode: ${this.simulateOffline ? 'ON' : 'OFF'}`));
          break;
          
        case '/auto-retry':
          this.autoRetryFailed = !this.autoRetryFailed;
          console.log(chalk.yellow(`\n🔄 Auto-retry: ${this.autoRetryFailed ? 'ON' : 'OFF'}`));
          break;
          
        case '/clear':
          console.clear();
          break;
          
        case '/exit':
          await this.shutdown();
          break;
          
        default:
          console.log(chalk.red(`Unknown command: ${command}`));
          console.log(chalk.gray('Type /help for available commands'));
      }
    } else {
      // Send as message
      await this.sendMessage(trimmed);
    }
  }

  /**
   * Start the interactive client
   */
  async start(): Promise<void> {
    this.isRunning = true;
    
    console.clear();
    console.log(chalk.cyan.bold('========================================'));
    console.log(chalk.cyan.bold('     Chat Service Test Client v2.0     '));
    console.log(chalk.cyan.bold('========================================'));
    console.log(chalk.white(`User: ${CONFIG.USER_NAME} (${CONFIG.USER_ROLE})`));
    console.log(chalk.white(`Job: ${CONFIG.JOB_TITLE}`));
    console.log(chalk.white(`Receiver: ${CONFIG.RECEIVER_NAME}`));
    console.log(chalk.gray('\nType /help for commands\n'));
    
    try {
      // Initialize service
      await this.initialize();
      
      // Send initial message
      console.log(chalk.cyan('\n📤 Sending initial message...'));
      await this.sendMessage(`Hello! I'm ${CONFIG.USER_NAME}, your usta for the ${CONFIG.JOB_TITLE}.`);
      
      // Start input loop
      this.rl.setPrompt(chalk.cyan('\n> '));
      this.rl.prompt();
      
      this.rl.on('line', async (input) => {
        await this.handleInput(input);
        
        if (this.isRunning) {
          this.rl.prompt();
        }
      });
      
    } catch (error: any) {
      console.error(chalk.red('\n❌ Fatal error:'), error.message);
      await this.shutdown();
    }
  }

  /**
   * Shutdown gracefully
   */
  async shutdown(): Promise<void> {
    console.log(chalk.yellow('\n🔌 Shutting down...'));
    
    this.isRunning = false;
    
    // Clean up listeners
    this.messageListeners.forEach(cleanup => cleanup());
    this.messageListeners = [];
    
    // Disconnect chat service
    await chatService.disconnect();
    
    // Close readline
    this.rl.close();
    
    console.log(chalk.green('✅ Shutdown complete'));
    process.exit(0);
  }
}

// Handle process signals
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n\nReceived SIGINT'));
  if (client) {
    await client.shutdown();
  }
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('\n❌ Uncaught Exception:'), error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('\n❌ Unhandled Rejection:'), reason);
  process.exit(1);
});

// Create and start client
const client = new ChatTestClient();
client.start().catch(error => {
  console.error(chalk.red('Failed to start:'), error);
  process.exit(1);
});