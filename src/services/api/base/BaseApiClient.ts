// src/services/api/base/BaseApiClient.ts - Updated to use AppConfig properly
import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';

import { AppConfig, AppLogger } from '../../../config/AppConfig';
import { AuthService } from '../../../services/AuthService';

// Platform detection from AppConfig
const Platform = AppConfig.platform;
const isNodeEnvironment = AppConfig.isNodeEnvironment;

// Request metadata interface
interface RequestMetadata {
  startTime: number;
  endTime?: number;
  retryCount?: number;
}

// WeakMap to store request metadata
const requestMetadata = new WeakMap<InternalAxiosRequestConfig, RequestMetadata>();

// Helper functions for metadata management
const setRequestMetadata = (config: InternalAxiosRequestConfig, metadata: RequestMetadata): void => {
  requestMetadata.set(config, metadata);
};

const getRequestMetadata = (config: InternalAxiosRequestConfig): RequestMetadata | undefined => {
  return requestMetadata.get(config);
};

const updateRequestMetadata = (config: InternalAxiosRequestConfig, updates: Partial<RequestMetadata>): void => {
  const existing = requestMetadata.get(config) || { startTime: Date.now() };
  requestMetadata.set(config, { ...existing, ...updates });
};

// Helper function to safely extract authorization token
const getAuthorizationToken = (headers: any): string | null => {
  if (!headers || !headers.Authorization) {
    return null;
  }

  const authHeader = headers.Authorization;

  if (typeof authHeader === 'string') {
    return authHeader.replace('Bearer ', '');
  }

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

// Default retry condition
const defaultRetryCondition = (error: AxiosError): boolean => {
  return (
    !error.response || // Network error
    (error.response.status >= 500 && error.response.status <= 599) || // Server errors
    error.response.status === 429 // Rate limiting
  );
};

/**
 * Base API Client Configuration
 * This interface is for internal use - external code should use AppConfig directly
 */
export interface BaseApiClientConfig {
  baseUrl?: string;
  token?: string | null;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  enableLogging?: boolean;
  enableCompression?: boolean;
  clientType?: 'default' | 'chat' | 'notification' | 'formdata' | 'otp';
}

/**
 * Enhanced Base API Client with AppConfig integration
 * Provides authentication, error handling, retry logic, and logging
 */
export class BaseApiClient {
  protected apiClient: AxiosInstance;
  protected token: string | null = null;
  protected config: BaseApiClientConfig;
  private reconnectAttempts = 0;
  
  constructor(config: BaseApiClientConfig = {}) {
    // Merge with AppConfig defaults based on client type
    this.config = this.mergeWithAppConfig(config);
    
    this.token = config.token || null;
    this.apiClient = this.createClient();
  }

  /**
   * Merge configuration with AppConfig defaults
   */
  private mergeWithAppConfig(config: BaseApiClientConfig): BaseApiClientConfig {
    let defaults: Partial<BaseApiClientConfig> = {};
    
    switch (config.clientType) {
      case 'chat':
        defaults = {
          baseUrl: AppConfig.chat.baseUrl,
          timeout: AppConfig.chat.timeout,
          retries: AppConfig.api.retries,
          retryDelay: AppConfig.api.retryDelay,
          enableLogging: AppConfig.debug.enabled,
          enableCompression: AppConfig.performance.enableDataCompression,
        };
        break;
        
      case 'notification':
        defaults = {
          baseUrl: AppConfig.notification.baseUrl,
          timeout: AppConfig.notification.timeout,
          retries: AppConfig.api.retries,
          retryDelay: AppConfig.api.retryDelay,
          enableLogging: AppConfig.debug.enabled,
          enableCompression: AppConfig.performance.enableDataCompression,
        };
        break;
        
      case 'formdata':
        defaults = {
          baseUrl: AppConfig.api.baseUrl,
          timeout: AppConfig.chat.uploadTimeout || AppConfig.api.timeout,
          retries: AppConfig.api.retries,
          retryDelay: AppConfig.api.retryDelay,
          enableLogging: AppConfig.debug.enabled,
          enableCompression: false, // No compression for form data
        };
        break;
        
      default:
        defaults = {
          baseUrl: AppConfig.api.baseUrl,
          timeout: AppConfig.api.timeout,
          retries: AppConfig.api.retries,
          retryDelay: AppConfig.api.retryDelay,
          enableLogging: AppConfig.debug.enabled,
          enableCompression: AppConfig.performance.enableDataCompression,
        };
    }
    
    return { ...defaults, ...config };
  }

  /**
   * Create axios instance with interceptors
   */
  private createClient(): AxiosInstance {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'myusta/2.0.0 (ChatService; Node.js 18.0.0; TypeScript)',
      'X-App-Version': '2.0.0',
      'X-Platform': Platform.OS,
      'X-Environment': AppConfig.environment,
      ...this.config.headers,
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    if (this.config.enableCompression) {
      headers['Accept-Encoding'] = 'gzip, deflate';
    }

    // Handle special client types
    if (this.config.clientType === 'formdata') {
      headers['Content-Type'] = 'multipart/form-data';
    } else if (this.config.clientType === 'otp' && this.token) {
      headers['x-auth-otp'] = this.token;
      delete headers.Authorization;
    }

    const axiosConfig: AxiosRequestConfig = {
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers,
    };

    const instance = axios.create(axiosConfig);

    // Setup interceptors
    this.setupRequestInterceptor(instance);
    this.setupResponseInterceptor(instance);

    return instance;
  }

  /**
   * Setup request interceptor
   */
  private setupRequestInterceptor(instance: AxiosInstance): void {
    instance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        setRequestMetadata(config, { startTime: Date.now() });

        if (this.config.enableLogging) {
          AppLogger.network('API Request:', {
            method: config.method?.toUpperCase(),
            url: config.url,
            baseURL: config.baseURL,
            headers: {
              ...config.headers,
              Authorization: config.headers?.Authorization ? '[HIDDEN]' : undefined,
            },
          });
        }

        return config;
      },
      (error: AxiosError) => {
        AppLogger.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Setup response interceptor with retry and token refresh
   */
  private setupResponseInterceptor(instance: AxiosInstance): void {
    instance.interceptors.response.use(
      (response: AxiosResponse) => {
        if (response.config && this.config.enableLogging) {
          const metadata = getRequestMetadata(response.config as InternalAxiosRequestConfig);
          const duration = metadata ? Date.now() - metadata.startTime : 0;

          AppLogger.network('API Response:', {
            method: response.config.method?.toUpperCase(),
            url: response.config.url,
            status: response.status,
            duration: `${duration}ms`,
            retryCount: metadata?.retryCount || 0,
          });
        }

        return response;
      },
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig;

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
            
            const currentToken = getAuthorizationToken(originalRequest.headers);
            
            if (currentToken && AuthService.refreshToken) {
              const newToken = await AuthService.refreshToken();
              
              if (newToken) {
                AppLogger.info('Token refreshed successfully');
                setAuthorizationHeader(originalRequest.headers, newToken);
                this.token = newToken;
                return instance(originalRequest);
              }
            }
            
            AppLogger.warn('Token refresh failed, redirecting to login');
          } catch (refreshError) {
            AppLogger.error('Token refresh error:', refreshError);
          }
        }

        // Handle retryable errors
        if (originalRequest && defaultRetryCondition(error) && !originalRequest._retry) {
          const metadata = getRequestMetadata(originalRequest);
          const retryCount = metadata?.retryCount || 0;

          if (retryCount < (this.config.retries || 0)) {
            return this.handleRetry(originalRequest, error, instance);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Handle retry logic
   */
  private async handleRetry(
    originalRequest: InternalAxiosRequestConfig,
    error: AxiosError,
    instance: AxiosInstance
  ): Promise<AxiosResponse> {
    try {
      await new Promise<void>(resolve =>
        setTimeout(() => resolve(), this.config.retryDelay || AppConfig.api.retryDelay)
      );

      const metadata = getRequestMetadata(originalRequest);
      const retryCount = (metadata?.retryCount || 0) + 1;
      updateRequestMetadata(originalRequest, { retryCount });

      if (retryCount <= (this.config.retries || AppConfig.api.retries)) {
        AppLogger.info(`Retrying request (${retryCount}/${this.config.retries}):`, {
          url: originalRequest.url,
          method: originalRequest.method?.toUpperCase(),
        });

        return instance(originalRequest);
      } else {
        AppLogger.error(`Max retries (${this.config.retries}) exceeded for request:`, {
          url: originalRequest.url,
          method: originalRequest.method?.toUpperCase(),
        });
        return Promise.reject(error);
      }
    } catch (retryError) {
      AppLogger.error('Error during retry:', retryError);
      return Promise.reject(error);
    }
  }

  /**
   * Set authentication token
   */
  setToken(token: string): void {
    this.token = token;
    this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Get headers with authentication
   */
  protected getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Safe error logging helper
   */
  protected safeLogError(context: string, error: any, additionalData?: any): void {
    AppLogger.error(`[${this.constructor.name}] ${context}:`, {
      message: error?.message || 'Unknown error',
      name: error?.name || 'Error',
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      data: error?.response?.data,
      url: error?.config?.url,
      method: error?.config?.method,
      ...additionalData
    });
  }

  /**
   * Handle API responses with standard error handling
   */
  protected async handleResponse<T>(
    promise: Promise<AxiosResponse<T>>,
    context: string
  ): Promise<T> {
    try {
      const response = await promise;
      return response.data;
    } catch (error: any) {
      this.safeLogError(`Error in ${context}`, error);
      throw error;
    }
  }

  /**
   * GET request with error handling
   */
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.handleResponse(
      this.apiClient.get(url, config),
      `GET ${url}`
    );
  }

  /**
   * POST request with error handling
   */
  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.handleResponse(
      this.apiClient.post(url, data, config),
      `POST ${url}`
    );
  }

  /**
   * PUT request with error handling
   */
  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.handleResponse(
      this.apiClient.put(url, data, config),
      `PUT ${url}`
    );
  }

  /**
   * PATCH request with error handling
   */
  async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.handleResponse(
      this.apiClient.patch(url, data, config),
      `PATCH ${url}`
    );
  }

  /**
   * DELETE request with error handling
   */
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.handleResponse(
      this.apiClient.delete(url, config),
      `DELETE ${url}`
    );
  }

  /**
   * Upload file with FormData - Internal method for making multipart/form-data requests
   */
  protected async postFormData(url: string, file: any, additionalData?: Record<string, any>): Promise<any> {
    const formData = this.createFormData(file, additionalData);
    
    return this.post(url, formData, {
      headers: { 
        'Content-Type': 'multipart/form-data'
      },
      timeout: this.config.clientType === 'chat' ? 
        AppConfig.chat?.uploadTimeout : 
        this.config.timeout,
      onUploadProgress: (progressEvent: any) => {
        if (this.config.enableLogging) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          AppLogger.info(`Upload progress: ${percentCompleted}%`);
        }
      }
    });
  }

  /**
   * Create FormData for file uploads
   */
  private createFormData(file: any, additionalData?: Record<string, any>): FormData {
    const formData = isNodeEnvironment 
      ? new (require('form-data'))() 
      : new FormData();

    if (isNodeEnvironment) {
      const fs = require('fs');
      
      if (file.path) {
        formData.append('file', fs.createReadStream(file.path), {
          filename: file.name || `file-${Date.now()}.bin`,
          contentType: file.type || 'application/octet-stream'
        });
      } else if (file.buffer) {
        formData.append('file', file.buffer, {
          filename: file.name || `file-${Date.now()}.bin`,
          contentType: file.type || 'application/octet-stream'
        });
      }
    } else {
      // React Native or Browser
      if (file.uri) {
        formData.append('file', {
          uri: file.uri,
          type: file.type || 'application/octet-stream',
          name: file.name || `file-${Date.now()}.bin`
        } as any);
      } else {
        formData.append('file', file);
      }
    }

    // Add additional data if provided
    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    return formData;
  }

  /**
   * Check if response is successful
   */
  protected isSuccessResponse(response: any): boolean {
    return response && response.success === true;
  }

  /**
   * Extract data from API response
   */
  protected extractData<T>(response: any, fallback?: T): T {
    if (this.isSuccessResponse(response)) {
      return response.data || fallback;
    }
    throw new Error(response?.message || 'API request failed');
  }

  /**
   * Get the underlying Axios instance
   */
  getAxiosInstance(): AxiosInstance {
    return this.apiClient;
  }
}

