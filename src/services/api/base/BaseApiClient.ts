// src/services/api/base/BaseApiClient.ts
import { chatClient } from '../../../apiManager/Client';
import { AxiosInstance, AxiosResponse } from 'axios';

/**
 * Base API client with common functionality for all API clients
 * Provides authentication, error handling, and logging
 */
export abstract class BaseApiClient {
  protected token: string | null = null;
  protected apiClient: AxiosInstance;

  constructor() {
    this.apiClient = chatClient();
  }

  /**
   * Set authentication token
   */
  setToken(token: string): void {
    this.token = token;
    this.apiClient = chatClient(token);
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
    console.error(`❌ [${this.constructor.name}] ${context}:`, {
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
  protected async get<T>(url: string, config?: any): Promise<T> {
    return this.handleResponse(
      this.apiClient.get(url, config),
      `GET ${url}`
    );
  }

  /**
   * POST request with error handling
   */
  protected async post<T>(url: string, data?: any, config?: any): Promise<T> {
    return this.handleResponse(
      this.apiClient.post(url, data, config),
      `POST ${url}`
    );
  }

  /**
   * PUT request with error handling
   */
  protected async put<T>(url: string, data?: any, config?: any): Promise<T> {
    return this.handleResponse(
      this.apiClient.put(url, data, config),
      `PUT ${url}`
    );
  }

  /**
   * PATCH request with error handling
   */
  protected async patch<T>(url: string, data?: any, config?: any): Promise<T> {
    return this.handleResponse(
      this.apiClient.patch(url, data, config),
      `PATCH ${url}`
    );
  }

  /**
   * DELETE request with error handling
   */
  protected async delete<T>(url: string, config?: any): Promise<T> {
    return this.handleResponse(
      this.apiClient.delete(url, config),
      `DELETE ${url}`
    );
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
}