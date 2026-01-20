import pino from 'pino';
import type { LogLevel, LogMessage } from '../types/index.js';

// 创建 pino logger 实例
const isProduction = process.env.NODE_ENV === 'production';

const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }),
});

// 日志订阅者回调类型
type LogSubscriber = (log: LogMessage) => void;

// 日志订阅者列表
const subscribers: Set<LogSubscriber> = new Set();

// 创建日志消息
function createLogMessage(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): LogMessage {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    context,
  };
}

// 通知所有订阅者
function notifySubscribers(log: LogMessage): void {
  subscribers.forEach((subscriber) => {
    try {
      subscriber(log);
    } catch (error) {
      pinoLogger.error({ error }, 'Error in log subscriber');
    }
  });
}

// Logger 封装
export const logger = {
  debug(message: string, context?: Record<string, unknown>): void {
    pinoLogger.debug(context, message);
    notifySubscribers(createLogMessage('debug', message, context));
  },

  info(message: string, context?: Record<string, unknown>): void {
    pinoLogger.info(context, message);
    notifySubscribers(createLogMessage('info', message, context));
  },

  warn(message: string, context?: Record<string, unknown>): void {
    pinoLogger.warn(context, message);
    notifySubscribers(createLogMessage('warn', message, context));
  },

  error(message: string, context?: Record<string, unknown>): void {
    pinoLogger.error(context, message);
    notifySubscribers(createLogMessage('error', message, context));
  },

  // 订阅日志
  subscribe(callback: LogSubscriber): () => void {
    subscribers.add(callback);
    return () => {
      subscribers.delete(callback);
    };
  },
};

export default logger;
