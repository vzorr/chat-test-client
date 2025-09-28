// AppConfig.ts - TypeScript Enhanced Configuration Management
import {Platform} from 'react-native';


// Environment types
type Environment = 'development' | 'staging' | 'production';

// Configuration interfaces
interface ApiConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
  retryDelay: number;
  enableLogging: boolean;
}

interface SocketConfig {
  url: string;
  path: string;
  transports: string[];
  timeout: number;
  reconnection: boolean;
  reconnectionAttempts: number;
  reconnectionDelay: number;
  reconnectionDelayMax: number;
  randomizationFactor: number;
  forceNew: boolean;
  autoConnect: boolean;
  upgrade: boolean;
  rememberUpgrade: boolean;
  withCredentials: boolean;
  ackTimeout: number;
  retries: number;
  closeOnBeforeunload: boolean;
  enableLogging: boolean;
  pingInterval: number;
  pingTimeout: number;
}

interface ChatConfig {
  baseUrl: string;
  timeout: number;
  uploadTimeout: number;
  maxFileSize: number;
  maxImageSize: number;
  maxAudioSize: number;
  supportedImageTypes: string[];
  supportedAudioTypes: string[];
  supportedFileTypes: string[];
  enableMessageEncryption: boolean;
  enableOfflineMessages: boolean;
  messageCacheSize: number;
}

interface NotificationConfig {
  baseUrl: string;
  timeout: number;
  fcmEnabled: boolean;
  pushNotificationsEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  badgeEnabled: boolean;
  categoryId: string;
}

interface GoogleConfig {
  placesApiKey: string;
  locationApiKey: string;
  placesUrl: string;
  geocodingUrl: string;
  enableLocationServices: boolean;
  locationAccuracy: string;
  locationTimeout: number;
}

interface SecurityConfig {
  enableSSLPinning: boolean;
  enableCertificateValidation: boolean;
  allowSelfSignedCerts: boolean;
  apiKeyRotationEnabled: boolean;
  tokenRefreshThreshold: number;
}

interface PerformanceConfig {
  enableImageCaching: boolean;
  imageCacheSize: number;
  enableLazyLoading: boolean;
  enableDataCompression: boolean;
  requestConcurrency: number;
  enableRequestDeduplication: boolean;
}

interface DebugConfig {
  enableLogging: boolean;
  enableVerboseLogging: boolean;
  enableNetworkLogging: boolean;
  enableSocketLogging: boolean;
  enableReduxLogging: boolean;
  enablePerformanceLogging: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logToFile: boolean;
  maxLogFileSize: number;
}

interface FeatureFlags {
  enableOfflineMode: boolean;
  enableBetaFeatures: boolean;
  enablePerformanceMonitoring: boolean;
  enableCrashReporting: boolean;
  enableAnalytics: boolean;
  enableBiometricAuth: boolean;
  enableDarkMode: boolean;
  enableVoiceMessages: boolean;
  enableVideoMessages: boolean;
  enableFileSharing: boolean;
  enableTypingIndicators: boolean;
  enableReadReceipts: boolean;
  enableMessageReactions: boolean;
}

interface EnvironmentConfig {
  api: ApiConfig;
  socket: SocketConfig;
  chat: ChatConfig;
  notification: NotificationConfig;
  google: GoogleConfig;
  security: SecurityConfig;
  performance: PerformanceConfig;
  debug: DebugConfig;
  features: FeatureFlags;
}



// Environment Detection
const isDevelopment = false;
const ENVIRONMENT: Environment = isDevelopment ? 'development' : 'production';

// Manual environment override (useful for testing)
// Set this to 'development', 'staging', or 'production' to override
const FORCE_ENVIRONMENT: Environment | null = 'production';

const getCurrentEnvironment = (): Environment => {
  if (FORCE_ENVIRONMENT) {
    console.log(`🔧 Environment overridden to: ${FORCE_ENVIRONMENT}`);
    return FORCE_ENVIRONMENT;
  }
  return ENVIRONMENT;
};

