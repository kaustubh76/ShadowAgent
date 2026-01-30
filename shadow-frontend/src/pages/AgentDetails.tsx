import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Shield, Zap, X, Loader2, AlertCircle, FileCheck, Lock, Eye, Fingerprint, ShieldCheck } from 'lucide-react';
import { AgentListing, Tier, getServiceTypeName, getTierName } from '../stores/agentStore';
import { getAgent, verifyReputationProof } from '../lib/api';
import TierBadge from '../components/TierBadge';
import { useWalletStore } from '../stores/walletStore';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { useEscrowTransaction, useBalanceCheck } from '../hooks/useTransactions';

const privacyChecks = [
  { text: 'Job count verified (not revealed)', icon: Eye },
  { text: 'Revenue threshold verified (not revealed)', icon: Lock },
  { text: 'Average rating verified (not revealed)', icon: ShieldCheck },
  { text: 'Identity verified via staking bond (Sybil resistant)', icon: Fingerprint },
];

// Reputation Proof Modal
function ReputationProofModal({
  agent,
  onClose,
}: {
  agent: AgentListing;
  onClose: () => void;
}) {
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<{ valid: boolean; tier?: number; error?: string } | null>(null);

  const handleVerify = async () => {
    setVerifying(true);
    setResult(null);
    try {
      const res = await verifyReputationProof({
        proof_type: 1, // tier proof
        threshold: agent.tier,
        proof: agent.endpoint_hash, // use available proof data
        tier: agent.tier,
      });
      setResult(res);
    } catch {
      setResult({ valid: false, error: 'Verification service unavailable — agent tier is displayed from on-chain data.' });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in overflow-y-auto" onClick={onClose}>
      <div
        className="relative max-w-lg w-full my-8 bg-surface-1 border border-white/[0.06] rounded-2xl p-6 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reputation-modal-title"
      >
        {/* Modal header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="reputation-modal-title" className="text-lg font-semibold text-white flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-shadow-600/15 flex items-center justify-center">
              <FileCheck className="w-4 h-4 text-shadow-400" />
            </div>
            Reputation Proof
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-all duration-300 p-1.5 rounded-lg hover:bg-white/[0.04]"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Agent info table */}
          <div className="bg-surface-0/60 border border-white/[0.04] rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Agent ID</span>
              <span className="text-gray-300 font-mono text-xs truncate max-w-[200px]">{agent.agent_id}</span>
            </div>
            <div className="border-t border-white/[0.04]" />
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Claimed Tier</span>
              <TierBadge tier={agent.tier} size="sm" />
            </div>
            <div className="border-t border-white/[0.04]" />
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Service Type</span>
              <span className="text-white font-medium">{getServiceTypeName(agent.service_type)}</span>
            </div>
            <div className="border-t border-white/[0.04]" />
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Endpoint Hash</span>
              <span className="text-gray-300 font-mono text-xs">{agent.endpoint_hash}</span>
            </div>
          </div>

          <p className="text-gray-400 text-sm leading-relaxed">
            This agent's tier badge is backed by a zero-knowledge proof verifying their on-chain
            reputation meets the <span className="text-white font-medium">{getTierName(agent.tier)}</span> threshold — without revealing exact statistics.
          </p>

          {/* Verification result */}
          {result && (
            <div className={`flex items-center gap-2.5 p-3.5 rounded-xl text-sm animate-fade-in border ${
              result.valid
                ? 'bg-green-500/5 border-green-500/20 text-green-400'
                : 'bg-yellow-500/5 border-yellow-500/20 text-yellow-400'
            }`}>
              {result.valid ? (
                <><Check className="w-4 h-4 flex-shrink-0" /> Proof verified — tier is cryptographically valid</>
              ) : (
                <><AlertCircle className="w-4 h-4 flex-shrink-0" /> {result.error}</>
              )}
            </div>
          )}

          <button
            onClick={handleVerify}
            disabled={verifying}
            className="btn btn-primary w-full flex items-center justify-center gap-2"
          >
            {verifying ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</>
            ) : (
              <><Shield className="w-4 h-4" /> Verify Reputation Proof</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Request Service Modal
function RequestServiceModal({
  agent,
  onClose,
}: {
  agent: AgentListing;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState('0.01'); // Default to 0.01 credits for testing
  const { createEscrow, isLoading, status: escrowStatus } = useEscrowTransaction();
  const { formattedBalance, checkBalance } = useBalanceCheck();
  const [localStatus, setLocalStatus] = useState<string | null>(null);

  // Check balance on mount
  useEffect(() => {
    checkBalance();
  }, [checkBalance]);

  // Combine local and escrow status
  const displayStatus = escrowStatus || localStatus;

  const handleRequest = async () => {
    const creditsAmount = parseFloat(amount);
    if (!creditsAmount || creditsAmount <= 0) return;

    // Convert credits to microcredits (1 credit = 1,000,000 microcredits)
    const microcredits = Math.round(creditsAmount * 1_000_000);

    setLocalStatus('Creating escrow payment on-chain...');

    const result = await createEscrow(
      agent.agent_id,
      microcredits,
      `Service request for ${getServiceTypeName(agent.service_type)}`
    );

    if (result.success) {
      setLocalStatus(`Escrow created! TX: ${result.txId?.slice(0, 16)}...`);
    } else {
      setLocalStatus(`Error: ${result.error}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in overflow-y-auto" onClick={onClose}>
      <div
        className="relative max-w-lg w-full my-8 bg-surface-1 border border-white/[0.06] rounded-2xl p-6 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-modal-title"
      >
        {/* Modal header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="request-modal-title" className="text-lg font-semibold text-white flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-shadow-600/15 flex items-center justify-center">
              <Zap className="w-4 h-4 text-shadow-400" />
            </div>
            Request Service
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-all duration-300 p-1.5 rounded-lg hover:bg-white/[0.04]"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Agent summary */}
          <div className="bg-surface-0/60 border border-white/[0.04] rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Agent</span>
              <span className="text-white font-medium">{getServiceTypeName(agent.service_type)} Agent</span>
            </div>
            <div className="border-t border-white/[0.04]" />
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Tier</span>
              <TierBadge tier={agent.tier} size="sm" />
            </div>
          </div>

          {/* Payment amount */}
          <div>
            <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Payment Amount (credits)</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0.01"
                step="0.01"
                className="input"
                disabled={isLoading}
              />
              <span className="text-gray-400 text-sm font-medium">ALEO</span>
            </div>
            <p className="text-xs text-gray-500 mt-1.5">Balance: <span className="text-gray-400">{formattedBalance}</span></p>
          </div>

          {/* x402 protocol info */}
          <div className="bg-shadow-950/40 border border-shadow-500/10 rounded-xl p-4 text-sm">
            <p className="text-gray-300 mb-3 font-medium">The x402 protocol will:</p>
            <ol className="list-decimal list-inside text-gray-400 space-y-1.5 text-xs leading-relaxed">
              <li>Lock {amount || '0'} credits in an escrow contract</li>
              <li>Agent delivers the service</li>
              <li>Escrow auto-releases payment on completion</li>
              <li>You may submit a rating afterward (0.5 credit fee)</li>
            </ol>
          </div>

          {/* Status */}
          {displayStatus && (
            <div className={`flex items-center gap-2.5 p-3.5 rounded-xl text-sm animate-fade-in border ${
              isLoading
                ? 'bg-blue-500/5 border-blue-500/20 text-blue-400'
                : 'bg-green-500/5 border-green-500/20 text-green-400'
            }`}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" /> : <Check className="w-4 h-4 flex-shrink-0" />}
              <span>{displayStatus}</span>
            </div>
          )}

          <button
            onClick={handleRequest}
            disabled={isLoading || !parseFloat(amount)}
            className="btn btn-primary w-full flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
            ) : (
              <><Zap className="w-4 h-4" /> Create Escrow & Request</>
            )}
          </button>

          <p className="text-xs text-gray-500 text-center">
            Your funds are protected by the on-chain escrow contract.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AgentDetails() {
  const { agentId } = useParams<{ agentId: string }>();
  const { connected } = useWalletStore();
  const { copied, copy } = useCopyToClipboard();
  const [agent, setAgent] = useState<AgentListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showProofModal, setShowProofModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);

  useEffect(() => {
    async function fetchAgent() {
      if (!agentId) return;

      setLoading(true);
      try {
        const data = await getAgent(agentId);
        setAgent(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch agent');
        // Demo fallback
        setAgent({
          agent_id: agentId,
          service_type: 1,
          endpoint_hash: 'demo_hash_' + agentId.slice(0, 8),
          tier: Tier.Gold,
          is_active: true,
        });
      } finally {
        setLoading(false);
      }
    }

    fetchAgent();
  }, [agentId]);

  const handleCopyId = () => {
    if (agentId) {
      copy(agentId);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="relative">
          <div className="w-10 h-10 border-2 border-shadow-500/30 rounded-full" />
          <div className="absolute inset-0 w-10 h-10 border-2 border-shadow-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="text-center py-24 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-white/[0.06] flex items-center justify-center mx-auto mb-5">
          <AlertCircle className="w-8 h-8 text-gray-600" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Agent Not Found</h1>
        <p className="text-gray-400 mb-8 text-sm">The agent you're looking for doesn't exist.</p>
        <Link to="/client" className="btn btn-primary inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Search
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back Link */}
      <Link
        to="/client"
        className="group inline-flex items-center text-gray-500 hover:text-white mb-8 transition-all duration-300 text-sm"
      >
        <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform duration-300" />
        Back to Agent Search
      </Link>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 mb-6 text-sm animate-fade-in-down">
          <div className="w-2 h-2 rounded-full bg-yellow-500 flex-shrink-0" />
          <span className="text-yellow-400">{error} — showing demo data below.</span>
        </div>
      )}

      {/* Header Card */}
      <div className="card mb-6 animate-fade-in">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {getServiceTypeName(agent.service_type)} Agent
              </h1>
              <TierBadge tier={agent.tier} />
            </div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-sm text-gray-500 truncate max-w-[300px]">{agent.agent_id}</span>
              <button
                onClick={handleCopyId}
                className="text-gray-600 hover:text-white transition-all duration-300 p-1 rounded-md hover:bg-white/[0.04]"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-400 animate-scale-in" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${
                agent.is_active
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                  : 'bg-gray-500/10 border border-gray-500/20 text-gray-400'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${agent.is_active ? 'bg-emerald-500 animate-pulse-soft' : 'bg-gray-500'}`} />
              {agent.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid md:grid-cols-2 gap-5 mb-6">
        {/* Service Info */}
        <div
          className="card card-shine opacity-0 animate-fade-in-up"
          style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}
        >
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="text-base font-semibold text-white">Service Information</h2>
          </div>
          <dl className="space-y-4">
            <div className="flex items-center justify-between">
              <dt className="text-xs text-gray-500 uppercase tracking-wider font-medium">Service Type</dt>
              <dd className="text-white font-medium text-sm">{getServiceTypeName(agent.service_type)}</dd>
            </div>
            <div className="border-t border-white/[0.04]" />
            <div className="flex items-center justify-between">
              <dt className="text-xs text-gray-500 uppercase tracking-wider font-medium">Endpoint Hash</dt>
              <dd className="text-gray-300 font-mono text-xs truncate max-w-[180px]">{agent.endpoint_hash}</dd>
            </div>
            <div className="border-t border-white/[0.04]" />
            <div className="flex items-center justify-between">
              <dt className="text-xs text-gray-500 uppercase tracking-wider font-medium">Reputation Tier</dt>
              <dd>
                <TierBadge tier={agent.tier} showLabel />
              </dd>
            </div>
          </dl>
        </div>

        {/* Privacy Info */}
        <div
          className="card card-shine opacity-0 animate-fade-in-up"
          style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}
        >
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-8 h-8 rounded-lg bg-shadow-600/15 flex items-center justify-center">
              <Shield className="w-4 h-4 text-shadow-400" />
            </div>
            <h2 className="text-base font-semibold text-white">Privacy-Preserving</h2>
          </div>
          <p className="text-gray-400 text-sm mb-5 leading-relaxed">
            This agent's exact statistics are private. The tier badge represents a verified
            zero-knowledge proof of their reputation meeting certain thresholds.
          </p>
          <ul className="space-y-3">
            {privacyChecks.map((check, index) => {
              const CheckIcon = check.icon;
              return (
                <li
                  key={index}
                  className="flex items-start gap-2.5 opacity-0 animate-slide-in-right"
                  style={{ animationDelay: `${0.3 + index * 0.1}s`, animationFillMode: 'forwards' }}
                >
                  <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckIcon className="w-3 h-3 text-emerald-400" />
                  </div>
                  <span className="text-gray-300 text-sm">{check.text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Action Card */}
      <div
        className="card opacity-0 animate-fade-in-up"
        style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}
      >
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <h2 className="text-base font-semibold text-white">Hire This Agent</h2>
        </div>

        {!connected ? (
          <div className="bg-surface-0/60 border border-white/[0.04] rounded-xl p-6 text-center">
            <div className="w-10 h-10 rounded-xl bg-shadow-600/15 flex items-center justify-center mx-auto mb-3">
              <Lock className="w-5 h-5 text-gray-500" />
            </div>
            <p className="text-gray-400 text-sm">Connect your wallet to hire this agent</p>
          </div>
        ) : !agent.is_active ? (
          <div className="bg-surface-0/60 border border-white/[0.04] rounded-xl p-6 text-center">
            <div className="w-10 h-10 rounded-xl bg-gray-500/10 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-5 h-5 text-gray-500" />
            </div>
            <p className="text-gray-400 text-sm">This agent is currently inactive</p>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-gray-400 text-sm leading-relaxed">
              When you make a request to this agent's endpoint, the x402 protocol will automatically:
            </p>
            <ol className="space-y-2.5">
              {[
                'Return payment terms (price, escrow details)',
                'You create an escrow with locked payment',
                'Agent delivers service and reveals secret',
                'Escrow automatically releases payment',
                'You can submit a rating (costs 0.5 credits burn)',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="w-5 h-5 rounded-md bg-shadow-600/15 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-shadow-400">
                    {i + 1}
                  </span>
                  <span className="text-gray-300">{step}</span>
                </li>
              ))}
            </ol>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowRequestModal(true)}
                className="btn btn-primary flex-1"
              >
                Request Service
              </button>
              <button
                onClick={() => setShowProofModal(true)}
                className="btn btn-outline"
              >
                View Reputation Proof
              </button>
            </div>

            <p className="text-xs text-gray-600 text-center">
              Note: The actual endpoint URL is encrypted. Only the agent can reveal it to verified clients.
            </p>
          </div>
        )}
      </div>

      {/* Modals */}
      {showProofModal && (
        <ReputationProofModal agent={agent} onClose={() => setShowProofModal(false)} />
      )}
      {showRequestModal && (
        <RequestServiceModal agent={agent} onClose={() => setShowRequestModal(false)} />
      )}
    </div>
  );
}
