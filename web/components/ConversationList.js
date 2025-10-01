// web/components/ConversationList.js
import { EventBus } from '../utils/EventBus.js';

export class ConversationList {
  constructor() {
    this.conversations = [];
    this.activeConversationId = null;
    this.searchQuery = '';
    this.container = null;
  }

  init(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error('Container not found:', containerId);
      return;
    }

    this.render();
    this.attachEventListeners();
    this.subscribeToEvents();
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="h-full flex flex-col bg-white border-r border-gray-200">
        <!-- Header -->
        <div class="p-4 border-b border-gray-200">
          <h2 class="text-lg font-semibold text-gray-800 mb-3">Conversations</h2>
          
          <!-- Search -->
          <div class="relative">
            <input 
              type="text" 
              id="conversation-search"
              placeholder="Search conversations..." 
              class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
            <svg class="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        <!-- Conversation List -->
        <div id="conversation-items" class="flex-1 overflow-y-auto">
          ${this.renderConversationItems()}
        </div>

        <!-- Loading State -->
        <div id="conversations-loading" class="hidden p-4 text-center text-gray-500">
          <div class="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto"></div>
          <p class="mt-2 text-sm">Loading conversations...</p>
        </div>

        <!-- Empty State -->
        <div id="conversations-empty" class="hidden p-8 text-center text-gray-500">
          <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p class="text-sm">No conversations yet</p>
        </div>
      </div>
    `;
  }

  renderConversationItems() {
    if (this.conversations.length === 0) {
      return '';
    }

    const filtered = this.filterConversations();
    
    if (filtered.length === 0) {
      return '<div class="p-4 text-center text-gray-500 text-sm">No matches found</div>';
    }

    return filtered.map(conv => this.renderConversationItem(conv)).join('');
  }

  renderConversationItem(conversation) {
    const isActive = conversation.id === this.activeConversationId;
    const otherUser = this.getOtherUser(conversation);
    const isOnline = otherUser?.isOnline || false;
    const lastMessageTime = this.formatTime(conversation.updatedAt || conversation.createdAt);
    const lastMessagePreview = this.getLastMessagePreview(conversation);
    const unreadCount = conversation.unreadCount || 0;

    return `
      <div 
        class="conversation-item cursor-pointer border-b border-gray-100 hover:bg-gray-50 transition-colors ${isActive ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : ''}"
        data-conversation-id="${conversation.id}"
      >
        <div class="p-4 flex items-start gap-3">
          <!-- Avatar with Online Status -->
          <div class="relative flex-shrink-0">
            <div class="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold">
              ${this.getInitials(otherUser?.name || 'Unknown')}
            </div>
            ${isOnline ? `
              <div class="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full"></div>
            ` : ''}
          </div>

          <!-- Conversation Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between mb-1">
              <h3 class="font-semibold text-gray-900 truncate ${isActive ? 'text-indigo-600' : ''}">
                ${this.escapeHtml(otherUser?.name || 'Unknown')}
              </h3>
              <span class="text-xs text-gray-500 flex-shrink-0 ml-2">${lastMessageTime}</span>
            </div>

            ${conversation.metadata?.jobTitle ? `
              <p class="text-xs text-gray-500 mb-1 truncate">
                📋 ${this.escapeHtml(conversation.metadata.jobTitle)}
              </p>
            ` : ''}

