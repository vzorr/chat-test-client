// src/config/AppConfig.ts - Complete version with Nested Role Configuration

import * as dotenv from 'dotenv';

// Load environment variables ONLY in Node.js environment
if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
  dotenv.config();
}

// --- Helper Function ---
const getEnvVar = (key: string, fallback: string = ''): string => {
  // In browser with Vite
  // Cast import.meta to 'any' to safely access the bundler-injected 'env' property
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    // Sticking to the key provided for this transformation, as per the prompt's `getEnvVar`.
    const viteKey = `VITE_${key}`;
    const env = (import.meta as any).env;
    return env[key] || env[viteKey] || fallback;
  }

  // In Node.js
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || fallback;
  }

  return fallback;
};

// ==========================================
// PLATFORM DETECTION & TYPES
// ==========================================
const isNodeEnvironment = typeof window === 'undefined' && 
                           typeof global !== 'undefined' && 
                           typeof process !== 'undefined';
const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
const isReactNative = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

export type Platform = 'node' | 'browser' | 'react-native';
export type Environment = 'development' | 'staging' | 'production';
export type StorageType = 'async-storage' | 'localstorage' | 'memory' | 'file';
export type ServiceType = 'rest' | 'socket' | 'hybrid' | 'offline-first';
export type UserRole = 'usta' | 'customer';

const detectPlatform = (): Platform => {
  if (isReactNative) return 'react-native';
  if (isBrowser) return 'browser';
  if (isNodeEnvironment) return 'node';
  return 'node'; // default
};

export const getCurrentEnvironment = (): Environment => {
  const env = getEnvVar('NODE_ENV', 'production');
  return env as Environment;
};

const PLATFORM = detectPlatform();
const ENVIRONMENT = getCurrentEnvironment();

// ==========================================
// BASE URLS CONFIGURATION
// ==========================================
const getBaseUrls = () => {
  const serverUrl = getEnvVar('SERVER_URL', 'https://myusta.al');

  return {
    server: serverUrl,
    api: `${serverUrl}/myusta-backend/api/`,
    chat: getEnvVar('CHAT_API_URL', `${serverUrl}/chat-backend/api/v1/`),
    socket: serverUrl,
    socketPath: getEnvVar('SOCKET_PATH', '/chat-backend/socket.io/'),
  };
};

const BASE_URLS = getBaseUrls();

// ==========================================
// RETRY CONFIGURATION
// ==========================================
const getRetryConfig = () => {
  const maxRetries = parseInt(getEnvVar('MAX_RETRIES', '3'), 10);
  const retryDelay = parseInt(getEnvVar('RETRY_DELAY', '2000'), 10);
  const enableExponentialBackoff = getEnvVar('ENABLE_EXPONENTIAL_BACKOFF', 'false') === 'true';
  const maxRetryDelay = parseInt(getEnvVar('MAX_RETRY_DELAY', '10000'), 10);

  return {
    maxRetries: Math.min(Math.max(maxRetries, 0), 10), // Limit between 0-10
    retryDelay: Math.min(Math.max(retryDelay, 100), 30000), // Limit between 100ms-30s
    enableExponentialBackoff,
    maxRetryDelay: Math.min(Math.max(maxRetryDelay, retryDelay), 60000), // Max 60s
  };
};

const RETRY_CONFIG = getRetryConfig();


