import { useState, useEffect } from 'react';
import { Zap, X, Pause, Play, XCircle, Clock, TrendingUp, Shield } from 'lucide-react';
import { useAgentStore, type SessionInfo, type PolicyInfo } from '../stores/agentStore';
import { createSession, listSessions, closeSession, pauseSession, resumeSession, createPolicy, listPolicies, createSessionFromPolicy } from '../lib/api';
import { useWalletStore } from '../stores/walletStore';

interface SessionManagerProps {
  isOpen: boolean;
  onClose: () => void;
  agentAddress: string;
}

export default function SessionManager({ isOpen, onClose, agentAddress }: SessionManagerProps) {
  const { address } = useWalletStore();
  const { sessions, setSessions, addSession, updateSession, addTransaction, policies, setPolicies, addPolicy } = useAgentStore();
  const [tab, setTab] = useState<'create' | 'active' | 'policies'>('active');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create session form
  const [maxTotal, setMaxTotal] = useState('10');
  const [maxPerRequest, setMaxPerRequest] = useState('0.5');
  const [rateLimit, setRateLimit] = useState('100');
  const [durationHours, setDurationHours] = useState('24');

  // Create policy form
  const [policyMaxSession, setPolicyMaxSession] = useState('50');
  const [policyMaxRequest, setPolicyMaxRequest] = useState('1');
  const [policyRequireProofs, setPolicyRequireProofs] = useState(false);

  // Create from policy
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);

  // Load sessions and policies for this agent on open
  useEffect(() => {
    if (isOpen && address) {
      loadSessions();
      loadPolicies();
    }
  }, [isOpen, address]);

  const loadSessions = async () => {
    const results = await listSessions({ client: address || undefined, agent: agentAddress });
    setSessions(results);
  };

  const loadPolicies = async () => {
    const results = await listPolicies({ owner: address || undefined });
    setPolicies(results);
  };

  const agentSessions = sessions.filter(
    s => s.agent === agentAddress && (s.client === address || s.client === 'unknown')
  );
  const activeSessions = agentSessions.filter(s => s.status === 'active' || s.status === 'paused');

  // Convert hours to blocks (~6s/block)
  const hoursToBlocks = (hours: number) => Math.floor((hours * 3600) / 6);

  const handleCreate = async () => {
    setError(null);
    setIsSubmitting(true);

    const totalMicrocredits = Math.round(parseFloat(maxTotal) * 1_000_000);
    const perRequestMicrocredits = Math.round(parseFloat(maxPerRequest) * 1_000_000);
    const blocks = hoursToBlocks(parseFloat(durationHours));

    if (perRequestMicrocredits > totalMicrocredits) {
      setError('Per-request limit cannot exceed total budget');
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await createSession({
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
        setTab('active');
        setMaxTotal('10');
        setMaxPerRequest('0.5');
        setRateLimit('100');
        setDurationHours('24');
      } else {
        setError(result.error || 'Failed to create session');
      }
    } catch {
      setError('Network error creating session');
    } finally {
      setIsSubmitting(false);
    }
  };

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
        setTab('active');
      } else {
        setError(result.error || 'Failed to create session from policy');
      }
    } catch {
      setError('Network error creating session from policy');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = async (sessionId: string) => {
    const result = await closeSession(sessionId);
    if (result.success) {
      updateSession(sessionId, { status: 'closed' });
      addTransaction({ type: 'session_closed', agentId: agentAddress, amount: result.refund_amount });
    }
  };

  const handlePause = async (sessionId: string) => {
    const result = await pauseSession(sessionId);
    if (result.success) {
      updateSession(sessionId, { status: 'paused' });
    }
  };

  const handleResume = async (sessionId: string) => {
    const result = await resumeSession(sessionId);
    if (result.success) {
      updateSession(sessionId, { status: 'active' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-1 rounded-2xl border border-white/[0.08] shadow-2xl max-w-lg w-full p-6 animate-scale-in max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Session Payments</h2>
              <p className="text-xs text-gray-500">1 signature, unlimited requests within bounds</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.04] text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/[0.02] rounded-xl p-1 mb-6">
          <button
            onClick={() => setTab('active')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'active'
                ? 'bg-surface-2 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Active ({activeSessions.length})
          </button>
          <button
            onClick={() => setTab('create')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'create'
                ? 'bg-surface-2 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            New Session
          </button>
          <button
            onClick={() => setTab('policies')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'policies'
                ? 'bg-surface-2 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Policies ({policies.length})
          </button>
        </div>

        {tab === 'policies' ? (
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
        ) : tab === 'create' ? (
          <>
            {/* Agent Summary */}
            <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] p-4 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Agent</span>
                <span className="text-gray-300 font-mono text-xs">{agentAddress.slice(0, 16)}...</span>
              </div>
            </div>

            {/* Session Parameters */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-sm text-gray-400 mb-1.5 block">Total Budget (credits)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.1"
                  value={maxTotal}
                  onChange={(e) => setMaxTotal(e.target.value)}
                  className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500/40"
                  placeholder="10"
                />
                <p className="text-xs text-gray-600 mt-1">Maximum total spend for this session</p>
              </div>

              <div>
                <label className="text-sm text-gray-400 mb-1.5 block">Per-Request Cap (credits)</label>
                <input
                  type="number"
                  min="0.001"
                  step="0.01"
                  value={maxPerRequest}
                  onChange={(e) => setMaxPerRequest(e.target.value)}
                  className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500/40"
                  placeholder="0.5"
                />
                <p className="text-xs text-gray-600 mt-1">Maximum charge per individual request</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-400 mb-1.5 block">Rate Limit</label>
                  <input
                    type="number"
                    min="1"
                    value={rateLimit}
                    onChange={(e) => setRateLimit(e.target.value)}
                    className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500/40"
                    placeholder="100"
                  />
                  <p className="text-xs text-gray-600 mt-1">Requests per window</p>
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1.5 block">Duration (hours)</label>
                  <input
                    type="number"
                    min="1"
                    value={durationHours}
                    onChange={(e) => setDurationHours(e.target.value)}
                    className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500/40"
                    placeholder="24"
                  />
                  <p className="text-xs text-gray-600 mt-1">~{hoursToBlocks(parseFloat(durationHours) || 0).toLocaleString()} blocks</p>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3 mb-6">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            {/* Info */}
            <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 mb-6">
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <Zap className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Once created, the agent can make requests without your signature — within the bounds you set.</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/[0.08] text-gray-400 hover:text-white hover:bg-white/[0.04] transition-all text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={isSubmitting || !maxTotal || !maxPerRequest || !rateLimit || !durationHours}
                className="flex-1 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? 'Creating...' : (
                  <>
                    <Zap className="w-4 h-4" />
                    Create Session
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Active Sessions List */}
            {activeSessions.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-6 h-6 text-gray-600" />
                </div>
                <p className="text-gray-400 text-sm mb-1">No active sessions</p>
                <p className="text-gray-600 text-xs">Create a session to enable autonomous agent payments</p>
                <button
                  onClick={() => setTab('create')}
                  className="mt-4 px-4 py-2 rounded-lg bg-amber-600/10 text-amber-400 text-sm font-medium hover:bg-amber-600/20 transition-colors"
                >
                  Create Session
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {activeSessions.map(session => (
                  <SessionCard
                    key={session.session_id}
                    session={session}
                    onPause={handlePause}
                    onResume={handleResume}
                    onClose={handleClose}
                  />
                ))}
              </div>
            )}

            {/* Closed Sessions (collapsed) */}
            {agentSessions.filter(s => s.status === 'closed').length > 0 && (
              <div className="mt-6 pt-4 border-t border-white/[0.04]">
                <p className="text-xs text-gray-600 mb-2">
                  {agentSessions.filter(s => s.status === 'closed').length} closed session(s)
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SessionCard({
  session,
  onPause,
  onResume,
  onClose,
}: {
  session: SessionInfo;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const spentCredits = session.spent / 1_000_000;
  const maxCredits = session.max_total / 1_000_000;
  const spentPct = session.max_total > 0 ? (session.spent / session.max_total) * 100 : 0;

  return (
    <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] p-4">
      {/* Status badge + ID */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            session.status === 'active' ? 'bg-green-400' : 'bg-yellow-400'
          }`} />
          <span className="text-xs font-mono text-gray-500">
            {session.session_id.slice(0, 16)}...
          </span>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          session.status === 'active'
            ? 'bg-green-500/10 text-green-400'
            : 'bg-yellow-500/10 text-yellow-400'
        }`}>
          {session.status}
        </span>
      </div>

      {/* Spending progress */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-gray-400 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            Spent
          </span>
          <span className="text-white font-medium">
            {spentCredits.toFixed(2)} / {maxCredits.toFixed(2)} credits
          </span>
        </div>
        <div className="w-full bg-white/[0.04] rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${
              spentPct > 80 ? 'bg-red-400' : spentPct > 50 ? 'bg-amber-400' : 'bg-green-400'
            }`}
            style={{ width: `${Math.min(spentPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center">
          <p className="text-xs text-gray-600">Requests</p>
          <p className="text-sm text-white font-medium">{session.request_count}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-600">Per-Request</p>
          <p className="text-sm text-white font-medium">{(session.max_per_request / 1_000_000).toFixed(2)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-600">Rate Limit</p>
          <p className="text-sm text-white font-medium">{session.rate_limit}/win</p>
        </div>
      </div>

      {/* Time */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
        <Clock className="w-3 h-3" />
        <span>Created {new Date(session.created_at).toLocaleDateString()}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {session.status === 'active' ? (
          <button
            onClick={() => onPause(session.session_id)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 text-xs font-medium hover:bg-yellow-500/20 transition-colors"
          >
            <Pause className="w-3 h-3" />
            Pause
          </button>
        ) : (
          <button
            onClick={() => onResume(session.session_id)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-medium hover:bg-green-500/20 transition-colors"
          >
            <Play className="w-3 h-3" />
            Resume
          </button>
        )}
        <button
          onClick={() => onClose(session.session_id)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors"
        >
          <XCircle className="w-3 h-3" />
          Close
        </button>
      </div>
    </div>
  );
}
