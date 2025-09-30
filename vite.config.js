import { defineConfig, loadEnv } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    root: 'web',
    
    // --- START: Port Configuration Added ---
    server: {
      // Set the development server port to 3000 as requested
      port: 3000, 
      strictPort: true, // Ensures the port is strictly 3000
    },
    // --- END: Port Configuration Added ---

    // Expose env variables to the client
    define: {
      // User profiles
      'import.meta.env.USTA_ID': JSON.stringify(env.USTA_ID),
      'import.meta.env.USTA_NAME': JSON.stringify(env.USTA_NAME),
      'import.meta.env.USTA_EMAIL': JSON.stringify(env.USTA_EMAIL),
      'import.meta.env.USTA_PHONE': JSON.stringify(env.USTA_PHONE),
      'import.meta.env.USTA_ROLE': JSON.stringify(env.USTA_ROLE),
      'import.meta.env.USTA_TOKEN': JSON.stringify(env.USTA_TOKEN),
      'import.meta.env.CUSTOMER_ID': JSON.stringify(env.CUSTOMER_ID),
      'import.meta.env.CUSTOMER_NAME': JSON.stringify(env.CUSTOMER_NAME),
      'import.meta.env.CUSTOMER_EMAIL': JSON.stringify(env.CUSTOMER_EMAIL),
      'import.meta.env.CUSTOMER_PHONE': JSON.stringify(env.CUSTOMER_PHONE),
      'import.meta.env.CUSTOMER_ROLE': JSON.stringify(env.CUSTOMER_ROLE),
      'import.meta.env.CUSTOMER_TOKEN': JSON.stringify(env.CUSTOMER_TOKEN),
      'import.meta.env.JOB_ID': JSON.stringify(env.JOB_ID),
      'import.meta.env.JOB_TITLE': JSON.stringify(env.JOB_TITLE),
      'import.meta.env.DEFAULT_USER': JSON.stringify(env.DEFAULT_USER || 'usta'),
      
      // API Configuration
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(env.VITE_API_BASE_URL),
      'import.meta.env.VITE_REALTIME_URL': JSON.stringify(env.VITE_REALTIME_URL),

      // Logging Configuration
      'import.meta.env.ENABLE_CONSOLE_LOGGING': JSON.stringify(env.ENABLE_CONSOLE_LOGGING || 'true'),
      'import.meta.env.ENABLE_SOCKET_LOGGING': JSON.stringify(env.ENABLE_SOCKET_LOGGING || 'true'),
      'import.meta.env.ENABLE_PERFORMANCE_LOGGING': JSON.stringify(env.ENABLE_PERFORMANCE_LOGGING || 'true'),
      
      // Polyfill process.env for browser (minimal)
      'process.env.NODE_ENV': JSON.stringify(env.NODE_ENV || 'development'),
    },
    
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@services': resolve(__dirname, 'src/services'),
        '@config': resolve(__dirname, 'src/config'),
        '@types': resolve(__dirname, 'src/types'),
        '@utils': resolve(__dirname, 'src/utils'),
        'react-native': resolve(__dirname, 'web/adapters/react-native-shim.js'),
        '@react-native-async-storage/async-storage': resolve(__dirname, 'web/adapters/storage-adapter.js'),
      },
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
    },

    optimizeDeps: {
      exclude: ['react-native'],
      include: ['socket.io-client', 'axios', 'uuid', 'events'],
      esbuildOptions: {
        target: 'es2020',
        define: {
          global: 'globalThis'
        }
      }
    },

    build: {
      target: 'es2020',
      outDir: 'dist/web', // Ensure output directory is set correctly
      emptyOutDir: true,
      sourcemap: true,
      minify: 'esbuild'
    }
  };
});
