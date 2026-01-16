// 交易所类型
export type ExchangeType = 'binance' | 'okx';

// 合约数据
export interface FuturesData {
  symbol: string;           // 标准化币种名称 (如 BTC)
  originalSymbol: string;   // 原始交易对名称
  exchange: ExchangeType;
  price: number;
  fundingRate: number;      // 原始费率值 (如 0.0001 = 0.01%)
  settlementPeriodHours: number;
  nextSettlementTime: Date;
}

// 资金费率套利项
export interface FundingRateArbitrageItem {
  symbol: string;
  binance: {
    price: number;
    fundingRate: number;
    fundingRatePercent: string;
    settlementPeriodHours: number;
    nextSettlementTime: string;
    countdownSeconds: number;
  };
  okx: {
    price: number;
    fundingRate: number;
    fundingRatePercent: string;
    settlementPeriodHours: number;
    nextSettlementTime: string;
    countdownSeconds: number;
  };
  annualizedYield: number;
  annualizedYieldPercent: string;
  priceDiff: number;
}

// 监控配置
export interface MonitorConfig {
  binanceApiKey?: string;
  binanceApiSecret?: string;
  okxApiKey?: string;
  okxApiSecret?: string;
  okxPassphrase?: string;
  proxyUrl?: string;
  autoMonitor: {
    enabled: boolean;
    mode: 'interval' | 'fixed';
    intervalSeconds?: number;
    fixedMinute?: number;
  };
}

// WebSocket 消息类型
export type WSMessageType =
  | 'CONFIG_UPDATE'
  | 'MANUAL_REFRESH'
  | 'SUBSCRIBE'
  | 'FUNDING_RATE_ARBITRAGE_DATA'
  | 'STATUS_UPDATE'
  | 'ERROR'
  | 'LOG';

// 客户端发送的消息
export interface WSClientMessage {
  type: 'CONFIG_UPDATE' | 'MANUAL_REFRESH' | 'SUBSCRIBE';
  payload?: MonitorConfig | {
    fundingRateArbitrage: boolean;
  };
}

// 服务端发送的消息
export interface WSServerMessage {
  type: WSMessageType;
  payload: unknown;
}

// 日志级别
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// 日志消息
export interface LogMessage {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

// 重试配置
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

// 交易所API响应基础结构
export interface BinanceFuturesTicker {
  symbol: string;
  price: string;
}

export interface BinancePremiumIndex {
  symbol: string;
  markPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
  interestRate: string;
}

// 币安资金费率配置信息
export interface BinanceFundingInfo {
  symbol: string;
  adjustedFundingRateCap: string;
  adjustedFundingRateFloor: string;
  fundingIntervalHours: number;
  disclaimer: boolean;
}

export interface OKXTickerData {
  instId: string;
  last: string;
  askPx: string;
  bidPx: string;
}

export interface OKXFundingRateData {
  instId: string;
  fundingRate: string;
  nextFundingRate: string;
  fundingTime: string;
  nextFundingTime: string;
}
