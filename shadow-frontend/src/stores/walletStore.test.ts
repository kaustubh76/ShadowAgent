import { describe, it, expect, beforeEach } from 'vitest';
import { useWalletStore, formatAddress, formatBalance } from './walletStore';

describe('walletStore', () => {
  beforeEach(() => {
    useWalletStore.setState({
      connected: false,
      address: null,
      balance: 0,
      network: 'testnet',
    });
  });

  describe('connect', () => {
    it('sets connected and address', () => {
      useWalletStore.getState().connect('aleo1abc123def456');
      const state = useWalletStore.getState();
      expect(state.connected).toBe(true);
      expect(state.address).toBe('aleo1abc123def456');
    });
  });

  describe('disconnect', () => {
    it('clears connection state', () => {
      useWalletStore.getState().connect('aleo1abc123def456');
      useWalletStore.getState().setBalance(5000000);
      useWalletStore.getState().disconnect();
      const state = useWalletStore.getState();
      expect(state.connected).toBe(false);
      expect(state.address).toBeNull();
      expect(state.balance).toBe(0);
    });
  });

  describe('setBalance', () => {
    it('updates balance', () => {
      useWalletStore.getState().setBalance(12345678);
      expect(useWalletStore.getState().balance).toBe(12345678);
    });
  });

  describe('setNetwork', () => {
    it('updates network', () => {
      useWalletStore.getState().setNetwork('mainnet');
      expect(useWalletStore.getState().network).toBe('mainnet');
    });

    it('can switch back to testnet', () => {
      useWalletStore.getState().setNetwork('mainnet');
      useWalletStore.getState().setNetwork('testnet');
      expect(useWalletStore.getState().network).toBe('testnet');
    });
  });
});

describe('formatAddress', () => {
  it('returns empty string for null', () => {
    expect(formatAddress(null)).toBe('');
  });

  it('returns short address as-is', () => {
    expect(formatAddress('aleo1short')).toBe('aleo1short');
  });

  it('truncates long address', () => {
    const addr = 'aleo1abcdefghijklmnopqrstuvwxyz1234567890abcdefgh';
    const formatted = formatAddress(addr);
    expect(formatted).toMatch(/^aleo1abc\.\.\.defgh$/);
    expect(formatted.length).toBeLessThan(addr.length);
  });

  it('returns address at boundary (16 chars) as-is', () => {
    const addr = 'aleo1abcdefghijk'; // exactly 16
    expect(formatAddress(addr.slice(0, 16))).toBe(addr.slice(0, 16));
  });
});

describe('formatBalance', () => {
  it('converts microcredits to credits', () => {
    expect(formatBalance(5_000_000)).toBe('5.00');
    expect(formatBalance(1_234_567)).toBe('1.23');
    expect(formatBalance(0)).toBe('0.00');
  });
});
