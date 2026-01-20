import { createHmac } from 'crypto';
import { BaseExchange } from './base.js';
import type {
  FuturesData,
  ExchangeType,
  BinanceFuturesTicker,
  BinancePremiumIndex,
  BinanceFundingInfo,
  ExchangeAccountInfo,
  PositionSide,
  OrderResult,
} from '../types/index.js';
import { normalizeSymbol, isUsdtPerpetual, toFuturesSymbol } from '../utils/symbol-normalizer.js';
import { CACHE_TTL, REQUEST_TIMEOUT } from '../utils/constants.js';
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

// 交易对精度信息类型
interface SymbolPrecisionInfo {
  symbol: string;
  stepSize: string;
  minQty: string;
}

/**
 * 币安交易所 API
 */
export class BinanceExchange extends BaseExchange {
  readonly name: ExchangeType = 'binance';
  private fundingInfoCache: { data: BinanceFundingInfo[]; expiresAt: number } | null = null;
  // exchangeInfo 缓存 (10分钟 TTL)
  private exchangeInfoCache: { data: Map<string, SymbolPrecisionInfo>; expiresAt: number } | null = null;

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
    const nowMs = Date.now();
    if (this.fundingInfoCache && this.fundingInfoCache.expiresAt > nowMs) {
      return this.fundingInfoCache.data;
    }

    const data = await this.request<BinanceFundingInfo[]>(
      `${BINANCE_FUTURES_BASE_URL}/fapi/v1/fundingInfo`
    );
    this.fundingInfoCache = {
      data,
      expiresAt: nowMs + CACHE_TTL.METADATA,
    };
    return data;
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

