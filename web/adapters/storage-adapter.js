/**
 * Browser Storage Adapter
 * Maps React Native AsyncStorage API to browser localStorage
 */

class BrowserStorageAdapter {
  constructor() {
    this.prefix = '@MyUsta:';
  }

  async getItem(key) {
    try {
      return localStorage.getItem(this.prefix + key);
    } catch (error) {
      console.error('Storage getItem error:', error);
      return null;
    }
  }

  async setItem(key, value) {
    try {
      localStorage.setItem(this.prefix + key, value);
    } catch (error) {
      console.error('Storage setItem error:', error);
      throw error;
    }
  }

  async removeItem(key) {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch (error) {
      console.error('Storage removeItem error:', error);
      throw error;
    }
  }

  async clear() {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('Storage clear error:', error);
      throw error;
    }
  }

  async getAllKeys() {
    try {
      const keys = Object.keys(localStorage);
      return keys
        .filter(key => key.startsWith(this.prefix))
        .map(key => key.replace(this.prefix, ''));
    } catch (error) {
      console.error('Storage getAllKeys error:', error);
      return [];
    }
  }

  async multiGet(keys) {
    try {
      return keys.map(key => [key, localStorage.getItem(this.prefix + key)]);
    } catch (error) {
      console.error('Storage multiGet error:', error);
      return [];
    }
  }

  async multiSet(keyValuePairs) {
    try {
      keyValuePairs.forEach(([key, value]) => {
        localStorage.setItem(this.prefix + key, value);
      });
    } catch (error) {
      console.error('Storage multiSet error:', error);
      throw error;
    }
  }

  async multiRemove(keys) {
    try {
      keys.forEach(key => {
        localStorage.removeItem(this.prefix + key);
      });
    } catch (error) {
      console.error('Storage multiRemove error:', error);
      throw error;
    }
  }
}

// Create singleton
const AsyncStorage = new BrowserStorageAdapter();

// Export as default
export default AsyncStorage;

// Also named export
export { AsyncStorage };