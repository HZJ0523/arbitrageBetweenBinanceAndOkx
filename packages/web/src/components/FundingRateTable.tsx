import React, { useState, useMemo, Suspense, lazy } from 'react';
import { Table, Tag, Card, Empty, Tabs, Badge } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ThunderboltOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useArbitrageStore } from '../stores/arbitrage';
import { formatPrice, formatDateTime } from '../utils/format';
import { CountdownCell } from './Countdown';
import { FundingRateDisplay } from './FundingRateDisplay';
import type { FundingRateArbitrageItem } from '../types';

const ActivePositionsTable = lazy(() => import('./ActivePositionsTable'));

// 套利机会表格组件
const ArbitrageOpportunitiesTable: React.FC = () => {
  const { fundingRateArbitrage } = useArbitrageStore();
  const [pageSize, setPageSize] = useState(20);

  // 使用 useMemo 优化列定义，不再依赖 tick，倒计时组件内部管理自己的 tick
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
          <CountdownCell nextSettlementTime={record.binance.nextSettlementTime} />
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
          <CountdownCell nextSettlementTime={record.okx.nextSettlementTime} />
        ),
      },
    ],
    [] // 不再依赖 tick
  );

  return fundingRateArbitrage.length === 0 ? (
    <Empty description="暂无符合条件的套利机会" />
  ) : (
    <Table
      columns={columns}
      dataSource={fundingRateArbitrage}
      rowKey="symbol"
      scroll={{ x: 1400, y: 520 }}
      virtual
      pagination={{
        pageSize,
        showSizeChanger: true,
        pageSizeOptions: ['10', '20', '50', '100'],
        showTotal: (total) => `共 ${total} 条`,
        onShowSizeChange: (_current, size) => setPageSize(size),
      }}
      size="small"
    />
  );
};

// 主表格组件 (Tabs 容器)
export const FundingRateTable: React.FC = () => {
  const { fundingRateUpdatedAt, activePositions, activePositionsUpdatedAt } = useArbitrageStore();

  const tabItems = [
    {
      key: 'opportunities',
      label: (
        <span>
          <UnorderedListOutlined />
          套利机会
        </span>
      ),
      children: <ArbitrageOpportunitiesTable />,
    },
    {
      key: 'positions',
      label: (
        <span>
          <ThunderboltOutlined />
          正在套利
          {activePositions.length > 0 && (
            <Badge
              count={activePositions.length}
              style={{ marginLeft: 8 }}
              size="small"
            />
          )}
        </span>
      ),
      children: (
        <Suspense fallback={<div className="py-8 text-center text-gray-400">加载中...</div>}>
          <ActivePositionsTable />
        </Suspense>
      ),
    },
  ];

  return (
    <Card
      title="资金费率套利"
      extra={
        <span className="text-gray-500 text-sm">
          更新时间: {formatDateTime(fundingRateUpdatedAt || activePositionsUpdatedAt || '')}
        </span>
      }
    >
      <Tabs items={tabItems} />
    </Card>
  );
};

export default FundingRateTable;
