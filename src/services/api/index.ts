// src/services/api/index.ts - Validated Export of All API Clients

// ==========================================
// IMPORTS
// ==========================================

import { AppConfig } from '../../config/AppConfig';
import { UserApiClient } from './clients/UserApiClient';
import { ConversationApiClient } from './clients/ConversationApiClient';
import { MessageApiClient } from './clients/MessageApiClient';
import { FileApiClient } from './clients/FileApiClient';

// ==========================================
// BASE CLIENT EXPORTS
// ==========================================

// Base client with all the merged functionality
export { BaseApiClient } from './base/BaseApiClient';

// Note: BaseApiClientConfig is an internal type used by BaseApiClient
// For external configuration, use AppConfig directly
export type { BaseApiClientConfig } from './base/BaseApiClient';

// Factory functions for creating configured instances
export { 
  createApiClient,
  createChatClient,
  createNotificationClient,
  createFormDataClient,
  createOtpClient
} from './base/BaseApiClient';

// ==========================================
// SPECIALIZED CLIENT EXPORTS
// ==========================================

// Individual API client implementations
export { UserApiClient } from './clients/UserApiClient';
export { ConversationApiClient } from './clients/ConversationApiClient';
export { MessageApiClient } from './clients/MessageApiClient';
export { FileApiClient } from './clients/FileApiClient';

// ==========================================
// TYPE EXPORTS
// ==========================================

// Utility type for all API clients
export type ApiClients = {
  userClient: UserApiClient;
  conversationClient: ConversationApiClient;
  messageClient: MessageApiClient;
  fileClient: FileApiClient;
};

// ==========================================
// API CLIENT FACTORY
// ==========================================

/**
 * Factory class for creating and managing API client instances
 * Uses AppConfig for all configuration needs
 * Implements singleton pattern with caching for efficient resource usage
 */
export class ApiClientFactory {
  // Cache for singleton instances
  private static instances = new Map<string, any>();
  
  // Token management for all clients
  private static currentToken: string | undefined;

  /**
   * Create or retrieve a cached UserApiClient instance
   * Uses AppConfig.chat settings by default
   * @param token - Optional authentication token (overrides stored token)
   * @returns UserApiClient instance
   */
  static createUserApiClient(token?: string): UserApiClient {
    const effectiveToken = token || this.currentToken;
    const key = `user-${effectiveToken || 'default'}`;
    
    if (!this.instances.has(key)) {
      // UserApiClient constructor already uses AppConfig internally
      // We just pass the token if provided
      const client = new UserApiClient(
        effectiveToken ? { 
          token: effectiveToken,
          baseUrl: AppConfig.chat.baseUrl,
          timeout: AppConfig.chat.timeout
        } : undefined
      );
      this.instances.set(key, client);
    }
    
    return this.instances.get(key);
  }

  /**
   * Create or retrieve a cached ConversationApiClient instance
   * Uses AppConfig.chat settings by default
   * @param token - Optional authentication token
   * @returns ConversationApiClient instance
   */
  static createConversationApiClient(token?: string): ConversationApiClient {
    const effectiveToken = token || this.currentToken;
    const key = `conversation-${effectiveToken || 'default'}`;
    
    if (!this.instances.has(key)) {
      const client = new ConversationApiClient(
        effectiveToken ? { 
          token: effectiveToken,
          baseUrl: AppConfig.chat.baseUrl,
          timeout: AppConfig.chat.timeout
        } : undefined
      );
      this.instances.set(key, client);
    }
    
    return this.instances.get(key);
  }

  /**
   * Create or retrieve a cached MessageApiClient instance
   * Uses AppConfig.chat settings by default
   * @param token - Optional authentication token
   * @returns MessageApiClient instance
   */
  static createMessageApiClient(token?: string): MessageApiClient {
    const effectiveToken = token || this.currentToken;
    const key = `message-${effectiveToken || 'default'}`;
    
    if (!this.instances.has(key)) {
      const client = new MessageApiClient(
        effectiveToken ? { 
          token: effectiveToken,
          baseUrl: AppConfig.chat.baseUrl,
          timeout: AppConfig.chat.timeout
        } : undefined
      );
      this.instances.set(key, client);
    }
    
    return this.instances.get(key);
  }

