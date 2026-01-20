import React, { memo, useEffect, useMemo, useCallback } from 'react';
import { Table, Tag, Tooltip, Button, Empty, Modal, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CloseCircleOutlined } from '@ant-design/icons';
import { useArbitrageStore } from '../stores/arbitrage';
import { formatDateTime } from '../utils/format';
import { CountdownCell } from './Countdown';
import { FundingRateDisplay } from './FundingRateDisplay';
import { sendCloseArbitrage, addArbitrageResultCallback } from '../services/websocket';
import { calculatePositionAnnualizedYield, getEarliestSettlementTime } from '@cryptos/shared';
import type { ActiveArbitragePosition, ArbitrageResultPayload } from '../types';

// 交易所名称映射
const exchangeNameMap: Record<string, string> = {
  binance: '币安',
  okx: 'OKX',
};

type CloseStatus = 'active' | 'partial' | 'failed';

const closeStatusMap: Record<CloseStatus, { label: string; color: string }> = {
  active: { label: '正常', color: 'green' },
  partial: { label: '部分平仓', color: 'orange' },
  failed: { label: '平仓失败', color: 'red' },
};

function resolveCloseStatus(position: ActiveArbitragePosition): CloseStatus {
  if (position.closeStatus) {
    return position.closeStatus;
  }
  if (position.closedLong || position.closedShort) {
    return 'partial';
  }
  return 'active';
}

// 平仓按钮组件 - 独立出来避免整个表格重渲染
interface CloseButtonProps {
  position: ActiveArbitragePosition;
  isClosing: boolean;
  isRetry: boolean;
}

const CloseButton = memo<CloseButtonProps>(({ position, isClosing, isRetry }) => {
  const handleClick = useCallback(() => {
    Modal.confirm({
      title: '确认平仓',
      icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
      content: (
        <div>
          <p>交易对: <strong>{position.symbol}/USDT</strong></p>
          <p>开仓金额: <strong>{position.usdtAmount} USDT</strong></p>
          <p style={{ color: '#ff4d4f', marginTop: 8 }}>
            确认要平掉此仓位吗？两所将同时市价平仓。
          </p>
        </div>
      ),
      okText: '确认平仓',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        sendCloseArbitrage(position.id);
      },
    });
  }, [position]);

  return (
    <Button
      type="primary"
      danger
      size="small"
      icon={<CloseCircleOutlined />}
      onClick={handleClick}
      loading={isClosing}
      disabled={isClosing}
    >
      {isClosing ? '平仓中' : isRetry ? '重试平仓' : '平仓'}
    </Button>
  );
});

CloseButton.displayName = 'CloseButton';

// 主表格组件
export const ActivePositionsTable: React.FC = memo(() => {
  const activePositions = useArbitrageStore((state) => state.activePositions);
  const closingPositionIds = useArbitrageStore((state) => state.closingPositionIds);

  // 设置平仓结果回调
  useEffect(() => {
    const handleResult = (result: ArbitrageResultPayload) => {
      if (result.action === 'close') {
        if (result.success) {
          message.success('平仓成功！');
        } else {
          message.error(result.error || '平仓失败');
        }
      }
    };

    return addArbitrageResultCallback(handleResult);
  }, []);

  // 使用 useMemo 缓存列定义，不再依赖 tick
  const columns: ColumnsType<ActiveArbitragePosition> = useMemo(() => [
    {
      title: '交易对',
      dataIndex: 'symbol',
      key: 'symbol',
      width: 100,
      render: (symbol) => <span className="font-bold">{symbol}/USDT</span>,
    },
    {
      title: '开仓金额',
      dataIndex: 'usdtAmount',
      key: 'usdtAmount',
      width: 100,
      render: (amount) => <span className="font-mono">{amount} USDT</span>,
    },
    {
      title: '开多交易所',
      key: 'longExchange',
      width: 100,
      render: (_, record) => (
        <Tag color="green">{exchangeNameMap[record.longExchange] || record.longExchange}</Tag>
      ),
    },
    {
      title: '开多费率',
      key: 'longFundingRate',
      width: 100,
      render: (_, record) => (
        <FundingRateDisplay
          rate={record.longFundingRate}
          percent={record.longFundingRatePercent}
        />
      ),
    },
    {
      title: '开空交易所',
      key: 'shortExchange',
      width: 100,
      render: (_, record) => (
        <Tag color="red">{exchangeNameMap[record.shortExchange] || record.shortExchange}</Tag>
      ),
    },
    {
      title: '开空费率',
      key: 'shortFundingRate',
      width: 100,
      render: (_, record) => (
        <FundingRateDisplay
          rate={record.shortFundingRate}
          percent={record.shortFundingRatePercent}
        />
      ),
    },
    {
      title: '结算倒计时',
      key: 'countdown',
      width: 100,
      render: (_, record) => (
        <CountdownCell nextSettlementTime={getEarliestSettlementTime(record)} />
      ),
    },
    {
      title: '平仓状态',
      key: 'closeStatus',
      width: 110,
      render: (_, record) => {
        const status = resolveCloseStatus(record);
        const { label, color } = closeStatusMap[status];
        const tag = <Tag color={color}>{label}</Tag>;
        return record.closeError ? (
          <Tooltip title={record.closeError}>{tag}</Tooltip>
        ) : (
          tag
        );
      },
    },
    {
      title: '预计年化',
      key: 'annualizedYield',
      width: 100,
      render: (_, record) => {
        const { yield: y, percent } = calculatePositionAnnualizedYield(record);
        return (
          <Tag color={y > 50 ? 'gold' : y > 0 ? 'blue' : 'default'}>
            {percent}
          </Tag>
        );
      },
    },
    {
      title: '开仓时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (time) => <span className="text-gray-500 text-sm">{formatDateTime(time)}</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, record) => {
        const status = resolveCloseStatus(record);
        return (
          <CloseButton
            position={record}
            isClosing={!!closingPositionIds[record.id]}
            isRetry={status !== 'active'}
          />
        );
      },
    },
  ], [closingPositionIds]); // 只依赖 closingPositionIds

  if (activePositions.length === 0) {
    return <Empty description="暂无正在套利中的仓位" />;
  }

  return (
    <Table
      columns={columns}
      dataSource={activePositions}
      rowKey="id"
      scroll={{ x: 1220 }}
      pagination={false}
      size="small"
    />
  );
});

ActivePositionsTable.displayName = 'ActivePositionsTable';

export default ActivePositionsTable;
