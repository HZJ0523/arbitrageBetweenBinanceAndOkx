import React, { memo, useState, useMemo } from 'react';
import { Table, Tag, Tooltip, Card, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { useArbitrageStore } from '../stores/arbitrage';
import { useTick } from '../hooks/useTick';
import { formatPrice, formatCountdown, formatDateTime } from '../utils/format';
import type { FundingRateArbitrageItem } from '../types';

// 计算倒计时秒数
function calculateCountdownSeconds(nextSettlementTime: string, now: number): number {
  const targetTime = new Date(nextSettlementTime).getTime();
  const remaining = Math.floor((targetTime - now) / 1000);
  return remaining > 0 ? remaining : 0;
}

// 倒计时组件 - 使用全局 tick 驱动，不再有独立定时器
interface CountdownProps {
  nextSettlementTime: string;
  tick: number;
}

const Countdown = memo<CountdownProps>(({ nextSettlementTime, tick }) => {
  const seconds = calculateCountdownSeconds(nextSettlementTime, tick);

  return (
    <Tooltip title={formatDateTime(nextSettlementTime)}>
      <span className="font-mono">{formatCountdown(seconds)}</span>
    </Tooltip>
  );
});

Countdown.displayName = 'Countdown';

// 资金费率显示组件
interface FundingRateDisplayProps {
  rate: number;
  percent: string;
}

const FundingRateDisplay = memo<FundingRateDisplayProps>(({ rate, percent }) => {
  const isPositive = rate > 0;
  const color = isPositive ? 'red' : 'green';
  const icon = isPositive ? <ArrowUpOutlined /> : <ArrowDownOutlined />;

  return (
    <Tag color={color} icon={icon}>
      {percent}
    </Tag>
  );
});

FundingRateDisplay.displayName = 'FundingRateDisplay';

// 主表格组件
export const FundingRateTable: React.FC = () => {
  const { fundingRateArbitrage, fundingRateUpdatedAt } = useArbitrageStore();
  const [pageSize, setPageSize] = useState(20);

  // 使用全局 tick - 所有倒计时共享一个定时器
  const tick = useTick();

  // 使用 useMemo 优化列定义，避免每次渲染重新创建
  const columns: ColumnsType<FundingRateArbitrageItem> = useMemo(
    () => [
      {
        title: '交易对',
        dataIndex: 'symbol',
        key: 'symbol',
        fixed: 'left',
        width: 100,
        render: (symbol) => <span className="font-bold">{symbol}/USDT</span>,
      },
      {
        title: '年化收益',
        dataIndex: 'annualizedYieldPercent',
        key: 'annualizedYield',
        width: 120,
        render: (percent, record) => (
          <Tag color={record.annualizedYield > 50 ? 'gold' : 'blue'}>
            {percent}
          </Tag>
        ),
      },
      {
        title: '价格差',
        dataIndex: 'priceDiff',
        key: 'priceDiff',
        width: 120,
        render: (diff) => <span className="font-mono">${formatPrice(diff)}</span>,
      },
      {
        title: '币安价格',
        key: 'binancePrice',
        width: 140,
        render: (_, record) => (
          <span className="font-mono">${formatPrice(record.binance.price)}</span>
        ),
      },
      {
        title: '币安费率',
        key: 'binanceFundingRate',
        width: 120,
        render: (_, record) => (
          <FundingRateDisplay
            rate={record.binance.fundingRate}
            percent={record.binance.fundingRatePercent}
          />
        ),
      },
      {
        title: '币安周期',
        key: 'binancePeriod',
        width: 80,
        render: (_, record) => (
          <span>{record.binance.settlementPeriodHours}h</span>
        ),
      },
      {
        title: '币安倒计时',
        key: 'binanceCountdown',
        width: 100,
        render: (_, record) => (
          <Countdown
            nextSettlementTime={record.binance.nextSettlementTime}
            tick={tick}
          />
        ),
      },
      {
        title: 'OKX价格',
        key: 'okxPrice',
        width: 140,
        render: (_, record) => (
          <span className="font-mono">${formatPrice(record.okx.price)}</span>
        ),
      },
      {
        title: 'OKX费率',
        key: 'okxFundingRate',
        width: 120,
        render: (_, record) => (
          <FundingRateDisplay
            rate={record.okx.fundingRate}
            percent={record.okx.fundingRatePercent}
          />
        ),
      },
      {
        title: 'OKX周期',
        key: 'okxPeriod',
        width: 80,
        render: (_, record) => <span>{record.okx.settlementPeriodHours}h</span>,
      },
      {
        title: 'OKX倒计时',
        key: 'okxCountdown',
        width: 100,
        render: (_, record) => (
          <Countdown
            nextSettlementTime={record.okx.nextSettlementTime}
            tick={tick}
          />
        ),
      },
    ],
    [tick]
  );

  return (
    <Card
      title="资金费率套利机会"
      extra={
        fundingRateUpdatedAt && (
          <span className="text-gray-500 text-sm">
            更新时间: {formatDateTime(fundingRateUpdatedAt)}
          </span>
        )
      }
    >
      {fundingRateArbitrage.length === 0 ? (
        <Empty description="暂无符合条件的套利机会" />
      ) : (
        <Table
          columns={columns}
          dataSource={fundingRateArbitrage}
          rowKey="symbol"
          scroll={{ x: 1400 }}
          pagination={{
            pageSize,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (total) => `共 ${total} 条`,
            onShowSizeChange: (_current, size) => setPageSize(size),
          }}
          size="small"
        />
      )}
    </Card>
  );
};

export default FundingRateTable;
