import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // `hls.js` is intentionally loaded as a separate chunk and can exceed Vite's default warning threshold.
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        // Keep Recharts in a single chunk to avoid circular cross-chunk re-exports.
        manualChunks(id) {
          if (id.includes('node_modules/recharts')) return 'recharts';
        },
      },
    },
  },
  server: {
    port: 3010,
    strictPort: true,
  }
})
