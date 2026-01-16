import logger from './logger.js';

type SchedulerCallback = () => Promise<void> | void;

interface SchedulerConfig {
  enabled: boolean;
  mode: 'interval' | 'fixed';
  intervalSeconds?: number;
  fixedMinute?: number;
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

  constructor(callback: SchedulerCallback, config?: Partial<SchedulerConfig>) {
    this.callback = callback;
    this.config = {
      enabled: false,
      mode: 'interval',
      intervalSeconds: 60,
      fixedMinute: 0,
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
    logger.info('Scheduler stopped');
  }

  /**
   * 获取下次执行时间
   */
  getNextExecutionTime(): Date | null {
    if (!this.config.enabled || !this.isRunning) {
      return null;
    }

    if (this.config.mode === 'interval') {
      const intervalMs = (this.config.intervalSeconds || 60) * 1000;
      return new Date(Date.now() + intervalMs);
    } else {
      return this.getNextFixedTime();
    }
  }

  /**
   * 手动触发执行（不影响自动调度）
   */
  async trigger(): Promise<void> {
    logger.info('Manual trigger executed');
    try {
      await this.callback();
    } catch (error) {
      logger.error('Error in manual trigger', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): SchedulerConfig {
    return { ...this.config };
  }

  /**
   * 是否正在运行
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  // 间隔模式
  private startIntervalMode(): void {
    const intervalMs = (this.config.intervalSeconds || 60) * 1000;

    logger.info('Starting interval mode scheduler', {
      intervalSeconds: this.config.intervalSeconds,
    });

    this.intervalTimer = setInterval(async () => {
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

      logger.info('Scheduling next fixed execution', {
        nextTime: nextTime.toISOString(),
        delayMs: delay,
      });

      this.fixedTimer = setTimeout(async () => {
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
    const next = new Date(now);

    next.setMinutes(targetMinute);
    next.setSeconds(0);
    next.setMilliseconds(0);

    // 如果目标时间已过，设置为下一个小时
    if (next <= now) {
      next.setHours(next.getHours() + 1);
    }

    return next;
  }
}

export default Scheduler;
