// src/services/api/base/BaseApiClient.ts - Fixed and Cleaned Implementation
import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';

import { AppConfig } from '../../../config/AppConfig';
import { AuthService } from '../../AuthService';
import { logger } from '../../../utils/Logger';

// ==========================================
// TYPES
// ==========================================

export interface ApiClientConfig {
  baseUrl?: string;
  token?: string | null;
  timeout?: number;
  headers?: Record<string, string>;
  retries?: number;
  retryDelay?: number;
  enableExponentialBackoff?: boolean;
  maxRetryDelay?: number;
  enableLogging?: boolean;
  enableCompression?: boolean;
}

export interface BaseApiClientConfig extends ApiClientConfig {
  clientType?: 'default' | 'chat' | 'notification' | 'formdata' | 'otp';
}

interface RequestMetadata {
  startTime: number;
  retryCount: number;
  attemptNumber: number;
}

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retry?: boolean;
    _metadata?: RequestMetadata;
  }
}

// ==========================================
// BASE API CLIENT
// ==========================================

export class BaseApiClient {
  protected axiosInstance: AxiosInstance;
  protected config: Required<ApiClientConfig>;
  protected token: string | null = null;
  protected clientType: string;
  
  private requestMetadata = new WeakMap<InternalAxiosRequestConfig, RequestMetadata>();

  constructor(config: BaseApiClientConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl || AppConfig.api.baseUrl,
      token: config.token || null,
      timeout: config.timeout || AppConfig.api.timeout,
      headers: config.headers || {},
      retries: config.retries ?? AppConfig.api.retries,
      retryDelay: config.retryDelay ?? AppConfig.api.retryDelay,
      enableExponentialBackoff: config.enableExponentialBackoff ?? AppConfig.api.enableExponentialBackoff ?? false,
      maxRetryDelay: config.maxRetryDelay ?? AppConfig.api.maxRetryDelay ?? 10000,
      enableLogging: config.enableLogging ?? AppConfig.debug.enabled,
      enableCompression: config.enableCompression ?? true,
    };

