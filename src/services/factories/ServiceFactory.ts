// src/services/factories/ServiceFactory.ts - Updated Service creation factory

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

import { 
  Platform, 
  ServiceType, 
  ModularConfig,
  PlatformDetector 
} from '../../config/PlatformConfig';

// Import the new merged BaseApiClient
import { BaseApiClient, BaseApiClientConfig } from '../api/base/BaseApiClient';

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

// Socket client (still needed for socket-based services)
import { socketService } from '../SocketService';
import { ConnectionState } from '../../types/chat';

export interface ServiceFactoryConfig {
  platform?: Platform;
  serviceType?: ServiceType;
  apiUrl?: string;
  socketUrl?: string;
  chatUrl?: string;
  notificationUrl?: string;
  token?: string;
  userId?: string;
  enableLogging?: boolean;
  enableCompression?: boolean;
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
  
  // Configure the factory
  static configure(config: ServiceFactoryConfig): void {
    this.config = { ...this.config, ...config };
    
    // Clear api clients if token changes
    if (config.token) {
      this.apiClients.clear();
    }
  }

  // Create Message Service based on platform and service type
  static createMessageService(config?: ServiceFactoryConfig): IMessageService {
    const mergedConfig = { ...this.config, ...config };
    
    // Check for custom implementation
    if (mergedConfig.customImplementations?.messageService) {
      return mergedConfig.customImplementations.messageService;
    }
    
    const platform = mergedConfig.platform || PlatformDetector.detect();
    const serviceType = mergedConfig.serviceType || ModularConfig.getInstance().getServiceType();
    const cacheKey = `message-${platform}-${serviceType}`;
    
    // Return cached instance if exists
    if (this.instances.has(cacheKey)) {
      return this.instances.get(cacheKey);
    }
    
    let service: IMessageService;
    
    switch (serviceType) {
      case 'rest':
        service = new RestMessageService(
          this.createApiClient(mergedConfig, 'chat'),
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
          this.createApiClient(mergedConfig, 'chat'),
          socketService,
          this.createCacheService(mergedConfig),
          this.createOfflineQueueService(mergedConfig),
          () => socketService.getConnectionState(),
          mergedConfig.userId || ''
        );
        break;
        
      default:
        // Default to REST
        service = new RestMessageService(
          this.createApiClient(mergedConfig, 'chat'),
          this.createCacheService(mergedConfig),
          mergedConfig.userId || ''
        );
    }
    
    this.instances.set(cacheKey, service);
    return service;
  }

  // Create Conversation Service
  static createConversationService(config?: ServiceFactoryConfig): IConversationService {
    const mergedConfig = { ...this.config, ...config };
    
    if (mergedConfig.customImplementations?.conversationService) {
      return mergedConfig.customImplementations.conversationService;
    }
    
    const cacheKey = 'conversation-service';
    
    if (this.instances.has(cacheKey)) {
      return this.instances.get(cacheKey);
    }
    
    const service = new RestConversationService(
      this.createApiClient(mergedConfig, 'chat'),
      this.createCacheService(mergedConfig),
      mergedConfig.userId || ''
    );
    
    this.instances.set(cacheKey, service);
    return service;
  }

  // Create User Service
  static createUserService(config?: ServiceFactoryConfig): IUserService {
    const mergedConfig = { ...this.config, ...config };
    
    if (mergedConfig.customImplementations?.userService) {
      return mergedConfig.customImplementations.userService;
    }
    
    const cacheKey = 'user-service';
    
    if (this.instances.has(cacheKey)) {
      return this.instances.get(cacheKey);
    }
    
    const service = new RestUserService(
      this.createApiClient(mergedConfig, 'chat'),
      this.createCacheService(mergedConfig),
      mergedConfig.userId || ''
    );
    
    this.instances.set(cacheKey, service);
    return service;
  }

  // Create File Service
  static createFileService(config?: ServiceFactoryConfig): IFileService {
    const mergedConfig = { ...this.config, ...config };
    
    if (mergedConfig.customImplementations?.fileService) {
      return mergedConfig.customImplementations.fileService;
    }
    
    const cacheKey = 'file-service';
    
    if (this.instances.has(cacheKey)) {
      return this.instances.get(cacheKey);
    }
    
    const service = new RestFileService(
      this.createApiClient(mergedConfig, 'chat'),
      mergedConfig.userId || ''
    );
    
    this.instances.set(cacheKey, service);
    return service;
  }

  // Create Realtime Service
  static createRealtimeService(config?: ServiceFactoryConfig): IRealtimeService {
    const mergedConfig = { ...this.config, ...config };
    
    if (mergedConfig.customImplementations?.realtimeService) {
      return mergedConfig.customImplementations.realtimeService;
    }
    
    const cacheKey = 'realtime-service';
    
    if (this.instances.has(cacheKey)) {
      return this.instances.get(cacheKey);
    }
    
    // For now, use the existing socketService singleton
    // In future, could create SocketRealtimeService wrapper
    this.instances.set(cacheKey, socketService);
    return socketService;
  }

