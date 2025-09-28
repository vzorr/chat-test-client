// src/services/implementations/storage/AsyncStorageService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IStorageService } from '../../interfaces';

export class AsyncStorageService implements IStorageService {
  private readonly keyPrefix: string;
  private readonly enableEncryption: boolean;
  
  constructor(config?: {
    keyPrefix?: string;
    enableEncryption?: boolean;
  }) {
    this.keyPrefix = config?.keyPrefix || '@MyUsta:';
    this.enableEncryption = config?.enableEncryption || false;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const fullKey = this.getFullKey(key);
      const value = await AsyncStorage.getItem(fullKey);
      
      if (value === null) {
        return null;
      }
      
      try {
        // Try to parse as JSON
        return JSON.parse(value) as T;
      } catch {
        // Return as string if not valid JSON
        return value as unknown as T;
      }
    } catch (error) {
      console.error(`Failed to get item ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      const fullKey = this.getFullKey(key);
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      
      await AsyncStorage.setItem(fullKey, serialized);
    } catch (error) {
      console.error(`Failed to set item ${key}:`, error);
      throw new Error(`Storage set failed: ${error}`);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const fullKey = this.getFullKey(key);
      await AsyncStorage.removeItem(fullKey);
    } catch (error) {
      console.error(`Failed to remove item ${key}:`, error);
      throw new Error(`Storage remove failed: ${error}`);
    }
  }

  async clear(): Promise<void> {
    try {
      // Get all keys with our prefix
      const allKeys = await AsyncStorage.getAllKeys();
      const ourKeys = allKeys.filter(key => key.startsWith(this.keyPrefix));
      
      if (ourKeys.length > 0) {
        await AsyncStorage.multiRemove(ourKeys);
      }
      
      console.log(`🗑️ Cleared ${ourKeys.length} items from storage`);
    } catch (error) {
      console.error('Failed to clear storage:', error);
      throw new Error(`Storage clear failed: ${error}`);
    }
  }

  async multiGet<T>(keys: string[]): Promise<Map<string, T>> {
    try {
      const fullKeys = keys.map(key => this.getFullKey(key));
      const results = await AsyncStorage.multiGet(fullKeys);
      
      const map = new Map<string, T>();
      
      for (const [fullKey, value] of results) {
        if (value !== null) {
          const key = this.getOriginalKey(fullKey);
          try {
            map.set(key, JSON.parse(value) as T);
          } catch {
            map.set(key, value as unknown as T);
          }
        }
      }
      
      return map;
    } catch (error) {
      console.error('Failed to multi-get items:', error);
      return new Map();
    }
  }

  async multiSet(items: Map<string, any>): Promise<void> {
    try {
      const pairs: Array<[string, string]> = [];
      
      for (const [key, value] of items.entries()) {
        const fullKey = this.getFullKey(key);
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        pairs.push([fullKey, serialized]);
      }
      
      await AsyncStorage.multiSet(pairs);
    } catch (error) {
      console.error('Failed to multi-set items:', error);
      throw new Error(`Storage multi-set failed: ${error}`);
    }
  }

  async multiRemove(keys: string[]): Promise<void> {
    try {
      const fullKeys = keys.map(key => this.getFullKey(key));
      await AsyncStorage.multiRemove(fullKeys);
    } catch (error) {
      console.error('Failed to multi-remove items:', error);
      throw new Error(`Storage multi-remove failed: ${error}`);
    }
  }

  async getAllKeys(): Promise<string[]> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      
      // Return only keys with our prefix, removing the prefix
      return allKeys
        .filter(key => key.startsWith(this.keyPrefix))
        .map(key => this.getOriginalKey(key));
    } catch (error) {
      console.error('Failed to get all keys:', error);
      return [];
    }
  }

  async getItemsByPrefix(prefix: string): Promise<Map<string, any>> {
    try {
      const searchPrefix = this.getFullKey(prefix);
      const allKeys = await AsyncStorage.getAllKeys();
      const matchingKeys = allKeys.filter(key => key.startsWith(searchPrefix));
      
      if (matchingKeys.length === 0) {
        return new Map();
      }
      
      const results = await AsyncStorage.multiGet(matchingKeys);
      const map = new Map<string, any>();
      
      for (const [fullKey, value] of results) {
        if (value !== null) {
          const key = this.getOriginalKey(fullKey);
          try {
            map.set(key, JSON.parse(value));
          } catch {
            map.set(key, value);
          }
        }
      }
      
      return map;
    } catch (error) {
      console.error('Failed to get items by prefix:', error);
      return new Map();
    }
  }

  // Additional utility methods specific to AsyncStorage
  
  async getStorageInfo(): Promise<{
    totalKeys: number;
    appKeys: number;
    estimatedSize: number;
  }> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const appKeys = allKeys.filter(key => key.startsWith(this.keyPrefix));
      
      // Estimate size by getting all values
      let totalSize = 0;
      const values = await AsyncStorage.multiGet(appKeys);
      
      for (const [, value] of values) {
        if (value) {
          totalSize += value.length;
        }
      }
      
      return {
        totalKeys: allKeys.length,
        appKeys: appKeys.length,
        estimatedSize: totalSize
      };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return {
        totalKeys: 0,
        appKeys: 0,
        estimatedSize: 0
      };
    }
  }

  async merge<T>(key: string, value: Partial<T>): Promise<void> {
    try {
      const fullKey = this.getFullKey(key);
      const existing = await this.get<T>(key);
      
      if (existing && typeof existing === 'object') {
        const merged = { ...existing, ...value };
        await AsyncStorage.setItem(fullKey, JSON.stringify(merged));
      } else {
        await this.set(key, value);
      }
    } catch (error) {
      console.error(`Failed to merge item ${key}:`, error);
      throw new Error(`Storage merge failed: ${error}`);
    }
  }

  async hasItem(key: string): Promise<boolean> {
    try {
      const value = await this.get(key);
      return value !== null;
    } catch {
      return false;
    }
  }

  // Batch operations with transaction-like behavior
  
  async transaction(operations: Array<{
    type: 'set' | 'remove' | 'merge';
    key: string;
    value?: any;
  }>): Promise<void> {
    const backup = new Map<string, any>();
    const processedKeys: string[] = [];
    
    try {
      // Backup existing values
      for (const op of operations) {
        if (op.type === 'set' || op.type === 'merge') {
          const existing = await this.get(op.key);
          if (existing !== null) {
            backup.set(op.key, existing);
          }
          processedKeys.push(op.key);
        }
      }
      
      // Execute operations
      for (const op of operations) {
        switch (op.type) {
          case 'set':
            await this.set(op.key, op.value);
            break;
          case 'remove':
            await this.remove(op.key);
            break;
          case 'merge':
            await this.merge(op.key, op.value);
            break;
        }
      }
      
    } catch (error) {
      // Rollback on error
      console.error('Transaction failed, rolling back:', error);
      
      for (const key of processedKeys) {
        if (backup.has(key)) {
          await this.set(key, backup.get(key));
        } else {
          await this.remove(key);
        }
      }
      
      throw error;
    }
  }

  // Private helper methods
  
  private getFullKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private getOriginalKey(fullKey: string): string {
    return fullKey.startsWith(this.keyPrefix) 
      ? fullKey.substring(this.keyPrefix.length)
      : fullKey;
  }
}