// Environment-specific configurations
const CONFIGURATIONS: Record<Environment, EnvironmentConfig> = {
  development: {
    // Main API Configuration
    api: {
      baseUrl: 'http://10.0.2.2:3000/api/',
      timeout: 30000,
      retries: 3,
      retryDelay: 1000,
      enableLogging: true,
    },

    // Socket.IO Configuration - Enhanced for v4
    socket: {
      url: 'http://10.0.2.2:5000',
      path: '/socket.io/', // Standard Socket.IO path for development
      transports: ['polling', 'websocket'], // Polling first for development stability
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      forceNew: true,
      autoConnect: true,
      upgrade: true,
      rememberUpgrade: true,
      withCredentials: false,
      // v4 specific options
      ackTimeout: 5000,
      retries: 3,
      closeOnBeforeunload: true,
      // Custom options
      enableLogging: true,
      pingInterval: 25000,
      pingTimeout: 5000,
    },

    // Chat Service Configuration
    chat: {
      baseUrl: 'http://10.0.2.2:5000/api/v1/',
      timeout: 30000,
      uploadTimeout: 60000, // Longer timeout for file uploads
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxImageSize: 5 * 1024 * 1024, // 5MB for images
      maxAudioSize: 15 * 1024 * 1024, // 15MB for audio
      supportedImageTypes: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
      ],
      supportedAudioTypes: [
        'audio/mp4',
        'audio/mpeg',
        'audio/wav',
        'audio/m4a',
      ],
      supportedFileTypes: [
        'application/pdf',
        'text/plain',
        'application/msword',
      ],
      enableMessageEncryption: false, // Disable in development
      enableOfflineMessages: true,
      messageCacheSize: 1000,
    },

    // Notification Service Configuration
    notification: {
      baseUrl: 'http://10.0.2.2:5000/api/v1/',
      timeout: 30000,
      fcmEnabled: true,
      pushNotificationsEnabled: true,
      soundEnabled: true,
      vibrationEnabled: true,
      badgeEnabled: true,
      categoryId: 'myusta_notifications',
    },

    // Google Services Configuration
    google: {
      placesApiKey: 'AIzaSyDK6xDsgrab0VzbnLeEVT1rJHsz2k1mA1c',
      locationApiKey: 'AIzaSyB8ODrHnGGYlUvHJ5omefoaIEM_M9Je0bg',
      placesUrl: 'https://maps.googleapis.com/maps/api/place/autocomplete/json',
      geocodingUrl: 'https://maps.googleapis.com/maps/api/geocode/json',
      enableLocationServices: true,
      locationAccuracy: 'high',
      locationTimeout: 15000,
    },

    // Security Configuration
    security: {
      enableSSLPinning: false,
      enableCertificateValidation: false,
      allowSelfSignedCerts: true,
      apiKeyRotationEnabled: false,
      tokenRefreshThreshold: 300000, // 5 minutes
    },

    // Performance Configuration
    performance: {
      enableImageCaching: true,
      imageCacheSize: 100,
      enableLazyLoading: true,
      enableDataCompression: false,
      requestConcurrency: 5,
      enableRequestDeduplication: true,
    },

    // Debug & Logging Configuration
    debug: {
      enableLogging: true,
      enableVerboseLogging: true,
      enableNetworkLogging: true,
      enableSocketLogging: true,
      enableReduxLogging: true,
      enablePerformanceLogging: true,
      logLevel: 'debug', // 'debug', 'info', 'warn', 'error'
      logToFile: false,
      maxLogFileSize: 5 * 1024 * 1024, // 5MB
    },

    // Feature Flags
    features: {
      enableOfflineMode: true,
      enableBetaFeatures: true,
      enablePerformanceMonitoring: true,
      enableCrashReporting: false, // Disable in development
      enableAnalytics: false, // Disable in development
      enableBiometricAuth: false,
      enableDarkMode: true,
      enableVoiceMessages: true,
      enableVideoMessages: false,
      enableFileSharing: true,
      enableTypingIndicators: true,
      enableReadReceipts: true,
      enableMessageReactions: false,
    },
  },

  staging: {
    // Main API Configuration
    api: {
      baseUrl: 'http://151.243.213.116:3000/api/',
      timeout: 30000,
      retries: 2,
      retryDelay: 1500,
      enableLogging: true,
    },

    // Socket.IO Configuration
    socket: {
      url: 'http://151.243.213.116:5000',
      path: '/socket.io/',
      transports: ['websocket', 'polling'], // WebSocket first for staging
      timeout: 25000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      forceNew: true,
      autoConnect: true,
      upgrade: true,
      rememberUpgrade: true,
      withCredentials: false,
      // v4 specific options
      ackTimeout: 7000,
      retries: 2,
      closeOnBeforeunload: true,
      // Custom options
      enableLogging: true,
      pingInterval: 25000,
      pingTimeout: 5000,
    },

    // Chat Service Configuration
    chat: {
      baseUrl: 'http://151.243.213.116:5000/api/v1/',
      timeout: 30000,
      uploadTimeout: 60000,
      maxFileSize: 10 * 1024 * 1024,
      maxImageSize: 5 * 1024 * 1024,
      maxAudioSize: 15 * 1024 * 1024,
      supportedImageTypes: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
      ],
      supportedAudioTypes: [
        'audio/mp4',
        'audio/mpeg',
        'audio/wav',
        'audio/m4a',
      ],
      supportedFileTypes: [
        'application/pdf',
        'text/plain',
        'application/msword',
      ],
      enableMessageEncryption: true,
      enableOfflineMessages: true,
      messageCacheSize: 1000,
    },

    // Notification Service Configuration
    notification: {
      baseUrl: 'http://151.243.213.116:5000/api/v1/',
      timeout: 30000,
      fcmEnabled: true,
      pushNotificationsEnabled: true,
      soundEnabled: true,
      vibrationEnabled: true,
      badgeEnabled: true,
      categoryId: 'myusta_staging_notifications',
    },

    // Google Services Configuration
    google: {
      placesApiKey: 'AIzaSyDK6xDsgrab0VzbnLeEVT1rJHsz2k1mA1c',
      locationApiKey: 'AIzaSyB8ODrHnGGYlUvHJ5omefoaIEM_M9Je0bg',
      placesUrl: 'https://maps.googleapis.com/maps/api/place/autocomplete/json',
      geocodingUrl: 'https://maps.googleapis.com/maps/api/geocode/json',
      enableLocationServices: true,
      locationAccuracy: 'high',
      locationTimeout: 15000,
    },

    // Security Configuration
    security: {
      enableSSLPinning: true,
      enableCertificateValidation: true,
      allowSelfSignedCerts: false,
      apiKeyRotationEnabled: true,
      tokenRefreshThreshold: 300000,
    },

    // Performance Configuration
    performance: {
      enableImageCaching: true,
      imageCacheSize: 200,
      enableLazyLoading: true,
      enableDataCompression: true,
      requestConcurrency: 3,
      enableRequestDeduplication: true,
    },

    // Debug & Logging Configuration
    debug: {
      enableLogging: true,
      enableVerboseLogging: false,
      enableNetworkLogging: true,
      enableSocketLogging: true,
      enableReduxLogging: false,
      enablePerformanceLogging: true,
      logLevel: 'info',
      logToFile: true,
      maxLogFileSize: 10 * 1024 * 1024, // 10MB
    },

    // Feature Flags
    features: {
      enableOfflineMode: true,
      enableBetaFeatures: true,
      enablePerformanceMonitoring: true,
      enableCrashReporting: true,
      enableAnalytics: true,
      enableBiometricAuth: true,
      enableDarkMode: true,
      enableVoiceMessages: true,
      enableVideoMessages: false,
      enableFileSharing: true,
      enableTypingIndicators: true,
      enableReadReceipts: true,
      enableMessageReactions: true,
    },
  },

  production: {
    // Main API Configuration
    api: {
      baseUrl: 'https://myusta.al/myusta-backend/api/',
      timeout: 30000,
      retries: 2,
      retryDelay: 2000,
      enableLogging: false,
    },

    // Socket.IO Configuration
    socket: {
      url: 'https://myusta.al',
      path: '/chat-backend/socket.io/', // Custom path for production
      transports: ['websocket', 'polling'], // WebSocket first for performance
      timeout: 30000,
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
      forceNew: true,
      autoConnect: true,
      upgrade: true,
      rememberUpgrade: true,
      withCredentials: false,
      // v4 specific options
      ackTimeout: 10000,
      retries: 2,
      closeOnBeforeunload: true,
      // Custom options
      enableLogging: false,
      pingInterval: 25000,
      pingTimeout: 5000,
    },

    // Chat Service Configuration
    chat: {
      baseUrl: 'https://myusta.al/chat-backend/api/v1/',
      timeout: 30000,
      uploadTimeout: 60000,
      maxFileSize: 10 * 1024 * 1024,
      maxImageSize: 5 * 1024 * 1024,
      maxAudioSize: 15 * 1024 * 1024,
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/gif'],
      supportedAudioTypes: ['audio/mp4', 'audio/mpeg', 'audio/wav'],
      supportedFileTypes: ['application/pdf', 'text/plain'],
      enableMessageEncryption: true,
      enableOfflineMessages: true,
      messageCacheSize: 500,
    },

    // Notification Service Configuration
    notification: {
      baseUrl: 'https://myusta.al/chat-backend/api/v1/',
      timeout: 30000,
      fcmEnabled: true,
      pushNotificationsEnabled: true,
      soundEnabled: true,
      vibrationEnabled: true,
      badgeEnabled: true,
      categoryId: 'myusta_notifications',
    },

    // Google Services Configuration
    google: {
      placesApiKey: 'AIzaSyDK6xDsgrab0VzbnLeEVT1rJHsz2k1mA1c',
      locationApiKey: 'AIzaSyB8ODrHnGGYlUvHJ5omefoaIEM_M9Je0bg',
      placesUrl: 'https://maps.googleapis.com/maps/api/place/autocomplete/json',
      geocodingUrl: 'https://maps.googleapis.com/maps/api/geocode/json',
      enableLocationServices: true,
      locationAccuracy: 'balanced',
      locationTimeout: 10000,
    },

    // Security Configuration
    security: {
      enableSSLPinning: true,
      enableCertificateValidation: true,
      allowSelfSignedCerts: false,
      apiKeyRotationEnabled: true,
      tokenRefreshThreshold: 600000, // 10 minutes
    },

    // Performance Configuration
    performance: {
      enableImageCaching: true,
      imageCacheSize: 300,
      enableLazyLoading: true,
      enableDataCompression: true,
      requestConcurrency: 2,
      enableRequestDeduplication: true,
    },

    // Debug & Logging Configuration
    debug: {
      enableLogging: false,
      enableVerboseLogging: false,
      enableNetworkLogging: false,
      enableSocketLogging: false,
      enableReduxLogging: false,
      enablePerformanceLogging: false,
      logLevel: 'error',
      logToFile: true,
      maxLogFileSize: 5 * 1024 * 1024, // 5MB
    },

    // Feature Flags
    features: {
      enableOfflineMode: false,
      enableBetaFeatures: false,
      enablePerformanceMonitoring: true,
      enableCrashReporting: true,
      enableAnalytics: true,
      enableBiometricAuth: true,
      enableDarkMode: true,
      enableVoiceMessages: true,
      enableVideoMessages: false,
      enableFileSharing: true,
      enableTypingIndicators: true,
      enableReadReceipts: true,
      enableMessageReactions: true,
    },
  },
};

