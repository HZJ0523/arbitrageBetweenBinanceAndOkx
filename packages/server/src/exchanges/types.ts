import type { FuturesData, ExchangeType, ExchangeAccountInfo } from '../types/index.js';

/**
 * 交易所 API 配置
 */
export interface ExchangeApiConfig {
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string; // OKX 需要
  proxyUrl?: string;
}

/**
 * 交易所基础接口
 */
export interface IExchange {
  readonly name: ExchangeType;

  /**
   * 更新配置
   */
  updateConfig(config: ExchangeApiConfig): void;

  /**
   * 获取所有 USDT 永续合约数据
   */
  getAllFuturesData(): Promise<FuturesData[]>;

  /**
   * 获取账户信息 (余额和延迟)
   */
  getAccountInfo(): Promise<ExchangeAccountInfo>;

  /**
   * 检查是否配置了 API
   */
  isConfigured(): boolean;
}

/**
 * HTTP 请求选项
 */
export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  params?: Record<string, string | number>;
  data?: unknown;
  timeout?: number;
}
