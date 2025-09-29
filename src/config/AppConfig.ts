// AppConfig.ts - Validated Environment-based Configuration Management
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Platform detection - properly handle both Node and React Native
const isNodeEnvironment = typeof window === 'undefined' && typeof global !== 'undefined';
const Platform = isNodeEnvironment 
  ? { OS: 'node', Version: process.version } 
  : require('react-native').Platform;

// Environment types
type Environment = 'development' | 'staging' | 'production';

// Get environment from .env or default
const getCurrentEnvironment = (): Environment => {
  const env = process.env.NODE_ENV || 'production';
  return env as Environment;
};

const ENVIRONMENT = getCurrentEnvironment();

// ==========================================
// SOCKET CONFIGURATION
// ==========================================
export const SocketConfig = {
  url: process.env.SERVER_URL || 'https://myusta.al',
  path: process.env.SOCKET_PATH || '/chat-backend/socket.io/',
  transports: (process.env.SOCKET_TRANSPORTS?.split(',') || ['websocket', 'polling']) as ('polling' | 'websocket')[],
  timeout: parseInt(process.env.SOCKET_TIMEOUT || '30000', 10),
  reconnection: process.env.SOCKET_RECONNECTION !== 'false',
  reconnectionAttempts: parseInt(process.env.SOCKET_RECONNECTION_ATTEMPTS || '5', 10),
  reconnectionDelay: parseInt(process.env.SOCKET_RECONNECTION_DELAY || '2000', 10),
  reconnectionDelayMax: parseInt(process.env.SOCKET_RECONNECTION_DELAY_MAX || '10000', 10),
  randomizationFactor: 0.5,
  forceNew: true,
  autoConnect: true,
  upgrade: true,
  rememberUpgrade: true,
  withCredentials: false,
  ackTimeout: 10000,
  retries: parseInt(process.env.MAX_RETRIES || '3', 10),
  closeOnBeforeunload: true,
  enableLogging: process.env.ENABLE_LOGGING === 'true',
  pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL || '25000', 10),
  pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT || '5000', 10),
};

// ==========================================
// API CONFIGURATION
// ==========================================
export const ApiConfig = {
  baseUrl: process.env.SERVER_URL 
    ? `${process.env.SERVER_URL}/myusta-backend/api/` 
    : 'https://myusta.al/myusta-backend/api/',
  timeout: parseInt(process.env.MESSAGE_TIMEOUT || '30000', 10),
  retries: parseInt(process.env.MAX_RETRIES || '2', 10),
  retryDelay: parseInt(process.env.RETRY_DELAY || '2000', 10),
  enableLogging: process.env.ENABLE_LOGGING === 'true',
};

// ==========================================
// CHAT CONFIGURATION
// ==========================================
export const ChatConfig = {
  baseUrl: process.env.CHAT_API_URL || 'https://myusta.al/chat-backend/api/v1/',
  timeout: parseInt(process.env.MESSAGE_TIMEOUT || '30000', 10),
  uploadTimeout: 60000,
  maxFileSize: 10 * 1024 * 1024,
  maxImageSize: 5 * 1024 * 1024,
  maxAudioSize: 15 * 1024 * 1024,
  supportedImageTypes: ['image/jpeg', 'image/png', 'image/gif'],
  supportedAudioTypes: ['audio/mp4', 'audio/mpeg', 'audio/wav'],
  supportedFileTypes: ['application/pdf', 'text/plain'],
  enableMessageEncryption: ENVIRONMENT === 'production',
  enableOfflineMessages: true,
  messageCacheSize: 500,
};

// ==========================================
// NOTIFICATION CONFIGURATION
// ==========================================
export const NotificationConfig = {
  baseUrl: process.env.CHAT_API_URL || 'https://myusta.al/chat-backend/api/v1/',
  timeout: 30000,
  fcmEnabled: process.env.ENABLE_PUSH_NOTIFICATIONS === 'true',
  pushNotificationsEnabled: process.env.ENABLE_PUSH_NOTIFICATIONS === 'true',
  soundEnabled: true,
  vibrationEnabled: true,
  badgeEnabled: true,
  categoryId: 'myusta_notifications',
};

