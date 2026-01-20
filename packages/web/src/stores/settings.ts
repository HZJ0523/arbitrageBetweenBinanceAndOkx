import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { MonitorConfig } from '../types';

// 存储版本号 - 数据结构变更时递增
const STORAGE_VERSION = 2;

interface SettingsState {
  // 存储版本
  _version: number;

  // API 配置
  binanceApiKey: string;
  binanceApiSecret: string;
  okxApiKey: string;
  okxApiSecret: string;
  okxPassphrase: string;

  // 代理配置
  proxyUrl: string;

  // 自动监控配置
  autoMonitorEnabled: boolean;
  autoMonitorMode: 'interval' | 'fixed';
  intervalSeconds: number;
  fixedMinute: number;
  fixedSecond: number;

  // Actions
  setApiConfig: (config: Partial<{
    binanceApiKey: string;
    binanceApiSecret: string;
    okxApiKey: string;
    okxApiSecret: string;
    okxPassphrase: string;
  }>) => void;
  setProxyUrl: (url: string) => void;
  setAutoMonitor: (config: Partial<{
    enabled: boolean;
    mode: 'interval' | 'fixed';
    intervalSeconds: number;
    fixedMinute: number;
    fixedSecond: number;
  }>) => void;
  getMonitorConfig: () => MonitorConfig;
}

// 默认状态
const defaultState = {
  _version: STORAGE_VERSION,
  binanceApiKey: '',
  binanceApiSecret: '',
  okxApiKey: '',
  okxApiSecret: '',
  okxPassphrase: '',
  proxyUrl: '',
  autoMonitorEnabled: false,
  autoMonitorMode: 'interval' as const,
  intervalSeconds: 60,
  fixedMinute: 0,
  fixedSecond: 0,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaultState,

      setApiConfig: (config) => set(config),

      setProxyUrl: (url) => set({ proxyUrl: url }),

      setAutoMonitor: (config) =>
        set((state) => ({
          autoMonitorEnabled: config.enabled ?? state.autoMonitorEnabled,
          autoMonitorMode: config.mode ?? state.autoMonitorMode,
          intervalSeconds: config.intervalSeconds ?? state.intervalSeconds,
          fixedMinute: config.fixedMinute ?? state.fixedMinute,
          fixedSecond: config.fixedSecond ?? state.fixedSecond,
        })),

      getMonitorConfig: (): MonitorConfig => {
        const state = get();
        return {
          binanceApiKey: state.binanceApiKey || undefined,
          binanceApiSecret: state.binanceApiSecret || undefined,
          okxApiKey: state.okxApiKey || undefined,
          okxApiSecret: state.okxApiSecret || undefined,
          okxPassphrase: state.okxPassphrase || undefined,
          proxyUrl: state.proxyUrl || undefined,
          autoMonitor: {
            enabled: state.autoMonitorEnabled,
            mode: state.autoMonitorMode,
            intervalSeconds: state.intervalSeconds,
            fixedMinute: state.fixedMinute,
            fixedSecond: state.fixedSecond,
          },
        };
      },
    }),
    {
      name: 'crypto-monitor-settings',
      storage: createJSONStorage(() => localStorage),
      // 版本迁移处理
      migrate: (persistedState, _version) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state = persistedState as any;

        // 如果版本不匹配，重置为默认值但保留 API 配置
        if (state._version !== STORAGE_VERSION) {
          console.log(`Settings storage version migrated from ${state._version} to ${STORAGE_VERSION}`);
          return {
            ...defaultState,
            // 保留用户的 API 配置
            binanceApiKey: state.binanceApiKey || '',
            binanceApiSecret: state.binanceApiSecret || '',
            okxApiKey: state.okxApiKey || '',
            okxApiSecret: state.okxApiSecret || '',
            okxPassphrase: state.okxPassphrase || '',
            proxyUrl: state.proxyUrl || '',
          };
        }

        return state;
      },
      version: STORAGE_VERSION,
    }
  )
);

export default useSettingsStore;
