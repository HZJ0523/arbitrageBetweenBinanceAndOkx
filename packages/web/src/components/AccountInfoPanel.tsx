import React, { memo } from 'react';
import { Card, Descriptions, Typography, Space, Tag } from 'antd';
import { ApiOutlined, DollarOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useArbitrageStore } from '../stores/arbitrage';
import type { ExchangeAccountInfo } from '../types';

const { Text } = Typography;

// 格式化余额
const formatBalance = (balance: number | null): string => {
  if (balance === null) return '-';
  return balance.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// 格式化延迟
const formatLatency = (latencyMs: number | null): string => {
  if (latencyMs === null) return '-';
  return `${latencyMs} ms`;
};

// 单个交易所账户信息展示
interface ExchangeInfoProps {
  name: string;
  info: ExchangeAccountInfo | undefined;
}

const ExchangeInfo = memo<ExchangeInfoProps>(({ name, info }) => {
  // 未配置 API
  if (!info || !info.configured) {
    return (
      <Card size="small" title={name} style={{ flex: 1 }}>
        <div className="text-center py-4">
          <Text type="secondary">未配置 API</Text>
        </div>
      </Card>
    );
  }

  // 配置了 API 但有错误
  if (info.error) {
    return (
      <Card size="small" title={name} style={{ flex: 1 }}>
        <Descriptions column={1} size="small">
          <Descriptions.Item
            label={
              <Space>
                <ClockCircleOutlined />
                延迟
              </Space>
            }
          >
            <Text>{formatLatency(info.latencyMs)}</Text>
          </Descriptions.Item>
          <Descriptions.Item
            label={
              <Space>
                <DollarOutlined />
                余额
              </Space>
            }
          >
            <Tag color="error">获取失败</Tag>
          </Descriptions.Item>
        </Descriptions>
        <div className="mt-2">
          <Text type="danger" style={{ fontSize: '12px' }}>
            {info.error}
          </Text>
        </div>
      </Card>
    );
  }

  // 正常情况
  return (
    <Card size="small" title={name} style={{ flex: 1 }}>
      <Descriptions column={1} size="small">
        <Descriptions.Item
          label={
            <Space>
              <ClockCircleOutlined />
              延迟
            </Space>
          }
        >
          <Text
            type={
              info.latencyMs !== null && info.latencyMs < 500
                ? 'success'
                : info.latencyMs !== null && info.latencyMs < 1000
                ? 'warning'
                : 'danger'
            }
          >
            {formatLatency(info.latencyMs)}
          </Text>
        </Descriptions.Item>
        <Descriptions.Item
          label={
            <Space>
              <DollarOutlined />
              USDT 可用
            </Space>
          }
        >
          <Text strong className="font-mono">
            {formatBalance(info.availableBalance)}
          </Text>
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
});

ExchangeInfo.displayName = 'ExchangeInfo';

export const AccountInfoPanel: React.FC = () => {
  // 使用合并后的 arbitrage store
  const accountInfo = useArbitrageStore((state) => state.accountInfo);

  return (
    <Card
      title={
        <Space>
          <ApiOutlined />
          账户信息
        </Space>
      }
      size="small"
      style={{ marginTop: '16px' }}
    >
      <div className="flex gap-4">
        <ExchangeInfo name="币安 (Binance)" info={accountInfo?.binance} />
        <ExchangeInfo name="欧意 (OKX)" info={accountInfo?.okx} />
      </div>
      {accountInfo?.updatedAt && (
        <div className="mt-2 text-right">
          <Text type="secondary" style={{ fontSize: '12px' }}>
            更新于: {new Date(accountInfo.updatedAt).toLocaleTimeString('zh-CN')}
          </Text>
        </div>
      )}
    </Card>
  );
};

export default AccountInfoPanel;
