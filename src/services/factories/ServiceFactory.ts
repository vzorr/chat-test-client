// src/services/factories/ServiceFactory.ts - Fixed Service Factory with AppConfig

import {
  IMessageService,
  IConversationService,
  IUserService,
  IFileService,
  IRealtimeService,
  IOfflineQueueService,
  IStorageService,
  ICacheService
} from '../interfaces';

import { AppConfig } from '../../config/AppConfig';
import { logger } from '../../utils/Logger';

// Import the merged BaseApiClient
import { BaseApiClient } from '../api/base/BaseApiClient';

// Import implementations
import { RestMessageService } from '../implementations/RestMessageService';
import { SocketMessageService } from '../implementations/SocketMessageService';
import { HybridMessageService } from '../implementations/HybridMessageService';
import { RestConversationService } from '../implementations/RestConversationService';
import { RestUserService } from '../implementations/RestUserService';
import { RestFileService } from '../implementations/RestFileService';
import { OfflineQueueService } from '../implementations/OfflineQueueService';

// Storage implementations
import { AsyncStorageService } from '../implementations/storage/AsyncStorageService';
import { LocalStorageService } from '../implementations/storage/LocalStorageService';
import { MemoryStorageService } from '../implementations/storage/MemoryStorageService';
import { FileStorageService } from '../implementations/storage/FileStorageService';

// Cache implementation
import { MemoryCacheService } from '../implementations/MemoryCacheService';

// Socket client
import { socketService } from '../implementations/SocketService';

export interface ServiceFactoryConfig {
  token?: string;
  userId?: string;
  enableLogging?: boolean;
  customImplementations?: {
    messageService?: IMessageService;
    conversationService?: IConversationService;
    userService?: IUserService;
    fileService?: IFileService;
    realtimeService?: IRealtimeService;
    offlineQueueService?: IOfflineQueueService;
    storageService?: IStorageService;
    cacheService?: ICacheService;
  };
}

export class ServiceFactory {
  private static instances = new Map<string, any>();
  private static config: ServiceFactoryConfig = {};
  private static apiClients = new Map<string, BaseApiClient>();
  private static isConfigured: boolean = false;
  
  /**
   * Configure the factory with user-specific settings
   */
  static configure(config: ServiceFactoryConfig): void {
    this.config = { ...this.config, ...config };
    this.isConfigured = true;
    
    // Clear API clients if token changes
    if (config.token && this.config.token !== config.token) {
      logger.info('Token changed, clearing API clients cache');
      this.apiClients.clear();
    }
    
    logger.debug('ServiceFactory configured', {
      hasToken: !!config.token,
      userId: config.userId,
      enableLogging: config.enableLogging
    });
  }

  /**
   * Ensure factory is configured with defaults if needed
   */
  private static ensureConfigured(): void {
    if (!this.isConfigured) {
      this.configure({
        enableLogging: AppConfig.debug.enabled
      });
      logger.debug('ServiceFactory auto-configured with defaults');
    }
  }

  /**
   * Create Message Service based on AppConfig.service.type
   */
  static createMessageService(config?: ServiceFactoryConfig): IMessageService {
    this.ensureConfigured();
    const mergedConfig = { ...this.config, ...config };
    
    // Check for custom implementation
    if (mergedConfig.customImplementations?.messageService) {
      logger.debug('Using custom message service implementation');
      return mergedConfig.customImplementations.messageService;
    }
    
    const serviceType = AppConfig.service.type;
    const cacheKey = `message-${serviceType}`;
    
    // Return cached instance if exists
    if (this.instances.has(cacheKey)) {
      logger.debug('Returning cached message service', { serviceType });
      return this.instances.get(cacheKey);
    }
    
    logger.info('Creating message service', { serviceType });
    let service: IMessageService;
    
    switch (serviceType) {
      case 'rest':
        service = new RestMessageService(
          this.createApiClient('chat'),
          this.createCacheService(mergedConfig),
          mergedConfig.userId || ''
        );
        break;
        
      case 'socket':
        service = new SocketMessageService(
          socketService,
          this.createCacheService(mergedConfig),
          mergedConfig.userId || ''
        );
        break;
        
      case 'hybrid':
      case 'offline-first':
        service = new HybridMessageService(
          this.createApiClient('chat'),
          socketService,
          this.createCacheService(mergedConfig),
          this.createOfflineQueueService(mergedConfig),
          () => socketService.getConnectionStateEnum(),
          mergedConfig.userId || ''
        );
        break;
        
      default:
        logger.warn(`Unknown service type: ${serviceType}, defaulting to REST`);
        service = new RestMessageService(
          this.createApiClient('chat'),
          this.createCacheService(mergedConfig),
          mergedConfig.userId || ''
        );
    }
    
    this.instances.set(cacheKey, service);
    return service;
  }

