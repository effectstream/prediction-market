import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ['buffer', 'process', 'util', 'events'],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  server: {
    port: 3002,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:9996',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'esnext',
  },
  define: {
    global: 'globalThis',
  },
});
