// src/config/AppConfig.ts - Single Source of Truth for All Configuration
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// ==========================================
// PLATFORM DETECTION
// ==========================================
const isNodeEnvironment = typeof window === 'undefined' && typeof global !== 'undefined';
const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
const isReactNative = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

export type Platform = 'node' | 'browser' | 'react-native';
export type Environment = 'development' | 'staging' | 'production';
export type StorageType = 'async-storage' | 'localstorage' | 'memory' | 'file';
export type ServiceType = 'rest' | 'socket' | 'hybrid' | 'offline-first';

const detectPlatform = (): Platform => {
  if (isReactNative) return 'react-native';
  if (isBrowser) return 'browser';
  if (isNodeEnvironment) return 'node';
  return 'node'; // default
};

export const getCurrentEnvironment = (): Environment => {
  const env = process.env.NODE_ENV || 'production';
  return env as Environment;
};

const PLATFORM = detectPlatform();
const ENVIRONMENT = getCurrentEnvironment();

// ==========================================
// BASE URLS CONFIGURATION
// ==========================================
const getBaseUrls = () => {
  const serverUrl = process.env.SERVER_URL || 'https://myusta.al';
  
  return {
    server: serverUrl,
    api: `${serverUrl}/myusta-backend/api/`,
    chat: process.env.CHAT_API_URL || `${serverUrl}/chat-backend/api/v1/`,
    socket: serverUrl,
    socketPath: process.env.SOCKET_PATH || '/chat-backend/socket.io/',
  };
};

const BASE_URLS = getBaseUrls();

// ==========================================
// RETRY CONFIGURATION
// ==========================================
const getRetryConfig = () => {
  const maxRetries = parseInt(process.env.MAX_RETRIES || '3', 10);
  const retryDelay = parseInt(process.env.RETRY_DELAY || '2000', 10);
  const enableExponentialBackoff = process.env.ENABLE_EXPONENTIAL_BACKOFF === 'true';
  const maxRetryDelay = parseInt(process.env.MAX_RETRY_DELAY || '10000', 10);

  return {
    maxRetries: Math.min(Math.max(maxRetries, 0), 10), // Limit between 0-10
    retryDelay: Math.min(Math.max(retryDelay, 100), 30000), // Limit between 100ms-30s
    enableExponentialBackoff,
    maxRetryDelay: Math.min(Math.max(maxRetryDelay, retryDelay), 60000), // Max 60s
  };
};

const RETRY_CONFIG = getRetryConfig();

