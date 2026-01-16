// 交易所类型
export type ExchangeType = 'binance' | 'okx';

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

// 日志级别
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// 日志消息
export interface LogMessage {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
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
  | 'STATUS_UPDATE'
  | 'ERROR'
  | 'LOG';

// 服务端消息
export interface WSServerMessage {
  type: WSMessageType;
  payload: unknown;
}
