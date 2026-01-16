import { useEffect, useCallback } from 'react';
import { connect, disconnect, sendConfigUpdate, sendManualRefresh } from '../services/websocket';
import { useSettingsStore } from '../stores/settings';
import { useConnectionStore } from '../stores/connection';
import type { MonitorConfig } from '../types';

export function useWebSocket() {
  const { isConnected, isMonitoring, isRefreshing, nextUpdateAt, lastError } =
    useConnectionStore();
  const getMonitorConfig = useSettingsStore((state) => state.getMonitorConfig);

  // 连接 WebSocket
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, []);

  // 发送配置更新
  const updateConfig = useCallback((config?: MonitorConfig) => {
    const configToSend = config || getMonitorConfig();
    sendConfigUpdate(configToSend);
  }, [getMonitorConfig]);

  // 手动刷新
  const manualRefresh = useCallback(() => {
    sendManualRefresh();
  }, []);

  return {
    isConnected,
    isMonitoring,
    isRefreshing,
    nextUpdateAt,
    lastError,
    updateConfig,
    manualRefresh,
  };
}

export default useWebSocket;
