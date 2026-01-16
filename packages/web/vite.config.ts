import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // 将 React 相关库单独打包
          'react-vendor': ['react', 'react-dom'],
          // 将 Ant Design 单独打包
          'antd-vendor': ['antd', '@ant-design/icons'],
          // 将状态管理库单独打包
          'zustand-vendor': ['zustand'],
        },
      },
    },
  },
});
