import { defineConfig, loadEnv } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    root: 'web',
    
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
      'import.meta.env.DEFAULT_USER': JSON.stringify(env.DEFAULT_USER),
      'import.meta.env.SERVER_URL': JSON.stringify(env.SERVER_URL),
      
      // Logging configuration
      'import.meta.env.NODE_ENV': JSON.stringify(env.NODE_ENV || 'development'),
      'import.meta.env.ENABLE_LOGGING': JSON.stringify(env.ENABLE_LOGGING || 'true'),
      'import.meta.env.LOG_LEVEL': JSON.stringify(env.LOG_LEVEL || 'debug'),
      'import.meta.env.ENABLE_NETWORK_LOGGING': JSON.stringify(env.ENABLE_NETWORK_LOGGING || 'true'),
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
      outDir: '../dist/web',
      commonjsOptions: {
        include: [/node_modules/],
        ignore: (id) => id.includes('react-native')
      }
    },

    server: {
      port: 5173,
      open: true,
      fs: {
        strict: false,
        allow: ['..']
      }
    }
  };
});