// ==========================================
// SHARED CONFIGURATION (Excludes the 'user' object)
// ==========================================
const SHARED_CONFIG = {
  // Environment & Platform
  environment: ENVIRONMENT,
  platform: {
    OS: PLATFORM,
    Version: isNodeEnvironment ? process.version : undefined,
  },
  isDevelopment: ENVIRONMENT === 'development',
  isStaging: ENVIRONMENT === 'staging',
  isProduction: ENVIRONMENT === 'production',
  isNodeEnvironment,
  isBrowser,
  isReactNative,

  // URLs
  urls: BASE_URLS,

  // API Configuration with Retry Settings
  api: {
    baseUrl: BASE_URLS.api,
    timeout: parseInt(getEnvVar('API_TIMEOUT', '30000'), 10),
    retries: RETRY_CONFIG.maxRetries,
    retryDelay: RETRY_CONFIG.retryDelay,
    enableExponentialBackoff: RETRY_CONFIG.enableExponentialBackoff,
    maxRetryDelay: RETRY_CONFIG.maxRetryDelay,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'myusta/2.0.0',
      'X-App-Version': '2.0.0',
      'X-Platform': PLATFORM,
      'X-Environment': ENVIRONMENT,
    },
  },

  // Chat Service Configuration
  chat: {
    baseUrl: BASE_URLS.chat,
    timeout: parseInt(getEnvVar('MESSAGE_TIMEOUT', '30000'), 10),
    uploadTimeout: parseInt(getEnvVar('UPLOAD_TIMEOUT', '60000'), 10),
    maxFileSize: parseInt(getEnvVar('MAX_FILE_SIZE', '10485760'), 10), // 10MB
    maxImageSize: parseInt(getEnvVar('MAX_IMAGE_SIZE', '5242880'), 10), // 5MB
    maxAudioSize: parseInt(getEnvVar('MAX_AUDIO_SIZE', '15728640'), 10), // 15MB
    maxMessageLength: 4000,
    maxAttachmentCount: 10,
    messageCacheSize: parseInt(getEnvVar('MAX_MESSAGE_CACHE', '500'), 10),
    conversationCacheSize: parseInt(getEnvVar('MAX_CONVERSATION_CACHE', '100'), 10),
    pageSize: 50,
    supportedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    supportedAudioTypes: ['audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/m4a'],
    supportedFileTypes: ['application/pdf', 'text/plain', 'application/msword'],
    enableEncryption: ENVIRONMENT === 'production',
    enableOfflineQueue: true,
    offlineQueueSize: 100,
    messageRetryAttempts: 3,
    typingIndicatorTimeout: 3000,
  },

  // Socket Configuration
  socket: {
    url: BASE_URLS.socket,
    path: BASE_URLS.socketPath,
    transports: (getEnvVar('SOCKET_TRANSPORTS')?.split(',') || ['websocket', 'polling']) as ('polling' | 'websocket')[],
    timeout: parseInt(getEnvVar('SOCKET_TIMEOUT', '30000'), 10),
    reconnection: getEnvVar('SOCKET_RECONNECTION', 'true') !== 'false',
    reconnectionAttempts: parseInt(getEnvVar('SOCKET_RECONNECTION_ATTEMPTS', '5'), 10),
    reconnectionDelay: parseInt(getEnvVar('SOCKET_RECONNECTION_DELAY', '2000'), 10),
    reconnectionDelayMax: parseInt(getEnvVar('SOCKET_RECONNECTION_DELAY_MAX', '10000'), 10),
    pingInterval: parseInt(getEnvVar('SOCKET_PING_INTERVAL', '25000'), 10),
    pingTimeout: parseInt(getEnvVar('SOCKET_PING_TIMEOUT', '5000'), 10),
    ackTimeout: 10000,
    forceNew: true,
    autoConnect: true,
    upgrade: true,
    withCredentials: false,
    randomizationFactor: 0.5,
    rememberUpgrade: true,
    closeOnBeforeunload: true,
    enableLogging: getEnvVar('ENABLE_SOCKET_LOGGING', 'false') === 'true',
  },

  // Storage Configuration (Platform-specific)
  storage: {
    type: ((): StorageType => {
      const storageType = getEnvVar('STORAGE_TYPE');
      if (storageType === 'file') return 'file';
      if (storageType === 'memory') return 'memory';
      if (storageType === 'localstorage') return 'localstorage';
      if (storageType === 'async-storage') return 'async-storage';

      switch (PLATFORM) {
        case 'react-native': return 'async-storage';
        case 'browser': return 'localstorage';
        case 'node': return getEnvVar('STORAGE_PATH') ? 'file' : 'memory';
        default: return 'memory';
      }
    })(),
    keyPrefix: PLATFORM === 'react-native' ? '@MyUsta:' : 'myusta_',
    dataPath: getEnvVar('STORAGE_PATH', './chat-data'),
    maxMemorySize: 100 * 1024 * 1024, // 100MB for memory storage
    enableEncryption: getEnvVar('STORAGE_ENCRYPTION_KEY') ? true : false,
    encryptionKey: getEnvVar('STORAGE_ENCRYPTION_KEY', ''),
  },

  // Service Configuration
  service: {
    type: (getEnvVar('SERVICE_TYPE') as ServiceType) || 'hybrid',
    enableOffline: getEnvVar('ENABLE_OFFLINE_MODE', 'true') !== 'false',
    queueStrategy: 'batch' as 'immediate' | 'batch' | 'scheduled',
  },

  // Security Configuration
  security: {
    enableSSLPinning: ENVIRONMENT === 'production',
    enableCertificateValidation: ENVIRONMENT === 'production',
    allowSelfSignedCerts: ENVIRONMENT !== 'production',
    tokenRefreshThreshold: 600000, // 10 minutes
    sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
    apiKeyRotationEnabled: ENVIRONMENT === 'production',
  },

  // Performance Configuration
  performance: {
    enableImageCaching: getEnvVar('ENABLE_IMAGE_CACHING', 'true') !== 'false',
    imageCacheSize: parseInt(getEnvVar('IMAGE_CACHE_SIZE', '300'), 10),
    enableLazyLoading: true,
    enableDataCompression: getEnvVar('ENABLE_DATA_COMPRESSION', 'false') === 'true' || ENVIRONMENT === 'production',
    requestConcurrency: parseInt(getEnvVar('REQUEST_CONCURRENCY', '2'), 10),
    enableRequestDeduplication: true,
    cleanupInterval: parseInt(getEnvVar('CLEANUP_INTERVAL', '300000'), 10), // 5 minutes
  },

  // Debug Configuration
  debug: {
    enabled: getEnvVar('ENABLE_LOGGING', 'false') === 'true' || ENVIRONMENT === 'development',
    logLevel: (getEnvVar('LOG_LEVEL') as 'error' | 'warn' | 'info' | 'debug') ||
              (ENVIRONMENT === 'production' ? 'error' : 'debug'),
    enableVerboseLogging: getEnvVar('ENABLE_VERBOSE_LOGGING', 'false') === 'true',
    enableNetworkLogging: getEnvVar('ENABLE_NETWORK_LOGGING', 'false') === 'true',
    enableSocketLogging: getEnvVar('ENABLE_SOCKET_LOGGING', 'false') === 'true',
    enablePerformanceLogging: getEnvVar('ENABLE_PERFORMANCE_LOGGING', 'false') === 'true',
    enableReduxLogging: false,
    logToFile: getEnvVar('LOG_TO_FILE', 'false') === 'true' || (ENVIRONMENT === 'production' && PLATFORM === 'node'),
    maxLogFileSize: parseInt(getEnvVar('MAX_LOG_FILE_SIZE', '5242880'), 10), // 5MB
  },

  // Feature Flags
  features: {
    enableOfflineMode: getEnvVar('ENABLE_OFFLINE_MODE', 'true') !== 'false',
    enableBetaFeatures: ENVIRONMENT !== 'production',
    enablePerformanceMonitoring: true,
    enableCrashReporting: ENVIRONMENT === 'production',
    enableAnalytics: getEnvVar('ENABLE_ANALYTICS', 'false') === 'true' && ENVIRONMENT === 'production',
    enableBiometricAuth: getEnvVar('ENABLE_BIOMETRIC_AUTH', 'false') === 'true',
    enableDarkMode: true,
    enableVoiceMessages: getEnvVar('ENABLE_VOICE_MESSAGES', 'false') === 'true',
    enableVideoMessages: false,
    enableFileSharing: true,
    enableTypingIndicators: true,
    enableReadReceipts: true,
    enableMessageReactions: getEnvVar('ENABLE_REACTIONS', 'false') === 'true',
    enableMessageEditing: true,
    enableMessageDeletion: true,
    enableGroupChat: false,
    enableEncryption: ENVIRONMENT === 'production',
    enablePushNotifications: getEnvVar('ENABLE_PUSH_NOTIFICATIONS', 'false') === 'true',
    enableBackgroundSync: getEnvVar('ENABLE_BACKGROUND_SYNC', 'false') === 'true',
  },

  // Notification Configuration
  notification: {
    baseUrl: BASE_URLS.chat,
    timeout: 30000,
    fcmEnabled: getEnvVar('ENABLE_PUSH_NOTIFICATIONS', 'false') === 'true',
    pushNotificationsEnabled: getEnvVar('ENABLE_PUSH_NOTIFICATIONS', 'false') === 'true',
    soundEnabled: true,
    vibrationEnabled: true,
    badgeEnabled: true,
    categoryId: 'myusta_notifications',
  },

  // Google Services Configuration
  google: {
    placesApiKey: getEnvVar('GOOGLE_PLACES_API_KEY', 'AIzaSyDK6xDsgrab0VzbnLeEVT1rJHsz2k1mA1c'),
    locationApiKey: getEnvVar('GOOGLE_LOCATION_API_KEY', 'AIzaSyB8ODrHnGGYlUvHJ5omefoaIEM_M9Je0bg'),
    placesUrl: 'https://maps.googleapis.com/maps/api/place/autocomplete/json',
    geocodingUrl: 'https://maps.googleapis.com/maps/api/geocode/json',
    enableLocationServices: true,
    locationAccuracy: 'balanced' as 'high' | 'balanced' | 'low',
    locationTimeout: 10000,
  },

  getCurrentEnvironment,
};

