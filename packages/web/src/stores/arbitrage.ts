import { create } from 'zustand';
import type { FundingRateArbitrageItem} from '../types';

interface ArbitrageState {
  // 资金费率套利数据
  fundingRateArbitrage: FundingRateArbitrageItem[];
  fundingRateUpdatedAt: string | null;


  // Actions
  setFundingRateArbitrage: (data: FundingRateArbitrageItem[], updatedAt: string) => void;
  clearAll: () => void;
}

export const useArbitrageStore = create<ArbitrageState>((set) => ({
  fundingRateArbitrage: [],
  fundingRateUpdatedAt: null,

  setFundingRateArbitrage: (data, updatedAt) =>
    set({ fundingRateArbitrage: data, fundingRateUpdatedAt: updatedAt }),

  clearAll: () =>
    set({
      fundingRateArbitrage: [],
      fundingRateUpdatedAt: null,
    }),
}));

export default useArbitrageStore;
