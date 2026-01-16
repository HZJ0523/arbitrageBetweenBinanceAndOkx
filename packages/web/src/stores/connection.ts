import { create } from 'zustand';
import type { ConnectionStatus, LogMessage } from '../types';

// 最大保留日志数量
const MAX_LOGS = 10;

interface ConnectionState extends ConnectionStatus {
  // 日志
  logs: LogMessage[];

  // Actions
  setConnected: (isConnected: boolean) => void;
  setStatus: (status: Partial<ConnectionStatus>) => void;
  addLog: (log: LogMessage) => void;
  clearLogs: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  isConnected: false,
  isMonitoring: false,
  isRefreshing: false,
  nextUpdateAt: null,
  lastError: null,
  logs: [],

  setConnected: (isConnected) => set({ isConnected }),

  setStatus: (status) => set(status),

  addLog: (log) =>
    set((state) => {
      const newLogs = [log, ...state.logs].slice(0, MAX_LOGS);
      return { logs: newLogs };
    }),

  clearLogs: () => set({ logs: [] }),
}));

export default useConnectionStore;
