import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 세션 쿠키를 같은 오리진으로 주고받기 위해 개발 중에도 프록시를 쓴다.
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      // 알림 딥링크 /n/:deliveryId (design/20 §5.3).
      // 키는 정규식이어야 한다. '/n'으로 두면 접두사 매칭이라
      // /node_modules/... 까지 API로 넘어가 개발 서버가 통째로 깨진다.
      '^/n/': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