// Get current environment configuration
const currentEnv = getCurrentEnvironment();
const config = CONFIGURATIONS[currentEnv];
console.log('currentEnv', currentEnv);
if (!config) {
  throw new Error(`Configuration not found for environment: ${currentEnv}`);
}

// Configuration validation
const validateConfig = (config: EnvironmentConfig): void => {
  const requiredFields = [
    'api.baseUrl',
    'socket.url',
    'chat.baseUrl',
    'notification.baseUrl',
    'google.placesApiKey', // Re-added this for Client.ts compatibility
  ];

  const missing = requiredFields.filter(field => {
    const value = field
      .split('.')
      .reduce((obj: any, key) => obj?.[key], config);
    return !value;
  });

  if (missing.length > 0) {
    console.error('❌ Missing required configuration fields:', missing);
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }

  // Validate socket configuration
  if (config.socket.timeout < 5000) {
    console.warn('⚠️ Socket timeout is very low, may cause connection issues');
  }

  if (config.chat.maxFileSize > 50 * 1024 * 1024) {
    console.warn('⚠️ File size limit is very high, may cause memory issues');
  }

  console.log(' Configuration validation passed');
};

// Validate current configuration
validateConfig(config);


// Enhanced logging utility based on configuration
export const AppLogger = {
  debug: (...args: any[]): void => {
    if (config.debug.enableLogging && config.debug.logLevel === 'debug') {
      console.log('[DEBUG]', new Date().toISOString(), ...args);
    }
  },
  info: (...args: any[]): void => {
    if (
      config.debug.enableLogging &&
      ['debug', 'info'].includes(config.debug.logLevel)
    ) {
      console.info('[INFO]', new Date().toISOString(), ...args);
    }
  },
  warn: (...args: any[]): void => {
    if (
      config.debug.enableLogging &&
      ['debug', 'info', 'warn'].includes(config.debug.logLevel)
    ) {
      console.warn('[WARN]', new Date().toISOString(), ...args);
    }
  },
  error: (...args: any[]): void => {
    if (config.debug.enableLogging) {
      console.error('[ERROR]', new Date().toISOString(), ...args);
    }
  },
  socket: (...args: any[]): void => {
    if (config.debug.enableSocketLogging) {
      console.log('[SOCKET]', new Date().toISOString(), ...args);
    }
  },
  network: (...args: any[]): void => {
    if (config.debug.enableNetworkLogging) {
      console.log('[NETWORK]', new Date().toISOString(), ...args);
    }
  },
  performance: (...args: any[]): void => {
    if (config.debug.enablePerformanceLogging) {
      console.log('[PERF]', new Date().toISOString(), ...args);
    }
  },
};

