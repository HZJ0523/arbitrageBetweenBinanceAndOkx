import React from 'react';
import { Card, List, Tag, Empty, Button } from 'antd';
import { ClearOutlined } from '@ant-design/icons';
import { useConnectionStore } from '../stores/connection';
import type { LogLevel } from '../types';

// 日志级别颜色映射
const levelColorMap: Record<LogLevel, string> = {
  debug: 'default',
  info: 'blue',
  warn: 'orange',
  error: 'red',
};

// 格式化时间戳
const formatTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const LogPanel: React.FC = () => {
  const { logs, clearLogs } = useConnectionStore();

  return (
    <Card
      title="实时日志"
      size="small"
      extra={
        <Button
          size="small"
          icon={<ClearOutlined />}
          onClick={clearLogs}
          disabled={logs.length === 0}
        >
          清空
        </Button>
      }
      style={{ height: '300px', overflow: 'hidden' }}
      bodyStyle={{ height: 'calc(100% - 48px)', overflow: 'auto', padding: '8px' }}
    >
      {logs.length === 0 ? (
        <Empty description="暂无日志" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          size="small"
          dataSource={logs}
          renderItem={(log) => (
            <List.Item style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div className="flex items-start gap-2 w-full">
                <Tag color={levelColorMap[log.level]} style={{ margin: 0 }}>
                  {log.level.toUpperCase()}
                </Tag>
                <span className="text-gray-400 text-xs font-mono whitespace-nowrap">
                  {formatTime(log.timestamp)}
                </span>
                <span className="text-sm flex-1 break-all">{log.message}</span>
              </div>
            </List.Item>
          )}
        />
      )}
    </Card>
  );
};

export default LogPanel;
