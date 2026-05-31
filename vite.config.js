import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // Leaflet is large — keep it as a separate chunk
      output: {
        manualChunks: {
          leaflet: ['leaflet'],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  // Ensure Leaflet's CSS and images are handled correctly
  optimizeDeps: {
    include: ['leaflet'],
  },
})
