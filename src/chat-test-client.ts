// chat-test-client.ts - Simple test client that uses ChatService
import * as readline from 'readline';
import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config();

// Import the ChatService (the main logic)
import { chatService } from './services/chatService';
import { 
  MessageStatus, 
  ConnectionState,
  UserRegistrationData
} from './types/chat';

// Import chalk for colors (handle both CommonJS and ES modules)
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
  JOB_ID: uuidv4(),
  JOB_TITLE: process.env.JOB_TITLE || 'Service Request'
};

/**
 * Simple Test Client for ChatService
 * This is just a thin wrapper that uses ChatService
 */
class ChatTestClient {
  private rl: readline.Interface;
  private conversationId: string | null = null;
  private isRunning: boolean = false;
  private cleanupFunctions: (() => void)[] = [];

  constructor() {
    // Setup readline interface for user input
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Start the client
   */
  async start(): Promise<void> {
    try {
      this.isRunning = true;
      
      // Clear screen and show header
      console.clear();
      console.log(chalk.cyan.bold('========================================'));
      console.log(chalk.cyan.bold('     Chat Service Test Client v2.0     '));
      console.log(chalk.cyan.bold('========================================'));
      console.log(chalk.white(`User: ${CONFIG.USER_NAME} (${CONFIG.USER_ROLE})`));
      console.log(chalk.white(`Job: ${CONFIG.JOB_TITLE}`));
      console.log(chalk.white(`Receiver: ${CONFIG.RECEIVER_NAME}`));
      console.log(chalk.gray('\nType /help for commands\n'));

      // Initialize ChatService
      await this.initializeChatService();

      // Setup event listeners
      this.setupEventListeners();

      // Create or find conversation and send initial message
      await this.setupConversation();

      // Start command prompt
      this.startCommandPrompt();

    } catch (error: any) {
      console.error(chalk.red('\n❌ Fatal error:'), error.message);
      await this.shutdown();
    }
  }

  /**
   * Initialize the chat service
   */
  private async initializeChatService(): Promise<void> {
    console.log(chalk.cyan('🚀 Initializing Chat Service...'));

    // Prepare user details
    const userDetails: UserRegistrationData = {
      id: CONFIG.USER_ID,
      externalId: CONFIG.USER_ID,
      name: CONFIG.USER_NAME,
      email: CONFIG.USER_EMAIL,
      phone: CONFIG.USER_PHONE,
      role: CONFIG.USER_ROLE as any
    };

    // Initialize chatService (all logic is in chatService)
    await chatService.initialize(
      CONFIG.USER_ID,
      CONFIG.USER_ROLE,
      CONFIG.TOKEN,
      undefined, // No Redux store in test
      userDetails
    );

    // Check if we have offline messages
    const queueStatus = chatService.getOfflineQueueStatus();
    if (queueStatus.count > 0) {
      console.log(chalk.yellow(`📥 ${queueStatus.count} messages in offline queue`));
    }

    console.log(chalk.green('✅ Chat Service initialized\n'));
  }

  /**
   * Setup event listeners (using ChatService's methods)
   */
  private setupEventListeners(): void {
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
    });
    this.cleanupFunctions.push(cleanup2);

    // Message sent
    const cleanup3 = chatService.onMessageSent((data) => {
      console.log(chalk.green(`\n✅ Message sent: ${data.messageId}`));
    });
    this.cleanupFunctions.push(cleanup3);

    // Message errors
    const cleanup4 = chatService.onMessageSendError((data) => {
      console.log(chalk.red(`\n❌ Message failed: ${data.error}`));
    });
    this.cleanupFunctions.push(cleanup4);

