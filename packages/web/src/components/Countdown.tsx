import { memo } from 'react';
import { Tooltip } from 'antd';
import { formatDateTime, formatCountdown } from '../utils/format';
import { useTick } from '../hooks/useTick';

export interface CountdownProps {
  nextSettlementTime: string;
  tick?: number; // 可选，向后兼容
}

function getCountdownSeconds(nextSettlementTime: string, now: number): number {
  const targetTime = new Date(nextSettlementTime).getTime();
  const remaining = Math.floor((targetTime - now) / 1000);
  return remaining > 0 ? remaining : 0;
}

// 基础倒计时组件 - 接收外部 tick（向后兼容）
export const Countdown = memo<CountdownProps>(({ nextSettlementTime, tick }) => {
  // 如果没有传入 tick，使用内部 hook
  const internalTick = useTick();
  const actualTick = tick ?? internalTick;
  const seconds = getCountdownSeconds(nextSettlementTime, actualTick);

  return (
    <Tooltip title={formatDateTime(nextSettlementTime)}>
      <span className="font-mono">{formatCountdown(seconds)}</span>
    </Tooltip>
  );
});

Countdown.displayName = 'Countdown';

// 自包含倒计时组件 - 内部使用 useTick，避免父组件传递 tick 导致重渲染
export const CountdownCell = memo<{ nextSettlementTime: string }>(({ nextSettlementTime }) => {
  const tick = useTick();
  const seconds = getCountdownSeconds(nextSettlementTime, tick);

  return (
    <Tooltip title={formatDateTime(nextSettlementTime)}>
      <span className="font-mono">{formatCountdown(seconds)}</span>
    </Tooltip>
  );
});

CountdownCell.displayName = 'CountdownCell';

export default Countdown;
