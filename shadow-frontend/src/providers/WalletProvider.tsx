// Shield Wallet Provider - Direct key-based Aleo wallet integration
// Uses @provablehq/sdk for address derivation and transaction signing

import { FC, ReactNode, useEffect, useState, createContext, useContext, useCallback, useMemo } from 'react';
import { useWalletStore } from '../stores/walletStore';
import { ALEO_RPC_URL, ALEO_RPC_TESTNET_URL } from '../services/aleo';

// Shield Wallet context types
interface ShieldWalletContextType {
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
  viewKey: string | null;
  privateKey: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (programId: string, functionName: string, inputs: string[], fee: number) => Promise<string>;
  getRecords: (programId: string) => Promise<any[]>;
}

const ShieldWalletContext = createContext<ShieldWalletContextType>({
  publicKey: null,
  connected: false,
  connecting: false,
  viewKey: null,
  privateKey: null,
  connect: async () => {},
  disconnect: async () => {},
  signTransaction: async () => '',
  getRecords: async () => [],
});

export const useShieldWallet = () => useContext(ShieldWalletContext);

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider: FC<WalletProviderProps> = ({ children }) => {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const { connect: storeConnect, disconnect: storeDisconnect } = useWalletStore();

  const privateKey = import.meta.env.VITE_SHIELD_WALLET_PRIVATE_KEY;
  const viewKey = import.meta.env.VITE_SHIELD_WALLET_VIEW_KEY || null;

  // Derive address from private key on mount
  const connect = useCallback(async () => {
    if (!privateKey) {
      console.error('Shield Wallet: No private key configured. Set VITE_SHIELD_WALLET_PRIVATE_KEY in .env');
      return;
    }

    setConnecting(true);
    try {
      const { Account } = await import('@provablehq/sdk');
      const account = new Account({ privateKey });
      const address = account.address().to_string();

      setPublicKey(address);
      setConnected(true);
      storeConnect(address);
    } catch (error) {
      console.error('Shield Wallet: Failed to derive address:', error);
    } finally {
      setConnecting(false);
    }
  }, [privateKey, storeConnect]);

  const disconnect = useCallback(async () => {
    setPublicKey(null);
    setConnected(false);
    storeDisconnect();
  }, [storeDisconnect]);

  // Sign and submit a transaction using ProgramManager.execute()
  const signTransaction = useCallback(async (
    programId: string,
    functionName: string,
    inputs: string[],
    fee: number
  ): Promise<string> => {
    if (!privateKey) throw new Error('Shield Wallet: No private key configured');

    const {
      Account,
      PrivateKey: PrivateKeyClass,
      ProgramManager,
      AleoNetworkClient,
      AleoKeyProvider,
      NetworkRecordProvider,
    } = await import('@provablehq/sdk');

    const account = new Account({ privateKey });
    const privKey = PrivateKeyClass.from_string(privateKey);
    const networkClient = new AleoNetworkClient(ALEO_RPC_URL);
    const keyProvider = new AleoKeyProvider();
    keyProvider.useCache(true);
    const recordProvider = new NetworkRecordProvider(account, networkClient);

    const programManager = new ProgramManager(ALEO_RPC_URL, keyProvider, recordProvider);
    programManager.setAccount(account);

    const txId = await programManager.execute({
      programName: programId,
      functionName,
      inputs,
      priorityFee: fee / 1_000_000,
      privateFee: false,
      privateKey: privKey,
    });

    return txId;
  }, [privateKey]);

  // Fetch records for a program via RPC
  const getRecords = useCallback(async (programId: string): Promise<any[]> => {
    if (!publicKey) return [];

    try {
      const response = await fetch(
        `${ALEO_RPC_TESTNET_URL}/program/${programId}/mapping/account/${publicKey}`
      );
      if (!response.ok) return [];
      const data = await response.text();
      return data ? [{ data, owner: publicKey }] : [];
    } catch {
      return [];
    }
  }, [publicKey]);

  // Auto-connect on mount if private key is available
  useEffect(() => {
    if (privateKey && !connected && !connecting) {
      connect();
    }
  }, [privateKey, connected, connecting, connect]);

  const contextValue = useMemo(() => ({
    publicKey,
    connected,
    connecting,
    viewKey,
    privateKey: privateKey || null,
    connect,
    disconnect,
    signTransaction,
    getRecords,
  }), [publicKey, connected, connecting, viewKey, privateKey, connect, disconnect, signTransaction, getRecords]);

  return (
    <ShieldWalletContext.Provider value={contextValue}>
      {children}
    </ShieldWalletContext.Provider>
  );
};

export default WalletProvider;
