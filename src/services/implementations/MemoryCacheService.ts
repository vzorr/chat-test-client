// src/services/implementations/cache/MemoryCacheService.ts
import { ICacheService } from '../interfaces';
import { Message, ServerConversation } from '../../types/chat';

interface CacheMetrics {
  hitCount: number;
  missCount: number;
  evictionCount: number;
}

export class MemoryCacheService implements ICacheService {
  // Message cache - Map<conversationId, Message[]>
  private messageCache: Map<string, Message[]> = new Map();
  
  // Conversation cache - Map<conversationId, ServerConversation>
  private conversationCache: Map<string, ServerConversation> = new Map();
  
  // User cache - Map<userId, userData>
  private userCache: Map<string, any> = new Map();
  
  // Message index for quick lookup - Map<messageId, conversationId>
  private messageIndex: Map<string, string> = new Map();
  
  // Cache configuration
  private readonly MAX_MESSAGES_PER_CONVERSATION = 500;
  private readonly MAX_CONVERSATIONS = 100;
  private readonly MAX_USERS = 200;
  private readonly MAX_TOTAL_MESSAGES = 5000;
  
  // Cache metrics
  private metrics: CacheMetrics = {
    hitCount: 0,
    missCount: 0,
    evictionCount: 0
  };

  // Message Cache Operations
  
  cacheMessage(conversationId: string, message: Message): void {
    if (!conversationId || !message) {
      return;
    }

    // Get or create message array for conversation
    let messages = this.messageCache.get(conversationId) || [];
    
    // Check if message already exists (by id or clientTempId)
    const existingIndex = messages.findIndex(m => 
      (message.id && m.id === message.id) ||
      (message.clientTempId && m.clientTempId === message.clientTempId)
    );

    if (existingIndex !== -1) {
      // Update existing message
      messages[existingIndex] = { ...messages[existingIndex], ...message };
    } else {
      // Add new message at the beginning (newest first)
      messages.unshift(message);
      
      // Index the message for quick lookup
      if (message.id) {
        this.messageIndex.set(message.id, conversationId);
      }
      
      // Trim messages if exceeding limit
      if (messages.length > this.MAX_MESSAGES_PER_CONVERSATION) {
        const removed = messages.splice(this.MAX_MESSAGES_PER_CONVERSATION);
        
        // Clean up message index
        removed.forEach(msg => {
          if (msg.id) {
            this.messageIndex.delete(msg.id);
          }
        });
        
        this.metrics.evictionCount += removed.length;
      }
    }
    
    // Sort messages by timestamp (newest first)
    messages.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    this.messageCache.set(conversationId, messages);
    
    // Check total message count
    this.enforceGlobalMessageLimit();
  }

  getCachedMessages(conversationId: string): Message[] {
    const messages = this.messageCache.get(conversationId);
    
    if (messages) {
      this.metrics.hitCount++;
      return [...messages]; // Return copy to prevent external modifications
    }
    
    this.metrics.missCount++;
    return [];
  }

  clearMessageCache(conversationId?: string): void {
    if (conversationId) {
      const messages = this.messageCache.get(conversationId) || [];
      
      // Clean up message index
      messages.forEach(msg => {
        if (msg.id) {
          this.messageIndex.delete(msg.id);
        }
      });
      
      this.messageCache.delete(conversationId);
    } else {
      // Clear all messages
      this.messageIndex.clear();
      this.messageCache.clear();
    }
    
    console.log('🗑️ Message cache cleared');
  }

  // Conversation Cache Operations
  
  cacheConversation(conversation: ServerConversation): void {
    if (!conversation || !conversation.id) {
      return;
    }

    // Check if we're at the limit
    if (!this.conversationCache.has(conversation.id) && 
        this.conversationCache.size >= this.MAX_CONVERSATIONS) {
      // Evict least recently used conversation
      const lruConversationId = this.findLRUConversation();
      if (lruConversationId) {
        this.conversationCache.delete(lruConversationId);
        this.metrics.evictionCount++;
      }
    }

    this.conversationCache.set(conversation.id, conversation);
    
    // Also cache the last message if present
    if (conversation.lastMessage) {
      this.cacheMessage(conversation.id, conversation.lastMessage);
    }
  }

  getCachedConversation(conversationId: string): ServerConversation | null {
    const conversation = this.conversationCache.get(conversationId);
    
    if (conversation) {
      this.metrics.hitCount++;
      return { ...conversation }; // Return copy
    }
    
    this.metrics.missCount++;
    return null;
  }

  getCachedConversations(): ServerConversation[] {
    return Array.from(this.conversationCache.values()).map(conv => ({ ...conv }));
  }

  clearConversationCache(): void {
    this.conversationCache.clear();
    console.log('🗑️ Conversation cache cleared');
  }

  // User Cache Operations
  
  cacheUser(userId: string, userData: any): void {
    if (!userId || !userData) {
      return;
    }

    // Check if we're at the limit
    if (!this.userCache.has(userId) && this.userCache.size >= this.MAX_USERS) {
      // Evict oldest user (simple FIFO for users)
      const firstKey = this.userCache.keys().next().value;
      if (firstKey) {
        this.userCache.delete(firstKey);
        this.metrics.evictionCount++;
      }
    }

    this.userCache.set(userId, userData);
  }

