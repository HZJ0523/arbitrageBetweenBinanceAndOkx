import logger from './logger.js';

type SchedulerCallback = () => Promise<void> | void;

interface SchedulerConfig {
  enabled: boolean;
  mode: 'interval' | 'fixed';
  intervalSeconds?: number;
  fixedMinute?: number;
  fixedSecond?: number;
}

/**
 * 调度器 - 支持间隔执行和固定时间执行
 */
export class Scheduler {
  private config: SchedulerConfig;
  private callback: SchedulerCallback;
  private intervalTimer: NodeJS.Timeout | null = null;
  private fixedTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private nextExecutionTime: Date | null = null;

  constructor(callback: SchedulerCallback, config?: Partial<SchedulerConfig>) {
    this.callback = callback;
    this.config = {
      enabled: false,
      mode: 'interval',
      intervalSeconds: 60,
      fixedMinute: 0,
      fixedSecond: 0,
      ...config,
    };
  }

  /**
   * 更新配置并重启调度器
   */
  updateConfig(config: Partial<SchedulerConfig>): void {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...config };

    // 如果之前是启用状态，需要重启
    if (wasEnabled) {
      this.stop();
    }

    if (this.config.enabled) {
      this.start();
    }

    logger.info('Scheduler config updated', {
      enabled: this.config.enabled,
      mode: this.config.mode,
      intervalSeconds: this.config.intervalSeconds,
      fixedMinute: this.config.fixedMinute,
      fixedSecond: this.config.fixedSecond,
    });
  }

  /**
   * 启动调度器
   */
  start(): void {
    if (this.isRunning) {
      this.stop();
    }

    if (!this.config.enabled) {
      this.nextExecutionTime = null;
      return;
    }

    this.isRunning = true;

    if (this.config.mode === 'interval') {
      this.startIntervalMode();
    } else {
      this.startFixedMode();
    }
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    if (this.fixedTimer) {
      clearTimeout(this.fixedTimer);
      this.fixedTimer = null;
    }

    this.isRunning = false;
    this.nextExecutionTime = null;
    logger.info('Scheduler stopped');
  }

  /**
   * 获取下次执行时间
   */
  getNextExecutionTime(): Date | null {
    if (!this.config.enabled || !this.isRunning) {
      return null;
    }

    const nowMs = Date.now();
    if (this.nextExecutionTime && this.nextExecutionTime.getTime() > nowMs) {
      return this.nextExecutionTime;
    }

    if (this.config.mode === 'interval') {
      const intervalMs = (this.config.intervalSeconds || 60) * 1000;
      this.nextExecutionTime = new Date(nowMs + intervalMs);
      return this.nextExecutionTime;
    }

    this.nextExecutionTime = this.getNextFixedTime();
    return this.nextExecutionTime;
  }

  /**
   * 是否正在运行
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 获取当前配置（只读引用，请勿修改）
   */
  getConfig(): Readonly<SchedulerConfig> {
    return this.config;
  }

  // 间隔模式
  private startIntervalMode(): void {
    const intervalMs = (this.config.intervalSeconds || 60) * 1000;

    logger.info('Starting interval mode scheduler', {
      intervalSeconds: this.config.intervalSeconds,
    });

    this.nextExecutionTime = new Date(Date.now() + intervalMs);
    this.intervalTimer = setInterval(async () => {
      this.nextExecutionTime = new Date(Date.now() + intervalMs);
      try {
        await this.callback();
      } catch (error) {
        logger.error('Error in scheduled callback', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, intervalMs);
  }

  // 固定时间模式
  private startFixedMode(): void {
    const scheduleNext = () => {
      const nextTime = this.getNextFixedTime();
      const delay = nextTime.getTime() - Date.now();

      this.nextExecutionTime = nextTime;
      logger.info('Scheduling next fixed execution', {
        nextTime: nextTime.toISOString(),
        delayMs: delay,
      });

      this.fixedTimer = setTimeout(async () => {
        this.nextExecutionTime = this.getNextFixedTime();
        try {
          await this.callback();
        } catch (error) {
          logger.error('Error in scheduled callback', {
            error: error instanceof Error ? error.message : String(error),
          });
        }

        // 安排下一次执行
        if (this.isRunning) {
          scheduleNext();
        }
      }, delay);
    };

    scheduleNext();
  }

  // 获取下一个固定时间点
  private getNextFixedTime(): Date {
    const now = new Date();
    const targetMinute = this.config.fixedMinute || 0;
    const targetSecond = this.config.fixedSecond || 0;
    const next = new Date(now);

    next.setMinutes(targetMinute);
    next.setSeconds(targetSecond);
    next.setMilliseconds(0);

    // 如果目标时间已过，设置为下一个小时
    if (next <= now) {
      next.setHours(next.getHours() + 1);
    }

    return next;
  }
}

export default Scheduler;
