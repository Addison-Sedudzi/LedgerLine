import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Point straight at the TypeScript source rather than the compiled dist/index.js.
      // esbuild (which Vite uses for both dev and build) compiles TS/ESM natively, which
      // sidesteps a real bug where Rollup's static CJS-export analysis (cjs-module-lexer)
      // fails to see named exports re-exported through the compiled package's
      // Object.defineProperty getters, one require() hop away from their real module.
      // apps/api still consumes the compiled dist/ output, which works there because
      // Node's own CJS require has no such static-analysis step.
      '@ledgerline/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
