// src/services/implementations/rest/RestMessageService.ts
import { BaseMessageService } from '../base/BaseMessageService';
import { IMessageService, ICacheService } from '../../interfaces';
import { 
  Message, 
  MessageLoadOptions, 
  MessageLoadResult,
  MessageStatus,
  AttachmentType,
  Attachment
} from '../../../types/chat';

export class RestMessageService extends BaseMessageService implements IMessageService {
  constructor(
    private apiClient: any,
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
      attachments?: Attachment[];
      metadata?: Record<string, any>;
    }
  ): Promise<Message> {
    // Create message using base class method
    const message = this.createMessage(conversationId, content, receiverId, options);
    
    // Track message
    this.trackMessage(message.clientTempId!);
    
    try {
      // Send via API
      const response = await this.apiClient.post('/messages', {
        conversationId,
        content,
        receiverId,
        replyTo: options?.replyTo,
        clientTempId: message.clientTempId,
        attachments: options?.attachments
      });

      // Update with server response
      const sentMessage: Message = {
        ...message,
        id: response.data.id || message.id,
        status: MessageStatus.SENT,
        timestamp: response.data.timestamp || message.timestamp
      };

      // Cache and cleanup
      this.cacheMessage(conversationId, sentMessage);
      this.untrackMessage(message.clientTempId!);
      
      return sentMessage;
      
    } catch (error) {
      this.untrackMessage(message.clientTempId!);
      throw error;
    }
  }

  async sendAttachment(
    conversationId: string,
    file: any,
    type: AttachmentType,
    receiverId: string
  ): Promise<Message> {
    // Upload file
    const attachment = await this.uploadFile(file, type);
    
    // Send message with attachment
    return this.sendMessage(
      conversationId,
      attachment.name || 'Attachment',
      receiverId,
      { attachments: [attachment] }
    );
  }

  async getMessages(
    conversationId: string, 
    options?: MessageLoadOptions
  ): Promise<MessageLoadResult> {
    try {
      const page = options?.page || 1;
      const limit = options?.limit || 50;
      const offset = (page - 1) * limit;

      const response = await this.apiClient.get(
        `/messages/conversation/${conversationId}?limit=${limit}&offset=${offset}`
      );

      if (response.data?.success) {
        // Transform using base class method
        const messages = response.data.messages.map((msg: any) => this.transformMessage(msg));
        
        // Cache all messages
        messages.forEach((msg: Message) => this.cacheMessage(conversationId, msg));

        return {
          messages,
          hasMore: response.data.hasMore || false,
          totalCount: response.data.total || messages.length,
          oldestMessageId: messages[messages.length - 1]?.id,
          newestMessageId: messages[0]?.id
        };
      }
      
      throw new Error(response.data?.message || 'Failed to fetch messages');
      
    } catch (error) {
      // Return cached on error
      const cached = this.getCachedMessages(conversationId);
      return {
        messages: cached,
        hasMore: false,
        totalCount: cached.length,
        oldestMessageId: cached[cached.length - 1]?.id,
        newestMessageId: cached[0]?.id
      };
    }
  }

  async getMessage(messageId: string): Promise<Message | null> {
    try {
      const response = await this.apiClient.get(`/messages/${messageId}`);
      return response.data?.success ? this.transformMessage(response.data.message) : null;
    } catch (error) {
      return null;
    }
  }

  async markAsRead(conversationId: string, messageIds?: string[]): Promise<void> {
    await this.apiClient.post('/messages/read', { conversationId, messageIds });
  }

  async editMessage(messageId: string, content: string): Promise<Message> {
    const response = await this.apiClient.patch(`/messages/${messageId}`, { content });
    
    if (response.data?.success) {
      const updated = this.transformMessage(response.data.message);
      if (updated.conversationId) {
        this.cacheMessage(updated.conversationId, updated);
      }
      return updated;
    }
    
    throw new Error('Failed to edit message');
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.apiClient.delete(`/messages/${messageId}`);
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

  // Private REST-specific method
  private async uploadFile(file: any, type: AttachmentType): Promise<Attachment> {
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      type: file.type || this.getMimeType(type),
      name: file.name || `${type}-${Date.now()}.${this.getFileExtension(type)}`
    } as any);
    formData.append('type', type);

    const response = await this.apiClient.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    if (!response.data?.success) {
      throw new Error('Upload failed');
    }

    return {
      id: response.data.file.id,
      type,
      url: response.data.file.url,
      name: response.data.file.name || file.name,
      size: response.data.file.size || file.size
    };
  }
}