// src/services/implementations/rest/RestConversationService.ts
import { BaseConversationService } from '../base/BaseConversationService';
import { IConversationService, ICacheService } from '../../interfaces';
import {
  ServerConversation,
  ConversationType,
  ConversationStatus,
  ConversationSettings,
  ValidationException,
  NetworkException,
  AuthException
} from '../../../types/chat';

export class RestConversationService extends BaseConversationService implements IConversationService {
  constructor(
    private apiClient: any,
    cacheService: ICacheService,
    userId: string = ''
  ) {
    super(cacheService, userId);
  }

  async createConversation(params: {
    participantIds: string[];
    type: ConversationType;
    jobId?: string;
    jobTitle?: string;
    status?: ConversationStatus;
  }): Promise<{
    success: boolean;
    existing: boolean;
    conversation: ServerConversation;
  }> {
    // Validate using base class method
    this.validateConversationCreation(params);
    
    try {
      // Check cache first for existing conversation
      if (params.type === ConversationType.JOB_CHAT && params.jobId) {
        const otherUserId = params.participantIds.find(id => id !== this.userId);
        if (otherUserId) {
          const cached = this.findJobConversationInCache(params.jobId, otherUserId);
          if (cached) {
            return {
              success: true,
              existing: true,
              conversation: cached
            };
          }
        }
      }
      
      // Build clean payload
      const payload = {
        participantIds: [...new Set(params.participantIds)],
        type: params.type,
        status: params.status || ConversationStatus.ACTIVE,
        ...(params.jobId && { jobId: params.jobId }),
        ...(params.jobTitle && { jobTitle: params.jobTitle })
      };
      
      console.log('📤 Creating conversation:', payload);
      
      const response = await this.apiClient.post('/conversations', payload);
      
      if (response.data?.success) {
        const conversation = this.transformServerConversation(response.data.conversation);
        
        // Cache the new conversation
        this.cacheConversation(conversation);
        
        return {
          success: true,
          existing: response.data.existing || false,
          conversation
        };
      }
      
      throw new NetworkException('Failed to create conversation');
      
    } catch (error: any) {
      this.handleApiError(error, 'create conversation');
      throw error;
    }
  }

  async getConversation(id: string): Promise<ServerConversation> {
    if (!id?.trim()) {
      throw new ValidationException('Conversation ID is required');
    }
    
    // Check cache first
    const cached = this.getCachedConversations().find(c => c.id === id);
    if (cached) {
      return cached;
    }
    
    try {
      const response = await this.apiClient.get(`/conversations/${id}`);
      
      if (response.data?.success) {
        const conversation = this.transformServerConversation(response.data.conversation);
        this.cacheConversation(conversation);
        return conversation;
      }
      
      throw new NetworkException('Conversation not found');
      
    } catch (error: any) {
      this.handleApiError(error, 'get conversation');
      throw error;
    }
  }

  async getConversations(params?: {
    limit?: number;
    offset?: number;
    type?: ConversationType;
    status?: ConversationStatus;
    isPinned?: boolean;
    isMuted?: boolean;
  }): Promise<{
    conversations: ServerConversation[];
    hasMore: boolean;
    total: number;
  }> {
    try {
      // Build query using base class method
      const queryParams = this.buildQueryParams(params);
      
      const response = await this.apiClient.get(`/conversations?${queryParams.toString()}`);
      
      if (response.data?.success) {
        const conversations = (response.data.conversations || []).map((conv: any) => 
          this.transformServerConversation(conv)
        );
        
        // Cache all conversations
        this.cacheConversations(conversations);
        
        // Sort by activity using base class method
        const sorted = this.sortConversationsByActivity(conversations);
        
        return {
          conversations: sorted,
          hasMore: response.data.hasMore || false,
          total: response.data.total || conversations.length
        };
      }
      
      throw new NetworkException('Failed to fetch conversations');
      
    } catch (error: any) {
      console.warn('Failed to fetch from API, using cache:', error);
      
      // Return cached conversations on error
      const cached = this.getCachedConversations();
      const filtered = this.filterConversations(cached, params || {});
      const sorted = this.sortConversationsByActivity(filtered);
      
      return {
        conversations: sorted,
        hasMore: false,
        total: sorted.length
      };
    }
  }

