// src/services/implementations/hybrid/HybridMessageService.ts
import { BaseMessageService } from '../base/BaseMessageService';
import { 
  IMessageService,
  ICacheService,
  IOfflineQueueService
} from '../../interfaces';
import { 
  Message, 
  MessageLoadOptions, 
  MessageLoadResult,
  MessageStatus,
  AttachmentType,
  ConnectionState
} from '../../../types/chat';
import { RestMessageService } from '../rest/RestMessageService';
import { SocketMessageService } from '../socket/SocketMessageService';

export class HybridMessageService extends BaseMessageService implements IMessageService {
  private restService: RestMessageService;
  private socketService: SocketMessageService;
  
  constructor(
    apiClient: any,
    socketClient: any,
    cacheService: ICacheService,
    private offlineQueueService: IOfflineQueueService,
    private connectionChecker: () => ConnectionState,
    userId: string = ''
  ) {
    super(cacheService, userId);
    
    // Initialize both services
    this.restService = new RestMessageService(apiClient, cacheService, userId);
    this.socketService = new SocketMessageService(socketClient, cacheService, userId);
  }

  async sendMessage(
    conversationId: string, 
    content: string, 
    receiverId: string,
    options?: {
      replyTo?: string;
      attachments?: any[];
      metadata?: Record<string, any>;
    }
  ): Promise<Message> {
    // Check connection state
    const connectionState = this.connectionChecker();
    
    // If offline, queue the message
    if (this.isOffline(connectionState)) {
      return this.queueOfflineMessage(conversationId, content, receiverId, options);
    }

    // If connected, try socket first, fallback to REST
    if (this.isSocketAvailable(connectionState)) {
      try {
        return await this.socketService.sendMessage(conversationId, content, receiverId, options);
      } catch (socketError) {
        console.warn('Socket send failed, trying REST:', socketError);
        // Fallthrough to REST
      }
    }

    // Use REST as fallback or primary
    try {
      return await this.restService.sendMessage(conversationId, content, receiverId, options);
    } catch (restError) {
      console.error('REST send failed, queueing for offline:', restError);
      return this.queueOfflineMessage(conversationId, content, receiverId, options);
    }
  }

  async sendAttachment(
    conversationId: string,
    file: any,
    type: AttachmentType,
    receiverId: string
  ): Promise<Message> {
    // Attachments always use REST for upload
    return this.restService.sendAttachment(conversationId, file, type, receiverId);
  }

  async getMessages(
    conversationId: string, 
    options?: MessageLoadOptions
  ): Promise<MessageLoadResult> {
    // Always use REST for fetching history
    return this.restService.getMessages(conversationId, options);
  }

  async getMessage(messageId: string): Promise<Message | null> {
    // Use REST to fetch individual messages
    return this.restService.getMessage(messageId);
  }

  async markAsRead(conversationId: string, messageIds?: string[]): Promise<void> {
    // Try both for redundancy
    const promises: Promise<void>[] = [];
    
    // Socket for real-time notification
    if (this.isSocketAvailable(this.connectionChecker())) {
      promises.push(
        this.socketService.markAsRead(conversationId, messageIds).catch(err => {
          console.warn('Socket mark as read failed:', err);
        })
      );
    }
    
    // REST for persistence
    promises.push(this.restService.markAsRead(conversationId, messageIds));
    
    await Promise.all(promises);
  }

  async editMessage(messageId: string, content: string): Promise<Message> {
    // Use REST for editing (persisted operation)
    return this.restService.editMessage(messageId, content);
  }

  async deleteMessage(messageId: string): Promise<void> {
    // Use REST for deletion (persisted operation)
    await this.restService.deleteMessage(messageId);
    
    // Also notify via socket if available
    if (this.isSocketAvailable(this.connectionChecker())) {
      this.socketService.deleteMessage(messageId).catch(err => {
        console.warn('Socket delete notification failed:', err);
      });
    }
  }

  async retryFailedMessage(
    conversationId: string,
    messageId: string,
    clientTempId?: string
  ): Promise<Message | null> {
    // Check offline queue first
    const queuedMessage = await this.checkOfflineQueue(messageId, clientTempId);
    if (queuedMessage) {
      return this.sendMessage(
        queuedMessage.conversationId,
        queuedMessage.content,
        queuedMessage.receiverId || '',
        {
          replyTo: queuedMessage.replyTo,
          attachments: queuedMessage.attachments
        }
      );
    }
    
    // Check cache for failed message
    const cachedMessage = this.findMessageInCache(conversationId, messageId, clientTempId);
    if (!cachedMessage || cachedMessage.status !== MessageStatus.FAILED) {
      return cachedMessage || null;
    }
    
    // Retry sending
    return this.sendMessage(
      conversationId,
      cachedMessage.content,
      cachedMessage.receiverId || '',
      {
        replyTo: cachedMessage.replyTo,
        attachments: cachedMessage.attachments
      }
    );
  }

  // Private helper methods
  
  private isOffline(state: ConnectionState): boolean {
    return state === ConnectionState.DISCONNECTED || 
           state === ConnectionState.ERROR;
  }

  private isSocketAvailable(state: ConnectionState): boolean {
    return state === ConnectionState.CONNECTED;
  }

  private async queueOfflineMessage(
    conversationId: string,
    content: string,
    receiverId: string,
    options?: any
  ): Promise<Message> {
    const message = this.createMessage(conversationId, content, receiverId, options);
    message.status = MessageStatus.QUEUED;
    
    // Queue for later sending
    await this.offlineQueueService.queueMessage(message);
    
    // Cache locally
    this.cacheMessage(conversationId, message);
    
    return message;
  }

  private async checkOfflineQueue(
    messageId: string,
    clientTempId?: string
  ): Promise<Message | null> {
    const queuedMessages = this.offlineQueueService.getQueuedMessages();
    const found = queuedMessages.find(m => 
      m.id === messageId || 
      (clientTempId && m.clientTempId === clientTempId)
    );
    
    if (found && found.clientTempId) {
      await this.offlineQueueService.removeFromQueue(found.clientTempId);
      return found;
    }
    
    return null;
  }
}