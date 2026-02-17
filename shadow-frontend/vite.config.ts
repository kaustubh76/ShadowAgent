import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Proxy to facilitator backend on :3001
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, ''),
      },
    },
    fs: {
      // Allow serving files from the SDK's node_modules for WASM
      allow: [
        // Allow current project
        '.',
        // Allow parent SDK directory
        path.resolve(__dirname, '../shadow-sdk'),
        // Allow SDK node_modules
        path.resolve(__dirname, '../shadow-sdk/node_modules'),
      ],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'esnext', // Support top-level await for Aleo WASM
    commonjsOptions: {
      transformMixedEsModules: true, // Handle mixed ESM/CJS modules
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext', // Support top-level await
    },
    include: ['core-js'], // Pre-bundle core-js to fix require issues
    exclude: ['@provablehq/wasm'], // Don't pre-bundle WASM modules
  },
  esbuild: {
    target: 'esnext', // Support top-level await
  },
});
