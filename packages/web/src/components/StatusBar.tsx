import React from 'react';
import { Tag, Space, Tooltip, Badge } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useConnectionStore } from '../stores/connection';
import { useTick } from '../hooks/useTick';
import { formatRelativeTime, formatDateTime } from '../utils/format';

export const StatusBar: React.FC = () => {
  const { isConnected, isMonitoring, isRefreshing, nextUpdateAt, lastError } =
    useConnectionStore();
  const tick = useTick();

  return (
    <div className="flex items-center justify-between p-4 bg-white border-b">
      <Space size="large">
        {/* 连接状态 */}
        <Tooltip title={isConnected ? 'WebSocket 已连接' : 'WebSocket 未连接'}>
          <Tag
            icon={isConnected ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            color={isConnected ? 'success' : 'error'}
          >
            {isConnected ? '已连接' : '未连接'}
          </Tag>
        </Tooltip>

        {/* 监控状态 */}
        <Tooltip title={isMonitoring ? '自动监控已启用' : '自动监控已禁用'}>
          <Tag color={isMonitoring ? 'processing' : 'default'}>
            {isMonitoring ? '监控中' : '监控已停止'}
          </Tag>
        </Tooltip>

        {/* 刷新状态 */}
        {isRefreshing && (
          <Tag icon={<SyncOutlined spin />} color="blue">
            刷新中...
          </Tag>
        )}

        {/* 下次更新时间 */}
        {nextUpdateAt && !isRefreshing && (
          <Tooltip title={`下次更新: ${formatDateTime(nextUpdateAt)}`}>
            <Tag icon={<ClockCircleOutlined />}>
              下次更新: {formatRelativeTime(nextUpdateAt, tick)}
            </Tag>
          </Tooltip>
        )}
      </Space>

      {/* 错误提示 */}
      {lastError && (
        <Tooltip title={lastError}>
          <Badge status="error" text={<span className="text-red-500">出错了</span>} />
        </Tooltip>
      )}
    </div>
  );
};

export default StatusBar;
