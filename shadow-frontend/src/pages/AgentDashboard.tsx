// Real Agent Dashboard with Leo Wallet Integration

import { useState, useEffect, useCallback } from 'react';
import { Shield, Award, DollarSign, BarChart3, FileCheck, AlertCircle, Loader2, Copy, Check } from 'lucide-react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { Transaction, WalletAdapterNetwork } from '@demox-labs/aleo-wallet-adapter-base';
import TierBadge from '../components/TierBadge';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { useToast } from '../contexts/ToastContext';
import { useReputationProof, useBalanceCheck } from '../hooks/useTransactions';
import {
  POLL_INTERVAL,
  MAX_POLL_ATTEMPTS,
  MAX_BOND_AMOUNT,
  ANIMATION_DELAY_BASE,
} from '../constants/ui';
import {
  SHADOW_AGENT_PROGRAM_ID,
  REGISTRATION_BOND,
  ServiceType,
  Tier,
  buildRegisterAgentInputs,
  isAddressRegistered,
  formatU8ForLeo,
  formatFieldForLeo,
  formatU64ForLeo,
} from '../services/aleo';
import { getTierName, getServiceTypeName } from '../stores/agentStore';

// Facilitator API URL
const FACILITATOR_URL = import.meta.env.VITE_FACILITATOR_URL || 'http://localhost:3001';

interface AgentReputation {
  totalJobs: number;
  totalRatingPoints: number;
  totalRevenue: number;
  tier: Tier;
}

