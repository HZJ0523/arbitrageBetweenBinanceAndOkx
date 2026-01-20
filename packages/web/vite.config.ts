import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
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
    sourcemap: mode !== 'production',
    // 代码分割优化
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-antd': ['antd'],
          'vendor-zustand': ['zustand'],
        },
      },
    },
    // chunk 大小警告阈值 (antd 库较大，调高阈值避免警告)
    chunkSizeWarningLimit: 1000,
  },
  // 预构建优化
  optimizeDeps: {
    include: ['react', 'react-dom', 'antd', 'zustand'],
  },
}));
