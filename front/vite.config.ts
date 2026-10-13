import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // En développement, les appels /api sont transmis au BFF.
  server: { proxy: { '/api': 'http://localhost:4300' } },
})
