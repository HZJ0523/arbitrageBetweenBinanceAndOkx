// 从共享类型包重导出所有通用类型
export {
  type ExchangeType,
  type LogLevel,
  type LogMessage,
  type ExchangeAccountInfo,
  type AccountInfo,
  type ExchangeArbitrageData,
  type FundingRateArbitrageItem,
  type MonitorConfig,
  type ConnectionStatus,
  type WSMessageType,
  type WSClientMessage,
  type WSServerMessage,
  type FundingRateArbitragePayload,
  type StatusUpdatePayload,
  type ErrorPayload,
} from '@cryptos/shared';

// ============================================
// 服务端专用类型定义
// ============================================

// 合约数据 (服务端内部使用)
export interface FuturesData {
  symbol: string;           // 标准化币种名称 (如 BTC)
  originalSymbol: string;   // 原始交易对名称
  exchange: 'binance' | 'okx';
  price: number;
  fundingRate: number;      // 原始费率值 (如 0.0001 = 0.01%)
  settlementPeriodHours: number;
  nextSettlementTime: Date;
}

// 重试配置
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

// 交易所 API 响应结构 (币安)
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

// 交易所 API 响应结构 (OKX)
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
