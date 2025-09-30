/**
 * User configuration for chat client
 * Loads from environment variables or uses defaults
 */

export const UserProfiles = {
  customers: [
    {
      id: 'customer-1',
      userId: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Alice Cooper',
      email: 'alice@example.com',
      phone: '+1234567890',
      role: 'customer',
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.customer1'
    },
    {
      id: 'customer-2',
      userId: '550e8400-e29b-41d4-a716-446655440002',
      name: 'Charlie Brown',
      email: 'charlie@example.com',
      phone: '+1234567891',
      role: 'customer',
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.customer2'
    }
  ],

  ustas: [
    {
      id: 'usta-1',
      userId: '091e4c17-47ab-4150-8b45-ea36dd2c2de9',
      name: 'Bob Builder',
      email: 'bob@example.com',
      phone: '+1234567892',
      role: 'usta',
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.usta1'
    },
    {
      id: 'usta-2',
      userId: '091e4c17-47ab-4150-8b45-ea36dd2c2de8',
      name: 'Dave Plumber',
      email: 'dave@example.com',
      phone: '+1234567893',
      role: 'usta',
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.usta2'
    }
  ],

  /**
   * Get all user profiles
   */
  getAll() {
    return [...this.customers, ...this.ustas];
  },

  /**
   * Get user profile by ID
   */
  getById(id) {
    return this.getAll().find(user => user.id === id);
  },

  /**
   * Get users by role
   */
  getByRole(role) {
    return this[role + 's'] || [];
  },

  /**
   * Find other users (opposite role)
   */
  getOtherUsers(currentRole) {
    const otherRole = currentRole === 'customer' ? 'usta' : 'customer';
    return this.getByRole(otherRole);
  }
};

/**
 * Chat configuration
 */
export const ChatConfig = {
  // Default job for testing
  defaultJobId: 'job-test-' + Date.now(),
  defaultJobTitle: 'Test Service Request',
  
  // Message settings
  maxMessageLength: 4000,
  typingIndicatorDelay: 1000,
  
  // UI settings
  messagesPerPage: 50,
  enableDebugLogs: true
};