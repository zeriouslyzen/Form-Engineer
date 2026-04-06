import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    basicSsl()
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
