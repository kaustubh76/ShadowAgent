// Aleo Multi-Wallet Provider using aleo-adapters
// Supports: Leo, Puzzle, Fox, Soter wallets

import { FC, ReactNode, useMemo, useCallback, useEffect } from 'react';
import {
  WalletProvider as AleoWalletProvider,
  useWallet,
} from '@demox-labs/aleo-wallet-adapter-react';
import { WalletModalProvider } from '@demox-labs/aleo-wallet-adapter-reactui';
import {
  LeoWalletAdapter,
  PuzzleWalletAdapter,
  FoxWalletAdapter,
  SoterWalletAdapter,
} from 'aleo-adapters';
import {
  DecryptPermission,
  WalletAdapterNetwork,
} from '@demox-labs/aleo-wallet-adapter-base';
import { useWalletStore } from '../stores/walletStore';

// Import wallet adapter styles
import '@demox-labs/aleo-wallet-adapter-reactui/styles.css';

interface WalletProviderProps {
  children: ReactNode;
}

// Inner component to sync wallet state with our store
const WalletStateSync: FC<{ children: ReactNode }> = ({ children }) => {
  const { publicKey, connected } = useWallet();
  const { connect, disconnect } = useWalletStore();

  useEffect(() => {
    if (connected && publicKey) {
      connect(publicKey);
    } else {
      disconnect();
    }
  }, [connected, publicKey, connect, disconnect]);

  return <>{children}</>;
};

export const WalletProvider: FC<WalletProviderProps> = ({ children }) => {
  // Configure all supported Aleo wallets
  const wallets = useMemo(
    () => [
      new LeoWalletAdapter({
        appName: 'ShadowAgent',
      }),
      new PuzzleWalletAdapter({
        appName: 'ShadowAgent',
        programIdPermissions: {
          [WalletAdapterNetwork.TestnetBeta]: ['credits.aleo'],
        },
      }),
      new FoxWalletAdapter({
        appName: 'ShadowAgent',
      }),
      new SoterWalletAdapter({
        appName: 'ShadowAgent',
      }),
    ],
    []
  );

  // Handle wallet errors
  const onError = useCallback((error: Error) => {
    if (import.meta.env.DEV) {
      console.error('Wallet error:', error);
    }
  }, []);

  return (
    <AleoWalletProvider
      wallets={wallets}
      decryptPermission={DecryptPermission.UponRequest}
      network={WalletAdapterNetwork.TestnetBeta}
      autoConnect={true}
      onError={onError}
    >
      <WalletModalProvider>
        <WalletStateSync>{children}</WalletStateSync>
      </WalletModalProvider>
    </AleoWalletProvider>
  );
};

export default WalletProvider;
