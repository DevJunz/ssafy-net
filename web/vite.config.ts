import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 세션 쿠키를 같은 오리진으로 주고받기 위해 개발 중에도 프록시를 쓴다.
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/n': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
