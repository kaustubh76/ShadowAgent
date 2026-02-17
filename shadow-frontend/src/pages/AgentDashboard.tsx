// Agent Dashboard with Shield Wallet Integration

import { useState, useEffect, useCallback } from 'react';
import { Shield, FileCheck, AlertCircle, Loader2, Copy, Check, Wallet } from 'lucide-react';
import { useShieldWallet } from '../providers/WalletProvider';
import TierBadge from '../components/TierBadge';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { useToast } from '../contexts/ToastContext';
import { useReputationProof, useBalanceCheck } from '../hooks/useTransactions';
import SkeletonStats from '../components/agent/SkeletonStats';
import ActiveSessionsPanel from '../components/agent/ActiveSessionsPanel';
import RegistrationForm from '../components/agent/RegistrationForm';
import ReputationPanel from '../components/agent/ReputationPanel';
import {
  SHADOW_AGENT_PROGRAM_ID,
  Tier,
  isAddressRegistered,
} from '../services/aleo';
import { getTierName, useAgentStore } from '../stores/agentStore';
import { listSessions } from '../lib/api';

import { FACILITATOR_URL, FACILITATOR_ENABLED } from '../config';

interface AgentReputation {
  totalJobs: number;
  totalRatingPoints: number;
  totalRevenue: number;
  tier: Tier;
}

