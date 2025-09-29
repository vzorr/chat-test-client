// src/services/implementations/rest/RestUserService.ts
import { IUserService, ICacheService, IStorageService } from '../interfaces';
import { 
  UserRegistrationData,
  ValidationException,
  NetworkException,
  AuthException,
  ChatUser,
  UserRole
} from '../../types/chat';

export class RestUserService implements IUserService {
  private blockedUsers: Set<string> = new Set();
  private userCheckCache: Map<string, { timestamp: number; exists: boolean; userData?: any }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly BLOCKED_USERS_STORAGE_KEY = 'blocked_users';

  constructor(
    private apiClient: any,
    private cacheService: ICacheService,
    private userId: string = '',
    private storageService?: IStorageService
  ) {
    this.loadBlockedUsers();
  }

  /**
   * Check if a user exists
   */
  async checkUserExists(userId: string): Promise<{
    success: boolean;
    user?: any;
    error?: any;
  }> {
    try {
      if (!userId?.trim()) {
        throw new ValidationException('User ID is required');
      }

      // Check cache first
      const cached = this.userCheckCache.get(userId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        console.log('✓ User existence from cache:', userId);
        return {
          success: cached.exists,
          user: cached.userData,
          error: cached.exists ? undefined : { code: 'USER_NOT_FOUND', message: 'User not found' }
        };
      }

      console.log('🔍 Checking user existence:', userId);
      
      const response = await this.apiClient.get(`/users/${userId}`);
      
      // Update cache
      this.userCheckCache.set(userId, {
        timestamp: Date.now(),
        exists: response.data?.success || false,
        userData: response.data?.user
      });

      return {
        success: response.data?.success || false,
        user: response.data?.user,
        error: response.data?.error
      };
      
    } catch (error: any) {
      if (error?.response?.status === 404) {
        // Cache the non-existence
        this.userCheckCache.set(userId, {
          timestamp: Date.now(),
          exists: false
        });
        
        return {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            statusCode: 404
          }
        };
      }
      
      console.error('❌ Error checking user existence:', error);
      throw new NetworkException('Failed to check user existence', error);
    }
  }

  /**
   * Register a new user
   */
  async registerUser(userData: UserRegistrationData): Promise<{
    success: boolean;
    user?: any;
    error?: any;
  }> {
    try {
      console.log('📤 Registering user:', {
        id: userData.id,
        externalId: userData.externalId,
        name: userData.name,
        role: userData.role
      });

      // Validate required fields
      if (!userData.id?.trim()) {
        throw new ValidationException('User ID is required');
      }
      if (!userData.externalId?.trim()) {
        throw new ValidationException('External ID is required');
      }
      if (!userData.name?.trim()) {
        throw new ValidationException('User name is required');
      }

      const response = await this.apiClient.post('/auth/register-user', userData);

      if (response.data?.success && response.data?.user) {
        // Cache the new user
        this.cacheService.cacheUser(userData.id, response.data.user);
        
        // Update existence cache
        this.userCheckCache.set(userData.id, {
          timestamp: Date.now(),
          exists: true,
          userData: response.data.user
        });

        console.log('✅ User registered successfully');
      }

      return {
        success: response.data?.success || false,
        user: response.data?.user,
        error: response.data?.error
      };

    } catch (error: any) {
      console.error('❌ User registration error:', error);

      if (error instanceof ValidationException) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message
          }
        };
      }

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
   * Get detailed user information
   */
  async getUserDetails(userId: string): Promise<any | null> {
    try {
      if (!userId?.trim()) {
        throw new ValidationException('User ID is required');
      }

      // Check cache first
      const cached = this.cacheService.getCachedUser(userId);
      if (cached) {
        console.log('✓ User details from cache:', userId);
        return cached;
      }

      console.log('👤 Getting user details from server:', userId);
      
      const response = await this.apiClient.get(`/users/${userId}/details`);
      
      if (response.data?.success && response.data?.user) {
        const user = this.transformUserData(response.data.user);
        
        // Cache the user details
        this.cacheService.cacheUser(userId, user);
        
        console.log('✓ User details retrieved');
        return user;
      }
      
      console.log('ℹ️ User not found:', userId);
      return null;
      
    } catch (error: any) {
      if (error?.response?.status === 404) {
        console.log('ℹ️ User not found (404):', userId);
        return null;
      }
      
      console.error('❌ Error getting user details:', error);
      throw new NetworkException('Failed to get user details', error);
    }
  }

  /**
   * Block a user
   */
  async blockUser(userId: string): Promise<void> {
    try {
      if (!userId?.trim()) {
        throw new ValidationException('User ID is required');
      }
      
      if (userId === this.userId) {
        throw new ValidationException('Cannot block yourself');
      }
      
      console.log('🚫 Blocking user:', userId);
      
      await this.apiClient.post('/users/block', { userId });
      
      // Update local blocked list
      this.blockedUsers.add(userId);
      await this.saveBlockedUsers();
      
      console.log('✓ User blocked successfully');
      
    } catch (error: any) {
      console.error('❌ Failed to block user:', error);
      this.handleApiError(error, 'block user');
    }
  }

  /**
   * Unblock a user
   */
  async unblockUser(userId: string): Promise<void> {
    try {
      if (!userId?.trim()) {
        throw new ValidationException('User ID is required');
      }
      
      console.log('✅ Unblocking user:', userId);
      
      await this.apiClient.delete(`/users/block/${userId}`);
      
      // Update local blocked list
      this.blockedUsers.delete(userId);
      await this.saveBlockedUsers();
      
      console.log('✓ User unblocked successfully');
      
    } catch (error: any) {
      console.error('❌ Failed to unblock user:', error);
      this.handleApiError(error, 'unblock user');
    }
  }

  /**
   * Check if a user is blocked
   */
  async isUserBlocked(userId: string): Promise<boolean> {
    try {
      if (!userId?.trim()) {
        return false;
      }
      
      // Check local cache first
      if (this.blockedUsers.has(userId)) {
        return true;
      }
      
      // Verify with server
      const response = await this.apiClient.get(`/users/block-status/${userId}`);
      
      const isBlocked = response.data?.isBlocked || false;
      
      // Update local cache
      if (isBlocked) {
        this.blockedUsers.add(userId);
      } else {
        this.blockedUsers.delete(userId);
      }
      
      return isBlocked;
      
    } catch (error: any) {
      console.error('❌ Failed to check block status:', error);
      // Return local cache status on error
      return this.blockedUsers.has(userId);
    }
  }

  /**
   * Get list of blocked users
   */
  async getBlockedUsers(): Promise<string[]> {
    try {
      const response = await this.apiClient.get('/users/blocked');
      
      if (response.data?.success && Array.isArray(response.data.users)) {
        // Update local cache
        this.blockedUsers.clear();
        response.data.users.forEach((userId: string) => this.blockedUsers.add(userId));
        await this.saveBlockedUsers();
        
        return response.data.users;
      }
      
      // Return local cache if API fails
      return Array.from(this.blockedUsers);
      
    } catch (error: any) {
      console.error('❌ Failed to get blocked users:', error);
      return Array.from(this.blockedUsers);
    }
  }

  // ==========================================
  // PRIVATE HELPER METHODS
  // ==========================================

  /**
   * Transform user data from API to app format
   */
  private transformUserData(data: any): ChatUser {
    return {
      id: data.id || data.userId,
      name: data.name || 'Unknown',
      avatar: data.avatar || data.profilePicture,
      isOnline: data.isOnline || false,
      lastSeen: data.lastSeen,
      role: data.role || UserRole.CUSTOMER,
      status: data.status,
      statusMessage: data.statusMessage,
      timezone: data.timezone,
      isVerified: data.isVerified || false
    };
  }

  /**
   * Load blocked users from storage
   */
  private async loadBlockedUsers(): Promise<void> {
    try {
      // Try to load from storage service if available
      if (this.storageService) {
        const stored = await this.storageService.get<string[]>(this.BLOCKED_USERS_STORAGE_KEY);
        if (stored && Array.isArray(stored)) {
          this.blockedUsers.clear();
          stored.forEach(userId => this.blockedUsers.add(userId));
          console.log(`📥 Loaded ${this.blockedUsers.size} blocked users from storage`);
          return;
        }
      }
      
      // Otherwise, fetch from server
      const serverList = await this.getBlockedUsers();
      if (serverList && serverList.length > 0) {
        this.blockedUsers.clear();
        serverList.forEach(userId => this.blockedUsers.add(userId));
      }
    } catch (error) {
      console.warn('Failed to load blocked users from storage:', error);
    }
  }

  /**
   * Save blocked users to storage
   */
  private async saveBlockedUsers(): Promise<void> {
    try {
      if (this.storageService) {
        const userList = Array.from(this.blockedUsers);
        await this.storageService.set(this.BLOCKED_USERS_STORAGE_KEY, userList);
        console.log(`💾 Saved ${this.blockedUsers.size} blocked users to storage`);
      }
    } catch (error) {
      console.warn('Failed to save blocked users to storage:', error);
    }
  }

  /**
   * Handle API errors with appropriate exceptions
   */
  private handleApiError(error: any, operation: string): void {
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
      throw new ValidationException('User not found');
    } else if (status === 409) {
      throw new ValidationException('User already blocked');
    } else {
      throw new NetworkException(`Failed to ${operation}`, error);
    }
  }

  /**
   * Clear user cache (useful for logout)
   */
  async clearCache(): Promise<void> {
    this.userCheckCache.clear();
    this.blockedUsers.clear();
    this.cacheService.clearUserCache();
    
    if (this.storageService) {
      await this.storageService.remove(this.BLOCKED_USERS_STORAGE_KEY);
    }
    
    console.log('🗑️ User service cache cleared');
  }

  /**
   * Update current user ID (useful when switching accounts)
   */
  setCurrentUserId(userId: string): void {
    this.userId = userId;
    console.log('👤 Current user ID updated:', userId);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    userCheckCacheSize: number;
    blockedUsersCount: number;
    cacheAge: number;
  } {
    let oldestCache = Date.now();
    
    for (const [, data] of this.userCheckCache) {
      if (data.timestamp < oldestCache) {
        oldestCache = data.timestamp;
      }
    }
    
    return {
      userCheckCacheSize: this.userCheckCache.size,
      blockedUsersCount: this.blockedUsers.size,
      cacheAge: Date.now() - oldestCache
    };
  }

  /**
   * Clean up expired cache entries
   */
  cleanupExpiredCache(): void {
    const now = Date.now();
    let removed = 0;
    
    for (const [userId, data] of this.userCheckCache) {
      if (now - data.timestamp > this.CACHE_TTL) {
        this.userCheckCache.delete(userId);
        removed++;
      }
    }
    
    if (removed > 0) {
      console.log(`🧹 Cleaned up ${removed} expired user cache entries`);
    }
  }

  /**
   * Refresh blocked users list from server
   */
  async refreshBlockedUsers(): Promise<void> {
    try {
      const serverList = await this.getBlockedUsers();
      console.log('🔄 Refreshed blocked users list');
    } catch (error) {
      console.error('Failed to refresh blocked users:', error);
    }
  }
}