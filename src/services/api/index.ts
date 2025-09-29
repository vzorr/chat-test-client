// src/services/api/index.ts - Export all API clients

// Base client with all the merged functionality
export { BaseApiClient, BaseApiClientConfig } from './base/BaseApiClient';
export { 
  createApiClient,
  createChatClient,
  createNotificationClient,
  createFormDataClient,
  createOtpClient
} from './base/BaseApiClient';

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
    const key = `user-${token || 'default'}`;
    if (!this.instances.has(key)) {
      const client = new UserApiClient({ token });
      this.instances.set(key, client);
    }
    return this.instances.get(key);
  }

  /**
   * Create a ConversationApiClient instance
   */
  static createConversationApiClient(token?: string): ConversationApiClient {
    const key = `conversation-${token || 'default'}`;
    if (!this.instances.has(key)) {
      const client = new ConversationApiClient({ token });
      this.instances.set(key, client);
    }
    return this.instances.get(key);
  }

  /**
   * Create a MessageApiClient instance
   */
  static createMessageApiClient(token?: string): MessageApiClient {
    const key = `message-${token || 'default'}`;
    if (!this.instances.has(key)) {
      const client = new MessageApiClient({ token });
      this.instances.set(key, client);
    }
    return this.instances.get(key);
  }

  /**
   * Create a FileApiClient instance
   */
  static createFileApiClient(token?: string): FileApiClient {
    const key = `file-${token || 'default'}`;
    if (!this.instances.has(key)) {
      const client = new FileApiClient({ token });
      this.instances.set(key, client);
    }
    return this.instances.get(key);
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
   * Clear cached instances
   */
  static clearCache(): void {
    this.instances.clear();
  }

  /**
   * Update token for all cached instances
   */
  static updateToken(oldToken: string, newToken: string): void {
    // Update all existing clients with new token
    for (const [key, client] of this.instances.entries()) {
      if (key.includes(oldToken)) {
        client.setToken(newToken);
        // Update the key in the map
        const newKey = key.replace(oldToken, newToken);
        this.instances.delete(key);
        this.instances.set(newKey, client);
      }
    }
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