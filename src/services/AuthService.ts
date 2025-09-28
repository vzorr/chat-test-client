// Enhanced AuthService.ts - Added Email/Phone OTP Update functionality
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppLogger } from '../config/AppConfig';
import store from '../stores/Store/store';
import { signOut } from '../stores/reducer/userInfoReducer';
import { setUserToken } from '../stores/reducer/UserTokenReducer';
import { client1 } from '../apiManager/Client';

// ===== 🆕 NEW TYPES FOR OTP FUNCTIONALITY =====

export interface OtpVerificationStatus {
  pendingVerification: boolean;
  targetValue: string; // email or phone
  expiresAt: string;
  verificationId?: string;
  requiresOTP: boolean;
  attempts?: number;
}

export interface EmailUpdateInitResponse {
  success: boolean;
  message: string;
  data: OtpVerificationStatus;
}

export interface PhoneUpdateInitResponse {
  success: boolean;
  message: string;
  data: OtpVerificationStatus;
}

export interface OtpVerificationResponse {
  success: boolean;
  message: string;
  data: {
    email?: string;
    phone?: string;
    emailVerified?: boolean;
    phoneVerified?: boolean;
    updatedAt: string;
    oldEmail?: string;
    oldPhone?: string;
  };
}

export interface PendingVerification {
  id: string;
  type: 'email' | 'phone';
  expiresAt: string;
  attempts: number;
  targetValue: string;
}

export interface ResendOtpResponse {
  success: boolean;
  message: string;
  data: {
    newEmail?: string;
    newPhone?: string;
    expiresAt: string;
    attempt: number;
  };
}

export class AuthService {
  private static navigationRef: any = null;
  private static isNavigationReady: boolean = false;
  private static readonly TOKEN_VALIDATION_BUFFER = 300; // 5 minutes in seconds
  private static readonly MAX_REFRESH_ATTEMPTS = 3;
  private static refreshAttempts = 0;

  // ===== 🆕 OTP VERIFICATION STORAGE KEYS =====
  private static readonly OTP_STORAGE_KEYS = {
    EMAIL_VERIFICATION: 'pendingEmailVerification',
    PHONE_VERIFICATION: 'pendingPhoneVerification',
    LAST_EMAIL_UPDATE: 'lastEmailUpdateAttempt',
    LAST_PHONE_UPDATE: 'lastPhoneUpdateAttempt',
  };

  static setNavigationRef(ref: any) {
    this.navigationRef = ref;
    this.isNavigationReady = !!ref;
    AppLogger.debug(`Navigation ref ${ref ? 'set' : 'cleared'}`);
  }

  // Helper to get current route name
  private static getCurrentRouteName(state: any): string | undefined {
    if (!state) return undefined;
    
    try {
      const route = state.routes[state.index];
      if (route.state) {
        return this.getCurrentRouteName(route.state);
      }
      return route.name;
    } catch (error) {
      AppLogger.warn('Error parsing navigation state:', error);
      return undefined;
    }
  }

  // Check if user is on an auth screen
  private static isOnAuthScreen(): boolean {
    if (!this.navigationRef?.current) return false;
    
    try {
      const state = this.navigationRef.current.getRootState();
      const currentRoute = this.getCurrentRouteName(state);
      const authScreens = ['SignIn', 'SignUp', 'ForgotPassword', 'OtpVerfication', 'NewPassword', 'Splash'];
      const isAuth = authScreens.includes(currentRoute || '');
      
      AppLogger.debug(`Current route: ${currentRoute}, Is auth screen: ${isAuth}`);
      return isAuth;
    } catch (error) {
      AppLogger.warn('Error checking current route:', error);
      return false;
    }
  }

