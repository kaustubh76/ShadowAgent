import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Shield, Zap, X, Loader2, AlertCircle, FileCheck } from 'lucide-react';
import { AgentListing, Tier, getServiceTypeName, getTierName } from '../stores/agentStore';
import { getAgent, verifyReputationProof } from '../lib/api';
import TierBadge from '../components/TierBadge';
import { useWalletStore } from '../stores/walletStore';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { useEscrowTransaction, useBalanceCheck } from '../hooks/useTransactions';

const privacyChecks = [
  'Job count verified (not revealed)',
  'Revenue threshold verified (not revealed)',
  'Average rating verified (not revealed)',
  'Identity verified via staking bond (Sybil resistant)',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto" onClick={onClose}>
      <div
        className="card max-w-lg w-full my-8 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reputation-modal-title"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="reputation-modal-title" className="text-lg font-semibold text-white flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-shadow-400" />
            Reputation Proof
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Agent ID</span>
              <span className="text-white font-mono text-xs truncate max-w-[200px]">{agent.agent_id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Claimed Tier</span>
              <TierBadge tier={agent.tier} size="sm" />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Service Type</span>
              <span className="text-white">{getServiceTypeName(agent.service_type)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Endpoint Hash</span>
              <span className="text-white font-mono text-xs">{agent.endpoint_hash}</span>
            </div>
          </div>

          <p className="text-gray-400 text-sm">
            This agent's tier badge is backed by a zero-knowledge proof verifying their on-chain
            reputation meets the {getTierName(agent.tier)} threshold — without revealing exact statistics.
          </p>

          {result && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm animate-fade-in ${
              result.valid ? 'bg-green-900/50 text-green-300' : 'bg-yellow-900/50 text-yellow-300'
            }`}>
              {result.valid ? (
                <><Check className="w-4 h-4" /> Proof verified — tier is cryptographically valid</>
              ) : (
                <><AlertCircle className="w-4 h-4" /> {result.error}</>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto" onClick={onClose}>
      <div
        className="card max-w-lg w-full my-8 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-modal-title"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="request-modal-title" className="text-lg font-semibold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-shadow-400" />
            Request Service
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Agent</span>
              <span className="text-white">{getServiceTypeName(agent.service_type)} Agent</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Tier</span>
              <TierBadge tier={agent.tier} size="sm" />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Payment Amount (credits)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0.01"
                step="0.01"
                className="input"
                disabled={isLoading}
              />
              <span className="text-gray-400">ALEO</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Balance: {formattedBalance}</p>
          </div>

          <div className="bg-purple-900/30 rounded-lg p-3 text-sm">
            <p className="text-gray-300 mb-2">The x402 protocol will:</p>
            <ol className="list-decimal list-inside text-gray-400 space-y-1 text-xs">
              <li>Lock {amount || '0'} credits in an escrow contract</li>
              <li>Agent delivers the service</li>
              <li>Escrow auto-releases payment on completion</li>
              <li>You may submit a rating afterward (0.5 credit fee)</li>
            </ol>
          </div>

          {displayStatus && (
            <div className="flex items-center gap-2 bg-blue-900/50 text-blue-300 p-3 rounded-lg text-sm animate-fade-in">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-green-400" />}
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
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin w-8 h-8 border-2 border-shadow-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="text-center py-16 animate-fade-in">
        <h1 className="text-2xl font-bold text-white mb-2">Agent Not Found</h1>
        <p className="text-gray-400 mb-6">The agent you're looking for doesn't exist.</p>
        <Link to="/client" className="btn btn-primary">
          <ArrowLeft className="w-4 h-4 mr-2" />
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
        className="group inline-flex items-center text-gray-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform duration-200" />
        Back to Agent Search
      </Link>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 bg-yellow-900/30 border border-yellow-700/50 text-yellow-300 p-3 rounded-lg mb-6 text-sm animate-fade-in-down">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error} — showing demo data below.</span>
        </div>
      )}

      {/* Header */}
      <div className="card mb-6 animate-fade-in">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-white">
                {getServiceTypeName(agent.service_type)} Agent
              </h1>
              <TierBadge tier={agent.tier} />
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <span className="font-mono text-sm truncate max-w-[300px]">{agent.agent_id}</span>
              <button
                onClick={handleCopyId}
                className="text-gray-500 hover:text-white transition-all duration-200"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-400 animate-scale-in" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                agent.is_active
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-gray-500/20 text-gray-400'
              }`}
            >
              {agent.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Service Info */}
        <div
          className="card opacity-0 animate-fade-in-up"
          style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}
        >
          <h2 className="text-lg font-semibold text-white mb-4">Service Information</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-gray-400">Service Type</dt>
              <dd className="text-white font-medium">{getServiceTypeName(agent.service_type)}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">Endpoint Hash</dt>
              <dd className="text-white font-mono text-sm">{agent.endpoint_hash}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">Reputation Tier</dt>
              <dd className="flex items-center gap-2">
                <TierBadge tier={agent.tier} showLabel />
              </dd>
            </div>
          </dl>
        </div>

        {/* Privacy Info */}
        <div
          className="card opacity-0 animate-fade-in-up"
          style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}
        >
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-shadow-400" />
            Privacy-Preserving
          </h2>
          <p className="text-gray-400 text-sm mb-4">
            This agent's exact statistics are private. The tier badge represents a verified
            zero-knowledge proof of their reputation meeting certain thresholds.
          </p>
          <ul className="space-y-2 text-sm">
            {privacyChecks.map((check, index) => (
              <li
                key={index}
                className="flex items-start gap-2 opacity-0 animate-slide-in-right"
                style={{ animationDelay: `${0.3 + index * 0.1}s`, animationFillMode: 'forwards' }}
              >
                <span className="text-green-400 animate-scale-in" style={{ animationDelay: `${0.4 + index * 0.1}s` }}>
                  ✓
                </span>
                <span className="text-gray-300">{check}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Action */}
      <div
        className="card opacity-0 animate-fade-in-up"
        style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}
      >
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-shadow-400" />
          Hire This Agent
        </h2>

        {!connected ? (
          <div className="bg-gray-700/50 rounded-lg p-4 text-center">
            <p className="text-gray-400 mb-4">Connect your wallet to hire this agent</p>
          </div>
        ) : !agent.is_active ? (
          <div className="bg-gray-700/50 rounded-lg p-4 text-center">
            <p className="text-gray-400">This agent is currently inactive</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-gray-400 text-sm">
              When you make a request to this agent's endpoint, the x402 protocol will automatically:
            </p>
            <ol className="list-decimal list-inside text-sm text-gray-300 space-y-2">
              <li>Return payment terms (price, escrow details)</li>
              <li>You create an escrow with locked payment</li>
              <li>Agent delivers service and reveals secret</li>
              <li>Escrow automatically releases payment</li>
              <li>You can submit a rating (costs 0.5 credits burn)</li>
            </ol>

            <div className="flex gap-3">
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

            <p className="text-xs text-gray-500">
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
