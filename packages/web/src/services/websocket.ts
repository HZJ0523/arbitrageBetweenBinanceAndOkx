import type {
  WSServerMessage,
  MonitorConfig,
  FundingRateArbitrageItem,
  LogMessage,
} from '../types';
import { useArbitrageStore } from '../stores/arbitrage';
import { useConnectionStore } from '../stores/connection';

// WebSocket 连接状态
let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 3000;

// 获取 WebSocket URL
function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
}

// 处理消息
function handleMessage(event: MessageEvent): void {
  try {
    const message = JSON.parse(event.data) as WSServerMessage;

    switch (message.type) {
      case 'FUNDING_RATE_ARBITRAGE_DATA': {
        const payload = message.payload as {
          data: FundingRateArbitrageItem[];
          updatedAt: string;
        };
        useArbitrageStore.getState().setFundingRateArbitrage(payload.data, payload.updatedAt);
        break;
      }

      case 'STATUS_UPDATE': {
        const payload = message.payload as {
          isMonitoring: boolean;
          isRefreshing: boolean;
          nextUpdateAt: string | null;
          lastError: string | null;
        };
        useConnectionStore.getState().setStatus({
          isMonitoring: payload.isMonitoring,
          isRefreshing: payload.isRefreshing,
          nextUpdateAt: payload.nextUpdateAt,
          lastError: payload.lastError,
        });
        break;
      }

      case 'ERROR': {
        const payload = message.payload as {
          code: string;
          message: string;
          details?: unknown;
        };
        useConnectionStore.getState().setStatus({
          lastError: `${payload.code}: ${payload.message}`,
        });
        break;
      }

      case 'LOG': {
        const payload = message.payload as LogMessage;
        useConnectionStore.getState().addLog(payload);
        break;
      }
    }
  } catch (error) {
    console.error('Failed to parse WebSocket message:', error);
  }
}

// 连接 WebSocket
export function connect(): void {
  if (ws?.readyState === WebSocket.OPEN) {
    return;
  }

  const url = getWebSocketUrl();
  console.log('Connecting to WebSocket:', url);

  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log('WebSocket connected');
    useConnectionStore.getState().setConnected(true);
    reconnectAttempts = 0;
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    useConnectionStore.getState().setConnected(false);
    ws = null;

    // 尝试重连
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectTimer = window.setTimeout(() => {
        reconnectAttempts++;
        console.log(`Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        connect();
      }, RECONNECT_DELAY);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  ws.onmessage = handleMessage;
}

// 断开连接
export function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (ws) {
    ws.close();
    ws = null;
  }

  useConnectionStore.getState().setConnected(false);
}

// 发送配置更新
export function sendConfigUpdate(config: MonitorConfig): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'CONFIG_UPDATE',
      payload: config,
    }));
  }
}

// 发送手动刷新请求
export function sendManualRefresh(): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'MANUAL_REFRESH',
    }));
  }
}

// 检查连接状态
export function isConnected(): boolean {
  return ws?.readyState === WebSocket.OPEN;
}

export default {
  connect,
  disconnect,
  sendConfigUpdate,
  sendManualRefresh,
  isConnected,
};
