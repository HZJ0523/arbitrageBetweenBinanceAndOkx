import { BaseExchange } from './base.js';
import type { ExchangeApiConfig } from './types.js';
import type {
  FuturesData,
  ExchangeType,
  OKXTickerData,
  OKXFundingRateData,
} from '../types/index.js';
import { normalizeSymbol, isUsdtPerpetual } from '../utils/symbol-normalizer.js';
import logger from '../utils/logger.js';

// OKX API 基础 URL
const OKX_BASE_URL = 'https://www.okx.com';

// OKX API 响应结构
interface OKXResponse<T> {
  code: string;
  msg: string;
  data: T;
}

/**
 * OKX 交易所 API
 */
export class OKXExchange extends BaseExchange {
  readonly name: ExchangeType = 'okx';

  constructor(config?: ExchangeApiConfig) {
    super(config);
  }

  /**
   * 获取所有 USDT 永续合约数据
   */
  async getAllFuturesData(): Promise<FuturesData[]> {
    logger.debug('Fetching OKX futures data...');

    try {
      // 并行请求行情和资金费率数据
      const [tickersResponse, fundingRatesResponse] = await Promise.all([
        this.getSwapTickers(),
        this.getAllFundingRates(),
      ]);

      // 创建资金费率映射
      const fundingRateMap = new Map<string, OKXFundingRateData>();
      for (const rate of fundingRatesResponse.data) {
        fundingRateMap.set(rate.instId, rate);
      }

      // 组合数据
      const futuresData: FuturesData[] = [];

      for (const ticker of tickersResponse.data) {
        // 只处理 USDT 永续合约
        if (!isUsdtPerpetual(ticker.instId, 'okx')) {
          continue;
        }

        const fundingRate = fundingRateMap.get(ticker.instId);
        if (!fundingRate) {
          continue;
        }

        const symbol = normalizeSymbol(ticker.instId, 'okx');
        const price = parseFloat(ticker.last);
        const rate = parseFloat(fundingRate.fundingRate);

        // OKX API 字段说明：
        // - fundingTime: 当前周期的结算时间（即将到来的结算）
        // - nextFundingTime: 下一个周期的结算时间
        // 所以正确的"下次结算时间"应该是 fundingTime
        const nextSettlementTime = new Date(parseInt(fundingRate.fundingTime));

        // 计算结算周期 (OKX 支持 1小时、2小时、4小时、8小时)
        // 通过 fundingTime 和 nextFundingTime 的差值计算
        const currentFundingTime = parseInt(fundingRate.fundingTime);
        const nextNextFundingTime = parseInt(fundingRate.nextFundingTime);
        const settlementPeriodMs = nextNextFundingTime - currentFundingTime;
        const settlementPeriodHours = Math.round(settlementPeriodMs / (1000 * 60 * 60));

        futuresData.push({
          symbol,
          originalSymbol: ticker.instId,
          exchange: 'okx',
          price,
          fundingRate: rate,
          settlementPeriodHours: settlementPeriodHours > 0 ? settlementPeriodHours : 8,
          nextSettlementTime,
        });
      }

      logger.info('OKX futures data fetched', {
        count: futuresData.length,
      });

      return futuresData;
    } catch (error) {
      logger.error('Failed to fetch OKX futures data', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 获取永续合约行情
   */
  private async getSwapTickers(): Promise<OKXResponse<OKXTickerData[]>> {
    return this.request<OKXResponse<OKXTickerData[]>>(
      `${OKX_BASE_URL}/api/v5/market/tickers`,
      {
        params: { instType: 'SWAP' },
      }
    );
  }

  /**
   * 获取所有 USDT 永续合约的资金费率
   * OKX 的 /api/v5/public/funding-rate 需要指定 instId，
   * 但我们可以先获取所有合约列表，然后批量请求
   * 这里使用 /api/v5/public/funding-rate 批量获取
   */
  private async getAllFundingRates(): Promise<OKXResponse<OKXFundingRateData[]>> {
    // 先获取所有 USDT 永续合约的 instId
    const instruments = await this.request<OKXResponse<{ instId: string }[]>>(
      `${OKX_BASE_URL}/api/v5/public/instruments`,
      {
        params: { instType: 'SWAP' },
      }
    );

    // 筛选 USDT 永续合约
    const usdtSwaps = instruments.data.filter((inst) =>
      inst.instId.endsWith('-USDT-SWAP')
    );

    // 并行请求所有资金费率 (分批次，避免请求过多)
    const batchSize = 20;
    const allFundingRates: OKXFundingRateData[] = [];

    for (let i = 0; i < usdtSwaps.length; i += batchSize) {
      const batch = usdtSwaps.slice(i, i + batchSize);
      const batchPromises = batch.map((inst) =>
        this.request<OKXResponse<OKXFundingRateData[]>>(
          `${OKX_BASE_URL}/api/v5/public/funding-rate`,
          {
            params: { instId: inst.instId },
          }
        ).catch((error) => {
          logger.warn(`Failed to fetch funding rate for ${inst.instId}`, {
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        })
      );

      const results = await Promise.all(batchPromises);

      for (const result of results) {
        if (result && result.data && result.data.length > 0) {
          allFundingRates.push(...result.data);
        }
      }

      // 避免触发速率限制
      if (i + batchSize < usdtSwaps.length) {
        await this.sleep(100);
      }
    }

    return {
      code: '0',
      msg: '',
      data: allFundingRates,
    };
  }
}

export default OKXExchange;
