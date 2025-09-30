// web/config.js - Unified configuration loader
/**
 * Unified Configuration Loader
 * Works in both Node.js and Browser (Vite) environments
 */

// Detect environment
const isVite = typeof import.meta !== 'undefined' && import.meta.env;
const isNode = typeof process !== 'undefined' && process.env;

// Helper to get env variable (works in both Node and Vite)
const getEnv = (key) => {
  if (isVite) {
    // In Vite, variables are available without VITE_ prefix (thanks to define in vite.config.js)
    return import.meta.env[key];
  }
  if (isNode) {
    return process.env[key];
  }
  return undefined;
};

// User Profiles
export const UserProfiles = {
  usta: {
    id: getEnv('USTA_ID'),
    name: getEnv('USTA_NAME'),
    email: getEnv('USTA_EMAIL'),
    phone: getEnv('USTA_PHONE'),
    role: getEnv('USTA_ROLE') || 'usta',
    token: getEnv('USTA_TOKEN'),
  },
  
  customer: {
    id: getEnv('CUSTOMER_ID'),
    name: getEnv('CUSTOMER_NAME'),
    email: getEnv('CUSTOMER_EMAIL'),
    phone: getEnv('CUSTOMER_PHONE'),
    role: getEnv('CUSTOMER_ROLE') || 'customer',
    token: getEnv('CUSTOMER_TOKEN'),
  },
  
  /**
   * Get profile by role
   */
  getByRole(role) {
    return this[role.toLowerCase()] || this.usta;
  },
  
  /**
   * Get all profiles as array
   */
  getAll() {
    return [this.usta, this.customer];
  },
  
  /**
   * Get the other user (for receiver)
   */
  getOther(currentRole) {
    return currentRole.toLowerCase() === 'usta' ? this.customer : this.usta;
  }
};

// Job/Conversation Configuration
export const JobConfig = {
  id: getEnv('JOB_ID') || `job-${Date.now()}`,
  title: getEnv('JOB_TITLE') || 'Service Request',
};

// Default User
export const defaultUserRole = getEnv('DEFAULT_USER') || 'usta';

// Server Configuration
export const ServerConfig = {
  url: getEnv('SERVER_URL') || 'https://myusta.al',
};

// Chat Configuration
export const ChatConfig = {
  maxMessageLength: 4000,
  typingIndicatorDelay: 1000,
  messagesPerPage: 50,
  enableDebugLogs: getEnv('ENABLE_LOGGING') === 'true',
};

// Export default config object
export default {
  UserProfiles,
  JobConfig,
  defaultUserRole,
  ServerConfig,
  ChatConfig,
};