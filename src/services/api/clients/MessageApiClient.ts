// src/services/api/clients/MessageApiClient.ts
import { BaseApiClient } from '../base/BaseApiClient';
import { 
  Message, 
  MessageType,
  MessageStatus,
  AttachmentType,
  Attachment
} from '../../../types/chat';

/**
 * Message API Client - handles message operations only
 */
export class MessageApiClient extends BaseApiClient {

  /**
   * Get messages for a conversation
   */
  async getMessages(conversationId: string, page: number = 1, limit: number = 50): Promise<{
    success: boolean;
    messages: Message[];
    hasMore: boolean;
    total: number;
  }> {
    try {
      console.log("🔍 [MessageApiClient] Getting messages for conversation:", conversationId);
      
      const offset = (page - 1) * limit;
      const response = await this.get(
        `/messages/conversation/${conversationId}?limit=${limit}&offset=${offset}`
      );

      if (this.isSuccessResponse(response)) {
        return {
          success: true,
          messages: (response.messages || []).map((msg: any) => this.transformMessage(msg)),
          hasMore: response.hasMore || false,
          total: response.total || 0
        };
      }
      
      throw new Error(response?.message || 'Failed to fetch messages');
    } catch (error: any) {
      this.safeLogError('Error fetching messages', error);
      throw error;
    }
  }

  /**
   * Send a text message
   */
  async sendMessage(payload: {
    conversationId: string;
    content: string;
    receiverId: string;
    replyTo?: string;
    clientTempId?: string;
    attachments?: Attachment[];
  }): Promise<{
    success: boolean;
    message: Message;
  }> {
    try {
      console.log('📤 [MessageApiClient] Sending message');
      
      const response = await this.post('/messages', payload);

      if (this.isSuccessResponse(response)) {
        return {
          success: true,
          message: this.transformMessage(response.message)
        };
      }
      
      throw new Error(response?.message || 'Failed to send message');
    } catch (error: any) {
      this.safeLogError('Error sending message', error);
      throw error;
    }
  }

  /**
   * Mark messages as read
   */
  async markAsRead(conversationId: string, messageIds?: string[]): Promise<void> {
    try {
      console.log('✅ [MessageApiClient] Marking messages as read:', { conversationId, messageIds });
      
      await this.post('/messages/read', {
        conversationId,
        messageIds
      });
      
      console.log('✅ [MessageApiClient] Messages marked as read');
    } catch (error: any) {
      this.safeLogError('Error marking messages as read', error);
      throw error;
    }
  }

  /**
   * Edit a message
   */
  async editMessage(messageId: string, content: string): Promise<{
    success: boolean;
    message: Message;
  }> {
    try {
      console.log('✏️ [MessageApiClient] Editing message:', messageId);
      
      const response = await this.put(`/messages/${messageId}`, { content });

      if (this.isSuccessResponse(response)) {
        return {
          success: true,
          message: this.transformMessage(response.message)
        };
      }
      
      throw new Error(response?.message || 'Failed to edit message');
    } catch (error: any) {
      this.safeLogError('Error editing message', error);
      throw error;
    }
  }

  /**
   * Delete a message
   */
  async deleteMessage(messageId: string): Promise<void> {
    try {
      console.log('🗑️ [MessageApiClient] Deleting message:', messageId);
      
      await this.delete(`/messages/${messageId}`);
      
      console.log('✅ [MessageApiClient] Message deleted');
    } catch (error: any) {
      this.safeLogError('Error deleting message', error);
      throw error;
    }
  }

  /**
   * Get a specific message by ID
   */
  async getMessageById(messageId: string): Promise<{
    success: boolean;
    message?: Message;
  }> {
    try {
      console.log('🔍 [MessageApiClient] Getting message by ID:', messageId);
      
      const response = await this.get(`/messages/${messageId}`);

      if (this.isSuccessResponse(response)) {
        return {
          success: true,
          message: this.transformMessage(response.message)
        };
      }
      
      return { success: false };
    } catch (error: any) {
      if (error.response?.status === 404) {
        return { success: false };
      }
      this.safeLogError('Error getting message', error);
      throw error;
    }
  }

