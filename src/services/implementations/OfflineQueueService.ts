// src/services/implementations/offline/OfflineQueueService.ts
import { IOfflineQueueService, IStorageService } from '../../interfaces';
import { Message, MessageStatus, QueuedMessage } from '../../../types/chat';

export class OfflineQueueService implements IOfflineQueueService {
  private queue: Map<string, QueuedMessage> = new Map();
  private isProcessing: boolean = false;
  private readonly STORAGE_KEY = 'offline_message_queue';
  private readonly MAX_RETRIES = 3;
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly MESSAGE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    private storageService: IStorageService,
    private sendMessageFn?: (message: Message) => Promise<Message>
  ) {
    this.loadQueue(); // Load queue on initialization
  }

  async queueMessage(message: Message): Promise<void> {
    if (this.queue.size >= this.MAX_QUEUE_SIZE) {
      console.warn('Offline queue is full, removing oldest message');
      const oldestKey = Array.from(this.queue.keys())[0];
      this.queue.delete(oldestKey);
    }

    const clientTempId = message.clientTempId || `offline-${Date.now()}-${Math.random()}`;
    
    const queuedMessage: QueuedMessage = {
      message: {
        ...message,
        status: MessageStatus.QUEUED,
        clientTempId
      },
      retryCount: 0,
      maxRetries: this.MAX_RETRIES,
      addedAt: Date.now()
    };

    this.queue.set(clientTempId, queuedMessage);
    await this.saveQueue();
    
    console.log(`📋 Message queued for offline sending. Queue size: ${this.queue.size}`);
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.size === 0) {
      return;
    }

    console.log(`📤 Processing ${this.queue.size} offline messages...`);
    this.isProcessing = true;

    try {
      const sortedMessages = this.getSortedMessages();
      const processedIds: string[] = [];

      for (const [clientTempId, queuedMessage] of sortedMessages) {
        try {
          // Check if message hasn't expired
          if (this.isMessageExpired(queuedMessage)) {
            console.warn('Message expired, removing from queue:', clientTempId);
            processedIds.push(clientTempId);
            continue;
          }

          // Check retry count
          if (queuedMessage.retryCount >= queuedMessage.maxRetries) {
            console.error('Max retries reached for message:', clientTempId);
            this.updateMessageStatus(queuedMessage.message, MessageStatus.FAILED);
            processedIds.push(clientTempId);
            continue;
          }

          // Try to send the message
          if (this.sendMessageFn) {
            console.log(`Sending queued message (attempt ${queuedMessage.retryCount + 1}/${queuedMessage.maxRetries}):`, clientTempId);
            
            await this.sendMessageFn(queuedMessage.message);
            
            // Success - remove from queue
            console.log('✓ Queued message sent successfully:', clientTempId);
            processedIds.push(clientTempId);
          }

        } catch (error) {
          console.error('Failed to send queued message:', error);
          
          // Update retry count
          queuedMessage.retryCount++;
          
          // If max retries reached, mark as failed
          if (queuedMessage.retryCount >= queuedMessage.maxRetries) {
            this.updateMessageStatus(queuedMessage.message, MessageStatus.FAILED);
            processedIds.push(clientTempId);
          }
        }

        // Small delay between messages
        await this.delay(500);
      }

      // Remove processed messages
      for (const id of processedIds) {
        this.queue.delete(id);
      }

      // Save updated queue
      await this.saveQueue();
      
      console.log(`✓ Queue processing complete. Remaining: ${this.queue.size}`);

    } finally {
      this.isProcessing = false;
    }
  }

  getQueuedMessages(): Message[] {
    return Array.from(this.queue.values()).map(q => q.message);
  }

  async clearQueue(): Promise<void> {
    this.queue.clear();
    await this.storageService.remove(this.STORAGE_KEY);
    console.log('🗑️ Offline queue cleared');
  }

  async removeFromQueue(clientTempId: string): Promise<void> {
    if (this.queue.delete(clientTempId)) {
      await this.saveQueue();
      console.log('✓ Message removed from queue:', clientTempId);
    }
  }

  getQueueSize(): number {
    return this.queue.size;
  }

  isProcessing(): boolean {
    return this.isProcessing;
  }

  async saveQueue(): Promise<void> {
    try {
      if (this.queue.size === 0) {
        await this.storageService.remove(this.STORAGE_KEY);
        return;
      }

      const queueArray = Array.from(this.queue.entries());
      await this.storageService.set(this.STORAGE_KEY, queueArray);
      
      console.log(`💾 Saved ${this.queue.size} messages to offline queue`);
    } catch (error) {
      console.error('Failed to save offline queue:', error);
    }
  }

  async loadQueue(): Promise<void> {
    try {
      const queueData = await this.storageService.get<Array<[string, QueuedMessage]>>(this.STORAGE_KEY);
      
      if (!queueData || !Array.isArray(queueData)) {
        return;
      }

      this.queue.clear();
      
      for (const [clientTempId, queuedMessage] of queueData) {
        if (this.isValidQueuedMessage(queuedMessage)) {
          // Skip expired messages
          if (!this.isMessageExpired(queuedMessage)) {
            this.queue.set(clientTempId, queuedMessage);
          }
        }
      }

      console.log(`📥 Loaded ${this.queue.size} messages from offline queue`);
      
      // Clean up expired messages
      if (this.queue.size < queueData.length) {
        await this.saveQueue();
      }

    } catch (error) {
      console.error('Failed to load offline queue:', error);
      // Clear corrupted data
      await this.storageService.remove(this.STORAGE_KEY);
    }
  }

  // Set the send function for processing
  setSendFunction(sendFn: (message: Message) => Promise<Message>): void {
    this.sendMessageFn = sendFn;
  }

  // Get queue status
  getQueueStatus(): {
    count: number;
    messages: Array<{
      clientTempId: string;
      conversationId: string;
      content: string;
      timestamp: string;
      retryCount: number;
      age: number;
    }>;
  } {
    const now = Date.now();
    const messages = Array.from(this.queue.entries()).map(([clientTempId, queued]) => ({
      clientTempId,
      conversationId: queued.message.conversationId,
      content: queued.message.content.substring(0, 50) + '...',
      timestamp: queued.message.timestamp,
      retryCount: queued.retryCount,
      age: now - queued.addedAt
    }));

    return {
      count: this.queue.size,
      messages
    };
  }

  // Clean up expired messages
  async cleanupExpiredMessages(): Promise<void> {
    const initialSize = this.queue.size;
    const expiredIds: string[] = [];

    for (const [clientTempId, queuedMessage] of this.queue.entries()) {
      if (this.isMessageExpired(queuedMessage)) {
        expiredIds.push(clientTempId);
      }
    }

    for (const id of expiredIds) {
      this.queue.delete(id);
    }

    if (expiredIds.length > 0) {
      await this.saveQueue();
      console.log(`🧹 Removed ${expiredIds.length} expired messages from queue`);
    }
  }

  // Private helper methods
  
  private getSortedMessages(): Array<[string, QueuedMessage]> {
    return Array.from(this.queue.entries())
      .sort(([, a], [, b]) => a.addedAt - b.addedAt);
  }

  private isMessageExpired(queuedMessage: QueuedMessage): boolean {
    return Date.now() - queuedMessage.addedAt > this.MESSAGE_EXPIRY;
  }

  private isValidQueuedMessage(obj: any): obj is QueuedMessage {
    return obj && 
           obj.message && 
           typeof obj.retryCount === 'number' &&
           typeof obj.maxRetries === 'number' &&
           typeof obj.addedAt === 'number';
  }

  private updateMessageStatus(message: Message, status: MessageStatus): void {
    message.status = status;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}