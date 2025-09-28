
// src/services/implementations/storage/FileStorageService.ts
import { IStorageService } from './interfaces';
import * as fs from 'fs/promises';
import * as path from 'path';

export class FileStorageService implements IStorageService {
  private dataPath: string;

  constructor(dataPath: string = './chat-data') {
    this.dataPath = dataPath;
    this.ensureDirectoryExists();
  }

  private async ensureDirectoryExists(): Promise<void> {
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
    } catch (error) {
      console.error('Failed to create storage directory:', error);
    }
  }

  private getFilePath(key: string): string {
    // Sanitize key to be safe for filesystem
    const safeKey = key.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(this.dataPath, `${safeKey}.json`);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const filePath = this.getFilePath(key);
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data) as T;
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
      const filePath = this.getFilePath(key);
      const data = JSON.stringify(value, null, 2);
      await fs.writeFile(filePath, data, 'utf8');
    } catch (error) {
      console.error(`Failed to set item ${key}:`, error);
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error(`Failed to remove item ${key}:`, error);
      }
    }
  }

  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.dataPath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      await Promise.all(
        jsonFiles.map(file => fs.unlink(path.join(this.dataPath, file)))
      );
      
      console.log(`🗑️ Cleared ${jsonFiles.length} items from file storage`);
    } catch (error) {
      console.error('Failed to clear storage:', error);
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
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
    } catch (error) {
      console.error('Failed to get all keys:', error);
      return [];
    }
  }

  async getItemsByPrefix(prefix: string): Promise<Map<string, any>> {
    const allKeys = await this.getAllKeys();
    const matchingKeys = allKeys.filter(key => key.startsWith(prefix));
    
    const map = new Map<string, any>();
    
    await Promise.all(
      matchingKeys.map(async (key) => {
        const value = await this.get(key);
        if (value !== null) {
          map.set(key, value);
        }
      })
    );
    
    return map;
  }
}