export default function AgentDashboard() {
  const { publicKey, connected, signTransaction, getRecords } = useShieldWallet();
  const { copied: copiedId, copy: copyAgentId } = useCopyToClipboard();
  const toast = useToast();
  const { generateProof } = useReputationProof();
  const { checkBalance } = useBalanceCheck();

  // State
  const [isRegistered, setIsRegistered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUnregistering, setIsUnregistering] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [reputation, setReputation] = useState<AgentReputation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  // Check registration status on wallet connect
  const checkRegistration = useCallback(async () => {
    if (!connected || !publicKey) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      checkBalance();

      const registered = await isAddressRegistered(publicKey);
      setIsRegistered(registered);

      if (registered) {
        if (FACILITATOR_ENABLED) {
          try {
            const response = await fetch(`${FACILITATOR_URL}/agents/by-address/${publicKey}`);
            if (response.ok) {
              const data = await response.json();
              setAgentId(data.agent_id);
              setReputation({
                totalJobs: data.total_jobs || 0,
                totalRatingPoints: data.total_rating_points || 0,
                totalRevenue: data.total_revenue || 0,
                tier: data.tier || Tier.New,
              });
            } else {
              setAgentId(publicKey.slice(0, 16) + '...');
              setReputation({ totalJobs: 0, totalRatingPoints: 0, totalRevenue: 0, tier: Tier.New });
            }
          } catch {
            setAgentId(publicKey.slice(0, 16) + '...');
            setReputation({ totalJobs: 0, totalRatingPoints: 0, totalRevenue: 0, tier: Tier.New });
          }
        } else {
          setAgentId(publicKey.slice(0, 16) + '...');
          setReputation({ totalJobs: 0, totalRatingPoints: 0, totalRevenue: 0, tier: Tier.New });
        }
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Failed to check registration:', err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [connected, publicKey, checkBalance]);

  useEffect(() => {
    checkRegistration();
  }, [checkRegistration]);

  // Handle unregistration
  const handleUnregister = async () => {
    if (!connected || !publicKey) {
      setError('Shield Wallet not connected');
      return;
    }

    setIsUnregistering(true);
    setError(null);
    setTxStatus('Fetching your agent records...');
    toast.info('Preparing to unregister agent...');

    try {
      const records = await getRecords(SHADOW_AGENT_PROGRAM_ID);
      const reputationRecord = records.find((r: any) => r.data?.total_jobs !== undefined);
      const bondRecord = records.find((r: any) => r.data?.staked_at !== undefined);

      if (!reputationRecord || !bondRecord) {
        throw new Error('Could not find your agent records');
      }

      setTxStatus('Signing unregister transaction with Shield Wallet...');
      toast.info('Signing unregistration with Shield Wallet...');

      const txId = await signTransaction(
        SHADOW_AGENT_PROGRAM_ID,
        'unregister_agent',
        [reputationRecord.ciphertext, bondRecord.ciphertext],
        50000
      );

      setTxStatus(`Unregister transaction submitted: ${txId.slice(0, 16)}...`);
      toast.success('Agent unregistered successfully! Your bond will be returned.');

      setIsRegistered(false);
      setAgentId(null);
      setReputation(null);

      if (FACILITATOR_ENABLED) {
        fetch(`${FACILITATOR_URL}/agents/unregister`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: publicKey, tx_id: txId }),
        }).catch(() => {});
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unregistration failed';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsUnregistering(false);
      setTxStatus(null);
    }
  };

  // Generate reputation proof using SDK
  const handleGenerateProof = async (proofType: 'tier' | 'jobs' | 'rating') => {
    if (!connected || !publicKey) {
      setError('Wallet not connected');
      return;
    }

    if (!reputation) {
      setError('No reputation data available');
      return;
    }

    toast.info(`Creating ${proofType} reputation proof...`);

    try {
      const result = await generateProof(proofType, {
        totalJobs: reputation.totalJobs,
        totalRatingPoints: reputation.totalRatingPoints,
        totalRevenue: reputation.totalRevenue,
        tier: reputation.tier,
      });

      if (result.success && result.proof) {
        await navigator.clipboard.writeText(result.proof);
        setTxStatus('Proof copied to clipboard!');
        toast.success(`${proofType.charAt(0).toUpperCase() + proofType.slice(1)} proof generated and copied to clipboard!`);
        setTimeout(() => setTxStatus(null), 3000);
      } else {
        throw new Error(result.error || 'Proof generation failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Proof generation failed';
      setError(errorMessage);
      toast.error(errorMessage);
      setTxStatus(null);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="skeleton w-52 h-8" />
            <div className="skeleton w-36 h-4" />
          </div>
          <div className="skeleton w-20 h-8 rounded-full" />
        </div>
        <SkeletonStats />
        <div className="grid md:grid-cols-2 gap-5">
          <div className="card space-y-3">
            <div className="skeleton w-52 h-5" />
            <div className="skeleton w-full h-4" />
            <div className="skeleton w-full h-11 rounded-xl" />
          </div>
          <div className="card space-y-3">
            <div className="skeleton w-52 h-5" />
            <div className="skeleton w-full h-4" />
            <div className="skeleton w-full h-11 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // Not connected state
  if (!connected) {
    return (
      <div className="text-center py-20 animate-fade-in">
        <div className="relative inline-block mb-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-shadow-600/20 to-shadow-800/20 flex items-center justify-center mx-auto">
            <Wallet className="w-10 h-10 text-gray-600 animate-float" />
          </div>
          <div className="absolute -inset-4 rounded-3xl bg-shadow-500/5 blur-xl" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">Agent Dashboard</h1>
        <p className="text-gray-400 max-w-md mx-auto leading-relaxed">
          Connect your Shield Wallet to register as an agent or view your dashboard.
        </p>
      </div>
    );
  }

  // Registration form
  if (!isRegistered) {
    return (
      <RegistrationForm
        onRegistered={() => {
          setIsRegistered(true);
          setReputation({ totalJobs: 0, totalRatingPoints: 0, totalRevenue: 0, tier: Tier.New });
          checkRegistration();
        }}
      />
    );
  }

  // Registered agent dashboard
  const avgRating =
    reputation && reputation.totalJobs > 0
      ? reputation.totalRatingPoints / reputation.totalJobs / 10
      : 0;

  // Load sessions where user is the agent
  const { setSessions } = useAgentStore();

  useEffect(() => {
    if (connected && publicKey && isRegistered) {
      listSessions({ agent: publicKey }).then(setSessions);
    }
  }, [connected, publicKey, isRegistered, setSessions]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Agent Dashboard</h1>
          <p className="text-gray-500 mt-1.5 font-mono text-sm">
            {publicKey?.slice(0, 12)}...{publicKey?.slice(-8)}
          </p>
        </div>
        {reputation && <TierBadge tier={reputation.tier} size="lg" />}
      </div>

      {/* Agent ID */}
      {agentId && (
        <div className="glass p-5 flex items-center justify-between animate-fade-in">
          <div>
            <p className="text-xs text-gray-500 mb-1.5 uppercase tracking-wider font-medium">Your Agent ID</p>
            <p className="font-mono text-sm text-white truncate max-w-[400px]">{agentId}</p>
          </div>
          <button
            onClick={() => {
              copyAgentId(agentId);
              toast.success('Agent ID copied to clipboard!');
            }}
            className="text-gray-500 hover:text-white transition-all duration-300 p-2.5 rounded-lg hover:bg-white/[0.04]"
            aria-label={copiedId ? "Agent ID copied" : "Copy Agent ID to clipboard"}
            title="Copy Agent ID"
          >
            {copiedId ? (
              <Check className="w-4 h-4 text-emerald-400 animate-scale-in" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
          {copiedId && (
            <span className="sr-only" aria-live="polite">Agent ID copied to clipboard</span>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 bg-red-500/5 border border-red-500/20 text-red-300 p-4 rounded-xl animate-fade-in-down">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {txStatus && (
        <div className="flex items-center gap-3 bg-blue-500/5 border border-blue-500/20 text-blue-300 p-4 rounded-xl animate-fade-in-down" aria-live="polite">
          <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
          <span className="text-sm">{txStatus}</span>
        </div>
      )}

      {/* Stats + Decay Banner */}
      {reputation && <ReputationPanel reputation={reputation} />}

      {/* Active Sessions (as agent) */}
      <ActiveSessionsPanel agentAddress={publicKey || ''} />

      {/* Actions */}
      <div className="grid md:grid-cols-2 gap-5">
        {/* Generate Proof */}
        <div
          className="card opacity-0 animate-fade-in-up"
          style={{ animationDelay: '0.4s', animationFillMode: 'forwards' }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg bg-shadow-600/15 flex items-center justify-center">
              <FileCheck className="w-5 h-5 text-shadow-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Generate ZK Reputation Proof</h2>
          </div>
          <p className="text-gray-400 text-sm mb-5 leading-relaxed">
            Create zero-knowledge proofs of your reputation to share with clients without revealing
            exact stats. Proofs are generated on-chain using your private records.
          </p>
          <div className="space-y-2.5">
            <button
              onClick={() => handleGenerateProof('tier')}
              className="btn btn-outline w-full"
            >
              Prove Tier &ge; {getTierName(reputation?.tier || Tier.New)}
            </button>
            <button
              onClick={() => handleGenerateProof('jobs')}
              className="btn btn-outline w-full"
            >
              Prove Jobs &ge; {reputation?.totalJobs || 0}
            </button>
            <button
              onClick={() => handleGenerateProof('rating')}
              className="btn btn-outline w-full"
            >
              Prove Rating &ge; {avgRating.toFixed(1)}
            </button>
          </div>
        </div>

        {/* Unregister */}
        <div
          className="card opacity-0 animate-fade-in-up"
          style={{ animationDelay: '0.5s', animationFillMode: 'forwards' }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Manage Registration</h2>
          </div>
          <p className="text-gray-400 text-sm mb-5 leading-relaxed">
            Unregistering will return your full bond and deactivate your listing. Your reputation
            records will be consumed but you can re-register later.
          </p>
          <button
            onClick={handleUnregister}
            disabled={isUnregistering}
            className="btn w-full flex items-center justify-center gap-2 bg-red-500/5 border border-red-500/20 text-red-300 hover:bg-red-500/10 hover:border-red-500/30"
          >
            {isUnregistering ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Unregistering...
              </>
            ) : (
              'Unregister & Reclaim Bond'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
