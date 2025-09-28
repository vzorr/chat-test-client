// src/services/implementations/storage/FileStorageService.ts
import { IStorageService } from '../../interfaces';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * File-based storage implementation for Node.js environments
 * Stores data as JSON files in the file system
 */
export class FileStorageService implements IStorageService {
  private dataPath: string;
  private readonly keyPrefix: string;

  constructor(config?: {
    dataPath?: string;
    keyPrefix?: string;
    prettyPrint?: boolean;
  }) {
    this.dataPath = config?.dataPath || './chat-data';
    this.keyPrefix = config?.keyPrefix || '';
    
    // Initialize directory
    this.ensureDirectoryExists();
  }

  private async ensureDirectoryExists(): Promise<void> {
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
    } catch (error) {
      console.error('Failed to create storage directory:', error);
      throw new Error(`Failed to initialize file storage: ${error}`);
    }
  }

  private getFilePath(key: string): string {
    // Sanitize key to be safe for filesystem
    const safeKey = this.sanitizeKey(key);
    const fileName = this.keyPrefix ? `${this.keyPrefix}${safeKey}.json` : `${safeKey}.json`;
    return path.join(this.dataPath, fileName);
  }

  private sanitizeKey(key: string): string {
    // Replace invalid filesystem characters
    return key.replace(/[^a-zA-Z0-9-_]/g, '_');
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const filePath = this.getFilePath(key);
      
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        return null; // File doesn't exist
      }
      
      const data = await fs.readFile(filePath, 'utf8');
      
      try {
        const parsed = JSON.parse(data);
        return parsed.value as T;
      } catch (parseError) {
        console.error(`Failed to parse file ${filePath}:`, parseError);
        return null;
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null; // File doesn't exist
      }
      console.error(`Failed to get item ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await this.ensureDirectoryExists();
      
      const filePath = this.getFilePath(key);
      const fileData = {
        key,
        value,
        timestamp: new Date().toISOString(),
        type: typeof value
      };
      
      const data = JSON.stringify(fileData, null, 2);
      await fs.writeFile(filePath, data, 'utf8');
    } catch (error) {
      console.error(`Failed to set item ${key}:`, error);
      throw new Error(`File storage set failed: ${error}`);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error(`Failed to remove item ${key}:`, error);
        throw new Error(`File storage remove failed: ${error}`);
      }
      // Silently ignore if file doesn't exist
    }
  }

  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.dataPath);
      const jsonFiles = files.filter(f => {
        if (this.keyPrefix) {
          return f.startsWith(this.keyPrefix) && f.endsWith('.json');
        }
        return f.endsWith('.json');
      });
      
      await Promise.all(
        jsonFiles.map(file => fs.unlink(path.join(this.dataPath, file)))
      );
      
      console.log(`🗑️ Cleared ${jsonFiles.length} items from file storage`);
    } catch (error) {
      console.error('Failed to clear storage:', error);
      throw new Error(`File storage clear failed: ${error}`);
    }
  }

  async multiGet<T>(keys: string[]): Promise<Map<string, T>> {
    const map = new Map<string, T>();
    
    await Promise.all(
      keys.map(async (key) => {
        const value = await this.get<T>(key);
        if (value !== null) {
          map.set(key, value);
        }
      })
    );
    
    return map;
  }

  async multiSet(items: Map<string, any>): Promise<void> {
    await Promise.all(
      Array.from(items.entries()).map(([key, value]) => 
        this.set(key, value)
      )
    );
  }

  async multiRemove(keys: string[]): Promise<void> {
    await Promise.all(keys.map(key => this.remove(key)));
  }

  async getAllKeys(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.dataPath);
      return files
        .filter(f => {
          if (this.keyPrefix) {
            return f.startsWith(this.keyPrefix) && f.endsWith('.json');
          }
          return f.endsWith('.json');
        })
        .map(f => {
          // Remove prefix and .json extension
          let key = f.replace('.json', '');
          if (this.keyPrefix && key.startsWith(this.keyPrefix)) {
            key = key.substring(this.keyPrefix.length);
          }
          return this.desanitizeKey(key);
        });
    } catch (error) {
      console.error('Failed to get all keys:', error);
      return [];
    }
  }

  async getItemsByPrefix(prefix: string): Promise<Map<string, any>> {
    try {
      const allKeys = await this.getAllKeys();
      const matchingKeys = allKeys.filter(key => key.startsWith(prefix));
      
      return await this.multiGet(matchingKeys);
    } catch (error) {
      console.error('Failed to get items by prefix:', error);
      return new Map();
    }
  }

  // Additional utility methods for File Storage

  /**
   * Get storage directory information
   */
  async getStorageInfo(): Promise<{
    dataPath: string;
    totalFiles: number;
    appFiles: number;
    totalSize: number;
    lastModified?: string;
  }> {
    try {
      const files = await fs.readdir(this.dataPath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      const appFiles = jsonFiles.filter(f => {
        if (this.keyPrefix) {
          return f.startsWith(this.keyPrefix);
        }
        return true;
      });

      let totalSize = 0;
      let lastModified: string | undefined;
      let latestTime = 0;

      // Calculate total size and find latest modification
      await Promise.all(
        appFiles.map(async (file) => {
          try {
            const filePath = path.join(this.dataPath, file);
            const stats = await fs.stat(filePath);
            totalSize += stats.size;

            if (stats.mtime.getTime() > latestTime) {
              latestTime = stats.mtime.getTime();
              lastModified = stats.mtime.toISOString();
            }
          } catch (error) {
            console.warn(`Failed to get stats for ${file}:`, error);
          }
        })
      );

      return {
        dataPath: this.dataPath,
        totalFiles: jsonFiles.length,
        appFiles: appFiles.length,
        totalSize,
        lastModified
      };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return {
        dataPath: this.dataPath,
        totalFiles: 0,
        appFiles: 0,
        totalSize: 0
      };
    }
  }

  /**
   * Check if an item exists
   */
  async hasItem(key: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(key);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file metadata for a key
   */
  async getItemMetadata(key: string): Promise<{
    size: number;
    created: string;
    modified: string;
    type: string;
  } | null> {
    try {
      const filePath = this.getFilePath(key);
      const stats = await fs.stat(filePath);
      const data = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(data);

      return {
        size: stats.size,
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        type: parsed.type || 'unknown'
      };
    } catch (error) {
      console.error(`Failed to get metadata for ${key}:`, error);
      return null;
    }
  }

  /**
   * Backup all data to a single file
   */
  async createBackup(backupPath?: string): Promise<string> {
    try {
      const keys = await this.getAllKeys();
      const backupData: Record<string, any> = {};

      // Collect all data
      for (const key of keys) {
        const value = await this.get(key);
        if (value !== null) {
          backupData[key] = value;
        }
      }

      const backup = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        source: 'FileStorageService',
        dataPath: this.dataPath,
        keyPrefix: this.keyPrefix,
        data: backupData
      };

      const backupFileName = backupPath || path.join(
        this.dataPath, 
        `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      );

      await fs.writeFile(backupFileName, JSON.stringify(backup, null, 2));
      
      console.log(`✅ Created backup with ${keys.length} items: ${backupFileName}`);
      return backupFileName;
    } catch (error) {
      console.error('Failed to create backup:', error);
      throw new Error(`Backup failed: ${error}`);
    }
  }

  /**
   * Restore data from a backup file
   */
  async restoreBackup(backupPath: string): Promise<void> {
    try {
      const backupData = await fs.readFile(backupPath, 'utf8');
      const backup = JSON.parse(backupData);

      if (!backup.data || typeof backup.data !== 'object') {
        throw new Error('Invalid backup format');
      }

      // Clear existing data
      await this.clear();

      // Restore data
      const items = new Map<string, any>();
      for (const [key, value] of Object.entries(backup.data)) {
        items.set(key, value);
      }

      await this.multiSet(items);
      
      console.log(`✅ Restored ${items.size} items from backup: ${backupPath}`);
    } catch (error) {
      console.error('Failed to restore backup:', error);
      throw new Error(`Restore failed: ${error}`);
    }
  }

  /**
   * Cleanup old files based on age
   */
  async cleanupOldFiles(maxAgeMs: number): Promise<number> {
    try {
      const files = await fs.readdir(this.dataPath);
      const now = Date.now();
      let removedCount = 0;

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const filePath = path.join(this.dataPath, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAgeMs) {
          await fs.unlink(filePath);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        console.log(`🧹 Cleaned up ${removedCount} old files`);
      }

      return removedCount;
    } catch (error) {
      console.error('Failed to cleanup old files:', error);
      return 0;
    }
  }

  /**
   * Optimize storage by removing empty or corrupt files
   */
  async optimizeStorage(): Promise<{
    removedCorrupt: number;
    removedEmpty: number;
    totalCleaned: number;
  }> {
    try {
      const files = await fs.readdir(this.dataPath);
      let removedCorrupt = 0;
      let removedEmpty = 0;

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.dataPath, file);
        
        try {
          const data = await fs.readFile(filePath, 'utf8');
          
          if (data.trim().length === 0) {
            // Empty file
            await fs.unlink(filePath);
            removedEmpty++;
          } else {
            // Try to parse JSON
            const parsed = JSON.parse(data);
            if (!parsed.value) {
              // Invalid structure
              await fs.unlink(filePath);
              removedCorrupt++;
            }
          }
        } catch (error) {
          // Corrupt file
          await fs.unlink(filePath);
          removedCorrupt++;
        }
      }

      const totalCleaned = removedCorrupt + removedEmpty;
      if (totalCleaned > 0) {
        console.log(`🔧 Optimized storage: removed ${removedCorrupt} corrupt and ${removedEmpty} empty files`);
      }

      return { removedCorrupt, removedEmpty, totalCleaned };
    } catch (error) {
      console.error('Failed to optimize storage:', error);
      return { removedCorrupt: 0, removedEmpty: 0, totalCleaned: 0 };
    }
  }

  /**
   * Watch for file changes (Node.js only)
   */
  watchForChanges(callback: (event: string, filename: string | null) => void): () => void {
    try {
      // Import fs synchronously to avoid async import issues
      const fs = require('fs');
      const watcher = fs.watch(this.dataPath, callback);
      
      console.log(`👀 Watching for changes in: ${this.dataPath}`);
      
      return () => {
        try {
          // Check if watcher has close method before calling it
          if (watcher && typeof watcher.close === 'function') {
            watcher.close();
          } else if (watcher && typeof watcher === 'object' && 'close' in watcher) {
            // Handle different watcher implementations
            (watcher as any).close();
          }
          console.log('🛑 Stopped watching for file changes');
        } catch (closeError) {
          console.warn('Warning: Could not properly close file watcher:', closeError);
        }
      };
    } catch (error) {
      console.error('Failed to setup file watcher:', error);
      return () => {}; // No-op cleanup function
    }
  }

  // Private helper methods

  private desanitizeKey(sanitizedKey: string): string {
    // This is a simple reverse of sanitizeKey
    // In practice, you might want to store the original key in the file
    return sanitizedKey; // For now, just return as-is
  }
}