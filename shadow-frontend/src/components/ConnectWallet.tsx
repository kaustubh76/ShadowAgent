// Shield Wallet Connection Component

import { useState, useEffect, useCallback } from 'react';
import { LogOut, Copy, Check, ExternalLink, Loader2, Wallet } from 'lucide-react';
import { useShieldWallet } from '../providers/WalletProvider';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { ALEO_EXPLORER_URL } from '../constants/ui';
import { useToast } from '../contexts/ToastContext';

export default function ConnectWallet() {
  const { publicKey, connected, connecting, connect, disconnect } = useShieldWallet();
  const { copied, copy } = useCopyToClipboard();
  const toast = useToast();
  const [balance, setBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  // Format address for display
  const formatAddress = (address: string | null): string => {
    if (!address) return '';
    if (address.length <= 16) return address;
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  // Format balance in credits
  const formatBalance = (microcredits: number): string => {
    return (microcredits / 1_000_000).toFixed(2);
  };

  // Fetch balance from RPC
  const fetchBalance = useCallback(async () => {
    if (!connected || !publicKey) return;

    setIsLoadingBalance(true);
    try {
      const rpcUrl = 'https://api.explorer.provable.com/v1/testnet';
      const response = await fetch(
        `${rpcUrl}/program/credits.aleo/mapping/account/${publicKey}`
      );

      if (response.ok) {
        const balanceText = await response.text();
        const match = balanceText.match(/(\d+)u64/);
        const microcredits = match ? parseInt(match[1], 10) : 0;
        setBalance(microcredits);
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to fetch balance:', error);
      }
    } finally {
      setIsLoadingBalance(false);
    }
  }, [connected, publicKey]);

  // Fetch balance when wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      fetchBalance();
    } else {
      setBalance(0);
    }
  }, [connected, publicKey, fetchBalance]);

  // Copy address to clipboard
  const handleCopyAddress = () => {
    if (publicKey) {
      copy(publicKey);
    }
  };

  // Handle connect
  const handleConnect = async () => {
    try {
      await connect();
    } catch (error) {
      toast.error('Failed to connect Shield Wallet');
      if (import.meta.env.DEV) {
        console.error('Failed to connect:', error);
      }
    }
  };

  // Handle disconnect
  const handleDisconnect = async () => {
    try {
      await disconnect();
      setBalance(0);
    } catch (error) {
      toast.error('Failed to disconnect wallet');
      if (import.meta.env.DEV) {
        console.error('Failed to disconnect:', error);
      }
    }
  };

  // If not connected, show connect button
  if (!connected) {
    return (
      <button
        onClick={handleConnect}
        disabled={connecting}
        className="btn btn-primary flex items-center gap-2"
      >
        {connecting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            <Wallet className="w-4 h-4" />
            Connect Wallet
          </>
        )}
      </button>
    );
  }

  // Connected state
  return (
    <div className="flex items-center gap-2.5 animate-fade-in">
      {/* Balance */}
      <div className="hidden sm:block text-right">
        <div className={`text-sm font-semibold text-white ${!isLoadingBalance ? 'animate-fade-in' : ''}`}>
          {isLoadingBalance ? '...' : formatBalance(balance)} <span className="text-gray-400 font-normal text-xs">ALEO</span>
        </div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Testnet</div>
      </div>

      {/* Divider */}
      <div className="hidden sm:block w-px h-8 bg-white/[0.06]" />

      {/* Address chip */}
      <div className="flex items-center gap-1.5 glass px-3 py-2">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-soft" />
        <span className="text-sm font-mono text-gray-300">
          {formatAddress(publicKey)}
        </span>
        <button
          onClick={handleCopyAddress}
          className="text-gray-500 hover:text-white transition-all duration-300 p-1 rounded-md hover:bg-white/[0.04]"
          aria-label={copied ? "Address copied" : "Copy address to clipboard"}
          title="Copy address"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400 animate-scale-in" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
        {copied && (
          <span className="sr-only" aria-live="polite">Address copied to clipboard</span>
        )}
      </div>

      {/* Explorer link */}
      {publicKey && (
        <a
          href={`${ALEO_EXPLORER_URL}/address/${publicKey}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 hover:text-shadow-400 transition-all duration-300 p-2 rounded-lg hover:bg-white/[0.04]"
          title="View on Explorer"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      )}

      {/* Disconnect */}
      <button
        onClick={handleDisconnect}
        className="text-gray-500 hover:text-red-400 transition-all duration-300 p-2 rounded-lg hover:bg-red-500/[0.06]"
        title="Disconnect wallet"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
}
