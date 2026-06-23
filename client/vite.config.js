import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 개발: Vite 5280, 게임 서버 45678(WS·이미지 프록시). 운영: 서버가 dist/ 서빙.
export default defineConfig({
  plugins: [react()],
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