function SkeletonStats() {
  return (
    <div className="grid md:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="card">
          <div className="flex items-center gap-3">
            <div className="skeleton w-10 h-10 rounded-lg" />
            <div className="space-y-2">
              <div className="skeleton w-16 h-3" />
              <div className="skeleton w-12 h-5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AgentDashboard() {
  const { publicKey, connected, requestTransaction, requestRecords } = useWallet();
  const { copied: copiedId, copy: copyAgentId } = useCopyToClipboard();
  const toast = useToast();
  const { generateProof } = useReputationProof();
  const { checkBalance } = useBalanceCheck();

  // State
  const [isRegistered, setIsRegistered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isUnregistering, setIsUnregistering] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [reputation, setReputation] = useState<AgentReputation | null>(null);
  const [bondAmount, setBondAmount] = useState<number>(REGISTRATION_BOND);
  const [error, setError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  // Form state
  const [selectedServiceType, setSelectedServiceType] = useState<ServiceType>(ServiceType.NLP);
  const [endpointUrl, setEndpointUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [bondError, setBondError] = useState<string | null>(null);

  // Validate endpoint URL
  const validateUrl = (url: string) => {
    if (!url) {
      setUrlError(null);
      return;
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        setUrlError('URL must use HTTPS');
      } else {
        setUrlError(null);
      }
    } catch {
      setUrlError('Please enter a valid URL');
    }
  };

  // Validate bond amount
  const validateBond = (amount: number) => {
    if (amount < REGISTRATION_BOND) {
      setBondError(`Minimum bond is ${REGISTRATION_BOND / 1_000_000} credits`);
    } else if (amount > MAX_BOND_AMOUNT * 1_000_000) {
      setBondError(`Maximum bond is ${MAX_BOND_AMOUNT.toLocaleString()} credits`);
    } else if (!Number.isFinite(amount) || amount <= 0) {
      setBondError('Please enter a valid amount');
    } else {
      setBondError(null);
    }
  };

  // Check registration status on wallet connect
  const checkRegistration = useCallback(async () => {
    if (!connected || !publicKey) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Check balance
      checkBalance();

      // Check on-chain if this address is registered
      const registered = await isAddressRegistered(publicKey);
      setIsRegistered(registered);

      if (registered) {
        // Fetch agent details from facilitator
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
        }
      }
    } catch (err) {
      // Silently fail - user might just not be registered yet
      // Only log to console for debugging purposes
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

  // Handle real agent registration
  const handleRegister = async () => {
    if (!connected || !publicKey || !requestTransaction) {
      setError('Please connect your wallet first');
      return;
    }

    if (!endpointUrl) {
      setError('Please enter your service endpoint URL');
      return;
    }

    try {
      const url = new URL(endpointUrl);
      if (url.protocol !== 'https:') {
        setError('Endpoint URL must use HTTPS');
        return;
      }
    } catch {
      setError('Please enter a valid URL (e.g. https://your-service.example.com/api)');
      return;
    }

    if (bondAmount < REGISTRATION_BOND) {
      setError(`Minimum bond is ${REGISTRATION_BOND / 1_000_000} credits`);
      return;
    }

    if (bondAmount > MAX_BOND_AMOUNT * 1_000_000) {
      setError(`Bond amount exceeds maximum (${MAX_BOND_AMOUNT.toLocaleString()} credits)`);
      return;
    }

    if (!Number.isFinite(bondAmount) || bondAmount <= 0) {
      setError('Please enter a valid bond amount');
      return;
    }

    setIsRegistering(true);
    setError(null);
    setTxStatus('Building registration transaction...');
    toast.info('Preparing agent registration...');

    try {
      // Build transaction inputs
      const inputs = buildRegisterAgentInputs(selectedServiceType, endpointUrl, bondAmount);

      // Create the transaction for Leo Wallet
      const transaction = Transaction.createTransaction(
        publicKey,
        WalletAdapterNetwork.TestnetBeta,
        SHADOW_AGENT_PROGRAM_ID,
        'register_agent',
        [
          formatU8ForLeo(inputs.service_type),
          formatFieldForLeo(inputs.endpoint_hash),
          formatU64ForLeo(inputs.bond_amount),
        ],
        Math.floor(bondAmount / 1000) // Fee estimate in millicredits
      );

      setTxStatus('Waiting for wallet approval...');
      toast.info('Please approve the transaction in your wallet');

      // Request transaction signature from wallet
      const txId = await requestTransaction(transaction);

      setTxStatus(`Transaction submitted: ${txId.slice(0, 16)}...`);
      toast.success('Transaction submitted to network!');

      // Wait for transaction confirmation
      setTxStatus('Waiting for on-chain confirmation (this may take up to 60 seconds)...');
      toast.info('Waiting for blockchain confirmation...');

      // Poll for transaction status (in production, use websocket or better polling)
      let confirmed = false;
      for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

        try {
          const response = await fetch(
            `https://api.explorer.aleo.org/v1/testnet/transaction/${txId}`
          );
          if (response.ok) {
            const txData = await response.json();
            if (txData.status === 'confirmed' || txData.type === 'execute') {
              confirmed = true;
              break;
            }
          }
        } catch {
          // Continue polling
        }
      }

      if (confirmed) {
        setTxStatus('Registration confirmed!');
        toast.success(`Agent registered successfully as ${getServiceTypeName(selectedServiceType)} agent!`);
        toast.info(`View transaction: https://explorer.aleo.org/transaction/${txId.slice(0, 16)}...`);
        setIsRegistered(true);
        setReputation({
          totalJobs: 0,
          totalRatingPoints: 0,
          totalRevenue: 0,
          tier: Tier.New,
        });

        // Notify facilitator of new registration
        await fetch(`${FACILITATOR_URL}/agents/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: publicKey,
            service_type: selectedServiceType,
            endpoint_url: endpointUrl,
            bond_amount: bondAmount,
            tx_id: txId,
          }),
        });
      } else {
        setTxStatus('Transaction still pending - this may take a few minutes');
        toast.warning('Transaction pending - check Aleo Explorer for status');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Registration failed';
      setError(errorMessage);
      toast.error(errorMessage);
      setTxStatus(null);
    } finally {
      setIsRegistering(false);
    }
  };

  // Handle unregistration
  const handleUnregister = async () => {
    if (!connected || !publicKey || !requestTransaction || !requestRecords) {
      setError('Wallet not connected');
      return;
    }

    setIsUnregistering(true);
    setError(null);
    setTxStatus('Fetching your agent records from wallet...');
    toast.info('Preparing to unregister agent...');

    try {
      // Get reputation and bond records from wallet
      const records = await requestRecords(SHADOW_AGENT_PROGRAM_ID);

      const reputationRecord = records.find((r) => r.data?.total_jobs !== undefined);
      const bondRecord = records.find((r) => r.data?.staked_at !== undefined);

      if (!reputationRecord || !bondRecord) {
        throw new Error('Could not find your agent records');
      }

      // Create unregister transaction
      const transaction = Transaction.createTransaction(
        publicKey,
        WalletAdapterNetwork.TestnetBeta,
        SHADOW_AGENT_PROGRAM_ID,
        'unregister_agent',
        [reputationRecord.ciphertext, bondRecord.ciphertext],
        50000 // Fee in microcredits
      );

      setTxStatus('Waiting for wallet approval...');
      toast.info('Please approve unregistration in your wallet');

      const txId = await requestTransaction(transaction);

      setTxStatus(`Unregister transaction submitted: ${txId.slice(0, 16)}...`);
      toast.success('Agent unregistered successfully! Your bond will be returned.');
      toast.info(`View transaction: https://explorer.aleo.org/transaction/${txId.slice(0, 16)}...`);

      // Reset state
      setIsRegistered(false);
      setAgentId(null);
      setReputation(null);

      // Notify facilitator
      await fetch(`${FACILITATOR_URL}/agents/unregister`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: publicKey,
          tx_id: txId,
        }),
      });
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
      // Use SDK's reputation proof generation
      const result = await generateProof(proofType, {
        totalJobs: reputation.totalJobs,
        totalRatingPoints: reputation.totalRatingPoints,
        totalRevenue: reputation.totalRevenue,
        tier: reputation.tier,
      });

      if (result.success && result.proof) {
        // Copy proof to clipboard
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
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="skeleton w-48 h-7" />
            <div className="skeleton w-32 h-4" />
          </div>
          <div className="skeleton w-20 h-8 rounded-full" />
        </div>
        <SkeletonStats />
        <div className="grid md:grid-cols-2 gap-6">
          <div className="card space-y-3">
            <div className="skeleton w-48 h-5" />
            <div className="skeleton w-full h-4" />
            <div className="skeleton w-full h-10 rounded-lg" />
          </div>
          <div className="card space-y-3">
            <div className="skeleton w-48 h-5" />
            <div className="skeleton w-full h-4" />
            <div className="skeleton w-full h-10 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  // Not connected state
  if (!connected) {
    return (
      <div className="text-center py-16 animate-fade-in">
        <Shield className="w-16 h-16 text-gray-600 mx-auto mb-4 animate-float" />
        <h1 className="text-2xl font-bold text-white mb-2">Agent Dashboard</h1>
        <p className="text-gray-400 mb-6">
          Connect your Leo Wallet to register as an agent or view your dashboard.
        </p>
      </div>
    );
  }

  // Registration form
  if (!isRegistered) {
    return (
      <div className="max-w-2xl mx-auto animate-scale-in">
        <div className="text-center mb-8">
          <Shield className="w-16 h-16 text-shadow-400 mx-auto mb-4 animate-float" />
          <h1 className="text-2xl font-bold text-white mb-2">Register as an Agent</h1>
          <p className="text-gray-400">
            Join the marketplace and start monetizing your AI services with privacy-preserving reputation.
          </p>
        </div>

        <div className="card">
          {error && (
            <div className="flex items-center gap-2 bg-red-900/50 text-red-300 p-3 rounded-lg mb-6 animate-fade-in-down">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          )}

          {txStatus && (
            <div className="flex items-center gap-2 bg-blue-900/50 text-blue-300 p-3 rounded-lg mb-6 animate-fade-in-down">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{txStatus}</span>
            </div>
          )}

          <div className="space-y-6">
            {/* Service Type */}
            <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}>
              <label className="block text-sm text-gray-400 mb-2">Service Type</label>
              <select
                value={selectedServiceType}
                onChange={(e) => setSelectedServiceType(Number(e.target.value))}
                className="input"
                disabled={isRegistering}
              >
                {Object.values(ServiceType)
                  .filter((v) => typeof v === 'number')
                  .map((type) => (
                    <option key={type} value={type}>
                      {getServiceTypeName(type as ServiceType)}
                    </option>
                  ))}
              </select>
            </div>

            {/* Endpoint URL */}
            <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}>
              <label className="block text-sm text-gray-400 mb-2">Service Endpoint URL</label>
              <input
                type="url"
                value={endpointUrl}
                onChange={(e) => {
                  setEndpointUrl(e.target.value);
                  validateUrl(e.target.value);
                }}
                onBlur={() => validateUrl(endpointUrl)}
                placeholder="https://your-service.example.com/api"
                className={`input ${urlError ? 'border-red-500 focus:border-red-500' : ''}`}
                disabled={isRegistering}
              />
              {urlError ? (
                <p className="text-xs text-red-400 mt-1">{urlError}</p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  Your endpoint URL will be hashed for privacy. Only you can reveal it.
                </p>
              )}
            </div>

            {/* Bond Amount */}
            <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}>
              <label className="block text-sm text-gray-400 mb-2">
                Registration Bond (min: {REGISTRATION_BOND / 1_000_000}, max: {MAX_BOND_AMOUNT.toLocaleString()} credits)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={bondAmount / 1_000_000}
                  onChange={(e) => {
                    const newAmount = parseFloat(e.target.value) * 1_000_000;
                    setBondAmount(newAmount);
                    validateBond(newAmount);
                  }}
                  onBlur={() => validateBond(bondAmount)}
                  min={REGISTRATION_BOND / 1_000_000}
                  max={MAX_BOND_AMOUNT}
                  step={1}
                  className={`input ${bondError ? 'border-red-500 focus:border-red-500' : ''}`}
                  disabled={isRegistering}
                />
                <span className="text-gray-400">credits</span>
              </div>
              {bondError ? (
                <p className="text-xs text-red-400 mt-1">{bondError}</p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  Higher bonds signal stronger commitment and provide better Sybil resistance.
                </p>
              )}
            </div>

            {/* Registration Bond Info */}
            <div className="bg-purple-900/50 rounded-lg p-4 opacity-0 animate-fade-in-up" style={{ animationDelay: '0.4s', animationFillMode: 'forwards' }}>
              <h3 className="text-sm font-medium text-white mb-2">Registration Bond</h3>
              <ul className="text-xs text-gray-400 space-y-1">
                <li>• Stake is held by you in an AgentBond record</li>
                <li>• Bond is fully returned when you unregister</li>
                <li>• One agent per wallet address (Sybil resistance)</li>
                <li>• Transaction requires Leo Wallet approval</li>
              </ul>
            </div>

            {/* Register Button */}
            <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '0.5s', animationFillMode: 'forwards' }}>
              <button
                onClick={handleRegister}
                disabled={isRegistering || !endpointUrl || !!urlError || !!bondError}
                className="btn btn-primary w-full py-3 flex items-center justify-center gap-2"
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Registering...
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5" />
                    Register Agent ({bondAmount / 1_000_000} credits)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Registered agent dashboard
  const avgRating =
    reputation && reputation.totalJobs > 0
      ? reputation.totalRatingPoints / reputation.totalJobs / 10
      : 0;

  const stats = [
    { icon: BarChart3, color: 'bg-blue-500/20', iconColor: 'text-blue-400', label: 'Total Jobs', value: String(reputation?.totalJobs || 0) },
    { icon: Award, color: 'bg-yellow-500/20', iconColor: 'text-yellow-400', label: 'Avg Rating', value: avgRating > 0 ? `${avgRating.toFixed(1)} ★` : 'N/A' },
    { icon: DollarSign, color: 'bg-green-500/20', iconColor: 'text-green-400', label: 'Total Revenue', value: `$${((reputation?.totalRevenue || 0) / 10_000_00).toFixed(2)}` },
    { icon: Shield, color: 'bg-purple-500/20', iconColor: 'text-purple-400', label: 'Current Tier', value: getTierName(reputation?.tier || Tier.New) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-white">Agent Dashboard</h1>
          <p className="text-gray-400 mt-1 font-mono text-sm">
            {publicKey?.slice(0, 12)}...{publicKey?.slice(-8)}
          </p>
        </div>
        {reputation && <TierBadge tier={reputation.tier} size="lg" />}
      </div>

      {/* Agent ID */}
      {agentId && (
        <div className="glass p-4 flex items-center justify-between animate-fade-in">
          <div>
            <p className="text-xs text-gray-400 mb-1">Your Agent ID</p>
            <p className="font-mono text-sm text-white truncate max-w-[400px]">{agentId}</p>
          </div>
          <button
            onClick={() => {
              copyAgentId(agentId);
              toast.success('Agent ID copied to clipboard!');
            }}
            className="text-gray-400 hover:text-white transition-all duration-200 p-2"
            aria-label={copiedId ? "Agent ID copied" : "Copy Agent ID to clipboard"}
            title="Copy Agent ID"
          >
            {copiedId ? (
              <Check className="w-4 h-4 text-green-400 animate-scale-in" />
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
        <div className="flex items-center gap-2 bg-red-900/50 text-red-300 p-3 rounded-lg animate-fade-in-down">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {txStatus && (
        <div className="flex items-center gap-2 bg-blue-900/50 text-blue-300 p-3 rounded-lg animate-fade-in-down" aria-live="polite">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>{txStatus}</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="card group opacity-0 animate-fade-in-up"
              style={{ animationDelay: `${index * ANIMATION_DELAY_BASE}s`, animationFillMode: 'forwards' }}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                  <Icon className={`w-5 h-5 ${stat.iconColor}`} />
                </div>
                <div>
                  <p className="text-sm text-gray-400">{stat.label}</p>
                  <p className="text-xl font-bold text-white">{stat.value}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Generate Proof */}
        <div
          className="card opacity-0 animate-fade-in-up"
          style={{ animationDelay: '0.4s', animationFillMode: 'forwards' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <FileCheck className="w-5 h-5 text-shadow-400" />
            <h2 className="text-lg font-semibold text-white">Generate ZK Reputation Proof</h2>
          </div>
          <p className="text-gray-400 text-sm mb-4">
            Create zero-knowledge proofs of your reputation to share with clients without revealing
            exact stats. Proofs are generated on-chain using your private records.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => handleGenerateProof('tier')}
              className="btn btn-outline w-full"
            >
              Prove Tier ≥ {getTierName(reputation?.tier || Tier.New)}
            </button>
            <button
              onClick={() => handleGenerateProof('jobs')}
              className="btn btn-outline w-full"
            >
              Prove Jobs ≥ {reputation?.totalJobs || 0}
            </button>
            <button
              onClick={() => handleGenerateProof('rating')}
              className="btn btn-outline w-full"
            >
              Prove Rating ≥ {avgRating.toFixed(1)}
            </button>
          </div>
        </div>

        {/* Unregister */}
        <div
          className="card opacity-0 animate-fade-in-up"
          style={{ animationDelay: '0.5s', animationFillMode: 'forwards' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-red-400" />
            <h2 className="text-lg font-semibold text-white">Manage Registration</h2>
          </div>
          <p className="text-gray-400 text-sm mb-4">
            Unregistering will return your full bond and deactivate your listing. Your reputation
            records will be consumed but you can re-register later.
          </p>
          <button
            onClick={handleUnregister}
            disabled={isUnregistering}
            className="btn bg-red-900/50 hover:bg-red-800/50 text-red-300 w-full flex items-center justify-center gap-2"
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
