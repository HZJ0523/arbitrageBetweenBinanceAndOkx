import { createHmac } from 'crypto';
import { BaseExchange } from './base.js';
import type { ExchangeApiConfig } from './types.js';
import type {
  FuturesData,
  ExchangeType,
  OKXTickerData,
  OKXFundingRateData,
  ExchangeAccountInfo,
  PositionSide,
  OrderResult,
} from '../types/index.js';
import { normalizeSymbol, isUsdtPerpetual, toFuturesSymbol } from '../utils/symbol-normalizer.js';
import { CONCURRENCY, CACHE_TTL, REQUEST_TIMEOUT } from '../utils/constants.js';
import logger from '../utils/logger.js';

// OKX API 基础 URL
const OKX_BASE_URL = 'https://www.okx.com';

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

// 合约面值信息
interface InstrumentInfo {
  instId: string;
  ctVal: string;
}

/**
 * OKX 交易所 API
 */
export class OKXExchange extends BaseExchange {
  readonly name: ExchangeType = 'okx';
  private usdtSwapCache: { data: string[]; expiresAt: number } | null = null;
  // 合约面值缓存 (10分钟 TTL)
  private instrumentsCache: { data: Map<string, InstrumentInfo>; expiresAt: number } | null = null;
  // 账户持仓模式缓存 (会话级，不过期直到配置变更)
  private posModeCache: string | null = null;

