// AuthService.ts - Updated with correct login endpoint
import { AppConfig } from '../config/AppConfig';
import { logger } from '../utils/Logger';
import { BaseApiClient } from './api/base/BaseApiClient';

export class AuthService {
  private static readonly TOKEN_VALIDATION_BUFFER = 300; // 5 minutes in seconds
  private static readonly MAX_REFRESH_ATTEMPTS = 3;
  private static refreshAttempts = 0;
  private static apiClient: BaseApiClient | null = null;

  // TODO: Add storage service as dependency injection
  // private static storageService: IStorageService;

  /**
   * Initialize or get API client
   */
  private static getApiClient(): BaseApiClient {
    if (!this.apiClient) {
      this.apiClient = new BaseApiClient({
        baseUrl: AppConfig.urls.api,
        timeout: AppConfig.api.timeout,
        headers: AppConfig.api.headers,
        retries: AppConfig.api.retries,
        retryDelay: AppConfig.api.retryDelay,
        enableExponentialBackoff: AppConfig.api.enableExponentialBackoff,
        maxRetryDelay: AppConfig.api.maxRetryDelay,
        enableLogging: AppConfig.debug.enabled,
      });
    }
    return this.apiClient;
  }

  /**
   * Login user with email/phone and password
   * @param emailOrPhone - Email or phone number
   * @param password - User password
   * @param role - User role ('usta' or 'customer')
   */
  static async login(
    emailOrPhone: string, 
    password: string, 
    role: 'usta' | 'customer' = 'usta'
  ) {
    try {
      logger.info('Attempting login', { emailOrPhone, role });

      // Validate inputs
      if (!emailOrPhone || !password) {
        throw new Error('Email/phone and password are required');
      }

      if (!['usta', 'customer'].includes(role)) {
        throw new Error('Role must be either "usta" or "customer"');
      }

      const apiClient = this.getApiClient();
      
      // Updated payload to match new API format
      const response = await apiClient.post<any>('/auth/login', {
        emailOrPhone,
        password,
        role
      });

      // Handle response - server returns data in 'result' field
      if (!response?.success) {
        throw new Error(response?.message || 'Login failed');
      }

      // Server response structure: { success, code, message, result: { userId, token, ... } }
      const responseData = response.result || response.data || response;
      const { token, refreshToken, userId, firstName, lastName, email } = responseData;

      if (!token) {
        console.error('Login response:', JSON.stringify(response, null, 2));
        throw new Error('No token received from server');
      }

      // TODO: Store tokens using injected storage service
      // await this.storageService.set('userToken', token);
      // await this.storageService.set('refreshToken', refreshToken);
      // await this.storageService.set('userData', user);

      // Update API client with new token
      apiClient.setToken(token);

      logger.info('Login successful', { 
        userId: user?.id,
        role: user?.role || role
      });

      return {
        success: true,
        token,
        refreshToken,
        user: {
          id: user?.id,
          name: user?.name,
          email: user?.email,
          phone: user?.phone,
          role: user?.role || role,
          ...user
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      logger.error('Login failed:', error);
      
      return {
        success: false,
        error: errorMessage,
        details: error
      };
    }
  }

  /**
   * Login with email
   */
  static async loginWithEmail(
    email: string,
    password: string,
    role: 'usta' | 'customer' = 'usta'
  ) {
    return this.login(email, password, role);
  }

  /**
   * Login with phone
   */
  static async loginWithPhone(
    phone: string,
    password: string,
    role: 'usta' | 'customer' = 'usta'
  ) {
    return this.login(phone, password, role);
  }

  /**
   * Logout user and clear all stored data
   */
  static async logout(reason: string = 'User logged out') {
    try {
      logger.info(`Initiating logout: ${reason}`);
      
      // Reset refresh attempts
      this.refreshAttempts = 0;
      
      // Clear API client token
      if (this.apiClient) {
        this.apiClient.removeToken();
      }
      
      // TODO: Clear storage using injected storage service
      // await this.storageService.remove('userToken');
      // await this.storageService.remove('refreshToken');
      // await this.storageService.remove('userData');
      
      logger.info('Logout completed successfully');
      
    } catch (error) {
      logger.error('Error during logout:', error);
    }
  }

  /**
   * Check if token is expired
   */
  static isTokenExpired(token: string): boolean {
    if (!token || typeof token !== 'string') {
      logger.warn('Invalid token provided for expiration check');
      return true;
    }

    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        logger.warn('Invalid JWT token format');
        return true;
      }
      
      const payload = JSON.parse(this.base64Decode(parts[1]));
      
      if (!payload.exp || typeof payload.exp !== 'number') {
        logger.warn('Invalid or missing expiration time in token');
        return true;
      }
      
      const currentTime = Math.floor(Date.now() / 1000);
      const isExpired = payload.exp <= (currentTime + this.TOKEN_VALIDATION_BUFFER);
      
      if (isExpired) {
        const timeUntilExpiry = payload.exp - currentTime;
        logger.info(`Token expires in ${timeUntilExpiry}s`);
      }
      
      return isExpired;
    } catch (error) {
      logger.error('Token validation failed:', error);
      return true;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  static async refreshToken() {
    if (this.refreshAttempts >= this.MAX_REFRESH_ATTEMPTS) {
      logger.error('Max refresh attempts exceeded');
      this.refreshAttempts = 0;
      await this.logout('Too many refresh attempts');
      return null;
    }

    try {
      this.refreshAttempts++;
      logger.info(`Token refresh attempt ${this.refreshAttempts}/${this.MAX_REFRESH_ATTEMPTS}`);

      // TODO: Get refresh token from injected storage service
      // const refreshToken = await this.storageService.get('refreshToken');
      const refreshToken = null; // Temporary placeholder
      
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      if (this.isTokenExpired(refreshToken)) {
        throw new Error('Refresh token is expired');
      }

      const apiClient = this.getApiClient();
      const response = await apiClient.post<any>('/auth/refresh', {
        refreshToken
      });

      if (!response?.success || !response?.data?.token) {
        throw new Error(response?.message || 'Token refresh failed');
      }

      const newToken = response.data.token;
      
      // Validate new token
      if (this.isTokenExpired(newToken)) {
        throw new Error('Received expired token from refresh');
      }

      // TODO: Store new tokens using injected storage service
      // await this.storageService.set('userToken', newToken);
      // if (response.data.refreshToken) {
      //   await this.storageService.set('refreshToken', response.data.refreshToken);
      // }
      
      // Update API client token
      apiClient.setToken(newToken);
      
      this.refreshAttempts = 0;
      logger.info('Token refreshed successfully');
      return newToken;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Token refresh failed:`, errorMessage);
      
      if (this.refreshAttempts >= this.MAX_REFRESH_ATTEMPTS) {
        logger.error('Max refresh attempts reached - logging out');
        this.refreshAttempts = 0;
        await this.logout('Token refresh failed');
      }
      
      return null;
    }
  }

  /**
   * Get valid token (refresh if needed)
   */
  static async getValidToken() {
    try {
      // TODO: Get token from injected storage service
      // const token = await this.storageService.get<string>('userToken');
      const token = null; // Temporary placeholder
      
      if (!token) {
        logger.warn('No token found');
        return null;
      }

      if (this.isTokenExpired(token)) {
        logger.info('Token expired, refreshing...');
        return await this.refreshToken();
      }

      // Update API client with valid token
      this.getApiClient().setToken(token);
      return token;
      
    } catch (error) {
      logger.error('Failed to get valid token:', error);
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  static async isAuthenticated() {
    try {
      const token = await this.getValidToken();
      return !!token;
    } catch (error) {
      logger.error('Authentication check failed:', error);
      return false;
    }
  }

  /**
   * Get user info from stored data
   */
  static async getCurrentUser() {
    try {
      // TODO: Get user data from injected storage service
      // const userData = await this.storageService.get('userData');
      // return userData;
      return null; // Temporary placeholder
    } catch (error) {
      logger.error('Failed to get current user:', error);
      return null;
    }
  }

  /**
   * Get user info from token
   */
  static getUserInfoFromToken(token: string) {
    try {
      if (!token || this.isTokenExpired(token)) {
        return null;
      }

      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const payload = JSON.parse(this.base64Decode(parts[1]));
      return {
        id: payload.id,
        email: payload.email,
        phone: payload.phone,
        role: payload.role,
        name: payload.name,
        exp: payload.exp,
        iat: payload.iat
      };
    } catch (error) {
      logger.error('Failed to parse user info from token:', error);
      return null;
    }
  }

  /**
   * Validate login credentials format
   */
  static validateCredentials(emailOrPhone: string, password: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validate email or phone
    if (!emailOrPhone || !emailOrPhone.trim()) {
      errors.push('Email or phone is required');
    } else {
      const trimmed = emailOrPhone.trim();
      
      // Check if it's an email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      // Check if it's a phone (basic check)
      const phoneRegex = /^[\d\s\-\+\(\)]+$/;
      
      if (!emailRegex.test(trimmed) && !phoneRegex.test(trimmed)) {
        errors.push('Invalid email or phone format');
      }
    }

    // Validate password
    if (!password) {
      errors.push('Password is required');
    } else if (password.length < 6) {
      errors.push('Password must be at least 6 characters');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Base64 decode helper
   */
  private static base64Decode(str: string): string {
    try {
      // Clean the string and add padding if needed
      const cleanStr = str.replace(/[-_]/g, (char) => char === '-' ? '+' : '/');
      const padding = '='.repeat((4 - cleanStr.length % 4) % 4);
      const base64 = cleanStr + padding;
      
      // Decode base64
      if (typeof atob === 'function') {
        // Browser environment
        return atob(base64);
      } else {
        // Node.js environment
        return Buffer.from(base64, 'base64').toString('utf-8');
      }
    } catch (error) {
      logger.error('Base64 decode failed:', error);
      throw new Error('Invalid base64 string');
    }
  }

  // TODO: Add method to inject storage service
  // static setStorageService(storage: IStorageService) {
  //   this.storageService = storage;
  // }
}