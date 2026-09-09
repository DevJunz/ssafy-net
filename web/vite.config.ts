import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

/**
 * `--mode demo`로 빌드하면 **서버 없이 도는 정적 번들**이 나온다.
 *
 * 디자인 피드백용이다. 캡처해 둔 실제 API 응답으로 화면을 채우므로(web/src/mocks)
 * DB도 로그인도 없이 URL만 열면 바로 앱이 보인다.
 * 플래그를 .env 파일이 아니라 여기서 넣는 이유는 `.env.*`가 git에서 제외되기 때문이다.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // shadcn/ui 컴포넌트가 `@/components/ui/...`, `@/lib/utils` 로 서로를 가리킨다.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    'import.meta.env.VITE_DEMO': JSON.stringify(mode === 'demo' ? '1' : ''),
  },
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
}));
