// src/services/implementations/storage/MemoryStorageService.ts
import { IStorageService } from '../../interfaces';

/**
 * In-memory storage implementation for testing and Node.js environments
 * Data is lost when the process terminates
 */
export class MemoryStorageService implements IStorageService {
  private storage = new Map<string, any>();
  private readonly keyPrefix: string;
  
  constructor(config?: { 
    keyPrefix?: string;
    maxSize?: number;
  }) {
    this.keyPrefix = config?.keyPrefix || 'memory_';
    
    // Optional: Set up memory limit monitoring
    if (config?.maxSize) {
      this.setupMemoryMonitoring(config.maxSize);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.getFullKey(key);
    const value = this.storage.get(fullKey);
    
    if (value === undefined) {
      return null;
    }
    
    // Return a deep copy to prevent external mutations
    return this.deepClone(value);
  }

  async set<T>(key: string, value: T): Promise<void> {
    const fullKey = this.getFullKey(key);
    
    // Store a deep copy to prevent external mutations
    this.storage.set(fullKey, this.deepClone(value));
  }

  async remove(key: string): Promise<void> {
    const fullKey = this.getFullKey(key);
    this.storage.delete(fullKey);
  }

  async clear(): Promise<void> {
    // Only clear keys with our prefix
    const keysToDelete: string[] = [];
    
    for (const key of this.storage.keys()) {
      if (key.startsWith(this.keyPrefix)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.storage.delete(key));
    
    console.log(`🗑️ Cleared ${keysToDelete.length} items from memory storage`);
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
    for (const [key, value] of items.entries()) {
      await this.set(key, value);
    }
  }

  async multiRemove(keys: string[]): Promise<void> {
    for (const key of keys) {
      await this.remove(key);
    }
  }

  async getAllKeys(): Promise<string[]> {
    const keys: string[] = [];
    
    for (const key of this.storage.keys()) {
      if (key.startsWith(this.keyPrefix)) {
        keys.push(this.getOriginalKey(key));
      }
    }
    
    return keys;
  }

  async getItemsByPrefix(prefix: string): Promise<Map<string, any>> {
    const map = new Map<string, any>();
    const searchPrefix = this.getFullKey(prefix);
    
    for (const [key, value] of this.storage.entries()) {
      if (key.startsWith(searchPrefix)) {
        const originalKey = this.getOriginalKey(key);
        map.set(originalKey, this.deepClone(value));
      }
    }
    
    return map;
  }

  // Additional utility methods for Memory Storage

  /**
   * Get storage statistics
   */
  getStorageInfo(): {
    totalKeys: number;
    appKeys: number;
    estimatedSize: number;
    memoryUsage: {
      rss?: number;
      heapUsed?: number;
      heapTotal?: number;
      external?: number;
    };
  } {
    let appKeyCount = 0;
    let estimatedSize = 0;
    
    for (const [key, value] of this.storage.entries()) {
      if (key.startsWith(this.keyPrefix)) {
        appKeyCount++;
      }
      
      // Rough size estimation
      estimatedSize += this.estimateSize(key) + this.estimateSize(value);
    }
    
    // Get Node.js memory usage if available
    let memoryUsage: any = {};
    if (typeof process !== 'undefined' && process.memoryUsage) {
      memoryUsage = process.memoryUsage();
    }
    
    return {
      totalKeys: this.storage.size,
      appKeys: appKeyCount,
      estimatedSize,
      memoryUsage
    };
  }

  /**
   * Check if an item exists
   */
  async hasItem(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);
    return this.storage.has(fullKey);
  }

  /**
   * Merge data with existing item
   */
  async merge<T>(key: string, value: Partial<T>): Promise<void> {
    const existing = await this.get<T>(key);
    
    if (existing && typeof existing === 'object' && typeof value === 'object') {
      const merged = { ...existing, ...value };
      await this.set(key, merged);
    } else {
      await this.set(key, value);
    }
  }

  /**
   * Export all data as a JSON object
   */
  async exportData(): Promise<Record<string, any>> {
    const data: Record<string, any> = {};
    const keys = await this.getAllKeys();
    
    for (const key of keys) {
      const value = await this.get(key);
      if (value !== null) {
        data[key] = value;
      }
    }
    
    return data;
  }

  /**
   * Import data from a JSON object
   */
  async importData(data: Record<string, any>): Promise<void> {
    // Clear existing data first
    await this.clear();
    
    // Import new data
    const items = new Map<string, any>();
    for (const [key, value] of Object.entries(data)) {
      items.set(key, value);
    }
    
    await this.multiSet(items);
    
    console.log(`✅ Imported ${items.size} items to memory storage`);
  }

  /**
   * Create a snapshot of current storage state
   */
  createSnapshot(): Map<string, any> {
    const snapshot = new Map<string, any>();
    
    for (const [key, value] of this.storage.entries()) {
      if (key.startsWith(this.keyPrefix)) {
        snapshot.set(key, this.deepClone(value));
      }
    }
    
    return snapshot;
  }

  /**
   * Restore from a snapshot
   */
  async restoreSnapshot(snapshot: Map<string, any>): Promise<void> {
    // Clear current app data
    await this.clear();
    
    // Restore from snapshot
    for (const [key, value] of snapshot.entries()) {
      if (key.startsWith(this.keyPrefix)) {
        this.storage.set(key, this.deepClone(value));
      }
    }
    
    console.log(`✅ Restored ${snapshot.size} items from snapshot`);
  }

  /**
   * Get all data with size information
   */
  getDataWithSizes(): Array<{
    key: string;
    value: any;
    size: number;
  }> {
    const items: Array<{ key: string; value: any; size: number }> = [];
    
    for (const [fullKey, value] of this.storage.entries()) {
      if (fullKey.startsWith(this.keyPrefix)) {
        const key = this.getOriginalKey(fullKey);
        const size = this.estimateSize(value);
        items.push({ key, value: this.deepClone(value), size });
      }
    }
    
    // Sort by size (largest first)
    return items.sort((a, b) => b.size - a.size);
  }

  /**
   * Cleanup items larger than specified size
   */
  async cleanupLargeItems(maxItemSize: number): Promise<number> {
    const itemsToRemove: string[] = [];
    
    for (const [fullKey, value] of this.storage.entries()) {
      if (fullKey.startsWith(this.keyPrefix)) {
        const size = this.estimateSize(value);
        if (size > maxItemSize) {
          itemsToRemove.push(this.getOriginalKey(fullKey));
        }
      }
    }
    
    await this.multiRemove(itemsToRemove);
    
    console.log(`🧹 Cleaned up ${itemsToRemove.length} large items`);
    return itemsToRemove.length;
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

  /**
   * Deep clone an object to prevent mutations
   */
  private deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (obj instanceof Date) {
      return new Date(obj.getTime()) as unknown as T;
    }
    
    if (obj instanceof Array) {
      return obj.map(item => this.deepClone(item)) as unknown as T;
    }
    
    if (typeof obj === 'object') {
      const clonedObj = {} as T;
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          (clonedObj as any)[key] = this.deepClone((obj as any)[key]);
        }
      }
      return clonedObj;
    }
    
