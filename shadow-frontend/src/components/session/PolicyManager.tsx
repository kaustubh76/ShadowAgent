import { useState } from 'react';
import { Zap, Shield } from 'lucide-react';
import { useAgentStore, type PolicyInfo } from '../../stores/agentStore';
import { createPolicy, createSessionFromPolicy } from '../../lib/api';
import { useWalletStore } from '../../stores/walletStore';

interface PolicyManagerProps {
  agentAddress: string;
  onSessionCreated: () => void;
}

// Convert hours to blocks (~6s/block)
const hoursToBlocks = (hours: number) => Math.floor((hours * 3600) / 6);

export default function PolicyManager({ agentAddress, onSessionCreated }: PolicyManagerProps) {
  const { address } = useWalletStore();
  const { policies, addPolicy, addSession, addTransaction } = useAgentStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create policy form
  const [policyMaxSession, setPolicyMaxSession] = useState('50');
  const [policyMaxRequest, setPolicyMaxRequest] = useState('1');
  const [policyRequireProofs, setPolicyRequireProofs] = useState(false);

  // Create from policy
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [maxTotal, setMaxTotal] = useState('10');
  const [maxPerRequest, setMaxPerRequest] = useState('0.5');
  const [rateLimit, setRateLimit] = useState('100');
  const [durationHours, setDurationHours] = useState('24');

  const handleCreatePolicy = async () => {
    setError(null);
    setIsSubmitting(true);

    const maxSessionMicrocredits = Math.round(parseFloat(policyMaxSession) * 1_000_000);
    const maxRequestMicrocredits = Math.round(parseFloat(policyMaxRequest) * 1_000_000);

    if (maxRequestMicrocredits > maxSessionMicrocredits) {
      setError('Per-request limit cannot exceed session value');
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await createPolicy({
        owner: address || 'unknown',
        max_session_value: maxSessionMicrocredits,
        max_single_request: maxRequestMicrocredits,
        require_proofs: policyRequireProofs,
      });

      if (result.success && result.policy) {
        addPolicy(result.policy);
        setPolicyMaxSession('50');
        setPolicyMaxRequest('1');
        setPolicyRequireProofs(false);
      } else {
        setError(result.error || 'Failed to create policy');
      }
    } catch {
      setError('Network error creating policy');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateFromPolicy = async (policy: PolicyInfo) => {
    setError(null);
    setIsSubmitting(true);

    const totalMicrocredits = Math.round(parseFloat(maxTotal) * 1_000_000);
    const perRequestMicrocredits = Math.round(parseFloat(maxPerRequest) * 1_000_000);
    const blocks = hoursToBlocks(parseFloat(durationHours));

    try {
      const result = await createSessionFromPolicy(policy.policy_id, {
        agent: agentAddress,
        client: address || 'unknown',
        max_total: totalMicrocredits,
        max_per_request: perRequestMicrocredits,
        rate_limit: parseInt(rateLimit),
        duration_blocks: blocks,
      });

      if (result.success && result.session) {
        addSession(result.session);
        addTransaction({ type: 'session_created', agentId: agentAddress, amount: totalMicrocredits });
        setSelectedPolicyId(null);
        onSessionCreated();
      } else {
        setError(result.error || 'Failed to create session from policy');
      }
    } catch {
      setError('Network error creating session from policy');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Create Policy Form */}
      {!selectedPolicyId && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-400" />
            Create Spending Policy
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Max Session Value (credits)</label>
              <input
                type="number"
                min="0.01"
                step="1"
                value={policyMaxSession}
                onChange={(e) => setPolicyMaxSession(e.target.value)}
                className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Max Single Request (credits)</label>
              <input
                type="number"
                min="0.001"
                step="0.1"
                value={policyMaxRequest}
                onChange={(e) => setPolicyMaxRequest(e.target.value)}
                className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={policyRequireProofs}
                onChange={(e) => setPolicyRequireProofs(e.target.checked)}
                className="rounded border-white/10 bg-surface-2"
              />
              Require reputation proofs
            </label>
          </div>

          {error && (
            <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3 mt-3">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <button
            onClick={handleCreatePolicy}
            disabled={isSubmitting || !policyMaxSession || !policyMaxRequest}
            className="mt-3 w-full px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? 'Creating...' : (
              <>
                <Shield className="w-4 h-4" />
                Create Policy
              </>
            )}
          </button>
        </div>
      )}

      {/* Existing Policies */}
      {policies.length > 0 && !selectedPolicyId && (
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">Your Policies</h3>
          <div className="space-y-2">
            {policies.map(policy => (
              <div key={policy.policy_id} className="bg-white/[0.02] rounded-xl border border-white/[0.04] p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-gray-500">{policy.policy_id.slice(0, 20)}...</span>
                  <span className="text-xs text-purple-400 font-medium">
                    {policy.require_proofs ? 'Proofs Required' : 'No Proofs'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                  <div>
                    <span className="text-gray-500">Max Session:</span>
                    <span className="text-white ml-1">{(policy.max_session_value / 1_000_000).toFixed(2)} cr</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Max Request:</span>
                    <span className="text-white ml-1">{(policy.max_single_request / 1_000_000).toFixed(2)} cr</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPolicyId(policy.policy_id)}
                  className="w-full px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors"
                >
                  Create Session from Policy
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Session from Policy form */}
      {selectedPolicyId && (() => {
        const policy = policies.find(p => p.policy_id === selectedPolicyId);
        if (!policy) return null;
        return (
          <div>
            <button
              onClick={() => setSelectedPolicyId(null)}
              className="text-xs text-gray-500 hover:text-white mb-3 flex items-center gap-1"
            >
              &larr; Back to policies
            </button>
            <h3 className="text-sm font-semibold text-white mb-1">New Session from Policy</h3>
            <p className="text-xs text-gray-500 mb-3">
              Bounded by: max {(policy.max_session_value / 1_000_000).toFixed(2)} cr session, {(policy.max_single_request / 1_000_000).toFixed(2)} cr/request
            </p>

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Total Budget (credits)</label>
                <input
                  type="number"
                  min="0.01"
                  max={(policy.max_session_value / 1_000_000)}
                  step="0.1"
                  value={maxTotal}
                  onChange={(e) => setMaxTotal(e.target.value)}
                  className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/40"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Per-Request Cap (credits)</label>
                <input
                  type="number"
                  min="0.001"
                  max={(policy.max_single_request / 1_000_000)}
                  step="0.01"
                  value={maxPerRequest}
                  onChange={(e) => setMaxPerRequest(e.target.value)}
                  className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/40"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Rate Limit</label>
                  <input
                    type="number"
                    min="1"
                    value={rateLimit}
                    onChange={(e) => setRateLimit(e.target.value)}
                    className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/40"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Duration (hours)</label>
                  <input
                    type="number"
                    min="1"
                    value={durationHours}
                    onChange={(e) => setDurationHours(e.target.value)}
                    className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/40"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3 mb-3">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            <button
              onClick={() => handleCreateFromPolicy(policy)}
              disabled={isSubmitting}
              className="w-full px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white transition-all text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? 'Creating...' : (
                <>
                  <Zap className="w-4 h-4" />
                  Create Session
                </>
              )}
            </button>
          </div>
        );
      })()}

      {policies.length === 0 && !selectedPolicyId && (
        <div className="bg-purple-500/5 border border-purple-500/10 rounded-xl p-3 mt-4">
          <div className="flex items-center gap-2 text-xs text-purple-400">
            <Shield className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Policies let you define reusable spending rules. Sessions created from a policy are automatically bounded.</span>
          </div>
        </div>
      )}
    </>
  );
}