  /**
   * 获取单个交易对的最新合约数据
   */
  async getSingleFuturesData(symbol: string): Promise<FuturesData | null> {
    try {
      const originalSymbol = toFuturesSymbol(symbol, 'binance');

      // 并行请求价格和资金费率
      const [ticker, premiumIndex, fundingInfos] = await Promise.all([
        this.request<BinanceFuturesTicker>(
          `${BINANCE_FUTURES_BASE_URL}/fapi/v1/ticker/price`,
          { params: { symbol: originalSymbol } }
        ),
        this.request<BinancePremiumIndex>(
          `${BINANCE_FUTURES_BASE_URL}/fapi/v1/premiumIndex`,
          { params: { symbol: originalSymbol } }
        ),
        this.getFundingInfo(),
      ]);

      const fundingIntervalMap = new Map<string, number>();
      for (const info of fundingInfos) {
        fundingIntervalMap.set(info.symbol, info.fundingIntervalHours);
      }

      const price = parseFloat(ticker.price);
      const fundingRate = parseFloat(premiumIndex.lastFundingRate);
      const nextSettlementTime = new Date(premiumIndex.nextFundingTime);
      const settlementPeriodHours = fundingIntervalMap.get(originalSymbol) || DEFAULT_SETTLEMENT_PERIOD_HOURS;

      return {
        symbol,
        originalSymbol,
        exchange: 'binance',
        price,
        fundingRate,
        settlementPeriodHours,
        nextSettlementTime,
      };
    } catch (error) {
      logger.error('Failed to fetch single Binance futures data', {
        symbol,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * 获取交易对精度信息 (带缓存)
   */
  private async getSymbolPrecision(originalSymbol: string): Promise<SymbolPrecisionInfo | null> {
    const now = Date.now();

    // 检查缓存是否有效
    if (!this.exchangeInfoCache || now >= this.exchangeInfoCache.expiresAt) {
      try {
        const exchangeInfo = await this.request<{
          symbols: {
            symbol: string;
            filters: { filterType: string; stepSize?: string; minQty?: string }[];
          }[];
        }>(`${BINANCE_FUTURES_BASE_URL}/fapi/v1/exchangeInfo`);

        const precisionMap = new Map<string, SymbolPrecisionInfo>();
        for (const sym of exchangeInfo.symbols) {
          const lotSizeFilter = sym.filters.find(f => f.filterType === 'LOT_SIZE');
          precisionMap.set(sym.symbol, {
            symbol: sym.symbol,
            stepSize: lotSizeFilter?.stepSize || '1',
            minQty: lotSizeFilter?.minQty || '0',
          });
        }

        this.exchangeInfoCache = {
          data: precisionMap,
          expiresAt: now + CACHE_TTL.METADATA, // 10分钟缓存
        };

        logger.debug('Binance exchangeInfo cache refreshed', { symbolCount: precisionMap.size });
      } catch (error) {
        logger.error('Failed to fetch Binance exchangeInfo', {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    }

    return this.exchangeInfoCache.data.get(originalSymbol) || null;
  }

  /**
   * 设置杠杆倍数
   */
  async setLeverage(symbol: string, leverage: number): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Binance API not configured');
    }

    const originalSymbol = toFuturesSymbol(symbol, 'binance');
    const timestamp = Date.now();
    const recvWindow = 5000;
    const queryString = `symbol=${originalSymbol}&leverage=${leverage}&recvWindow=${recvWindow}&timestamp=${timestamp}`;
    const signature = this.createSignature(queryString);

    const url = `${BINANCE_FUTURES_BASE_URL}/fapi/v1/leverage?${queryString}&signature=${signature}`;

    await this.request(url, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': this.config.apiKey!,
      },
    });

    logger.info('Binance leverage set', { symbol: originalSymbol, leverage });
  }

  /**
   * 市价开仓
   */
  async openPosition(symbol: string, side: PositionSide, usdtAmount: number): Promise<OrderResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Binance API not configured' };
    }

    try {
      const originalSymbol = toFuturesSymbol(symbol, 'binance');

      // 并行获取价格和精度信息
      const [ticker, precisionInfo] = await Promise.all([
        this.request<BinanceFuturesTicker>(
          `${BINANCE_FUTURES_BASE_URL}/fapi/v1/ticker/price`,
          { params: { symbol: originalSymbol } }
        ),
        this.getSymbolPrecision(originalSymbol),
      ]);

      if (!precisionInfo) {
        return { success: false, error: `Symbol ${originalSymbol} not found in exchange info` };
      }

      const price = parseFloat(ticker.price);
      const quantity = usdtAmount / price;

      // 使用缓存的精度信息
      const { stepSize, minQty: minQtyStr } = precisionInfo;
      const minQty = parseFloat(minQtyStr);

      // 根据 stepSize 计算精度并截断数量
      const stepSizeNum = parseFloat(stepSize);
      const truncatedQuantity = Math.floor(quantity / stepSizeNum) * stepSizeNum;

      // 计算小数位数用于格式化
      const stepSizeStr = stepSize.replace(/0+$/, ''); // 移除尾部0
      const decimalPart = stepSizeStr.split('.')[1];
      const decimalPlaces = decimalPart ? decimalPart.length : 0;
      const formattedQuantity = truncatedQuantity.toFixed(decimalPlaces);

      if (truncatedQuantity <= 0 || truncatedQuantity < minQty) {
        return { success: false, error: `Order quantity ${truncatedQuantity} is below minimum ${minQty}` };
      }

      logger.debug('Binance order quantity calculated', {
        symbol: originalSymbol,
        price,
        rawQuantity: quantity,
        stepSize,
        truncatedQuantity,
        formattedQuantity,
        minQty,
      });

      const timestamp = Date.now();
      const recvWindow = 5000;
      const orderSide = side === 'long' ? 'BUY' : 'SELL';

      const params = new URLSearchParams({
        symbol: originalSymbol,
        side: orderSide,
        type: 'MARKET',
        quantity: formattedQuantity,
        recvWindow: String(recvWindow),
        timestamp: String(timestamp),
      });

      const queryString = params.toString();
      const signature = this.createSignature(queryString);

      const url = `${BINANCE_FUTURES_BASE_URL}/fapi/v1/order?${queryString}&signature=${signature}`;

      const response = await this.request<{
        orderId: number;
        executedQty: string;
        avgPrice: string;
        status: string;
      }>(url, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': this.config.apiKey!,
        },
        timeout: REQUEST_TIMEOUT.ORDER, // 订单专用超时
      });

      logger.info('Binance position opened', {
        symbol: originalSymbol,
        side,
        quantity: formattedQuantity,
        orderId: response.orderId,
      });

      return {
        success: true,
        orderId: String(response.orderId),
        filledQty: parseFloat(response.executedQty),
        avgPrice: parseFloat(response.avgPrice),
      };
    } catch (error) {
      const errorMessage = this.extractErrorMessage(error);
      logger.error('Failed to open Binance position', {
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
    if (!this.isConfigured()) {
      return { success: false, error: 'Binance API not configured' };
    }

    try {
      const originalSymbol = toFuturesSymbol(symbol, 'binance');

      // 获取当前仓位信息
      const timestamp = Date.now();
      const recvWindow = 5000;
      const positionQueryString = `symbol=${originalSymbol}&recvWindow=${recvWindow}&timestamp=${timestamp}`;
      const positionSignature = this.createSignature(positionQueryString);

      const positions = await this.request<{
        symbol: string;
        positionAmt: string;
        positionSide: string;
      }[]>(
        `${BINANCE_FUTURES_BASE_URL}/fapi/v2/positionRisk?${positionQueryString}&signature=${positionSignature}`,
        {
          headers: {
            'X-MBX-APIKEY': this.config.apiKey!,
          },
        }
      );

      const position = positions.find(p => p.symbol === originalSymbol);
      if (!position) {
        return { success: false, error: 'Position not found' };
      }

      const positionAmt = parseFloat(position.positionAmt);
      if (positionAmt === 0) {
        return { success: false, error: 'No position to close' };
      }

      // 平仓方向与开仓方向相反
      const orderSide = side === 'long' ? 'SELL' : 'BUY';
      const quantity = Math.abs(positionAmt).toString();

      const orderTimestamp = Date.now();
      const params = new URLSearchParams({
        symbol: originalSymbol,
        side: orderSide,
        type: 'MARKET',
        quantity,
        reduceOnly: 'true',
        recvWindow: String(recvWindow),
        timestamp: String(orderTimestamp),
      });

      const queryString = params.toString();
      const signature = this.createSignature(queryString);

      const url = `${BINANCE_FUTURES_BASE_URL}/fapi/v1/order?${queryString}&signature=${signature}`;

      const response = await this.request<{
        orderId: number;
        executedQty: string;
        avgPrice: string;
      }>(url, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': this.config.apiKey!,
        },
        timeout: REQUEST_TIMEOUT.ORDER, // 订单专用超时
      });

      logger.info('Binance position closed', {
        symbol: originalSymbol,
        side,
        quantity,
        orderId: response.orderId,
      });

      return {
        success: true,
        orderId: String(response.orderId),
        filledQty: parseFloat(response.executedQty),
        avgPrice: parseFloat(response.avgPrice),
      };
    } catch (error) {
      const errorMessage = this.extractErrorMessage(error);
      logger.error('Failed to close Binance position', {
        symbol,
        side,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }
}

export default BinanceExchange;
