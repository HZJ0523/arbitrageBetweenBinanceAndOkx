import { createHmac } from 'crypto';
import { BaseExchange } from './base.js';
import type {
  FuturesData,
  ExchangeType,
  BinanceFuturesTicker,
  BinancePremiumIndex,
  BinanceFundingInfo,
  ExchangeAccountInfo,
} from '../types/index.js';
import { normalizeSymbol, isUsdtPerpetual } from '../utils/symbol-normalizer.js';
import logger from '../utils/logger.js';

// 币安 API 基础 URL
const BINANCE_FUTURES_BASE_URL = 'https://fapi.binance.com';

// 默认结算周期（小时）
const DEFAULT_SETTLEMENT_PERIOD_HOURS = 8;

// 币安账户余额响应类型
interface BinanceAccountAsset {
  asset: string;
  walletBalance: string;
  unrealizedProfit: string;
  marginBalance: string;
  maintMargin: string;
  initialMargin: string;
  positionInitialMargin: string;
  openOrderInitialMargin: string;
  crossWalletBalance: string;
  crossUnPnl: string;
  availableBalance: string;
  maxWithdrawAmount: string;
  marginAvailable: boolean;
  updateTime: number;
}

interface BinanceAccountInfo {
  assets: BinanceAccountAsset[];
}

/**
 * 币安交易所 API
 */
export class BinanceExchange extends BaseExchange {
  readonly name: ExchangeType = 'binance';

  /**
   * 获取所有 USDT 永续合约数据
   */
  async getAllFuturesData(): Promise<FuturesData[]> {
    logger.debug('Fetching Binance futures data...');

    try {
      // 并行请求价格、资金费率数据和资金费率配置信息
      const [tickers, premiumIndexes, fundingInfos] = await Promise.all([
        this.getFuturesTickers(),
        this.getPremiumIndexes(),
        this.getFundingInfo(),
      ]);

      // 创建资金费率映射
      const premiumIndexMap = new Map<string, BinancePremiumIndex>();
      for (const index of premiumIndexes) {
        premiumIndexMap.set(index.symbol, index);
      }

      // 创建结算周期映射（只包含调整过的交易对）
      const fundingIntervalMap = new Map<string, number>();
      for (const info of fundingInfos) {
        fundingIntervalMap.set(info.symbol, info.fundingIntervalHours);
      }

      // 组合数据
      const futuresData: FuturesData[] = [];

      for (const ticker of tickers) {
        // 只处理 USDT 永续合约
        if (!isUsdtPerpetual(ticker.symbol, 'binance')) {
          continue;
        }

        const premiumIndex = premiumIndexMap.get(ticker.symbol);
        if (!premiumIndex) {
          continue;
        }

        const symbol = normalizeSymbol(ticker.symbol, 'binance');
        const price = parseFloat(ticker.price);
        const fundingRate = parseFloat(premiumIndex.lastFundingRate);
        const nextSettlementTime = new Date(premiumIndex.nextFundingTime);

        // 从 fundingInfo 获取结算周期，如果没有则使用默认值 8 小时
        const settlementPeriodHours = fundingIntervalMap.get(ticker.symbol) || DEFAULT_SETTLEMENT_PERIOD_HOURS;

        futuresData.push({
          symbol,
          originalSymbol: ticker.symbol,
          exchange: 'binance',
          price,
          fundingRate,
          settlementPeriodHours,
          nextSettlementTime,
        });
      }

      logger.info('Binance futures data fetched', {
        count: futuresData.length,
      });

      return futuresData;
    } catch (error) {
      logger.error('Failed to fetch Binance futures data', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 获取永续合约价格
   */
  private async getFuturesTickers(): Promise<BinanceFuturesTicker[]> {
    return this.request<BinanceFuturesTicker[]>(
      `${BINANCE_FUTURES_BASE_URL}/fapi/v1/ticker/price`
    );
  }

  /**
   * 获取资金费率和下次结算时间
   */
  private async getPremiumIndexes(): Promise<BinancePremiumIndex[]> {
    return this.request<BinancePremiumIndex[]>(
      `${BINANCE_FUTURES_BASE_URL}/fapi/v1/premiumIndex`
    );
  }

  /**
   * 获取资金费率配置信息（包含结算周期）
   */
  private async getFundingInfo(): Promise<BinanceFundingInfo[]> {
    return this.request<BinanceFundingInfo[]>(
      `${BINANCE_FUTURES_BASE_URL}/fapi/v1/fundingInfo`
    );
  }

  /**
   * 获取账户信息 (余额和延迟)
   */
  async getAccountInfo(): Promise<ExchangeAccountInfo> {
    // 检查是否配置了 API
    if (!this.isConfigured()) {
      return {
        exchange: 'binance',
        configured: false,
        latencyMs: null,
        availableBalance: null,
        error: null,
      };
    }

    const startTime = Date.now();

    try {
      // 使用签名请求获取账户信息
      const accountInfo = await this.getSignedAccountInfo();
      const latencyMs = Date.now() - startTime;

      // 查找 USDT 资产
      const usdtAsset = accountInfo.assets.find(
        (asset) => asset.asset === 'USDT'
      );

      const availableBalance = usdtAsset
        ? parseFloat(usdtAsset.availableBalance)
        : 0;

      logger.debug('Binance account info fetched', {
        latencyMs,
        availableBalance,
      });

      return {
        exchange: 'binance',
        configured: true,
        latencyMs,
        availableBalance,
        error: null,
      };
    } catch (error: unknown) {
      const latencyMs = Date.now() - startTime;

      // 尝试从 axios 错误中提取更详细的信息
      let errorMessage = error instanceof Error ? error.message : String(error);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const axiosError = error as any;
      if (axiosError.response?.data) {
        const responseData = axiosError.response.data;
        if (responseData.msg) {
          errorMessage = `${responseData.code || ''}: ${responseData.msg}`;
        }
      }

      logger.error('Failed to fetch Binance account info', {
        error: errorMessage,
        latencyMs,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        responseData: (error as any).response?.data,
      });

      return {
        exchange: 'binance',
        configured: true,
        latencyMs,
        availableBalance: null,
        error: errorMessage,
      };
    }
  }

  /**
   * 获取签名的账户信息
   */
  private async getSignedAccountInfo(): Promise<BinanceAccountInfo> {
    const timestamp = Date.now();
    const recvWindow = 5000; // 币安推荐的时间窗口
    const queryString = `recvWindow=${recvWindow}&timestamp=${timestamp}`;
    const signature = this.createSignature(queryString);

    // 直接将签名附加到 URL，确保参数顺序与签名一致
    const url = `${BINANCE_FUTURES_BASE_URL}/fapi/v2/account?${queryString}&signature=${signature}`;

    logger.debug('Binance signed request', {
      url: url.replace(signature, '***'),
      timestamp,
    });

    return this.request<BinanceAccountInfo>(url, {
      headers: {
        'X-MBX-APIKEY': this.config.apiKey!,
      },
    });
  }

  /**
   * 创建 HMAC-SHA256 签名
   */
  private createSignature(queryString: string): string {
    return createHmac('sha256', this.config.apiSecret!)
      .update(queryString)
      .digest('hex');
  }
}

export default BinanceExchange;
