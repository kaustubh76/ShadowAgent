// Agent Dashboard with Shield Wallet Integration

import { useState, useEffect, useCallback } from 'react';
import { Shield, Award, DollarSign, BarChart3, FileCheck, AlertCircle, Loader2, Copy, Check, Wallet } from 'lucide-react';
import { useShieldWallet } from '../providers/WalletProvider';
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
            <div className="skeleton w-11 h-11 rounded-xl" />
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
  const { publicKey, connected, signTransaction, getRecords } = useShieldWallet();
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
        // Try facilitator first, fall back to on-chain defaults
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
            // Facilitator unavailable — use on-chain registration with defaults
            setAgentId(publicKey.slice(0, 16) + '...');
            setReputation({
              totalJobs: 0,
              totalRatingPoints: 0,
              totalRevenue: 0,
              tier: Tier.New,
            });
          }
        } catch {
          // Facilitator not running — use on-chain registration with defaults
          setAgentId(publicKey.slice(0, 16) + '...');
          setReputation({
            totalJobs: 0,
            totalRatingPoints: 0,
            totalRevenue: 0,
            tier: Tier.New,
          });
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

  // Handle real agent registration
  const handleRegister = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your Shield Wallet first');
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
      const inputs = buildRegisterAgentInputs(selectedServiceType, endpointUrl, bondAmount);

      setTxStatus('Signing transaction with Shield Wallet...');
      toast.info('Signing transaction with Shield Wallet...');

      const txId = await signTransaction(
        SHADOW_AGENT_PROGRAM_ID,
        'register_agent',
        [
          formatU8ForLeo(inputs.service_type),
          formatFieldForLeo(inputs.endpoint_hash),
          formatU64ForLeo(inputs.bond_amount),
        ],
        Math.floor(bondAmount / 1000)
      );

      setTxStatus(`Transaction submitted: ${txId.slice(0, 16)}...`);
      toast.success('Transaction submitted to network!');

      setTxStatus('Waiting for on-chain confirmation (this may take up to 60 seconds)...');
      toast.info('Waiting for blockchain confirmation...');

      let confirmed = false;
      for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

        try {
          const response = await fetch(
            `https://api.explorer.provable.com/v1/testnet/transaction/${txId}`
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

        // Notify facilitator (non-blocking — registration works without it)
        fetch(`${FACILITATOR_URL}/agents/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: publicKey,
            service_type: selectedServiceType,
            endpoint_url: endpointUrl,
            bond_amount: bondAmount,
            tx_id: txId,
          }),
        }).catch(() => {});
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
      toast.info(`View transaction: https://explorer.aleo.org/transaction/${txId.slice(0, 16)}...`);

      setIsRegistered(false);
      setAgentId(null);
      setReputation(null);

      // Notify facilitator (non-blocking)
      fetch(`${FACILITATOR_URL}/agents/unregister`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: publicKey,
          tx_id: txId,
        }),
      }).catch(() => {});
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
      <div className="max-w-2xl mx-auto animate-scale-in">
        <div className="text-center mb-10">
          <div className="relative inline-block mb-5">
            <div className="w-18 h-18 rounded-2xl bg-gradient-to-br from-shadow-500 to-shadow-700 p-4 mx-auto shadow-glow-sm">
              <Shield className="w-10 h-10 text-white animate-float" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">Register as an Agent</h1>
          <p className="text-gray-400 max-w-lg mx-auto leading-relaxed">
            Join the marketplace and start monetizing your AI services with privacy-preserving reputation.
          </p>
        </div>

        <div className="card">
          {error && (
            <div className="flex items-center gap-3 bg-red-500/5 border border-red-500/20 text-red-300 p-4 rounded-xl mb-6 animate-fade-in-down">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {txStatus && (
            <div className="flex items-center gap-3 bg-blue-500/5 border border-blue-500/20 text-blue-300 p-4 rounded-xl mb-6 animate-fade-in-down">
              <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
              <span className="text-sm">{txStatus}</span>
            </div>
          )}

          <div className="space-y-6">
            {/* Service Type */}
            <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}>
              <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Service Type</label>
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
              <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Service Endpoint URL</label>
              <input
                type="url"
                value={endpointUrl}
                onChange={(e) => {
                  setEndpointUrl(e.target.value);
                  validateUrl(e.target.value);
                }}
                onBlur={() => validateUrl(endpointUrl)}
                placeholder="https://your-service.example.com/api"
                className={`input ${urlError ? 'border-red-500/50 focus:border-red-500/50' : ''}`}
                disabled={isRegistering}
              />
              {urlError ? (
                <p className="text-xs text-red-400 mt-1.5">{urlError}</p>
              ) : (
                <p className="text-xs text-gray-600 mt-1.5">
                  Your endpoint URL will be hashed for privacy. Only you can reveal it.
                </p>
              )}
            </div>

            {/* Bond Amount */}
            <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}>
              <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
                Registration Bond (min: {REGISTRATION_BOND / 1_000_000}, max: {MAX_BOND_AMOUNT.toLocaleString()} credits)
              </label>
              <div className="flex items-center gap-3">
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
                  className={`input ${bondError ? 'border-red-500/50 focus:border-red-500/50' : ''}`}
                  disabled={isRegistering}
                />
                <span className="text-gray-500 text-sm font-medium">credits</span>
              </div>
              {bondError ? (
                <p className="text-xs text-red-400 mt-1.5">{bondError}</p>
              ) : (
                <p className="text-xs text-gray-600 mt-1.5">
                  Higher bonds signal stronger commitment and provide better Sybil resistance.
                </p>
              )}
            </div>

            {/* Registration Bond Info */}
            <div className="bg-shadow-950/40 border border-shadow-500/10 rounded-xl p-5 opacity-0 animate-fade-in-up" style={{ animationDelay: '0.4s', animationFillMode: 'forwards' }}>
              <h3 className="text-sm font-semibold text-white mb-3">Registration Bond</h3>
              <ul className="text-xs text-gray-400 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="w-1 h-1 rounded-full bg-shadow-500 mt-1.5 flex-shrink-0" />
                  Stake is held by you in an AgentBond record
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1 h-1 rounded-full bg-shadow-500 mt-1.5 flex-shrink-0" />
                  Bond is fully returned when you unregister
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1 h-1 rounded-full bg-shadow-500 mt-1.5 flex-shrink-0" />
                  One agent per wallet address (Sybil resistance)
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1 h-1 rounded-full bg-shadow-500 mt-1.5 flex-shrink-0" />
                  Transaction is signed via Shield Wallet
                </li>
              </ul>
            </div>

            {/* Register Button */}
            <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '0.5s', animationFillMode: 'forwards' }}>
              <button
                onClick={handleRegister}
                disabled={isRegistering || !endpointUrl || !!urlError || !!bondError}
                className="btn btn-primary w-full py-3.5 flex items-center justify-center gap-2 text-base"
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
    { icon: BarChart3, gradient: 'from-blue-500/15 to-blue-600/15', iconColor: 'text-blue-400', label: 'Total Jobs', value: String(reputation?.totalJobs || 0) },
    { icon: Award, gradient: 'from-yellow-500/15 to-amber-500/15', iconColor: 'text-yellow-400', label: 'Avg Rating', value: avgRating > 0 ? `${avgRating.toFixed(1)} ★` : 'N/A' },
    { icon: DollarSign, gradient: 'from-emerald-500/15 to-green-500/15', iconColor: 'text-emerald-400', label: 'Total Revenue', value: `$${((reputation?.totalRevenue || 0) / 10_000_00).toFixed(2)}` },
    { icon: Shield, gradient: 'from-purple-500/15 to-shadow-500/15', iconColor: 'text-purple-400', label: 'Current Tier', value: getTierName(reputation?.tier || Tier.New) },
  ];

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

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="card card-shine group opacity-0 animate-fade-in-up"
              style={{ animationDelay: `${index * ANIMATION_DELAY_BASE}s`, animationFillMode: 'forwards' }}
            >
              <div className="flex items-center gap-4">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center group-hover:scale-110 transition-transform duration-500`}>
                  <Icon className={`w-5 h-5 ${stat.iconColor}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">{stat.label}</p>
                  <p className="text-xl font-bold text-white mt-0.5">{stat.value}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

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
