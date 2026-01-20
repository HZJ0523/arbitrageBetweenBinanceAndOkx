import axios, { AxiosInstance, AxiosError } from 'axios';
import http from 'node:http';
import https from 'node:https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { ExchangeApiConfig, HttpRequestOptions, IExchange } from './types.js';
import type { FuturesData, ExchangeType, ExchangeAccountInfo, PositionSide, OrderResult } from '../types/index.js';
import { RETRY_CONFIG, REQUEST_TIMEOUT, CONCURRENCY } from '../utils/constants.js';
import logger from '../utils/logger.js';

/**
 * 简单的请求并发限制器
 */
class RequestLimiter {
  private activeRequests = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.activeRequests < this.maxConcurrent) {
      this.activeRequests++;
      return;
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.activeRequests++;
        resolve();
      });
    });
  }

  release(): void {
    this.activeRequests--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

/**
 * 交易所基类
 */
export abstract class BaseExchange implements IExchange {
  abstract readonly name: ExchangeType;
  protected config: ExchangeApiConfig = {};
  protected httpClient: AxiosInstance;
  protected requestLimiter: RequestLimiter;

  protected readonly retryConfig = {
    maxRetries: RETRY_CONFIG.MAX_RETRIES,
    baseDelay: RETRY_CONFIG.BASE_DELAY,
    maxDelay: RETRY_CONFIG.MAX_DELAY,
    backoffMultiplier: RETRY_CONFIG.BACKOFF_MULTIPLIER,
  };

  protected readonly timeouts = REQUEST_TIMEOUT;

  constructor(config?: ExchangeApiConfig) {
    this.config = config || {};
    this.httpClient = this.createHttpClient();
    this.requestLimiter = new RequestLimiter(CONCURRENCY.MAX_PARALLEL_REQUESTS);
  }

  /**
   * 更新配置
   */
  updateConfig(config: ExchangeApiConfig): void {
    this.config = { ...this.config, ...config };
    this.httpClient = this.createHttpClient();
    logger.info(`${this.name} config updated`, {
      hasApiKey: !!this.config.apiKey,
      hasProxy: !!this.config.proxyUrl,
    });
  }

  /**
   * 获取所有 USDT 永续合约数据
   */
  abstract getAllFuturesData(): Promise<FuturesData[]>;

  /**
   * 获取单个交易对的最新合约数据
   */
  abstract getSingleFuturesData(symbol: string): Promise<FuturesData | null>;

  /**
   * 获取账户信息 (余额和延迟)
   */
  abstract getAccountInfo(): Promise<ExchangeAccountInfo>;

  /**
   * 设置杠杆倍数
   */
  abstract setLeverage(symbol: string, leverage: number): Promise<void>;

  /**
   * 市价开仓
   */
  abstract openPosition(symbol: string, side: PositionSide, usdtAmount: number): Promise<OrderResult>;

  /**
   * 市价平仓
   */
  abstract closePosition(symbol: string, side: PositionSide): Promise<OrderResult>;

  /**
   * 检查是否配置了 API
   */
  isConfigured(): boolean {
    return !!(this.config.apiKey && this.config.apiSecret);
  }

  /**
   * 创建 HTTP 客户端
   */
  protected createHttpClient(): AxiosInstance {
    const config: Parameters<typeof axios.create>[0] = {
      timeout: this.timeouts.DEFAULT,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    // 极限性能优化: 增加连接池大小和 Keep-Alive 配置
    const keepAliveOptions = {
      keepAlive: true,
      keepAliveMsecs: 5000,        // 更频繁的 Keep-Alive 探测
      maxSockets: 200,              // 最大连接数
      maxFreeSockets: 50,           // 最大空闲连接数
      scheduling: 'fifo' as const,  // 先进先出调度
    };

    // 配置代理
    if (this.config.proxyUrl) {
      const proxyUrl = this.config.proxyUrl;

      if (proxyUrl.startsWith('socks')) {
        const proxyAgent = new SocksProxyAgent(proxyUrl, keepAliveOptions);
        config.httpsAgent = proxyAgent;
        config.httpAgent = proxyAgent;
      } else {
        const proxyAgent = new HttpsProxyAgent(proxyUrl, keepAliveOptions);
        config.httpsAgent = proxyAgent;
        config.httpAgent = proxyAgent;
      }

      logger.debug(`${this.name} using proxy: ${proxyUrl}`);
    } else {
      config.httpAgent = new http.Agent(keepAliveOptions);
      config.httpsAgent = new https.Agent(keepAliveOptions);
    }

    return axios.create(config);
  }

  /**
   * 带重试的 HTTP 请求（可选并发限制）
   * @param skipLimiter 跳过并发限制（用于已在外部控制并发的场景）
   */
  protected async request<T>(
    url: string,
    options: HttpRequestOptions = {},
    skipLimiter = false
  ): Promise<T> {
    const { method = 'GET', headers, params, data, timeout } = options;

    // 可选：获取并发许可
    if (!skipLimiter) {
      await this.requestLimiter.acquire();
    }

    let lastError: Error | null = null;

    try {
      for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
        try {
          const response = await this.httpClient.request<T>({
            url,
            method,
            headers,
            params,
            data,
            timeout: timeout || this.timeouts.PUBLIC_API,
          });

          return response.data;
        } catch (error) {
          lastError = error as Error;

          const axiosError = error as AxiosError;
          const statusCode = axiosError.response?.status;
          const isRateLimited = statusCode === 429;
          const isServerError = statusCode && statusCode >= 500;
          const isNetworkError = axiosError.code === 'ECONNREFUSED' ||
            axiosError.code === 'ETIMEDOUT' ||
            axiosError.code === 'ENOTFOUND';

          // 只对可重试的错误进行重试
          if (!isRateLimited && !isServerError && !isNetworkError) {
            throw error;
          }

          if (attempt < this.retryConfig.maxRetries) {
            const delay = Math.min(
              this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt),
              this.retryConfig.maxDelay
            );

            logger.warn(`${this.name} request failed, retrying in ${delay}ms`, {
              url,
              attempt: attempt + 1,
              maxRetries: this.retryConfig.maxRetries,
              error: axiosError.message,
              statusCode,
            });

            await this.sleep(delay);
          }
        }
      }

      logger.error(`${this.name} request failed after all retries`, {
        url,
        error: lastError?.message,
      });

      throw lastError;
    } finally {
      // 释放并发许可
      if (!skipLimiter) {
        this.requestLimiter.release();
      }
    }
  }

  /**
   * 延迟函数
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 提取 API 错误信息 (通用方法)
   */
  protected extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      // 尝试从 axios 响应中提取详细错误
      const axiosError = error as Error & {
        response?: {
          data?: {
            code?: number | string;
            msg?: string;
            message?: string;
          };
        };
      };

      if (axiosError.response?.data) {
        const { code, msg, message } = axiosError.response.data;
        const errorMsg = msg || message;
        if (errorMsg) {
          return code ? `${code}: ${errorMsg}` : errorMsg;
        }
      }
      return error.message;
    }
    return String(error);
  }
}
