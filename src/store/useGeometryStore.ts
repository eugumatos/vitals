import { create } from 'zustand';

export interface ScreenGeometry {
  screenWidth: number;
  menuBarHeight: number;
  hasNotch: boolean;
  notchWidth: number;
  notchLeft: number;
  notchRight: number;
  loaded: boolean;
}

export const useGeometryStore = create<ScreenGeometry & { setGeometry: (g: Omit<ScreenGeometry, 'loaded'>) => void }>((set) => ({
  screenWidth: 1710,
  menuBarHeight: 34,
  hasNotch: true,
  notchWidth: 204,
  notchLeft: 753,
  notchRight: 957,
  loaded: false,
  setGeometry: (g) => set({ ...g, loaded: true }),
}));