// ==========================================
// GOOGLE SERVICES CONFIGURATION
// ==========================================
export const GoogleConfig = {
  placesApiKey: 'AIzaSyDK6xDsgrab0VzbnLeEVT1rJHsz2k1mA1c',
  locationApiKey: 'AIzaSyB8ODrHnGGYlUvHJ5omefoaIEM_M9Je0bg',
  placesUrl: 'https://maps.googleapis.com/maps/api/place/autocomplete/json',
  geocodingUrl: 'https://maps.googleapis.com/maps/api/geocode/json',
  enableLocationServices: true,
  locationAccuracy: 'balanced',
  locationTimeout: 10000,
};

// ==========================================
// SECURITY CONFIGURATION
// ==========================================
export const SecurityConfig = {
  enableSSLPinning: ENVIRONMENT === 'production',
  enableCertificateValidation: ENVIRONMENT === 'production',
  allowSelfSignedCerts: ENVIRONMENT !== 'production',
  apiKeyRotationEnabled: ENVIRONMENT === 'production',
  tokenRefreshThreshold: 600000, // 10 minutes
};

// ==========================================
// PERFORMANCE CONFIGURATION
// ==========================================
export const PerformanceConfig = {
  enableImageCaching: true,
  imageCacheSize: 300,
  enableLazyLoading: true,
  enableDataCompression: ENVIRONMENT === 'production',
  requestConcurrency: 2,
  enableRequestDeduplication: true,
};

// ==========================================
// DEBUG CONFIGURATION
// ==========================================
export const DebugConfig = {
  enabled: process.env.ENABLE_LOGGING === 'true',
  enableLogging: process.env.ENABLE_LOGGING === 'true',
  enableVerboseLogging: process.env.ENABLE_VERBOSE_LOGGING === 'true',
  enableNetworkLogging: process.env.ENABLE_NETWORK_LOGGING === 'true',
  enableSocketLogging: process.env.ENABLE_SOCKET_LOGGING === 'true',
  enableReduxLogging: false,
  enablePerformanceLogging: false,
  logLevel: ENVIRONMENT === 'production' ? 'error' as const : 'debug' as const,
  logToFile: ENVIRONMENT === 'production',
  maxLogFileSize: 5 * 1024 * 1024,
};

// ==========================================
// FEATURE FLAGS
// ==========================================
export const FeatureFlags = {
  enableOfflineMode: process.env.ENABLE_OFFLINE_MODE !== 'false',
  enableBetaFeatures: ENVIRONMENT !== 'production',
  enablePerformanceMonitoring: true,
  enableCrashReporting: ENVIRONMENT === 'production',
  enableAnalytics: ENVIRONMENT === 'production',
  enableBiometricAuth: process.env.ENABLE_BIOMETRIC_AUTH === 'true',
  enableDarkMode: true,
  enableVoiceMessages: true,
  enableVideoMessages: false,
  enableFileSharing: true,
  enableTypingIndicators: true,
  enableReadReceipts: true,
  enableMessageReactions: true,
};

