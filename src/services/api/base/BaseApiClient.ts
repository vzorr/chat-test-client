// src/services/api/BaseApiClient.ts - Fixed TypeScript issues
import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';

import { AppConfig, AppLogger } from '../../../config/AppConfig';
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

interface RequestMetadata {
  startTime: number;
  retryCount: number; // No longer optional - always initialized to 0
  attemptNumber: number; // Track attempt number for exponential backoff
}

// Extend InternalAxiosRequestConfig to include _retry
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retry?: boolean;
  }
}

// ==========================================
// BASE API CLIENT
// ==========================================

export class BaseApiClient {
  protected axiosInstance: AxiosInstance;
  protected config: Required<ApiClientConfig>; // Make all config properties required
  protected token: string | null = null;
  
  private requestMetadata = new WeakMap<InternalAxiosRequestConfig, RequestMetadata>();

  constructor(config: ApiClientConfig = {}) {
    // Merge with defaults - ensuring all properties are defined
    this.config = {
      baseUrl: config.baseUrl || AppConfig.api.baseUrl,
      token: config.token || null,
      timeout: config.timeout || AppConfig.api.timeout,
      headers: config.headers || {},
      retries: config.retries ?? AppConfig.api.retries,
      retryDelay: config.retryDelay ?? AppConfig.api.retryDelay,
      enableExponentialBackoff: config.enableExponentialBackoff ?? false,
      maxRetryDelay: config.maxRetryDelay ?? 10000,
      enableLogging: config.enableLogging ?? AppConfig.debug.enabled,
      enableCompression: true,
    };

    this.token = this.config.token;
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

        logger.network('API Request', {
          method: config.method?.toUpperCase(),
          url: `${config.baseURL}${config.url}`,
          headers: this.sanitizeHeaders(config.headers),
        });

        return config;
      },
      (error: AxiosError) => {
        logger.error('Request error', error);
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
          duration: `${duration}ms`,
        });

        return response;
      },
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig;

        logger.error('API Error', error, {
          url: originalRequest?.url,
          status: error.response?.status,
        });

        // Handle 401
        if (error.response?.status === 401 && !originalRequest._retry) {
          return this.handleUnauthorized(originalRequest, error);
        }

        // Handle retries
        if (this.shouldRetry(error) && !originalRequest._retry) {
          const metadata = this.requestMetadata.get(originalRequest);
          if (metadata && metadata.retryCount < this.config.retries) {
            return this.handleRetry(originalRequest, error, metadata);
          }
        }

        return Promise.reject(error);
      }
    );
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

    const delay = this.calculateDelay(metadata.attemptNumber);

    logger.info(`Retrying request (${metadata.attemptNumber}/${this.config.retries + 1})`, {
      url: originalRequest.url,
      delay: `${delay}ms`,
    });

    await this.delay(delay);
    return this.axiosInstance(originalRequest);
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
        const newToken = await AuthService.refreshToken();
        
        if (newToken) {
          this.setToken(newToken);
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
          return this.axiosInstance(originalRequest);
        }
      }
    } catch (refreshError) {
      AppLogger.error('Token refresh failed:', refreshError);
    }

    return Promise.reject(error);
  }



  private shouldRetry(error: AxiosError): boolean {
    // Determine if the error is retryable based on status code
    const statusCode = error.response?.status;
    
    if (!statusCode) {
      // Network errors are retryable
      return true;
    }
    
    // Retry on specific status codes
    const retryableStatusCodes = [
      408, // Request Timeout
      429, // Too Many Requests
      500, // Internal Server Error
      502, // Bad Gateway
      503, // Service Unavailable
      504, // Gateway Timeout
    ];
    
    return retryableStatusCodes.includes(statusCode);
  }

  private calculateExponentialDelay(attemptNumber: number): number {
    // Calculate exponential backoff delay
    const baseDelay = this.config.retryDelay;
    const maxDelay = this.config.maxRetryDelay;
    
    // 2^attempt * baseDelay with jitter
    const exponentialDelay = Math.min(
      baseDelay * Math.pow(2, attemptNumber - 1),
      maxDelay
    );
    
    // Add random jitter (0-25% of calculated delay)
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
  // UTILITY METHODS
  // ==========================================

  setToken(token: string): void {
    this.token = token;
    this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  removeToken(): void {
    this.token = null;
    delete this.axiosInstance.defaults.headers.common['Authorization'];
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

  // Get current configuration
  getConfig(): Required<ApiClientConfig> {
    return { ...this.config };
  }

  // Update retry configuration at runtime
  updateRetryConfig(retryConfig: Partial<Pick<ApiClientConfig, 'retries' | 'retryDelay' | 'enableExponentialBackoff' | 'maxRetryDelay'>>): void {
    Object.assign(this.config, retryConfig);
    
    if (this.config.enableLogging) {
      AppLogger.info('Retry configuration updated:', {
        retries: this.config.retries,
        retryDelay: this.config.retryDelay,
        enableExponentialBackoff: this.config.enableExponentialBackoff,
        maxRetryDelay: this.config.maxRetryDelay,
      });
    }
  }

  // ==========================================
  // PROTECTED HELPERS FOR CHILD CLASSES
  // ==========================================

  protected async uploadFormData(url: string, formData: FormData, onProgress?: (percent: number) => void): Promise<any> {
    const response = await this.axiosInstance.post(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: AppConfig.chat.uploadTimeout,
      onUploadProgress: onProgress ? (progressEvent: any) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percentCompleted);
      } : undefined,
    });
    return response.data;
  }

  protected isSuccessResponse(response: any): boolean {
    return response && (response.success === true || response.code === 200);
  }

  protected extractData<T>(response: any): T {
    if (this.isSuccessResponse(response)) {
      return response.data || response.result || response;
    }
    throw new Error(response?.message || response?.error || 'Request failed');
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    if (sanitized.Authorization) {
      sanitized.Authorization = '[HIDDEN]';
    }
    if (sanitized['x-auth-token']) {
      sanitized['x-auth-token'] = '[HIDDEN]';
    }
    return sanitized;
  }
}

// ==========================================
// API CLIENT FACTORY
// ==========================================

export class ApiClientFactory {
  private static instances = new Map<string, BaseApiClient>();

  static create(name: string, config?: ApiClientConfig): BaseApiClient {
    if (!this.instances.has(name)) {
      this.instances.set(name, new BaseApiClient(config));
    }
    return this.instances.get(name)!;
  }

  static get(name: string): BaseApiClient | undefined {
    return this.instances.get(name);
  }

  static destroy(name: string): void {
    this.instances.delete(name);
  }

  static destroyAll(): void {
    this.instances.clear();
  }
}

// ==========================================
// DEFAULT EXPORT
// ==========================================

export default BaseApiClient;