  // Create Offline Queue Service
  static createOfflineQueueService(config?: ServiceFactoryConfig): IOfflineQueueService {
    const mergedConfig = { ...this.config, ...config };
    
    if (mergedConfig.customImplementations?.offlineQueueService) {
      return mergedConfig.customImplementations.offlineQueueService;
    }
    
    const cacheKey = 'offline-queue-service';
    
    if (this.instances.has(cacheKey)) {
      return this.instances.get(cacheKey);
    }
    
    const service = new OfflineQueueService(
      this.createStorageService(mergedConfig)
    );
    
    this.instances.set(cacheKey, service);
    return service;
  }

  // Create Storage Service based on platform
  static createStorageService(config?: ServiceFactoryConfig): IStorageService {
    const mergedConfig = { ...this.config, ...config };
    
    if (mergedConfig.customImplementations?.storageService) {
      return mergedConfig.customImplementations.storageService;
    }
    
    const platform = mergedConfig.platform || PlatformDetector.detect();
    const cacheKey = `storage-${platform}`;
    
    if (this.instances.has(cacheKey)) {
      return this.instances.get(cacheKey);
    }
    
    let service: IStorageService;
    
    switch (platform) {
      case 'react-native':
        service = new AsyncStorageService();
        break;
        
      case 'browser':
        service = new LocalStorageService();
        break;
        
      case 'node-cli':
        service = new FileStorageService({
          dataPath: process.env.STORAGE_PATH || './chat-data'
        });
        break;
        
      default:
        service = new MemoryStorageService();
    }
    
    this.instances.set(cacheKey, service);
    return service;
  }

  // Create Cache Service
  static createCacheService(config?: ServiceFactoryConfig): ICacheService {
    const mergedConfig = { ...this.config, ...config };
    
    if (mergedConfig.customImplementations?.cacheService) {
      return mergedConfig.customImplementations.cacheService;
    }
    
    const cacheKey = 'cache-service';
    
    if (this.instances.has(cacheKey)) {
      return this.instances.get(cacheKey);
    }
    
    const service = new MemoryCacheService();
    
    this.instances.set(cacheKey, service);
    return service;
  }

  // Create API Client with the new BaseApiClient
  private static createApiClient(
    config: ServiceFactoryConfig, 
    clientType: 'default' | 'chat' | 'notification' | 'formdata' | 'otp' = 'default'
  ): BaseApiClient {
    const cacheKey = `api-client-${clientType}`;
    
    if (this.apiClients.has(cacheKey)) {
      const client = this.apiClients.get(cacheKey)!;
      // Update token if changed
      if (config.token && config.token !== client['token']) {
        client.setToken(config.token);
      }
      return client;
    }
    
    const modularConfig = ModularConfig.getInstance();
    
    let baseUrl: string;
    let timeout: number;
    
    switch (clientType) {
      case 'chat':
        baseUrl = config.chatUrl || modularConfig.serviceConfig.apiUrl;
        timeout = 30000;
        break;
      case 'notification':
        baseUrl = config.notificationUrl || modularConfig.serviceConfig.apiUrl;
        timeout = 30000;
        break;
      default:
        baseUrl = config.apiUrl || modularConfig.serviceConfig.apiUrl;
        timeout = modularConfig.serviceConfig.timeout;
    }
    
    const clientConfig: BaseApiClientConfig = {
      baseUrl,
      token: config.token,
      timeout,
      headers: modularConfig.serviceConfig.headers,
      enableLogging: config.enableLogging,
      enableCompression: config.enableCompression,
      clientType,
      retries: modularConfig.serviceConfig.retries || 3,
      retryDelay: 2000
    };
    
    const client = new BaseApiClient(clientConfig);
    this.apiClients.set(cacheKey, client);
    
    return client;
  }

  // Clear all cached instances
  static clearInstances(): void {
    // Disconnect socket clients before clearing
    const realtimeService = this.instances.get('realtime-service');
    if (realtimeService) {
      realtimeService.disconnect();
    }
    
    this.instances.clear();
    this.apiClients.clear();
  }

  // Create all services at once
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

  // Update all API client tokens
  static updateToken(newToken: string): void {
    // Update config
    this.config.token = newToken;
    
    // Update all existing API clients
    for (const client of this.apiClients.values()) {
      client.setToken(newToken);
    }
  }

  // Get service statistics
  static getServiceStats(): {
    instances: number;
    apiClients: number;
    config: ServiceFactoryConfig;
  } {
    return {
      instances: this.instances.size,
      apiClients: this.apiClients.size,
      config: this.config
    };
  }
}