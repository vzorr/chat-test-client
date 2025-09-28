// src/config/PlatformConfig.ts - Platform detection and configuration
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Platform types
export type Platform = 'react-native' | 'browser' | 'node-cli' | 'unknown';
export type ServiceType = 'rest' | 'socket' | 'hybrid' | 'offline-first';
export type StorageType = 'async-storage' | 'localstorage' | 'memory' | 'file' | 'indexed-db';
export type StoreType = 'redux' | 'zustand' | 'mobx' | 'memory' | 'none';

// Platform detection
export class PlatformDetector {
  static detect(): Platform {
    // Check for explicit platform in env
    const envPlatform = process.env.PLATFORM;
    if (envPlatform && envPlatform !== 'auto') {
      return envPlatform as Platform;
    }

    // Auto-detect platform
    if (typeof window !== 'undefined') {
      // Browser environment
      if (typeof (window as any).ReactNativeWebView !== 'undefined') {
        return 'react-native';
      }
      return 'browser';
    } else if (typeof global !== 'undefined') {
      // Node.js environment
      if (process.env.REACT_NATIVE_ENV === 'true') {
        return 'react-native';
      }
      return 'node-cli';
    }
    
    return 'unknown';
  }

  static isReactNative(): boolean {
    return this.detect() === 'react-native';
  }

  static isBrowser(): boolean {
    return this.detect() === 'browser';
  }

  static isNodeCLI(): boolean {
    return this.detect() === 'node-cli';
  }
}

// Platform-specific configuration
export interface PlatformSpecificConfig {
  storage: {
    type: StorageType;
    options?: any;
  };
  store: {
    type: StoreType;
    persist: boolean;
    options?: any;
  };
  service: {
    type: ServiceType;
    enableOffline: boolean;
    queueStrategy: 'immediate' | 'batch' | 'scheduled';
  };
  features: {
    pushNotifications: boolean;
    backgroundSync: boolean;
    biometricAuth: boolean;
    fileAccess: boolean;
    camera: boolean;
  };
}

// Platform configuration factory
export class PlatformConfigFactory {
  static getConfig(platform?: Platform): PlatformSpecificConfig {
    const detectedPlatform = platform || PlatformDetector.detect();
    
    switch (detectedPlatform) {
      case 'react-native':
        return this.getReactNativeConfig();
      
      case 'browser':
        return this.getBrowserConfig();
      
      case 'node-cli':
        return this.getNodeCLIConfig();
      
      default:
        return this.getDefaultConfig();
    }
  }

  private static getReactNativeConfig(): PlatformSpecificConfig {
    return {
      storage: {
        type: (process.env.STORAGE_TYPE as StorageType) || 'async-storage',
        options: {
          keyPrefix: '@MyUsta:',
          encryptionKey: process.env.STORAGE_ENCRYPTION_KEY
        }
      },
      store: {
        type: (process.env.STORE_TYPE as StoreType) || 'redux',
        persist: process.env.STORE_PERSIST !== 'false',
        options: {
          persistKey: 'chat-store',
          whitelist: ['messages', 'conversations']
        }
      },
      service: {
        type: (process.env.SERVICE_TYPE as ServiceType) || 'hybrid',
        enableOffline: process.env.ENABLE_OFFLINE_MODE !== 'false',
        queueStrategy: 'batch'
      },
      features: {
        pushNotifications: process.env.ENABLE_PUSH_NOTIFICATIONS !== 'false',
        backgroundSync: process.env.ENABLE_BACKGROUND_SYNC !== 'false',
        biometricAuth: process.env.ENABLE_BIOMETRIC_AUTH === 'true',
        fileAccess: true,
        camera: true
      }
    };
  }

  private static getBrowserConfig(): PlatformSpecificConfig {
    return {
      storage: {
        type: (process.env.STORAGE_TYPE as StorageType) || 'localstorage',
        options: {
          keyPrefix: 'myusta_',
          fallbackToMemory: true,
          useIndexedDB: process.env.ENABLE_INDEXED_DB === 'true'
        }
      },
      store: {
        type: (process.env.STORE_TYPE as StoreType) || 'zustand',
        persist: process.env.STORE_PERSIST !== 'false',
        options: {
          persistKey: 'chat-store',
          version: 1
        }
      },
      service: {
        type: (process.env.SERVICE_TYPE as ServiceType) || 'hybrid',
        enableOffline: process.env.ENABLE_OFFLINE_MODE === 'true',
        queueStrategy: 'immediate'
      },
      features: {
        pushNotifications: process.env.ENABLE_WEB_PUSH === 'true',
        backgroundSync: process.env.ENABLE_SERVICE_WORKER === 'true',
        biometricAuth: false,
        fileAccess: true,
        camera: navigator?.mediaDevices !== undefined
      }
    };
  }

