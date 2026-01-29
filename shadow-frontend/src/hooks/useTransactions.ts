// Transaction hooks for real on-chain functions
// Uses lazy SDK imports to avoid blocking React mount with WASM loading

import { useState, useCallback } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { Transaction, WalletAdapterNetwork } from '@demox-labs/aleo-wallet-adapter-base';
import { useSDKStore } from '../stores/sdkStore';

// Test transaction amounts: 0.01 credits = 10,000 microcredits
const TEST_AMOUNT = 10_000;
const TEST_FEE = 10_000;

// Inline credits formatter to avoid SDK import
const formatCredits = (microcredits: number): string => {
  return (microcredits / 1_000_000).toFixed(2);
};

interface TransactionResult {
  success: boolean;
  txId?: string;
  error?: string;
}

/**
 * Hook for creating escrow transactions
 * Uses SDK's real transferPublic for on-chain transfers
 */
export function useEscrowTransaction() {
  const { publicKey, requestTransaction } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const createEscrow = useCallback(async (
    agentAddress: string,
    amount: number = TEST_AMOUNT,
    _jobDescription: string = 'service-request'
  ): Promise<TransactionResult> => {
    if (!publicKey) {
      return { success: false, error: 'Wallet not connected' };
    }

    setIsLoading(true);
    setStatus('Creating escrow...');

    try {
      // Lazy import SDK for balance check
      setStatus('Checking balance...');
      const { getBalance } = await import('@shadowagent/sdk');
      const balance = await getBalance(publicKey);

      if (balance < amount + TEST_FEE) {
        return {
          success: false,
          error: `Insufficient balance: have ${formatCredits(balance)}, need ${formatCredits(amount + TEST_FEE)}`,
        };
      }

      // Use Leo Wallet for transaction signing
      if (requestTransaction) {
        setStatus('Building transaction...');

        // Build transfer_public transaction for credits.aleo
        const transaction = Transaction.createTransaction(
          publicKey,
          WalletAdapterNetwork.TestnetBeta,
          'credits.aleo',
          'transfer_public',
          [agentAddress, `${amount}u64`],
          TEST_FEE
        );

        setStatus('Waiting for wallet approval...');
        const txId = await requestTransaction(transaction);

        if (txId) {
          setStatus('Transaction submitted! Waiting for confirmation...');

          // Lazy import for waitForTransaction
          const { waitForTransaction } = await import('@shadowagent/sdk');
          const confirmation = await waitForTransaction(txId, 12, 5000);

          if (confirmation.confirmed) {
            setStatus('Escrow confirmed!');
            return { success: true, txId };
          } else {
            setStatus('Transaction submitted (confirmation pending)');
            return { success: true, txId, error: confirmation.error };
          }
        }
      }

      return { success: false, error: 'Transaction not submitted' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Escrow creation failed';
      setStatus(null);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, requestTransaction]);

  return { createEscrow, isLoading, status, setStatus };
}

/**
 * Hook for submitting ratings
 * Uses SDK client for rating submission with credit burn
 */
export function useRatingTransaction() {
  const { publicKey } = useWallet();
  const { getClient } = useSDKStore();
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const submitRating = useCallback(async (
    agentAddress: string,
    rating: number, // 1-5 stars
    jobHash: string,
    paymentAmount: number = TEST_AMOUNT
  ): Promise<TransactionResult> => {
    if (!publicKey) {
      return { success: false, error: 'Wallet not connected' };
    }

    if (rating < 1 || rating > 5) {
      return { success: false, error: 'Rating must be between 1 and 5 stars' };
    }

    setIsLoading(true);
    setStatus('Submitting rating...');

    try {
      // Use SDK client for rating submission
      const client = getClient();
      const result = await client.submitRating(agentAddress, jobHash, rating, paymentAmount);

      if (result.success) {
        setStatus('Rating submitted!');
        return { success: true, txId: result.txId };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Rating submission failed';
      setStatus(null);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, getClient]);

  return { submitRating, isLoading, status, setStatus };
}

/**
 * Hook for checking account balance
 * Uses SDK's real getBalance function (lazy loaded)
 */
export function useBalanceCheck() {
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);

  const checkBalance = useCallback(async (): Promise<number> => {
    if (!publicKey) return 0;

    setIsLoading(true);
    try {
      const { getBalance } = await import('@shadowagent/sdk');
      const bal = await getBalance(publicKey);
      setBalance(bal);
      return bal;
    } catch {
      return 0;
    } finally {
      setIsLoading(false);
    }
  }, [publicKey]);

  const formattedBalance = formatCredits(balance);

  return { balance, formattedBalance, checkBalance, isLoading };
}

/**
 * Hook for generating reputation proofs
 * Uses SDK's createReputationProof for real ZK proofs (lazy loaded)
 */
export function useReputationProof() {
  const { publicKey } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const generateProof = useCallback(async (
    proofType: 'tier' | 'jobs' | 'rating',
    reputation: {
      totalJobs: number;
      totalRatingPoints: number;
      totalRevenue: number;
      tier: number;
    },
    privateKey?: string
  ): Promise<{ success: boolean; proof?: string; error?: string }> => {
    if (!publicKey) {
      return { success: false, error: 'Wallet not connected' };
    }

    setIsLoading(true);
    setStatus(`Generating ${proofType} proof...`);

    try {
      // Lazy import SDK enums
      const { ProofType } = await import('@shadowagent/sdk');

      // Map proof type to SDK enum
      const proofTypeMap: Record<string, number> = {
        tier: ProofType.Tier,
        jobs: ProofType.Jobs,
        rating: ProofType.Rating,
      };

      // Get threshold based on proof type
      const thresholds: Record<string, number> = {
        tier: reputation.tier,
        jobs: reputation.totalJobs,
        rating: reputation.totalRatingPoints,
      };

      if (privateKey) {
        // Lazy import for createReputationProof
        const { createReputationProof } = await import('@shadowagent/sdk');

        // Generate real ZK proof with SDK
        const proof = await createReputationProof(
          proofTypeMap[proofType],
          thresholds[proofType],
          reputation,
          privateKey
        );

        setStatus('Proof generated!');
        return { success: true, proof: JSON.stringify(proof, null, 2) };
      } else {
        // Generate demo proof without private key
        const demoProof = {
          proof_type: proofTypeMap[proofType],
          threshold: thresholds[proofType],
          proof: `demo_proof_${Date.now()}`,
          tier: reputation.tier,
          prover: publicKey,
          timestamp: Date.now(),
        };

        setStatus('Demo proof generated (no private key)');
        return { success: true, proof: JSON.stringify(demoProof, null, 2) };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Proof generation failed';
      setStatus(null);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [publicKey]);

  return { generateProof, isLoading, status, setStatus };
}

/**
 * Hook for getting current block height (lazy loaded)
 */
export function useBlockHeight() {
  const [blockHeight, setBlockHeight] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchBlockHeight = useCallback(async (): Promise<number> => {
    setIsLoading(true);
    try {
      const { getBlockHeight } = await import('@shadowagent/sdk');
      const height = await getBlockHeight();
      setBlockHeight(height);
      return height;
    } catch {
      return 0;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { blockHeight, fetchBlockHeight, isLoading };
}