  /**
   * Create Conversation Service
   */
  static createConversationService(config?: ServiceFactoryConfig): IConversationService {
    this.ensureConfigured();
    const mergedConfig = { ...this.config, ...config };
    
    if (mergedConfig.customImplementations?.conversationService) {
      logger.debug('Using custom conversation service implementation');
      return mergedConfig.customImplementations.conversationService;
    }
    
    const cacheKey = 'conversation-service';
    
    if (this.instances.has(cacheKey)) {
      logger.debug('Returning cached conversation service');
      return this.instances.get(cacheKey);
    }
    
    logger.info('Creating conversation service');
    const service = new RestConversationService(
      this.createApiClient('chat'),
      this.createCacheService(mergedConfig),
      mergedConfig.userId || ''
    );
    
    this.instances.set(cacheKey, service);
    return service;
  }

  /**
   * Create User Service
   */
  static createUserService(config?: ServiceFactoryConfig): IUserService {
    this.ensureConfigured();
    const mergedConfig = { ...this.config, ...config };
    
    if (mergedConfig.customImplementations?.userService) {
      logger.debug('Using custom user service implementation');
      return mergedConfig.customImplementations.userService;
    }
    
    const cacheKey = 'user-service';
    
    if (this.instances.has(cacheKey)) {
      logger.debug('Returning cached user service');
      return this.instances.get(cacheKey);
    }
    
    logger.info('Creating user service');
    const service = new RestUserService(
      this.createApiClient('chat'),
      this.createCacheService(mergedConfig),
      mergedConfig.userId || ''
    );
    
    this.instances.set(cacheKey, service);
    return service;
  }

  /**
   * Create File Service
   */
  static createFileService(config?: ServiceFactoryConfig): IFileService {
    this.ensureConfigured();
    const mergedConfig = { ...this.config, ...config };
    
    if (mergedConfig.customImplementations?.fileService) {
      logger.debug('Using custom file service implementation');
      return mergedConfig.customImplementations.fileService;
    }
    
    const cacheKey = 'file-service';
    
    if (this.instances.has(cacheKey)) {
      logger.debug('Returning cached file service');
      return this.instances.get(cacheKey);
    }
    
    logger.info('Creating file service');
    const service = new RestFileService(
      this.createApiClient('chat'),
      mergedConfig.userId || ''
    );
    
    this.instances.set(cacheKey, service);
    return service;
  }

  /**
   * Create Realtime Service
   */
  static createRealtimeService(config?: ServiceFactoryConfig): IRealtimeService {
    this.ensureConfigured();
    const mergedConfig = { ...this.config, ...config };
    
    if (mergedConfig.customImplementations?.realtimeService) {
      logger.debug('Using custom realtime service implementation');
      return mergedConfig.customImplementations.realtimeService;
    }
    
    const cacheKey = 'realtime-service';
    
    if (this.instances.has(cacheKey)) {
      logger.debug('Returning cached realtime service');
      return this.instances.get(cacheKey);
    }
    
    logger.info('Creating realtime service (using socketService)');
    // For now, use the existing socketService singleton
    this.instances.set(cacheKey, socketService);
    return socketService;
  }