  private static getNodeCLIConfig(): PlatformSpecificConfig {
    return {
      storage: {
        type: (process.env.STORAGE_TYPE as StorageType) || 'file',
        options: {
          dataPath: process.env.STORAGE_PATH || './chat-data',
          encoding: 'utf8',
          prettyPrint: process.env.NODE_ENV === 'development'
        }
      },
      store: {
        type: (process.env.STORE_TYPE as StoreType) || 'memory',
        persist: process.env.STORE_PERSIST === 'true',
        options: {
          maxMemory: '100MB'
        }
      },
      service: {
        type: (process.env.SERVICE_TYPE as ServiceType) || 'rest',
        enableOffline: false,
        queueStrategy: 'immediate'
      },
      features: {
        pushNotifications: false,
        backgroundSync: false,
        biometricAuth: false,
        fileAccess: true,
        camera: false
      }
    };
  }

  private static getDefaultConfig(): PlatformSpecificConfig {
    return {
      storage: {
        type: 'memory',
        options: {}
      },
      store: {
        type: 'memory',
        persist: false,
        options: {}
      },
      service: {
        type: 'rest',
        enableOffline: false,
        queueStrategy: 'immediate'
      },
      features: {
        pushNotifications: false,
        backgroundSync: false,
        biometricAuth: false,
        fileAccess: false,
        camera: false
      }
    };
  }
}

// Service configuration based on platform
export interface ServiceConfig {
  apiUrl: string;
  socketUrl: string;
  socketPath: string;
  timeout: number;
  retries: number;
  headers: Record<string, string>;
  transport: ServiceType;
  offlineConfig?: {
    enabled: boolean;
    queueSize: number;
    syncInterval: number;
    retryStrategy: 'exponential' | 'linear' | 'fixed';
  };
}

export class ServiceConfigFactory {
  static getConfig(platform?: Platform): ServiceConfig {
    const platformConfig = PlatformConfigFactory.getConfig(platform);
    const baseUrl = process.env.SERVER_URL || 'https://myusta.al';
    
    return {
      apiUrl: process.env.CHAT_API_URL || `${baseUrl}/chat-backend/api/v1/`,
      socketUrl: baseUrl,
      socketPath: process.env.SOCKET_PATH || '/chat-backend/socket.io/',
      timeout: parseInt(process.env.SOCKET_TIMEOUT || '30000'),
      retries: parseInt(process.env.MAX_RETRIES || '3'),
      headers: {
        'Content-Type': 'application/json',
        'X-Platform': PlatformDetector.detect(),
        'X-App-Version': process.env.APP_VERSION || '1.0.0'
      },
      transport: platformConfig.service.type,
      offlineConfig: platformConfig.service.enableOffline ? {
        enabled: true,
        queueSize: 100,
        syncInterval: 30000,
        retryStrategy: 'exponential'
      } : undefined
    };
  }
}

// Export combined configuration
export class ModularConfig {
  private static instance: ModularConfig;
  public readonly platform: Platform;
  public readonly platformConfig: PlatformSpecificConfig;
  public readonly serviceConfig: ServiceConfig;
  
  private constructor() {
    this.platform = PlatformDetector.detect();
    this.platformConfig = PlatformConfigFactory.getConfig(this.platform);
    this.serviceConfig = ServiceConfigFactory.getConfig(this.platform);
  }

  static getInstance(): ModularConfig {
    if (!this.instance) {
      this.instance = new ModularConfig();
    }
    return this.instance;
  }

  // Helper methods
  isOfflineEnabled(): boolean {
    return this.platformConfig.service.enableOffline;
  }

  getStorageType(): StorageType {
    return this.platformConfig.storage.type;
  }

  getStoreType(): StoreType {
    return this.platformConfig.store.type;
  }

  getServiceType(): ServiceType {
    return this.platformConfig.service.type;
  }

  // Feature checks
  canUsePushNotifications(): boolean {
    return this.platformConfig.features.pushNotifications;
  }

  canAccessFiles(): boolean {
    return this.platformConfig.features.fileAccess;
  }

  canUseCamera(): boolean {
    return this.platformConfig.features.camera;
  }

  // Debug info
  getDebugInfo(): any {
    return {
      platform: this.platform,
      storage: this.platformConfig.storage.type,
      store: this.platformConfig.store.type,
      service: this.platformConfig.service.type,
      offline: this.platformConfig.service.enableOffline,
      features: this.platformConfig.features
    };
  }
}

// Singleton export
export const modularConfig = ModularConfig.getInstance();