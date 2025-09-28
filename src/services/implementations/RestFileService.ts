// src/services/implementations/rest/RestFileService.ts
import { IFileService } from '../../interfaces';
import { 
  Attachment,
  AttachmentType,
  ValidationException,
  FileUploadException,
  NetworkException
} from '../../../types/chat';

export class RestFileService implements IFileService {
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly MAX_AUDIO_SIZE = 15 * 1024 * 1024; // 15MB
  
  private readonly SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  private readonly SUPPORTED_AUDIO_TYPES = ['audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/m4a'];
  private readonly SUPPORTED_FILE_TYPES = ['application/pdf', 'text/plain', 'application/msword'];

  constructor(
    private apiClient: any,
    private userId: string = ''
  ) {}

  /**
   * Upload a file
   */
  async uploadFile(file: any, type: AttachmentType = AttachmentType.FILE): Promise<Attachment> {
    try {
      console.log('📤 Uploading file:', { 
        name: file.name, 
        type: type,
        size: file.size 
      });
      
      // Validate file
      this.validateFile(file, type);
      
      // Prepare form data
      const formData = this.createFormData(file, type);
      
      // Upload to server
      const response = await this.apiClient.post('/upload', formData, {
        headers: { 
          'Content-Type': 'multipart/form-data'
        },
        timeout: 60000, // 60 second timeout for uploads
        onUploadProgress: (progressEvent: any) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          console.log(`📊 Upload progress: ${percentCompleted}%`);
        }
      });

      if (!response.data?.success) {
        throw new FileUploadException('Upload failed', response.data);
      }

      const attachment: Attachment = {
        id: response.data.file.id,
        type,
        url: response.data.file.url,
        name: response.data.file.name || file.name,
        size: response.data.file.size || file.size,
        thumbnailUrl: response.data.file.thumbnailUrl,
        mimeType: response.data.file.mimeType || file.type,
        uploadedAt: response.data.file.uploadedAt || new Date().toISOString(),
        metadata: response.data.file.metadata
      };

      console.log('✅ File uploaded successfully:', attachment.id);
      return attachment;
      
    } catch (error: any) {
      console.error('❌ File upload failed:', error);
      this.handleUploadError(error, 'file');
      throw error;
    }
  }

  /**
   * Upload an image
   */
  async uploadImage(image: any): Promise<Attachment> {
    try {
      console.log('🖼️ Uploading image:', { 
        name: image.name, 
        size: image.size 
      });
      
      // Validate image
      this.validateImage(image);
      
      // Upload as image type
      return await this.uploadFile(image, AttachmentType.IMAGE);
      
    } catch (error: any) {
      console.error('❌ Image upload failed:', error);
      this.handleUploadError(error, 'image');
      throw error;
    }
  }

  /**
   * Upload audio
   */
  async uploadAudio(audio: any): Promise<Attachment> {
    try {
      console.log('🎵 Uploading audio:', { 
        name: audio.name, 
        size: audio.size 
      });
      
      // Validate audio
      this.validateAudio(audio);
      
      // Upload as audio type
      return await this.uploadFile(audio, AttachmentType.AUDIO);
      
    } catch (error: any) {
      console.error('❌ Audio upload failed:', error);
      this.handleUploadError(error, 'audio');
      throw error;
    }
  }

  /**
   * Delete file
   */
  async deleteFile(fileId: string): Promise<void> {
    try {
      if (!fileId?.trim()) {
        throw new ValidationException('File ID is required');
      }

      console.log('🗑️ Deleting file:', fileId);
      
      await this.apiClient.delete(`/files/${fileId}`);
      
      console.log('✅ File deleted successfully');
      
    } catch (error: any) {
      console.error('❌ File deletion failed:', error);
      throw new NetworkException('Failed to delete file', error);
    }
  }

  /**
   * Get file URL
   */
  async getFileUrl(fileId: string): Promise<string> {
    try {
      if (!fileId?.trim()) {
        throw new ValidationException('File ID is required');
      }

      const response = await this.apiClient.get(`/files/${fileId}/url`);
      
      if (response.data?.success && response.data?.url) {
        return response.data.url;
      }
      
      throw new NetworkException('Failed to get file URL');
      
    } catch (error: any) {
      console.error('❌ Failed to get file URL:', error);
      throw error;
    }
  }

  // Private helper methods

  private validateFile(file: any, type: AttachmentType): void {
    if (!file) {
      throw new ValidationException('File is required');
    }

    if (!file.uri && !file.path) {
      throw new ValidationException('File URI or path is required');
    }

    // Check file size based on type
    const maxSize = this.getMaxSizeForType(type);
    if (file.size && file.size > maxSize) {
      throw new FileUploadException(
        `File size (${this.formatFileSize(file.size)}) exceeds maximum allowed size (${this.formatFileSize(maxSize)})`,
        { size: file.size, maxSize }
      );
    }

    // Check file type
    if (file.type && !this.isValidFileType(file.type, type)) {
      throw new FileUploadException(
        `File type (${file.type}) is not supported for ${type}`,
        { fileType: file.type, supportedTypes: this.getSupportedTypes(type) }
      );
    }
  }

  private validateImage(image: any): void {
    this.validateFile(image, AttachmentType.IMAGE);
    
    // Additional image-specific validation
    if (image.width && image.height) {
      const maxDimension = 4096; // Max 4K resolution
      if (image.width > maxDimension || image.height > maxDimension) {
        throw new FileUploadException(
          `Image dimensions (${image.width}x${image.height}) exceed maximum allowed (${maxDimension}x${maxDimension})`,
          { width: image.width, height: image.height, maxDimension }
        );
      }
    }
  }

  private validateAudio(audio: any): void {
    this.validateFile(audio, AttachmentType.AUDIO);
    
    // Additional audio-specific validation
    if (audio.duration && audio.duration > 300) { // 5 minutes max
      throw new FileUploadException(
        `Audio duration (${audio.duration}s) exceeds maximum allowed (300s)`,
        { duration: audio.duration, maxDuration: 300 }
      );
    }
  }

  private createFormData(file: any, type: AttachmentType): FormData {
    const formData = new FormData();
    
    // Handle different file input formats
    if (typeof window !== 'undefined' && file instanceof File) {
      // Browser File object
      formData.append('file', file);
    } else if (file.uri) {
      // React Native file format
      formData.append('file', {
        uri: file.uri,
        type: file.type || this.getMimeType(type),
        name: file.name || `${type}-${Date.now()}.${this.getFileExtension(type)}`
      } as any);
    } else if (file.path) {
      // Node.js file path
      const fs = require('fs');
      formData.append('file', fs.createReadStream(file.path), {
        filename: file.name || `${type}-${Date.now()}.${this.getFileExtension(type)}`,
        contentType: file.type || this.getMimeType(type)
      });
    }
    
    formData.append('type', type);
    formData.append('userId', this.userId);
    
    return formData;
  }

  private getMaxSizeForType(type: AttachmentType): number {
    switch (type) {
      case AttachmentType.IMAGE:
        return this.MAX_IMAGE_SIZE;
      case AttachmentType.AUDIO:
        return this.MAX_AUDIO_SIZE;
      case AttachmentType.FILE:
      default:
        return this.MAX_FILE_SIZE;
    }
  }

  private getSupportedTypes(type: AttachmentType): string[] {
    switch (type) {
      case AttachmentType.IMAGE:
        return this.SUPPORTED_IMAGE_TYPES;
      case AttachmentType.AUDIO:
        return this.SUPPORTED_AUDIO_TYPES;
      case AttachmentType.FILE:
      default:
        return this.SUPPORTED_FILE_TYPES;
    }
  }

  private isValidFileType(mimeType: string, type: AttachmentType): boolean {
    const supportedTypes = this.getSupportedTypes(type);
    return supportedTypes.includes(mimeType);
  }

  private getMimeType(type: AttachmentType): string {
    switch (type) {
      case AttachmentType.IMAGE:
        return 'image/jpeg';
      case AttachmentType.AUDIO:
        return 'audio/mp4';
      case AttachmentType.FILE:
      default:
        return 'application/octet-stream';
    }
  }

  private getFileExtension(type: AttachmentType): string {
    switch (type) {
      case AttachmentType.IMAGE:
        return 'jpg';
      case AttachmentType.AUDIO:
        return 'm4a';
      case AttachmentType.FILE:
      default:
        return 'bin';
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  private handleUploadError(error: any, fileType: string): void {
    const status = error?.response?.status;
    const errorData = error?.response?.data;
    
    if (status === 413) {
      throw new FileUploadException(`${fileType} size too large`);
    } else if (status === 415) {
      throw new FileUploadException(`Unsupported ${fileType} type`);
    } else if (status === 400) {
      throw new ValidationException(errorData?.message || `Invalid ${fileType}`);
    } else if (status === 401) {
      throw new ValidationException('Authentication required');
    } else if (status === 507) {
      throw new FileUploadException('Server storage full');
    } else {
      throw new NetworkException(`Failed to upload ${fileType}`, error);
    }
  }
}