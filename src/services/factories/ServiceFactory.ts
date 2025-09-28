// src/services/factories/ServiceFactory.ts - Service creation factory

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

// Import implementations (these will be created separately)
import { RestMessageService } from '../implementations/rest/RestMessageService';
import { SocketMessageService } from '../implementations/socket/SocketMessageService';
import { HybridMessageService } from '../implementations/hybrid/HybridMessageService';
import { RestConversationService } from '../implementations/rest/RestConversationService';
import { RestUserService } from '../implementations/rest/RestUserService';
import { RestFileService } from '../implementations/rest/RestFileService';
import { SocketRealtimeService } from '../implementations/socket/SocketRealtimeService';
import { OfflineQueueService } from '../implementations/offline/OfflineQueueService';

// Storage implementations
import { AsyncStorageService } from '../implementations/storage/AsyncStorageService';
import { LocalStorageService } from '../implementations/storage/LocalStorageService';
import { MemoryStorageService } from '../implementations/storage/MemoryStorageService';
import { FileStorageService } from '../implementations/storage/FileStorageService';

// Cache implementation
import { MemoryCacheService } from '../implementations/cache/MemoryCacheService';

// API and Socket clients
import { ApiClient } from '../clients/ApiClient';
import { SocketClient } from '../clients/SocketClient';

export interface ServiceFactoryConfig {
  platform?: Platform;
  serviceType?: ServiceType;
  apiUrl?: string;
  socketUrl?: string;
  token?: string;
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
  
  // Configure the factory
  static configure(config: ServiceFactoryConfig): void {
    this.config = { ...this.config, ...config };
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
          this.createApiClient(mergedConfig),
          this.createCacheService(mergedConfig)
        );
        break;
        
      case 'socket':
        service = new SocketMessageService(
          this.createSocketClient(mergedConfig),
          this.createCacheService(mergedConfig)
        );
        break;
        
      case 'hybrid':
      case 'offline-first':
        service = new HybridMessageService(
          new RestMessageService(
            this.createApiClient(mergedConfig),
            this.createCacheService(mergedConfig)
          ),
          this.createRealtimeService(mergedConfig),
          this.createOfflineQueueService(mergedConfig)
        );
        break;
        
      default:
        // Default to REST
        service = new RestMessageService(
          this.createApiClient(mergedConfig),
          this.createCacheService(mergedConfig)
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
      this.createApiClient(mergedConfig),
      this.createCacheService(mergedConfig)
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
      this.createApiClient(mergedConfig),
      this.createCacheService(mergedConfig)
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
      this.createApiClient(mergedConfig)
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
    
    const service = new SocketRealtimeService(
      this.createSocketClient(mergedConfig)
    );
    
    this.instances.set(cacheKey, service);
    return service;
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
        service = new FileStorageService(
          process.env.STORAGE_PATH || './chat-data'
        );
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

  // Create API Client
  private static createApiClient(config: ServiceFactoryConfig): ApiClient {
    const cacheKey = 'api-client';
    
    if (this.instances.has(cacheKey)) {
      return this.instances.get(cacheKey);
    }
    
    const modularConfig = ModularConfig.getInstance();
    const client = new ApiClient({
      baseUrl: config.apiUrl || modularConfig.serviceConfig.apiUrl,
      timeout: modularConfig.serviceConfig.timeout,
      headers: modularConfig.serviceConfig.headers,
      enableLogging: config.enableLogging
    });
    
    if (config.token) {
      client.setToken(config.token);
    }
    
    this.instances.set(cacheKey, client);
    return client;
  }

  // Create Socket Client
  private static createSocketClient(config: ServiceFactoryConfig): SocketClient {
    const cacheKey = 'socket-client';
    
    if (this.instances.has(cacheKey)) {
      return this.instances.get(cacheKey);
    }
    
    const modularConfig = ModularConfig.getInstance();
    const client = new SocketClient({
      url: config.socketUrl || modularConfig.serviceConfig.socketUrl,
      path: modularConfig.serviceConfig.socketPath,
      enableLogging: config.enableLogging
    });
    
    this.instances.set(cacheKey, client);
    return client;
  }

  // Clear all cached instances
  static clearInstances(): void {
    // Disconnect socket clients before clearing
    const socketClient = this.instances.get('socket-client');
    if (socketClient) {
      socketClient.disconnect();
    }
    
    const realtimeService = this.instances.get('realtime-service');
    if (realtimeService) {
      realtimeService.disconnect();
    }
    
    this.instances.clear();
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
}