  // FIXED: Enhanced Base64 decode with better error handling
  private static base64Decode(str: string): string {
    if (!str || typeof str !== 'string') {
      throw new Error('Invalid input: base64 string required');
    }

    try {
      // Clean the string and add padding if needed
      const cleanStr = str.replace(/[-_]/g, (char) => char === '-' ? '+' : '/');
      const padding = '='.repeat((4 - cleanStr.length % 4) % 4);
      const base64 = cleanStr + padding;
      
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let result = '';
      
      for (let i = 0; i < base64.length; i += 4) {
        const encoded1 = chars.indexOf(base64[i]);
        const encoded2 = chars.indexOf(base64[i + 1]);
        const encoded3 = chars.indexOf(base64[i + 2]);
        const encoded4 = chars.indexOf(base64[i + 3]);
        
        // Validate characters
        if (encoded1 === -1 || encoded2 === -1) {
          throw new Error('Invalid base64 character');
        }
        
        const bitmap = (encoded1 << 18) | (encoded2 << 12) | 
                      ((encoded3 === -1 ? 0 : encoded3) << 6) | 
                      (encoded4 === -1 ? 0 : encoded4);
        
        result += String.fromCharCode((bitmap >> 16) & 255);
        if (encoded3 !== -1 && encoded3 !== 64) {
          result += String.fromCharCode((bitmap >> 8) & 255);
        }
        if (encoded4 !== -1 && encoded4 !== 64) {
          result += String.fromCharCode(bitmap & 255);
        }
      }
      
      return result;
    } catch (error) {
      AppLogger.error('Base64 decode failed:', error);
      throw new Error('Invalid base64 string format');
    }
  }

  // FIXED: Enhanced token validation with better error handling
  static isTokenExpired(token: string): boolean {
    if (!token || typeof token !== 'string') {
      AppLogger.warn('Invalid token provided for expiration check');
      return true;
    }

    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        AppLogger.warn('Invalid JWT token format - expected 3 parts');
        return true;
      }
      
      const payload = JSON.parse(this.base64Decode(parts[1]));
      
      if (!payload.exp || typeof payload.exp !== 'number') {
        AppLogger.warn('Invalid or missing expiration time in token');
        return true;
      }
      
      const currentTime = Math.floor(Date.now() / 1000);
      const isExpired = payload.exp <= (currentTime + this.TOKEN_VALIDATION_BUFFER);
      
      if (isExpired) {
        const timeUntilExpiry = payload.exp - currentTime;
        AppLogger.info(`Token expired or expires soon (${timeUntilExpiry}s remaining)`);
      }
      