    this.token = this.config.token;
    this.clientType = config.clientType || 'default';
    this.axiosInstance = this.createAxiosInstance();
    this.setupInterceptors();
  }

  // ==========================================
  // AXIOS INSTANCE CREATION
  // ==========================================

  private createAxiosInstance(): AxiosInstance {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-App-Version': '2.0.0',
      'X-Platform': AppConfig.platform.OS,
      'X-Environment': AppConfig.environment,
      ...this.config.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (this.config.enableCompression) {
      headers['Accept-Encoding'] = 'gzip, deflate';
    }

    return axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers,
    });
  }

  // ==========================================
  // INTERCEPTORS
  // ==========================================

  private setupInterceptors(): void {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const metadata: RequestMetadata = {
          startTime: Date.now(),
          retryCount: 0,
          attemptNumber: 1,
        };
        
        this.requestMetadata.set(config, metadata);
        config._metadata = metadata;

        logger.network('API Request', {
          method: config.method?.toUpperCase(),
          url: `${config.baseURL}${config.url}`,
          headers: this.sanitizeHeaders(config.headers)
        });

        return config;
      },
      (error: AxiosError) => {
        logger.error('Request interceptor error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response: AxiosResponse) => {
        const metadata = this.requestMetadata.get(response.config as InternalAxiosRequestConfig);
        const duration = metadata ? Date.now() - metadata.startTime : 0;

        logger.network('API Response', {
          status: response.status,
          url: response.config.url,
          duration: `${duration}ms`
        });

        this.requestMetadata.delete(response.config as InternalAxiosRequestConfig);
        return response;
      },
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig;

        if (!originalRequest) {
          logger.error('API Error - No original request', error);
          return Promise.reject(error);
        }

        logger.error('API Error', error, {
          url: originalRequest?.url,
          status: error.response?.status
        });

        // Handle 401
        if (error.response?.status === 401 && !originalRequest._retry) {
          return this.handleUnauthorized(originalRequest, error);
        }

        // Handle retries
        if (this.shouldRetry(error) && !originalRequest._retry) {
          const metadata = this.requestMetadata.get(originalRequest) || originalRequest._metadata;
          if (metadata && metadata.retryCount < this.config.retries) {
            return this.handleRetry(originalRequest, error, metadata);
          }
        }

        this.requestMetadata.delete(originalRequest);
        return Promise.reject(error);
      }
    );
  }

  // ==========================================
  // ERROR HANDLERS
  // ==========================================

  private async handleUnauthorized(
    originalRequest: InternalAxiosRequestConfig,
    error: AxiosError
  ): Promise<any> {
    originalRequest._retry = true;

    try {
      if (this.token && AuthService.refreshToken) {
        logger.info('Attempting to refresh token...');
        const newToken = await AuthService.refreshToken();
        
        if (newToken) {
          this.setToken(newToken);
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
          logger.info('Token refreshed successfully');
          return this.axiosInstance(originalRequest);
        }
      }
    } catch (refreshError) {
      logger.error('Token refresh failed', refreshError);
    }

    return Promise.reject(error);
  }

  private async handleRetry(
    originalRequest: InternalAxiosRequestConfig,
    error: AxiosError,
    metadata: RequestMetadata
  ): Promise<any> {
    metadata.retryCount++;
    metadata.attemptNumber++;
    
    this.requestMetadata.set(originalRequest, metadata);
    originalRequest._retry = true;
    originalRequest._metadata = metadata;

    const delay = this.calculateDelay(metadata.attemptNumber);

    logger.info(`Retrying request (${metadata.attemptNumber}/${this.config.retries + 1})`, {
      url: originalRequest.url,
      delay: `${delay}ms`
    });

    await this.delay(delay);
    originalRequest._retry = false;
    
    return this.axiosInstance(originalRequest);
  }

  private shouldRetry(error: AxiosError): boolean {
    if (axios.isCancel(error)) {
      return false;
    }

    const statusCode = error.response?.status;
    
    if (!statusCode) {
      return true; // Network errors
    }
    
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
    return retryableStatusCodes.includes(statusCode);
  }

  // ==========================================
  // DELAY CALCULATION
  // ==========================================

  protected calculateDelay(attemptNumber: number): number {
    if (this.config.enableExponentialBackoff) {
      return this.calculateExponentialDelay(attemptNumber);
    }
    return this.config.retryDelay;
  }

  private calculateExponentialDelay(attemptNumber: number): number {
    const baseDelay = this.config.retryDelay;
    const maxDelay = this.config.maxRetryDelay;
    
    const exponentialDelay = Math.min(
      baseDelay * Math.pow(2, attemptNumber - 1),
      maxDelay
    );
    
    const jitter = Math.random() * 0.25 * exponentialDelay;
    return Math.floor(exponentialDelay + jitter);
  }

  // ==========================================
  // PUBLIC HTTP METHODS
  // ==========================================

  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.get<T>(url, config);
    return response.data;
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.post<T>(url, data, config);
    return response.data;
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.put<T>(url, data, config);
    return response.data;
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.patch<T>(url, data, config);
    return response.data;
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.delete<T>(url, config);
    return response.data;
  }

  // ==========================================
  // SPECIALIZED METHODS
  // ==========================================

  async postFormData(
    url: string, 
    formData: FormData,
    config?: AxiosRequestConfig & { onUploadProgress?: (percent: number) => void }
  ): Promise<any> {
    const response = await this.axiosInstance.post(url, formData, {
      ...config,
      headers: { 
        ...config?.headers,
        'Content-Type': 'multipart/form-data' 
      },
      timeout: config?.timeout || AppConfig.chat.uploadTimeout || 60000,
      onUploadProgress: config?.onUploadProgress ? (progressEvent: any) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        config.onUploadProgress!(percentCompleted);
      } : undefined,
    });
    
    return response.data;
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  setToken(token: string): void {
    this.token = token;
    this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    logger.debug('API client token updated');
  }

  removeToken(): void {
    this.token = null;
    delete this.axiosInstance.defaults.headers.common['Authorization'];
    logger.debug('API client token removed');
  }

  setHeader(key: string, value: string): void {
    this.axiosInstance.defaults.headers.common[key] = value;
  }

  removeHeader(key: string): void {
    delete this.axiosInstance.defaults.headers.common[key];
  }

  getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }

  getConfig(): Required<ApiClientConfig> {
    return { ...this.config };
  }

  updateRetryConfig(retryConfig: Partial<Pick<ApiClientConfig, 'retries' | 'retryDelay' | 'enableExponentialBackoff' | 'maxRetryDelay'>>): void {
    Object.assign(this.config, retryConfig);
    
    logger.info('Retry configuration updated', {
      retries: this.config.retries,
      retryDelay: this.config.retryDelay,
      enableExponentialBackoff: this.config.enableExponentialBackoff,
      maxRetryDelay: this.config.maxRetryDelay
    });
  }

  // ==========================================
  // PROTECTED HELPERS FOR CHILD CLASSES
  // ==========================================

  protected isSuccessResponse(response: any): boolean {
    return response && (
      response.success === true || 
      response.code === 200 || 
      response.status === 'success'
    );
  }

  protected extractData<T>(response: any): T {
    if (this.isSuccessResponse(response)) {
      return response.data || response.result || response;
    }
    
    const errorMessage = response?.message || response?.error || 'Request failed';
    logger.error('Failed to extract data from response', null, response);
    throw new Error(errorMessage);
  }

  protected safeLogError(message: string, error: any, context?: any): void {
    logger.error(message, error, context);
  }

  protected safeLogInfo(message: string, data?: any): void {
    logger.info(message, data);
  }

  protected safeLogDebug(message: string, data?: any): void {
    logger.debug(message, data);
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    const sensitiveKeys = ['authorization', 'x-auth-token', 'x-api-key', 'cookie'];
    
    Object.keys(sanitized).forEach(key => {
      if (sensitiveKeys.includes(key.toLowerCase())) {
        sanitized[key] = '[HIDDEN]';
      }
    });
    
    return sanitized;
  }
}

// ==========================================
// DEFAULT EXPORT
// ==========================================

export default BaseApiClient;