  /**
   * Create Offline Queue Service
   */
  static createOfflineQueueService(config?: ServiceFactoryConfig): IOfflineQueueService {
    this.ensureConfigured();
    const mergedConfig = { ...this.config, ...config };
    
    if (mergedConfig.customImplementations?.offlineQueueService) {
      logger.debug('Using custom offline queue service implementation');
      return mergedConfig.customImplementations.offlineQueueService;
    }
    
    const cacheKey = 'offline-queue-service';
    
    if (this.instances.has(cacheKey)) {
      logger.debug('Returning cached offline queue service');
      return this.instances.get(cacheKey);
    }
    
    logger.info('Creating offline queue service');
    const service = new OfflineQueueService(
      this.createStorageService(mergedConfig)
    );
    
    this.instances.set(cacheKey, service);
    return service;
  }

  /**
   * Create Storage Service based on AppConfig.storage.type
   */
  static createStorageService(config?: ServiceFactoryConfig): IStorageService {
    this.ensureConfigured();
    const mergedConfig = { ...this.config, ...config };
    
    if (mergedConfig.customImplementations?.storageService) {
      logger.debug('Using custom storage service implementation');
      return mergedConfig.customImplementations.storageService;
    }
    
    const storageType = AppConfig.storage.type;
    const cacheKey = `storage-${storageType}`;
    
    if (this.instances.has(cacheKey)) {
      logger.debug('Returning cached storage service', { storageType });
      return this.instances.get(cacheKey);
    }
    
    logger.info('Creating storage service', { storageType });
    let service: IStorageService;
    
    switch (storageType) {
      case 'async-storage':
        service = new AsyncStorageService({
          keyPrefix: AppConfig.storage.keyPrefix,
          enableEncryption: AppConfig.storage.enableEncryption
        });
        break;
        
      case 'localstorage':
        service = new LocalStorageService({
          keyPrefix: AppConfig.storage.keyPrefix
        });
        break;
        
      case 'file':
        service = new FileStorageService({
          dataPath: AppConfig.storage.dataPath,
          keyPrefix: AppConfig.storage.keyPrefix
        });
        break;
        
      case 'memory':
      default:
        service = new MemoryStorageService({
          keyPrefix: AppConfig.storage.keyPrefix,
          maxSize: AppConfig.storage.maxMemorySize
        });
    }
    
    this.instances.set(cacheKey, service);
    return service;
  }

  /**
   * Create Cache Service
   */
  static createCacheService(config?: ServiceFactoryConfig): ICacheService {
    this.ensureConfigured();
    const mergedConfig = { ...this.config, ...config };
    
    if (mergedConfig.customImplementations?.cacheService) {
      logger.debug('Using custom cache service implementation');
      return mergedConfig.customImplementations.cacheService;
    }
    
    const cacheKey = 'cache-service';
    
    if (this.instances.has(cacheKey)) {
      logger.debug('Returning cached cache service');
      return this.instances.get(cacheKey);
    }
    
    logger.info('Creating cache service');
    const service = new MemoryCacheService();
    
    this.instances.set(cacheKey, service);
    return service;
  }

  /**
   * Create API Client based on type
   */
  private static createApiClient(clientType: 'default' | 'chat' | 'notification' = 'chat'): BaseApiClient {
    const cacheKey = `api-client-${clientType}`;
    
    if (this.apiClients.has(cacheKey)) {
      const client = this.apiClients.get(cacheKey)!;
      // Update token if changed
      if (this.config.token && this.config.token !== client['token']) {
        logger.debug('Updating API client token', { clientType });
        client.setToken(this.config.token);
      }
      return client;
    }
    
    let baseUrl: string;
    let timeout: number;
    
    switch (clientType) {
      case 'chat':
        baseUrl = AppConfig.urls.chat;
        timeout = AppConfig.chat.timeout;
        break;
      case 'notification':
        baseUrl = AppConfig.notification.baseUrl;
        timeout = AppConfig.notification.timeout;
        break;
      default:
        baseUrl = AppConfig.urls.api;
        timeout = AppConfig.api.timeout;
    }
    
    logger.info('Creating API client', { clientType, baseUrl });
    
    const client = new BaseApiClient({
      baseUrl,
      token: this.config.token,
      timeout,
      headers: AppConfig.api.headers,
      retries: AppConfig.api.retries,
      retryDelay: AppConfig.api.retryDelay,
      enableExponentialBackoff: AppConfig.api.enableExponentialBackoff,
      maxRetryDelay: AppConfig.api.maxRetryDelay,
      enableLogging: this.config.enableLogging ?? AppConfig.debug.enabled,
      enableCompression: AppConfig.performance.enableDataCompression,
      clientType
    });
    
    this.apiClients.set(cacheKey, client);
    return client;
  }