      return isExpired;
    } catch (error) {
      AppLogger.error('Token validation failed:', error);
      return true;
    }
  }

  // FIXED: Enhanced refresh token validation and handling
  static async refreshToken(): Promise<string | null> {
    if (this.refreshAttempts >= this.MAX_REFRESH_ATTEMPTS) {
      AppLogger.error('Max refresh attempts exceeded');
      this.refreshAttempts = 0;
      await this.logout('Too many refresh attempts');
      return null;
    }

    try {
      this.refreshAttempts++;
      AppLogger.info(`Token refresh attempt ${this.refreshAttempts}/${this.MAX_REFRESH_ATTEMPTS}`);

      const refreshToken = await AsyncStorage.getItem('refreshToken');
      
      // FIXED: Validate refresh token before use
      if (!refreshToken || refreshToken.trim() === '') {
        throw new Error('No refresh token available');
      }

      // FIXED: Check if refresh token itself is expired
      if (this.isTokenExpired(refreshToken)) {
        throw new Error('Refresh token is expired');
      }

      AppLogger.info('Attempting to refresh access token...');
      
      const response = await client1().post('/auth/refresh', {
        refreshToken: refreshToken
      });

      // FIXED: Enhanced response validation
      if (!response || !response.data) {
        throw new Error('Invalid response from refresh endpoint');
      }

      const { data } = response;
      
      if (data.code !== 200) {
        throw new Error(`Refresh failed with code ${data.code}: ${data.message || 'Unknown error'}`);
      }

      if (!data.result?.token) {
        throw new Error('No access token in refresh response');
      }

      const newToken = data.result.token;
      
      // FIXED: Validate new token before storing
      if (this.isTokenExpired(newToken)) {
        throw new Error('Received expired token from refresh');
      }

      // Store new tokens
      await AsyncStorage.setItem('userToken', newToken);
      store.dispatch(setUserToken(newToken));
      
      // Update refresh token if provided
      if (data.result.refreshToken) {
        await AsyncStorage.setItem('refreshToken', data.result.refreshToken);
      }
      
      // Reset attempts on success
      this.refreshAttempts = 0;
      AppLogger.info('Token refreshed successfully');
      return newToken;

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      AppLogger.error(`Token refresh failed (attempt ${this.refreshAttempts}):`, errorMessage);
      
      // FIXED: Better error categorization
      if (errorMessage.includes('expired') || errorMessage.includes('invalid') || errorMessage.includes('401')) {
        AppLogger.warn('Refresh token invalid - forcing logout');
        this.refreshAttempts = 0;
        await this.logout('Refresh token invalid');
        return null;
      }

      // For network errors, don't immediately logout - let caller decide
      if (this.refreshAttempts >= this.MAX_REFRESH_ATTEMPTS) {
        AppLogger.error('Max refresh attempts reached - logging out');
        this.refreshAttempts = 0;
        await this.logout('Token refresh failed after multiple attempts');
      }
      
      return null;
    }
  }

  // FIXED: Enhanced token validation and refresh logic
  static async validateAndRefreshToken(token: string): Promise<string | null> {
    if (!token || typeof token !== 'string' || token.trim() === '') {
      AppLogger.warn('No valid token provided for validation');
      return null;
    }

    try {
      if (this.isTokenExpired(token)) {
        AppLogger.info('Token expired, attempting refresh...');
        const refreshedToken = await this.refreshToken();
        
        if (!refreshedToken) {
          AppLogger.warn('Token refresh failed');
          return null;
        }
        
        return refreshedToken;
      }

      // Token is still valid
      AppLogger.debug('Token validation passed');
      return token;
    } catch (error) {
      AppLogger.error('Token validation error:', error);
      return null;
    }
  }

  // FIXED: Enhanced logout with better cleanup and error handling
  static async logout(reason: string = 'User logged out'): Promise<void> {
    try {
      AppLogger.info(`Initiating logout: ${reason}`);
      
      // Reset refresh attempts
      this.refreshAttempts = 0;
      
      // Clear all stored tokens with error handling
      try {
        await AsyncStorage.multiRemove([
          'userToken',
          'refreshToken',
          'fireBaseToken',
          'deviceId',
          // 🆕 Clear OTP verification data on logout
          this.OTP_STORAGE_KEYS.EMAIL_VERIFICATION,
          this.OTP_STORAGE_KEYS.PHONE_VERIFICATION,
          this.OTP_STORAGE_KEYS.LAST_EMAIL_UPDATE,
          this.OTP_STORAGE_KEYS.LAST_PHONE_UPDATE,
        ]);
        AppLogger.debug('AsyncStorage cleared successfully');
      } catch (storageError) {
        AppLogger.warn('Failed to clear AsyncStorage:', storageError);
        // Continue with logout even if storage clear fails
      }

      // Clear Redux state
      try {
        store.dispatch(signOut());
        store.dispatch(setUserToken(''));
        AppLogger.debug('Redux state cleared successfully');
      } catch (reduxError) {
        AppLogger.warn('Failed to clear Redux state:', reduxError);
      }

      // Disconnect chat service with error handling
      try {
        const { chatService } = require('../services/ChatService');
        if (chatService?.disconnect) {
          await chatService.disconnect();
          AppLogger.debug('Chat service disconnected successfully');
        }
      } catch (chatError) {
        AppLogger.warn('Failed to disconnect chat service during logout:', chatError);
      }

      // FIXED: Enhanced navigation with better error handling
      await this.navigateToLogin(reason);
      
      AppLogger.info('Logout completed successfully');
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      AppLogger.error('Error during logout:', errorMessage);
      
      // Even if logout fails, try to navigate to login
      try {
        await this.navigateToLogin('Logout error occurred');
      } catch (navError) {
        AppLogger.error('Failed to navigate after logout error:', navError);
      }
    }
  }

  // FIXED: Enhanced navigation with comprehensive error handling
  private static async navigateToLogin(reason?: string): Promise<void> {
    // FIXED: Enhanced navigation availability check
    if (!this.navigationRef?.current) {
      AppLogger.warn('Navigation ref not available for logout redirect');
      return;
    }

    if (!this.isNavigationReady) {
      AppLogger.warn('Navigation not ready for logout redirect');
      return;
    }

    // Don't navigate if already on auth screen
    if (this.isOnAuthScreen()) {
      AppLogger.info('Already on auth screen, skipping navigation');
      return;
    }

    try {
      // FIXED: Check if navigation ref is still valid before using
      if (!this.navigationRef.current?.reset) {
        AppLogger.warn('Navigation reset method not available');
        return;
      }

      AppLogger.info(`Navigating to login screen${reason ? ` (${reason})` : ''}`);
      
      // Reset navigation stack to prevent back navigation to protected screens
      this.navigationRef.current.reset({
        index: 0,
        routes: [{ 
          name: 'SignIn',
          params: reason ? { logoutReason: reason } : undefined
        }],
      });
      
      AppLogger.info('Successfully navigated to login screen');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      AppLogger.error('Failed to navigate to login screen:', errorMessage);
      
      // FIXED: Fallback navigation attempt
      try {
        if (this.navigationRef.current?.navigate) {
          AppLogger.info('Attempting fallback navigation to SignIn');
          this.navigationRef.current.navigate('SignIn', 
            reason ? { logoutReason: reason } : undefined
          );
        }
      } catch (fallbackError) {
        AppLogger.error('Fallback navigation also failed:', fallbackError);
      }
    }
  }

  // FIXED: Enhanced force logout with better error handling
  static async forceLogout(reason: string = 'Session expired'): Promise<void> {
    AppLogger.warn(`Force logout triggered: ${reason}`);
    
    try {
      await this.logout(reason);
    } catch (error) {
      AppLogger.error('Force logout failed:', error);
      
      // FIXED: Emergency cleanup if normal logout fails
      try {
        AppLogger.warn('Performing emergency cleanup');
        
        // Clear critical storage items
        await AsyncStorage.removeItem('userToken');
        await AsyncStorage.removeItem('refreshToken');
        
        // Clear Redux state
        store.dispatch(signOut());
        store.dispatch(setUserToken(''));
        
        // Try emergency navigation
        if (this.navigationRef?.current?.reset) {
          this.navigationRef.current.reset({
            index: 0,
            routes: [{ name: 'SignIn' }],
          });
        }
        
        AppLogger.info('Emergency cleanup completed');
      } catch (emergencyError) {
        AppLogger.error('Emergency cleanup failed:', emergencyError);
      }
    }
  }

  // FIXED: Enhanced auth status check with better validation
  static async shouldLogout(): Promise<{ shouldLogout: boolean; reason?: string }> {
    try {
      // Check for stored token
      const token = await AsyncStorage.getItem('userToken');
      if (!token || token.trim() === '') {
        return { shouldLogout: true, reason: 'No authentication token found' };
      }

      // Validate token format and expiration
      if (this.isTokenExpired(token)) {
        AppLogger.info('Token expired, attempting refresh...');
        
        const refreshResult = await this.refreshToken();
        if (!refreshResult) {
          return { shouldLogout: true, reason: 'Token expired and refresh failed' };
        }
        
        AppLogger.info('Token refreshed successfully');
        return { shouldLogout: false };
      }

      // Token is valid
      return { shouldLogout: false };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      AppLogger.error('Auth status check failed:', errorMessage);
      return { shouldLogout: true, reason: `Authentication check failed: ${errorMessage}` };
    }
  }

  // FIXED: Get token with validation
  static async getValidToken(): Promise<string | null> {
    try {
      const token = await AsyncStorage.getItem('userToken');
      return await this.validateAndRefreshToken(token || '');
    } catch (error) {
      AppLogger.error('Failed to get valid token:', error);
      return null;
    }
  }

  // FIXED: Check authentication status
  static async isAuthenticated(): Promise<boolean> {
    const { shouldLogout } = await this.shouldLogout();
    return !shouldLogout;
  }

  // FIXED: Utility method to get user info from token
  static getUserInfoFromToken(token: string): any | null {
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
        role: payload.role,
        name: payload.name,
        exp: payload.exp,
        iat: payload.iat
      };
    } catch (error) {
      AppLogger.error('Failed to parse user info from token:', error);
      return null;
    }
  }

  // ===== 🆕 EMAIL UPDATE WITH OTP FUNCTIONALITY =====

  /**
   * Initiate email update process
   * Sends OTP to new email address
   */
  static async initiateEmailUpdate(newEmail: string, password: string): Promise<EmailUpdateInitResponse> {
    const operationId = `email-update-${Date.now()}`;
    
    try {
      AppLogger.info(`🔄 [${operationId}] Initiating email update to: ${newEmail.replace(/(.{2}).*(@.*)/, '$1***$2')}`);

      // Validate inputs
      if (!newEmail || !password) {
        throw new Error('Both newEmail and password are required');
      }

      // Email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newEmail)) {
        throw new Error('Invalid email format');
      }

      // Get valid token
      const token = await this.getValidToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      // Check rate limiting
      const lastAttempt = await AsyncStorage.getItem(this.OTP_STORAGE_KEYS.LAST_EMAIL_UPDATE);
      if (lastAttempt) {
        const timeDiff = Date.now() - parseInt(lastAttempt);
        const minInterval = 2 * 60 * 1000; // 2 minutes
        if (timeDiff < minInterval) {
          throw new Error('Please wait before requesting another email update');
        }
      }

      // Make API request
      const response = await client1().patch('/users/email', {
        newEmail,
        password
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response?.data?.success) {
        throw new Error(response?.data?.message || 'Email update initiation failed');
      }

      // Store verification details locally
      const verificationData = {
        ...response.data.data,
        initiatedAt: new Date().toISOString(),
        newEmail,
        operationId
      };

      await AsyncStorage.setItem(this.OTP_STORAGE_KEYS.EMAIL_VERIFICATION, JSON.stringify(verificationData));
      await AsyncStorage.setItem(this.OTP_STORAGE_KEYS.LAST_EMAIL_UPDATE, Date.now().toString());

      AppLogger.info(` [${operationId}] Email update initiated successfully`);
      
      return {
        success: true,
        message: response.data.message,
        data: response.data.data
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      AppLogger.error(`❌ [${operationId}] Email update initiation failed: ${errorMessage}`);
      
      return {
        success: false,
        message: errorMessage,
        data: {
          pendingVerification: false,
          targetValue: newEmail,
          expiresAt: '',
          requiresOTP: false
        }
      };
    }
  }

  /**
   * Verify email update OTP
   */
  static async verifyEmailUpdate(otp: string): Promise<OtpVerificationResponse> {
    const operationId = `email-verify-${Date.now()}`;
    
    try {
      AppLogger.info(`🔐 [${operationId}] Verifying email update OTP`);

      // Validate OTP
      if (!otp || typeof otp !== 'string') {
        throw new Error('OTP is required and must be a string');
      }

      if (otp.length !== 4 || !/^\d{4}$/.test(otp)) {
        throw new Error('OTP must be exactly 4 digits');
      }

      // Get valid token
      const token = await this.getValidToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      // Make API request
      const response = await client1().post('/users/email/verify', {
        otp
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response?.data?.success) {
        throw new Error(response?.data?.message || 'Email verification failed');
      }

      // Clear stored verification data on success
      await AsyncStorage.removeItem(this.OTP_STORAGE_KEYS.EMAIL_VERIFICATION);

      AppLogger.info(` [${operationId}] Email update completed successfully`);
      
      return {
        success: true,
        message: response.data.message,
        data: response.data.data
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      AppLogger.error(`❌ [${operationId}] Email verification failed: ${errorMessage}`);
      
      return {
        success: false,
        message: errorMessage,
        data: {
          updatedAt: new Date().toISOString()
        }
      };
    }
  }


   /**
   * update Password
   */

  // static async updatePassword(): Promise<ResendOtpResponse> {

  // }

  /**
   * Resend email update OTP
   */
  static async resendEmailUpdateOTP(): Promise<ResendOtpResponse> {
    const operationId = `email-resend-${Date.now()}`;
    
    try {
      AppLogger.info(`🔄 [${operationId}] Resending email update OTP`);

      // Get valid token
      const token = await this.getValidToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      // Make API request
      const response = await client1().post('/users/email/resend-otp', {}, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response?.data?.success) {
        throw new Error(response?.data?.message || 'Failed to resend email OTP');
      }

      AppLogger.info(` [${operationId}] Email OTP resent successfully`);
      
      return {
        success: true,
        message: response.data.message,
        data: response.data.data
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      AppLogger.error(`❌ [${operationId}] Email OTP resend failed: ${errorMessage}`);
      
      return {
        success: false,
        message: errorMessage,
        data: {
          expiresAt: '',
          attempt: 0
        }
      };
    }
  }

  // ===== 🆕 PHONE UPDATE WITH OTP FUNCTIONALITY =====

  /**
   * Initiate phone update process
   * Sends OTP to new phone number via SMS
   */
  static async initiatePhoneUpdate(newPhone: string, password: string): Promise<PhoneUpdateInitResponse> {
    const operationId = `phone-update-${Date.now()}`;
    
    try {
      AppLogger.info(`🔄 [${operationId}] Initiating phone update to: ${newPhone.replace(/(\+?\d{2})\d+(\d{2})/, '$1***$2')}`);

      // Validate inputs
      if (!newPhone || !password) {
        throw new Error('Both newPhone and password are required');
      }

      // Phone format validation
      const phoneRegex = /^\+?[1-9]\d{7,14}$/;
      if (!phoneRegex.test(newPhone)) {
        throw new Error('Invalid phone number format. Please include country code.');
      }

      // Get valid token
      const token = await this.getValidToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      // Check rate limiting
      const lastAttempt = await AsyncStorage.getItem(this.OTP_STORAGE_KEYS.LAST_PHONE_UPDATE);
      if (lastAttempt) {
        const timeDiff = Date.now() - parseInt(lastAttempt);
        const minInterval = 2 * 60 * 1000; // 2 minutes
        if (timeDiff < minInterval) {
          throw new Error('Please wait before requesting another phone update');
        }
      }

      // Make API request
      const response = await client1().patch('/users/phone', {
        newPhone,
        password
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response?.data?.success) {
        throw new Error(response?.data?.message || 'Phone update initiation failed');
      }

      // Store verification details locally
      const verificationData = {
        ...response.data.data,
        initiatedAt: new Date().toISOString(),
        newPhone,
        operationId
      };

      await AsyncStorage.setItem(this.OTP_STORAGE_KEYS.PHONE_VERIFICATION, JSON.stringify(verificationData));
      await AsyncStorage.setItem(this.OTP_STORAGE_KEYS.LAST_PHONE_UPDATE, Date.now().toString());

      AppLogger.info(` [${operationId}] Phone update initiated successfully`);
      
      return {
        success: true,
        message: response.data.message,
        data: response.data.data
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      AppLogger.error(`❌ [${operationId}] Phone update initiation failed: ${errorMessage}`);
      
      return {
        success: false,
        message: errorMessage,
        data: {
          pendingVerification: false,
          targetValue: newPhone,
          expiresAt: '',
          requiresOTP: false
        }
      };
    }
  }

  /**
   * Verify phone update OTP
   */
  static async verifyPhoneUpdate(otp: string): Promise<OtpVerificationResponse> {
    const operationId = `phone-verify-${Date.now()}`;
    
    try {
      AppLogger.info(`🔐 [${operationId}] Verifying phone update OTP`);

      // Validate OTP
      if (!otp || typeof otp !== 'string') {
        throw new Error('OTP is required and must be a string');
      }

      if (otp.length !== 4 || !/^\d{4}$/.test(otp)) {
        throw new Error('OTP must be exactly 4 digits');
      }

      // Get valid token
      const token = await this.getValidToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      // Make API request
      const response = await client1().post('/users/phone/verify', {
        otp
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response?.data?.success) {
        throw new Error(response?.data?.message || 'Phone verification failed');
      }

      // Clear stored verification data on success
      await AsyncStorage.removeItem(this.OTP_STORAGE_KEYS.PHONE_VERIFICATION);

      AppLogger.info(` [${operationId}] Phone update completed successfully`);
      
      return {
        success: true,
        message: response.data.message,
        data: response.data.data
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      AppLogger.error(`❌ [${operationId}] Phone verification failed: ${errorMessage}`);
      
      return {
        success: false,
        message: errorMessage,
        data: {
          updatedAt: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Resend phone update OTP
   */
  static async resendPhoneUpdateOTP(): Promise<ResendOtpResponse> {
    const operationId = `phone-resend-${Date.now()}`;
    
    try {
      AppLogger.info(`🔄 [${operationId}] Resending phone update OTP`);

      // Get valid token
      const token = await this.getValidToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      // Make API request
      const response = await client1().post('/users/phone/resend-otp', {}, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response?.data?.success) {
        throw new Error(response?.data?.message || 'Failed to resend phone OTP');
      }

      AppLogger.info(` [${operationId}] Phone OTP resent successfully`);
      
      return {
        success: true,
        message: response.data.message,
        data: response.data.data
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      AppLogger.error(`❌ [${operationId}] Phone OTP resend failed: ${errorMessage}`);
      
      return {
        success: false,
        message: errorMessage,
        data: {
          expiresAt: '',
          attempt: 0
        }
      };
    }
  }

  // ===== 🆕 VERIFICATION MANAGEMENT FUNCTIONALITY =====

  /**
   * Get pending verifications from server
   */
  static async getPendingVerifications(): Promise<{ success: boolean; data: PendingVerification[]; message: string }> {
    try {
      AppLogger.info('📋 Getting pending verifications');

      // Get valid token
      const token = await this.getValidToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      // Make API request
      const response = await client1().get('/users/verification/pending', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response?.data?.success) {
        throw new Error(response?.data?.message || 'Failed to get pending verifications');
      }

      AppLogger.info(` Retrieved ${response.data.data.length} pending verifications`);
      
      return {
        success: true,
        data: response.data.data,
        message: response.data.message
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      AppLogger.error(`❌ Failed to get pending verifications: ${errorMessage}`);
      
      return {
        success: false,
        data: [],
        message: errorMessage
      };
    }
  }

  /**
   * Cancel pending verification
   */
  static async cancelPendingVerification(type: 'email' | 'phone', reason?: string): Promise<{ success: boolean; message: string }> {
    try {
      AppLogger.info(`🚫 Cancelling ${type} verification`);

      // Get valid token
      const token = await this.getValidToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      // Make API request
      const response = await client1().post('/users/verification/cancel', {
        type,
        reason: reason || 'User requested cancellation'
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response?.data?.success) {
        throw new Error(response?.data?.message || 'Failed to cancel verification');
      }

      // Clear local storage for cancelled verification
      if (type === 'email') {
        await AsyncStorage.removeItem(this.OTP_STORAGE_KEYS.EMAIL_VERIFICATION);
      } else {
        await AsyncStorage.removeItem(this.OTP_STORAGE_KEYS.PHONE_VERIFICATION);
      }

      AppLogger.info(` ${type} verification cancelled successfully`);
      
      return {
        success: true,
        message: response.data.message
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      AppLogger.error(`❌ Failed to cancel ${type} verification: ${errorMessage}`);
      
      return {
        success: false,
        message: errorMessage
      };
    }
  }

  // ===== 🆕 LOCAL VERIFICATION STATE MANAGEMENT =====

  /**
   * Get stored email verification data
   */
  static async getStoredEmailVerification(): Promise<OtpVerificationStatus | null> {
    try {
      const data = await AsyncStorage.getItem(this.OTP_STORAGE_KEYS.EMAIL_VERIFICATION);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      AppLogger.error('Failed to get stored email verification:', error);
      return null;
    }
  }

  /**
   * Get stored phone verification data
   */
  static async getStoredPhoneVerification(): Promise<OtpVerificationStatus | null> {
    try {
      const data = await AsyncStorage.getItem(this.OTP_STORAGE_KEYS.PHONE_VERIFICATION);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      AppLogger.error('Failed to get stored phone verification:', error);
      return null;
    }
  }

  /**
   * Clear all stored verification data
   */
  static async clearStoredVerifications(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        this.OTP_STORAGE_KEYS.EMAIL_VERIFICATION,
        this.OTP_STORAGE_KEYS.PHONE_VERIFICATION
      ]);
      AppLogger.info(' Cleared all stored verification data');
    } catch (error) {
      AppLogger.error('Failed to clear stored verifications:', error);
    }
  }

  /**
   * Check if user has any pending verifications
   */
static async hasPendingVerifications(): Promise<boolean> {
  try {
    const emailVerification = await this.getStoredEmailVerification();
    const phoneVerification = await this.getStoredPhoneVerification();
    
    const hasEmailPending = !!(emailVerification?.pendingVerification && 
                             new Date(emailVerification.expiresAt) > new Date());
    const hasPhonePending = !!(phoneVerification?.pendingVerification && 
                             new Date(phoneVerification.expiresAt) > new Date());
    
    return hasEmailPending || hasPhonePending;
  } catch (error) {
    AppLogger.error('Failed to check pending verifications:', error);
    return false;
  }
}

  // ===== 🆕 UTILITY METHODS FOR OTP VALIDATION =====

  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate phone format
   */
  static isValidPhone(phone: string): boolean {
    const phoneRegex = /^\+?[1-9]\d{7,14}$/;
    return phoneRegex.test(phone);
  }

  /**
   * Validate OTP format
   */
  static isValidOTP(otp: string): boolean {
    return /^\d{4}$/.test(otp);
  }

  /**
   * Format phone number for display (mask middle digits)
   */
  static formatPhoneForDisplay(phone: string): string {
    if (!phone) return '';
    return phone.replace(/(\+?\d{2})\d+(\d{2})/, '$1***$2');
  }

  /**
   * Format email for display (mask middle part)
   */
  static formatEmailForDisplay(email: string): string {
    if (!email) return '';
    return email.replace(/(.{2}).*(@.*)/, '$1***$2');
  }
}