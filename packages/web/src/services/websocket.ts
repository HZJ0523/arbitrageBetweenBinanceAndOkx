import type {
  WSServerMessage,
  MonitorConfig,
  ArbitrageResultPayload,
} from '../types';
import { useArbitrageStore } from '../stores/arbitrage';
import { useConnectionStore } from '../stores/connection';

// 套利结果回调类型 - 支持多个监听器
type ArbitrageResultCallback = (result: ArbitrageResultPayload) => void;
const arbitrageResultCallbacks = new Set<ArbitrageResultCallback>();

// WebSocket 连接状态
let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

// 计算指数退避重连延迟
function getReconnectDelay(attempt: number): number {
  const delay = Math.min(
    BASE_RECONNECT_DELAY * Math.pow(2, attempt),
    MAX_RECONNECT_DELAY
  );
  // 添加随机抖动 (±20%)，避免多客户端同时重连
  const jitter = delay * 0.2 * (Math.random() - 0.5);
  return Math.floor(delay + jitter);
}

function clearReconnectTimer(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

// 获取 WebSocket URL
function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
}

// 处理消息 - 使用类型守卫
function handleMessage(event: MessageEvent): void {
  try {
    const message = JSON.parse(event.data) as WSServerMessage;

    switch (message.type) {
      case 'FUNDING_RATE_ARBITRAGE_DATA': {
        useArbitrageStore.getState().setFundingRateArbitrage(
          message.payload.data,
          message.payload.updatedAt
        );
        break;
      }

      case 'STATUS_UPDATE': {
        useConnectionStore.getState().setStatus({
          isMonitoring: message.payload.isMonitoring,
          isRefreshing: message.payload.isRefreshing,
          nextUpdateAt: message.payload.nextUpdateAt,
          lastError: message.payload.lastError,
        });
        break;
      }

      case 'ERROR': {
        useConnectionStore.getState().setStatus({
          lastError: `${message.payload.code}: ${message.payload.message}`,
        });
        break;
      }

      case 'LOG': {
        useConnectionStore.getState().addLog(message.payload);
        break;
      }

      case 'ACCOUNT_INFO': {
        useArbitrageStore.getState().setAccountInfo(message.payload);
        break;
      }

      case 'ACTIVE_POSITIONS_DATA': {
        useArbitrageStore.getState().setActivePositions(
          message.payload.positions,
          message.payload.updatedAt
        );
        break;
      }

      case 'ARBITRAGE_RESULT': {
        const payload = message.payload;
        // 重置开仓状态
        if (payload.action === 'open') {
          useArbitrageStore.getState().setIsOpening(false);
        }
        // 重置平仓状态
        if (payload.action === 'close' && payload.positionId) {
          useArbitrageStore.getState().removeClosingPositionId(payload.positionId);
        }
        // 调用所有回调
        for (const callback of arbitrageResultCallbacks) {
          callback(payload);
        }
        break;
      }
    }
  } catch (error) {
    console.error('Failed to parse WebSocket message:', error);
  }
}

// 连接 WebSocket
export function connect(): void {
  clearReconnectTimer();

  if (ws && ws.readyState !== WebSocket.CLOSED) {
    return;
  }

  const url = getWebSocketUrl();
  console.log('Connecting to WebSocket:', url);

  const socket = new WebSocket(url);
  ws = socket;

  socket.onopen = () => {
    if (ws !== socket) {
      return;
    }
    console.log('WebSocket connected');
    useConnectionStore.getState().setConnected(true);
    reconnectAttempts = 0;
  };

  socket.onclose = () => {
    if (ws !== socket) {
      return;
    }
    console.log('WebSocket disconnected');
    useConnectionStore.getState().setConnected(false);
    ws = null;

    // 尝试重连（使用指数退避）
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      clearReconnectTimer();
      const delay = getReconnectDelay(reconnectAttempts);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        reconnectAttempts++;
        console.log(`Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}), delay: ${delay}ms`);
        connect();
      }, delay);
    }
  };

  socket.onerror = (error) => {
    if (ws !== socket) {
      return;
    }
    console.error('WebSocket error:', error);
  };

  socket.onmessage = (event) => {
    if (ws !== socket) {
      return;
    }
    handleMessage(event);
  };
}

// 断开连接
export function disconnect(): void {
  if (ws) {
    ws.close();
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

// 发送开仓请求
export function sendOpenArbitrage(symbol: string, usdtAmount: number): void {
  if (ws?.readyState === WebSocket.OPEN) {
    useArbitrageStore.getState().setIsOpening(true);
    ws.send(JSON.stringify({
      type: 'OPEN_ARBITRAGE',
      payload: { symbol, usdtAmount },
    }));
  }
}

// 发送平仓请求
export function sendCloseArbitrage(positionId: string): void {
  if (ws?.readyState === WebSocket.OPEN) {
    useArbitrageStore.getState().addClosingPositionId(positionId);
    ws.send(JSON.stringify({
      type: 'CLOSE_ARBITRAGE',
      payload: { positionId },
    }));
  }
}

// 添加套利结果回调 (返回取消订阅函数)
export function addArbitrageResultCallback(callback: ArbitrageResultCallback): () => void {
  arbitrageResultCallbacks.add(callback);
  return () => {
    arbitrageResultCallbacks.delete(callback);
  };
}

export default {
  connect,
  disconnect,
  sendConfigUpdate,
  sendManualRefresh,
  sendOpenArbitrage,
  sendCloseArbitrage,
  addArbitrageResultCallback,
};
