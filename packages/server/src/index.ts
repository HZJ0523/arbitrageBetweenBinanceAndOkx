import { createApp } from './app.js';
import { registerWebSocketRoutes, stopWebSocketService } from './websocket.js';
import logger from './utils/logger.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  try {
    const app = await createApp();

    // 注册 WebSocket 路由
    registerWebSocketRoutes(app);

    // 启动服务器
    await app.listen({ port: PORT, host: HOST });

    logger.info(`Server started on http://${HOST}:${PORT}`);
    logger.info(`WebSocket endpoint: ws://${HOST}:${PORT}/ws`);

    // 优雅关闭
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down...`);

      stopWebSocketService();

      await app.close();

      logger.info('Server stopped');
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

main();
