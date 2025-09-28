// src/services/implementations/storage/LocalStorageService.ts
import { IStorageService } from '../../interfaces';

/**
 * LocalStorage implementation for web browsers
 * Provides same interface as AsyncStorage but synchronous under the hood
 */
export class LocalStorageService implements IStorageService {
  private readonly keyPrefix: string;
  
  constructor(config?: { keyPrefix?: string }) {
    this.keyPrefix = config?.keyPrefix || 'myusta_';
    
    // Check if localStorage is available
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is not available in this environment');
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const fullKey = this.getFullKey(key);
      const value = localStorage.getItem(fullKey);
      
      if (value === null) {
        return null;
      }
      
      try {
        return JSON.parse(value) as T;
      } catch {
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
      localStorage.setItem(fullKey, serialized);
    } catch (error) {
      console.error(`Failed to set item ${key}:`, error);
      
      // Handle quota exceeded error
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        throw new Error('Storage quota exceeded. Please clear some data.');
      }
      
      throw new Error(`Storage set failed: ${error}`);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const fullKey = this.getFullKey(key);
      localStorage.removeItem(fullKey);
    } catch (error) {
      console.error(`Failed to remove item ${key}:`, error);
      throw new Error(`Storage remove failed: ${error}`);
    }
  }

  async clear(): Promise<void> {
    try {
      const keysToRemove: string[] = [];
      
      // Collect all keys with our prefix
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.keyPrefix)) {
          keysToRemove.push(key);
        }
      }
      
      // Remove all our keys
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      console.log(`🗑️ Cleared ${keysToRemove.length} items from localStorage`);
    } catch (error) {
      console.error('Failed to clear storage:', error);
      throw new Error(`Storage clear failed: ${error}`);
    }
  }

  async multiGet<T>(keys: string[]): Promise<Map<string, T>> {
    const map = new Map<string, T>();
    
    for (const key of keys) {
      const value = await this.get<T>(key);
      if (value !== null) {
        map.set(key, value);
      }
    }
    
    return map;
  }

  async multiSet(items: Map<string, any>): Promise<void> {
    try {
      for (const [key, value] of items.entries()) {
        await this.set(key, value);
      }
    } catch (error) {
      console.error('Failed to multi-set items:', error);
      throw new Error(`Storage multi-set failed: ${error}`);
    }
  }

  async multiRemove(keys: string[]): Promise<void> {
    try {
      for (const key of keys) {
        await this.remove(key);
      }
    } catch (error) {
      console.error('Failed to multi-remove items:', error);
      throw new Error(`Storage multi-remove failed: ${error}`);
    }
  }

  async getAllKeys(): Promise<string[]> {
    try {
      const keys: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.keyPrefix)) {
          keys.push(this.getOriginalKey(key));
        }
      }
      
      return keys;
    } catch (error) {
      console.error('Failed to get all keys:', error);
      return [];
    }
  }

  async getItemsByPrefix(prefix: string): Promise<Map<string, any>> {
    try {
      const map = new Map<string, any>();
      const searchPrefix = this.getFullKey(prefix);
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(searchPrefix)) {
          const value = localStorage.getItem(key);
          if (value) {
            const originalKey = this.getOriginalKey(key);
            try {
              map.set(originalKey, JSON.parse(value));
            } catch {
              map.set(originalKey, value);
            }
          }
        }
      }
      
      return map;
    } catch (error) {
      console.error('Failed to get items by prefix:', error);
      return new Map();
    }
  }

  // Additional utility methods for LocalStorage

  /**
   * Get storage usage information
   */
  async getStorageInfo(): Promise<{
    totalKeys: number;
    appKeys: number;
    estimatedSize: number;
    availableSpace?: number;
  }> {
    try {
      let totalSize = 0;
      let appKeyCount = 0;
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value) {
            totalSize += key.length + value.length;
            
            if (key.startsWith(this.keyPrefix)) {
              appKeyCount++;
            }
          }
        }
      }
      
      // Try to estimate available space (this is approximate)
      let availableSpace: number | undefined;
      try {
        const testKey = `${this.keyPrefix}__test__`;
        const testData = 'x'.repeat(1024); // 1KB test
        localStorage.setItem(testKey, testData);
        localStorage.removeItem(testKey);
        availableSpace = undefined; // Cannot reliably determine
      } catch {
        availableSpace = undefined;
      }
      
      return {
        totalKeys: localStorage.length,
        appKeys: appKeyCount,
        estimatedSize: totalSize,
        availableSpace
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

  /**
   * Check if an item exists without retrieving its value
   */
  async hasItem(key: string): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key);
      return localStorage.getItem(fullKey) !== null;
    } catch {
      return false;
    }
  }

  /**
   * Merge an object with existing data
   */
  async merge<T>(key: string, value: Partial<T>): Promise<void> {
    try {
      const existing = await this.get<T>(key);
      
      if (existing && typeof existing === 'object' && typeof value === 'object') {
        const merged = { ...existing, ...value };
        await this.set(key, merged);
      } else {
        await this.set(key, value);
      }
    } catch (error) {
      console.error(`Failed to merge item ${key}:`, error);
      throw new Error(`Storage merge failed: ${error}`);
    }
  }

  /**
   * Backup all app data to a JSON string
   */
  async backup(): Promise<string> {
    try {
      const allData: Record<string, any> = {};
      const keys = await this.getAllKeys();
      
      for (const key of keys) {
        const value = await this.get(key);
        if (value !== null) {
          allData[key] = value;
        }
      }
      
      return JSON.stringify({
        timestamp: new Date().toISOString(),
        version: '1.0',
        data: allData
      });
    } catch (error) {
      console.error('Failed to create backup:', error);
      throw new Error(`Backup failed: ${error}`);
    }
  }

  /**
   * Restore data from a backup JSON string
   */
  async restore(backupData: string): Promise<void> {
    try {
      const backup = JSON.parse(backupData);
      
      if (!backup.data || typeof backup.data !== 'object') {
        throw new Error('Invalid backup format');
      }
      
      // Clear existing data first
      await this.clear();
      
      // Restore data
      const items = new Map<string, any>();
      for (const [key, value] of Object.entries(backup.data)) {
        items.set(key, value);
      }
      
      await this.multiSet(items);
      
      console.log(`✅ Restored ${items.size} items from backup`);
    } catch (error) {
      console.error('Failed to restore backup:', error);
      throw new Error(`Restore failed: ${error}`);
    }
  }

  /**
   * Check localStorage quota and usage
   */
  getQuotaInfo(): { 
    used: number; 
    total: number | null; 
    available: number | null;
    usagePercentage: number | null;
  } {
    try {
      let used = 0;
      
      // Calculate current usage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value) {
            used += key.length + value.length;
          }
        }
      }
      
      // Most browsers have 5-10MB limit, but we can't reliably detect it
      const estimatedTotal = 5 * 1024 * 1024; // 5MB estimate
      const available = estimatedTotal - used;
      const usagePercentage = (used / estimatedTotal) * 100;
      
      return {
        used,
        total: null, // Cannot reliably determine
        available: available > 0 ? available : null,
        usagePercentage: usagePercentage < 100 ? usagePercentage : null
      };
    } catch (error) {
      console.error('Failed to get quota info:', error);
      return {
        used: 0,
        total: null,
        available: null,
        usagePercentage: null
      };
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