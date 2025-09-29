// src/services/api/index.ts - Export all API clients

// Base client
export { BaseApiClient } from './base/BaseApiClient';

// Specialized clients
export { UserApiClient } from './clients/UserApiClient';
export { ConversationApiClient } from './clients/ConversationApiClient';
export { MessageApiClient } from './clients/MessageApiClient';
export { FileApiClient } from './clients/FileApiClient';

// Client factory for creating configured instances
export class ApiClientFactory {
  private static instances = new Map<string, any>();

  /**
   * Create a UserApiClient instance
   */
  static createUserApiClient(token?: string): UserApiClient {
    const client = new UserApiClient();
    if (token) {
      client.setToken(token);
    }
    return client;
  }

  /**
   * Create a ConversationApiClient instance
   */
  static createConversationApiClient(token?: string): ConversationApiClient {
    const client = new ConversationApiClient();
    if (token) {
      client.setToken(token);
    }
    return client;
  }

  /**
   * Create a MessageApiClient instance
   */
  static createMessageApiClient(token?: string): MessageApiClient {
    const client = new MessageApiClient();
    if (token) {
      client.setToken(token);
    }
    return client;
  }

  /**
   * Create a FileApiClient instance
   */
  static createFileApiClient(token?: string): FileApiClient {
    const client = new FileApiClient();
    if (token) {
      client.setToken(token);
    }
    return client;
  }

  /**
   * Create all API clients at once
   */
  static createAllClients(token?: string): {
    userClient: UserApiClient;
    conversationClient: ConversationApiClient;
    messageClient: MessageApiClient;
    fileClient: FileApiClient;
  } {
    return {
      userClient: this.createUserApiClient(token),
      conversationClient: this.createConversationApiClient(token),
      messageClient: this.createMessageApiClient(token),
      fileClient: this.createFileApiClient(token)
    };
  }

  /**
   * Get or create singleton instances (cached by token)
   */
  static getSingletonClients(token: string): {
    userClient: UserApiClient;
    conversationClient: ConversationApiClient;
    messageClient: MessageApiClient;
    fileClient: FileApiClient;
  } {
    const cacheKey = `clients_${token}`;
    
    if (!this.instances.has(cacheKey)) {
      this.instances.set(cacheKey, this.createAllClients(token));
    }
    
    return this.instances.get(cacheKey);
  }

  /**
   * Clear cached instances
   */
  static clearCache(): void {
    this.instances.clear();
  }

  /**
   * Update token for all cached instances
   */
  static updateToken(oldToken: string, newToken: string): void {
    const oldCacheKey = `clients_${oldToken}`;
    const newCacheKey = `clients_${newToken}`;
    
    if (this.instances.has(oldCacheKey)) {
      const clients = this.instances.get(oldCacheKey);
      
      // Update tokens on all clients
      clients.userClient.setToken(newToken);
      clients.conversationClient.setToken(newToken);
      clients.messageClient.setToken(newToken);
      clients.fileClient.setToken(newToken);
      
      // Move to new cache key
      this.instances.set(newCacheKey, clients);
      this.instances.delete(oldCacheKey);
    }
  }

  /**
   * Create clients for specific operations only
   */
  static createUserOperationsClient(token?: string): {
    userClient: UserApiClient;
  } {
    return {
      userClient: this.createUserApiClient(token)
    };
  }

  static createMessagingClients(token?: string): {
    conversationClient: ConversationApiClient;
    messageClient: MessageApiClient;
    fileClient: FileApiClient;
  } {
    return {
      conversationClient: this.createConversationApiClient(token),
      messageClient: this.createMessageApiClient(token),
      fileClient: this.createFileApiClient(token)
    };
  }

  /**
   * Validate client configuration
   */
  static validateConfiguration(config: {
    token?: string;
    baseUrl?: string;
  }): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate token
    if (!config.token) {
      warnings.push('No authentication token provided - some operations may fail');
    } else if (typeof config.token !== 'string') {
      errors.push('Token must be a string');
    } else if (config.token.trim().length === 0) {
      errors.push('Token cannot be empty');
    }

    // Validate base URL format if provided
    if (config.baseUrl) {
      try {
        new URL(config.baseUrl);
      } catch {
        errors.push('Invalid base URL format');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

// Utility type for all API clients
export type ApiClients = {
  userClient: UserApiClient;
  conversationClient: ConversationApiClient;
  messageClient: MessageApiClient;
  fileClient: FileApiClient;
};

// Configuration interface
export interface ApiClientConfig {
  token?: string;
  baseUrl?: string;
  timeout?: number;
  retryAttempts?: number;
  enableLogging?: boolean;
}

// Convenience functions for common patterns
export const createChatClients = (token?: string) => 
  ApiClientFactory.createAllClients(token);

export const createUserClient = (token?: string) => 
  ApiClientFactory.createUserApiClient(token);

export const createConversationClient = (token?: string) => 
  ApiClientFactory.createConversationApiClient(token);

export const createMessageClient = (token?: string) => 
  ApiClientFactory.createMessageApiClient(token);

export const createFileClient = (token?: string) => 
  ApiClientFactory.createFileApiClient(token);

// Default export for convenience
export default ApiClientFactory;