  /**
   * Create or retrieve a cached FileApiClient instance
   * Uses AppConfig.chat settings for file uploads
   * @param token - Optional authentication token
   * @returns FileApiClient instance
   */
  static createFileApiClient(token?: string): FileApiClient {
    const effectiveToken = token || this.currentToken;
    const key = `file-${effectiveToken || 'default'}`;
    
    if (!this.instances.has(key)) {
      const client = new FileApiClient(
        effectiveToken ? { 
          token: effectiveToken,
          baseUrl: AppConfig.chat.baseUrl,
          timeout: AppConfig.chat.uploadTimeout || AppConfig.chat.timeout
        } : undefined
      );
      this.instances.set(key, client);
    }
    
    return this.instances.get(key);
  }

  /**
   * Create all API clients at once
   * All clients use AppConfig settings automatically
   * @param token - Optional authentication token
   * @returns Object containing all API client instances
   */
  static createAllClients(token?: string): ApiClients {
    const effectiveToken = token || this.currentToken;
    
    // Store token for future client creations
    if (effectiveToken) {
      this.currentToken = effectiveToken;
    }
    
    return {
      userClient: this.createUserApiClient(effectiveToken),
      conversationClient: this.createConversationApiClient(effectiveToken),
      messageClient: this.createMessageApiClient(effectiveToken),
      fileClient: this.createFileApiClient(effectiveToken)
    };
  }

  /**
   * Clear all cached client instances
   * Useful when logging out or switching users
   */
  static clearCache(): void {
    this.instances.clear();
    this.currentToken = undefined;
  }

  /**
   * Update token for all cached instances
   * Maintains existing client instances but updates their authentication
   * @param oldToken - Previous authentication token (can be empty string)
   * @param newToken - New authentication token
   */
  static updateToken(oldToken: string, newToken: string): void {
    // Update stored token
    if (this.currentToken === oldToken || !this.currentToken) {
      this.currentToken = newToken;
    }
    
    // Create new key mapping
    const updates: Array<[string, string, any]> = [];
    
    // Collect updates first to avoid modifying map while iterating
    for (const [key, client] of this.instances.entries()) {
      if (key.includes(oldToken) || key.includes('default')) {
        // Update client token if it has setToken method
        if (typeof client.setToken === 'function') {
          client.setToken(newToken);
        }
        
        // Calculate new key
        const newKey = key.replace(oldToken || 'default', newToken);
        updates.push([key, newKey, client]);
      }
    }
    
    // Apply updates
    for (const [oldKey, newKey, client] of updates) {
      this.instances.delete(oldKey);
      this.instances.set(newKey, client);
    }
  }

  /**
   * Get current cached token
   * @returns Current token or undefined
   */
  static getCurrentToken(): string | undefined {
    return this.currentToken;
  }

  /**
   * Check if a specific client type is cached
   * @param clientType - Type of client to check
   * @param token - Optional token to check for specific instance
   * @returns Boolean indicating if client is cached
   */
  static hasClient(clientType: 'user' | 'conversation' | 'message' | 'file', token?: string): boolean {
    const effectiveToken = token || this.currentToken || 'default';
    const key = `${clientType}-${effectiveToken}`;
    return this.instances.has(key);
  }

  /**
   * Get statistics about cached clients
   * @returns Object with cache statistics
   */
  static getCacheStats(): {
    totalInstances: number;
    instanceTypes: Record<string, number>;
    currentToken: string | undefined;
    environment: string;
    baseUrls: {
      api: string;
      chat: string;
      notification: string;
    };
  } {
    const stats: Record<string, number> = {
      user: 0,
      conversation: 0,
      message: 0,
      file: 0
    };
    
    for (const key of this.instances.keys()) {
      const type = key.split('-')[0];
      if (type in stats) {
        stats[type]++;
      }
    }
    
    return {
      totalInstances: this.instances.size,
      instanceTypes: stats,
      currentToken: this.currentToken,
      environment: AppConfig.environment,
      baseUrls: {
        api: AppConfig.api.baseUrl,
        chat: AppConfig.chat.baseUrl,
        notification: AppConfig.notification.baseUrl
      }
    };
  }

