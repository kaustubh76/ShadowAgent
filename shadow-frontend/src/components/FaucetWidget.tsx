// In-app faucet assistance widget
// Provides one-click address copy, faucet link, and auto-detects incoming credits

import { useState, useEffect, useRef, useCallback } from 'react';
import { ExternalLink, Copy, Check, Loader2, Wallet } from 'lucide-react';
import { useShieldWallet } from '../providers/WalletProvider';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { useToast } from '../contexts/ToastContext';

const FAUCET_URL = 'https://faucet.aleo.org/';
const RPC_URL = 'https://api.explorer.provable.com/v1/testnet';

interface FaucetWidgetProps {
  /** 'inline' for dashboard cards, 'compact' for header popover */
  variant?: 'inline' | 'compact';
}

export default function FaucetWidget({ variant = 'inline' }: FaucetWidgetProps) {
  const { publicKey, connected } = useShieldWallet();
  const { copied, copy } = useCopyToClipboard();
  const toast = useToast();
  const [balance, setBalance] = useState<number>(0);
  const [waiting, setWaiting] = useState(false);
  const prevBalance = useRef<number>(0);

  // Fetch balance from RPC
  const fetchBalance = useCallback(async () => {
    if (!connected || !publicKey) return 0;
    try {
      const response = await fetch(
        `${RPC_URL}/program/credits.aleo/mapping/account/${publicKey}`
      );
      if (response.ok) {
        const text = await response.text();
        const match = text.match(/(\d+)u64/);
        return match ? parseInt(match[1], 10) : 0;
      }
    } catch {
      // RPC unavailable
    }
    return 0;
  }, [connected, publicKey]);

  // Initial balance fetch
  useEffect(() => {
    if (!connected || !publicKey) return;
    fetchBalance().then((bal) => {
      setBalance(bal);
      prevBalance.current = bal;
    });
  }, [connected, publicKey, fetchBalance]);

  // Poll every 10s while waiting for faucet credits
  useEffect(() => {
    if (!waiting || !connected || !publicKey) return;
    const interval = setInterval(async () => {
      const newBal = await fetchBalance();
      if (newBal > prevBalance.current) {
        const received = newBal - prevBalance.current;
        setBalance(newBal);
        prevBalance.current = newBal;
        setWaiting(false);
        toast.success(
          `Credits received! +${(received / 1_000_000).toFixed(2)} ALEO`
        );
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [waiting, connected, publicKey, fetchBalance, toast]);

  const formatBalance = (microcredits: number) =>
    (microcredits / 1_000_000).toFixed(2);

  const handleCopyAddress = () => {
    if (publicKey) {
      copy(publicKey);
    }
  };

  const handleOpenFaucet = () => {
    if (publicKey) {
      copy(publicKey);
      toast.success('Address copied — paste it in the faucet form');
    }
    prevBalance.current = balance;
    setWaiting(true);
    window.open(FAUCET_URL, '_blank', 'noopener,noreferrer');
  };

  if (!connected || !publicKey) return null;

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleOpenFaucet}
          className="text-[10px] text-shadow-400 hover:text-shadow-300 transition-colors uppercase tracking-wider flex items-center gap-1"
        >
          {waiting ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Waiting for credits...
            </>
          ) : (
            'Get Testnet Credits'
          )}
        </button>
      </div>
    );
  }

  // Inline variant (for dashboards)
  return (
    <div className="bg-surface-1/50 border border-white/[0.06] rounded-xl p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-7 h-7 rounded-lg bg-shadow-600/15 flex items-center justify-center">
          <Wallet className="w-3.5 h-3.5 text-shadow-400" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white">Get Testnet Credits</h4>
          <p className="text-[10px] text-gray-500">From the Aleo Faucet</p>
        </div>
      </div>

      {/* Current balance */}
      <div className="flex items-center justify-between bg-white/[0.02] rounded-lg px-3 py-2 mb-3">
        <span className="text-xs text-gray-400">Current Balance</span>
        <span className="text-sm font-semibold text-white">
          {formatBalance(balance)} <span className="text-gray-500 text-xs font-normal">ALEO</span>
        </span>
      </div>

      {/* Wallet address with copy */}
      <div className="flex items-center gap-2 bg-white/[0.02] rounded-lg px-3 py-2 mb-3">
        <span className="text-xs text-gray-400 font-mono truncate flex-1">
          {publicKey.slice(0, 12)}...{publicKey.slice(-8)}
        </span>
        <button
          onClick={handleCopyAddress}
          className="text-gray-500 hover:text-white transition-colors p-1 rounded"
          title="Copy address"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleOpenFaucet}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-shadow-600/20 text-shadow-300 border border-shadow-500/30 text-xs font-medium hover:bg-shadow-600/30 transition-all"
        >
          {waiting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Waiting for credits...
            </>
          ) : (
            <>
              <ExternalLink className="w-3.5 h-3.5" />
              Open Faucet
            </>
          )}
        </button>
      </div>

      {waiting && (
        <p className="text-[10px] text-gray-500 mt-2 text-center">
          Your address was copied. Paste it in the faucet form. Balance will update automatically.
        </p>
      )}
    </div>
  );
}
