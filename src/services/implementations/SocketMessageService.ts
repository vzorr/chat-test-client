// src/services/implementations/socket/SocketMessageService.ts
import { BaseMessageService } from '../base/BaseMessageService';
import { IMessageService, ICacheService } from '../../interfaces';
import { 
  Message, 
  MessageLoadOptions, 
  MessageLoadResult,
  MessageStatus,
  AttachmentType
} from '../../../types/chat';

export class SocketMessageService extends BaseMessageService implements IMessageService {
  constructor(
    private socketClient: any,
    cacheService: ICacheService,
    userId: string = ''
  ) {
    super(cacheService, userId);
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
    return new Promise((resolve, reject) => {
      if (!this.socketClient.isConnected()) {
        reject(new Error('Socket not connected'));
        return;
      }

      // Create message using base class method
      const message = this.createMessage(conversationId, content, receiverId, options);
      const clientTempId = message.clientTempId!;
      
      // Track message
      this.trackMessage(clientTempId);

      // Set up event listeners
      const successHandler = this.socketClient.on('message_sent', (data: any) => {
        if (data.clientTempId === clientTempId) {
          this.handleMessageSent(data, message, resolve, successHandler, errorHandler);
        }
      });

      const errorHandler = this.socketClient.on('message_send_error', (data: any) => {
        if (data.clientTempId === clientTempId) {
          this.handleMessageError(data, reject, successHandler, errorHandler);
        }
      });

      // Set timeout using base class method
      this.setMessageTimeout(clientTempId, () => {
        this.cleanupHandlers(successHandler, errorHandler);
        message.status = MessageStatus.FAILED;
        this.cacheMessage(conversationId, message);
        reject(new Error('Message send timeout'));
      });

      // Send via socket
      this.socketClient.sendMessage(message);
    });
  }

  async sendAttachment(
    conversationId: string,
    file: any,
    type: AttachmentType,
    receiverId: string
  ): Promise<Message> {
    // Socket can't upload files directly - need REST for that
    throw new Error('Use REST or hybrid service for file uploads');
  }

  async getMessages(
    conversationId: string, 
    options?: MessageLoadOptions
  ): Promise<MessageLoadResult> {
    // Socket doesn't fetch history - return cached only
    const cached = this.getCachedMessages(conversationId);
    
    if (cached.length > 0) {
      return {
        messages: cached,
        hasMore: false,
        totalCount: cached.length,
        oldestMessageId: cached[cached.length - 1]?.id,
        newestMessageId: cached[0]?.id
      };
    }
    
    throw new Error('Socket service cannot fetch message history. Use REST or hybrid service.');
  }

  async getMessage(messageId: string): Promise<Message | null> {
    // Search all cached conversations
    // In real implementation, you'd have a better way to search across all cached messages
    return null;
  }

  async markAsRead(conversationId: string, messageIds?: string[]): Promise<void> {
    if (!this.socketClient.isConnected()) {
      throw new Error('Socket not connected');
    }

    this.socketClient.emit('mark_read', {
      conversationId,
      messageIds,
      userId: this.userId
    });
  }

  async editMessage(messageId: string, content: string): Promise<Message> {
    return new Promise((resolve, reject) => {
      if (!this.socketClient.isConnected()) {
        reject(new Error('Socket not connected'));
        return;
      }

      const editHandler = this.socketClient.on('message_edited', (data: any) => {
        if (data.messageId === messageId) {
          editHandler();
          
          const edited = this.transformMessage(data);
          edited.isEdited = true;
          edited.editedAt = new Date().toISOString();
          
          if (edited.conversationId) {
            this.cacheMessage(edited.conversationId, edited);
          }
          
          resolve(edited);
        }
      });

      this.socketClient.emit('edit_message', { messageId, content });

      setTimeout(() => {
        editHandler();
        reject(new Error('Edit message timeout'));
      }, this.MESSAGE_TIMEOUT);
    });
  }

  async deleteMessage(messageId: string): Promise<void> {
    if (!this.socketClient.isConnected()) {
      throw new Error('Socket not connected');
    }

    this.socketClient.emit('delete_message', { messageId });
  }

  async retryFailedMessage(
    conversationId: string,
    messageId: string,
    clientTempId?: string
  ): Promise<Message | null> {
    const message = this.findMessageInCache(conversationId, messageId, clientTempId);
    
    if (!message || message.status !== MessageStatus.FAILED) {
      return message || null;
    }

    if (clientTempId && this.isMessageProcessing(clientTempId)) {
      return null;
    }

    return this.sendMessage(
      conversationId,
      message.content,
      message.receiverId || '',
      {
        replyTo: message.replyTo,
        attachments: message.attachments
      }
    );
  }

  // Private Socket-specific methods
  private handleMessageSent(
    data: any,
    message: Message,
    resolve: (msg: Message) => void,
    ...cleanupHandlers: any[]
  ): void {
    this.untrackMessage(message.clientTempId!);
    this.cleanupHandlers(...cleanupHandlers);
    
    const sentMessage: Message = {
      ...message,
      id: data.messageId || data.id || message.id,
      status: MessageStatus.SENT,
      timestamp: data.timestamp || message.timestamp
    };
    
    this.cacheMessage(message.conversationId, sentMessage);
    resolve(sentMessage);
  }

  private handleMessageError(
    data: any,
    reject: (error: Error) => void,
    ...cleanupHandlers: any[]
  ): void {
    this.untrackMessage(data.clientTempId);
    this.cleanupHandlers(...cleanupHandlers);
    reject(new Error(data.error || 'Failed to send message'));
  }

  private cleanupHandlers(...handlers: any[]): void {
    handlers.forEach(handler => {
      if (typeof handler === 'function') {
        handler();
      }
    });
  }
}