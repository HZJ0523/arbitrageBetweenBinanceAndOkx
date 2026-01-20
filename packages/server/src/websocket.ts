import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { MonitorService } from './services/monitor.js';
import logger from './utils/logger.js';
import type {
  WSClientMessage,
  WSServerMessage,
  MonitorConfig,
  LogMessage,
  AccountInfo,
  StatusUpdatePayload,
  OpenArbitrageRequest,
  CloseArbitrageRequest,
  ActiveArbitragePosition,
} from './types/index.js';

/**
 * 序列化状态对象为 WebSocket 消息 payload
 */
function serializeStatus(status: {
  isMonitoring: boolean;
  isRefreshing: boolean;
  nextUpdateAt: Date | null;
  lastError: string | null;
}): StatusUpdatePayload {
  return {
    isMonitoring: status.isMonitoring,
    isRefreshing: status.isRefreshing,
    nextUpdateAt: status.nextUpdateAt?.toISOString() || null,
    lastError: status.lastError,
  };
}

/**
 * WebSocket 连接管理器
 */
class WebSocketManager {
  private clients: Set<WebSocket> = new Set();
  private monitorService: MonitorService;
  private logUnsubscribe: (() => void) | null = null;

  constructor() {
    this.monitorService = new MonitorService();
    this.setupMonitorCallbacks();
    this.setupLogSubscription();
  }

  /**
   * 设置监控服务回调
   */
  private setupMonitorCallbacks(): void {
    // 数据更新回调
    this.monitorService.onDataUpdate((data) => {
      this.broadcast({
        type: 'FUNDING_RATE_ARBITRAGE_DATA',
        payload: {
          data: data.fundingRateArbitrage,
          updatedAt: data.updatedAt.toISOString(),
        },
      });
    });

    // 状态更新回调
    this.monitorService.onStatusUpdate((status) => {
      this.broadcast({
        type: 'STATUS_UPDATE',
        payload: serializeStatus(status),
      });
    });

    // 账户信息更新回调
    this.monitorService.onAccountInfoUpdate((accountInfo: AccountInfo) => {
      this.broadcast({
        type: 'ACCOUNT_INFO',
        payload: accountInfo,
      });
    });

    // 活跃仓位更新回调
    this.monitorService.onActivePositionsUpdate((positions: ActiveArbitragePosition[], updatedAt: Date) => {
      this.broadcast({
        type: 'ACTIVE_POSITIONS_DATA',
        payload: {
          positions,
          updatedAt: updatedAt.toISOString(),
        },
      });
    });

    // 自动平仓回调 - 批量发送通知
    this.monitorService.onAutoClose((closedPositionIds: string[]) => {
      if (closedPositionIds.length === 0) return;

      // 预先序列化所有消息，避免重复 JSON.stringify
      const messages = closedPositionIds.map(positionId =>
        JSON.stringify({
          type: 'ARBITRAGE_RESULT',
          payload: {
            action: 'close',
            success: true,
            positionId,
          },
        })
      );

      // 批量发送到所有客户端
      for (const client of this.clients) {
        if (client.readyState === client.OPEN) {
          for (const msg of messages) {
            client.send(msg);
          }
        }
      }
    });
  }

  /**
   * 设置日志订阅 (只推送 info 级别以上的日志，减少 WebSocket 消息量)
   */
  private setupLogSubscription(): void {
    this.logUnsubscribe = logger.subscribe((log: LogMessage) => {
      // 过滤 debug 级别日志，减少前端消息量
      if (log.level === 'debug') {
        return;
      }
      this.broadcast({
        type: 'LOG',
        payload: log,
      });
    });
  }

  /**
   * 添加客户端连接
   */
  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    logger.info('WebSocket client connected', {
      totalClients: this.clients.size,
    });

    // 发送当前状态
    const status = this.monitorService.getStatus();
    this.send(ws, {
      type: 'STATUS_UPDATE',
      payload: serializeStatus(status),
    });

    // 发送缓存的最新数据
    const latestData = this.monitorService.getLatestData();
    if (latestData.updatedAt) {
      this.send(ws, {
        type: 'FUNDING_RATE_ARBITRAGE_DATA',
        payload: {
          data: latestData.fundingRateArbitrage,
          updatedAt: latestData.updatedAt.toISOString(),
        },
      });
    }

    // 发送缓存的账户信息
    const latestAccountInfo = this.monitorService.getLatestAccountInfo();
    if (latestAccountInfo) {
      this.send(ws, {
        type: 'ACCOUNT_INFO',
        payload: latestAccountInfo,
      });
    }

