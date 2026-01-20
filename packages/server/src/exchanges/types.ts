import type { FuturesData, ExchangeType, ExchangeAccountInfo, PositionSide, OrderResult } from '../types/index.js';

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
   * 获取单个交易对的最新合约数据
   */
  getSingleFuturesData(symbol: string): Promise<FuturesData | null>;

  /**
   * 获取账户信息 (余额和延迟)
   */
  getAccountInfo(): Promise<ExchangeAccountInfo>;

  /**
   * 检查是否配置了 API
   */
  isConfigured(): boolean;

  /**
   * 设置杠杆倍数
   */
  setLeverage(symbol: string, leverage: number): Promise<void>;

  /**
   * 市价开仓
   */
  openPosition(symbol: string, side: PositionSide, usdtAmount: number): Promise<OrderResult>;

  /**
   * 市价平仓
   */
  closePosition(symbol: string, side: PositionSide): Promise<OrderResult>;
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
