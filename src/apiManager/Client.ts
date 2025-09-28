// Client.ts - Fixed TypeScript errors
import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import {Platform} from 'react-native';

import {AppConfig, AppLogger} from '../config/AppConfig';
import {AuthService} from '../services/AuthService';

// Request metadata interface
interface RequestMetadata {
  startTime: number;
  endTime?: number;
  retryCount?: number;
}

// WeakMap to store request metadata without modifying Axios types
const requestMetadata = new WeakMap<
  InternalAxiosRequestConfig,
  RequestMetadata
>();

// Helper functions for metadata management
const setRequestMetadata = (
  config: InternalAxiosRequestConfig,
  metadata: RequestMetadata,
): void => {
  requestMetadata.set(config, metadata);
};

const getRequestMetadata = (
  config: InternalAxiosRequestConfig,
): RequestMetadata | undefined => {
  return requestMetadata.get(config);
};

const updateRequestMetadata = (
  config: InternalAxiosRequestConfig,
  updates: Partial<RequestMetadata>,
): void => {
  const existing = requestMetadata.get(config) || {startTime: Date.now()};
  requestMetadata.set(config, {...existing, ...updates});
};

// Helper function to safely extract authorization token
const getAuthorizationToken = (headers: any): string | null => {
  if (!headers || !headers.Authorization) {
    return null;
  }

  const authHeader = headers.Authorization;

  // Handle different types that Authorization header might be
  if (typeof authHeader === 'string') {
    return authHeader.replace('Bearer ', '');
  }

  // If it's an array, take the first element
  if (Array.isArray(authHeader) && authHeader.length > 0) {
    const firstAuth = authHeader[0];
    if (typeof firstAuth === 'string') {
      return firstAuth.replace('Bearer ', '');
    }
  }

  return null;
};

// Helper function to safely set authorization header
const setAuthorizationHeader = (headers: any, token: string): void => {
  if (headers) {
    headers.Authorization = `Bearer ${token}`;
  }
};

// Default retry condition - retry on network errors and 5xx status codes
const defaultRetryCondition = (error: AxiosError): boolean => {
  return (
    !error.response || // Network error
    (error.response.status >= 500 && error.response.status <= 599) || // Server errors
    error.response.status === 429 // Rate limiting
  );
};

// Retry handler function
const handleRetry = async (
  originalRequest: InternalAxiosRequestConfig,
  error: AxiosError,
): Promise<AxiosResponse> => {
  try {
    // Wait before retrying
    await new Promise<void>(resolve =>
      setTimeout(() => resolve(), AppConfig.api.retryDelay),
    );

    const metadata = getRequestMetadata(originalRequest);
    const retryCount = (metadata?.retryCount || 0) + 1;
    updateRequestMetadata(originalRequest, {retryCount});

    if (retryCount <= AppConfig.api.retries) {
      AppLogger.info(
        `Retrying request (${retryCount}/${AppConfig.api.retries}):`,
        {
          url: originalRequest.url,
          method: originalRequest.method?.toUpperCase(),
        },
      );

      return axios(originalRequest);
    } else {
      AppLogger.error(
        `Max retries (${AppConfig.api.retries}) exceeded for request:`,
        {
          url: originalRequest.url,
          method: originalRequest.method?.toUpperCase(),
        },
      );
      return Promise.reject(error);
    }
  } catch (retryError: unknown) {
    AppLogger.error('Error during retry:', retryError);
    return Promise.reject(error);
  }
};

