import axios, { AxiosInstance, AxiosError } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { ExchangeApiConfig, HttpRequestOptions, IExchange } from './types.js';
import type { FuturesData, ExchangeType, RetryConfig, ExchangeAccountInfo } from '../types/index.js';
import logger from '../utils/logger.js';

/**
 * 交易所基类
 */
export abstract class BaseExchange implements IExchange {
  abstract readonly name: ExchangeType;
  protected config: ExchangeApiConfig = {};
  protected httpClient: AxiosInstance;

  protected readonly retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  };

  constructor(config?: ExchangeApiConfig) {
    this.config = config || {};
    this.httpClient = this.createHttpClient();
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
   * 获取账户信息 (余额和延迟)
   */
  abstract getAccountInfo(): Promise<ExchangeAccountInfo>;

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
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    // 配置代理
    if (this.config.proxyUrl) {
      const proxyUrl = this.config.proxyUrl;

      if (proxyUrl.startsWith('socks')) {
        config.httpsAgent = new SocksProxyAgent(proxyUrl);
        config.httpAgent = new SocksProxyAgent(proxyUrl);
      } else {
        config.httpsAgent = new HttpsProxyAgent(proxyUrl);
        config.httpAgent = new HttpsProxyAgent(proxyUrl);
      }

      logger.debug(`${this.name} using proxy: ${proxyUrl}`);
    }

    return axios.create(config);
  }

  /**
   * 带重试的 HTTP 请求
   */
  protected async request<T>(
    url: string,
    options: HttpRequestOptions = {}
  ): Promise<T> {
    const { method = 'GET', headers, params, data, timeout } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await this.httpClient.request<T>({
          url,
          method,
          headers,
          params,
          data,
          timeout: timeout || 30000,
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
  }

  /**
   * 延迟函数
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
