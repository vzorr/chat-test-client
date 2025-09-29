// src/services/api/clients/ConversationApiClient.ts
import { BaseApiClient, BaseApiClientConfig } from '../base/BaseApiClient';
import { 
  ServerConversation,
  ConversationSettings,
  ConversationType,
  ConversationStatus,
  ConversationParticipant,
  ConversationMetadata,
  ConversationCreationResponse,
  UserRole,
  Message
} from '../../../types/chat';
import { AppConfig } from '../../../config/AppConfig';

/**
 * Conversation API Client - handles conversation operations only
 */
export class ConversationApiClient extends BaseApiClient {
  
  constructor(config?: BaseApiClientConfig) {
    super(config || {
      baseUrl: AppConfig.chat.baseUrl,
      clientType: 'chat',
      timeout: AppConfig.chat.timeout
    });
  }

  /**
   * Create a new conversation
   */
  async createConversation(payload: {
    participantIds: string[];
    type: string;
    status: string;
    jobId?: string;
    jobTitle?: string;
  }): Promise<ConversationCreationResponse> {
    try {
      console.log('📤 [ConversationApiClient] Creating conversation:', {
        participantIds: payload.participantIds,
        type: payload.type,
        status: payload.status,
        jobId: payload.jobId
      });

      const response = await this.post<any>('/conversations', payload);
      
      console.log('✅ [ConversationApiClient] Conversation created successfully');
      
      return {
        success: response.success || true,
        existing: response.existing || false,
        conversation: this.transformServerConversation(response.conversation)
      };
      
    } catch (error: any) {
      this.safeLogError('API Error in createConversation', error, { params: payload });
      throw error;
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
      console.log('🔍 [ConversationApiClient] Getting conversation by ID:', conversationId);
      
      const response = await this.get<any>(`/conversations/${conversationId}`);
      
      if (this.isSuccessResponse(response)) {
        return {
          success: true,
          conversation: this.transformServerConversation(response.conversation)
        };
      }
      
      throw new Error(response?.message || 'Failed to get conversation');
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
      console.log('🔍 [ConversationApiClient] Finding job conversation:', { jobId, otherUserId });
      
      const response = await this.get<any>(`/conversations/job/${jobId}/participant/${otherUserId}`);
      
      if (this.isSuccessResponse(response)) {
        return {
          success: true,
          conversation: this.transformServerConversation(response.conversation)
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
    success: boolean;
    conversations: ServerConversation[];
    hasMore: boolean;
    total: number;
  }> {
    try {
      console.log('📋 [ConversationApiClient] Getting conversations:', params);
      
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.offset) queryParams.append('offset', params.offset.toString());
      if (params?.type) queryParams.append('type', params.type);
      if (params?.status) queryParams.append('status', params.status);
      if (params?.isPinned !== undefined) queryParams.append('isPinned', params.isPinned.toString());
      if (params?.isMuted !== undefined) queryParams.append('isMuted', params.isMuted.toString());
      
      const response = await this.get<any>(`/conversations?${queryParams.toString()}`);
      
      if (this.isSuccessResponse(response)) {
        return {
          success: true,
          conversations: (response.conversations || []).map((conv: any) => 
            this.transformServerConversation(conv)
          ),
          hasMore: response.hasMore || false,
          total: response.total || 0
        };
      }
      
      throw new Error(response?.message || 'Failed to fetch conversations');
    } catch (error: any) {
      this.safeLogError('Error fetching conversations', error);
      throw error;
    }
  }

  /**
   * Check if user can initiate chat
   */
  async canInitiateChat(jobId: string, ustaId: string): Promise<boolean> {
    try {
      const response = await this.get<any>(`/conversations/can-initiate/${jobId}/${ustaId}`);
      
      return response?.canInitiate || false;
    } catch (error: any) {
      this.safeLogError('Error checking chat initiation', error);
      return false;
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
      console.log('⚙️ [ConversationApiClient] Updating conversation settings:', { conversationId, settings });
      
      await this.patch(`/conversations/${conversationId}/settings`, settings);
      
      console.log('✅ [ConversationApiClient] Conversation settings updated');
    } catch (error: any) {
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
      console.log('📝 [ConversationApiClient] Updating conversation status:', { conversationId, status });
      
      await this.patch(`/conversations/${conversationId}/status`, { status });
      
      console.log('✅ [ConversationApiClient] Conversation status updated');
    } catch (error: any) {
      this.safeLogError('Error updating conversation status', error);
      throw error;
    }
  }

  /**
   * Delete conversation
   */
  async deleteConversation(conversationId: string): Promise<void> {
    try {
      console.log('🗑️ [ConversationApiClient] Deleting conversation:', conversationId);
      
      await this.delete(`/conversations/${conversationId}`);
      
      console.log('✅ [ConversationApiClient] Conversation deleted');
    } catch (error: any) {
      this.safeLogError('Error deleting conversation', error);
      throw error;
    }
  }

  /**
   * Pin conversation
   */
  async pinConversation(conversationId: string): Promise<void> {
    return this.updateConversationSettings(conversationId, { isPinned: true });
  }

  /**
   * Unpin conversation
   */
  async unpinConversation(conversationId: string): Promise<void> {
    return this.updateConversationSettings(conversationId, { isPinned: false });
  }

  /**
   * Archive conversation
   */
  async archiveConversation(conversationId: string): Promise<void> {
    return this.updateConversationStatus(conversationId, 'archived');
  }

  /**
   * Search conversations
   */
  async searchConversations(
    searchQuery: string,
    params?: {
      limit?: number;
      offset?: number;
      type?: ConversationType;
      includeArchived?: boolean;
    }
  ): Promise<{
    success: boolean;
    conversations: ServerConversation[];
    total: number;
  }> {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('query', searchQuery);
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.offset) queryParams.append('offset', params.offset.toString());
      if (params?.type) queryParams.append('type', params.type);
      if (params?.includeArchived) queryParams.append('includeArchived', 'true');
      
      const response = await this.get<any>(`/conversations/search?${queryParams.toString()}`);
      
      if (this.isSuccessResponse(response)) {
        return {
          success: true,
          conversations: (response.conversations || []).map((conv: any) => 
            this.transformServerConversation(conv)
          ),
          total: response.total || 0
        };
      }
      
      throw new Error(response?.message || 'Search failed');
    } catch (error: any) {
      this.safeLogError('Error searching conversations', error);
      return {
        success: false,
        conversations: [],
        total: 0
      };
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
        role: p.role || UserRole.CUSTOMER,
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
   * Transform message from API format to app format (basic transformation)
   */
  private transformMessage(data: any): any {
    return {
      id: data.id,
      clientTempId: data.clientTempId,
      senderId: data.senderId,
      receiverId: data.receiverId,
      content: data.content?.text || data.content || '',
      timestamp: data.createdAt || data.timestamp,
      type: data.type || 'text',
      status: data.status || 'sent',
      conversationId: data.conversationId,
      jobId: data.jobId
    };
  }
}