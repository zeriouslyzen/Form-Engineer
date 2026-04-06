import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react()
  ],
  server: {
    host: true,
  },
  optimizeDeps: {
    exclude: [
      '@mediapipe/pose',
      '@mediapipe/holistic',
      '@mediapipe/camera_utils',
      '@mediapipe/drawing_utils',
    ],
  },
})