  /**
   * Validate configuration using AppConfig settings
   * Checks if current AppConfig is valid for API operations
   * @param token - Optional token to validate
   * @returns Validation result with errors and warnings
   */
  static validateConfiguration(token?: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    config: {
      environment: string;
      hasValidUrls: boolean;
      hasToken: boolean;
      debugEnabled: boolean;
    };
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const effectiveToken = token || this.currentToken;

    // Validate token
    if (!effectiveToken) {
      warnings.push('No authentication token provided - some operations may fail');
    } else if (effectiveToken.length < 10) {
      warnings.push('Token appears to be too short');
    }

    // Validate AppConfig URLs
    if (!AppConfig.api.baseUrl) {
      errors.push('API base URL is not configured');
    }
    if (!AppConfig.chat.baseUrl) {
      errors.push('Chat base URL is not configured');
    }
    if (!AppConfig.notification.baseUrl) {
      warnings.push('Notification base URL is not configured');
    }

    // Validate timeouts from AppConfig
    if (AppConfig.api.timeout < 1000) {
      warnings.push(`API timeout is very short (${AppConfig.api.timeout}ms)`);
    }
    if (AppConfig.api.timeout > 300000) {
      warnings.push(`API timeout is very long (${AppConfig.api.timeout}ms)`);
    }

    // Check retry configuration
    if (AppConfig.api.retries > 5) {
      warnings.push(`High number of retries configured (${AppConfig.api.retries})`);
    }

    // Environment-specific checks
    if (AppConfig.environment === 'production' && AppConfig.debug?.enabled) {
      warnings.push('Debug logging is enabled in production environment');
    }

    const hasValidUrls = !!(AppConfig.api.baseUrl && AppConfig.chat.baseUrl);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      config: {
        environment: AppConfig.environment,
        hasValidUrls,
        hasToken: !!effectiveToken,
        debugEnabled: AppConfig.debug?.enabled || false
      }
    };
  }

  /**
   * Initialize factory with token from AppConfig or external source
   * @param token - Optional token, uses AppConfig if not provided
   */
  static initialize(token?: string): void {
    this.currentToken = token;
    
    if (AppConfig.debug?.enabled) {
      console.log('🏭 ApiClientFactory initialized:', {
        environment: AppConfig.environment,
        apiUrl: AppConfig.api.baseUrl,
        chatUrl: AppConfig.chat.baseUrl,
        hasToken: !!token
      });
    }
  }

  /**
   * Reset factory to initial state
   * Clears all cached instances and token
   */
  static reset(): void {
    this.clearCache();
    
    if (AppConfig.debug?.enabled) {
      console.log('🔄 ApiClientFactory reset to initial state');
    }
  }
}

// ==========================================
// CONVENIENCE FUNCTIONS
// ==========================================

/**
 * Create all chat-related API clients with a single call
 * Uses AppConfig for all settings
 * @param token - Optional authentication token
 * @returns Object containing all API client instances
 */
export const createChatClients = (token?: string): ApiClients => 
  ApiClientFactory.createAllClients(token);

/**
 * Create a user API client with AppConfig settings
 * @param token - Optional authentication token
 * @returns UserApiClient instance
 */
export const createUserClient = (token?: string): UserApiClient => 
  ApiClientFactory.createUserApiClient(token);

/**
 * Create a conversation API client with AppConfig settings
 * @param token - Optional authentication token
 * @returns ConversationApiClient instance
 */
export const createConversationClient = (token?: string): ConversationApiClient => 
  ApiClientFactory.createConversationApiClient(token);

/**
 * Create a message API client with AppConfig settings
 * @param token - Optional authentication token
 * @returns MessageApiClient instance
 */
export const createMessageClient = (token?: string): MessageApiClient => 
  ApiClientFactory.createMessageApiClient(token);

/**
 * Create a file API client with AppConfig settings
 * @param token - Optional authentication token
 * @returns FileApiClient instance
 */
export const createFileClient = (token?: string): FileApiClient => 
  ApiClientFactory.createFileApiClient(token);

/**
 * Validate current configuration from AppConfig
 * @param token - Optional token to validate
 * @returns Validation result
 */
export const validateApiConfig = (token?: string) => 
  ApiClientFactory.validateConfiguration(token);

/**
 * Clear all cached API client instances
 */
export const clearApiClientCache = () => 
  ApiClientFactory.clearCache();

/**
 * Update authentication token for all cached clients
 * @param oldToken - Previous token (can be empty string)
 * @param newToken - New token
 */
export const updateApiToken = (oldToken: string, newToken: string) => 
  ApiClientFactory.updateToken(oldToken, newToken);

/**
 * Initialize API factory with token
 * @param token - Authentication token
 */
export const initializeApiFactory = (token?: string) =>
  ApiClientFactory.initialize(token);

/**
 * Reset API factory to initial state
 */
export const resetApiFactory = () =>
  ApiClientFactory.reset();

/**
 * Get current API factory statistics
 */
export const getApiStats = () =>
  ApiClientFactory.getCacheStats();

// ==========================================
// DEFAULT EXPORT
// ==========================================

// Default export for convenience
export default ApiClientFactory;