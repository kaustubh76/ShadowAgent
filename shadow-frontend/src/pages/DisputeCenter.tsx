import { useState, useEffect } from 'react';
import { AlertTriangle, Shield, CheckCircle, Clock, ArrowRight, Scale, Send, RefreshCw, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useAgentStore, type DisputeInfo, type RefundInfo } from '../stores/agentStore';
import { useWalletStore } from '../stores/walletStore';
import { useToast } from '../contexts/ToastContext';
import { fetchDisputes, fetchRefunds, respondToDispute, acceptRefund, rejectRefund } from '../lib/api';

function getStatusColor(status: DisputeInfo['status']) {
  switch (status) {
    case 'opened': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
    case 'agent_responded': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    case 'resolved_client': return 'text-green-400 bg-green-400/10 border-green-400/20';
    case 'resolved_agent': return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
    case 'resolved_split': return 'text-shadow-400 bg-shadow-400/10 border-shadow-400/20';
    default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
  }
}

function getStatusLabel(status: DisputeInfo['status']) {
  switch (status) {
    case 'opened': return 'Open';
    case 'agent_responded': return 'Agent Responded';
    case 'resolved_client': return 'Resolved - Client Wins';
    case 'resolved_agent': return 'Resolved - Agent Wins';
    case 'resolved_split': return 'Resolved - Split';
    default: return status;
  }
}

function getStatusIcon(status: DisputeInfo['status']) {
  switch (status) {
    case 'opened': return Clock;
    case 'agent_responded': return ArrowRight;
    case 'resolved_client':
    case 'resolved_agent':
    case 'resolved_split': return CheckCircle;
    default: return AlertTriangle;
  }
}

function getRefundStatusColor(status: RefundInfo['status']) {
  switch (status) {
    case 'proposed': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
    case 'accepted': return 'text-green-400 bg-green-400/10 border-green-400/20';
    case 'rejected': return 'text-red-400 bg-red-400/10 border-red-400/20';
    default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
  }
}

