// src/services/api/clients/FileApiClient.ts
import { BaseApiClient } from '../base/BaseApiClient';
import { 
  Attachment,
  AttachmentType
} from '../../../types/chat';

/**
 * File API Client - handles file upload operations only
 */
export class FileApiClient extends BaseApiClient {

  /**
   * Upload a file attachment
   */
  async uploadFile(file: any, type: AttachmentType): Promise<Attachment> {
    try {
      console.log('📤 [FileApiClient] Uploading file:', { name: file.name, type });
      
      // Validate file size
      const maxSizes = {
        image: 5 * 1024 * 1024, // 5MB
        audio: 15 * 1024 * 1024, // 15MB
        file: 10 * 1024 * 1024, // 10MB
        video: 50 * 1024 * 1024, // 50MB
        document: 10 * 1024 * 1024, // 10MB
      };

      const maxSize = maxSizes[type] || maxSizes.file;
      if (file.size && file.size > maxSize) {
        throw new Error(
          `File size (${file.size}) exceeds maximum allowed size (${maxSize}) for ${type} files`
        );
      }

      // Create form data
      const formData = this.createFormData(file, type);

      // Upload with progress tracking
      const response = await this.apiClient.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${this.token}`,
        },
        timeout: 60000, // 60 seconds for file uploads
        onUploadProgress: (progressEvent: any) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          console.log(`📊 [FileApiClient] Upload progress: ${percentCompleted}%`);
        }
      });

      if (response.data?.success) {
        const attachment: Attachment = {
          id: response.data.file.id,
          type,
          url: response.data.file.url,
          name: response.data.file.name || file.name,
          size: response.data.file.size || file.size,
          thumbnailUrl: response.data.file.thumbnailUrl,
          mimeType: response.data.file.mimeType || file.type,
          duration: response.data.file.duration,
          width: response.data.file.width,
          height: response.data.file.height,
          uploadedAt: response.data.file.uploadedAt || new Date().toISOString()
        };
        
        console.log('✅ [FileApiClient] File uploaded successfully');
        return attachment;
      }
      
      throw new Error('Upload failed');
    } catch (error: any) {
      this.safeLogError('Error uploading file', error);
      throw error;
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(fileId: string): Promise<void> {
    try {
      console.log('🗑️ [FileApiClient] Deleting file:', fileId);
      
      await this.delete(`/files/${fileId}`);
      
      console.log('✅ [FileApiClient] File deleted successfully');
    } catch (error: any) {
      this.safeLogError('Error deleting file', error);
      throw error;
    }
  }

  /**
   * Get file information
   */
  async getFileInfo(fileId: string): Promise<{
    success: boolean;
    file?: Attachment;
  }> {
    try {
      console.log('🔍 [FileApiClient] Getting file info:', fileId);
      
      const response = await this.get(`/files/${fileId}`);
      
      if (this.isSuccessResponse(response)) {
        return {
          success: true,
          file: this.transformFileResponse(response.file)
        };
      }
      
      return { success: false };
    } catch (error: any) {
      if (error.response?.status === 404) {
        return { success: false };
      }
      this.safeLogError('Error getting file info', error);
      throw error;
    }
  }

  /**
   * Get file download URL (for private files)
   */
  async getFileDownloadUrl(fileId: string): Promise<{
    success: boolean;
    url?: string;
    expiresAt?: string;
  }> {
    try {
      const response = await this.get(`/files/${fileId}/download-url`);
      
      if (this.isSuccessResponse(response)) {
        return {
          success: true,
          url: response.url,
          expiresAt: response.expiresAt
        };
      }
      
      return { success: false };
    } catch (error: any) {
      this.safeLogError('Error getting download URL', error);
      return { success: false };
    }
  }

  /**
   * Generate thumbnail for image/video
   */
  async generateThumbnail(fileId: string, options?: {
    width?: number;
    height?: number;
    quality?: number;
  }): Promise<{
    success: boolean;
    thumbnailUrl?: string;
  }> {
    try {
      console.log('🖼️ [FileApiClient] Generating thumbnail for:', fileId);
      
      const response = await this.post(`/files/${fileId}/thumbnail`, options || {});
      
      if (this.isSuccessResponse(response)) {
        return {
          success: true,
          thumbnailUrl: response.thumbnailUrl
        };
      }
      
      return { success: false };
    } catch (error: any) {
      this.safeLogError('Error generating thumbnail', error);
      return { success: false };
    }
  }

  /**
   * Get upload statistics
   */
  async getUploadStats(): Promise<{
    totalUploads: number;
    totalSize: number;
    typeBreakdown: Record<string, number>;
    recentUploads: Attachment[];
  }> {
    try {
      const response = await this.get('/files/stats');
      
      if (this.isSuccessResponse(response)) {
        return {
          totalUploads: response.totalUploads || 0,
          totalSize: response.totalSize || 0,
          typeBreakdown: response.typeBreakdown || {},
          recentUploads: (response.recentUploads || []).map((file: any) => 
            this.transformFileResponse(file)
          )
        };
      }
      
      throw new Error('Failed to get upload stats');
    } catch (error: any) {
      this.safeLogError('Error getting upload stats', error);
      return {
        totalUploads: 0,
        totalSize: 0,
        typeBreakdown: {},
        recentUploads: []
      };
    }
  }

  /**
   * Validate file before upload
   */
  validateFile(file: any, type: AttachmentType): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check if file exists
    if (!file) {
      errors.push('File is required');
      return { isValid: false, errors };
    }

    // Check file size
    const maxSizes = {
      image: 5 * 1024 * 1024, // 5MB
      audio: 15 * 1024 * 1024, // 15MB
      file: 10 * 1024 * 1024, // 10MB
      video: 50 * 1024 * 1024, // 50MB
      document: 10 * 1024 * 1024, // 10MB
    };

    const maxSize = maxSizes[type] || maxSizes.file;
    if (file.size && file.size > maxSize) {
      errors.push(`File size exceeds maximum allowed size (${this.formatFileSize(maxSize)})`);
    }

    // Check file type
    const allowedTypes = this.getAllowedMimeTypes(type);
    if (file.type && !allowedTypes.includes(file.type)) {
      errors.push(`File type ${file.type} is not allowed for ${type}`);
    }

    // Check file name
    if (file.name && file.name.length > 255) {
      errors.push('File name is too long (max 255 characters)');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Compress image file before upload
   */
  async compressImage(file: any, options?: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
  }): Promise<any> {
    try {
      console.log('🗜️ [FileApiClient] Compressing image');
      
      const formData = new FormData();
      formData.append('file', file);
      if (options?.maxWidth) formData.append('maxWidth', options.maxWidth.toString());
      if (options?.maxHeight) formData.append('maxHeight', options.maxHeight.toString());
      if (options?.quality) formData.append('quality', options.quality.toString());
      
      const response = await this.post('/files/compress', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      if (this.isSuccessResponse(response)) {
        return response.compressedFile;
      }
      
      throw new Error('Compression failed');
    } catch (error: any) {
      this.safeLogError('Error compressing image', error);
      throw error;
    }
  }

  /**
   * Get user's file usage statistics
   */
  async getUserFileUsage(): Promise<{
    totalFiles: number;
    totalSize: number;
    storageLimit: number;
    usagePercentage: number;
    typeBreakdown: Record<AttachmentType, { count: number; size: number }>;
  }> {
    try {
      const response = await this.get('/files/usage');
      
      if (this.isSuccessResponse(response)) {
        return {
          totalFiles: response.totalFiles || 0,
          totalSize: response.totalSize || 0,
          storageLimit: response.storageLimit || 0,
          usagePercentage: response.usagePercentage || 0,
          typeBreakdown: response.typeBreakdown || {}
        };
      }
      
      throw new Error('Failed to get file usage');
    } catch (error: any) {
      this.safeLogError('Error getting file usage', error);
      return {
        totalFiles: 0,
        totalSize: 0,
        storageLimit: 0,
        usagePercentage: 0,
        typeBreakdown: {}
      };
    }
  }

  // ========================================
  // PRIVATE HELPER METHODS
  // ========================================

  /**
   * Create FormData for file upload
   */
  private createFormData(file: any, type: AttachmentType): FormData {
    const formData = new FormData();
    
    // Handle different platforms
    const isNodeEnvironment = typeof window === 'undefined' && typeof global !== 'undefined';
    
    if (isNodeEnvironment) {
      // Node.js environment - use standard FormData with fs
      const fs = require('fs');
      
      if (file.path) {
        formData.append('file', fs.createReadStream(file.path), {
          filename: file.name || `${type}-${Date.now()}.bin`,
          contentType: file.type || this.getMimeType(type)
        });
      } else if (file.buffer) {
        formData.append('file', file.buffer, {
          filename: file.name || `${type}-${Date.now()}.bin`,
          contentType: file.type || this.getMimeType(type)
        });
      } else {
        throw new Error('Invalid file format for Node.js environment');
      }
    } else {
      // Browser/React Native environment
      if (file.uri) {
        // React Native format
        formData.append('file', {
          uri: file.uri,
          type: file.type || this.getMimeType(type),
          name: file.name || `${type}-${Date.now()}.${this.getFileExtension(type)}`
        } as any);
      } else {
        // Browser File object
        formData.append('file', file);
      }
    }
    
    formData.append('type', type);
    
    return formData;
  }

  /**
   * Transform file response to Attachment format
   */
  private transformFileResponse(data: any): Attachment {
    return {
      id: data.id,
      type: data.type || AttachmentType.FILE,
      url: data.url,
      name: data.name,
      size: data.size || 0,
      thumbnailUrl: data.thumbnailUrl,
      mimeType: data.mimeType,
      duration: data.duration,
      width: data.width,
      height: data.height,
      uploadedAt: data.uploadedAt || data.createdAt
    };
  }

  /**
   * Get MIME type for attachment type
   */
  private getMimeType(type: AttachmentType): string {
    switch (type) {
      case AttachmentType.IMAGE: return 'image/jpeg';
      case AttachmentType.AUDIO: return 'audio/mp4';
      case AttachmentType.VIDEO: return 'video/mp4';
      case AttachmentType.DOCUMENT: return 'application/pdf';
      case AttachmentType.FILE:
      default: return 'application/octet-stream';
    }
  }

  /**
   * Get file extension for attachment type
   */
  private getFileExtension(type: AttachmentType): string {
    switch (type) {
      case AttachmentType.IMAGE: return 'jpg';
      case AttachmentType.AUDIO: return 'm4a';
      case AttachmentType.VIDEO: return 'mp4';
      case AttachmentType.DOCUMENT: return 'pdf';
      case AttachmentType.FILE:
      default: return 'bin';
    }
  }

  /**
   * Get allowed MIME types for attachment type
   */
  private getAllowedMimeTypes(type: AttachmentType): string[] {
    switch (type) {
      case AttachmentType.IMAGE:
        return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      case AttachmentType.AUDIO:
        return ['audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/aac'];
      case AttachmentType.VIDEO:
        return ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
      case AttachmentType.DOCUMENT:
        return ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      case AttachmentType.FILE:
      default:
        return ['*/*']; // Allow all types for generic files
    }
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}