// ==========================================
// ROLE-SPECIFIC CONFIGURATION BLOCKS (Nested)
// ==========================================

// Usta is the active user, Customer is the receiver
const USTA_ROLE_CONFIG = {
  ...SHARED_CONFIG,
  user: {
    // Pulls from USTA specific env vars if available, otherwise falls back to generic/empty
    id: getEnvVar('USTA_ID', getEnvVar('USER_ID', '')),
    name: getEnvVar('USTA_NAME', getEnvVar('USER_NAME', 'Usta')),
    email: getEnvVar('USTA_EMAIL', getEnvVar('USER_EMAIL', '')),
    phone: getEnvVar('USTA_PHONE', getEnvVar('USER_PHONE', '')),
    role: getEnvVar('USTA_ROLE', 'usta') as UserRole,
    token: getEnvVar('USTA_TOKEN', getEnvVar('AUTH_TOKEN', '')),
    // Receiver is Customer
    receiverId: getEnvVar('CUSTOMER_ID', getEnvVar('RECEIVER_ID', '')),
    receiverName: getEnvVar('CUSTOMER_NAME', getEnvVar('RECEIVER_NAME', 'Customer')),
  },
};

// Customer is the active user, Usta is the receiver
const CUSTOMER_ROLE_CONFIG = {
  ...SHARED_CONFIG,
  user: {
    // Pulls from CUSTOMER specific env vars if available, otherwise falls back to generic/empty
    id: getEnvVar('CUSTOMER_ID', getEnvVar('USER_ID', '')),
    name: getEnvVar('CUSTOMER_NAME', getEnvVar('USER_NAME', 'Customer')),
    email: getEnvVar('CUSTOMER_EMAIL', getEnvVar('USER_EMAIL', '')),
    phone: getEnvVar('CUSTOMER_PHONE', getEnvVar('USER_PHONE', '')),
    role: getEnvVar('CUSTOMER_ROLE', 'customer') as UserRole,
    token: getEnvVar('CUSTOMER_TOKEN', getEnvVar('AUTH_TOKEN', '')),
    // Receiver is Usta
    receiverId: getEnvVar('USTA_ID', getEnvVar('RECEIVER_ID', '')),
    receiverName: getEnvVar('USTA_NAME', getEnvVar('RECEIVER_NAME', 'Usta')),
  },
};