// ==========================================
// UNIFIED CONFIGURATION
// ==========================================
export const AppConfig = {
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
    timeout: parseInt(process.env.API_TIMEOUT || '30000', 10),
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
    timeout: parseInt(process.env.MESSAGE_TIMEOUT || '30000', 10),
    uploadTimeout: parseInt(process.env.UPLOAD_TIMEOUT || '60000', 10),
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB
    maxImageSize: parseInt(process.env.MAX_IMAGE_SIZE || '5242880', 10), // 5MB
    maxAudioSize: parseInt(process.env.MAX_AUDIO_SIZE || '15728640', 10), // 15MB
    maxMessageLength: 4000,
    maxAttachmentCount: 10,
    messageCacheSize: parseInt(process.env.MAX_MESSAGE_CACHE || '500', 10),
    conversationCacheSize: parseInt(process.env.MAX_CONVERSATION_CACHE || '100', 10),
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
    transports: (process.env.SOCKET_TRANSPORTS?.split(',') || ['websocket', 'polling']) as ('polling' | 'websocket')[],
    timeout: parseInt(process.env.SOCKET_TIMEOUT || '30000', 10),
    reconnection: process.env.SOCKET_RECONNECTION !== 'false',
    reconnectionAttempts: parseInt(process.env.SOCKET_RECONNECTION_ATTEMPTS || '5', 10),
    reconnectionDelay: parseInt(process.env.SOCKET_RECONNECTION_DELAY || '2000', 10),
    reconnectionDelayMax: parseInt(process.env.SOCKET_RECONNECTION_DELAY_MAX || '10000', 10),
    pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL || '25000', 10),
    pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT || '5000', 10),
    ackTimeout: 10000,
    forceNew: true,
    autoConnect: true,
    upgrade: true,
    withCredentials: false,
    randomizationFactor: 0.5,
    rememberUpgrade: true,
    closeOnBeforeunload: true,
    enableLogging: process.env.ENABLE_LOGGING === 'true',
  },
  
  // Storage Configuration (Platform-specific)
  storage: {
    type: ((): StorageType => {
      // Check environment variable first
      const storageType = process.env.STORAGE_TYPE;
      if (storageType === 'file') return 'file';
      if (storageType === 'memory') return 'memory';
      
      // Platform defaults
      switch (PLATFORM) {
        case 'react-native': return 'async-storage';
        case 'browser': return 'localstorage';
        case 'node': return 'memory';
        default: return 'memory';
      }
    })(),
    keyPrefix: PLATFORM === 'react-native' ? '@MyUsta:' : 'myusta_',
    dataPath: process.env.STORAGE_PATH || './chat-data',
    maxMemorySize: 100 * 1024 * 1024, // 100MB for memory storage
    enableEncryption: process.env.STORAGE_ENCRYPTION_KEY ? true : false,
    encryptionKey: process.env.STORAGE_ENCRYPTION_KEY || '',
  },
  
  // Service Configuration
  service: {
    type: (process.env.SERVICE_TYPE as ServiceType) || 'hybrid',
    enableOffline: process.env.ENABLE_OFFLINE_MODE !== 'false',
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
    enableImageCaching: process.env.ENABLE_IMAGE_CACHING !== 'false',
    imageCacheSize: parseInt(process.env.IMAGE_CACHE_SIZE || '300', 10),
    enableLazyLoading: true,
    enableDataCompression: process.env.ENABLE_DATA_COMPRESSION === 'true' || ENVIRONMENT === 'production',
    requestConcurrency: parseInt(process.env.REQUEST_CONCURRENCY || '2', 10),
    enableRequestDeduplication: true,
    cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL || '300000', 10), // 5 minutes
  },
  
  // Debug Configuration
  debug: {
    enabled: process.env.ENABLE_LOGGING === 'true' || ENVIRONMENT === 'development',
    logLevel: (process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug') || 
              (ENVIRONMENT === 'production' ? 'error' : 'debug'),
    enableVerboseLogging: process.env.ENABLE_VERBOSE_LOGGING === 'true',
    enableNetworkLogging: process.env.ENABLE_NETWORK_LOGGING === 'true',
    enableSocketLogging: process.env.ENABLE_SOCKET_LOGGING === 'true',
    enablePerformanceLogging: process.env.ENABLE_PERFORMANCE_LOGGING === 'true',
    enableReduxLogging: false,
    logToFile: process.env.LOG_TO_FILE === 'true' || (ENVIRONMENT === 'production' && PLATFORM === 'node'),
    maxLogFileSize: parseInt(process.env.MAX_LOG_FILE_SIZE || '5242880', 10), // 5MB
  },
  
  // Feature Flags
  features: {
    enableOfflineMode: process.env.ENABLE_OFFLINE_MODE !== 'false',
    enableBetaFeatures: ENVIRONMENT !== 'production',
    enablePerformanceMonitoring: true,
    enableCrashReporting: ENVIRONMENT === 'production',
    enableAnalytics: process.env.ENABLE_ANALYTICS === 'true' && ENVIRONMENT === 'production',
    enableBiometricAuth: process.env.ENABLE_BIOMETRIC_AUTH === 'true',
    enableDarkMode: true,
    enableVoiceMessages: process.env.ENABLE_VOICE_MESSAGES === 'true',
    enableVideoMessages: false,
    enableFileSharing: true,
    enableTypingIndicators: true,
    enableReadReceipts: true,
    enableMessageReactions: process.env.ENABLE_REACTIONS === 'true',
    enableMessageEditing: true,
    enableMessageDeletion: true,
    enableGroupChat: false, // Not implemented yet
    enableEncryption: ENVIRONMENT === 'production',
    enablePushNotifications: process.env.ENABLE_PUSH_NOTIFICATIONS === 'true',
    enableBackgroundSync: process.env.ENABLE_BACKGROUND_SYNC === 'true',
  },
  
  // Notification Configuration
  notification: {
    baseUrl: BASE_URLS.chat,
    timeout: 30000,
    fcmEnabled: process.env.ENABLE_PUSH_NOTIFICATIONS === 'true',
    pushNotificationsEnabled: process.env.ENABLE_PUSH_NOTIFICATIONS === 'true',
    soundEnabled: true,
    vibrationEnabled: true,
    badgeEnabled: true,
    categoryId: 'myusta_notifications',
  },
  
  // Google Services Configuration
  google: {
    placesApiKey: process.env.GOOGLE_PLACES_API_KEY || 'AIzaSyDK6xDsgrab0VzbnLeEVT1rJHsz2k1mA1c',
    locationApiKey: process.env.GOOGLE_LOCATION_API_KEY || 'AIzaSyB8ODrHnGGYlUvHJ5omefoaIEM_M9Je0bg',
    placesUrl: 'https://maps.googleapis.com/maps/api/place/autocomplete/json',
    geocodingUrl: 'https://maps.googleapis.com/maps/api/geocode/json',
    enableLocationServices: true,
    locationAccuracy: 'balanced' as 'high' | 'balanced' | 'low',
    locationTimeout: 10000,
  },
  
  // User Configuration (from env)
  user: {
    id: process.env.USER_ID || '',
    name: process.env.USER_NAME || '',
    email: process.env.USER_EMAIL || '',
    phone: process.env.USER_PHONE || '',
    role: process.env.USER_ROLE || 'customer',
    token: process.env.AUTH_TOKEN || '',
    receiverId: process.env.RECEIVER_ID || '',
    receiverName: process.env.RECEIVER_NAME || '',
  },
  
  getCurrentEnvironment,
};

