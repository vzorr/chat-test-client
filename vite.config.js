import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  root: 'web',
  
  resolve: {
    alias: {
      // Source mappings
      '@': resolve(__dirname, 'src'),
      '@services': resolve(__dirname, 'src/services'),
      '@config': resolve(__dirname, 'src/config'),
      '@types': resolve(__dirname, 'src/types'),
      '@utils': resolve(__dirname, 'src/utils'),
      
      // CRITICAL: Completely replace React Native packages
      'react-native': resolve(__dirname, 'web/adapters/react-native-shim.js'),
      '@react-native-async-storage/async-storage': resolve(__dirname, 'web/adapters/storage-adapter.js'),
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
  },

  optimizeDeps: {
    // Don't pre-bundle these
    exclude: ['react-native'],
    
    // Force these into the bundle
    include: [
      'socket.io-client',
      'axios',
      'uuid',
      'events'
    ],
    
    esbuildOptions: {
      target: 'es2020'
    }
  },

  build: {
    target: 'es2020',
    outDir: 'dist',
    commonjsOptions: {
      include: [/node_modules/],
      // CRITICAL: Ignore react-native completely
      ignore: (id) => id.includes('react-native')
    }
  },

  esbuild: {
    target: 'es2020'
  },

  server: {
    port: 5173,
    open: true,
    fs: {
      strict: false,
      allow: ['..']
    }
  }
});