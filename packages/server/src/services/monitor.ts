import { BinanceExchange, OKXExchange } from '../exchanges/index.js';
import type { ExchangeApiConfig } from '../exchanges/types.js';
import { calculateFundingRateArbitrage } from './funding-rate-arbitrage.js';
import { Scheduler } from '../utils/scheduler.js';
import logger from '../utils/logger.js';
import type {
  FundingRateArbitrageItem,
  MonitorConfig,
  AccountInfo,
} from '../types/index.js';

// 数据更新回调类型
type DataUpdateCallback = (data: {
  fundingRateArbitrage: FundingRateArbitrageItem[];
  updatedAt: Date;
}) => void;

// 状态更新回调类型
type StatusUpdateCallback = (status: {
  isMonitoring: boolean;
  isRefreshing: boolean;
  nextUpdateAt: Date | null;
  lastError: string | null;
}) => void;

// 账户信息更新回调类型
type AccountInfoUpdateCallback = (accountInfo: AccountInfo) => void;

/**
 * 监控服务
 *
 * 负责:
 * 1. 管理交易所 API 实例
 * 2. 调度数据更新
 * 3. 计算套利机会
 * 4. 通知数据更新
 */
export class MonitorService {
  private binanceExchange: BinanceExchange;
  private okxExchange: OKXExchange;
  private scheduler: Scheduler;

  private isRefreshing = false;
  private lastError: string | null = null;

  private dataUpdateCallbacks: Set<DataUpdateCallback> = new Set();
  private statusUpdateCallbacks: Set<StatusUpdateCallback> = new Set();
  private accountInfoUpdateCallbacks: Set<AccountInfoUpdateCallback> = new Set();

  // 缓存最新数据
  private latestData: {
    fundingRateArbitrage: FundingRateArbitrageItem[];
    updatedAt: Date | null;
  } = {
    fundingRateArbitrage: [],
    updatedAt: null,
  };

  // 缓存账户信息
  private latestAccountInfo: AccountInfo | null = null;

  constructor() {
    this.binanceExchange = new BinanceExchange();
    this.okxExchange = new OKXExchange();
    this.scheduler = new Scheduler(() => this.refresh());

    logger.info('MonitorService initialized');
  }

  /**
   * 更新配置
   */
  updateConfig(config: MonitorConfig): void {
    // 更新交易所配置
    const exchangeConfig: ExchangeApiConfig = {
      apiKey: config.binanceApiKey,
      apiSecret: config.binanceApiSecret,
      proxyUrl: config.proxyUrl,
    };

    this.binanceExchange.updateConfig(exchangeConfig);

    this.okxExchange.updateConfig({
      apiKey: config.okxApiKey,
      apiSecret: config.okxApiSecret,
      passphrase: config.okxPassphrase,
      proxyUrl: config.proxyUrl,
    });

    // 更新调度器配置
    this.scheduler.updateConfig(config.autoMonitor);

    this.notifyStatusUpdate();

    logger.info('MonitorService config updated');
  }

  /**
   * 手动刷新数据
   */
  async manualRefresh(): Promise<void> {
    logger.info('Manual refresh triggered');
    await this.refresh();
  }

  /**
   * 刷新数据
   */
  private async refresh(): Promise<void> {
    if (this.isRefreshing) {
      logger.warn('Refresh already in progress, skipping...');
      return;
    }

    this.isRefreshing = true;
    this.lastError = null;
    this.notifyStatusUpdate();

    const startTime = Date.now();

    try {
      // 并行获取所有合约数据和账户信息
      const [binanceFutures, okxFutures, binanceAccountInfo, okxAccountInfo] = await Promise.all([
        this.binanceExchange.getAllFuturesData(),
        this.okxExchange.getAllFuturesData(),
        this.binanceExchange.getAccountInfo(),
        this.okxExchange.getAccountInfo(),
      ]);

      // 计算套利机会
      const fundingRateArbitrage = calculateFundingRateArbitrage(binanceFutures, okxFutures);

      const updatedAt = new Date();

      // 更新缓存
      this.latestData = {
        fundingRateArbitrage,
        updatedAt,
      };

      // 更新账户信息缓存
      this.latestAccountInfo = {
        binance: binanceAccountInfo,
        okx: okxAccountInfo,
        updatedAt: updatedAt.toISOString(),
      };

      // 通知数据更新
      this.notifyDataUpdate({
        fundingRateArbitrage,
        updatedAt,
      });

      // 通知账户信息更新
      this.notifyAccountInfoUpdate(this.latestAccountInfo);

      const duration = Date.now() - startTime;
      logger.info('Data refresh completed', {
        fundingRateCount: fundingRateArbitrage.length,
        duration,
      });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      logger.error('Data refresh failed', { error: this.lastError });
    } finally {
      this.isRefreshing = false;
      this.notifyStatusUpdate();
    }
  }

  /**
   * 获取最新数据
   */
  getLatestData(): typeof this.latestData {
    return { ...this.latestData };
  }

  /**
   * 获取最新账户信息
   */
  getLatestAccountInfo(): AccountInfo | null {
    return this.latestAccountInfo;
  }

  /**
   * 获取当前状态
   */
  getStatus(): {
    isMonitoring: boolean;
    isRefreshing: boolean;
    nextUpdateAt: Date | null;
    lastError: string | null;
  } {
    return {
      isMonitoring: this.scheduler.isSchedulerRunning(),
      isRefreshing: this.isRefreshing,
      nextUpdateAt: this.scheduler.getNextExecutionTime(),
      lastError: this.lastError,
    };
  }

  /**
   * 订阅数据更新
   */
  onDataUpdate(callback: DataUpdateCallback): () => void {
    this.dataUpdateCallbacks.add(callback);
    return () => {
      this.dataUpdateCallbacks.delete(callback);
    };
  }

  /**
   * 订阅状态更新
   */
  onStatusUpdate(callback: StatusUpdateCallback): () => void {
    this.statusUpdateCallbacks.add(callback);
    return () => {
      this.statusUpdateCallbacks.delete(callback);
    };
  }

  /**
   * 订阅账户信息更新
   */
  onAccountInfoUpdate(callback: AccountInfoUpdateCallback): () => void {
    this.accountInfoUpdateCallbacks.add(callback);
    return () => {
      this.accountInfoUpdateCallbacks.delete(callback);
    };
  }

  /**
   * 通知数据更新
   */
  private notifyDataUpdate(data: Parameters<DataUpdateCallback>[0]): void {
    for (const callback of this.dataUpdateCallbacks) {
      try {
        callback(data);
      } catch (error) {
        logger.error('Error in data update callback', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * 通知状态更新
   */
  private notifyStatusUpdate(): void {
    const status = this.getStatus();
    for (const callback of this.statusUpdateCallbacks) {
      try {
        callback(status);
      } catch (error) {
        logger.error('Error in status update callback', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * 通知账户信息更新
   */
  private notifyAccountInfoUpdate(accountInfo: AccountInfo): void {
    for (const callback of this.accountInfoUpdateCallbacks) {
      try {
        callback(accountInfo);
      } catch (error) {
        logger.error('Error in account info update callback', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * 停止服务
   */
  stop(): void {
    this.scheduler.stop();
    logger.info('MonitorService stopped');
  }
}

export default MonitorService;
