import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 개발: Vite 5280, 게임 서버 45678(WS·이미지 프록시). 운영: 서버가 dist/ 서빙.
// 모듈 스크립트의 crossorigin 속성 제거(일부 WebKit에서 same-origin 모듈 로드 실패 회피)
const stripCrossorigin = {
  name: 'strip-crossorigin',
  transformIndexHtml(html) { return html.replace(/ crossorigin/g, ''); },
};

export default defineConfig({
  plugins: [react(), stripCrossorigin],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5280,
    strictPort: true,
    proxy: {
      '/gostop': 'http://localhost:45678',
      '/cards': 'http://localhost:45678',
    },
  },
});