// Enhanced base client function - FIXED VERSION
const createClient = (
  baseURL: string,
  token: string | null = null,
  headers: Record<string, string> = {},
  timeout: number = AppConfig.api.timeout,
): AxiosInstance => {
  const config: AxiosRequestConfig = {
    baseURL,
    timeout,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'myusta/2.0.0 (ChatService; Node.js 18.0.0; TypeScript)',
      'X-App-Version': '2.0.0',
      'X-Platform': Platform.OS,
      'X-Environment': AppConfig.environment,
      ...headers,
    },
  };

  if (token) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${token}`,
    };
  }

  // Add performance configuration
  if (AppConfig.performance?.enableDataCompression) {
    config.headers!['Accept-Encoding'] = 'gzip, deflate';
  }

  const axiosInstance = axios.create(config);

  // Request interceptor - Add metadata and logging
  axiosInstance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      // Set request metadata
      setRequestMetadata(config, {
        startTime: Date.now(),
      });

      // FIXED: Check if debug.enabled exists instead of enableDetailedLogging
      if (AppConfig.debug?.enabled) {
        AppLogger.info('API Request:', {
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL,
          headers: {
            ...config.headers,
            // Hide sensitive data in logs
            Authorization: config.headers?.Authorization ? '[HIDDEN]' : undefined,
          },
        });
      }

      return config;
    },
    (error: AxiosError) => {
      AppLogger.error('Request interceptor error:', error);
      return Promise.reject(error);
    },
  );

  // Response interceptor - Handle responses, retries, and token refresh
  axiosInstance.interceptors.response.use(
    (response: AxiosResponse) => {
      // Update metadata with end time
      if (response.config) {
        updateRequestMetadata(response.config as InternalAxiosRequestConfig, {
          endTime: Date.now(),
        });

        // FIXED: Check if debug.enabled exists instead of enableDetailedLogging
        if (AppConfig.debug?.enabled) {
          const metadata = getRequestMetadata(response.config as InternalAxiosRequestConfig);
          const duration = metadata ? Date.now() - metadata.startTime : 0;
          
          AppLogger.info('API Response:', {
            method: response.config.method?.toUpperCase(),
            url: response.config.url,
            status: response.status,
            duration: `${duration}ms`,
            retryCount: metadata?.retryCount || 0,
          });
        }
      }

      return response;
    },
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig;

      // Log error
      AppLogger.error('API Error:', {
        method: originalRequest?.method?.toUpperCase(),
        url: originalRequest?.url,
        status: error.response?.status,
        message: error.message,
        data: error.response?.data,
      });

      // Handle 401 (Unauthorized) - Token refresh
      if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
        originalRequest._retry = true;

        try {
          AppLogger.info('Attempting token refresh...');
          
          // Get current token from request headers
          const currentToken = getAuthorizationToken(originalRequest.headers);
          
          if (currentToken && AuthService.refreshToken) {
            // FIXED: Call refreshToken without parameters
            const newToken = await AuthService.refreshToken();
            
            if (newToken) {
              AppLogger.info('Token refreshed successfully');
              
              // Update the original request with new token
              setAuthorizationHeader(originalRequest.headers, newToken);
              
              // Retry the original request with new token
              return axiosInstance(originalRequest);
            }
          }
          
          // If refresh fails, redirect to login
          AppLogger.warn('Token refresh failed, redirecting to login');
          // You might want to emit an event or call a navigation function here
          // NavigationService.navigate('Login');
          
        } catch (refreshError) {
          AppLogger.error('Token refresh error:', refreshError);
          // Handle refresh failure (e.g., redirect to login)
        }
      }

      // Handle retryable errors
      if (
        originalRequest &&
        defaultRetryCondition(error) &&
        !originalRequest._retry
      ) {
        const metadata = getRequestMetadata(originalRequest);
        const retryCount = metadata?.retryCount || 0;

        if (retryCount < AppConfig.api.retries) {
          originalRequest._retry = true;
          return handleRetry(originalRequest, error);
        }
      }

      // For non-retryable errors or max retries exceeded
      return Promise.reject(error);
    },
  );

  return axiosInstance;
};

// Main API client with authorization
export const client = (token: string | null = null): AxiosInstance => {
  return createClient(AppConfig.api.baseUrl, token);
};

// Client without authorization headers
export const client1 = (token: string | null = null): AxiosInstance => {
  return createClient(AppConfig.api.baseUrl, token);
};

// OTP client
export const otpClient = (token: string | null = null): AxiosInstance => {
  return createClient(AppConfig.api.baseUrl, null, {
    'x-auth-otp': token || '',
  });
};

// Client for form data with enhanced upload configuration
export const ClientFormData = (token: string | null = null): AxiosInstance => {
  return createClient(
    AppConfig.api.baseUrl,
    token,
    {
      'Content-Type': 'multipart/form-data',
    },
    AppConfig.chat?.uploadTimeout || AppConfig.api.timeout,
  );
};

// Notification client
export const notificationClient = (
  token: string | null = null,
): AxiosInstance => {
  return createClient(
    AppConfig.notification.baseUrl,
    token,
    {},
    AppConfig.notification.timeout,
  );
};

// Chat client
export const chatClient = (token: string | null = null): AxiosInstance => {
  return createClient(
    AppConfig.chat.baseUrl,
    token,
    {},
    AppConfig.chat.timeout,
  );
};

// Enhanced notification client with specialized functions
export const NotificationService = {
  getClient: (token: string | null = null): AxiosInstance => {
    return notificationClient(token);
  },

  // Get all notifications
  getAllNotifications: async (
    token: string | null,
    page: number = 1,
    limit: number = 20,
  ): Promise<AxiosResponse> => {
    return notificationClient(token).get('/notifications', {
      params: {page, limit},
    });
  },

  // Get notifications by type
  getNotificationsByType: async (
    token: string | null,
    type: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<AxiosResponse> => {
    return notificationClient(token).get(`/notifications/type/${type}`, {
      params: {page, limit},
    });
  },

  // Get notification by ID
  getNotificationById: async (
    token: string | null,
    id: string,
  ): Promise<AxiosResponse> => {
    return notificationClient(token).get(`/notifications/${id}`);
  },

  // Mark notification as read
  markAsRead: async (
    token: string | null,
    id: string,
  ): Promise<AxiosResponse> => {
    return notificationClient(token).post(`/notifications/${id}/read`);
  },

  // Mark all notifications as read
  markAllAsRead: async (token: string | null): Promise<AxiosResponse> => {
    return notificationClient(token).post('/notifications/read-all');
  },

  // Get unread count
  getUnreadCount: async (token: string | null): Promise<AxiosResponse> => {
    return notificationClient(token).get('/notifications/unread/count');
  },

  // Delete notification
  deleteNotification: async (
    token: string | null,
    id: string,
  ): Promise<AxiosResponse> => {
    return notificationClient(token).delete(`/notifications/${id}`);
  },
};

// Enhanced chat service with file size validation
export const ChatService = {
  /**
   * Get the base chat client with authorization
   * @param token Authentication token
   * @returns Configured axios instance
   */
  getClient: (token: string | null = null): AxiosInstance => {
    return createClient(AppConfig.chat.baseUrl, token);
  },

  /**
   * Get chat history between two users for a specific job
   * @param token Authentication token
   * @param params Query parameters including jobId, receiverId, and pagination
   * @returns Promise with chat history response
   */
  getChatHistory: async (
    token: string | null,
    params: {
      jobId: string | number;
      receiverId: string | number;
      page?: number;
      limit?: number;
    },
  ): Promise<AxiosResponse> => {
    return createClient(AppConfig.chat.baseUrl, token).get('/chats/history', {
      params,
    });
  },

  /**
   * Get the list of active chats for the current user
   * @param token Authentication token
   * @param page Page number for pagination
   * @param limit Number of items per page
   * @returns Promise with chat list response
   */
  getChatList: async (
    token: string | null,
    page: number = 1,
    limit: number = 20,
  ): Promise<AxiosResponse> => {
    return createClient(AppConfig.chat.baseUrl, token).get('/chats/list', {
      params: {page, limit},
    });
  },

  /**
   * Mark messages as read for a specific chat
   * @param token Authentication token
   * @param params Parameters including jobId and senderId
   * @returns Promise with response
   */
  markMessagesAsRead: async (
    token: string | null,
    params: {
      jobId: string | number;
      senderId: string | number;
    },
  ): Promise<AxiosResponse> => {
    return createClient(AppConfig.chat.baseUrl, token).post(
      '/chats/read',
      params,
    );
  },

  /**
   * Block a user from sending messages
   * @param token Authentication token
   * @param userId ID of the user to block
   * @returns Promise with response
   */
  blockUser: async (
    token: string | null,
    userId: string | number,
  ): Promise<AxiosResponse> => {
    return createClient(AppConfig.chat.baseUrl, token).post(
      `/users/${userId}/block`,
    );
  },

  /**
   * Unblock a previously blocked user
   * @param token Authentication token
   * @param userId ID of the user to unblock
   * @returns Promise with response
   */
  unblockUser: async (
    token: string | null,
    userId: string | number,
  ): Promise<AxiosResponse> => {
    return createClient(AppConfig.chat.baseUrl, token).post(
      `/users/${userId}/unblock`,
    );
  },

  /**
   * Delete a chat conversation
   * @param token Authentication token
   * @param params Parameters including jobId and otherUserId
   * @returns Promise with response
   */
  deleteChat: async (
    token: string | null,
    params: {
      jobId: string | number;
      otherUserId: string | number;
    },
  ): Promise<AxiosResponse> => {
    return createClient(AppConfig.chat.baseUrl, token).delete('/chats', {
      data: params,
    });
  },

  /**
   * Upload a file attachment to the chat with validation
   * @param token Authentication token
   * @param file File object to upload
   * @param type Type of the attachment (image, audio, or file)
   * @returns Promise with upload response
   */
  uploadAttachment: async (
    token: string | null,
    file: any,
    type: 'image' | 'audio' | 'file',
  ): Promise<AxiosResponse> => {
    // Validate file size
    const maxSizes = {
      image: 5 * 1024 * 1024, // 5MB
      audio: 15 * 1024 * 1024, // 15MB
      file: 10 * 1024 * 1024, // 10MB
    };

    const maxSize = maxSizes[type];
    if (file.size && file.size > maxSize) {
      throw new Error(
        `File size (${file.size}) exceeds maximum allowed size (${maxSize}) for ${type} files`,
      );
    }

    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      type:
        file.type ||
        (type === 'image'
          ? 'image/jpeg'
          : type === 'audio'
          ? 'audio/mp4'
          : 'application/octet-stream'),
      name:
        file.name ||
        `${type}-${Date.now()}.${
          type === 'image' ? 'jpg' : type === 'audio' ? 'm4a' : 'bin'
        }`,
    });
    formData.append('type', type);

    return createClient(
      AppConfig.chat.baseUrl,
      token,
      {
        'Content-Type': 'multipart/form-data',
      },
      AppConfig.chat?.uploadTimeout || AppConfig.api.timeout,
    ).post('/chats/upload', formData);
  },

  /**
   * Search through chat messages
   * @param token Authentication token
   * @param searchQuery Text to search for
   * @param params Optional parameters including pagination and filters
   * @returns Promise with search results response
   */
  searchMessages: async (
    token: string | null,
    searchQuery: string,
    params?: {
      jobId?: string | number;
      receiverId?: string | number;
      page?: number;
      limit?: number;
    },
  ): Promise<AxiosResponse> => {
    return createClient(AppConfig.chat.baseUrl, token).get('/chats/search', {
      params: {
        query: searchQuery,
        ...params,
      },
    });
  },

  /**
   * Get chat statistics (message count, unread count, etc.)
   * @param token Authentication token
   * @returns Promise with chat statistics response
   */
  getChatStats: async (token: string | null): Promise<AxiosResponse> => {
    return createClient(AppConfig.chat.baseUrl, token).get('/chats/stats');
  },

  /**
   * Get user's online status
   * @param token Authentication token
   * @param userId ID of the user to check
   * @returns Promise with online status response
   */
  getUserOnlineStatus: async (
    token: string | null,
    userId: string | number,
  ): Promise<AxiosResponse> => {
    return createClient(AppConfig.chat.baseUrl, token).get(
      `/users/${userId}/status`,
    );
  },

  /**
   * Update the user's own online status
   * @param token Authentication token
   * @param isOnline Boolean indicating whether the user is online
   * @returns Promise with response
   */
  updateOnlineStatus: async (
    token: string | null,
    isOnline: boolean,
  ): Promise<AxiosResponse> => {
    return createClient(AppConfig.chat.baseUrl, token).post('/users/status', {
      isOnline,
    });
  },

  /**
   * Delete a specific message
   * @param token Authentication token
   * @param messageId ID of the message to delete
   * @returns Promise with response
   */
  deleteMessage: async (
    token: string | null,
    messageId: string,
  ): Promise<AxiosResponse> => {
    return createClient(AppConfig.chat.baseUrl, token).delete(
      `/chats/messages/${messageId}`,
    );
  },

  /**
   * Edit a previously sent message
   * @param token Authentication token
   * @param messageId ID of the message to edit
   * @param newText New text content for the message
   * @returns Promise with response
   */
  editMessage: async (
    token: string | null,
    messageId: string,
    newText: string,
  ): Promise<AxiosResponse> => {
    return createClient(AppConfig.chat.baseUrl, token).put(
      `/chats/messages/${messageId}`,
      {text: newText},
    );
  },

  /**
   * Report inappropriate message or user
   * @param token Authentication token
   * @param params Report parameters
   * @returns Promise with response
   */
  reportContent: async (
    token: string | null,
    params: {
      messageId?: string;
      userId?: string | number;
      reason: string;
      details?: string;
    },
  ): Promise<AxiosResponse> => {
    return createClient(AppConfig.chat.baseUrl, token).post(
      '/chats/report',
      params,
    );
  },

  /**
   * Send typing indicator to the other user
   * @param token Authentication token
   * @param params Parameters including jobId and receiverId
   * @returns Promise with response
   */
  sendTypingIndicator: async (
    token: string | null,
    params: {
      jobId: string | number;
      receiverId: string | number;
      isTyping: boolean;
    },
  ): Promise<AxiosResponse> => {
    return createClient(AppConfig.chat.baseUrl, token).post(
      '/chats/typing',
      params,
    );
  },
};

// Export environment info for troubleshooting
export const API_ENV = {
  environment: AppConfig.environment,
  currentBaseUrl: AppConfig.api.baseUrl,
  currentSocketUrl: AppConfig.socket.url,
  isProduction: AppConfig.isProduction,
  isDevelopment: AppConfig.isDevelopment,
  isStaging: AppConfig.isStaging,
  features: AppConfig.features,
  debug: AppConfig.debug,
  performance: AppConfig.performance,
};

// Export backward compatibility constants using correct property names
export const BASE_API_URL_STAGING = AppConfig.api.baseUrl;
export const BASE_API_URL_PRODUCTION = AppConfig.api.baseUrl;
export const BASE_SOCKET_URL = AppConfig.socket.url;
export const BASE_CHAT_URL = AppConfig.chat.baseUrl;
export const BASE_NOTIFICATION_URL = AppConfig.notification.baseUrl;
export const GOOGLE_PLACES_URL = AppConfig.google.placesUrl;

// Add missing _retry property to InternalAxiosRequestConfig
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retry?: boolean;
  }
}