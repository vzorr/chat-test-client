// types/store.ts - Store interface for dependency injection
// This allows chatService to work with any store implementation

import { ConnectionState } from './chat';

/**
 * Generic store interface that can be implemented by:
 * - Redux store
 * - Zustand store
 * - MobX store
 * - Mock store for testing
 * - Local state management
 */
export interface IChatStore {
  // Dispatch method (can be Redux dispatch or any other state updater)
  dispatch: (action: any) => void;
  
  // Get current state (optional - for stores that expose state directly)
  getState?: () => any;
  
  // Subscribe to state changes (optional)
  subscribe?: (listener: () => void) => () => void;
}

/**
 * Action creators interface - can be implemented differently for each store type
 */
export interface IChatActions {
  setInitialized: (initialized: boolean) => any;
  setConnectionState: (state: ConnectionState | string) => any;
  handleNewMessage: (data: {
    conversationId: string;
    senderId: string;
    messagePreview?: string;
    timestamp: string;
    otherUserName?: string;
    jobTitle?: string;
  }) => any;
  markConversationAsRead: (conversationId: string) => any;
  setActiveConversation: (conversationId: string | null) => any;
  updateTypingUsers: (data: {
    conversationId: string;
    typingUserIds: string[];
  }) => any;
  resetMessagingState: () => any;
  updateConversationMetadata: (data: {
    conversationId: string;
    metadata: any;
  }) => any;
  removeConversation: (conversationId: string) => any;
  syncConversations: (conversations: any) => any;
}

/**
 * Store adapter pattern - wraps different store implementations
 */
export abstract class StoreAdapter implements IChatStore {
  abstract dispatch(action: any): void;
  abstract getState?(): any;
  abstract subscribe?(listener: () => void): () => void;
}

/**
 * Redux store adapter
 */
export class ReduxStoreAdapter extends StoreAdapter {
  constructor(private store: any) {
    super();
  }

  dispatch(action: any): void {
    this.store.dispatch(action);
  }

  getState(): any {
    return this.store.getState();
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }
}

/**
 * Mock store for testing
 */
export class MockStore extends StoreAdapter {
  private state: any = {};
  private listeners: Array<() => void> = [];
  public dispatchedActions: any[] = [];

  dispatch(action: any): void {
    console.log('📤 Mock Store Dispatch:', action.type, action.payload);
    this.dispatchedActions.push(action);
    
    // Simple state updates for testing
    switch (action.type) {
      case 'messaging/setInitialized':
        this.state.initialized = action.payload;
        break;
      case 'messaging/setConnectionState':
        this.state.connectionState = action.payload;
        break;
      case 'messaging/setActiveConversation':
        this.state.activeConversation = action.payload;
        break;
      // Add more cases as needed
    }
    
    this.notifyListeners();
  }

  getState(): any {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  // Testing helpers
  clearActions(): void {
    this.dispatchedActions = [];
  }

  getActions(): any[] {
    return this.dispatchedActions;
  }

  setState(newState: any): void {
    this.state = { ...this.state, ...newState };
    this.notifyListeners();
  }
}

/**
 * Zustand store adapter (for React web apps)
 */
export class ZustandStoreAdapter extends StoreAdapter {
  constructor(private useStore: any) {
    super();
  }

  dispatch(action: any): void {
    const { getState, setState } = this.useStore;
    
    // Map Redux-style actions to Zustand state updates
    switch (action.type) {
      case 'messaging/setInitialized':
        setState({ initialized: action.payload });
        break;
      case 'messaging/setConnectionState':
        setState({ connectionState: action.payload });
        break;
      case 'messaging/setActiveConversation':
        setState({ activeConversation: action.payload });
        break;
      case 'messaging/handleNewMessage':
        const currentMessages = getState().messages || [];
        setState({ 
          messages: [...currentMessages, action.payload],
          unreadCount: (getState().unreadCount || 0) + 1
        });
        break;
      // Add more cases as needed
    }
  }

  getState(): any {
    return this.useStore.getState();
  }

  subscribe(listener: () => void): () => void {
    return this.useStore.subscribe(listener);
  }
}

/**
 * MobX store adapter
 */
export class MobXStoreAdapter extends StoreAdapter {
  constructor(private store: any) {
    super();
  }

  dispatch(action: any): void {
    // Map Redux-style actions to MobX actions
    switch (action.type) {
      case 'messaging/setInitialized':
        this.store.setInitialized(action.payload);
        break;
      case 'messaging/setConnectionState':
        this.store.setConnectionState(action.payload);
        break;
      case 'messaging/setActiveConversation':
        this.store.setActiveConversation(action.payload);
        break;
      // Add more cases as needed
    }
  }

  getState(): any {
    // Return MobX observable values
    return {
      initialized: this.store.initialized,
      connectionState: this.store.connectionState,
      activeConversation: this.store.activeConversation,
      // Add more state properties
    };
  }
}

/**
 * No-op store for when no store is provided
 */
export class NoOpStore extends StoreAdapter {
  dispatch(action: any): void {
    // Do nothing - just log if in development
    if (process.env.NODE_ENV === 'development') {
      console.log('📭 No-op Store:', action.type, action.payload);
    }
  }

  getState(): any {
    return {};
  }

  subscribe(listener: () => void): () => void {
    return () => {}; // No-op unsubscribe
  }
}