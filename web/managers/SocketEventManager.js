// web/managers/SocketEventManager.js
import { EventBus } from '../utils/EventBus.js';

export class SocketEventManager {
  constructor(chatService) {
    this.chatService = chatService;
    this.cleanupFunctions = [];
  }

  initialize() {
    this.setupConnectionEvents();
    this.setupMessageEvents();
    this.setupConversationEvents();
    this.setupUserEvents();
    this.setupTypingEvents();
    
    console.log('✅ SocketEventManager initialized');
  }

  setupConnectionEvents() {
    const cleanup = this.chatService.onConnectionStateChange((state) => {
      console.log('📡 Connection state:', state);
      EventBus.emit('connection:state', state);
    });
    this.cleanupFunctions.push(cleanup);
  }

  setupMessageEvents() {
    // Message received
    const onMessage = this.chatService.onNewMessage((message) => {
      EventBus.emit('socket:message_received', message);
    });
    this.cleanupFunctions.push(onMessage);

    // Message sent
    const onSent = this.chatService.onMessageSent((data) => {
      EventBus.emit('socket:message_sent', data);
    });
    this.cleanupFunctions.push(onSent);

    // Message error
    const onError = this.chatService.onMessageSendError((data) => {
      EventBus.emit('socket:message_error', data);
    });
    this.cleanupFunctions.push(onError);

    // Message delivered (if available)
    if (this.chatService.onMessageDelivered) {
      const onDelivered = this.chatService.onMessageDelivered((data) => {
        console.log('✓✓ Message delivered:', data);
        EventBus.emit('socket:message_delivered', data);
      });
      this.cleanupFunctions.push(onDelivered);
    }

    // Message read (if available)
    if (this.chatService.onMessageRead) {
      const onRead = this.chatService.onMessageRead((data) => {
        console.log('👁️ Message read:', data);
        EventBus.emit('socket:message_read', data);
      });
      this.cleanupFunctions.push(onRead);
    }

    // Messages read (batch)
    if (this.chatService.onMessagesRead) {
      const onBatchRead = this.chatService.onMessagesRead((data) => {
        console.log('👁️ Messages read (batch):', data);
        EventBus.emit('socket:messages_read', data);
      });
      this.cleanupFunctions.push(onBatchRead);
    }
  }

  setupConversationEvents() {
    // Conversation created
    if (this.chatService.onConversationCreated) {
      const onCreate = this.chatService.onConversationCreated((data) => {
        console.log('🆕 Conversation created:', data);
        EventBus.emit('socket:conversation_created', data);
      });
      this.cleanupFunctions.push(onCreate);
    }

    // Added to conversation
    if (this.chatService.onAddedToConversation) {
      const onAdded = this.chatService.onAddedToConversation((data) => {
        console.log('➕ Added to conversation:', data);
        EventBus.emit('socket:added_to_conversation', data);
      });
      this.cleanupFunctions.push(onAdded);
    }

    // Conversation updated
    if (this.chatService.onConversationUpdated) {
      const onUpdate = this.chatService.onConversationUpdated((data) => {
        console.log('🔄 Conversation updated:', data);
        EventBus.emit('socket:conversation_updated', data);
      });
      this.cleanupFunctions.push(onUpdate);
    }

    // Participants added
    if (this.chatService.onParticipantsAdded) {
      const onParticipantsAdded = this.chatService.onParticipantsAdded((data) => {
        console.log('👥 Participants added:', data);
        EventBus.emit('socket:participants_added', data);
      });
      this.cleanupFunctions.push(onParticipantsAdded);
    }

    // Participant removed
    if (this.chatService.onParticipantRemoved) {
      const onParticipantRemoved = this.chatService.onParticipantRemoved((data) => {
        console.log('👤 Participant removed:', data);
        EventBus.emit('socket:participant_removed', data);
      });
      this.cleanupFunctions.push(onParticipantRemoved);
    }

    // Removed from conversation
    if (this.chatService.onRemovedFromConversation) {
      const onRemoved = this.chatService.onRemovedFromConversation((data) => {
        console.log('❌ Removed from conversation:', data);
        EventBus.emit('socket:removed_from_conversation', data);
      });
      this.cleanupFunctions.push(onRemoved);
    }
  }

  setupUserEvents() {
    // User online
    if (this.chatService.onUserOnline) {
      const onOnline = this.chatService.onUserOnline((data) => {
        console.log('🟢 User online:', data.userId);
        EventBus.emit('socket:user_online', data);
      });
      this.cleanupFunctions.push(onOnline);
    }

    // User offline
    if (this.chatService.onUserOffline) {
      const onOffline = this.chatService.onUserOffline((data) => {
        console.log('⚪ User offline:', data.userId);
        EventBus.emit('socket:user_offline', data);
      });
      this.cleanupFunctions.push(onOffline);
    }

    // User status change
    if (this.chatService.onUserStatusChange) {
      const onStatus = this.chatService.onUserStatusChange((userId, isOnline, lastSeen) => {
        console.log('👤 User status:', userId, isOnline);
        EventBus.emit('socket:user_status', { userId, isOnline, lastSeen });
      });
      this.cleanupFunctions.push(onStatus);
    }
  }

  setupTypingEvents() {
    // User typing
    const onTyping = this.chatService.onTyping((userId, isTyping) => {
      EventBus.emit('socket:user_typing', { userId, isTyping });
    });
    this.cleanupFunctions.push(onTyping);

    // Typing status updated
    if (this.chatService.onTypingStatusUpdated) {
      const onTypingUpdate = this.chatService.onTypingStatusUpdated((data) => {
        EventBus.emit('socket:typing_status_updated', data);
      });
      this.cleanupFunctions.push(onTypingUpdate);
    }

    // Typing users (list)
    if (this.chatService.onTypingUsers) {
      const onTypingUsers = this.chatService.onTypingUsers((data) => {
        console.log('✏️ Typing users:', data);
        EventBus.emit('socket:typing_users', data);
      });
      this.cleanupFunctions.push(onTypingUsers);
    }
  }

  destroy() {
    this.cleanupFunctions.forEach(cleanup => {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    });
    this.cleanupFunctions = [];
    console.log('🗑️ SocketEventManager destroyed');
  }
}