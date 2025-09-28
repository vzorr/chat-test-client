// AppConfig.ts - Environment-based Configuration Management
import { Platform } from 'react-native';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment types
type Environment = 'development' | 'staging' | 'production';

// Get environment from .env or default
const getCurrentEnvironment = (): Environment => {
  const env = process.env.NODE_ENV || 'production';
  return env as Environment;
};

const ENVIRONMENT = getCurrentEnvironment();

// Socket configuration from environment
export const SocketConfig = {
  url: process.env.SERVER_URL || 'https://myusta.al',
  path: process.env.SOCKET_PATH || '/chat-backend/socket.io/',
  transports: (process.env.SOCKET_TRANSPORTS?.split(',') || ['websocket', 'polling']) as ('polling' | 'websocket')[],
  timeout: parseInt(process.env.SOCKET_TIMEOUT || '30000'),
  reconnection: process.env.SOCKET_RECONNECTION === 'true',
  reconnectionAttempts: parseInt(process.env.SOCKET_RECONNECTION_ATTEMPTS || '5'),
  reconnectionDelay: parseInt(process.env.SOCKET_RECONNECTION_DELAY || '2000'),
  reconnectionDelayMax: parseInt(process.env.SOCKET_RECONNECTION_DELAY_MAX || '10000'),
  randomizationFactor: 0.5,
  forceNew: true,
  autoConnect: true,
  upgrade: true,
  rememberUpgrade: true,
  withCredentials: false,
  ackTimeout: 10000,
  retries: parseInt(process.env.MAX_RETRIES || '3'),
  closeOnBeforeunload: true,
  enableLogging: process.env.ENABLE_LOGGING === 'true',
  pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL || '25000'),
  pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT || '5000'),
};

// API configuration
export const ApiConfig = {
  baseUrl: process.env.SERVER_URL ? `${process.env.SERVER_URL}/myusta-backend/api/` : 'https://myusta.al/myusta-backend/api/',
  timeout: parseInt(process.env.MESSAGE_TIMEOUT || '30000'),
  retries: parseInt(process.env.MAX_RETRIES || '2'),
  retryDelay: parseInt(process.env.RETRY_DELAY || '2000'),
  enableLogging: process.env.ENABLE_LOGGING === 'true',
};

// Chat configuration
export const ChatConfig = {
  baseUrl: process.env.CHAT_API_URL || 'https://myusta.al/chat-backend/api/v1/',
  timeout: parseInt(process.env.MESSAGE_TIMEOUT || '30000'),
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

// Notification configuration
export const NotificationConfig = {
  baseUrl: process.env.CHAT_API_URL || 'https://myusta.al/chat-backend/api/v1/',
  timeout: 30000,
  fcmEnabled: true,
  pushNotificationsEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
  badgeEnabled: true,
  categoryId: 'myusta_notifications',
};

// Google services configuration
export const GoogleConfig = {
  placesApiKey: 'AIzaSyDK6xDsgrab0VzbnLeEVT1rJHsz2k1mA1c',
  locationApiKey: 'AIzaSyB8ODrHnGGYlUvHJ5omefoaIEM_M9Je0bg',
  placesUrl: 'https://maps.googleapis.com/maps/api/place/autocomplete/json',
  geocodingUrl: 'https://maps.googleapis.com/maps/api/geocode/json',
  enableLocationServices: true,
  locationAccuracy: 'balanced',
  locationTimeout: 10000,
};

// Security configuration
export const SecurityConfig = {
  enableSSLPinning: ENVIRONMENT === 'production',
  enableCertificateValidation: ENVIRONMENT === 'production',
  allowSelfSignedCerts: ENVIRONMENT !== 'production',
  apiKeyRotationEnabled: ENVIRONMENT === 'production',
  tokenRefreshThreshold: 600000,
};

// Performance configuration
export const PerformanceConfig = {
  enableImageCaching: true,
  imageCacheSize: 300,
  enableLazyLoading: true,
  enableDataCompression: ENVIRONMENT === 'production',
  requestConcurrency: 2,
  enableRequestDeduplication: true,
};

// Debug configuration
export const DebugConfig = {
  enabled: process.env.ENABLE_LOGGING === 'true',
  enableLogging: process.env.ENABLE_LOGGING === 'true',
  enableVerboseLogging: process.env.ENABLE_VERBOSE_LOGGING === 'true',
  enableNetworkLogging: process.env.ENABLE_LOGGING === 'true',
  enableSocketLogging: process.env.ENABLE_LOGGING === 'true',
  enableReduxLogging: false,
  enablePerformanceLogging: false,
  logLevel: ENVIRONMENT === 'production' ? 'error' as const : 'debug' as const,
  logToFile: ENVIRONMENT === 'production',
  maxLogFileSize: 5 * 1024 * 1024,
};

// Feature flags
export const FeatureFlags = {
  enableOfflineMode: true,
  enableBetaFeatures: ENVIRONMENT !== 'production',
  enablePerformanceMonitoring: true,
  enableCrashReporting: ENVIRONMENT === 'production',
  enableAnalytics: ENVIRONMENT === 'production',
  enableBiometricAuth: true,
  enableDarkMode: true,
  enableVoiceMessages: true,
  enableVideoMessages: false,
  enableFileSharing: true,
  enableTypingIndicators: true,
  enableReadReceipts: true,
  enableMessageReactions: true,
};

// Logger utility
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

// Helper functions
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
};

// Main AppConfig interface
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
}

// Export current configuration
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
};

// Legacy exports for backward compatibility
export const BASE_API_URL = ApiConfig.baseUrl;
export const BASE_SOCKET_URL = SocketConfig.url;
export const BASE_CHAT_URL = ChatConfig.baseUrl;
export const BASE_NOTIFICATION_URL = NotificationConfig.baseUrl;
export const GOOGLE_PLACES_URL = GoogleConfig.placesUrl;
export const GOOGLE_PLACES_API_KEY = GoogleConfig.placesApiKey;
export const GOOGLE_LOCATION_API_KEY = GoogleConfig.locationApiKey;

// Initialize configuration logging
if (DebugConfig.enableLogging) {
  AppLogger.info(`🚀 App initialized with environment: ${ENVIRONMENT}`);
  AppLogger.info(`📡 API Base URL: ${ApiConfig.baseUrl}`);
  AppLogger.info(`🔌 Socket URL: ${SocketConfig.url}${SocketConfig.path}`);
  AppLogger.info(`💬 Chat URL: ${ChatConfig.baseUrl}`);
  AppLogger.info(`🔔 Notification URL: ${NotificationConfig.baseUrl}`);
}

export default AppConfig;