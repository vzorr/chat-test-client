/**
 * React Native Shim for Browser
 * Provides minimal React Native API that our code needs
 */

export const Platform = {
  OS: 'web',
  Version: '1.0.0',
  select: function(obj) {
    return obj.web || obj.default || obj.native || {};
  }
};

export const StyleSheet = {
  create: function(styles) {
    return styles;
  }
};

export const Dimensions = {
  get: function() {
    if (typeof window !== 'undefined') {
      return { 
        width: window.innerWidth, 
        height: window.innerHeight 
      };
    }
    return { width: 0, height: 0 };
  }
};

export const AppState = {
  currentState: 'active',
  addEventListener: function() {
    return { remove: function() {} };
  },
  removeEventListener: function() {}
};

// Default export
export default {
  Platform,
  StyleSheet,
  Dimensions,
  AppState
};