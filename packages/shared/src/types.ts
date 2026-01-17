// ============================================
// 共享类型定义 - 前后端通用
// ============================================

// 交易所类型
export type ExchangeType = 'binance' | 'okx';

// 日志级别
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// 日志消息
export interface LogMessage {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

// 单个交易所账户信息
export interface ExchangeAccountInfo {
  exchange: ExchangeType;
  configured: boolean;          // 是否配置了 API
  latencyMs: number | null;     // API 延迟 (毫秒)，null 表示未测试或失败
  availableBalance: number | null; // USDT 可用余额，null 表示获取失败
  error: string | null;         // 错误信息
}

// 账户信息汇总
export interface AccountInfo {
  binance: ExchangeAccountInfo;
  okx: ExchangeAccountInfo;
  updatedAt: string;            // 更新时间 ISO 格式
}

// 单个交易所的套利数据
export interface ExchangeArbitrageData {
  price: number;
  fundingRate: number;
  fundingRatePercent: string;
  settlementPeriodHours: number;
  nextSettlementTime: string;
  countdownSeconds: number;
}

// 资金费率套利项
export interface FundingRateArbitrageItem {
  symbol: string;
  binance: ExchangeArbitrageData;
  okx: ExchangeArbitrageData;
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

// 连接状态
export interface ConnectionStatus {
  isConnected: boolean;
  isMonitoring: boolean;
  isRefreshing: boolean;
  nextUpdateAt: string | null;
  lastError: string | null;
}

// WebSocket 消息类型
export type WSMessageType =
  | 'CONFIG_UPDATE'
  | 'MANUAL_REFRESH'
  | 'SUBSCRIBE'
  | 'FUNDING_RATE_ARBITRAGE_DATA'
  | 'ACCOUNT_INFO'
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

// 资金费率套利数据消息
export interface FundingRateArbitragePayload {
  data: FundingRateArbitrageItem[];
  updatedAt: string;
}

// 状态更新消息
export interface StatusUpdatePayload {
  isMonitoring: boolean;
  isRefreshing: boolean;
  nextUpdateAt: string | null;
  lastError: string | null;
}

// 错误消息
export interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}