  async searchConversations(
    searchTerm: string,
    options?: {
      limit?: number;
      offset?: number;
      type?: ConversationType;
      includeArchived?: boolean;
      searchFields?: ('jobTitle' | 'userName' | 'messageContent')[];
    }
  ): Promise<ServerConversation[]> {
    if (!searchTerm?.trim()) {
      throw new ValidationException('Search term is required');
    }
    
    const trimmedTerm = searchTerm.trim().toLowerCase();
    
    try {
      // Try server search if endpoint exists
      // For now, implement client-side search as fallback
      
      const allConversations = await this.getConversations({
        limit: options?.limit || 200,
        offset: options?.offset || 0,
        type: options?.type
      });
      
      const searchFields = options?.searchFields || ['jobTitle', 'userName', 'messageContent'];
      
      // Filter using search term
      const filtered = allConversations.conversations.filter(conversation => {
        if (searchFields.includes('jobTitle')) {
          const jobTitle = conversation.metadata?.jobTitle?.toLowerCase() || '';
          if (jobTitle.includes(trimmedTerm)) return true;
        }
        
        if (searchFields.includes('userName')) {
          const hasMatchingUser = conversation.participants.some(participant => {
            const userName = participant.name?.toLowerCase() || '';
            return userName.includes(trimmedTerm) && participant.userId !== this.userId;
          });
          if (hasMatchingUser) return true;
        }
        
        if (searchFields.includes('messageContent')) {
          const lastMessageContent = conversation.lastMessage?.content?.toLowerCase() || '';
          if (lastMessageContent.includes(trimmedTerm)) return true;
        }
        
        return false;
      });
      
      // Apply pagination to results
      const start = options?.offset || 0;
      const end = start + (options?.limit || 50);
      
      return filtered.slice(start, end);
      
    } catch (error: any) {
      console.warn('Search failed, using cache:', error);
      
      // Fallback to cached search
      const cached = this.getCachedConversations();
      return cached.filter(conv => {
        const jobTitle = conv.metadata?.jobTitle?.toLowerCase() || '';
        const otherParticipant = this.getOtherParticipant(conv);
        const userName = otherParticipant?.name?.toLowerCase() || '';
        const lastMessage = conv.lastMessage?.content?.toLowerCase() || '';
        
        return jobTitle.includes(trimmedTerm) ||
               userName.includes(trimmedTerm) ||
               lastMessage.includes(trimmedTerm);
      });
    }
  }

  async findJobConversation(
    jobId: string,
    otherUserId: string
  ): Promise<ServerConversation | null> {
    if (!jobId?.trim()) {
      throw new ValidationException('Job ID is required');
    }
    if (!otherUserId?.trim()) {
      throw new ValidationException('Other user ID is required');
    }
    
    // Check cache first using base class method
    const cached = this.findJobConversationInCache(jobId, otherUserId);
    if (cached) {
      return cached;
    }
    
    try {
      // Try API endpoint for job conversations
      const response = await this.apiClient.get(
        `/conversations/job/${jobId}/participant/${otherUserId}`
      );
      
      if (response.data?.success && response.data.conversation) {
        const conversation = this.transformServerConversation(response.data.conversation);
        this.cacheConversation(conversation);
        return conversation;
      }
      
      return null;
      
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return null;
      }
      
      console.warn('API search failed, checking cache:', error);
      return this.findJobConversationInCache(jobId, otherUserId);
    }
  }

  async updateConversationSettings(
    conversationId: string,
    settings: Partial<ConversationSettings>
  ): Promise<void> {
    if (!conversationId?.trim()) {
      throw new ValidationException('Conversation ID is required');
    }
    
    try {
      await this.apiClient.patch(`/conversations/${conversationId}/settings`, settings);
      
      // Update cache
      this.updateCachedConversation(conversationId, { settings });
      
      console.log('✓ Conversation settings updated');
      
    } catch (error: any) {
      this.handleApiError(error, 'update settings');
      throw error;
    }
  }

  async updateConversationStatus(
    conversationId: string,
    status: ConversationStatus
  ): Promise<void> {
    if (!conversationId?.trim()) {
      throw new ValidationException('Conversation ID is required');
    }
    
    try {
      await this.apiClient.patch(`/conversations/${conversationId}/status`, { status });
      
      // Update cache
      const conversation = this.getCachedConversations().find(c => c.id === conversationId);
      if (conversation) {
        conversation.metadata.status = status;
        this.cacheConversation(conversation);
      }
      
      console.log('✓ Conversation status updated');
      
    } catch (error: any) {
      this.handleApiError(error, 'update status');
      throw error;
    }
  }

  async pinConversation(conversationId: string): Promise<void> {
    await this.updateConversationSettings(conversationId, { isPinned: true });
  }

  async unpinConversation(conversationId: string): Promise<void> {
    await this.updateConversationSettings(conversationId, { isPinned: false });
  }

  async archiveConversation(conversationId: string): Promise<void> {
    await this.updateConversationStatus(conversationId, ConversationStatus.ARCHIVED);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    if (!conversationId?.trim()) {
      throw new ValidationException('Conversation ID is required');
    }
    
    try {
      await this.apiClient.delete(`/conversations/${conversationId}`);
      
      // Remove from cache
      const cached = this.getCachedConversations();
      const filtered = cached.filter(c => c.id !== conversationId);
      
      // Clear and re-cache
      this.cacheService.clearConversationCache();
      this.cacheConversations(filtered);
      
      console.log('✓ Conversation deleted');
      
    } catch (error: any) {
      this.handleApiError(error, 'delete conversation');
      throw error;
    }
  }

  // Private helper method for error handling
  private handleApiError(error: any, operation: string): void {
    console.error(`Failed to ${operation}:`, error);
    
    const status = error?.response?.status;
    const errorData = error?.response?.data;
    
    if (status === 400) {
      const errorMessage = errorData?.errorMessage || errorData?.message || 'Invalid request';
      throw new ValidationException(errorMessage);
    } else if (status === 401) {
      throw new AuthException('Authentication required');
    } else if (status === 403) {
      throw new ValidationException('Permission denied');
    } else if (status === 404) {
      throw new ValidationException('Resource not found');
    } else if (status === 409) {
      throw new ValidationException('Resource already exists');
    }
  }
}