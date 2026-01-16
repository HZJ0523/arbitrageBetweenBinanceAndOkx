import { BaseExchange } from './base.js';
import type { ExchangeApiConfig } from './types.js';
import type {
  FuturesData,
  ExchangeType,
  BinanceFuturesTicker,
  BinancePremiumIndex,
  BinanceFundingInfo,
} from '../types/index.js';
import { normalizeSymbol, isUsdtPerpetual } from '../utils/symbol-normalizer.js';
import logger from '../utils/logger.js';

// 币安 API 基础 URL
const BINANCE_FUTURES_BASE_URL = 'https://fapi.binance.com';

// 默认结算周期（小时）
const DEFAULT_SETTLEMENT_PERIOD_HOURS = 8;

/**
 * 币安交易所 API
 */
export class BinanceExchange extends BaseExchange {
  readonly name: ExchangeType = 'binance';

  constructor(config?: ExchangeApiConfig) {
    super(config);
  }

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
}

export default BinanceExchange;