    return obj;
  }

  /**
   * Estimate the memory size of an object
   */
  private estimateSize(obj: any): number {
    if (obj === null || obj === undefined) {
      return 0;
    }
    
    if (typeof obj === 'string') {
      return obj.length * 2; // Approximate 2 bytes per character
    }
    
    if (typeof obj === 'number') {
      return 8; // 64-bit number
    }
    
    if (typeof obj === 'boolean') {
      return 4; // 32-bit boolean
    }
    
    if (obj instanceof Date) {
      return 8; // 64-bit timestamp
    }
    
    if (obj instanceof Array) {
      return obj.reduce((size, item) => size + this.estimateSize(item), 0);
    }
    
    if (typeof obj === 'object') {
      let size = 0;
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          size += this.estimateSize(key) + this.estimateSize(obj[key]);
        }
      }
      return size;
    }
    
    return 0;
  }

  /**
   * Set up memory monitoring (Node.js only)
   */
  private setupMemoryMonitoring(maxSize: number): void {
    if (typeof process === 'undefined') {
      return; // Not in Node.js environment
    }
    
    setInterval(() => {
      const info = this.getStorageInfo();
      
      if (info.estimatedSize > maxSize) {
        console.warn(`⚠️ Memory storage size (${info.estimatedSize} bytes) exceeds limit (${maxSize} bytes)`);
        
        // Auto-cleanup if size is exceeded
        this.cleanupLargeItems(maxSize / 10).then(removed => {
          if (removed > 0) {
            console.log(`🧹 Auto-cleaned ${removed} items to reduce memory usage`);
          }
        });
      }
    }, 30000); // Check every 30 seconds
  }
}