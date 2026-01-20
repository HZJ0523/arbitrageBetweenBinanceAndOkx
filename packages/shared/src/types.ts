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
    fixedSecond?: number;
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
  | 'LOG'
  | 'OPEN_ARBITRAGE'
  | 'CLOSE_ARBITRAGE'
  | 'ACTIVE_POSITIONS_DATA'
  | 'ARBITRAGE_RESULT';

// 客户端发送的消息
export interface WSClientMessage {
  type: 'CONFIG_UPDATE' | 'MANUAL_REFRESH' | 'SUBSCRIBE' | 'OPEN_ARBITRAGE' | 'CLOSE_ARBITRAGE';
  payload?: MonitorConfig | {
    fundingRateArbitrage: boolean;
  } | OpenArbitrageRequest | CloseArbitrageRequest;
}

// 服务端发送的消息 - 使用联合类型精确定义
export type WSServerMessage =
  | { type: 'FUNDING_RATE_ARBITRAGE_DATA'; payload: FundingRateArbitragePayload }
  | { type: 'ACCOUNT_INFO'; payload: AccountInfo }
  | { type: 'ACTIVE_POSITIONS_DATA'; payload: ActivePositionsPayload }
  | { type: 'ARBITRAGE_RESULT'; payload: ArbitrageResultPayload }
  | { type: 'STATUS_UPDATE'; payload: StatusUpdatePayload }
  | { type: 'ERROR'; payload: ErrorPayload }
  | { type: 'LOG'; payload: LogMessage };

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

// ============================================
// 套利交易相关类型
// ============================================

// 正在套利中的仓位
export interface ActiveArbitragePosition {
  id: string;                           // 唯一标识
  symbol: string;                       // 交易对 (如 BTC)
  usdtAmount: number;                   // 开仓 USDT 金额
  longExchange: ExchangeType;           // 开多的交易所
  shortExchange: ExchangeType;          // 开空的交易所
  longFundingRate: number;              // 开多方资金费率
  shortFundingRate: number;             // 开空方资金费率
  longFundingRatePercent: string;       // 开多方资金费率百分比
  shortFundingRatePercent: string;      // 开空方资金费率百分比
  longSettlementPeriodHours: number;    // 开多方结算周期
  shortSettlementPeriodHours: number;   // 开空方结算周期
  longNextSettlementTime: string;       // 开多方下次结算时间
  shortNextSettlementTime: string;      // 开空方下次结算时间
  createdAt: string;                    // 开仓时间
  closeStatus?: 'active' | 'partial' | 'failed';
  closeError?: string | null;
  closedLong?: boolean;
  closedShort?: boolean;
}

// 开仓请求
export interface OpenArbitrageRequest {
  symbol: string;
  usdtAmount: number;
}

// 开仓响应
export interface OpenArbitrageResponse {
  success: boolean;
  position?: ActiveArbitragePosition;
  error?: string;
}

// 平仓请求
export interface CloseArbitrageRequest {
  positionId: string;
}

// 平仓响应
export interface CloseArbitrageResponse {
  success: boolean;
  error?: string;
}

// 活跃仓位数据消息
export interface ActivePositionsPayload {
  positions: ActiveArbitragePosition[];
  updatedAt: string;
}

// 套利结果消息
export interface ArbitrageResultPayload {
  action: 'open' | 'close';
  success: boolean;
  position?: ActiveArbitragePosition;
  positionId?: string;
  error?: string;
}