// ==========================================
// UNIFIED CONFIGURATION (Exported)
// ==========================================
export const AppConfig = {
  // 1. All shared settings (api, chat, socket, debug, etc.)
  ...SHARED_CONFIG,

  // 2. Role-specific configurations (Access: AppConfig.USTA.user.name)
  USTA: USTA_ROLE_CONFIG,
  CUSTOMER: CUSTOMER_ROLE_CONFIG,

  // 3. Dynamic Current User Config (Access: AppConfig.user.name)
  // Determined by the 'DEFAULT_USER' environment variable ('usta' or 'customer').
  get user() {
    const defaultUserEnv = getEnvVar('DEFAULT_USER', 'usta').toLowerCase();
    return defaultUserEnv === 'usta' ? USTA_ROLE_CONFIG.user : CUSTOMER_ROLE_CONFIG.user;
  },
};

// ==========================================
// LOGGER UTILITY
// ==========================================
// NOTE: Assuming the existence of '../utils/Logger' as requested
import { logger } from '../utils/Logger';

export const AppLogger = {
  debug: (...args: any[]): void => {
    if (AppConfig.debug.enabled && AppConfig.debug.logLevel === 'debug') {
      logger.debug(args.join(' '));
    }
  },

  info: (...args: any[]): void => {
    if (AppConfig.debug.enabled && ['debug', 'info'].includes(AppConfig.debug.logLevel)) {
      logger.info(args.join(' '));
    }
  },

  warn: (...args: any[]): void => {
    if (AppConfig.debug.enabled && ['debug', 'info', 'warn'].includes(AppConfig.debug.logLevel)) {
      logger.warn(args.join(' '));
    }
  },

  error: (...args: any[]): void => {
    if (AppConfig.debug.enabled) {
      logger.error(args.join(' '));
    }
  },

  network: (...args: any[]): void => {
    if (AppConfig.debug.enableNetworkLogging) {
      logger.network(args.join(' '));
    }
  },

  socket: (...args: any[]): void => {
    if (AppConfig.debug.enableSocketLogging) {
      logger.socket(args.join(' '));
    }
  },

  performance: (...args: any[]): void => {
    if (AppConfig.debug.enablePerformanceLogging) {
      logger.performance(args.join(' '));
    }
  },
};

