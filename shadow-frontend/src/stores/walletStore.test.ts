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

    it('overwrites previous address on reconnect', () => {
      useWalletStore.getState().connect('aleo1first');
      useWalletStore.getState().connect('aleo1second');
      expect(useWalletStore.getState().address).toBe('aleo1second');
    });

    it('preserves balance when reconnecting', () => {
      useWalletStore.getState().connect('aleo1test');
      useWalletStore.getState().setBalance(5000000);
      useWalletStore.getState().connect('aleo1other');
      expect(useWalletStore.getState().balance).toBe(5000000);
    });

    it('preserves network when connecting', () => {
      useWalletStore.getState().setNetwork('mainnet');
      useWalletStore.getState().connect('aleo1test');
      expect(useWalletStore.getState().network).toBe('mainnet');
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

    it('preserves network after disconnect', () => {
      useWalletStore.getState().setNetwork('mainnet');
      useWalletStore.getState().connect('aleo1test');
      useWalletStore.getState().disconnect();
      expect(useWalletStore.getState().network).toBe('mainnet');
    });

    it('is safe to call when already disconnected', () => {
      useWalletStore.getState().disconnect();
      const state = useWalletStore.getState();
      expect(state.connected).toBe(false);
      expect(state.address).toBeNull();
    });
  });

  describe('setBalance', () => {
    it('updates balance', () => {
      useWalletStore.getState().setBalance(12345678);
      expect(useWalletStore.getState().balance).toBe(12345678);
    });

    it('handles zero balance', () => {
      useWalletStore.getState().setBalance(0);
      expect(useWalletStore.getState().balance).toBe(0);
    });

    it('handles large balance values', () => {
      useWalletStore.getState().setBalance(999_999_999_999);
      expect(useWalletStore.getState().balance).toBe(999_999_999_999);
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

    it('preserves connected state on network switch', () => {
      useWalletStore.getState().connect('aleo1test');
      useWalletStore.getState().setNetwork('mainnet');
      expect(useWalletStore.getState().connected).toBe(true);
      expect(useWalletStore.getState().address).toBe('aleo1test');
    });
  });

  describe('full lifecycle', () => {
    it('connect -> set balance -> switch network -> disconnect -> reconnect', () => {
      useWalletStore.getState().connect('aleo1lifecycle');
      useWalletStore.getState().setBalance(10_000_000);
      useWalletStore.getState().setNetwork('mainnet');

      let state = useWalletStore.getState();
      expect(state.connected).toBe(true);
      expect(state.balance).toBe(10_000_000);
      expect(state.network).toBe('mainnet');

      useWalletStore.getState().disconnect();
      state = useWalletStore.getState();
      expect(state.connected).toBe(false);
      expect(state.balance).toBe(0);
      expect(state.network).toBe('mainnet');

      useWalletStore.getState().connect('aleo1newwallet');
      state = useWalletStore.getState();
      expect(state.connected).toBe(true);
      expect(state.address).toBe('aleo1newwallet');
      expect(state.balance).toBe(0);
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
    expect(formatted).toBe('aleo1abc...cdefgh');
    expect(formatted.length).toBeLessThan(addr.length);
  });

  it('returns address at boundary (16 chars) as-is', () => {
    const addr = 'aleo1abcdefghijk';
    expect(formatAddress(addr.slice(0, 16))).toBe(addr.slice(0, 16));
  });

  it('truncates address at 17 chars', () => {
    const addr = 'aleo1abcdefghijkl';
    expect(addr.length).toBe(17);
    const formatted = formatAddress(addr);
    expect(formatted).toContain('...');
  });

  it('returns empty string for empty string input', () => {
    expect(formatAddress('')).toBe('');
  });
});

describe('formatBalance', () => {
  it('converts microcredits to credits', () => {
    expect(formatBalance(5_000_000)).toBe('5.00');
    expect(formatBalance(1_234_567)).toBe('1.23');
    expect(formatBalance(0)).toBe('0.00');
  });

  it('handles sub-credit amounts', () => {
    expect(formatBalance(500_000)).toBe('0.50');
    expect(formatBalance(10_000)).toBe('0.01');
  });

  it('handles large amounts', () => {
    expect(formatBalance(1_000_000_000)).toBe('1000.00');
  });
});
