// src/chat-test-client.ts - Modern test client using async/await
import * as readline from 'readline';
import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config();

// Import configuration and utilities
import { AppConfig } from './config/AppConfig';
import { logger } from './utils/Logger';

// Import the ServiceFactory to create services
import { ServiceFactory } from './services/factories/ServiceFactory';

// Import the main ChatService
import { chatService } from './services/ChatService';

// Import types
import { 
  MessageStatus, 
  ConnectionState,
  UserRegistrationData,
  Message,
  ServerConversation,
  ConversationType,
  ConversationStatus,
  AttachmentType
} from './types/chat';

// Import chalk for colors
const chalk = require('chalk');

// Configuration from environment variables
const CONFIG = {
  TOKEN: process.env.AUTH_TOKEN || '',
  USER_ID: process.env.USER_ID || '',
  USER_NAME: process.env.USER_NAME || 'Test User',
  USER_EMAIL: process.env.USER_EMAIL || 'test@example.com',
  USER_PHONE: process.env.USER_PHONE || '',
  USER_ROLE: process.env.USER_ROLE || 'usta',
  RECEIVER_ID: process.env.RECEIVER_ID || '',
  RECEIVER_NAME: process.env.RECEIVER_NAME || 'Customer',
  JOB_ID: process.env.JOB_ID || uuidv4(),
  JOB_TITLE: process.env.JOB_TITLE || 'Service Request'
};

/**
 * Modern Chat Test Client using async/await
 */
class ChatTestClient {
  private rl: readline.Interface;
  private conversationId: string | null = null;
  private isRunning: boolean = false;
  private cleanupFunctions: (() => void)[] = [];
  private messageHistory: Message[] = [];
  private connectionCheckInterval: NodeJS.Timeout | null = null;
  private retryCount: number = 0;
  private maxRetries: number = 3;