// ==========================================
// CONFIG HELPERS (Standalone functions)
// ==========================================
export const ConfigHelpers = {
  isFeatureEnabled: (featureName: keyof typeof AppConfig.features): boolean =>
    AppConfig.features[featureName] || false,

  getApiTimeout: (): number => AppConfig.api.timeout,

  getSocketConfig: () => AppConfig.socket,

  getChatConfig: () => AppConfig.chat,

  shouldLogNetwork: (): boolean => AppConfig.debug.enableNetworkLogging,

  shouldLogSocket: (): boolean => AppConfig.debug.enableSocketLogging,

  getMaxFileSize: (type: 'file' | 'image' | 'audio' = 'file'): number => {
    switch (type) {
      case 'image': return AppConfig.chat.maxImageSize;
      case 'audio': return AppConfig.chat.maxAudioSize;
      default: return AppConfig.chat.maxFileSize;
    }
  },

  getSupportedFileTypes: (type: 'file' | 'image' | 'audio' = 'file'): string[] => {
    switch (type) {
      case 'image': return AppConfig.chat.supportedImageTypes;
      case 'audio': return AppConfig.chat.supportedAudioTypes;
      default: return AppConfig.chat.supportedFileTypes;
    }
  },
  
  // Note: These now use the dynamic AppConfig.user
  getUserConfig: () => ({
    userId: AppConfig.user.id,
    userName: AppConfig.user.name,
    userEmail: AppConfig.user.email,
    userPhone: AppConfig.user.phone,
    userRole: AppConfig.user.role,
  }),

  getReceiverConfig: () => ({
    receiverId: AppConfig.user.receiverId,
    receiverName: AppConfig.user.receiverName,
  }),

  getAuthToken: (): string => AppConfig.user.token,
};