  /**
   * Search messages
   */
  async searchMessages(
    searchQuery: string,
    params?: {
      conversationId?: string;
      userId?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{
    success: boolean;
    messages: Message[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      console.log('🔍 [MessageApiClient] Searching messages:', searchQuery);
      
      const queryParams = new URLSearchParams();
      queryParams.append('query', searchQuery);
      if (params?.conversationId) queryParams.append('conversationId', params.conversationId);
      if (params?.userId) queryParams.append('userId', params.userId);
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      
      const response = await this.get(`/messages/search?${queryParams.toString()}`);

      if (this.isSuccessResponse(response)) {
        return {
          success: true,
          messages: (response.messages || []).map((msg: any) => this.transformMessage(msg)),
          total: response.total || 0,
          hasMore: response.hasMore || false
        };
      }
      
      throw new Error(response?.message || 'Search failed');
    } catch (error: any) {
      this.safeLogError('Error searching messages', error);
      return {
        success: false,
        messages: [],
        total: 0,
        hasMore: false
      };
    }
  }

  /**
   * Add reaction to a message
   */
  async addReaction(messageId: string, emoji: string): Promise<void> {
    try {
      console.log('😀 [MessageApiClient] Adding reaction to message:', { messageId, emoji });
      
      await this.post(`/messages/${messageId}/reactions`, { emoji });
      
      console.log('✅ [MessageApiClient] Reaction added');
    } catch (error: any) {
      this.safeLogError('Error adding reaction', error);
      throw error;
    }
  }

  /**
   * Remove reaction from a message
   */
  async removeReaction(messageId: string, emoji: string): Promise<void> {
    try {
      console.log('❌ [MessageApiClient] Removing reaction from message:', { messageId, emoji });
      
      await this.delete(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
      
      console.log('✅ [MessageApiClient] Reaction removed');
    } catch (error: any) {
      this.safeLogError('Error removing reaction', error);
      throw error;
    }
  }

  /**
   * Report a message
   */
  async reportMessage(
    messageId: string,
    reason: string,
    details?: string
  ): Promise<void> {
    try {
      console.log('🚨 [MessageApiClient] Reporting message:', messageId);
      
      await this.post('/messages/report', {
        messageId,
        reason,
        details
      });
      
      console.log('✅ [MessageApiClient] Message reported');
    } catch (error: any) {
      this.safeLogError('Error reporting message', error);
      throw error;
    }
  }

  /**
   * Send typing indicator
   */
  async sendTypingIndicator(params: {
    conversationId: string;
    receiverId: string;
    isTyping: boolean;
  }): Promise<void> {
    try {
      await this.post('/messages/typing', params);
    } catch (error: any) {
      this.safeLogError('Error sending typing indicator', error);
      // Don't throw for typing indicators as they're not critical
    }
  }

  /**
   * Get message statistics for a conversation
   */
  async getMessageStats(conversationId: string): Promise<{
    totalMessages: number;
    unreadCount: number;
    lastMessageAt?: string;
    messageTypes: Record<string, number>;
  }> {
    try {
      const response = await this.get(`/messages/conversation/${conversationId}/stats`);
      
      if (this.isSuccessResponse(response)) {
        return response.stats;
      }
      
      throw new Error('Failed to get message stats');
    } catch (error: any) {
      this.safeLogError('Error getting message stats', error);
      return {
        totalMessages: 0,
        unreadCount: 0,
        messageTypes: {}
      };
    }
  }

  /**
   * Get messages with filters
   */
  async getMessagesWithFilters(
    conversationId: string,
    filters: {
      messageType?: MessageType;
      fromDate?: string;
      toDate?: string;
      senderId?: string;
      hasAttachments?: boolean;
      page?: number;
      limit?: number;
    }
  ): Promise<{
    success: boolean;
    messages: Message[];
    hasMore: boolean;
    total: number;
  }> {
    try {
      const queryParams = new URLSearchParams();
      if (filters.messageType) queryParams.append('type', filters.messageType);
      if (filters.fromDate) queryParams.append('fromDate', filters.fromDate);
      if (filters.toDate) queryParams.append('toDate', filters.toDate);
      if (filters.senderId) queryParams.append('senderId', filters.senderId);
      if (filters.hasAttachments !== undefined) queryParams.append('hasAttachments', filters.hasAttachments.toString());
      if (filters.page) queryParams.append('page', filters.page.toString());
      if (filters.limit) queryParams.append('limit', filters.limit.toString());
      
      const response = await this.get(
        `/messages/conversation/${conversationId}/filtered?${queryParams.toString()}`
      );

      if (this.isSuccessResponse(response)) {
        return {
          success: true,
          messages: (response.messages || []).map((msg: any) => this.transformMessage(msg)),
          hasMore: response.hasMore || false,
          total: response.total || 0
        };
      }
      
      throw new Error('Failed to get filtered messages');
    } catch (error: any) {
      this.safeLogError('Error getting filtered messages', error);
      return {
        success: false,
        messages: [],
        hasMore: false,
        total: 0
      };
    }
  }

  // ========================================
  // TRANSFORMATION METHODS
  // ========================================

  /**
   * Transform message from API format to app format
   */
  private transformMessage(data: any): Message {
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
      isEdited: data.content?.edited || false,
      editedAt: data.content?.editedAt,
      mentions: data.content?.mentions || data.mentions,
      reactions: data.content?.reactions || data.reactions,
      deliveredAt: data.deliveredAt,
      readAt: data.readAt
    };
  }

  /**
   * Transform attachments
   */
  private transformAttachments(content: any): Attachment[] {
    const attachments: Attachment[] = [];
    
    // Handle direct attachments array
    if (content?.attachments?.length) {
      content.attachments.forEach((att: any) => {
        attachments.push({
          id: att.id || `file-${attachments.length}`,
          type: att.type || AttachmentType.FILE,
          url: att.url,
          name: att.name || 'file',
          size: att.size || 0,
          thumbnailUrl: att.thumbnailUrl,
          mimeType: att.mimeType,
          duration: att.duration,
          width: att.width,
          height: att.height
        });
      });
    }
    
    // Handle legacy image format
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
    
    // Handle legacy audio format
    if (content?.audio) {
      attachments.push({
        id: 'audio-0',
        type: AttachmentType.AUDIO,
        url: content.audio,
        name: 'audio',
        size: 0
      });
    }
    
    // Handle direct image/audio URLs
    if (content?.imageUrl) {
      attachments.push({
        id: 'image-0',
        type: AttachmentType.IMAGE,
        url: content.imageUrl,
        name: 'image',
        size: 0
      });
    }
    
    if (content?.audioUrl) {
      attachments.push({
        id: 'audio-0',
        type: AttachmentType.AUDIO,
        url: content.audioUrl,
        name: 'audio',
        size: 0
      });
    }
    
    return attachments;
  }
}