// ==========================================
// LOGGER UTILITY
// ==========================================
export const AppLogger = {
  debug: (...args: any[]): void => {
    if (AppConfig.debug.enabled && AppConfig.debug.logLevel === 'debug') {
      console.log('[DEBUG]', new Date().toISOString(), ...args);
    }
  },
  
  info: (...args: any[]): void => {
    if (AppConfig.debug.enabled && ['debug', 'info'].includes(AppConfig.debug.logLevel)) {
      console.info('[INFO]', new Date().toISOString(), ...args);
    }
  },
  
  warn: (...args: any[]): void => {
    if (AppConfig.debug.enabled && ['debug', 'info', 'warn'].includes(AppConfig.debug.logLevel)) {
      console.warn('[WARN]', new Date().toISOString(), ...args);
    }
  },
  
  error: (...args: any[]): void => {
    if (AppConfig.debug.enabled) {
      console.error('[ERROR]', new Date().toISOString(), ...args);
    }
  },
  
  network: (...args: any[]): void => {
    if (AppConfig.debug.enableNetworkLogging) {
      console.log('[NETWORK]', new Date().toISOString(), ...args);
    }
  },
  
  socket: (...args: any[]): void => {
    if (AppConfig.debug.enableSocketLogging) {
      console.log('[SOCKET]', new Date().toISOString(), ...args);
    }
  },
  
  performance: (...args: any[]): void => {
    if (AppConfig.debug.enablePerformanceLogging) {
      console.log('[PERF]', new Date().toISOString(), ...args);
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

  // Validate required environment variables for production
  if (!AppConfig.user.token && AppConfig.environment === 'production') {
    errors.push('AUTH_TOKEN is required in production');
  }
  
  if (!AppConfig.user.id) {
    warnings.push('USER_ID is not set - using defaults');
  }

  if (!AppConfig.user.receiverId) {
    warnings.push('RECEIVER_ID is not set - messaging may fail');
  }

  // Validate numeric values
  if (isNaN(AppConfig.socket.timeout) || AppConfig.socket.timeout <= 0) {
    errors.push(`Invalid SOCKET_TIMEOUT: ${process.env.SOCKET_TIMEOUT}`);
  }

  if (isNaN(AppConfig.api.retries) || AppConfig.api.retries < 0) {
    errors.push(`Invalid MAX_RETRIES: ${process.env.MAX_RETRIES}`);
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
  
  AppLogger.info('🚀 AppConfig Initialized', {
    platform: AppConfig.platform.OS,
    environment: AppConfig.environment,
    apiUrl: AppConfig.urls.api,
    chatUrl: AppConfig.urls.chat,
    socketUrl: `${AppConfig.urls.socket}${AppConfig.socket.path}`,
    storage: AppConfig.storage.type,
    service: AppConfig.service.type,
  });

  if (AppConfig.user.token) {
    AppLogger.info('🔐 Authentication configured', {
      userId: AppConfig.user.id || 'Not set',
      receiverId: AppConfig.user.receiverId || 'Not set',
    });
  }

  if (validation.errors.length > 0) {
    AppLogger.error('❌ Configuration Errors:', validation.errors);
    if (AppConfig.isProduction) {
      throw new Error(`Configuration errors: ${validation.errors.join(', ')}`);
    }
  }

  if (validation.warnings.length > 0) {
    AppLogger.warn('⚠️  Configuration Warnings:', validation.warnings);
  }

  if (validation.errors.length === 0) {
    AppLogger.info('✅ Configuration validation passed');
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