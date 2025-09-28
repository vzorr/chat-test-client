// src/services/implementations/storage/index.ts

// Export all storage service implementations
export { AsyncStorageService } from './AsyncStorageService';
export { LocalStorageService } from './LocalStorageService';
export { MemoryStorageService } from './MemoryStorageService';
export { FileStorageService } from './FileStorageService';

// Import all services for factory function
import { AsyncStorageService } from './AsyncStorageService';
import { LocalStorageService } from './LocalStorageService';
import { MemoryStorageService } from './MemoryStorageService';
import { FileStorageService } from './FileStorageService';
import type { IStorageService } from '../../interfaces';

/**
 * Platform detection type
 */
export type StoragePlatform = 'react-native' | 'browser' | 'node' | 'memory';

/**
 * Union type of all storage services
 */
export type StorageServiceType = AsyncStorageService | LocalStorageService | MemoryStorageService | FileStorageService;

/**
 * Configuration options for storage services
 */
export interface StorageConfig {
  platform?: StoragePlatform;
  keyPrefix?: string;
  enableEncryption?: boolean;
  maxSize?: number;
  dataPath?: string;
  prettyPrint?: boolean;
}

/**
 * Factory function to create appropriate storage service based on environment
 */
export function createStorageService(config?: StorageConfig): IStorageService {
  const platform = config?.platform || detectPlatform();
  
  switch (platform) {
    case 'react-native':
      return new AsyncStorageService({
        keyPrefix: config?.keyPrefix,
        enableEncryption: config?.enableEncryption
      });
      
    case 'browser':
      return new LocalStorageService({
        keyPrefix: config?.keyPrefix
      });
      
    case 'node':
      return new FileStorageService({
        dataPath: config?.dataPath,
        keyPrefix: config?.keyPrefix,
        prettyPrint: config?.prettyPrint
      });
      
    case 'memory':
    default:
      return new MemoryStorageService({
        keyPrefix: config?.keyPrefix,
        maxSize: config?.maxSize
      });
  }
}

/**
 * Auto-detect the current platform
 */
export function detectPlatform(): StoragePlatform {
  // Check for React Native
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    return 'react-native';
  }
  
  // Check for browser environment
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    return 'browser';
  }
  
  // Check for Node.js environment with file system access
  if (typeof process !== 'undefined' && typeof require !== 'undefined') {
    try {
      // Try to access fs module to confirm Node.js
      require('fs');
      return 'node';
    } catch {
      // Fall back to memory if fs is not available
      return 'memory';
    }
  }
  
  // Default fallback
  return 'memory';
}

/**
 * Get platform information
 */
export function getPlatformInfo(): {
  platform: StoragePlatform;
  isReactNative: boolean;
  isBrowser: boolean;
  isNode: boolean;
  isMemoryOnly: boolean;
  features: {
    persistentStorage: boolean;
    fileSystemAccess: boolean;
    quotaManagement: boolean;
    encryption: boolean;
  };
} {
  const platform = detectPlatform();
  
  return {
    platform,
    isReactNative: platform === 'react-native',
    isBrowser: platform === 'browser',
    isNode: platform === 'node',
    isMemoryOnly: platform === 'memory',
    features: {
      persistentStorage: platform !== 'memory',
      fileSystemAccess: platform === 'node',
      quotaManagement: platform === 'browser',
      encryption: platform === 'react-native'
    }
  };
}

/**
 * Create storage service with automatic fallback
 * Falls back to memory storage if preferred platform is not available
 */
export function createStorageServiceWithFallback(
  preferredPlatform: StoragePlatform,
  config?: Omit<StorageConfig, 'platform'>
): IStorageService {
  try {
    return createStorageService({
      ...config,
      platform: preferredPlatform
    });
  } catch (error) {
    console.warn(`Failed to create ${preferredPlatform} storage, falling back to memory:`, error);
    return createStorageService({
      ...config,
      platform: 'memory'
    });
  }
}

/**
 * Validate storage service configuration
 */
