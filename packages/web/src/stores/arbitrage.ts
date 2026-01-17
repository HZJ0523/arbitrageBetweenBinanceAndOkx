import { create } from 'zustand';
import type { FundingRateArbitrageItem, AccountInfo } from '../types';

interface ArbitrageState {
  // 资金费率套利数据
  fundingRateArbitrage: FundingRateArbitrageItem[];
  fundingRateUpdatedAt: string | null;

  // 账户信息 (合并自 accountInfo store)
  accountInfo: AccountInfo | null;

  // Actions
  setFundingRateArbitrage: (data: FundingRateArbitrageItem[], updatedAt: string) => void;
  setAccountInfo: (info: AccountInfo) => void;
  clearAccountInfo: () => void;
  clearAll: () => void;
}

export const useArbitrageStore = create<ArbitrageState>((set) => ({
  fundingRateArbitrage: [],
  fundingRateUpdatedAt: null,
  accountInfo: null,

  setFundingRateArbitrage: (data, updatedAt) =>
    set({ fundingRateArbitrage: data, fundingRateUpdatedAt: updatedAt }),

  setAccountInfo: (info) => set({ accountInfo: info }),

  clearAccountInfo: () => set({ accountInfo: null }),

  clearAll: () =>
    set({
      fundingRateArbitrage: [],
      fundingRateUpdatedAt: null,
      accountInfo: null,
    }),
}));

export default useArbitrageStore;
