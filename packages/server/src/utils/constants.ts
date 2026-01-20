/**
 * 共享常量定义 - 极限性能优化版
 */

// 缓存 TTL (毫秒)
export const CACHE_TTL = {
  METADATA: 10 * 60 * 1000,  // 元数据缓存 10 分钟 (fundingInfo, instruments 等)
  PRICE: 5 * 1000,           // 价格缓存 5 秒
} as const;

// HTTP 请求超时 (毫秒) - 缩短超时提高响应速度
export const REQUEST_TIMEOUT = {
  PUBLIC_API: 8000,     // 公共 API 8秒
  PRIVATE_API: 10000,   // 私有 API 10秒
  ORDER: 15000,         // 下单操作 15秒
  DEFAULT: 10000,       // 默认 10秒
} as const;

// 重试配置 - 减少重试次数和延迟
export const RETRY_CONFIG = {
  MAX_RETRIES: 2,       // 最多重试2次（共3次尝试）
  BASE_DELAY: 500,      // 基础延迟 500ms
  MAX_DELAY: 5000,      // 最大延迟 5秒
  BACKOFF_MULTIPLIER: 2,
} as const;

// 并发控制 - 极限并发
export const CONCURRENCY = {
  MAX_PARALLEL_REQUESTS: 100, // 最大并行请求数
  OKX_BATCH_SIZE: 100,        // OKX 批量请求大小（一次发100个）
  OKX_BATCH_DELAY_MS: 0,      // 批次间无延迟（依赖 Keep-Alive）
} as const;

export default {
  CACHE_TTL,
  REQUEST_TIMEOUT,
  RETRY_CONFIG,
  CONCURRENCY,
};
