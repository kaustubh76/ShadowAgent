// Real Leo Wallet Connection Component

import { useState, useEffect, useCallback } from 'react';
import { Wallet, LogOut, Copy, Check, ExternalLink } from 'lucide-react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { WalletMultiButton } from '@demox-labs/aleo-wallet-adapter-reactui';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { ALEO_EXPLORER_URL } from '../constants/ui';
import { useToast } from '../contexts/ToastContext';

export default function ConnectWallet() {
  const { publicKey, connected, disconnect, requestRecords } = useWallet();
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

  // Fetch balance from records
  const fetchBalance = useCallback(async () => {
    if (!connected || !publicKey || !requestRecords) return;

    setIsLoadingBalance(true);
    try {
      // Request credits.aleo records to get balance
      const records = await requestRecords('credits.aleo');

      // Sum up unspent credits from records
      const totalBalance = records.reduce((sum, record) => {
        // Parse microcredits from record data
        const microcredits = record.data?.microcredits;
        if (microcredits) {
          // Remove 'u64' suffix and parse
          const amount = parseInt(microcredits.replace('u64', ''), 10);
          return sum + (isNaN(amount) ? 0 : amount);
        }
        return sum;
      }, 0);

      setBalance(totalBalance);
    } catch (error) {
      // Silently fail for balance fetching - just use cached balance
      // Only log in development mode
      if (import.meta.env.DEV) {
        console.error('Failed to fetch balance:', error);
      }
    } finally {
      setIsLoadingBalance(false);
    }
  }, [connected, publicKey, requestRecords]);

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

  // If not connected, show the wallet multi-button (handles connection modal)
  if (!connected) {
    return (
      <WalletMultiButton className="btn btn-primary flex items-center gap-2">
        <Wallet className="w-4 h-4" />
        Connect Wallet
      </WalletMultiButton>
    );
  }

  // Connected state
  return (
    <div className="flex items-center gap-3 animate-fade-in">
      {/* Balance */}
      <div className="hidden sm:block text-right">
        <div className={`text-sm font-medium text-white ${!isLoadingBalance ? 'animate-fade-in' : ''}`}>
          {isLoadingBalance ? '...' : formatBalance(balance)} ALEO
        </div>
        <div className="text-xs text-gray-400">Testnet</div>
      </div>

      {/* Address */}
      <div className="flex items-center gap-2 glass px-3 py-2">
        <span className="text-sm font-mono text-gray-300">
          {formatAddress(publicKey)}
        </span>
        <button
          onClick={handleCopyAddress}
          className="text-gray-400 hover:text-white transition-all duration-200"
          aria-label={copied ? "Address copied" : "Copy address to clipboard"}
          title="Copy address"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-400 animate-scale-in" />
          ) : (
            <Copy className="w-4 h-4" />
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
          className="text-gray-400 hover:text-shadow-400 transition-all duration-200 hover:scale-110 p-2"
          title="View on Explorer"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      )}

      {/* Disconnect */}
      <button
        onClick={handleDisconnect}
        className="text-gray-400 hover:text-red-400 transition-all duration-200 hover:scale-110 p-2"
        title="Disconnect wallet"
      >
        <LogOut className="w-5 h-5" />
      </button>
    </div>
  );
}
