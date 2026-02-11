import { useState, useEffect } from 'react';
import { AlertTriangle, Shield, CheckCircle, Clock, ArrowRight, Scale } from 'lucide-react';
import { useAgentStore, type DisputeInfo } from '../stores/agentStore';
import { useWalletStore } from '../stores/walletStore';
import { fetchDisputes } from '../lib/api';

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

export default function DisputeCenter() {
  const { connected, address } = useWalletStore();
  const { disputes } = useAgentStore();
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');

  useEffect(() => {
    if (!connected || !address) return;
    fetchDisputes({ client: address }).then(data => {
      useAgentStore.getState().setDisputes(data);
    });
  }, [connected, address]);

  const filteredDisputes = disputes.filter(d => {
    if (filter === 'open') return d.status === 'opened' || d.status === 'agent_responded';
    if (filter === 'resolved') return d.status.startsWith('resolved');
    return true;
  });

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

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 bg-white/[0.03] rounded-xl p-1 border border-white/[0.04] mb-6 w-fit">
        {(['all', 'open', 'resolved'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
              filter === f
                ? 'bg-shadow-600/20 text-shadow-300'
                : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Disputes List */}
      {filteredDisputes.length === 0 ? (
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
                        <span className="text-gray-500">Agent:</span>{' '}
                        <span className="font-mono text-xs">{dispute.agent.slice(0, 16)}...</span>
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
                {dispute.opened_at && (
                  <p className="text-xs text-gray-600 mt-3 pt-3 border-t border-white/[0.04]">
                    Opened: {new Date(dispute.opened_at).toLocaleString()}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
