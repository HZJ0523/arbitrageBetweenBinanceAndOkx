import { create } from 'zustand';
import type { FundingRateArbitrageItem, AccountInfo, ActiveArbitragePosition } from '../types';

interface ArbitrageState {
  // 资金费率套利数据
  fundingRateArbitrage: FundingRateArbitrageItem[];
  fundingRateUpdatedAt: string | null;

  // 账户信息 (合并自 accountInfo store)
  accountInfo: AccountInfo | null;

  // 活跃套利仓位
  activePositions: ActiveArbitragePosition[];
  activePositionsUpdatedAt: string | null;

  // 开仓中状态
  isOpening: boolean;

  // 平仓中状态 (按仓位ID) - 使用 Record 替代 Set 优化重渲染
  closingPositionIds: Record<string, boolean>;

  // Actions
  setFundingRateArbitrage: (data: FundingRateArbitrageItem[], updatedAt: string) => void;
  setAccountInfo: (info: AccountInfo) => void;
  setActivePositions: (positions: ActiveArbitragePosition[], updatedAt: string) => void;
  setIsOpening: (isOpening: boolean) => void;
  addClosingPositionId: (positionId: string) => void;
  removeClosingPositionId: (positionId: string) => void;
  isClosingPosition: (positionId: string) => boolean;
}

export const useArbitrageStore = create<ArbitrageState>((set, get) => ({
  fundingRateArbitrage: [],
  fundingRateUpdatedAt: null,
  accountInfo: null,
  activePositions: [],
  activePositionsUpdatedAt: null,
  isOpening: false,
  closingPositionIds: {},

  setFundingRateArbitrage: (data, updatedAt) =>
    set({ fundingRateArbitrage: data, fundingRateUpdatedAt: updatedAt }),

  setAccountInfo: (info) => set({ accountInfo: info }),

  setActivePositions: (positions, updatedAt) =>
    set({ activePositions: positions, activePositionsUpdatedAt: updatedAt }),

  setIsOpening: (isOpening) => set({ isOpening }),

  addClosingPositionId: (positionId) =>
    set((state) => ({
      closingPositionIds: { ...state.closingPositionIds, [positionId]: true },
    })),

  removeClosingPositionId: (positionId) =>
    set((state) => {
      const { [positionId]: _, ...rest } = state.closingPositionIds;
      return { closingPositionIds: rest };
    }),

  isClosingPosition: (positionId) => !!get().closingPositionIds[positionId],
}));

export default useArbitrageStore;