export default function DisputeCenter() {
  const { connected, address } = useWalletStore();
  const { disputes } = useAgentStore();
  const toast = useToast();
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved' | 'refunds'>('all');
  const [role, setRole] = useState<'client' | 'agent'>('client');
  const [refunds, setRefunds] = useState<RefundInfo[]>([]);

  // Agent respond state
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [evidenceHash, setEvidenceHash] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Refund action state
  const [processingRefund, setProcessingRefund] = useState<string | null>(null);

  // Fetch disputes based on role
  useEffect(() => {
    if (!connected || !address) return;
    const params = role === 'client' ? { client: address } : { agent_id: address };
    fetchDisputes(params).then(data => {
      useAgentStore.getState().setDisputes(data);
    });
  }, [connected, address, role]);

  // Fetch refunds when refunds tab is selected
  useEffect(() => {
    if (!connected || !address || filter !== 'refunds') return;
    fetchRefunds({ agent_id: role === 'agent' ? address : undefined }).then(data => {
      setRefunds(data);
    });
  }, [connected, address, filter, role]);

  const filteredDisputes = disputes.filter(d => {
    if (filter === 'open') return d.status === 'opened' || d.status === 'agent_responded';
    if (filter === 'resolved') return d.status.startsWith('resolved');
    return true;
  });

  const handleRespond = async (jobHash: string) => {
    if (!evidenceHash.trim()) return;
    setIsSubmitting(true);
    try {
      const result = await respondToDispute(jobHash, evidenceHash.trim());
      if (result.success) {
        toast.success('Response submitted successfully');
        setRespondingTo(null);
        setEvidenceHash('');
        // Re-fetch disputes
        const params = role === 'client' ? { client: address! } : { agent_id: address! };
        const data = await fetchDisputes(params);
        useAgentStore.getState().setDisputes(data);
      } else {
        toast.error(result.error || 'Failed to respond');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefundAction = async (jobHash: string, action: 'accept' | 'reject') => {
    setProcessingRefund(jobHash);
    try {
      const result = action === 'accept' ? await acceptRefund(jobHash) : await rejectRefund(jobHash);
      if (result.success) {
        toast.success(`Refund ${action}ed successfully`);
        // Re-fetch refunds
        const data = await fetchRefunds({ agent_id: role === 'agent' ? address! : undefined });
        setRefunds(data);
      } else {
        toast.error(result.error || `Failed to ${action} refund`);
      }
    } finally {
      setProcessingRefund(null);
    }
  };

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-shadow-600/10 border border-shadow-500/20 flex items-center justify-center mb-6">
          <Shield className="w-8 h-8 text-shadow-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">Dispute Center</h1>
        <p className="text-gray-400 text-sm mb-6">Connect your wallet to view and manage disputes.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/20 flex items-center justify-center">
              <Scale className="w-5 h-5 text-red-400" />
            </div>
            Dispute Center
          </h1>
          <p className="text-gray-400 text-sm mt-1">Manage disputes on escrow payments</p>
        </div>
      </div>

      {/* Role Toggle */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-gray-500">View as:</span>
        <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-0.5 border border-white/[0.04]">
          {(['client', 'agent'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-300 ${
                role === r
                  ? 'bg-shadow-600/20 text-shadow-300'
                  : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 bg-white/[0.03] rounded-xl p-1 border border-white/[0.04] mb-6 w-fit">
        {(['all', 'open', 'resolved', 'refunds'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
              filter === f
                ? 'bg-shadow-600/20 text-shadow-300'
                : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            {f === 'refunds' ? 'Refunds' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Refunds Tab */}
      {filter === 'refunds' ? (
        refunds.length === 0 ? (
          <div className="text-center py-16 bg-white/[0.02] rounded-2xl border border-white/[0.04]">
            <RefreshCw className="w-10 h-10 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-sm">No refund proposals found.</p>
            <p className="text-gray-500 text-xs mt-1">
              Partial refund proposals appear here when agents propose a split.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {refunds.map((refund, index) => (
              <div
                key={refund.job_hash + index}
                className="bg-white/[0.02] rounded-xl border border-white/[0.06] p-5 hover:border-white/[0.1] transition-all duration-300"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${getRefundStatusColor(refund.status)}`}>
                        {refund.status.charAt(0).toUpperCase() + refund.status.slice(1)}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-gray-300">
                        <span className="text-gray-500">Job:</span>{' '}
                        <span className="font-mono text-xs">{refund.job_hash.slice(0, 16)}...</span>
                      </p>
                      <p className="text-sm text-gray-300">
                        <span className="text-gray-500">Agent:</span>{' '}
                        <span className="font-mono text-xs">{refund.agent.slice(0, 16)}...</span>
                      </p>
                      <p className="text-sm text-gray-300">
                        <span className="text-gray-500">Split:</span>{' '}
                        <span className="text-xs">
                          Agent {(refund.agent_amount / 1_000_000).toFixed(2)} / Client {(refund.client_amount / 1_000_000).toFixed(2)} credits
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-white">
                      {(refund.total_amount / 1_000_000).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500">total credits</p>
                  </div>
                </div>

                {/* Accept/Reject actions for proposed refunds */}
                {refund.status === 'proposed' && (
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/[0.04]">
                    <button
                      onClick={() => handleRefundAction(refund.job_hash, 'accept')}
                      disabled={processingRefund === refund.job_hash}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600/20 text-green-400 border border-green-500/30 hover:bg-green-600/30 transition-all disabled:opacity-50"
                    >
                      <ThumbsUp className="w-3 h-3" />
                      Accept
                    </button>
                    <button
                      onClick={() => handleRefundAction(refund.job_hash, 'reject')}
                      disabled={processingRefund === refund.job_hash}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 transition-all disabled:opacity-50"
                    >
                      <ThumbsDown className="w-3 h-3" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        /* Disputes List */
        filteredDisputes.length === 0 ? (
          <div className="text-center py-16 bg-white/[0.02] rounded-2xl border border-white/[0.04]">
            <AlertTriangle className="w-10 h-10 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-sm">
              {filter === 'all' ? 'No disputes found.' : `No ${filter} disputes.`}
            </p>
            <p className="text-gray-500 text-xs mt-1">
              Disputes are created when a client has an issue with an escrow payment.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDisputes.map((dispute, index) => {
              const StatusIcon = getStatusIcon(dispute.status);
              const canRespond = role === 'agent' && dispute.status === 'opened' && address === dispute.agent;
              return (
                <div
                  key={dispute.job_hash + index}
                  className="bg-white/[0.02] rounded-xl border border-white/[0.06] p-5 hover:border-white/[0.1] transition-all duration-300"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${getStatusColor(dispute.status)}`}>
                          <StatusIcon className="w-3 h-3" />
                          {getStatusLabel(dispute.status)}
                        </span>
                        {dispute.resolution_agent_pct > 0 && dispute.status.startsWith('resolved') && (
                          <span className="text-xs text-gray-500">
                            Agent: {dispute.resolution_agent_pct}% | Client: {100 - dispute.resolution_agent_pct}%
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-gray-300">
                          <span className="text-gray-500">Job:</span>{' '}
                          <span className="font-mono text-xs">{dispute.job_hash.slice(0, 16)}...</span>
                        </p>
                        <p className="text-sm text-gray-300">
                          <span className="text-gray-500">{role === 'client' ? 'Agent' : 'Client'}:</span>{' '}
                          <span className="font-mono text-xs">
                            {(role === 'client' ? dispute.agent : dispute.client).slice(0, 16)}...
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-white">
                        {(dispute.escrow_amount / 1_000_000).toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500">credits</p>
                    </div>
                  </div>

                  {/* Agent Respond Action */}
                  {canRespond && respondingTo !== dispute.job_hash && (
                    <div className="mt-3 pt-3 border-t border-white/[0.04]">
                      <button
                        onClick={() => setRespondingTo(dispute.job_hash)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 transition-all"
                      >
                        <Send className="w-3 h-3" />
                        Respond with Evidence
                      </button>
                    </div>
                  )}

                  {/* Inline Respond Form */}
                  {respondingTo === dispute.job_hash && (
                    <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-3">
                      <input
                        type="text"
                        value={evidenceHash}
                        onChange={(e) => setEvidenceHash(e.target.value)}
                        placeholder="Enter evidence hash"
                        className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/40 font-mono"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRespond(dispute.job_hash)}
                          disabled={isSubmitting || !evidenceHash.trim()}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-50"
                        >
                          {isSubmitting ? 'Submitting...' : 'Submit Response'}
                        </button>
                        <button
                          onClick={() => { setRespondingTo(null); setEvidenceHash(''); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white hover:bg-white/[0.04] transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {dispute.opened_at && !respondingTo && (
                    <p className="text-xs text-gray-600 mt-3 pt-3 border-t border-white/[0.04]">
                      Opened: {new Date(dispute.opened_at).toLocaleString()}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
