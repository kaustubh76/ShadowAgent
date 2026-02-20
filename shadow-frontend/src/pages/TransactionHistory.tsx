import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock, Lock, CheckCircle, Star, AlertTriangle, Scale,
  ArrowLeftRight, ThumbsUp, Zap, XCircle, Send, Banknote,
  Briefcase, Play, type LucideIcon,
} from 'lucide-react';
import { useAgentStore } from '../stores/agentStore';
import { timeAgo } from '../utils/timeAgo';

type TxType = 'escrow_created' | 'escrow_claimed' | 'rating_submitted'
  | 'dispute_opened' | 'dispute_resolved' | 'partial_refund_proposed'
  | 'partial_refund_accepted' | 'session_created' | 'session_closed'
  | 'session_request' | 'session_settled' | 'job_created'
  | 'job_started' | 'job_completed' | 'job_cancelled';

const TX_CONFIG: Record<TxType, { label: string; icon: LucideIcon; color: string }> = {
  escrow_created:          { label: 'Escrow Created',   icon: Lock,           color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  escrow_claimed:          { label: 'Escrow Claimed',   icon: CheckCircle,    color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  rating_submitted:        { label: 'Rating Submitted', icon: Star,           color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  dispute_opened:          { label: 'Dispute Opened',   icon: AlertTriangle,  color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  dispute_resolved:        { label: 'Dispute Resolved', icon: Scale,          color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  partial_refund_proposed: { label: 'Refund Proposed',  icon: ArrowLeftRight, color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
  partial_refund_accepted: { label: 'Refund Accepted',  icon: ThumbsUp,       color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
  session_created:         { label: 'Session Created',  icon: Zap,            color: 'text-shadow-400 bg-shadow-400/10 border-shadow-400/20' },
  session_closed:          { label: 'Session Closed',   icon: XCircle,        color: 'text-gray-400 bg-gray-400/10 border-gray-400/20' },
  session_request:         { label: 'Session Request',  icon: Send,           color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20' },
  session_settled:         { label: 'Session Settled',  icon: Banknote,       color: 'text-teal-400 bg-teal-400/10 border-teal-400/20' },
  job_created:             { label: 'Job Created',      icon: Briefcase,      color: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20' },
  job_started:             { label: 'Job Started',      icon: Play,           color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  job_completed:           { label: 'Job Completed',    icon: CheckCircle,    color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  job_cancelled:           { label: 'Job Cancelled',    icon: XCircle,        color: 'text-red-400 bg-red-400/10 border-red-400/20' },
};

const FILTER_TABS = [
  { key: 'all',     label: 'All' },
  { key: 'escrow',  label: 'Escrows',  types: ['escrow_created', 'escrow_claimed'] },
  { key: 'session', label: 'Sessions', types: ['session_created', 'session_closed', 'session_request', 'session_settled'] },
  { key: 'dispute', label: 'Disputes', types: ['dispute_opened', 'dispute_resolved', 'partial_refund_proposed', 'partial_refund_accepted'] },
  { key: 'rating',  label: 'Ratings',  types: ['rating_submitted'] },
  { key: 'job',     label: 'Jobs',     types: ['job_created', 'job_started', 'job_completed', 'job_cancelled'] },
] as const;

export default function TransactionHistory() {
  const { transactions, clearTransactions } = useAgentStore();
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return transactions;
    const tab = FILTER_TABS.find(t => t.key === filter);
    if (!tab || !('types' in tab)) return transactions;
    return transactions.filter(tx => (tab.types as readonly string[]).includes(tx.type));
  }, [transactions, filter]);

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-shadow-500/20 to-blue-500/20 border border-shadow-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-shadow-400" />
            </div>
            Activity
          </h1>
          <p className="text-gray-400 text-sm mt-1">Your recent transactions and actions</p>
        </div>
        {transactions.length > 0 && (
          <button
            onClick={clearTransactions}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors"
          >
            Clear History
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div role="tablist" aria-label="Transaction filters" className="flex items-center gap-1 bg-white/[0.03] rounded-xl p-1 border border-white/[0.04] mb-6 w-fit">
        {FILTER_TABS.map(f => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
              filter === f.key
                ? 'bg-shadow-600/20 text-shadow-300'
                : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Transaction List or Empty State */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white/[0.02] rounded-2xl border border-white/[0.04]">
          <Clock className="w-10 h-10 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-sm">
            {filter === 'all' ? 'No activity yet.' : `No ${FILTER_TABS.find(t => t.key === filter)?.label.toLowerCase()} activity.`}
          </p>
          <p className="text-gray-500 text-xs mt-1">
            Transactions will appear here as you interact with agents.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((tx, index) => {
            const config = TX_CONFIG[tx.type];
            const Icon = config.icon;
            return (
              <div
                key={tx.id}
                className="bg-white/[0.02] rounded-xl border border-white/[0.06] p-5 hover:border-white/[0.1] transition-all duration-300 opacity-0 animate-fade-in-up"
                style={{ animationDelay: `${index * 0.05}s`, animationFillMode: 'forwards' }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${config.color}`}>
                      <Icon className="w-3 h-3" />
                      {config.label}
                    </span>
                    <Link
                      to={`/agents/${tx.agentId}`}
                      className="font-mono text-xs text-gray-400 hover:text-shadow-300 transition-colors truncate"
                    >
                      {tx.agentId.slice(0, 16)}...
                    </Link>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    {tx.amount != null && (
                      <span className="text-sm font-semibold text-white">
                        {(tx.amount / 1_000_000).toFixed(2)}
                        <span className="text-xs text-gray-500 ml-1">credits</span>
                      </span>
                    )}
                    <span className="text-xs text-gray-600 whitespace-nowrap">
                      {timeAgo(tx.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
