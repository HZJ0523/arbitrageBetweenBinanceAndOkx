import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import logger from './utils/logger.js';

/**
 * 创建 Fastify 应用
 */
export async function createApp() {
  const app = Fastify({
    logger: false, // 使用我们自己的 logger
  });

  // 注册 CORS
  await app.register(cors, {
    origin: true, // 允许所有来源
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // 注册 WebSocket
  await app.register(websocket, {
    options: {
      maxPayload: 1048576, // 1MB
    },
  });

  // 健康检查端点
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // 错误处理
  app.setErrorHandler((error, request, reply) => {
    logger.error('Server error', {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
    });

    reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  });

  return app;
}

export default createApp;
