// Wallet Store - Zustand state management for wallet connection

import { create } from 'zustand';

interface WalletState {
  connected: boolean;
  address: string | null;
  balance: number;
  network: 'testnet' | 'mainnet';

  // Actions
  connect: (address: string) => void;
  disconnect: () => void;
  setBalance: (balance: number) => void;
  setNetwork: (network: 'testnet' | 'mainnet') => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  connected: false,
  address: null,
  balance: 0,
  network: 'testnet',

  connect: (address: string) =>
    set({
      connected: true,
      address,
    }),

  disconnect: () =>
    set({
      connected: false,
      address: null,
      balance: 0,
    }),

  setBalance: (balance: number) => set({ balance }),

  setNetwork: (network: 'testnet' | 'mainnet') => set({ network }),
}));

// Helper to format address for display
export function formatAddress(address: string | null): string {
  if (!address) return '';
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

// Helper to format balance
export function formatBalance(balance: number): string {
  return (balance / 1_000_000).toFixed(2);
}