  getCachedUser(userId: string): any | null {
    const userData = this.userCache.get(userId);
    
    if (userData) {
      this.metrics.hitCount++;
      return { ...userData }; // Return copy
    }
    
    this.metrics.missCount++;
    return null;
  }

  clearUserCache(): void {
    this.userCache.clear();
    console.log('🗑️ User cache cleared');
  }

  // General Cache Management
  
  clearAllCache(): void {
    this.clearMessageCache();
    this.clearConversationCache();
    this.clearUserCache();
    
    // Reset metrics
    this.metrics = {
      hitCount: 0,
      missCount: 0,
      evictionCount: 0
    };
    
    console.log('🗑️ All caches cleared');
  }

  getCacheSize(): number {
    let totalSize = 0;
    
    // Count all messages
    for (const messages of this.messageCache.values()) {
      totalSize += messages.length;
    }
    
    // Add conversations and users
    totalSize += this.conversationCache.size;
    totalSize += this.userCache.size;
    
    return totalSize;
  }

  trimCache(maxSize: number): void {
    const currentSize = this.getCacheSize();
    
    if (currentSize <= maxSize) {
      return;
    }
    
    const itemsToRemove = currentSize - maxSize;
    let removed = 0;
    
    // First, trim messages from conversations with most messages
    const sortedConversations = Array.from(this.messageCache.entries())
      .sort(([, a], [, b]) => b.length - a.length);
    
    for (const [conversationId, messages] of sortedConversations) {
      if (removed >= itemsToRemove) break;
      
      const toRemove = Math.min(messages.length / 2, itemsToRemove - removed);
      const removedMessages = messages.splice(messages.length - toRemove);
      
      // Clean up message index
      removedMessages.forEach(msg => {
        if (msg.id) {
          this.messageIndex.delete(msg.id);
        }
      });
      
      removed += toRemove;
      this.metrics.evictionCount += toRemove;
      
      if (messages.length === 0) {
        this.messageCache.delete(conversationId);
      }
    }
    
    console.log(`🧹 Trimmed cache by ${removed} items`);
  }

  // Additional utility methods
  
  getMessageById(messageId: string): Message | null {
    const conversationId = this.messageIndex.get(messageId);
    
    if (conversationId) {
      const messages = this.messageCache.get(conversationId);
      if (messages) {
        return messages.find(m => m.id === messageId) || null;
      }
    }
    
    return null;
  }

  updateMessage(conversationId: string, messageId: string, updates: Partial<Message>): void {
    const messages = this.messageCache.get(conversationId);
    
    if (messages) {
      const index = messages.findIndex(m => m.id === messageId);
      if (index !== -1) {
        messages[index] = { ...messages[index], ...updates };
        this.messageCache.set(conversationId, messages);
      }
    }
  }

  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  getCacheStats(): {
    conversations: number;
    messages: number;
    users: number;
    messageIndex: number;
    hitRate: number;
    metrics: CacheMetrics;
  } {
    let messageCount = 0;
    for (const messages of this.messageCache.values()) {
      messageCount += messages.length;
    }
    
    const totalRequests = this.metrics.hitCount + this.metrics.missCount;
    const hitRate = totalRequests > 0 ? this.metrics.hitCount / totalRequests : 0;
    
    return {
      conversations: this.conversationCache.size,
      messages: messageCount,
      users: this.userCache.size,
      messageIndex: this.messageIndex.size,
      hitRate: Math.round(hitRate * 100) / 100,
      metrics: this.getMetrics()
    };
  }

  // Private helper methods
  
  private enforceGlobalMessageLimit(): void {
    let totalMessages = 0;
    const conversationSizes: Array<[string, number]> = [];
    
    for (const [convId, messages] of this.messageCache.entries()) {
      totalMessages += messages.length;
      conversationSizes.push([convId, messages.length]);
    }
    
    if (totalMessages > this.MAX_TOTAL_MESSAGES) {
      // Sort by size and remove from largest conversations
      conversationSizes.sort(([, a], [, b]) => b - a);
      
      let toRemove = totalMessages - this.MAX_TOTAL_MESSAGES;
      
      for (const [convId, size] of conversationSizes) {
        if (toRemove <= 0) break;
        
        const messages = this.messageCache.get(convId)!;
        const removeCount = Math.min(size / 3, toRemove); // Remove up to 1/3 of messages
        const removed = messages.splice(messages.length - removeCount);
        
        // Clean up message index
        removed.forEach(msg => {
          if (msg.id) {
            this.messageIndex.delete(msg.id);
          }
        });
        
        toRemove -= removeCount;
        this.metrics.evictionCount += removeCount;
      }
    }
  }

  private findLRUConversation(): string | undefined {
    let oldestTime = Date.now();
    let lruId: string | undefined;
    
    for (const [id, conv] of this.conversationCache.entries()) {
      const updateTime = new Date(conv.updatedAt || conv.createdAt).getTime();
      if (updateTime < oldestTime) {
        oldestTime = updateTime;
        lruId = id;
      }
    }
    
    return lruId;
  }
}