export function validateStorageConfig(config: StorageConfig): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Validate platform
  if (config.platform && !['react-native', 'browser', 'node', 'memory'].includes(config.platform)) {
    errors.push(`Invalid platform: ${config.platform}`);
  }
  
  // Validate key prefix
  if (config.keyPrefix && typeof config.keyPrefix !== 'string') {
    errors.push('keyPrefix must be a string');
  }
  
  if (config.keyPrefix && config.keyPrefix.length === 0) {
    warnings.push('Empty keyPrefix may cause naming conflicts');
  }
  
  // Validate max size
  if (config.maxSize && (typeof config.maxSize !== 'number' || config.maxSize <= 0)) {
    errors.push('maxSize must be a positive number');
  }
  
  // Validate data path for Node.js
  if (config.platform === 'node' && config.dataPath && typeof config.dataPath !== 'string') {
    errors.push('dataPath must be a string for Node.js platform');
  }
  
  // Platform-specific validations
  if (config.platform === 'browser' && config.enableEncryption) {
    warnings.push('Encryption is not supported in browser localStorage');
  }
  
  if (config.platform === 'memory' && config.dataPath) {
    warnings.push('dataPath is ignored for memory storage');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Migrate data between storage services
 */
export async function migrateStorage(
  fromService: IStorageService,
  toService: IStorageService,
  options?: {
    clearSource?: boolean;
    keyFilter?: (key: string) => boolean;
    valueTransform?: (key: string, value: any) => any;
  }
): Promise<{
  migrated: number;
  skipped: number;
  errors: Array<{ key: string; error: string }>;
}> {
  const result = {
    migrated: 0,
    skipped: 0,
    errors: [] as Array<{ key: string; error: string }>
  };
  
  try {
    // Get all keys from source
    const allKeys = await fromService.getAllKeys();
    
    for (const key of allKeys) {
      try {
        // Apply key filter if provided
        if (options?.keyFilter && !options.keyFilter(key)) {
          result.skipped++;
          continue;
        }
        
        // Get value from source
        const value = await fromService.get(key);
        if (value === null) {
          result.skipped++;
          continue;
        }
        
        // Transform value if transformer provided
        const finalValue = options?.valueTransform 
          ? options.valueTransform(key, value)
          : value;
        
        // Set in destination
        await toService.set(key, finalValue);
        result.migrated++;
        
        // Remove from source if requested
        if (options?.clearSource) {
          await fromService.remove(key);
        }
        
      } catch (error) {
        result.errors.push({
          key,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
  } catch (error) {
    result.errors.push({
      key: '__migration__',
      error: error instanceof Error ? error.message : String(error)
    });
  }
  
  return result;
}

/**
 * Test storage service functionality
 */
export async function testStorageService(service: IStorageService): Promise<{
  passed: boolean;
  results: Record<string, boolean>;
  errors: string[];
}> {
  const results: Record<string, boolean> = {};
  const errors: string[] = [];
  
  const testKey = '__storage_test__';
  const testValue = { test: true, timestamp: Date.now() };
  
  try {
    // Test set
    await service.set(testKey, testValue);
    results.set = true;
  } catch (error) {
    results.set = false;
    errors.push(`Set failed: ${error}`);
  }
  
  try {
    // Test get
    const retrieved = await service.get(testKey);
    results.get = JSON.stringify(retrieved) === JSON.stringify(testValue);
    if (!results.get) {
      errors.push('Retrieved value does not match stored value');
    }
  } catch (error) {
    results.get = false;
    errors.push(`Get failed: ${error}`);
  }
  
  try {
    // Test remove
    await service.remove(testKey);
    const afterRemove = await service.get(testKey);
    results.remove = afterRemove === null;
    if (!results.remove) {
      errors.push('Value still exists after removal');
    }
  } catch (error) {
    results.remove = false;
    errors.push(`Remove failed: ${error}`);
  }
  
  try {
    // Test multiSet and multiGet
    const multiData = new Map([
      ['test1', { id: 1 }],
      ['test2', { id: 2 }]
    ]);
    
    await service.multiSet(multiData);
    const retrieved = await service.multiGet(['test1', 'test2']);
    
    results.multiOperations = retrieved.size === 2 && 
      JSON.stringify(retrieved.get('test1')) === JSON.stringify({ id: 1 }) &&
      JSON.stringify(retrieved.get('test2')) === JSON.stringify({ id: 2 });
    
    // Cleanup
    await service.multiRemove(['test1', 'test2']);
    
  } catch (error) {
    results.multiOperations = false;
    errors.push(`Multi operations failed: ${error}`);
  }
  
  const passed = Object.values(results).every(result => result === true);
  
  return { passed, results, errors };
}

// Default export for convenience
export default {
  createStorageService,
  detectPlatform,
  getPlatformInfo,
  createStorageServiceWithFallback,
  validateStorageConfig,
  migrateStorage,
  testStorageService,
  AsyncStorageService,
  LocalStorageService,
  MemoryStorageService,
  FileStorageService
};