// Configuration helper functions
export const ConfigHelpers = {
  isFeatureEnabled: (featureName: keyof FeatureFlags): boolean =>
    config.features[featureName] || false,
  getApiTimeout: (): number => config.api.timeout,
  getSocketConfig: (): SocketConfig => config.socket,
  getChatConfig: (): ChatConfig => config.chat,
  shouldLogNetwork: (): boolean => config.debug.enableNetworkLogging,
  shouldLogSocket: (): boolean => config.debug.enableSocketLogging,
  getMaxFileSize: (type: 'file' | 'image' | 'audio' = 'file'): number => {
    switch (type) {
      case 'image':
        return config.chat.maxImageSize;
      case 'audio':
        return config.chat.maxAudioSize;
      default:
        return config.chat.maxFileSize;
    }
  },
  getSupportedFileTypes: (
    type: 'file' | 'image' | 'audio' = 'file',
  ): string[] => {
    switch (type) {
      case 'image':
        return config.chat.supportedImageTypes;
      case 'audio':
        return config.chat.supportedAudioTypes;
      default:
        return config.chat.supportedFileTypes;
    }
  },
};

// Main AppConfig interface
interface AppConfigType {
  environment: Environment;
  isDevelopment: boolean;
  isStaging: boolean;
  isProduction: boolean;
  api: ApiConfig;
  socket: SocketConfig;
  chat: ChatConfig;
  notification: NotificationConfig;
  google: GoogleConfig;
  security: SecurityConfig;
  performance: PerformanceConfig;
  debug: DebugConfig;
  features: FeatureFlags;
  