  /**
   * 更新配置 (覆盖基类方法，清除账户相关缓存)
   */
  updateConfig(config: Partial<ExchangeApiConfig>): void {
    super.updateConfig(config);
    // 配置变更时清除持仓模式缓存，避免使用旧账户的缓存数据
    this.clearPosModeCache();
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
   * 使用分批并行请求，优化请求效率
   */
  private async getAllFundingRates(): Promise<OKXResponse<OKXFundingRateData[]>> {
    const usdtSwaps = await this.getUsdtSwapInstruments();
    const startTime = Date.now();

    logger.debug('OKX USDT swaps count', { count: usdtSwaps.length });

    const allFundingRates: OKXFundingRateData[] = [];
    const batchSize = CONCURRENCY.OKX_BATCH_SIZE;
    const batchDelay = CONCURRENCY.OKX_BATCH_DELAY_MS;

    // 分批并行请求，跳过并发限制器（已在此处控制批次大小）
    for (let i = 0; i < usdtSwaps.length; i += batchSize) {
      const batch = usdtSwaps.slice(i, i + batchSize);
      const batchPromises = batch.map((instId) =>
        this.request<OKXResponse<OKXFundingRateData[]>>(
          `${OKX_BASE_URL}/api/v5/public/funding-rate`,
          { params: { instId } },
          true // skipLimiter: 跳过并发限制，由批次大小控制
        ).catch((error) => {
          logger.warn(`Failed to fetch funding rate for ${instId}`, {
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

      // 避免触发速率限制（如果配置了延迟）
      if (batchDelay > 0 && i + batchSize < usdtSwaps.length) {
        await this.sleep(batchDelay);
      }
    }

    const duration = Date.now() - startTime;
    logger.debug('OKX funding rates fetched', {
      count: allFundingRates.length,
      duration,
      batchCount: Math.ceil(usdtSwaps.length / batchSize),
    });

    return {
      code: '0',
      msg: '',
      data: allFundingRates,
    };
  }

  private async getUsdtSwapInstruments(): Promise<string[]> {
    const nowMs = Date.now();
    if (this.usdtSwapCache && this.usdtSwapCache.expiresAt > nowMs) {
      return this.usdtSwapCache.data;
    }

    const instruments = await this.request<OKXResponse<{ instId: string }[]>>(
      `${OKX_BASE_URL}/api/v5/public/instruments`,
      {
        params: { instType: 'SWAP' },
      }
    );

    const usdtSwaps = instruments.data
      .map((inst) => inst.instId)
      .filter((instId) => instId.endsWith('-USDT-SWAP'));

    this.usdtSwapCache = {
      data: usdtSwaps,
      expiresAt: nowMs + CACHE_TTL.METADATA,
    };

    return usdtSwaps;
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

  /**
   * 创建签名请求头
   */
  private createSignedHeaders(method: string, requestPath: string, body?: string): Record<string, string> {
    const timestamp = new Date().toISOString();
    const preHash = timestamp + method + requestPath + (body || '');
    const signature = createHmac('sha256', this.config.apiSecret!)
      .update(preHash)
      .digest('base64');

    return {
      'OK-ACCESS-KEY': this.config.apiKey!,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.config.passphrase!,
      'Content-Type': 'application/json',
    };
  }

  /**
   * 获取单个交易对的最新合约数据
   */
  async getSingleFuturesData(symbol: string): Promise<FuturesData | null> {
    try {
      const originalSymbol = toFuturesSymbol(symbol, 'okx');

      // 并行请求行情和资金费率
      const [tickerResponse, fundingResponse] = await Promise.all([
        this.request<OKXResponse<OKXTickerData[]>>(
          `${OKX_BASE_URL}/api/v5/market/ticker`,
          { params: { instId: originalSymbol } }
        ),
        this.request<OKXResponse<OKXFundingRateData[]>>(
          `${OKX_BASE_URL}/api/v5/public/funding-rate`,
          { params: { instId: originalSymbol } }
        ),
      ]);

      if (!tickerResponse.data?.[0] || !fundingResponse.data?.[0]) {
        return null;
      }

      const ticker = tickerResponse.data[0];
      const fundingRate = fundingResponse.data[0];

      const price = parseFloat(ticker.last);
      const rate = parseFloat(fundingRate.fundingRate);
      const nextSettlementTime = new Date(parseInt(fundingRate.fundingTime));

      const currentFundingTime = parseInt(fundingRate.fundingTime);
      const nextNextFundingTime = parseInt(fundingRate.nextFundingTime);
      const settlementPeriodMs = nextNextFundingTime - currentFundingTime;
      const settlementPeriodHours = Math.round(settlementPeriodMs / (1000 * 60 * 60));

      return {
        symbol,
        originalSymbol,
        exchange: 'okx',
        price,
        fundingRate: rate,
        settlementPeriodHours: settlementPeriodHours > 0 ? settlementPeriodHours : 8,
        nextSettlementTime,
      };
    } catch (error) {
      logger.error('Failed to fetch single OKX futures data', {
        symbol,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * 获取合约面值信息 (带缓存)
   */
  private async getInstrumentInfo(originalSymbol: string): Promise<InstrumentInfo | null> {
    const now = Date.now();

    // 检查缓存是否有效
    if (!this.instrumentsCache || now >= this.instrumentsCache.expiresAt) {
      try {
        const instruments = await this.request<OKXResponse<{ instId: string; ctVal: string }[]>>(
          `${OKX_BASE_URL}/api/v5/public/instruments`,
          { params: { instType: 'SWAP' } }
        );

        const instMap = new Map<string, InstrumentInfo>();
        for (const inst of instruments.data || []) {
          instMap.set(inst.instId, { instId: inst.instId, ctVal: inst.ctVal });
        }

        this.instrumentsCache = {
          data: instMap,
          expiresAt: now + CACHE_TTL.METADATA,
        };

        logger.debug('OKX instruments cache refreshed', { count: instMap.size });
      } catch (error) {
        logger.error('Failed to fetch OKX instruments', {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    }

    return this.instrumentsCache.data.get(originalSymbol) || null;
  }

  /**
   * 获取账户持仓模式 (带缓存)
   */
  private async getPositionMode(): Promise<string> {
    // 使用缓存的持仓模式
    if (this.posModeCache) {
      return this.posModeCache;
    }

    if (!this.isConfigured() || !this.config.passphrase) {
      return 'net_mode';
    }

    try {
      const accountConfigPath = '/api/v5/account/config';
      const headers = this.createSignedHeaders('GET', accountConfigPath, '');
      const accountConfig = await this.request<OKXResponse<{ posMode: string }[]>>(
        `${OKX_BASE_URL}${accountConfigPath}`,
        { headers }
      );

      this.posModeCache = accountConfig.data?.[0]?.posMode || 'net_mode';
      logger.debug('OKX position mode cached', { posMode: this.posModeCache });
      return this.posModeCache;
    } catch (error) {
      logger.warn('Failed to get OKX position mode, using net_mode', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 'net_mode';
    }
  }

  /**
   * 清除持仓模式缓存 (配置变更时调用)
   */
  clearPosModeCache(): void {
    this.posModeCache = null;
  }

  /**
   * 设置杠杆倍数
   */
  async setLeverage(symbol: string, leverage: number): Promise<void> {
    if (!this.isConfigured() || !this.config.passphrase) {
      throw new Error('OKX API not configured');
    }

    const originalSymbol = toFuturesSymbol(symbol, 'okx');
    const requestPath = '/api/v5/account/set-leverage';
    const body = JSON.stringify({
      instId: originalSymbol,
      lever: String(leverage),
      mgnMode: 'cross', // 全仓模式
    });

    const headers = this.createSignedHeaders('POST', requestPath, body);

    const response = await this.request<OKXResponse<unknown[]>>(
      `${OKX_BASE_URL}${requestPath}`,
      {
        method: 'POST',
        headers,
        data: JSON.parse(body),
      }
    );

    if (response.code !== '0') {
      throw new Error(response.msg || 'Failed to set leverage');
    }

    logger.info('OKX leverage set', { symbol: originalSymbol, leverage });
  }

  /**
   * 市价开仓
   */
  async openPosition(symbol: string, side: PositionSide, usdtAmount: number): Promise<OrderResult> {
    if (!this.isConfigured() || !this.config.passphrase) {
      return { success: false, error: 'OKX API not configured' };
    }

    try {
      const originalSymbol = toFuturesSymbol(symbol, 'okx');

      // 并行获取: 持仓模式(缓存)、合约面值(缓存)、最新价格
      const [posMode, instInfo, tickerResponse] = await Promise.all([
        this.getPositionMode(),
        this.getInstrumentInfo(originalSymbol),
        this.request<OKXResponse<OKXTickerData[]>>(
          `${OKX_BASE_URL}/api/v5/market/ticker`,
          { params: { instId: originalSymbol } }
        ),
      ]);

      const isNetMode = posMode === 'net_mode';

      if (!instInfo) {
        return { success: false, error: 'Instrument not found' };
      }

      const tickerData = tickerResponse.data[0];
      if (!tickerData) {
        return { success: false, error: 'Failed to get ticker data' };
      }

      const price = parseFloat(tickerData.last);
      const ctVal = parseFloat(instInfo.ctVal);

      // 计算合约张数: usdtAmount / (price * ctVal)
      const sz = Math.floor(usdtAmount / (price * ctVal));
      if (sz < 1) {
        return { success: false, error: 'Order size too small' };
      }

      const requestPath = '/api/v5/trade/order';
      const orderBody: Record<string, string> = {
        instId: originalSymbol,
        tdMode: 'cross',
        side: side === 'long' ? 'buy' : 'sell',
        ordType: 'market',
        sz: String(sz),
      };

      // 双向持仓模式才需要传 posSide
      if (!isNetMode) {
        orderBody.posSide = side;
      }

      const body = JSON.stringify(orderBody);
      const headers = this.createSignedHeaders('POST', requestPath, body);

      const response = await this.request<OKXResponse<{ ordId: string; sCode: string; sMsg: string }[]>>(
        `${OKX_BASE_URL}${requestPath}`,
        {
          method: 'POST',
          headers,
          data: orderBody,
          timeout: REQUEST_TIMEOUT.ORDER, // 订单专用超时
        }
      );

      if (response.code !== '0' || !response.data?.[0]) {
        const errorMsg = response.data?.[0]?.sMsg || response.msg || 'Unknown error';
        return { success: false, error: errorMsg };
      }

      const orderResult = response.data[0];
      if (orderResult.sCode !== '0') {
        return { success: false, error: orderResult.sMsg };
      }

      logger.info('OKX position opened', {
        symbol: originalSymbol,
        side,
        sz,
        orderId: orderResult.ordId,
        posMode,
      });

      return {
        success: true,
        orderId: orderResult.ordId,
        filledQty: sz,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to open OKX position', {
        symbol,
        side,
        usdtAmount,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 市价平仓
   */
  async closePosition(symbol: string, side: PositionSide): Promise<OrderResult> {
    if (!this.isConfigured() || !this.config.passphrase) {
      return { success: false, error: 'OKX API not configured' };
    }

    try {
      const originalSymbol = toFuturesSymbol(symbol, 'okx');

      // 使用缓存获取持仓模式
      const posMode = await this.getPositionMode();
      const isNetMode = posMode === 'net_mode';

      const requestPath = '/api/v5/trade/close-position';
      const closeBody: Record<string, string> = {
        instId: originalSymbol,
        mgnMode: 'cross',
        posSide: isNetMode ? 'net' : side,
      };

      const body = JSON.stringify(closeBody);
      const headers = this.createSignedHeaders('POST', requestPath, body);

      const response = await this.request<OKXResponse<{ instId: string; posSide: string }[]>>(
        `${OKX_BASE_URL}${requestPath}`,
        {
          method: 'POST',
          headers,
          data: closeBody,
          timeout: REQUEST_TIMEOUT.ORDER, // 订单专用超时
        }
      );

      if (response.code !== '0') {
        return { success: false, error: response.msg || 'Failed to close position' };
      }

      logger.info('OKX position closed', {
        symbol: originalSymbol,
        side,
        posMode,
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to close OKX position', {
        symbol,
        side,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }
}

export default OKXExchange;
