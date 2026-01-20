// ============================================
// 共享工具函数 - 前后端通用
// ============================================

import type { ActiveArbitragePosition } from './types.js';

// 预计算常量，避免重复计算
const HOURS_PER_DAY = 24;
const DAYS_PER_YEAR = 365;
const PERCENT_MULTIPLIER = 100;
const ANNUALIZED_MULTIPLIER = HOURS_PER_DAY * DAYS_PER_YEAR * PERCENT_MULTIPLIER;

/**
 * 计算仓位的预计年化收益率
 * @param position 活跃仓位
 * @returns 年化收益率数值和百分比字符串
 */
export function calculatePositionAnnualizedYield(position: ActiveArbitragePosition): {
  yield: number;
  percent: string;
} {
  const shortAnnualized = position.shortFundingRate * ANNUALIZED_MULTIPLIER / position.shortSettlementPeriodHours;
  const longAnnualized = position.longFundingRate * ANNUALIZED_MULTIPLIER / position.longSettlementPeriodHours;
  const totalYield = shortAnnualized - longAnnualized;
  return {
    yield: totalYield,
    percent: `${totalYield.toFixed(2)}%`,
  };
}

/**
 * 解析仓位的结算时间戳（内部复用）
 */
function parseSettlementTimes(position: ActiveArbitragePosition): { longTime: number; shortTime: number } {
  return {
    longTime: Date.parse(position.longNextSettlementTime),
    shortTime: Date.parse(position.shortNextSettlementTime),
  };
}

/**
 * 获取仓位的结算倒计时秒数
 * @param position 活跃仓位
 * @param now 当前时间戳（可选，默认为 Date.now()）
 * @returns 开多/开空/最小倒计时秒数
 */
export function getPositionCountdownSeconds(
  position: ActiveArbitragePosition,
  now?: number
): {
  longCountdown: number;
  shortCountdown: number;
  minCountdown: number;
} {
  const currentTime = now ?? Date.now();
  const { longTime, shortTime } = parseSettlementTimes(position);
  const longCountdown = Math.max(0, ((longTime - currentTime) / 1000) | 0);
  const shortCountdown = Math.max(0, ((shortTime - currentTime) / 1000) | 0);
  return {
    longCountdown,
    shortCountdown,
    minCountdown: longCountdown < shortCountdown ? longCountdown : shortCountdown,
  };
}

/**
 * 获取仓位的最近结算时间
 * @param position 活跃仓位
 * @returns 最近结算时间的 ISO 字符串
 */
export function getEarliestSettlementTime(position: ActiveArbitragePosition): string {
  const { longTime, shortTime } = parseSettlementTimes(position);
  return longTime < shortTime ? position.longNextSettlementTime : position.shortNextSettlementTime;
}
