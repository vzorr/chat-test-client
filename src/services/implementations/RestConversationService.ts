// src/services/implementations/rest/RestConversationService.ts
import { BaseConversationService } from './BaseConversationService';
import { IConversationService, ICacheService } from '../interfaces';
import {
  ServerConversation,
  ConversationType,
  ConversationStatus,
  ConversationSettings,
  ValidationException,
  NetworkException,
  AuthException
} from '../../types/chat';

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
  }) {
    // Validate using base class method
    this.validateConversationCreation(params);
    
    try {
      // Check cache first for existing conversation
      if (params.type === ConversationType.JOB_CHAT && params.jobId) {
        const otherUserId = params.participantIds.find(id => id !== this.userId);
        if (otherUserId) {
          const cached = this.findJobConversationInCache(params.jobId, otherUserId);
          if (cached) {
            console.log('✅ Found existing conversation in cache');
            return {
              success: true,
              existing: true,
              conversation: cached
            };
          }
        }
      }
      
      // Build payload matching server expectations
      const payload = {
        participantIds: [...new Set(params.participantIds)],
        type: params.type || 'job_chat',
        status: params.status || 'active',
        ...(params.jobId && { jobId: params.jobId }),
        ...(params.jobTitle && { jobTitle: params.jobTitle })
      };
      
      console.log('📤 Creating conversation:', payload);
      
      const response = await this.apiClient.post('/conversations', payload);
      
      // Handle the raw response data
      // The server returns the conversation directly, not wrapped in { success: true, conversation: ... }
      let conversationData = response;
      
      // Handle different possible response structures
      if (response.data) {
        conversationData = response.data;
      }
      if (response.conversation) {
        conversationData = response.conversation;
      }
      
      // If we got here with a valid response, transform it
      if (conversationData && (conversationData.id || conversationData.participantIds)) {
        const conversation = this.transformServerConversation(conversationData);
        
        // Cache the new conversation
        this.cacheConversation(conversation);
        
        console.log('✅ Conversation created successfully:', conversation.id);
        
        return {
          success: true,
          existing: conversationData.existing || false,
          conversation
        };
      }
      
      // If we couldn't parse the response, but got a 201, create a minimal conversation
      if (response.status === 201 || response.status === 200) {
        console.warn('⚠️ Received success status but unexpected response structure:', response);
        
        // Create a minimal conversation object
        const fallbackConversation: ServerConversation = {
          id: response.id || `conv-${Date.now()}`,
          type: params.type,
          participants: params.participantIds.map(id => ({
            userId: id,
            role: 'customer' as any,
            joinedAt: new Date().toISOString(),
            isActive: true,
            name: id === this.userId ? 'You' : 'Other User',
            avatar: '',
            isOnline: false
          })),
          metadata: {
            jobId: params.jobId,
            jobTitle: params.jobTitle,
            status: params.status || ConversationStatus.ACTIVE,
            createdBy: this.userId
          },
          settings: {
            isMuted: false,
            isPinned: false,
            notificationEnabled: true
          },
          unreadCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        this.cacheConversation(fallbackConversation);
        
        return {
          success: true,
          existing: false,
          conversation: fallbackConversation
        };
      }
      
      throw new NetworkException('Failed to create conversation - invalid response');
      
    } catch (error: any) {
      // Don't treat 201 as an error
      if (error?.response?.status === 201) {
        console.log('✅ Conversation created (201 status)');
        
        // Extract conversation ID from response if possible
        const responseData = error.response?.data || {};
        
        // Create a basic conversation object
        const conversation: ServerConversation = {
          id: responseData.id || responseData.conversationId || `conv-${Date.now()}`,
          type: params.type,
          participants: params.participantIds.map(id => ({
            userId: id,
            role: 'customer' as any,
            joinedAt: new Date().toISOString(),
            isActive: true,
            name: id === this.userId ? 'You' : 'Other User',
            avatar: '',
            isOnline: false
          })),
          metadata: {
            jobId: params.jobId,
            jobTitle: params.jobTitle,
            status: params.status || ConversationStatus.ACTIVE,
            createdBy: this.userId
          },
          settings: {
            isMuted: false,
            isPinned: false,
            notificationEnabled: true
          },
          unreadCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        this.cacheConversation(conversation);
        
        return {
          success: true,
          existing: false,
          conversation
        };
      }
      
      // If it's already our custom error, re-throw it
      if (error instanceof NetworkException || error instanceof ValidationException) {
        throw error;
      }
      
      this.handleApiError(error, 'create conversation');
      throw error;
    }
  }

  async getConversation(id: string) {
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
      
      // Handle response - check multiple possible structures
      let conversationData = response;
      if (response.data) {
        conversationData = response.data;
      }
      if (response.conversation) {
        conversationData = response.conversation;
      }
      
      if (conversationData && conversationData.id) {
        const conversation = this.transformServerConversation(conversationData);
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
  }) {
    try {
      // Build query using base class method
      const queryParams = this.buildQueryParams(params);
      
      const response = await this.apiClient.get(`/conversations?${queryParams.toString()}`);
      
      // Handle different response structures
      let conversations: ServerConversation[] = [];
      let responseData = response;
      
      // Unwrap if needed
      if (response.data) {
        responseData = response.data;
      }
      
      if (Array.isArray(responseData)) {
        // Direct array response
        conversations = responseData.map((conv: any) => this.transformServerConversation(conv));
      } else if (responseData && responseData.conversations) {
        // Wrapped response
        conversations = (responseData.conversations || []).map((conv: any) => 
          this.transformServerConversation(conv)
        );
      }
      
      // Cache all conversations
      this.cacheConversations(conversations);
      
      // Sort by activity using base class method
      const sorted = this.sortConversationsByActivity(conversations);
      
      return {
        conversations: sorted,
        hasMore: responseData?.hasMore || false,
        total: responseData?.total || conversations.length
      };
      
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
  ) {
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
  ) {
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
      
      // Handle response
      let conversationData = response;
      if (response.data) {
        conversationData = response.data;
      }
      if (response.conversation) {
        conversationData = response.conversation;
      }
      
      if (conversationData && conversationData.id) {
        const conversation = this.transformServerConversation(conversationData);
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
  ) {
    if (!conversationId?.trim()) {
      throw new ValidationException('Conversation ID is required');
    }
    
    try {
      await this.apiClient.patch(`/conversations/${conversationId}/settings`, settings);
      
      // Update cache - merge with existing settings
      const conversation = this.getCachedConversations().find(c => c.id === conversationId);
      if (conversation) {
        // Merge the partial settings with existing settings to maintain all required properties
        const updatedSettings: ConversationSettings = {
          ...conversation.settings, // Keep existing settings
          ...settings // Override with new values
        };
        
        // Update the conversation with merged settings
        this.updateCachedConversation(conversationId, { 
          settings: updatedSettings 
        });
      }
      
      console.log('✓ Conversation settings updated');
      
    } catch (error: any) {
      this.handleApiError(error, 'update settings');
      throw error;
    }
  }

  async updateConversationStatus(
    conversationId: string,
    status: ConversationStatus
  ) {
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

  async pinConversation(conversationId: string) {
    await this.updateConversationSettings(conversationId, { isPinned: true });
  }

  async unpinConversation(conversationId: string) {
    await this.updateConversationSettings(conversationId, { isPinned: false });
  }

  async archiveConversation(conversationId: string) {
    await this.updateConversationStatus(conversationId, ConversationStatus.ARCHIVED);
  }

  async deleteConversation(conversationId: string) {
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
  private handleApiError(error: any, operation: string) {
    console.error(`Failed to ${operation}:`, error);
    
    const status = error?.response?.status;
    const errorData = error?.response?.data;
    
    // Don't throw errors for successful status codes
    if (status >= 200 && status < 300) {
      console.log(`Operation ${operation} succeeded with status ${status}`);
      return;
    }
    
    if (status === 400) {
      const errorMessage = errorData?.errorMessage || errorData?.message || 'Invalid request';
      throw new ValidationException(errorMessage);
    } else if (status === 401) {
      throw new AuthException('Authentication required');
    } else if (status === 403) {
      throw new ValidationException('Permission denied');
    } else if (status === 404) {
      // Don't throw for 404 in findJobConversation - it's expected
      if (operation !== 'find job conversation') {
        throw new ValidationException('Resource not found');
      }
    } else if (status === 409) {
      throw new ValidationException('Resource already exists');
    }
  }
}