import type { FuturesData, FundingRateArbitrageItem } from '../types/index.js';
import logger from '../utils/logger.js';

/**
 * 计算年化收益率
 * @param fundingRate - 资金费率 (如 0.0001 表示 0.01%)
 * @param settlementPeriodHours - 结算周期 (小时)
 * @returns 年化收益率 (如 32.85 表示 32.85%)
 */
function calculateAnnualizedRate(fundingRate: number, settlementPeriodHours: number): number {
  // 年化 = 费率 × (24 / 结算周期小时数) × 365
  const periodsPerDay = 24 / settlementPeriodHours;
  return fundingRate * periodsPerDay * 365 * 100; // 转换为百分比
}

/**
 * 格式化费率为百分比字符串
 */
function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(4)}%`;
}

/**
 * 格式化年化收益率
 */
function formatAnnualizedYield(yield_: number): string {
  return `${yield_.toFixed(2)}%`;
}

/**
 * 计算结算倒计时 (秒)
 */
function calculateCountdown(nextSettlementTime: Date): number {
  const now = Date.now();
  const countdown = Math.floor((nextSettlementTime.getTime() - now) / 1000);
  return countdown > 0 ? countdown : 0;
}

/**
 * 资金费率套利计算服务
 *
 * 筛选条件:
 * 1. 两个交易所的资金费率异号 (一正一负)
 * 2. 正资金费率的合约价格 >= 负资金费率的合约价格
 *
 * 排序规则:
 * 1. 按年化收益降序
 * 2. 相同年化时，按两合约价格差的绝对值升序
 */
export function calculateFundingRateArbitrage(
  binanceFutures: FuturesData[],
  okxFutures: FuturesData[]
): FundingRateArbitrageItem[] {
  logger.debug('Calculating funding rate arbitrage...');

  // 创建币安数据映射
  const binanceMap = new Map<string, FuturesData>();
  for (const data of binanceFutures) {
    binanceMap.set(data.symbol, data);
  }

  // 创建 OKX 数据映射
  const okxMap = new Map<string, FuturesData>();
  for (const data of okxFutures) {
    okxMap.set(data.symbol, data);
  }

  // 找出两个交易所都有的交易对
  const commonSymbols = new Set<string>();
  for (const symbol of binanceMap.keys()) {
    if (okxMap.has(symbol)) {
      commonSymbols.add(symbol);
    }
  }

  const arbitrageItems: FundingRateArbitrageItem[] = [];

  for (const symbol of commonSymbols) {
    const binanceData = binanceMap.get(symbol)!;
    const okxData = okxMap.get(symbol)!;

    // 检查资金费率是否异号
    const binanceRate = binanceData.fundingRate;
    const okxRate = okxData.fundingRate;

    if (binanceRate * okxRate >= 0) {
      // 同号或有零值，跳过
      continue;
    }

    // 确定正费率和负费率的交易所
    let positiveData: FuturesData;
    let negativeData: FuturesData;

    if (binanceRate > 0) {
      positiveData = binanceData;
      negativeData = okxData;
    } else {
      positiveData = okxData;
      negativeData = binanceData;
    }

    // 检查正资金费的合约价格是否大于等于负资金费的合约价格
    if (positiveData.price < negativeData.price) {
      continue;
    }

    // 计算年化收益
    const positiveAnnualized = calculateAnnualizedRate(
      positiveData.fundingRate,
      positiveData.settlementPeriodHours
    );
    const negativeAnnualized = calculateAnnualizedRate(
      negativeData.fundingRate,
      negativeData.settlementPeriodHours
    );

    // 总年化收益 = 正费率年化 - 负费率年化
    const annualizedYield = positiveAnnualized - negativeAnnualized;

    // 价格差绝对值
    const priceDiff = Math.abs(binanceData.price - okxData.price);

    arbitrageItems.push({
      symbol,
      binance: {
        price: binanceData.price,
        fundingRate: binanceData.fundingRate,
        fundingRatePercent: formatPercent(binanceData.fundingRate),
        settlementPeriodHours: binanceData.settlementPeriodHours,
        nextSettlementTime: binanceData.nextSettlementTime.toISOString(),
        countdownSeconds: calculateCountdown(binanceData.nextSettlementTime),
      },
      okx: {
        price: okxData.price,
        fundingRate: okxData.fundingRate,
        fundingRatePercent: formatPercent(okxData.fundingRate),
        settlementPeriodHours: okxData.settlementPeriodHours,
        nextSettlementTime: okxData.nextSettlementTime.toISOString(),
        countdownSeconds: calculateCountdown(okxData.nextSettlementTime),
      },
      annualizedYield,
      annualizedYieldPercent: formatAnnualizedYield(annualizedYield),
      priceDiff,
    });
  }

  // 排序: 年化收益降序，相同年化时价格差升序
  arbitrageItems.sort((a, b) => {
    if (a.annualizedYield !== b.annualizedYield) {
      return b.annualizedYield - a.annualizedYield; // 年化降序
    }
    return a.priceDiff - b.priceDiff; // 价格差升序
  });

  logger.info('Funding rate arbitrage calculated', {
    totalPairs: commonSymbols.size,
    arbitrageOpportunities: arbitrageItems.length,
  });

  return arbitrageItems;
}

export default calculateFundingRateArbitrage;
