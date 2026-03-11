import { defineConfig, normalizePath } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    nodePolyfills({
      include: ['buffer', 'process', 'crypto', 'path', 'assert', 'stream', 'util', 'events'],
      globals: { Buffer: true, global: true, process: true },
    }),
    // Copy zkConfig files (keys, zkir) so the wallet can verify proofs
    viteStaticCopy({
      targets: [
        {
          src: normalizePath(
            path.resolve(
              __dirname, '..', 'shared', 'contracts', 'midnight',
              'prediction-market-contract', 'src', 'managed', 'keys', '*',
            ),
          ),
          dest: 'keys',
        },
        {
          src: normalizePath(
            path.resolve(
              __dirname, '..', 'shared', 'contracts', 'midnight',
              'prediction-market-contract', 'src', 'managed', 'zkir', '*',
            ),
          ),
          dest: 'zkir',
        },
        {
          src: normalizePath(
            path.resolve(
              __dirname, '..', 'shared', 'contracts', 'midnight',
              'prediction-market-contract.undeployed.json',
            ),
          ),
          dest: 'contract_address',
        },
      ],
    }),
  ],
  server: {
    port: 3002,
    host: '0.0.0.0',
    allowedHosts: true,
    // Required for SharedArrayBuffer used by Midnight WASM proof generation
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:9996',
        changeOrigin: true,
      },
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'esnext',
    commonjsOptions: {
      transformMixedEsModules: true,
      extensions: ['.js', '.cjs'],
    },
  },
  optimizeDeps: {
    exclude: [
      '@midnight-ntwrk/compact-runtime',
      '@midnight-ntwrk/ledger',
    ],
    esbuildOptions: {
      target: 'esnext',
      define: { global: 'globalThis' },
    },
  },
  define: {
    global: 'globalThis',
  },
});
