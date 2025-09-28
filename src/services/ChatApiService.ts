import { chatClient, client } from '../apiManager/Client';
import { 
  Message, 
  ChatConversation, 
  Attachment, 
  AttachmentType,
  ServerConversation,
  ConversationParticipant,
  ConversationMetadata,
  ConversationSettings,
  MessageType,
  MessageStatus,
  UserRegistrationData,
  ConversationCreationResponse
} from '../types/chat';

class ChatApiService {
  private token: string | null = null;
  private baseUrl = '/api/v1';

  setToken(token: string): void {
    this.token = token;
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  //  Safe error logging helper
  private safeLogError(context: string, error: any, additionalData?: any): void {
    console.error(`❌ [ChatApiService] ${context}:`, {
      message: error?.message || 'Unknown error',
      name: error?.name || 'Error',
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      data: error?.response?.data,
      url: error?.config?.url,
      method: error?.config?.method,
      ...additionalData
    });
  }

  /**
   * Check if a user exists in the chat server
   */
  async checkUserExists(userId: string): Promise<{
    success: boolean;
    user?: {
      id: string;
      externalId: string;
      name: string;
      email: string;
      phone: string;
      avatar: string;
      role: 'customer' | 'ust' | 'admin';
      isOnline: boolean;
      lastSeen: string;
      createdAt: string;
      updatedAt: string;
    };
    error?: {
      code: string;
      message: string;
      statusCode: number;
    };
  }> {
    try {
      console.log('🔍 [ChatApiService] Checking user existence:', userId);
      
      const response = await chatClient(this.token).get(`/users/${userId}`);
      
      console.log(' [ChatApiService] User check response:', {
        status: response.status,
        success: response.data?.success,
        hasUser: !!response.data?.user
      });
      
      return response.data;
      
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log('ℹ️ [ChatApiService] User not found (404):', userId);
        return {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            statusCode: 404
          }
        };
      }
      
      this.safeLogError('Error checking user', error);
      throw error;
    }
  }

  /**
   * Register a new user with the chat server
   */
  async registerUser(userData: UserRegistrationData): Promise<{
    success: boolean;
    user?: any;
    error?: {
      code: string;
      message: string;
    };
  }> {
    try {
      console.log('📤 [ChatApiService] Registering user with chat server:', {
        id: userData.id,
        externalId: userData.externalId,
        name: userData.name,
        role: userData.role
      });

      const response = await chatClient(this.token).post('/auth/register-user', userData);

      console.log(' [ChatApiService] User registration response:', {
        status: response.status,
        success: response.data?.success,
        userId: response.data?.user?.id
      });

      return response.data;

    } catch (error: any) {
      this.safeLogError('User registration error', error);

      if (error.response?.data) {
        return error.response.data;
      }

      return {
        success: false,
        error: {
          code: 'REGISTRATION_ERROR',
          message: error.message || 'Failed to register user'
        }
      };
    }
  }

  /**
   * Get conversation by ID
   */
  async getConversationById(conversationId: string): Promise<{
    success: boolean;
    conversation?: ServerConversation;
    error?: any;
  }> {
    try {
      console.log('🔍 [ChatApiService] Getting conversation by ID:', conversationId);
      
      const response = await chatClient(this.token).get(`/conversations/${conversationId}`);
      
      if (response.data?.success) {
        return {
          success: true,
          conversation: this.transformServerConversation(response.data.conversation)
        };
      }
      
      throw new Error(response.data?.message || 'Failed to get conversation');
    } catch (error: any) {
      this.safeLogError('Error getting conversation', error);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Find job conversation
   */
  async findJobConversation(jobId: string, otherUserId: string): Promise<{
    success: boolean;
    conversation?: ServerConversation;
    error?: any;
  }> {
    try {
      console.log('🔍 [ChatApiService] Finding job conversation:', { jobId, otherUserId });
      
      const response = await chatClient(this.token).get(
        `/conversations/job/${jobId}/participant/${otherUserId}`
      );
      
      if (response.data?.success) {
        return {
          success: true,
          conversation: this.transformServerConversation(response.data.conversation)
        };
      }
      
      return { success: false };
    } catch (error: any) {
      if (error.response?.status === 404) {
        return { success: false };
      }
      this.safeLogError('Error finding job conversation', error);
      throw error;
    }
  }

  /**
   * Create conversation
   */

  //  REPLACE the createConversation method in your ChatApiService.ts (around line 148-183)

/**
 * Create conversation
 */
async createConversation(payload: {
  participantIds: string[];  //  Correct field name
  type: string;
  status: string;
  jobId?: string;
  jobTitle?: string;
}) {
  try {
    console.log('📤 [ChatApiService] Sending payload:', {
      participantIds: payload.participantIds,  
      type: payload.type,
      status: payload.status,
      jobId: payload.jobId
    });

    //  FIX: Use chatClient(this.token) instead of this.apiClient
    const response = await chatClient(this.token).post('/conversations', payload);
    
    console.log(' [ChatApiService] Conversation created successfully:', response.data);
    return response.data;
    
  } catch (error: any) {
    console.error('❌ [ChatApiService] API Error in createConversation:', {
      message: error?.message || 'Unknown error',
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      data: error?.response?.data,
      url: error?.config?.url,
      method: error?.config?.method,
      params: payload
    });
    
    throw error;
  }
}

  /**
   * Get conversations with enhanced filtering
   */
  async getConversations(params?: {
    limit?: number;
    offset?: number;
    type?: 'job_chat' | 'direct_message';
    status?: 'active' | 'closed' | 'archived';
    isPinned?: boolean;
    isMuted?: boolean;
  }): Promise<{
    conversations: ServerConversation[];
    hasMore: boolean;
    total: number;
  }> {
    try {
      console.log('📋 [ChatApiService] Getting conversations:', params);
      
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.offset) queryParams.append('offset', params.offset.toString());
      if (params?.type) queryParams.append('type', params.type);
      if (params?.status) queryParams.append('status', params.status);
      if (params?.isPinned !== undefined) queryParams.append('isPinned', params.isPinned.toString());
      if (params?.isMuted !== undefined) queryParams.append('isMuted', params.isMuted.toString());
      
      const response = await chatClient(this.token).get(`/conversations?${queryParams.toString()}`);
      
      if (response.data?.success) {
        return {
          conversations: (response.data.conversations || []).map((conv: any) => 
            this.transformServerConversation(conv)
          ),
          hasMore: response.data.hasMore || false,
          total: response.data.total || 0
        };
      }
      
      throw new Error(response.data?.message || 'Failed to fetch conversations');
    } catch (error) {
      this.safeLogError('Error fetching conversations', error);
      throw error;
    }
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(conversationId: string, page: number = 1, limit: number = 50): Promise<{
    messages: Message[];
    hasMore: boolean;
    total: number;
  }> {
    try {
      console.log("🔍 [ChatApiService] Getting messages for conversation:", conversationId);
      
      const offset = (page - 1) * limit;
      const response = await chatClient(this.token).get(
        `/messages/conversation/${conversationId}?limit=${limit}&offset=${offset}`
      );

      if (response.data?.success) {
        return {
          messages: (response.data.messages || []).map((msg: any) => this.transformMessage(msg)),
          hasMore: response.data.hasMore || false,
          total: response.data.total || 0
        };
      }
      
      throw new Error(response.data?.message || 'Failed to fetch messages');
    } catch (error) {
      this.safeLogError('Error fetching messages', error);
      throw error;
    }
  }

  /**
   * Mark messages as read
   */
  async markAsRead(conversationId: string, messageIds?: string[]): Promise<void> {
    try {
      console.log(' [ChatApiService] Marking messages as read:', { conversationId, messageIds });
      
      await chatClient(this.token).post('/messages/read', {
        conversationId,
        messageIds
      });
      
      console.log(' [ChatApiService] Messages marked as read');
    } catch (error) {
      this.safeLogError('Error marking messages as read', error);
      throw error;
    }
  }

  /**
   * Upload file
   */
  async uploadFile(file: any, type: AttachmentType): Promise<Attachment> {
    try {
      console.log('📤 [ChatApiService] Uploading file:', { name: file.name, type });
      
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        type: file.type || this.getMimeType(type),
        name: file.name || `${type}-${Date.now()}.${this.getFileExtension(type)}`
      } as any);
      formData.append('type', type);

      const response = await chatClient(this.token).post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${this.token}`,
        },
      });

      if (response.data?.success) {
        const attachment: Attachment = {
          id: response.data.file.id,
          type,
          url: response.data.file.url,
          name: response.data.file.name || file.name,
          size: response.data.file.size || file.size
        };
        
        console.log(' [ChatApiService] File uploaded successfully');
        return attachment;
      }
      
      throw new Error('Upload failed');
    } catch (error) {
      this.safeLogError('Error uploading file', error);
      throw error;
    }
  }

  /**
   * Update conversation settings
   */
  async updateConversationSettings(
    conversationId: string,
    settings: Partial<ConversationSettings>
  ): Promise<void> {
    try {
      console.log('⚙️ [ChatApiService] Updating conversation settings:', { conversationId, settings });
      
      await chatClient(this.token).patch(`/conversations/${conversationId}/settings`, settings);
      
      console.log(' [ChatApiService] Conversation settings updated');
    } catch (error) {
      this.safeLogError('Error updating conversation settings', error);
      throw error;
    }
  }

  /**
   * Update conversation status
   */
  async updateConversationStatus(
    conversationId: string,
    status: 'active' | 'closed' | 'archived'
  ): Promise<void> {
    try {
      console.log('📝 [ChatApiService] Updating conversation status:', { conversationId, status });
      
      await chatClient(this.token).patch(`/conversations/${conversationId}/status`, { status });
      
      console.log(' [ChatApiService] Conversation status updated');
    } catch (error) {
      this.safeLogError('Error updating conversation status', error);
      throw error;
    }
  }

  /**
   * Delete conversation
   */
  async deleteConversation(conversationId: string): Promise<void> {
    try {
      console.log('🗑️ [ChatApiService] Deleting conversation:', conversationId);
      
      await chatClient(this.token).delete(`/conversations/${conversationId}`);
      
      console.log(' [ChatApiService] Conversation deleted');
    } catch (error) {
      this.safeLogError('Error deleting conversation', error);
      throw error;
    }
  }

  /**
   * Block user
   */
  async blockUser(userId: string): Promise<void> {
    try {
      console.log('🚫 [ChatApiService] Blocking user:', userId);
      
      await chatClient(this.token).post('/users/block', { userId });
      
      console.log(' [ChatApiService] User blocked');
    } catch (error) {
      this.safeLogError('Error blocking user', error);
      throw error;
    }
  }

  /**
   * Unblock user
   */
  async unblockUser(userId: string): Promise<void> {
    try {
      console.log(' [ChatApiService] Unblocking user:', userId);
      
      await chatClient(this.token).delete(`/users/block/${userId}`);
      
      console.log(' [ChatApiService] User unblocked');
    } catch (error) {
      this.safeLogError('Error unblocking user', error);
      throw error;
    }
  }

  /**
   * Check block status
   */
  async checkBlockStatus(userId: string): Promise<{ isBlocked: boolean }> {
    try {
      const response = await chatClient(this.token).get(`/users/block-status/${userId}`);
      
      return {
        isBlocked: response.data?.isBlocked || false
      };
    } catch (error) {
      this.safeLogError('Error checking block status', error);
      return { isBlocked: false };
    }
  }

  /**
   * Can initiate chat check
   */
  async canInitiateChat(jobId: string, ustaId: string): Promise<boolean> {
    try {
      const response = await chatClient(this.token).get(
        `/conversations/can-initiate/${jobId}/${ustaId}`
      );
      
      return response.data?.canInitiate || false;
    } catch (error) {
      this.safeLogError('Error checking chat initiation', error);
      return false;
    }
  }

  // ========================================
  // TRANSFORMATION METHODS
  // ========================================

  /**
   * Transform server conversation format to app format
   */
  private transformServerConversation(data: any): ServerConversation {
    return {
      id: data.id,
      type: data.type || 'job_chat',
      participants: (data.participants || []).map((p: any) => ({
        userId: p.userId || p.id,
        role: p.role || 'customer',
        joinedAt: p.joinedAt || data.createdAt,
        isActive: p.isActive !== false,
        name: p.name || 'Unknown',
        avatar: p.avatar || '',
        isOnline: p.isOnline || false,
        lastSeen: p.lastSeen
      })),
      metadata: {
        jobId: data.jobId || data.metadata?.jobId,
        jobTitle: data.jobTitle || data.metadata?.jobTitle,
        status: data.status || data.metadata?.status || 'active',
        createdBy: data.createdBy || data.metadata?.createdBy || '',
        closedAt: data.closedAt || data.metadata?.closedAt
      },
      settings: {
        isMuted: data.settings?.isMuted || false,
        isPinned: data.settings?.isPinned || false,
        notificationEnabled: data.settings?.notificationEnabled !== false
      },
      lastMessage: data.lastMessage ? this.transformMessage(data.lastMessage) : undefined,
      unreadCount: data.unreadCount || 0,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt || data.lastMessageAt
    };
  }

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
      jobId: data.jobId
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
          size: att.size || 0
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

  /**
   * Transform conversation from API format to legacy app format (for backward compatibility)
   */
  private transformConversation(data: any, currentUserId: string): ChatConversation {
    // Find the other participant
    const otherParticipant = data.participants?.find((p: any) => 
      (p.userId || p.id) !== currentUserId
    ) || {};
    
    return {
      id: data.id,
      jobId: data.jobId || data.metadata?.jobId,
      jobTitle: data.jobTitle || data.metadata?.jobTitle || '',
      otherUser: {
        id: otherParticipant.userId || otherParticipant.id || '',
        name: otherParticipant.name || 'Unknown',
        avatar: otherParticipant.avatar || '',
        isOnline: otherParticipant.isOnline || false,
        role: otherParticipant.role || 'customer'
      },
      lastMessage: data.lastMessage ? this.transformMessage(data.lastMessage) : undefined,
      unreadCount: data.unreadCount || 0,
      isBlocked: false, // This would need to be determined from user block status
      updatedAt: data.lastMessageAt || data.updatedAt,
      participants: data.participants || [],
      createdAt: data.createdAt
    };
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  private getMimeType(type: AttachmentType): string {
    switch (type) {
      case AttachmentType.IMAGE: return 'image/jpeg';
      case AttachmentType.AUDIO: return 'audio/mp4';
      case AttachmentType.FILE: return 'application/octet-stream';
      default: return 'application/octet-stream';
    }
  }

  private getFileExtension(type: AttachmentType): string {
    switch (type) {
      case AttachmentType.IMAGE: return 'jpg';
      case AttachmentType.AUDIO: return 'm4a';
      case AttachmentType.FILE: return 'bin';
      default: return 'bin';
    }
  }
}

export const chatApiService = new ChatApiService();