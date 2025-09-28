// src/services/implementations/base/BaseMessageService.ts
import { 
  Message, 
  MessageStatus,
  MessageType,
  AttachmentType,
  Attachment
} from '../../../types/chat';
import { v4 as uuidv4 } from 'uuid';
import { ICacheService } from '../../interfaces';

/**
 * Base class with shared message logic - no duplication
 */
export abstract class BaseMessageService {
  protected MESSAGE_TIMEOUT = 30000;
  protected processingMessages = new Set<string>();
  protected messageTimeouts = new Map<string, any>();
  
  constructor(
    protected cacheService: ICacheService,
    protected userId: string = ''
  ) {}

  /**
   * Create a message object - shared by all implementations
   */
  protected createMessage(
    conversationId: string,
    content: string,
    receiverId: string,
    options?: {
      replyTo?: string;
      attachments?: Attachment[];
      metadata?: Record<string, any>;
    }
  ): Message {
    const now = Date.now();
    const clientTempId = `temp-${now}-${Math.random().toString(36).substr(2, 9)}`;
    const messageId = uuidv4();
    
    return {
      id: messageId,
      clientTempId,
      senderId: this.userId,
      receiverId,
      content,
      timestamp: new Date().toISOString(),
      type: MessageType.TEXT,
      status: MessageStatus.SENDING,
      replyTo: options?.replyTo,
      attachments: options?.attachments,
      conversationId,
      jobId: options?.metadata?.jobId
    };
  }

  /**
   * Transform API response to Message - shared by all
   */
  protected transformMessage(data: any): Message {
    return {
      id: data.id,
      clientTempId: data.clientTempId,
      senderId: data.senderId,
      receiverId: data.receiverId,
      content: data.content?.text || data.content || '',
      timestamp: data.createdAt || data.timestamp,
      type: data.type || MessageType.TEXT,
      status: data.status || MessageStatus.SENT,
      replyTo: data.content?.replyTo || data.replyTo,
      attachments: this.transformAttachments(data.content || data),
      conversationId: data.conversationId,
      jobId: data.jobId,
      isEdited: data.isEdited,
      editedAt: data.editedAt
    };
  }

  /**
   * Transform attachments - shared by all
   */
  protected transformAttachments(content: any): Attachment[] {
    const attachments: Attachment[] = [];
    
    if (content?.attachments?.length) {
      content.attachments.forEach((att: any) => {
        attachments.push({
          id: att.id || `file-${attachments.length}`,
          type: att.type || AttachmentType.FILE,
          url: att.url,
          name: att.name || 'file',
          size: att.size || 0
        });
      });
    }
    
    if (content?.images?.length) {
      content.images.forEach((url: string, index: number) => {
        attachments.push({
          id: `img-${index}`,
          type: AttachmentType.IMAGE,
          url,
          name: `image-${index}`,
          size: 0
        });
      });
    }
    
    if (content?.audio) {
      attachments.push({
        id: 'audio-0',
        type: AttachmentType.AUDIO,
        url: content.audio,
        name: 'audio',
        size: 0
      });
    }
    
    return attachments;
  }

  /**
   * Get MIME type - shared utility
   */
  protected getMimeType(type: AttachmentType): string {
    switch (type) {
      case AttachmentType.IMAGE: return 'image/jpeg';
      case AttachmentType.AUDIO: return 'audio/mp4';
      case AttachmentType.FILE: return 'application/octet-stream';
      default: return 'application/octet-stream';
    }
  }

  /**
   * Get file extension - shared utility
   */
  protected getFileExtension(type: AttachmentType): string {
    switch (type) {
      case AttachmentType.IMAGE: return 'jpg';
      case AttachmentType.AUDIO: return 'm4a';
      case AttachmentType.FILE: return 'bin';
      default: return 'bin';
    }
  }

  /**
   * Track message processing - shared tracking logic
   */
  protected trackMessage(clientTempId: string): void {
    this.processingMessages.add(clientTempId);
  }

  /**
   * Untrack message - shared cleanup logic
   */
  protected untrackMessage(clientTempId: string): void {
    this.processingMessages.delete(clientTempId);
    const timeout = this.messageTimeouts.get(clientTempId);
    if (timeout) {
      clearTimeout(timeout);
      this.messageTimeouts.delete(clientTempId);
    }
  }

  /**
   * Check if message is being processed - shared check
   */
  protected isMessageProcessing(clientTempId: string): boolean {
    return this.processingMessages.has(clientTempId);
  }

  /**
   * Set message timeout - shared timeout logic
   */
  protected setMessageTimeout(
    clientTempId: string, 
    callback: () => void, 
    timeout: number = this.MESSAGE_TIMEOUT
  ): void {
    const timeoutId = setTimeout(() => {
      this.untrackMessage(clientTempId);
      callback();
    }, timeout);
    
    this.messageTimeouts.set(clientTempId, timeoutId);
  }

  /**
   * Cache message - shared caching
   */
  protected cacheMessage(conversationId: string, message: Message): void {
    this.cacheService.cacheMessage(conversationId, message);
  }

  /**
   * Get cached messages - shared retrieval
   */
  protected getCachedMessages(conversationId: string): Message[] {
    return this.cacheService.getCachedMessages(conversationId);
  }

  /**
   * Find message in cache - shared search
   */
  protected findMessageInCache(
    conversationId: string,
    messageId: string,
    clientTempId?: string
  ): Message | undefined {
    const messages = this.getCachedMessages(conversationId);
    return messages.find(m => 
      m.id === messageId || 
      (clientTempId && m.clientTempId === clientTempId)
    );
  }
}