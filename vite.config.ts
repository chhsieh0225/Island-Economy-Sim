import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/Island-Economy-Sim/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // ── Vendor: React runtime (rarely changes → long cache) ───
          if (id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react/')    ||
              id.includes('node_modules/scheduler')) {
            return 'react-vendor';
          }
          // ── Charts library ───────────────────────────────────────
          if (id.includes('node_modules/recharts') ||
              id.includes('node_modules/d3-')      ||
              id.includes('node_modules/victory-vendor')) {
            return 'recharts';
          }
          // ── Game engine core (pure logic, no React) ──────────────
          if (id.includes('/src/engine/')) {
            return 'game-engine';
          }
        },
      },
    },
  },
})