    // 发送活跃仓位数据
    const arbitrageTradingService = this.monitorService.getArbitrageTradingService();
    const activePositions = arbitrageTradingService.getActivePositions();
    this.send(ws, {
      type: 'ACTIVE_POSITIONS_DATA',
      payload: {
        positions: activePositions,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * 移除客户端连接
   */
  removeClient(ws: WebSocket): void {
    this.clients.delete(ws);
    logger.info('WebSocket client disconnected', {
      totalClients: this.clients.size,
    });
  }

  /**
   * 处理客户端消息
   */
  async handleMessage(ws: WebSocket, message: string): Promise<void> {
    try {
      const msg = JSON.parse(message) as WSClientMessage;

      switch (msg.type) {
        case 'CONFIG_UPDATE':
          this.handleConfigUpdate(msg.payload as MonitorConfig);
          break;

        case 'MANUAL_REFRESH':
          await this.handleManualRefresh();
          break;

        case 'SUBSCRIBE':
          // 目前订阅功能保留，默认推送所有数据
          logger.debug('Subscribe message received', { payload: msg.payload });
          break;

        case 'OPEN_ARBITRAGE':
          await this.handleOpenArbitrage(ws, msg.payload as OpenArbitrageRequest);
          break;

        case 'CLOSE_ARBITRAGE':
          await this.handleCloseArbitrage(ws, msg.payload as CloseArbitrageRequest);
          break;

        default:
          logger.warn('Unknown message type', { message: msg });
      }
    } catch (error) {
      logger.error('Failed to handle WebSocket message', {
        error: error instanceof Error ? error.message : String(error),
        message,
      });

      this.send(ws, {
        type: 'ERROR',
        payload: {
          code: 'PARSE_ERROR',
          message: 'Failed to parse message',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * 处理配置更新
   */
  private handleConfigUpdate(config: MonitorConfig): void {
    logger.info('Config update received');
    this.monitorService.updateConfig(config);
  }

  /**
   * 处理手动刷新
   */
  private async handleManualRefresh(): Promise<void> {
    try {
      await this.monitorService.manualRefresh();
    } catch (error) {
      this.broadcast({
        type: 'ERROR',
        payload: {
          code: 'NETWORK_ERROR',
          message: 'Manual refresh failed',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * 处理开仓请求
   */
  private async handleOpenArbitrage(ws: WebSocket, request: OpenArbitrageRequest): Promise<void> {
    try {
      const arbitrageTradingService = this.monitorService.getArbitrageTradingService();
      const result = await arbitrageTradingService.openArbitrage(request.symbol, request.usdtAmount);

      // 发送结果给请求的客户端
      this.send(ws, {
        type: 'ARBITRAGE_RESULT',
        payload: {
          action: 'open',
          success: result.success,
          position: result.position,
          error: result.error,
        },
      });

      // 如果成功，广播更新的活跃仓位
      if (result.success) {
        const activePositions = arbitrageTradingService.getActivePositions();
        this.broadcast({
          type: 'ACTIVE_POSITIONS_DATA',
          payload: {
            positions: activePositions,
            updatedAt: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      this.send(ws, {
        type: 'ARBITRAGE_RESULT',
        payload: {
          action: 'open',
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * 处理平仓请求
   */
  private async handleCloseArbitrage(ws: WebSocket, request: CloseArbitrageRequest): Promise<void> {
    try {
      const arbitrageTradingService = this.monitorService.getArbitrageTradingService();
      const result = await arbitrageTradingService.closeArbitrage(request.positionId);

      // 发送结果给请求的客户端
      this.send(ws, {
        type: 'ARBITRAGE_RESULT',
        payload: {
          action: 'close',
          success: result.success,
          positionId: request.positionId,
          error: result.error,
        },
      });

      // 广播更新的活跃仓位
      const activePositions = arbitrageTradingService.getActivePositions();
      this.broadcast({
        type: 'ACTIVE_POSITIONS_DATA',
        payload: {
          positions: activePositions,
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      this.send(ws, {
        type: 'ARBITRAGE_RESULT',
        payload: {
          action: 'close',
          success: false,
          positionId: request.positionId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * 发送消息到单个客户端
   */
  private send(ws: WebSocket, message: WSServerMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * 广播消息到所有客户端
   */
  private broadcast(message: WSServerMessage): void {
    const messageStr = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        client.send(messageStr);
      }
    }
  }

  /**
   * 停止服务
   */
  stop(): void {
    if (this.logUnsubscribe) {
      this.logUnsubscribe();
    }
    this.monitorService.stop();

    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    logger.info('WebSocketManager stopped');
  }
}

// 单例实例
let wsManager: WebSocketManager | null = null;

/**
 * 注册 WebSocket 路由
 */
export function registerWebSocketRoutes(app: FastifyInstance): void {
  wsManager = new WebSocketManager();

  app.get('/ws', { websocket: true }, (socket, _req) => {
    const ws = socket as unknown as WebSocket;

    wsManager!.addClient(ws);

    ws.on('message', (message: Buffer) => {
      wsManager!.handleMessage(ws, message.toString());
    });

    ws.on('close', () => {
      wsManager!.removeClient(ws);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error', {
        error: error.message,
      });
      wsManager!.removeClient(ws);
    });
  });
}

/**
 * 停止 WebSocket 服务
 */
export function stopWebSocketService(): void {
  if (wsManager) {
    wsManager.stop();
    wsManager = null;
  }
}

export default registerWebSocketRoutes;
