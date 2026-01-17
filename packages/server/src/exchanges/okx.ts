import { createHmac } from 'crypto';
import { BaseExchange } from './base.js';
import type {
  FuturesData,
  ExchangeType,
  OKXTickerData,
  OKXFundingRateData,
  ExchangeAccountInfo,
} from '../types/index.js';
import { normalizeSymbol, isUsdtPerpetual } from '../utils/symbol-normalizer.js';
import logger from '../utils/logger.js';

// OKX API 基础 URL
const OKX_BASE_URL = 'https://www.okx.com';

// 并行请求配置
const BATCH_SIZE = 50;          // 每批请求数量
const BATCH_DELAY_MS = 50;      // 批次间延迟

// OKX API 响应结构
interface OKXResponse<T> {
  code: string;
  msg: string;
  data: T;
}

// OKX 账户余额响应类型
interface OKXBalanceDetail {
  ccy: string;          // 币种
  cashBal: string;      // 现金余额
  availBal: string;     // 可用余额
  frozenBal: string;    // 冻结余额
  eq: string;           // 币种权益
}

interface OKXAccountBalance {
  totalEq: string;      // 总权益
  details: OKXBalanceDetail[];
}

/**
 * OKX 交易所 API
 */
export class OKXExchange extends BaseExchange {
  readonly name: ExchangeType = 'okx';

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
   * 优化: 增大批次大小，减少批次间延迟，提高并行度
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

    logger.debug('OKX USDT swaps count', { count: usdtSwaps.length });

    // 并行请求所有资金费率 (使用更大的批次大小)
    const allFundingRates: OKXFundingRateData[] = [];
    const startTime = Date.now();

    for (let i = 0; i < usdtSwaps.length; i += BATCH_SIZE) {
      const batch = usdtSwaps.slice(i, i + BATCH_SIZE);
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

      // 避免触发速率限制 (使用更短的延迟)
      if (i + BATCH_SIZE < usdtSwaps.length) {
        await this.sleep(BATCH_DELAY_MS);
      }
    }

    const duration = Date.now() - startTime;
    logger.debug('OKX funding rates fetched', {
      count: allFundingRates.length,
      duration,
      batchCount: Math.ceil(usdtSwaps.length / BATCH_SIZE),
    });

    return {
      code: '0',
      msg: '',
      data: allFundingRates,
    };
  }

  /**
   * 获取账户信息 (余额和延迟)
   */
  async getAccountInfo(): Promise<ExchangeAccountInfo> {
    // 检查是否配置了 API (OKX 还需要 passphrase)
    if (!this.isConfigured() || !this.config.passphrase) {
      return {
        exchange: 'okx',
        configured: false,
        latencyMs: null,
        availableBalance: null,
        error: null,
      };
    }

    const startTime = Date.now();

    try {
      // 使用签名请求获取账户余额
      const balanceResponse = await this.getSignedAccountBalance();
      const latencyMs = Date.now() - startTime;

      if (balanceResponse.code !== '0') {
        throw new Error(balanceResponse.msg || 'Unknown OKX API error');
      }

      // 查找 USDT 余额
      let availableBalance = 0;
      if (balanceResponse.data && balanceResponse.data.length > 0) {
        const accountData = balanceResponse.data[0];
        if (accountData && accountData.details) {
          const usdtDetail = accountData.details.find(
            (d) => d.ccy === 'USDT'
          );
          if (usdtDetail) {
            availableBalance = parseFloat(usdtDetail.availBal);
          }
        }
      }

      logger.debug('OKX account info fetched', {
        latencyMs,
        availableBalance,
      });

      return {
        exchange: 'okx',
        configured: true,
        latencyMs,
        availableBalance,
        error: null,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      logger.error('Failed to fetch OKX account info', {
        error: errorMessage,
        latencyMs,
      });

      return {
        exchange: 'okx',
        configured: true,
        latencyMs,
        availableBalance: null,
        error: errorMessage,
      };
    }
  }

  /**
   * 获取签名的账户余额
   */
  private async getSignedAccountBalance(): Promise<OKXResponse<OKXAccountBalance[]>> {
    const timestamp = new Date().toISOString();
    const method = 'GET';
    const requestPath = '/api/v5/account/balance';

    // OKX 签名: timestamp + method + requestPath + body
    const preHash = timestamp + method + requestPath;
    const signature = createHmac('sha256', this.config.apiSecret!)
      .update(preHash)
      .digest('base64');

    return this.request<OKXResponse<OKXAccountBalance[]>>(
      `${OKX_BASE_URL}${requestPath}`,
      {
        headers: {
          'OK-ACCESS-KEY': this.config.apiKey!,
          'OK-ACCESS-SIGN': signature,
          'OK-ACCESS-TIMESTAMP': timestamp,
          'OK-ACCESS-PASSPHRASE': this.config.passphrase!,
        },
      }
    );
  }
}

export default OKXExchange;