  logger: typeof AppLogger;
  helpers: typeof ConfigHelpers;
  getCurrentEnvironment: () => Environment;
  getAllConfigurations: () => Record<Environment, EnvironmentConfig>;
  getConfigForEnvironment: (env: Environment) => EnvironmentConfig;
}

// Export current configuration
export const AppConfig: AppConfigType = {
  // Environment info
  environment: currentEnv,
  isDevelopment: currentEnv === 'development',
  isStaging: currentEnv === 'staging',
  isProduction: currentEnv === 'production',

  // Service configurations
  api: config.api,
  socket: config.socket,
  chat: config.chat,
  notification: config.notification,
  google: config.google,
  security: config.security,
  performance: config.performance,
  debug: config.debug,
  features: config.features,

  // Utility methods
  
  logger: AppLogger,
  helpers: ConfigHelpers,

  // Configuration management
  getCurrentEnvironment,
  getAllConfigurations: () => CONFIGURATIONS,
  getConfigForEnvironment: (env: Environment) => CONFIGURATIONS[env],
};

// Individual config exports for convenience
export const SocketConfig = config.socket;
export const ApiConfig = config.api;
export const ChatConfig = config.chat;
export const NotificationConfig = config.notification;
export const GoogleConfig = config.google;
export const SecurityConfig = config.security;
export const PerformanceConfig = config.performance;
export const DebugConfig = config.debug;
export const FeatureFlags = config.features;

// Legacy exports for backward compatibility
export const BASE_API_URL = config.api.baseUrl;
export const BASE_SOCKET_URL = config.socket.url;
export const BASE_CHAT_URL = config.chat.baseUrl;
export const BASE_NOTIFICATION_URL = config.notification.baseUrl;
export const GOOGLE_PLACES_URL = config.google.placesUrl;
export const GOOGLE_PLACES_API_KEY = config.google.placesApiKey;
export const GOOGLE_LOCATION_API_KEY = config.google.locationApiKey;

// Alias for backward compatibility
export const ConfigLogger = AppLogger;

// Initialize configuration logging
AppLogger.info(`🚀 App initialized with environment: ${currentEnv}`);
AppLogger.info(`📡 API Base URL: ${config.api.baseUrl}`);
AppLogger.info(`🔌 Socket URL: ${config.socket.url}${config.socket.path}`);
AppLogger.info(`💬 Chat URL: ${config.chat.baseUrl}`);
AppLogger.info(`🔔 Notification URL: ${config.notification.baseUrl}`);
AppLogger.info(
  `🎯 Features enabled:`,
  Object.entries(config.features)
    .filter(([key, value]) => value)
    .map(([key]) => key),
);

export default AppConfig;

// Export types for use in other files
export type {
  Environment,
  ApiConfig as ApiConfigType,
  SocketConfig as SocketConfigType,
  ChatConfig as ChatConfigType,
  NotificationConfig as NotificationConfigType,
  GoogleConfig as GoogleConfigType,
  SecurityConfig as SecurityConfigType,
  PerformanceConfig as PerformanceConfigType,
  DebugConfig as DebugConfigType,
  FeatureFlags as FeatureFlagsType,
  EnvironmentConfig,
  
  AppConfigType,
};
