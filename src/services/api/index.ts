// src/services/api/index.ts - Single source of truth for all API client creation
import { AppConfig } from '../../config/AppConfig';
import { BaseApiClient } from './base/BaseApiClient';
import { UserApiClient } from './clients/UserApiClient';
import { ConversationApiClient } from './clients/ConversationApiClient';
import { MessageApiClient } from './clients/MessageApiClient';
import { FileApiClient } from './clients/FileApiClient';

/**
 * ApiClientFactory - Single source of truth for ALL API client creation
 * This is the ONLY place where API clients should be created
 */
export class ApiClientFactory {
  private static instances = new Map<string, any>();
  private static currentToken: string | undefined;

  /**
   * Create or retrieve a base API client
   */
  static createApiClient(token?: string): BaseApiClient {
    const key = `api-${token || 'default'}`;
    
    if (!this.instances.has(key)) {
      this.instances.set(key, new BaseApiClient({
        baseUrl: AppConfig.urls.api,
        token: token || this.currentToken,
        timeout: AppConfig.api.timeout,
        headers: AppConfig.api.headers,
        retries: AppConfig.api.retries,
        retryDelay: AppConfig.api.retryDelay,
        enableLogging: AppConfig.debug.enabled,
        enableCompression: AppConfig.performance.enableDataCompression,
        clientType: 'default'
      }));
    }
    
    return this.instances.get(key);
  }

  /**
   * Create or retrieve a chat API client
   */
  static createChatClient(token?: string): BaseApiClient {
    const key = `chat-${token || 'default'}`;
    
    if (!this.instances.has(key)) {
      this.instances.set(key, new BaseApiClient({
        baseUrl: AppConfig.urls.chat,
        token: token || this.currentToken,
        timeout: AppConfig.chat.timeout,
        headers: AppConfig.api.headers,
        retries: AppConfig.api.retries,
        retryDelay: AppConfig.api.retryDelay,
        enableLogging: AppConfig.debug.enabled,
        enableCompression: AppConfig.performance.enableDataCompression,
        clientType: 'chat'
      }));
    }
    
    return this.instances.get(key);
  }

  /**
   * Create form data client for file uploads
   */
  static createFormDataClient(token?: string): BaseApiClient {
    const key = `formdata-${token || 'default'}`;
    
    if (!this.instances.has(key)) {
      this.instances.set(key, new BaseApiClient({
        baseUrl: AppConfig.urls.chat,
        token: token || this.currentToken,
        timeout: AppConfig.chat.uploadTimeout,
        headers: { ...AppConfig.api.headers, 'Content-Type': 'multipart/form-data' },
        retries: AppConfig.api.retries,
        retryDelay: AppConfig.api.retryDelay,
        enableLogging: AppConfig.debug.enabled,
        clientType: 'formdata'
      }));
    }
    
    return this.instances.get(key);
  }

  /**
   * Create OTP client
   */
  static createOtpClient(token?: string): BaseApiClient {
    const key = `otp-${token || 'default'}`;
    
    if (!this.instances.has(key)) {
      this.instances.set(key, new BaseApiClient({
        baseUrl: AppConfig.urls.api,
        token: token || this.currentToken,
        timeout: AppConfig.api.timeout,
        headers: AppConfig.api.headers,
        retries: AppConfig.api.retries,
        retryDelay: AppConfig.api.retryDelay,
        enableLogging: AppConfig.debug.enabled,
        clientType: 'otp'
      }));
    }
    
    return this.instances.get(key);
  }

  /**
   * Create specialized API clients
   */
  static createUserApiClient(token?: string): UserApiClient {
    const key = `user-api-${token || 'default'}`;
    
    if (!this.instances.has(key)) {
      const baseClient = this.createChatClient(token);
      this.instances.set(key, new UserApiClient({ 
        token: token || this.currentToken,
        baseUrl: AppConfig.urls.chat,
        timeout: AppConfig.chat.timeout
      }));
    }
    
    return this.instances.get(key);
  }

  static createConversationApiClient(token?: string): ConversationApiClient {
    const key = `conversation-api-${token || 'default'}`;
    
    if (!this.instances.has(key)) {
      this.instances.set(key, new ConversationApiClient({
        token: token || this.currentToken,
        baseUrl: AppConfig.urls.chat,
        timeout: AppConfig.chat.timeout
      }));
    }
    
    return this.instances.get(key);
  }

  static createMessageApiClient(token?: string): MessageApiClient {
    const key = `message-api-${token || 'default'}`;
    
    if (!this.instances.has(key)) {
      this.instances.set(key, new MessageApiClient({
        token: token || this.currentToken,
        baseUrl: AppConfig.urls.chat,
        timeout: AppConfig.chat.timeout
      }));
    }
    
    return this.instances.get(key);
  }

  static createFileApiClient(token?: string): FileApiClient {
    const key = `file-api-${token || 'default'}`;
    
    if (!this.instances.has(key)) {
      this.instances.set(key, new FileApiClient({
        token: token || this.currentToken,
        baseUrl: AppConfig.urls.chat,
        timeout: AppConfig.chat.uploadTimeout
      }));
    }
    
    return this.instances.get(key);
  }

  /**
   * Create all API clients at once
   */
  static createAllClients(token?: string) {
    this.currentToken = token;
    
    return {
      api: this.createApiClient(token),
      chat: this.createChatClient(token),
      user: this.createUserApiClient(token),
      conversation: this.createConversationApiClient(token),
      message: this.createMessageApiClient(token),
      file: this.createFileApiClient(token),
    };
  }

  /**
   * Update token for all cached instances
   */
  static updateToken(token: string): void {
    this.currentToken = token;
    
    // Update all existing instances
    for (const [key, client] of this.instances.entries()) {
      if (typeof client.setToken === 'function') {
        client.setToken(token);
      }
    }
  }

  /**
   * Clear all cached instances
   */
  static clearCache(): void {
    this.instances.clear();
    this.currentToken = undefined;
  }

  /**
   * Get cache statistics
   */
  static getCacheStats() {
    return {
      totalInstances: this.instances.size,
      instances: Array.from(this.instances.keys()),
      hasToken: !!this.currentToken,
      environment: AppConfig.environment,
      urls: AppConfig.urls
    };
  }
}

// Export convenience functions
export const createApiClient = (token?: string) => ApiClientFactory.createApiClient(token);
export const createChatClient = (token?: string) => ApiClientFactory.createChatClient(token);
export const createUserClient = (token?: string) => ApiClientFactory.createUserApiClient(token);
export const createConversationClient = (token?: string) => ApiClientFactory.createConversationApiClient(token);
export const createMessageClient = (token?: string) => ApiClientFactory.createMessageApiClient(token);
export const createFileClient = (token?: string) => ApiClientFactory.createFileApiClient(token);
export const createAllClients = (token?: string) => ApiClientFactory.createAllClients(token);

// Default export
export default ApiClientFactory;