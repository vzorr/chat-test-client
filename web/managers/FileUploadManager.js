// web/managers/FileUploadManager.js - COMPLETE UPDATED VERSION

export class FileUploadManager {
  constructor(baseURL, getToken) {
    this.baseURL = baseURL;
    this.getToken = getToken;
    
    // File size limits (in bytes)
    this.MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    this.MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    this.MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
    this.MAX_AUDIO_SIZE = 20 * 1024 * 1024; // 20MB
    this.MAX_DOCUMENT_SIZE = 25 * 1024 * 1024; // 25MB
    
    // Allowed file types
    this.ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    this.ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
    this.ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm'];
    this.ALLOWED_DOCUMENT_TYPES = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'application/zip',
      'application/x-rar-compressed'
    ];
    
    console.log('[FILE UPLOAD MANAGER] Initialized with baseURL:', this.baseURL);
  }

  /**
   * Validate file before upload
   */
  validateFile(file) {
    console.log('[FILE UPLOAD] Validating file:', {
      name: file.name,
      size: file.size,
      type: file.type
    });

    // Check if file exists
    if (!file) {
      return { valid: false, error: 'No file selected' };
    }

    // Get file category
    const category = this.getFileCategory(file.type);
    
    // Check file type
    const allAllowedTypes = [
      ...this.ALLOWED_IMAGE_TYPES,
      ...this.ALLOWED_VIDEO_TYPES,
      ...this.ALLOWED_AUDIO_TYPES,
      ...this.ALLOWED_DOCUMENT_TYPES
    ];

    if (!allAllowedTypes.includes(file.type)) {
      return { 
        valid: false, 
        error: `File type "${file.type}" is not allowed. Please upload images, videos, audio, or documents.` 
      };
    }

    // Check file size based on category
    let maxSize;
    switch (category) {
      case 'image':
        maxSize = this.MAX_IMAGE_SIZE;
        break;
      case 'video':
        maxSize = this.MAX_VIDEO_SIZE;
        break;
      case 'audio':
        maxSize = this.MAX_AUDIO_SIZE;
        break;
      case 'document':
        maxSize = this.MAX_DOCUMENT_SIZE;
        break;
      default:
        maxSize = this.MAX_FILE_SIZE;
    }

    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File size (${this.formatFileSize(file.size)}) exceeds the maximum allowed size of ${this.formatFileSize(maxSize)}`
      };
    }

    console.log('[FILE UPLOAD] File validation passed');
    return { valid: true };
  }

  /**
   * Get file category based on MIME type
   */
  getFileCategory(mimeType) {
    if (this.ALLOWED_IMAGE_TYPES.includes(mimeType)) return 'image';
    if (this.ALLOWED_VIDEO_TYPES.includes(mimeType)) return 'video';
    if (this.ALLOWED_AUDIO_TYPES.includes(mimeType)) return 'audio';
    if (this.ALLOWED_DOCUMENT_TYPES.includes(mimeType)) return 'document';
    return 'file';
  }

  /**
   * Upload file to server
   * @param {File} file - The file to upload
   * @param {Function} onProgress - Progress callback (optional)
   * @returns {Promise<Object>} - Upload result with file URL
   */
  async uploadFile(file, onProgress = null) {
    console.log('[FILE UPLOAD] Starting upload:', file.name);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      const category = this.getFileCategory(file.type);
      
      // IMPORTANT: Use the correct field name based on category
      // Backend expects 'image', 'audio', 'video', 'document' as field names
      let fieldName;
      switch (category) {
        case 'image':
          fieldName = 'image';
          break;
        case 'video':
          fieldName = 'video';
          break;
        case 'audio':
          fieldName = 'audio';
          break;
        case 'document':
          fieldName = 'document';
          break;
        default:
          fieldName = 'file';
      }
      
      // Append file to form data with correct field name
      formData.append(fieldName, file);

      // Progress tracking
      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            console.log(`[FILE UPLOAD] Progress: ${percentComplete.toFixed(1)}%`);
            onProgress(percentComplete);
          }
        });
      }

      console.log('[FILE MESSAGE] Full server response:', JSON.stringify(uploadedFile, null, 2));
      
      // Load event - successful upload
      xhr.addEventListener('load', () => {
        console.log('[FILE UPLOAD] Upload complete, status:', xhr.status);
        
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            console.log('[FILE UPLOAD] Upload successful:', response);
            
            // Handle different response formats
            if (response.success && response.file) {
              resolve(response.file);
            } else if (response.url) {
              resolve({
                url: response.url,
                filename: response.filename || file.name,
                originalName: file.name,
                size: file.size,
                mimeType: file.type
              });
            } else {
              resolve(response);
            }
          } catch (error) {
            console.error('[FILE UPLOAD] Failed to parse response:', error);
            reject(new Error('Invalid server response'));
          }
        } else {
          console.error('[FILE UPLOAD] Upload failed with status:', xhr.status);
          
          // Try to parse error response
          try {
            const errorResponse = JSON.parse(xhr.responseText);
            const errorMessage = errorResponse.error?.message || errorResponse.message || 'Upload failed';
            reject(new Error(errorMessage));
          } catch (e) {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      });

      // Error event
      xhr.addEventListener('error', () => {
        console.error('[FILE UPLOAD] Network error during upload');
        reject(new Error('Network error during upload'));
      });

      // Abort event
      xhr.addEventListener('abort', () => {
        console.warn('[FILE UPLOAD] Upload aborted');
        reject(new Error('Upload aborted'));
      });

      // Determine upload endpoint based on file category
      let endpoint;
      switch (category) {
        case 'image':
          endpoint = `${this.baseURL}/api/v1/upload/image`;
          break;
        case 'video':
          endpoint = `${this.baseURL}/api/v1/upload/video`;
          break;
        case 'audio':
          endpoint = `${this.baseURL}/api/v1/upload/audio`;
          break;
        case 'document':
          endpoint = `${this.baseURL}/api/v1/upload/document`;
          break;
        default:
          endpoint = `${this.baseURL}/api/v1/upload/file`;
      }

      console.log('[FILE UPLOAD] Request sent to', endpoint, 'with field name:', fieldName);

      // Open connection
      xhr.open('POST', endpoint, true);

      // Set authorization header
      const token = this.getToken();
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      // Send request
      xhr.send(formData);
    });
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Get file icon based on MIME type
   */
  getFileIcon(mimeType) {
    const category = this.getFileCategory(mimeType);
    
    const icons = {
      image: `
        <svg class="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      `,
      video: `
        <svg class="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      `,
      audio: `
        <svg class="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      `,
      document: `
        <svg class="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      `,
      file: `
        <svg class="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      `
    };

    return icons[category] || icons.file;
  }

  /**
   * Render file attachment in message
   */
  renderFileAttachment(attachment) {
    const category = this.getFileCategory(attachment.type || attachment.mimeType);
    
    if (category === 'image') {
      return `
        <div class="mt-2">
          <img 
            src="${attachment.url}" 
            alt="${attachment.name || 'Image'}"
            class="max-w-xs rounded-lg shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
            onclick="window.open('${attachment.url}', '_blank')"
          />
          <div class="text-xs text-gray-500 mt-1">${attachment.name || 'Image'} • ${this.formatFileSize(attachment.size || 0)}</div>
        </div>
      `;
    }
    
    if (category === 'video') {
      return `
        <div class="mt-2">
          <video 
            controls 
            class="max-w-xs rounded-lg shadow-sm"
            src="${attachment.url}"
          >
            Your browser does not support the video tag.
          </video>
          <div class="text-xs text-gray-500 mt-1">${attachment.name || 'Video'} • ${this.formatFileSize(attachment.size || 0)}</div>
        </div>
      `;
    }
    
    if (category === 'audio') {
      return `
        <div class="mt-2 p-3 bg-gray-100 rounded-lg max-w-xs">
          <div class="flex items-center gap-2 mb-2">
            ${this.getFileIcon(attachment.type || attachment.mimeType)}
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-800 truncate">${attachment.name || 'Audio'}</div>
              <div class="text-xs text-gray-500">${this.formatFileSize(attachment.size || 0)}</div>
            </div>
          </div>
          <audio controls class="w-full" src="${attachment.url}">
            Your browser does not support the audio tag.
          </audio>
        </div>
      `;
    }
    
    // Document or generic file
    return `
      <a 
        href="${attachment.url}" 
        target="_blank"
        class="mt-2 flex items-center gap-3 p-3 bg-gray-100 hover:bg-gray-200 rounded-lg max-w-xs transition-colors"
      >
        ${this.getFileIcon(attachment.type || attachment.mimeType)}
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-gray-800 truncate">${attachment.name || 'File'}</div>
          <div class="text-xs text-gray-500">${this.formatFileSize(attachment.size || 0)}</div>
        </div>
        <svg class="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </a>
    `;
  }

  // Add to FileUploadManager.js

  // Add to FileUploadManager.js