            <div class="flex items-center justify-between">
              <p class="text-sm text-gray-600 truncate flex-1 ${unreadCount > 0 ? 'font-semibold' : ''}">
                ${lastMessagePreview}
              </p>
              ${unreadCount > 0 ? `
                <span class="ml-2 px-2 py-0.5 bg-indigo-500 text-white text-xs rounded-full flex-shrink-0">
                  ${unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    // Search input
    const searchInput = document.getElementById('conversation-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.updateConversationItems();
      });
    }

    // Conversation click - use event delegation
    const container = document.getElementById('conversation-items');
    if (container) {
      container.addEventListener('click', (e) => {
        const item = e.target.closest('.conversation-item');
        if (item) {
          const conversationId = item.dataset.conversationId;
          this.selectConversation(conversationId);
        }
      });
    }
  }

  subscribeToEvents() {
    // Listen for conversation updates
    EventBus.on('conversations:loaded', (conversations) => {
      this.setConversations(conversations);
    });

    EventBus.on('conversation:updated', (conversation) => {
      this.updateConversation(conversation);
    });

    EventBus.on('conversation:selected', (conversationId) => {
      this.activeConversationId = conversationId;
      this.updateConversationItems();
    });

    EventBus.on('socket:user_status', ({ userId, isOnline }) => {
      this.updateUserOnlineStatus(userId, isOnline);
    });

    EventBus.on('socket:message_received', (message) => {
      this.handleNewMessage(message);
    });

    EventBus.on('conversation:read', (conversationId) => {
      const conversation = this.conversations.find(c => c.id === conversationId);
      if (conversation) {
        conversation.unreadCount = 0;
        this.updateConversationItems();
      }
    });
  }

  // Public methods
  setConversations(conversations) {
    this.conversations = conversations;
    this.updateConversationItems();
    this.updateEmptyState();
  }

  updateConversation(conversation) {
    const index = this.conversations.findIndex(c => c.id === conversation.id);
    if (index !== -1) {
      this.conversations[index] = conversation;
    } else {
      this.conversations.unshift(conversation);
    }
    this.sortConversations();
    this.updateConversationItems();
  }

  selectConversation(conversationId) {
    this.activeConversationId = conversationId;
    EventBus.emit('conversation:select', conversationId);
    this.updateConversationItems();
  }

  updateUserOnlineStatus(userId, isOnline) {
    // Update online status for conversations with this user
    let updated = false;
    this.conversations.forEach(conv => {
      const participant = conv.participants?.find(p => p.userId === userId);
      if (participant) {
        participant.isOnline = isOnline;
        updated = true;
      }
    });

    if (updated) {
      this.updateConversationItems();
    }
  }

  handleNewMessage(message) {
    // Find conversation and update last message
    const conversation = this.conversations.find(c => c.id === message.conversationId);
    if (conversation) {
      conversation.lastMessage = message;
      conversation.updatedAt = message.timestamp;
      
      // Increment unread count if not active conversation
      if (message.conversationId !== this.activeConversationId) {
        conversation.unreadCount = (conversation.unreadCount || 0) + 1;
      }

      this.sortConversations();
      this.updateConversationItems();
    }
  }

  showLoading(show) {
    const loading = document.getElementById('conversations-loading');
    const items = document.getElementById('conversation-items');
    
    if (loading && items) {
      if (show) {
        loading.classList.remove('hidden');
        items.classList.add('hidden');
      } else {
        loading.classList.add('hidden');
        items.classList.remove('hidden');
      }
    }
  }

  // Helper methods
  filterConversations() {
    if (!this.searchQuery) return this.conversations;

    return this.conversations.filter(conv => {
      const otherUser = this.getOtherUser(conv);
      const userName = otherUser?.name?.toLowerCase() || '';
      const jobTitle = conv.metadata?.jobTitle?.toLowerCase() || '';
      const lastMessage = conv.lastMessage?.content?.toLowerCase() || '';

      return userName.includes(this.searchQuery) ||
             jobTitle.includes(this.searchQuery) ||
             lastMessage.includes(this.searchQuery);
    });
  }

  sortConversations() {
    this.conversations.sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt).getTime();
      return timeB - timeA;
    });
  }

  updateConversationItems() {
    const container = document.getElementById('conversation-items');
    if (container) {
      container.innerHTML = this.renderConversationItems();
    }
  }

  updateEmptyState() {
    const empty = document.getElementById('conversations-empty');
    const items = document.getElementById('conversation-items');
    
    if (empty && items) {
      if (this.conversations.length === 0) {
        empty.classList.remove('hidden');
        items.classList.add('hidden');
      } else {
        empty.classList.add('hidden');
        items.classList.remove('hidden');
      }
    }
  }

  getOtherUser(conversation) {
    // Assuming conversations have participants array
    if (!conversation.participants || conversation.participants.length === 0) {
      return null;
    }

    // Find the participant that's not the current user
    const currentUserId = window.currentUserId; // Set globally
    return conversation.participants.find(p => p.userId !== currentUserId);
  }

  getLastMessagePreview(conversation) {
    if (!conversation.lastMessage) {
      return 'No messages yet';
    }

    const content = conversation.lastMessage.content || '';
    const maxLength = 50;
    return content.length > maxLength 
      ? content.substring(0, maxLength) + '...' 
      : content;
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  getInitials(name) {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy() {
    EventBus.off('conversations:loaded');
    EventBus.off('conversation:updated');
    EventBus.off('conversation:selected');
    EventBus.off('user:status:changed');
    EventBus.off('message:received');
  }
}