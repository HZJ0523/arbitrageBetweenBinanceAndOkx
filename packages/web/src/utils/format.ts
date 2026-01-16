/**
 * 格式化倒计时秒数为时分秒格式
 */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return [hours, minutes, secs]
    .map((v) => v.toString().padStart(2, '0'))
    .join(':');
}

/**
 * 格式化日期时间
 */
export function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * 格式化相对时间
 */
export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffSecs = Math.floor(diffMs / 1000);

  if (diffSecs < 0) {
    return '已过期';
  }

  return formatCountdown(diffSecs);
}

/**
 * 格式化价格
 */
export function formatPrice(price: number): string {
  if (price >= 1000) {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } else if (price >= 1) {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  } else {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 6,
      maximumFractionDigits: 8,
    });
  }
}