    // Typing
    const cleanup5 = chatService.onTyping((userId, isTyping) => {
      if (userId !== CONFIG.USER_ID && isTyping) {
        console.log(chalk.gray(`\n✏️ ${CONFIG.RECEIVER_NAME} is typing...`));
      }
    });
    this.cleanupFunctions.push(cleanup5);
  }

  /**
   * Setup conversation
   */
  private async setupConversation(): Promise<void> {
    console.log(chalk.cyan('🔍 Setting up conversation...'));

    // Use chatService to find or create conversation
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
      console.log(chalk.gray(`\n📜 Loaded ${messages.messages.length} messages`));
      
      // Show last 3 messages
      messages.messages.slice(0, 3).reverse().forEach(msg => {
        const sender = msg.senderId === CONFIG.USER_ID ? 'You' : CONFIG.RECEIVER_NAME;
        console.log(chalk.gray(`  [${sender}]: ${msg.content.substring(0, 50)}...`));
      });
    }

    // Send initial message
    console.log(chalk.cyan('\n📤 Sending initial message...'));
    await chatService.sendTextMessage(
      this.conversationId,
      `Hello! I'm ${CONFIG.USER_NAME}, your usta for the ${CONFIG.JOB_TITLE}.`,
      CONFIG.RECEIVER_ID
    );
  }

  /**
   * Start command prompt
   */
  private startCommandPrompt(): void {
    this.rl.setPrompt(chalk.cyan('\n> '));
    this.rl.prompt();

    this.rl.on('line', async (input) => {
      await this.handleInput(input.trim());
      
      if (this.isRunning) {
        this.rl.prompt();
      }
    });
  }

  /**
   * Handle user input
   */
  private async handleInput(input: string): Promise<void> {
    if (!input) return;

    // Handle commands
    if (input.startsWith('/')) {
      await this.handleCommand(input.toLowerCase());
    } else {
      // Send as message using chatService
      await this.sendMessage(input);
    }
  }

  /**
   * Handle commands
   */
  private async handleCommand(command: string): Promise<void> {
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
        this.showOfflineQueue();
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
  }

  /**
   * Send a message using chatService
   */
  private async sendMessage(text: string): Promise<void> {
    if (!this.conversationId) {
      console.log(chalk.red('No active conversation'));
      return;
    }

    try {
      await chatService.sendTextMessage(
        this.conversationId,
        text,
        CONFIG.RECEIVER_ID
      );
    } catch (error: any) {
      console.error(chalk.red('Failed to send:'), error.message);
    }
  }

  /**
   * Retry failed messages using chatService
   */
  private async retryFailedMessages(): Promise<void> {
    if (!this.conversationId) {
      console.log(chalk.yellow('No active conversation'));
      return;
    }

    const result = await chatService.retryAllFailedMessages(this.conversationId);
    
    if (result.attempted === 0) {
      console.log(chalk.gray('No failed messages to retry'));
    } else {
      console.log(chalk.green(`✅ Retried ${result.successful}/${result.attempted} messages`));
    }
  }

  /**
   * Show help
   */
  private showHelp(): void {
    console.log(chalk.cyan('\n📋 Available Commands:'));
    console.log(chalk.white('  /help     - Show this help menu'));
    console.log(chalk.white('  /status   - Show connection status'));
    console.log(chalk.white('  /retry    - Retry failed messages'));
    console.log(chalk.white('  /queue    - Show offline queue'));
    console.log(chalk.white('  /clear    - Clear screen'));
    console.log(chalk.white('  /exit     - Exit the client'));
    console.log(chalk.white('  <text>    - Send a message'));
  }

  /**
   * Show status using chatService
   */
  private showStatus(): void {
    const connectionState = chatService.getConnectionState();
    const isConnected = chatService.isConnected();
    const queueStatus = chatService.getOfflineQueueStatus();
    
    console.log(chalk.cyan('\n📊 Status:'));
    console.log(chalk.white(`  Connection: ${connectionState} (${isConnected ? 'Connected' : 'Disconnected'})`));
    console.log(chalk.white(`  Conversation: ${this.conversationId || 'None'}`));
    console.log(chalk.white(`  Offline Queue: ${queueStatus.count} messages`));
    
    if (this.conversationId) {
      const hasFailed = chatService.hasFailedMessages(this.conversationId);
      console.log(chalk.white(`  Failed Messages: ${hasFailed ? 'Yes' : 'No'}`));
    }
  }

  /**
   * Show offline queue using chatService
   */
  private showOfflineQueue(): void {
    const queue = chatService.getOfflineQueueStatus();
    
    console.log(chalk.cyan(`\n📥 Offline Queue (${queue.count} messages):`));
    
    if (queue.count === 0) {
      console.log(chalk.gray('  Empty'));
    } else {
      queue.messages.forEach(msg => {
        console.log(chalk.gray(`  - ${msg.content} (${msg.retryCount} retries)`));
      });
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
      [MessageStatus.EXPIRED]: '⏰'
    };
    return icons[status] || '';
  }

  /**
   * Shutdown gracefully
   */
  async shutdown(): Promise<void> {
    console.log(chalk.yellow('\n🔌 Shutting down...'));
    
    this.isRunning = false;
    
    // Clean up event listeners
    this.cleanupFunctions.forEach(cleanup => cleanup());
    
    // Disconnect chatService
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

process.on('unhandledRejection', (reason) => {
  console.error(chalk.red('\n❌ Unhandled Rejection:'), reason);
  process.exit(1);
});

// Create and start client
const client = new ChatTestClient();
client.start().catch(error => {
  console.error(chalk.red('Failed to start:'), error);
  process.exit(1);
});