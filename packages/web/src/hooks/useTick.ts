import { useSyncExternalStore, useCallback } from 'react';

// 全局 tick 订阅器 - 单一定时器驱动所有倒计时
let listeners: Set<() => void> = new Set();
let currentTick = Date.now();

// 启动全局定时器 (仅当有订阅者时运行)
let intervalId: number | null = null;

function startTicker() {
  if (intervalId !== null) return;

  intervalId = window.setInterval(() => {
    currentTick = Date.now();
    listeners.forEach((listener) => listener());
  }, 1000);
}

function stopTicker() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // 首个订阅者时启动定时器
  if (listeners.size === 1) {
    startTicker();
  }

  return () => {
    listeners.delete(listener);

    // 最后一个订阅者取消时停止定时器
    if (listeners.size === 0) {
      stopTicker();
    }
  };
}

function getSnapshot(): number {
  return currentTick;
}

/**
 * 全局 tick hook - 所有倒计时组件共享同一个定时器
 * 返回当前时间戳 (每秒更新一次)
 */
export function useTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * 计算倒计时秒数
 * @param nextSettlementTime - 下次结算时间 (ISO 字符串)
 * @returns 剩余秒数
 */
export function useCountdown(nextSettlementTime: string): number {
  const tick = useTick();

  return useCallback(() => {
    const targetTime = new Date(nextSettlementTime).getTime();
    const remaining = Math.floor((targetTime - tick) / 1000);
    return remaining > 0 ? remaining : 0;
  }, [nextSettlementTime, tick])();
}

export default useTick;