  /**
   * Create all services at once
   */
  static createAllServices(config?: ServiceFactoryConfig): {
    messageService: IMessageService;
    conversationService: IConversationService;
    userService: IUserService;
    fileService: IFileService;
    realtimeService: IRealtimeService;
    offlineQueueService: IOfflineQueueService;
    storageService: IStorageService;
    cacheService: ICacheService;
  } {
    logger.info('Creating all services');
    
    return {
      messageService: this.createMessageService(config),
      conversationService: this.createConversationService(config),
      userService: this.createUserService(config),
      fileService: this.createFileService(config),
      realtimeService: this.createRealtimeService(config),
      offlineQueueService: this.createOfflineQueueService(config),
      storageService: this.createStorageService(config),
      cacheService: this.createCacheService(config)
    };
  }

  /**
   * Update token for all API clients
   */
  static updateToken(newToken: string): void {
    logger.info('Updating token for all API clients');
    
    // Update config
    this.config.token = newToken;
    
    // Update all existing API clients
    for (const [key, client] of this.apiClients.entries()) {
      logger.debug(`Updating token for ${key}`);
      client.setToken(newToken);
    }
  }

  /**
   * Clear all cached instances
   */
  static clearInstances(): void {
    logger.info('Clearing all service instances');
    
    // Disconnect socket clients before clearing
    const realtimeService = this.instances.get('realtime-service');
    if (realtimeService) {
      logger.debug('Disconnecting realtime service');
      realtimeService.disconnect();
    }
    
    this.instances.clear();
    this.apiClients.clear();
    this.isConfigured = false;
    this.config = {};
    
    logger.info('All service instances cleared');
  }

  /**
   * Get service statistics
   */
  static getServiceStats(): {
    instances: number;
    apiClients: number;
    services: string[];
    config: {
      hasToken: boolean;
      userId?: string;
      platform: string;
      serviceType: string;
      storageType: string;
    };
  } {
    return {
      instances: this.instances.size,
      apiClients: this.apiClients.size,
      services: Array.from(this.instances.keys()),
      config: {
        hasToken: !!this.config.token,
        userId: this.config.userId,
        platform: AppConfig.platform.OS,
        serviceType: AppConfig.service.type,
        storageType: AppConfig.storage.type
      }
    };
  }

  /**
   * Check if a service exists in cache
   */
  static hasService(serviceName: string): boolean {
    return this.instances.has(serviceName);
  }

  /**
   * Get a specific service instance if it exists
   */
  static getService<T>(serviceName: string): T | undefined {
    return this.instances.get(serviceName) as T;
  }

  /**
   * Remove a specific service from cache
   */
  static removeService(serviceName: string): void {
    if (this.instances.has(serviceName)) {
      logger.debug(`Removing service: ${serviceName}`);
      
      // Special cleanup for realtime service
      if (serviceName === 'realtime-service') {
        const service = this.instances.get(serviceName);
        if (service && typeof service.disconnect === 'function') {
          service.disconnect();
        }
      }
      
      this.instances.delete(serviceName);
    }
  }

  /**
   * Reset factory to initial state
   */
  static reset(): void {
    logger.info('Resetting ServiceFactory to initial state');
    this.clearInstances();
  }
}