// src/services/implementations/base/BaseConversationService.ts
import {
  ServerConversation,
  ConversationParticipant,
  ConversationMetadata,
  ConversationSettings,
  ConversationType,
  ConversationStatus,
  UserRole,
  Message
} from '../../../types/chat';
import { ICacheService } from '../../interfaces';
import { ValidationException } from '../../../types/chat';

/**
 * Base class with shared conversation logic - no duplication
 */
export abstract class BaseConversationService {
  constructor(
    protected cacheService: ICacheService,
    protected userId: string = ''
  ) {}

  /**
   * Transform server conversation to app format - shared by all
   */
  protected transformServerConversation(data: any): ServerConversation {
    return {
      id: data.id,
      type: data.type || ConversationType.JOB_CHAT,
      participants: this.transformParticipants(data.participants || [], data),
      metadata: this.transformMetadata(data),
      settings: this.transformSettings(data.settings || {}),
      lastMessage: data.lastMessage ? this.transformMessage(data.lastMessage) : undefined,
      unreadCount: data.unreadCount || 0,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt || data.lastMessageAt || data.createdAt
    };
  }

  /**
   * Transform participants - shared transformation
   */
  protected transformParticipants(participants: any[], conversationData: any): ConversationParticipant[] {
    return participants.map((p: any) => ({
      userId: p.userId || p.id,
      role: p.role || UserRole.CUSTOMER,
      joinedAt: p.joinedAt || conversationData.createdAt,
      isActive: p.isActive !== false,
      name: p.name || 'Unknown',
      avatar: p.avatar || '',
      isOnline: p.isOnline || false,
      lastSeen: p.lastSeen
    }));
  }

  /**
   * Transform metadata - shared transformation
   */
  protected transformMetadata(data: any): ConversationMetadata {
    return {
      jobId: data.jobId || data.metadata?.jobId,
      jobTitle: data.jobTitle || data.metadata?.jobTitle,
      status: data.status || data.metadata?.status || ConversationStatus.ACTIVE,
      createdBy: data.createdBy || data.metadata?.createdBy || '',
      closedAt: data.closedAt || data.metadata?.closedAt
    };
  }

  /**
   * Transform settings - shared transformation
   */
  protected transformSettings(settings: any): ConversationSettings {
    return {
      isMuted: settings?.isMuted || false,
      isPinned: settings?.isPinned || false,
      notificationEnabled: settings?.notificationEnabled !== false
    };
  }

  /**
   * Transform message - basic transformation for last message
   */
  protected transformMessage(data: any): Message {
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

  /**
   * Validate conversation creation parameters - shared validation
   */
  protected validateConversationCreation(params: {
    participantIds: string[];
    type: ConversationType;
    jobId?: string;
  }): void {
    if (!params.participantIds || params.participantIds.length < 2) {
      throw new ValidationException('At least 2 participants required');
    }
    
    if (params.type === ConversationType.JOB_CHAT && !params.jobId) {
      throw new ValidationException('Job ID required for job chat');
    }
    
    // Remove duplicates
    const uniqueParticipants = [...new Set(params.participantIds)];
    if (uniqueParticipants.length !== params.participantIds.length) {
      throw new ValidationException('Duplicate participant IDs found');
    }
    
    // Check if current user is included
    if (!params.participantIds.includes(this.userId)) {
      throw new ValidationException('Current user must be included in participants');
    }
  }

  /**
   * Find conversation in cache by criteria - shared search
   */
  protected findConversationInCache(
    predicate: (conv: ServerConversation) => boolean
  ): ServerConversation | null {
    const conversations = this.cacheService.getCachedConversations();
    return conversations.find(predicate) || null;
  }

  /**
   * Find job conversation in cache - shared job search
   */
  protected findJobConversationInCache(jobId: string, otherUserId: string): ServerConversation | null {
    return this.findConversationInCache(c => {
      const hasMatchingJob = c.metadata?.jobId === jobId;
      const hasOtherUser = c.participants?.some(p => p.userId === otherUserId);
      const hasCurrentUser = c.participants?.some(p => p.userId === this.userId);
      const isTwoPersonChat = c.participants?.filter(p => p.isActive).length === 2;
      
      return hasMatchingJob && hasOtherUser && hasCurrentUser && isTwoPersonChat;
    });
  }

  /**
   * Cache conversation - shared caching
   */
  protected cacheConversation(conversation: ServerConversation): void {
    this.cacheService.cacheConversation(conversation);
  }

  /**
   * Cache multiple conversations - shared batch caching
   */
  protected cacheConversations(conversations: ServerConversation[]): void {
    conversations.forEach(conv => this.cacheConversation(conv));
  }

  /**
   * Get cached conversations - shared retrieval
   */
  protected getCachedConversations(): ServerConversation[] {
    return this.cacheService.getCachedConversations();
  }

  /**
   * Sort conversations by last activity - shared sorting
   */
  protected sortConversationsByActivity(conversations: ServerConversation[]): ServerConversation[] {
    return [...conversations].sort((a, b) => {
      const aTime = new Date(a.updatedAt).getTime();
      const bTime = new Date(b.updatedAt).getTime();
      return bTime - aTime; // Newest first
    });
  }

  /**
   * Filter conversations - shared filtering
   */
  protected filterConversations(
    conversations: ServerConversation[],
    filters: {
      type?: ConversationType;
      status?: ConversationStatus;
      isPinned?: boolean;
      isMuted?: boolean;
      hasUnread?: boolean;
    }
  ): ServerConversation[] {
    return conversations.filter(conv => {
      if (filters.type && conv.type !== filters.type) return false;
      if (filters.status && conv.metadata?.status !== filters.status) return false;
      if (filters.isPinned !== undefined && conv.settings?.isPinned !== filters.isPinned) return false;
      if (filters.isMuted !== undefined && conv.settings?.isMuted !== filters.isMuted) return false;
      if (filters.hasUnread && conv.unreadCount === 0) return false;
      
      return true;
    });
  }

  /**
   * Get other participant in two-person conversation - shared helper
   */
  protected getOtherParticipant(conversation: ServerConversation): ConversationParticipant | null {
    const activeParticipants = conversation.participants.filter(p => p.isActive);
    
    if (activeParticipants.length !== 2) {
      return null; // Not a two-person chat
    }
    
    return activeParticipants.find(p => p.userId !== this.userId) || null;
  }

  /**
   * Build API query parameters - shared query building
   */
  protected buildQueryParams(params: any): URLSearchParams {
    const queryParams = new URLSearchParams();
    
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.type) queryParams.append('type', params.type);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.isPinned !== undefined) queryParams.append('isPinned', params.isPinned.toString());
    if (params?.isMuted !== undefined) queryParams.append('isMuted', params.isMuted.toString());
    
    return queryParams;
  }

  /**
   * Check if user is participant - shared check
   */
  protected isUserParticipant(conversation: ServerConversation, userId: string): boolean {
    return conversation.participants.some(p => p.userId === userId && p.isActive);
  }

  /**
   * Update conversation in cache - shared update
   */
  protected updateCachedConversation(
    conversationId: string,
    updates: Partial<ServerConversation>
  ): void {
    const conversations = this.getCachedConversations();
    const index = conversations.findIndex(c => c.id === conversationId);
    
    if (index !== -1) {
      conversations[index] = { ...conversations[index], ...updates };
      this.cacheConversation(conversations[index]);
    }
  }
}