// Factory functions for creating specific client types - all using AppConfig
export function createApiClient(token?: string): BaseApiClient {
  return new BaseApiClient({
    baseUrl: AppConfig.api.baseUrl,
    token,
    clientType: 'default'
  });
}

export function createChatClient(token?: string): BaseApiClient {
  return new BaseApiClient({
    baseUrl: AppConfig.chat.baseUrl,
    token,
    clientType: 'chat',
    timeout: AppConfig.chat.timeout
  });
}

export function createNotificationClient(token?: string): BaseApiClient {
  return new BaseApiClient({
    baseUrl: AppConfig.notification.baseUrl,
    token,
    clientType: 'notification',
    timeout: AppConfig.notification.timeout
  });
}

export function createFormDataClient(token?: string): BaseApiClient {
  return new BaseApiClient({
    baseUrl: AppConfig.api.baseUrl,
    token,
    clientType: 'formdata',
    timeout: AppConfig.chat?.uploadTimeout || AppConfig.api.timeout
  });
}

export function createOtpClient(token?: string): BaseApiClient {
  return new BaseApiClient({
    baseUrl: AppConfig.api.baseUrl,
    token,
    clientType: 'otp'
  });
}

// Add missing _retry property to InternalAxiosRequestConfig
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retry?: boolean;
  }
}