renderFileAttachment(attachment) {
  if (!attachment || !attachment.url) {
    return '<div class="text-xs text-red-500">Invalid attachment</div>';
  }
  
  const fileType = this.getFileType(attachment.mimeType);
  const icon = this.getFileIcon(attachment.mimeType);
  const filename = attachment.filename || attachment.name || 'file';
  const size = attachment.size || 0;
  
  // IMAGE - Click to view in lightbox
  if (fileType === 'image') {
    return `
      <div class="file-attachment image-attachment cursor-pointer group" 
           onclick="window.chatApp.viewImage('${attachment.url}', '${this.escapeHtml(filename)}')">
        <div class="relative inline-block">
          <img 
            src="${attachment.url}" 
            alt="${this.escapeHtml(filename)}"
            class="max-w-xs max-h-64 rounded-lg object-cover shadow-md group-hover:shadow-xl transition-shadow"
            loading="lazy"
            onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><rect fill=%22%23ccc%22 width=%22200%22 height=%22200%22/><text x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22>Image not found</text></svg>'"
          />
          <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity rounded-lg flex items-center justify-center">
            <svg class="w-10 h-10 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </div>
        </div>
        <div class="text-xs text-gray-500 mt-1">${this.escapeHtml(filename)}</div>
      </div>
    `;
  }
  
  // VIDEO - Inline player
  if (fileType === 'video') {
    return `
      <div class="file-attachment video-attachment">
        <video 
          controls 
          class="max-w-md max-h-96 rounded-lg shadow-md"
          preload="metadata"
        >
          <source src="${attachment.url}" type="${attachment.mimeType}">
          Your browser does not support video playback.
        </video>
        <div class="text-xs text-gray-500 mt-1">
          ${this.escapeHtml(filename)} • ${this.formatFileSize(size)}
        </div>
      </div>
    `;
  }
  
  // AUDIO - Inline player
  if (fileType === 'audio') {
    return `
      <div class="file-attachment audio-attachment">
        <div class="flex items-center gap-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
          <svg class="w-8 h-8 text-purple-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
          </svg>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-800 truncate">${this.escapeHtml(filename)}</div>
            <audio controls class="w-full mt-2">
              <source src="${attachment.url}" type="${attachment.mimeType}">
            </audio>
          </div>
        </div>
      </div>
    `;
  }
  
  // PDF - Open in new tab
  if (attachment.mimeType === 'application/pdf') {
    return `
      <div class="file-attachment pdf-attachment">
        <a 
          href="${attachment.url}" 
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-200 hover:bg-red-100 transition-colors"
        >
          <svg class="w-8 h-8 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
          </svg>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-800 truncate">${this.escapeHtml(filename)}</div>
            <div class="text-xs text-gray-500">${this.formatFileSize(size)} • Click to view PDF</div>
          </div>
          <svg class="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    `;
  }
  
  // OTHER FILES - Download button
  return `
    <div class="file-attachment document-attachment">
      <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
        <div class="flex-shrink-0">${icon}</div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-gray-800 truncate">${this.escapeHtml(filename)}</div>
          <div class="text-xs text-gray-500">${this.formatFileSize(size)}</div>
        </div>
        <a 
          href="${attachment.url}" 
          download="${this.escapeHtml(filename)}"
          class="flex-shrink-0 p-2 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
          title="Download ${this.escapeHtml(filename)}"
        >
   
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </a>
      </div>
    </div>
  `;
}

escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Get file type category from MIME type
 * (This is different from getFileCategory - returns simpler categories)
 */
getFileType(mimeType) {
  if (!mimeType) return 'file';
  
  const mime = mimeType.toLowerCase();
  
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  
  // Document types
  if (
    mime.includes('document') ||
    mime.includes('word') ||
    mime.includes('excel') ||
    mime.includes('sheet') ||
    mime.includes('presentation') ||
    mime.includes('powerpoint') ||
    mime === 'text/plain'
  ) {
    return 'document';
  }
  
  // Archive types
  if (
    mime.includes('zip') ||
    mime.includes('rar') ||
    mime.includes('7z') ||
    mime.includes('tar') ||
    mime.includes('gzip')
  ) {
    return 'archive';
  }
  
  return 'file';
}


  /**
   * Render upload progress
   */
  renderUploadProgress(progress, filename) {
    return `
      <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div class="flex items-center gap-3 mb-2">
          <div class="animate-spin w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full"></div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-800 truncate">Uploading ${filename}</div>
            <div class="text-xs text-gray-500">${progress.toFixed(0)}%</div>
          </div>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2">
          <div 
            class="bg-blue-600 h-2 rounded-full transition-all duration-300" 
            style="width: ${progress}%"
          ></div>
        </div>
      </div>
    `;
  }
}