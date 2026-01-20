export function formatPercent(rate: number, decimals = 4): string {
  return `${(rate * 100).toFixed(decimals)}%`;
}
