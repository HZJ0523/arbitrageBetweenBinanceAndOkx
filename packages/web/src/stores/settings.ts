import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MonitorConfig } from '../types';

interface SettingsState {
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
  }>) => void;
  getMonitorConfig: () => MonitorConfig;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // 默认值
      binanceApiKey: '',
      binanceApiSecret: '',
      okxApiKey: '',
      okxApiSecret: '',
      okxPassphrase: '',
      proxyUrl: '',
      autoMonitorEnabled: false,
      autoMonitorMode: 'interval',
      intervalSeconds: 60,
      fixedMinute: 0,

      setApiConfig: (config) => set(config),

      setProxyUrl: (url) => set({ proxyUrl: url }),

      setAutoMonitor: (config) =>
        set((state) => ({
          autoMonitorEnabled: config.enabled ?? state.autoMonitorEnabled,
          autoMonitorMode: config.mode ?? state.autoMonitorMode,
          intervalSeconds: config.intervalSeconds ?? state.intervalSeconds,
          fixedMinute: config.fixedMinute ?? state.fixedMinute,
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
          },
        };
      },
    }),
    {
      name: 'crypto-monitor-settings',
    }
  )
);

export default useSettingsStore;
