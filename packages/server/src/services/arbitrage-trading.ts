import { readFileSync, existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { dirname } from 'path';
import { BinanceExchange } from '../exchanges/binance.js';
import { OKXExchange } from '../exchanges/okx.js';
import logger from '../utils/logger.js';
import { formatPercent } from '../utils/format.js';
import {
  calculatePositionAnnualizedYield,
  getPositionCountdownSeconds,
} from '@cryptos/shared';
import type {
  ActiveArbitragePosition,
  OpenArbitrageResponse,
  CloseArbitrageResponse,
  FuturesData,
  ExchangeType,
} from '../types/index.js';

// 持久化文件路径
const DATA_FILE_PATH = './data/active-positions.json';

// 保存防抖延迟 (毫秒)
const SAVE_DEBOUNCE_MS = 1000;

/**
 * 检查是否满足套利条件
 * 1. 两个交易所的资金费率异号（一正一负）
 * 2. 正资金费率的合约价格 >= 负资金费率的合约价格
 */
function checkArbitrageCondition(
  binanceData: FuturesData,
  okxData: FuturesData
): { valid: boolean; longExchange: ExchangeType; shortExchange: ExchangeType } | null {
  const binanceRate = binanceData.fundingRate;
  const okxRate = okxData.fundingRate;

  // 检查是否异号
  if (binanceRate * okxRate >= 0) {
    return null; // 同号，不满足条件
  }

  // 确定哪个是正费率（需要开空），哪个是负费率（需要开多）
  let positiveExchange: ExchangeType;
  let negativeExchange: ExchangeType;
  let positivePrice: number;
  let negativePrice: number;

  if (binanceRate > 0) {
    positiveExchange = 'binance';
    negativeExchange = 'okx';
    positivePrice = binanceData.price;
    negativePrice = okxData.price;
  } else {
    positiveExchange = 'okx';
    negativeExchange = 'binance';
    positivePrice = okxData.price;
    negativePrice = binanceData.price;
  }

  // 检查价格条件：正费率价格 >= 负费率价格
  if (positivePrice < negativePrice) {
    return null;
  }

  return {
    valid: true,
    longExchange: negativeExchange,  // 负费率方开多
    shortExchange: positiveExchange, // 正费率方开空
  };
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

/**
 * 套利交易服务
 */
export class ArbitrageTradingService {
  private binanceExchange: BinanceExchange;
  private okxExchange: OKXExchange;
  private activePositions: Map<string, ActiveArbitragePosition> = new Map();
  private pendingSaveTimer: NodeJS.Timeout | null = null;
  private isSaving = false;

  constructor(binanceExchange: BinanceExchange, okxExchange: OKXExchange) {
    this.binanceExchange = binanceExchange;
    this.okxExchange = okxExchange;
    this.loadPositions();
  }

  /**
   * 开始套利
   */
  async openArbitrage(symbol: string, usdtAmount: number): Promise<OpenArbitrageResponse> {
    logger.info('Opening arbitrage position', { symbol, usdtAmount });

    try {
      // 1. 获取最新的交易对数据
      const [binanceData, okxData] = await Promise.all([
        this.binanceExchange.getSingleFuturesData(symbol),
        this.okxExchange.getSingleFuturesData(symbol),
      ]);

      if (!binanceData || !okxData) {
        return {
          success: false,
          error: '无法获取交易对数据，请重试',
        };
      }

      // 2. 检查是否满足套利条件
      const condition = checkArbitrageCondition(binanceData, okxData);
      if (!condition) {
        return {
          success: false,
          error: '交易对已不满足套利条件，请更新套利机会，重新下单',
        };
      }

      const { longExchange, shortExchange } = condition;

      // 3. 设置两边杠杆为 1x
      try {
        await Promise.all([
          this.binanceExchange.setLeverage(symbol, 1),
          this.okxExchange.setLeverage(symbol, 1),
        ]);
      } catch (leverageError) {
        logger.warn('Failed to set leverage, continuing with current leverage', {
          error: leverageError instanceof Error ? leverageError.message : String(leverageError),
        });
        // 继续执行，杠杆设置失败不阻止开仓
      }

      // 4. 并行开仓
      const longExchangeInstance = longExchange === 'binance' ? this.binanceExchange : this.okxExchange;
      const shortExchangeInstance = shortExchange === 'binance' ? this.binanceExchange : this.okxExchange;

      const [longResult, shortResult] = await Promise.all([
        longExchangeInstance.openPosition(symbol, 'long', usdtAmount),
        shortExchangeInstance.openPosition(symbol, 'short', usdtAmount),
      ]);

      // 5. 处理开仓结果
      if (longResult.success && shortResult.success) {
        // 两边都成功
        const longData = longExchange === 'binance' ? binanceData : okxData;
        const shortData = shortExchange === 'binance' ? binanceData : okxData;

        const position: ActiveArbitragePosition = {
          id: generateId(),
          symbol,
          usdtAmount,
          longExchange,
          shortExchange,
          longFundingRate: longData.fundingRate,
          shortFundingRate: shortData.fundingRate,
          longFundingRatePercent: formatPercent(longData.fundingRate),
          shortFundingRatePercent: formatPercent(shortData.fundingRate),
          longSettlementPeriodHours: longData.settlementPeriodHours,
          shortSettlementPeriodHours: shortData.settlementPeriodHours,
          longNextSettlementTime: longData.nextSettlementTime.toISOString(),
          shortNextSettlementTime: shortData.nextSettlementTime.toISOString(),
          createdAt: new Date().toISOString(),
          closeStatus: 'active',
          closeError: null,
          closedLong: false,
          closedShort: false,
        };

        this.activePositions.set(position.id, position);
        this.savePositions();

        logger.info(`${symbol}交易对开始套利...`, {
          positionId: position.id,
          longExchange,
          shortExchange,
        });

        return { success: true, position };
      }

      // 一边成功一边失败，需要回滚
      if (longResult.success && !shortResult.success) {
        logger.warn('Short position failed, rolling back long position', {
          symbol,
          longExchange,
          shortError: shortResult.error,
        });

        const closeResult = await longExchangeInstance.closePosition(symbol, 'long');
        if (!closeResult.success) {
          logger.error(`${symbol}交易对在${longExchange}交易所单边开仓，请手动平仓！`, {
            symbol,
            exchange: longExchange,
            side: 'long',
          });
          return {
            success: false,
            error: `${symbol}交易对在${longExchange}交易所单边开仓，请手动平仓！开空失败: ${shortResult.error}`,
          };
        }

        logger.info(`${symbol}交易对套利失败！已回滚开多仓位`);
        return {
          success: false,
          error: `开空失败: ${shortResult.error}`,
        };
      }

      if (!longResult.success && shortResult.success) {
        logger.warn('Long position failed, rolling back short position', {
          symbol,
          shortExchange,
          longError: longResult.error,
        });

        const closeResult = await shortExchangeInstance.closePosition(symbol, 'short');
        if (!closeResult.success) {
          logger.error(`${symbol}交易对在${shortExchange}交易所单边开仓，请手动平仓！`, {
            symbol,
            exchange: shortExchange,
            side: 'short',
          });
          return {
            success: false,
            error: `${symbol}交易对在${shortExchange}交易所单边开仓，请手动平仓！开多失败: ${longResult.error}`,
          };
        }

        logger.info(`${symbol}交易对套利失败！已回滚开空仓位`);
        return {
          success: false,
          error: `开多失败: ${longResult.error}`,
        };
      }

      // 两边都失败
      logger.error(`${symbol}交易对套利失败！`, {
        symbol,
        longError: longResult.error,
        shortError: shortResult.error,
      });

      return {
        success: false,
        error: `开仓失败 - 开多: ${longResult.error}, 开空: ${shortResult.error}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Arbitrage open failed with exception', {
        symbol,
        usdtAmount,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 平仓套利
   */
  async closeArbitrage(positionId: string): Promise<CloseArbitrageResponse> {
    const position = this.activePositions.get(positionId);
    if (!position) {
      return { success: false, error: '仓位不存在' };
    }

    logger.info('Closing arbitrage position', {
      positionId,
      symbol: position.symbol,
    });

    try {
      const longExchangeInstance = position.longExchange === 'binance' ? this.binanceExchange : this.okxExchange;
      const shortExchangeInstance = position.shortExchange === 'binance' ? this.binanceExchange : this.okxExchange;

      const shouldCloseLong = !position.closedLong;
      const shouldCloseShort = !position.closedShort;

      type CloseAttemptResult = { success: boolean; error?: string; skipped?: boolean };

      const [longCloseResult, shortCloseResult]: [CloseAttemptResult, CloseAttemptResult] = await Promise.all([
        shouldCloseLong
          ? longExchangeInstance.closePosition(position.symbol, 'long')
          : Promise.resolve({ success: true, skipped: true }),
        shouldCloseShort
          ? shortExchangeInstance.closePosition(position.symbol, 'short')
          : Promise.resolve({ success: true, skipped: true }),
      ]);

      if (longCloseResult.success && shortCloseResult.success) {
        this.activePositions.delete(positionId);
        this.savePositions();

        logger.info(`${position.symbol}交易对套利平仓成功`, { positionId });
        return { success: true };
      }

      // 部分失败，保留仓位记录并提示重试
      position.closedLong = position.closedLong || longCloseResult.success;
      position.closedShort = position.closedShort || shortCloseResult.success;

      const errors: string[] = [];
      if (!longCloseResult.success) {
        errors.push(`平多失败(${position.longExchange}): ${longCloseResult.error}`);
        logger.error(`${position.symbol}交易对在${position.longExchange}平多仓失败，请手动平仓！`);
      }
      if (!shortCloseResult.success) {
        errors.push(`平空失败(${position.shortExchange}): ${shortCloseResult.error}`);
        logger.error(`${position.symbol}交易对在${position.shortExchange}平空仓失败，请手动平仓！`);
      }

      position.closeError = errors.join('; ');
      position.closeStatus = longCloseResult.success || shortCloseResult.success ? 'partial' : 'failed';
      this.savePositions();

      return { success: false, error: position.closeError };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Arbitrage close failed with exception', {
        positionId,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 获取所有活跃仓位
   */
  getActivePositions(): ActiveArbitragePosition[] {
    return Array.from(this.activePositions.values());
  }

  /**
   * 更新活跃仓位的资金费率数据
   */
  updatePositionsFundingData(binanceDataList: FuturesData[], okxDataList: FuturesData[]): void {
    if (this.activePositions.size === 0) return;

    const binanceMap = new Map(binanceDataList.map(d => [d.symbol, d]));
    const okxMap = new Map(okxDataList.map(d => [d.symbol, d]));

    let updated = false;

    for (const position of this.activePositions.values()) {
      const binanceData = binanceMap.get(position.symbol);
      const okxData = okxMap.get(position.symbol);

      if (binanceData && okxData) {
        const longData = position.longExchange === 'binance' ? binanceData : okxData;
        const shortData = position.shortExchange === 'binance' ? binanceData : okxData;

        position.longFundingRate = longData.fundingRate;
        position.shortFundingRate = shortData.fundingRate;
        position.longFundingRatePercent = formatPercent(longData.fundingRate);
        position.shortFundingRatePercent = formatPercent(shortData.fundingRate);
        position.longSettlementPeriodHours = longData.settlementPeriodHours;
        position.shortSettlementPeriodHours = shortData.settlementPeriodHours;
        position.longNextSettlementTime = longData.nextSettlementTime.toISOString();
        position.shortNextSettlementTime = shortData.nextSettlementTime.toISOString();

        updated = true;
      }
    }

    if (updated) {
      this.savePositions();
    }
  }

  /**
   * 检查并执行自动平仓
   * @param fixedSecond 设置的固定秒数
   * @returns 自动平仓的仓位ID列表
   */
  async checkAndAutoClose(fixedSecond: number): Promise<string[]> {
    // 计算触发阈值：结算倒计时 <= (60 - fixedSecond)
    const threshold = 60 - fixedSecond;
    const now = Date.now();

    // 直接遍历 Map，避免创建数组副本
    const positionsToClose: Array<{ id: string; symbol: string }> = [];

    for (const position of this.activePositions.values()) {
      // 跳过已经在平仓中或平仓失败的仓位
      if (position.closeStatus === 'partial' || position.closeStatus === 'failed') {
        continue;
      }

      const { longCountdown, shortCountdown, minCountdown } = getPositionCountdownSeconds(position, now);

      // 检查倒计时是否满足条件
      if (minCountdown > threshold) {
        continue;
      }

      // 判断是否需要平仓
      let shouldClose = false;
      let reason: string | undefined;

      if (longCountdown === shortCountdown) {
        // 条件(1): 两所倒计时相同，检查年化收益
        const { yield: annualizedYield, percent } = calculatePositionAnnualizedYield(position);
        if (annualizedYield <= 0) {
          shouldClose = true;
          reason = `两所同时结算，预计年化=${percent}<=0`;
        }
      } else if (longCountdown < shortCountdown) {
        // 条件(2a): 开多方先结算，检查开多方资金费是否>0
        if (position.longFundingRate > 0) {
          shouldClose = true;
          reason = `开多方(${position.longExchange})先结算，资金费率=${(position.longFundingRate * 100).toFixed(4)}%>0`;
        }
      } else {
        // 条件(2b): 开空方先结算，检查开空方资金费是否<0
        if (position.shortFundingRate < 0) {
          shouldClose = true;
          reason = `开空方(${position.shortExchange})先结算，资金费率=${(position.shortFundingRate * 100).toFixed(4)}%<0`;
        }
      }

      if (shouldClose) {
        logger.info(`[自动平仓] ${position.symbol} 满足平仓条件: ${reason}`, {
          positionId: position.id,
          minCountdown,
          threshold,
        });
        positionsToClose.push({ id: position.id, symbol: position.symbol });
      }
    }

    if (positionsToClose.length === 0) {
      return [];
    }

    // 并发执行平仓
    logger.info(`[自动平仓] 开始执行 ${positionsToClose.length} 个仓位的自动平仓`);

    const closedIds: string[] = [];

    const results = await Promise.all(
      positionsToClose.map(({ id, symbol }) =>
        this.closeArbitrage(id).then(result => ({ id, symbol, ...result }))
      )
    );

    // 记录结果
    for (const { id, symbol, success, error } of results) {
      if (success) {
        logger.info(`[自动平仓] ${symbol} 平仓成功`, { positionId: id });
        closedIds.push(id);
      } else {
        logger.error(`[自动平仓] ${symbol} 平仓失败: ${error}`, { positionId: id });
      }
    }

    return closedIds;
  }

  /**
   * 加载持久化数据
   */
  private loadPositions(): void {
    try {
      if (existsSync(DATA_FILE_PATH)) {
        const data = readFileSync(DATA_FILE_PATH, 'utf-8');
        const positions: ActiveArbitragePosition[] = JSON.parse(data);
        this.activePositions = new Map(positions.map(p => [p.id, p]));
        logger.info('Loaded active positions', { count: this.activePositions.size });
      }
    } catch (error) {
      logger.warn('Failed to load active positions', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 保存数据到文件（异步 + debounce）
   */
  private savePositions(): void {
    // 清除之前的定时器
    if (this.pendingSaveTimer) {
      clearTimeout(this.pendingSaveTimer);
    }

    // 如果正在保存，延迟到下次
    if (this.isSaving) {
      this.pendingSaveTimer = setTimeout(() => this.savePositions(), SAVE_DEBOUNCE_MS);
      return;
    }

    // 设置 debounce 定时器
    this.pendingSaveTimer = setTimeout(async () => {
      this.pendingSaveTimer = null;
      this.isSaving = true;

      try {
        const dir = dirname(DATA_FILE_PATH);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        const positions = Array.from(this.activePositions.values());
        await writeFile(DATA_FILE_PATH, JSON.stringify(positions, null, 2));
        logger.debug('Active positions saved', { count: positions.length });
      } catch (error) {
        logger.error('Failed to save active positions', {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        this.isSaving = false;
      }
    }, SAVE_DEBOUNCE_MS);
  }
}

export default ArbitrageTradingService;
