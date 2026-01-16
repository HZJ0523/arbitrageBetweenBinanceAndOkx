import type { ExchangeType } from '../types/index.js';

/**
 * 标准化交易对名称，提取基础货币
 *
 * @param symbol - 原始交易对名称
 * @param exchange - 交易所类型
 * @returns 标准化后的基础货币名称 (如 "BTC")
 */
export function normalizeSymbol(symbol: string, exchange: ExchangeType): string {
  switch (exchange) {
    case 'binance':
      // 币安格式: BTCUSDT -> BTC
      // 永续合约和现货格式相同
      if (symbol.endsWith('USDT')) {
        return symbol.slice(0, -4);
      }
      return symbol;

    case 'okx':
      // OKX 格式: BTC-USDT-SWAP -> BTC 或 BTC-USDT -> BTC
      const parts = symbol.split('-');
      return parts[0] || symbol;

    default:
      return symbol;
  }
}

/**
 * 从标准化币种名称生成交易所特定的永续合约交易对名称
 */
export function toFuturesSymbol(baseAsset: string, exchange: ExchangeType): string {
  switch (exchange) {
    case 'binance':
      return `${baseAsset}USDT`;
    case 'okx':
      return `${baseAsset}-USDT-SWAP`;
    default:
      return baseAsset;
  }
}

/**
 * 检查交易对是否为 USDT 永续合约
 */
export function isUsdtPerpetual(symbol: string, exchange: ExchangeType): boolean {
  switch (exchange) {
    case 'binance':
      return symbol.endsWith('USDT');
    case 'okx':
      return symbol.endsWith('-USDT-SWAP');
    default:
      return false;
  }
}
