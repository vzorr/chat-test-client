// src/services/implementations/rest/RestUserService.ts
import { IUserService, ICacheService } from '../../interfaces';
import { 
  UserRegistrationData,
  ValidationException,
  NetworkException,
  AuthException,
  ChatUser,
  UserRole
} from '../../../types/chat';

export class RestUserService implements IUserService {
  private blockedUsers: Set<string> = new Set();
  private userCheckCache: Map<string, { timestamp: number; exists: boolean; userData?: any }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    private apiClient: any,
    private cacheService: ICacheService,
    private userId: string = ''
  ) {
    this.loadBlockedUsers();
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

  // Private helper methods

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
      const stored = await this.getBlockedUsers();
      if (stored && stored.length > 0) {
        this.blockedUsers.clear();
        stored.forEach(userId => this.blockedUsers.add(userId));
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
      // In a real implementation, save to AsyncStorage or equivalent
      // For now, just keep in memory
      console.log(`💾 Saved ${this.blockedUsers.size