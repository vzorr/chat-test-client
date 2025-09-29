// src/services/api/clients/UserApiClient.ts
import { BaseApiClient, BaseApiClientConfig } from '../base/BaseApiClient';
import { UserRegistrationData } from '../../../types/chat';
import { AppConfig } from '../../../config/AppConfig';

/**
 * User API Client - handles user operations and blocking
 */
export class UserApiClient extends BaseApiClient {
  
  constructor(config?: BaseApiClientConfig) {
    super(config || {
      baseUrl: AppConfig.chat.baseUrl,
      clientType: 'chat',
      timeout: AppConfig.chat.timeout
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
      role: 'customer' | 'usta' | 'admin';
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
      console.log('🔍 [UserApiClient] Checking user existence:', userId);
      
      const response = await this.get<any>(`/users/${userId}`);
      
      console.log('✅ [UserApiClient] User check response:', {
        status: 'success',
        success: response?.success,
        hasUser: !!response?.user
      });
      
      return response;
      
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log('ℹ️ [UserApiClient] User not found (404):', userId);
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
      console.log('📤 [UserApiClient] Registering user with chat server:', {
        id: userData.id,
        externalId: userData.externalId,
        name: userData.name,
        role: userData.role
      });

      const response = await this.post<any>('/auth/register-user', userData);

      console.log('✅ [UserApiClient] User registration response:', {
        success: response?.success,
        userId: response?.user?.id
      });

      return response;

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
   * Get user details by ID
   */
  async getUserDetails(userId: string): Promise<{
    success: boolean;
    user?: any;
    error?: any;
  }> {
    try {
      console.log('👤 [UserApiClient] Getting user details:', userId);
      
      const response = await this.get<any>(`/users/${userId}/details`);
      
      console.log('✅ [UserApiClient] User details retrieved');
      return response;
      
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log('ℹ️ [UserApiClient] User details not found (404):', userId);
        return {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          }
        };
      }
      
      this.safeLogError('Error getting user details', error);
      throw error;
    }
  }

  /**
   * Block a user
   */
  async blockUser(userId: string): Promise<void> {
    try {
      console.log('🚫 [UserApiClient] Blocking user:', userId);
      
      await this.post('/users/block', { userId });
      
      console.log('✅ [UserApiClient] User blocked successfully');
      
    } catch (error: any) {
      this.safeLogError('Failed to block user', error);
      throw error;
    }
  }

  /**
   * Unblock a user
   */
  async unblockUser(userId: string): Promise<void> {
    try {
      console.log('✅ [UserApiClient] Unblocking user:', userId);
      
      await this.delete(`/users/block/${userId}`);
      
      console.log('✅ [UserApiClient] User unblocked successfully');
      
    } catch (error: any) {
      this.safeLogError('Failed to unblock user', error);
      throw error;
    }
  }

  /**
   * Check block status between users
   */
  async checkBlockStatus(userId: string): Promise<{ isBlocked: boolean }> {
    try {
      const response = await this.get<any>(`/users/block-status/${userId}`);
      
      return {
        isBlocked: response?.isBlocked || false
      };
    } catch (error: any) {
      this.safeLogError('Error checking block status', error);
      return { isBlocked: false };
    }
  }

  /**
   * Get list of blocked users
   */
  async getBlockedUsers(): Promise<{
    success: boolean;
    users?: string[];
  }> {
    try {
      const response = await this.get<any>('/users/blocked');
      
      return {
        success: true,
        users: response?.users || []
      };
      
    } catch (error: any) {
      this.safeLogError('Error getting blocked users', error);
      return {
        success: false,
        users: []
      };
    }
  }

  /**
   * Update user status
   */
  async updateUserStatus(status: 'available' | 'busy' | 'away' | 'do_not_disturb'): Promise<void> {
    try {
      await this.patch('/users/status', { status });
      console.log('✅ [UserApiClient] User status updated');
    } catch (error: any) {
      this.safeLogError('Failed to update user status', error);
      throw error;
    }
  }

  /**
   * Get user online status
   */
  async getUserOnlineStatus(userId: string): Promise<{
    isOnline: boolean;
    lastSeen?: string;
    status?: string;
  }> {
    try {
      const response = await this.get<any>(`/users/${userId}/status`);
      
      return {
        isOnline: response?.isOnline || false,
        lastSeen: response?.lastSeen,
        status: response?.status
      };
      
    } catch (error: any) {
      this.safeLogError('Error getting user online status', error);
      return { isOnline: false };
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(updates: {
    name?: string;
    avatar?: string;
    statusMessage?: string;
    timezone?: string;
  }): Promise<void> {
    try {
      console.log('👤 [UserApiClient] Updating user profile');
      
      await this.patch('/users/profile', updates);
      
      console.log('✅ [UserApiClient] User profile updated');
    } catch (error: any) {
      this.safeLogError('Failed to update user profile', error);
      throw error;
    }
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(): Promise<{
    notifications: {
      pushEnabled: boolean;
      emailEnabled: boolean;
      mentions: boolean;
      directMessages: boolean;
    };
    privacy: {
      showOnlineStatus: boolean;
      allowDirectMessages: boolean;
    };
    appearance: {
      theme: 'light' | 'dark' | 'auto';
      language: string;
    };
  }> {
    try {
      const response = await this.get<any>('/users/preferences');
      
      return response?.preferences || {
        notifications: {
          pushEnabled: true,
          emailEnabled: true,
          mentions: true,
          directMessages: true
        },
        privacy: {
          showOnlineStatus: true,
          allowDirectMessages: true
        },
        appearance: {
          theme: 'auto',
          language: 'en'
        }
      };
      
    } catch (error: any) {
      this.safeLogError('Error getting user preferences', error);
      return {
        notifications: {
          pushEnabled: true,
          emailEnabled: true,
          mentions: true,
          directMessages: true
        },
        privacy: {
          showOnlineStatus: true,
          allowDirectMessages: true
        },
        appearance: {
          theme: 'auto',
          language: 'en'
        }
      };
    }
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(preferences: any): Promise<void> {
    try {
      console.log('⚙️ [UserApiClient] Updating user preferences');
      
      await this.patch('/users/preferences', preferences);
      
      console.log('✅ [UserApiClient] User preferences updated');
    } catch (error: any) {
      this.safeLogError('Failed to update user preferences', error);
      throw error;
    }
  }

  /**
   * Search users
   */
  async searchUsers(query: string, options?: {
    limit?: number;
    offset?: number;
    role?: string;
    excludeBlocked?: boolean;
  }): Promise<{
    success: boolean;
    users: Array<{
      id: string;
      name: string;
      avatar?: string;
      role: string;
      isOnline: boolean;
      lastSeen?: string;
    }>;
    total: number;
  }> {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('query', query);
      if (options?.limit) queryParams.append('limit', options.limit.toString());
      if (options?.offset) queryParams.append('offset', options.offset.toString());
      if (options?.role) queryParams.append('role', options.role);
      if (options?.excludeBlocked) queryParams.append('excludeBlocked', 'true');
      
      const response = await this.get<any>(`/users/search?${queryParams.toString()}`);
      
      if (this.isSuccessResponse(response)) {
        return {
          success: true,
          users: response.users || [],
          total: response.total || 0
        };
      }
      
      throw new Error(response?.message || 'Search failed');
    } catch (error: any) {
      this.safeLogError('Error searching users', error);
      return {
        success: false,
        users: [],
        total: 0
      };
    }
  }
}