  constructor() {
    // Setup readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan('> ')
    });

    // Configure ServiceFactory
    ServiceFactory.configure({
      token: CONFIG.TOKEN,
      userId: CONFIG.USER_ID,
      enableLogging: AppConfig.debug.enabled
    });
  }

  /**
   * Start the client
   */
  async start() {
    try {
      this.isRunning = true;
      
      console.clear();
      this.displayHeader();
      
      // Validate config
      const configValid = this.validateConfig();
      if (!configValid) {
        await this.shutdown();
        return;
      }

      this.displayConfig();

      // Initialize services
      const initialized = await this.initializeChatService();
      if (!initialized) {
        console.error(chalk.red('❌ Failed to initialize chat service'));
        await this.shutdown();
        return;
      }

      // Setup listeners
      this.setupEventListeners();

      // Setup conversation
      const conversationReady = await this.setupConversation();
      if (!conversationReady) {
        console.error(chalk.red('❌ Failed to setup conversation'));
        await this.shutdown();
        return;
      }

      // Start monitoring
      this.startConnectionMonitoring();

      // Start interactive prompt
      this.startCommandPrompt();

    } catch (error: any) {
      logger.error('Fatal error during startup', error);
      console.error(chalk.red('\n❌ Fatal error:'), error.message);
      await this.shutdown();
    }
  }

  /**
   * Display header
   */
  private displayHeader() {
    console.log(chalk.cyan.bold('╔════════════════════════════════════════╗'));
    console.log(chalk.cyan.bold('║     Chat Service Test Client v2.0     ║'));
    console.log(chalk.cyan.bold('║      Modern Async Architecture        ║'));
    console.log(chalk.cyan.bold('╚════════════════════════════════════════╝'));
    console.log();
  }

  /**
   * Validate configuration
   */
  private validateConfig(): boolean {
    const errors: string[] = [];

    if (!CONFIG.TOKEN) errors.push('AUTH_TOKEN is required');
    if (!CONFIG.USER_ID) errors.push('USER_ID is required');
    if (!CONFIG.RECEIVER_ID) errors.push('RECEIVER_ID is required');

    if (errors.length > 0) {
      console.error(chalk.red('❌ Configuration errors:'));
      errors.forEach(err => console.error(chalk.red(`  • ${err}`)));
      console.log(chalk.yellow('\n📝 Please check your .env file'));
      return false;
    }

    return true;
  }

  /**
   * Display configuration
   */
  private displayConfig() {
    console.log(chalk.white('📋 Configuration:'));
    console.log(chalk.gray('  Platform:'), AppConfig.platform.OS);
    console.log(chalk.gray('  Environment:'), AppConfig.environment);
    console.log(chalk.gray('  Service Type:'), AppConfig.service.type);
    console.log(chalk.gray('  Storage Type:'), AppConfig.storage.type);
    console.log(chalk.gray('  User:'), `${CONFIG.USER_NAME} (${CONFIG.USER_ROLE})`);
    console.log(chalk.gray('  Receiver:'), CONFIG.RECEIVER_NAME);
    console.log(chalk.gray('  Job:'), CONFIG.JOB_TITLE);
    console.log();
  }

  /**
   * Initialize chat service with retry logic
   */
  private async initializeChatService(): Promise<boolean> {
    console.log(chalk.cyan('🚀 Initializing Chat Service...'));

    const userDetails: UserRegistrationData = {
      id: CONFIG.USER_ID,
      externalId: CONFIG.USER_ID,
      name: CONFIG.USER_NAME,
      email: CONFIG.USER_EMAIL,
      phone: CONFIG.USER_PHONE,
      role: CONFIG.USER_ROLE as any
    };

    // Try to initialize with retries
    while (this.retryCount < this.maxRetries) {
      try {
        await chatService.initialize(
          CONFIG.USER_ID,
          CONFIG.USER_ROLE,
          CONFIG.TOKEN,
          undefined, // No Redux store
          userDetails
        );

        // Check offline queue
        const queueStatus = chatService.getOfflineQueueStatus();
        if (queueStatus.count > 0) {
          console.log(chalk.yellow(`📥 ${queueStatus.count} messages in offline queue`));
        }

        console.log(chalk.green('✅ Chat Service initialized successfully\n'));
        this.retryCount = 0; // Reset retry count
        return true;

      } catch (error: any) {
        this.retryCount++;
        console.error(chalk.yellow(`⚠️  Initialization attempt ${this.retryCount}/${this.maxRetries} failed`));
        
        if (this.retryCount >= this.maxRetries) {
          console.error(chalk.red('❌ Max retries reached'));
          return false;
        }

        // Wait before retry
        await this.delay(2000 * this.retryCount);
      }
    }

    return false;
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners() {
    // Connection state changes
    const cleanup1 = chatService.onConnectionStateChange((state, details) => {
      const stateColor = state === ConnectionState.CONNECTED ? 'green' :
                        state === ConnectionState.CONNECTING ? 'yellow' :
                        state === ConnectionState.RECONNECTING ? 'yellow' : 'red';
      
      console.log(chalk[stateColor](`\n📡 Connection: ${state}`));
      
      if (details?.error) {
        console.log(chalk.red(`  Error: ${details.error}`));
      }
    });
    this.cleanupFunctions.push(cleanup1);

    // New messages
    const cleanup2 = chatService.onNewMessage((message) => {
      const isMine = message.senderId === CONFIG.USER_ID;
      const sender = isMine ? 'You' : CONFIG.RECEIVER_NAME;
      const color = isMine ? 'blue' : 'white';
      const statusIcon = this.getStatusIcon(message.status);
      
      console.log(chalk[color](`\n💬 [${sender}]: ${message.content} ${statusIcon}`));
      
      // Store in history
      this.messageHistory.push(message);
      
      // Prompt again
      if (this.isRunning) {
        this.rl.prompt();
      }
    });
    this.cleanupFunctions.push(cleanup2);

    // Message sent
    const cleanup3 = chatService.onMessageSent((data) => {
      console.log(chalk.green(`\n✅ Message sent: ${data.messageId}`));
      if (this.isRunning) this.rl.prompt();
    });
    this.cleanupFunctions.push(cleanup3);

    // Message errors
    const cleanup4 = chatService.onMessageSendError((data) => {
      console.log(chalk.red(`\n❌ Message failed: ${data.error}`));
      if (this.isRunning) this.rl.prompt();
    });
    this.cleanupFunctions.push(cleanup4);

    // Typing indicators
    const cleanup5 = chatService.onTyping((userId, isTyping) => {
      if (userId !== CONFIG.USER_ID && isTyping) {
        console.log(chalk.gray(`\n✏️  ${CONFIG.RECEIVER_NAME} is typing...`));
        if (this.isRunning) this.rl.prompt();
      }
    });
    this.cleanupFunctions.push(cleanup5);
  }

  /**
   * Setup conversation
   */
  private async setupConversation(): Promise<boolean> {
    console.log(chalk.cyan('🔍 Setting up conversation...'));

    try {
      // Find or create conversation
      const conversation = await chatService.findOrCreateJobConversation(
        CONFIG.JOB_ID,
        CONFIG.RECEIVER_ID
      );

      this.conversationId = conversation.id;
      console.log(chalk.green(`✅ Conversation ready: ${this.conversationId}`));

      // Load existing messages
      const messages = await chatService.loadMessages(this.conversationId, {
        page: 1,
        limit: 10
      });

      if (messages.messages.length > 0) {
        console.log(chalk.gray(`\n📜 Recent messages:`));
        
        // Show last 5 messages
        messages.messages.slice(-5).forEach(msg => {
          const sender = msg.senderId === CONFIG.USER_ID ? 'You' : CONFIG.RECEIVER_NAME;
          const time = new Date(msg.timestamp).toLocaleTimeString();
          console.log(chalk.gray(`  [${time}] ${sender}: ${msg.content.substring(0, 50)}${msg.content.length > 50 ? '...' : ''}`));
        });

        // Store in history
        this.messageHistory = messages.messages;
      }

      // Send greeting if conversation is new
      if (messages.messages.length === 0) {
        console.log(chalk.cyan('\n📤 Sending greeting...'));
        await chatService.sendTextMessage(
          this.conversationId,
          `Hello! I'm ${CONFIG.USER_NAME}, your ${CONFIG.USER_ROLE} for the ${CONFIG.JOB_TITLE}.`,
          CONFIG.RECEIVER_ID
        );
      }

      console.log();
      return true;

    } catch (error: any) {
      logger.error('Failed to setup conversation', error);
      return false;
    }
  }

  /**
   * Start connection monitoring
   */
  private startConnectionMonitoring() {
    // Check connection every 10 seconds
    this.connectionCheckInterval = setInterval(() => {
      const isConnected = chatService.isConnected();
      const state = chatService.getConnectionState();
      
      // Only log if disconnected
      if (!isConnected && state !== ConnectionState.CONNECTING) {
        console.log(chalk.yellow('\n⚠️  Connection lost, attempting to reconnect...'));
        if (this.isRunning) this.rl.prompt();
      }
    }, 10000) as any;
  }

  /**
   * Start command prompt
   */
  private startCommandPrompt() {
    console.log(chalk.gray('Type /help for commands'));
    this.rl.prompt();

    this.rl.on('line', async (input) => {
      await this.handleInput(input.trim());
      
      if (this.isRunning) {
        this.rl.prompt();
      }
    });

    // Handle Ctrl+C gracefully
    this.rl.on('SIGINT', async () => {
      console.log(chalk.yellow('\n\n👋 Goodbye!'));
      await this.shutdown();
    });
  }

  /**
   * Handle user input
   */
  private async handleInput(input: string) {
    if (!input) return;

    // Handle commands
    if (input.startsWith('/')) {
      await this.handleCommand(input.toLowerCase());
    } else {
      // Send as message
      await this.sendMessage(input);
    }
  }

  /**
   * Handle commands
   */
  private async handleCommand(command: string) {
    const [cmd, ...args] = command.split(' ');

    switch (cmd) {
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
        this.showOfflineQueue();
        break;

      case '/history':
        this.showHistory();
        break;

      case '/clear':
        console.clear();
        this.displayHeader();
        break;

      case '/reconnect':
        await this.reconnect();
        break;

      case '/test':
        await this.sendTestMessages(parseInt(args[0]) || 5);
        break;

      case '/typing':
        this.sendTypingIndicator();
        break;

      case '/exit':
      case '/quit':
        await this.shutdown();
        break;

      default:
        console.log(chalk.red(`Unknown command: ${cmd}`));
        console.log(chalk.gray('Type /help for available commands'));
    }
  }

  /**
   * Send a message
   */
  private async sendMessage(text: string) {
    if (!this.conversationId) {
      console.log(chalk.red('No active conversation'));
      return;
    }

    try {
      const message = await chatService.sendTextMessage(
        this.conversationId,
        text,
        CONFIG.RECEIVER_ID
      );

      // Message will be displayed via event listener
      logger.debug('Message queued for sending', { id: message.id });

    } catch (error: any) {
      console.error(chalk.red('Failed to send:'), error.message);
    }
  }

  /**
   * Send test messages
   */
  private async sendTestMessages(count: number) {
    console.log(chalk.cyan(`📤 Sending ${count} test messages...`));

    for (let i = 1; i <= count; i++) {
      const message = `Test message #${i} at ${new Date().toISOString()}`;
      await this.sendMessage(message);
      await this.delay(500); // Small delay between messages
    }

    console.log(chalk.green(`✅ Sent ${count} test messages`));
  }

  /**
   * Send typing indicator
   */
  private sendTypingIndicator() {
    if (!this.conversationId) {
      console.log(chalk.red('No active conversation'));
      return;
    }

    chatService.sendTypingIndicator(this.conversationId, CONFIG.RECEIVER_ID, true);
    console.log(chalk.gray('✏️  Typing indicator sent'));

    // Stop typing after 3 seconds
    setTimeout(() => {
      chatService.sendTypingIndicator(this.conversationId!, CONFIG.RECEIVER_ID, false);
    }, 3000);
  }

  /**
   * Retry failed messages
   */
  private async retryFailedMessages() {
    if (!this.conversationId) {
      console.log(chalk.yellow('No active conversation'));
      return;
    }

    const result = await chatService.retryAllFailedMessages(this.conversationId);
    
    if (result.attempted === 0) {
      console.log(chalk.gray('No failed messages to retry'));
    } else {
      console.log(chalk.green(`✅ Retried ${result.successful}/${result.attempted} messages`));
      if (result.failed > 0) {
        console.log(chalk.red(`❌ ${result.failed} messages still failed`));
      }
    }
  }

  /**
   * Reconnect to server
   */
  private async reconnect() {
    console.log(chalk.cyan('🔄 Reconnecting...'));
    
    try {
      await chatService.disconnect();
      await this.delay(1000);
      await this.initializeChatService();
      console.log(chalk.green('✅ Reconnected successfully'));
    } catch (error: any) {
      console.error(chalk.red('❌ Reconnection failed:'), error.message);
    }
  }

  /**
   * Show help
   */
  private showHelp() {
    console.log(chalk.cyan('\n📋 Available Commands:'));
    console.log(chalk.white('  /help         - Show this help menu'));
    console.log(chalk.white('  /status       - Show connection & queue status'));
    console.log(chalk.white('  /history      - Show message history'));
    console.log(chalk.white('  /retry        - Retry failed messages'));
    console.log(chalk.white('  /queue        - Show offline queue'));
    console.log(chalk.white('  /reconnect    - Force reconnection'));
    console.log(chalk.white('  /test [n]     - Send n test messages (default: 5)'));
    console.log(chalk.white('  /typing       - Send typing indicator'));
    console.log(chalk.white('  /clear        - Clear screen'));
    console.log(chalk.white('  /exit         - Exit the client'));
    console.log(chalk.white('  <text>        - Send a message'));
    console.log();
  }

  /**
   * Show status
   */
  private showStatus() {
    const connectionState = chatService.getConnectionState();
    const isConnected = chatService.isConnected();
    const queueStatus = chatService.getOfflineQueueStatus();
    
    console.log(chalk.cyan('\n📊 Status:'));
    console.log(chalk.white(`  Connection: ${connectionState} (${isConnected ? '🟢 Connected' : '🔴 Disconnected'})`));
    console.log(chalk.white(`  Conversation: ${this.conversationId || 'None'}`));
    console.log(chalk.white(`  Messages sent: ${this.messageHistory.length}`));
    console.log(chalk.white(`  Offline Queue: ${queueStatus.count} messages`));
    
    if (this.conversationId) {
      const hasFailed = chatService.hasFailedMessages(this.conversationId);
      console.log(chalk.white(`  Failed Messages: ${hasFailed ? '❌ Yes' : '✅ No'}`));
    }

    // Show service factory stats
    const serviceStats = ServiceFactory.getServiceStats();
    console.log(chalk.gray('\n  Services:'));
    console.log(chalk.gray(`    Active: ${serviceStats.instances}`));
    console.log(chalk.gray(`    API Clients: ${serviceStats.apiClients}`));
    console.log();
  }

  /**
   * Show message history
   */
  private showHistory() {
    if (this.messageHistory.length === 0) {
      console.log(chalk.gray('\nNo messages in history'));
      return;
    }

    console.log(chalk.cyan(`\n📜 Message History (${this.messageHistory.length} messages):`));
    
    // Show last 10 messages
    const recentMessages = this.messageHistory.slice(-10);
    recentMessages.forEach(msg => {
      const sender = msg.senderId === CONFIG.USER_ID ? 'You' : CONFIG.RECEIVER_NAME;
      const time = new Date(msg.timestamp).toLocaleTimeString();
      const status = this.getStatusIcon(msg.status);
      const color = msg.senderId === CONFIG.USER_ID ? 'blue' : 'white';
      
      console.log(chalk[color](`  [${time}] ${sender}: ${msg.content} ${status}`));
    });
    console.log();
  }


  /**
 * Show offline queue
 */
private showOfflineQueue() {
  const queue = chatService.getOfflineQueueStatus();
  
  console.log(chalk.cyan(`\n📥 Offline Queue (${queue.count} messages):`));
  
  if (queue.count === 0) {
    console.log(chalk.gray('  Empty'));
  } else {
    queue.messages.forEach((msg: {
      clientTempId: string;
      conversationId: string;
      content: string;
      timestamp: string;
      retryCount: number;
      age: number;
    }) => {
      const age = Math.floor(msg.age / 1000);
      console.log(chalk.gray(`  - "${msg.content}" (${msg.retryCount} retries, ${age}s old)`));
    });
  }
  console.log();
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
      [MessageStatus.EXPIRED]: '⏰'
    };
    return icons[status] || '';
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown gracefully
   */
  async shutdown() {
    console.log(chalk.yellow('\n🔌 Shutting down...'));
    
    this.isRunning = false;
    
    // Stop monitoring
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }
    
    // Clean up event listeners
    this.cleanupFunctions.forEach(cleanup => cleanup());
    
    // Disconnect chat service
    try {
      await chatService.disconnect();
    } catch (error) {
      logger.error('Error disconnecting chat service', error);
    }
    
    // Close readline
    this.rl.close();
    
    // Clear service instances
    ServiceFactory.clearInstances();
    
    console.log(chalk.green('✅ Shutdown complete'));
    process.exit(0);
  }
}

// Handle process signals
process.on('SIGINT', async () => {
  // Handled by readline SIGINT
});

process.on('SIGTERM', async () => {
  console.log(chalk.yellow('\n\nReceived SIGTERM'));
  if (client) {
    await client.shutdown();
  }
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  console.error(chalk.red('\n❌ Uncaught Exception:'), error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
  console.error(chalk.red('\n❌ Unhandled Rejection:'), reason);
  process.exit(1);
});

// Create and start client
const client = new ChatTestClient();

// Start the client
(async () => {
  try {
    await client.start();
  } catch (error) {
    logger.error('Failed to start client', error);
    console.error(chalk.red('Failed to start:'), error);
    process.exit(1);
  }
})();