// ==========================================
// LOGGER UTILITY
// ==========================================
export const AppLogger = {
  debug: (...args: any[]): void => {
    if (DebugConfig.enableLogging && DebugConfig.logLevel === 'debug') {
      console.log('[DEBUG]', new Date().toISOString(), ...args);
    }
  },
  info: (...args: any[]): void => {
    if (DebugConfig.enableLogging && ['debug', 'info'].includes(DebugConfig.logLevel)) {
      console.info('[INFO]', new Date().toISOString(), ...args);
    }
  },
  warn: (...args: any[]): void => {
    if (DebugConfig.enableLogging && ['debug', 'info', 'warn'].includes(DebugConfig.logLevel)) {
      console.warn('[WARN]', new Date().toISOString(), ...args);
    }
  },
  error: (...args: any[]): void => {
    if (DebugConfig.enableLogging) {
      console.error('[ERROR]', new Date().toISOString(), ...args);
    }
  },
  socket: (...args: any[]): void => {
    if (DebugConfig.enableSocketLogging) {
      console.log('[SOCKET]', new Date().toISOString(), ...args);
    }
  },
  network: (...args: any[]): void => {
    if (DebugConfig.enableNetworkLogging) {
      console.log('[NETWORK]', new Date().toISOString(), ...args);
    }
  },
  performance: (...args: any[]): void => {
    if (DebugConfig.enablePerformanceLogging) {
      console.log('[PERF]', new Date().toISOString(), ...args);
    }
  },
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================
export const ConfigHelpers = {
  isFeatureEnabled: (featureName: keyof typeof FeatureFlags): boolean =>
    FeatureFlags[featureName] || false,
  
  getApiTimeout: (): number => ApiConfig.timeout,
  
  getSocketConfig: () => SocketConfig,
  
  getChatConfig: () => ChatConfig,
  
  shouldLogNetwork: (): boolean => DebugConfig.enableNetworkLogging,
  
  shouldLogSocket: (): boolean => DebugConfig.enableSocketLogging,
  
  getMaxFileSize: (type: 'file' | 'image' | 'audio' = 'file'): number => {
    switch (type) {
      case 'image':
        return ChatConfig.maxImageSize;
      case 'audio':
        return ChatConfig.maxAudioSize;
      default:
        return ChatConfig.maxFileSize;
    }
  },
  
  getSupportedFileTypes: (type: 'file' | 'image' | 'audio' = 'file'): string[] => {
    switch (type) {
      case 'image':
        return ChatConfig.supportedImageTypes;
      case 'audio':
        return ChatConfig.supportedAudioTypes;
      default:
        return ChatConfig.supportedFileTypes;
    }
  },
  
  getUserConfig: () => ({
    userId: process.env.USER_ID,
    userName: process.env.USER_NAME,
    userEmail: process.env.USER_EMAIL,
    userPhone: process.env.USER_PHONE,
    userRole: process.env.USER_ROLE,
  }),
  
  getReceiverConfig: () => ({
    receiverId: process.env.RECEIVER_ID,
    receiverName: process.env.RECEIVER_NAME,
  }),
  
  getAuthToken: (): string => process.env.AUTH_TOKEN || '',
};

// ==========================================
// MAIN APPCONFIG INTERFACE
// ==========================================
interface AppConfigType {
  environment: Environment;
  isDevelopment: boolean;
  isStaging: boolean;
  isProduction: boolean;
  api: typeof ApiConfig;
  socket: typeof SocketConfig;
  chat: typeof ChatConfig;
  notification: typeof NotificationConfig;
  google: typeof GoogleConfig;
  security: typeof SecurityConfig;
  performance: typeof PerformanceConfig;
  debug: typeof DebugConfig;
  features: typeof FeatureFlags;
  logger: typeof AppLogger;
  helpers: typeof ConfigHelpers;
  getCurrentEnvironment: () => Environment;
  platform: typeof Platform;
  isNodeEnvironment: boolean;
}

// ==========================================
// EXPORT CURRENT CONFIGURATION
// ==========================================
export const AppConfig: AppConfigType = {
  environment: ENVIRONMENT,
  isDevelopment: ENVIRONMENT === 'development',
  isStaging: ENVIRONMENT === 'staging',
  isProduction: ENVIRONMENT === 'production',
  api: ApiConfig,
  socket: SocketConfig,
  chat: ChatConfig,
  notification: NotificationConfig,
  google: GoogleConfig,
  security: SecurityConfig,
  performance: PerformanceConfig,
  debug: DebugConfig,
  features: FeatureFlags,
  logger: AppLogger,
  helpers: ConfigHelpers,
  getCurrentEnvironment,
  platform: Platform,
  isNodeEnvironment,
};

// ==========================================
// LEGACY EXPORTS FOR BACKWARD COMPATIBILITY
// ==========================================
export const BASE_API_URL = ApiConfig.baseUrl;
export const BASE_SOCKET_URL = SocketConfig.url;
export const BASE_CHAT_URL = ChatConfig.baseUrl;
export const BASE_NOTIFICATION_URL = NotificationConfig.baseUrl;
export const GOOGLE_PLACES_URL = GoogleConfig.placesUrl;
export const GOOGLE_PLACES_API_KEY = GoogleConfig.placesApiKey;
export const GOOGLE_LOCATION_API_KEY = GoogleConfig.locationApiKey;

// ==========================================
// INITIALIZATION LOGGING
// ==========================================
if (DebugConfig.enableLogging) {
  AppLogger.info('🚀 App Configuration Initialized');
  AppLogger.info(`📱 Platform: ${Platform.OS} ${Platform.Version || ''}`);
  AppLogger.info(`🌍 Environment: ${ENVIRONMENT}`);
  AppLogger.info(`📡 API Base URL: ${ApiConfig.baseUrl}`);
  AppLogger.info(`🔌 Socket URL: ${SocketConfig.url}${SocketConfig.path}`);
  AppLogger.info(`💬 Chat API URL: ${ChatConfig.baseUrl}`);
  AppLogger.info(`🔔 Notification URL: ${NotificationConfig.baseUrl}`);
  AppLogger.info(`🔐 Auth Token: ${process.env.AUTH_TOKEN ? 'Present' : 'Missing'}`);
  AppLogger.info(`👤 User ID: ${process.env.USER_ID || 'Not set'}`);
  AppLogger.info(`🔧 Debug Mode: ${DebugConfig.enabled ? 'Enabled' : 'Disabled'}`);
  AppLogger.info(`📴 Offline Mode: ${FeatureFlags.enableOfflineMode ? 'Enabled' : 'Disabled'}`);
}

// ==========================================
// VALIDATION ON STARTUP
// ==========================================
const validateConfig = (): void => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required environment variables for test client
  if (!process.env.AUTH_TOKEN) {
    warnings.push('AUTH_TOKEN is not set - authentication may fail');
  }
  
  if (!process.env.USER_ID) {
    warnings.push('USER_ID is not set - using defaults');
  }
  
  if (!process.env.RECEIVER_ID) {
    warnings.push('RECEIVER_ID is not set - messaging may fail');
  }

  // Validate URLs
  try {
    new URL(SocketConfig.url);
  } catch {
    errors.push(`Invalid SERVER_URL: ${SocketConfig.url}`);
  }

  try {
    new URL(ChatConfig.baseUrl);
  } catch {
    errors.push(`Invalid CHAT_API_URL: ${ChatConfig.baseUrl}`);
  }

  // Validate numeric values
  if (isNaN(SocketConfig.timeout) || SocketConfig.timeout <= 0) {
    errors.push(`Invalid SOCKET_TIMEOUT: ${process.env.SOCKET_TIMEOUT}`);
  }

  if (isNaN(ApiConfig.retries) || ApiConfig.retries < 0) {
    errors.push(`Invalid MAX_RETRIES: ${process.env.MAX_RETRIES}`);
  }

  // Log validation results
  if (errors.length > 0) {
    console.error('❌ Configuration Errors:');
    errors.forEach(error => console.error(`  - ${error}`));
  }

  if (warnings.length > 0 && DebugConfig.enableLogging) {
    console.warn('⚠️  Configuration Warnings:');
    warnings.forEach(warning => console.warn(`  - ${warning}`));
  }

  if (errors.length === 0 && DebugConfig.enableLogging) {
    AppLogger.info('✅ Configuration validation passed');
  }
};

// Run validation on startup
if (ENVIRONMENT === 'development') {
  validateConfig();
}

// ==========================================
// DEFAULT EXPORT
// ==========================================
export default AppConfig;