// ==========================================
// CONFIGURATION VALIDATORS
// ==========================================
export const validateConfig = (): { isValid: boolean; errors: string[]; warnings: string[] } => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate URLs
  try {
    new URL(AppConfig.urls.server);
  } catch {
    errors.push(`Invalid SERVER_URL: ${AppConfig.urls.server}`);
  }

  try {
    new URL(AppConfig.urls.chat);
  } catch {
    errors.push(`Invalid CHAT_API_URL: ${AppConfig.urls.chat}`);
  }

  // Validate required environment variables for production (using dynamic user)
  if (!AppConfig.user.token && AppConfig.environment === 'production') {
    errors.push(`AUTH_TOKEN is required for active role (${AppConfig.user.role}) in production`);
  }

  if (!AppConfig.user.id) {
    warnings.push(`USER_ID is not set for active role: ${AppConfig.user.role}`);
  }

  if (!AppConfig.user.receiverId) {
    warnings.push('RECEIVER_ID is not set - messaging may fail');
  }

  // Validate numeric values
  if (isNaN(AppConfig.socket.timeout) || AppConfig.socket.timeout <= 0) {
    errors.push(`Invalid SOCKET_TIMEOUT: ${getEnvVar('SOCKET_TIMEOUT')}`);
  }

  if (isNaN(AppConfig.api.retries) || AppConfig.api.retries < 0) {
    errors.push(`Invalid MAX_RETRIES: ${getEnvVar('MAX_RETRIES')}`);
  }

  if (AppConfig.api.timeout < 1000) {
    warnings.push(`API timeout is very short: ${AppConfig.api.timeout}ms`);
  }

  if (AppConfig.socket.reconnectionAttempts > 10) {
    warnings.push(`High number of reconnection attempts: ${AppConfig.socket.reconnectionAttempts}`);
  }

  // Environment-specific warnings
  if (AppConfig.isProduction && AppConfig.debug.enabled) {
    warnings.push('Debug logging is enabled in production');
  }

  if (AppConfig.isProduction && !AppConfig.security.enableSSLPinning) {
    warnings.push('SSL Pinning is disabled in production');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

// ==========================================
// INITIALIZATION LOGGING
// ==========================================
if (AppConfig.debug.enabled) {
  const validation = validateConfig();

  // Logging uses the dynamic AppConfig.user
  logger.info('🚀 AppConfig Initialized', {
    platform: AppConfig.platform.OS,
    environment: AppConfig.environment,
    apiUrl: AppConfig.urls.api,
    chatUrl: AppConfig.urls.chat,
    socketUrl: `${AppConfig.urls.socket}${AppConfig.socket.path}`,
    storage: AppConfig.storage.type,
    service: AppConfig.service.type,
    activeRole: AppConfig.user.role,
  });

  if (AppConfig.user.token) {
    logger.info('🔐 Authentication configured', {
      userId: AppConfig.user.id || 'Not set',
      receiverId: AppConfig.user.receiverId || 'Not set',
    });
  }

  if (validation.errors.length > 0) {
    logger.error('❌ Configuration Errors:', validation.errors);
    if (AppConfig.isProduction) {
      throw new Error(`Configuration errors: ${validation.errors.join(', ')}`);
    }
  }

  if (validation.warnings.length > 0) {
    logger.warn('⚠️  Configuration Warnings:', validation.warnings);
  }

  if (validation.errors.length === 0) {
    logger.info('✅ Configuration validation passed');
  }
}

// ==========================================
// LEGACY EXPORTS FOR BACKWARD COMPATIBILITY
// ==========================================
export const SocketConfig = AppConfig.socket;
export const ApiConfig = AppConfig.api;
export const ChatConfig = AppConfig.chat;
export const NotificationConfig = AppConfig.notification;
export const GoogleConfig = AppConfig.google;
export const SecurityConfig = AppConfig.security;
export const PerformanceConfig = AppConfig.performance;
export const DebugConfig = AppConfig.debug;
export const FeatureFlags = AppConfig.features;

export const BASE_API_URL = AppConfig.api.baseUrl;
export const BASE_SOCKET_URL = AppConfig.socket.url;
export const BASE_CHAT_URL = AppConfig.chat.baseUrl;
export const BASE_NOTIFICATION_URL = AppConfig.notification.baseUrl;
export const GOOGLE_PLACES_URL = AppConfig.google.placesUrl;
export const GOOGLE_PLACES_API_KEY = AppConfig.google.placesApiKey;
export const GOOGLE_LOCATION_API_KEY = AppConfig.google.locationApiKey;


// ==========================================
// DEFAULT EXPORT
// ==========================================
export default AppConfig;