// Mock Redux actions for standalone test client
// These are no-op functions that just return the action objects without Redux

export const setInitialized = (initialized: boolean) => ({
  type: 'messaging/setInitialized',
  payload: initialized
});

export const setConnectionState = (state: string) => ({
  type: 'messaging/setConnectionState',
  payload: state
});

export const handleNewMessage = (data: any) => ({
  type: 'messaging/handleNewMessage',
  payload: data
});

export const markConversationAsRead = (conversationId: string) => ({
  type: 'messaging/markConversationAsRead',
  payload: conversationId
});

export const setActiveConversation = (conversationId: string | null) => ({
  type: 'messaging/setActiveConversation',
  payload: conversationId
});

export const updateTypingUsers = (data: { conversationId: string; typingUserIds: string[] }) => ({
  type: 'messaging/updateTypingUsers',
  payload: data
});

export const resetMessagingState = () => ({
  type: 'messaging/resetMessagingState'
});

export const updateConversationMetadata = (data: { conversationId: string; metadata: any }) => ({
  type: 'messaging/updateConversationMetadata',
  payload: data
});

export const removeConversation = (conversationId: string) => ({
  type: 'messaging/removeConversation',
  payload: conversationId
});

export const syncConversations = (conversations: any) => ({
  type: 'messaging/syncConversations',
  payload: conversations
});