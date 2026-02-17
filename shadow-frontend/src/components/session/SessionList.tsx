import { Zap, Pause, Play, XCircle, Clock, TrendingUp } from 'lucide-react';
import { type SessionInfo } from '../../stores/agentStore';

interface SessionListProps {
  activeSessions: SessionInfo[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onClose: (id: string) => void;
  onCreateClick: () => void;
  closedCount: number;
}

export default function SessionList({ activeSessions, onPause, onResume, onClose, onCreateClick, closedCount }: SessionListProps) {
  if (activeSessions.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
          <Zap className="w-6 h-6 text-gray-600" />
        </div>
        <p className="text-gray-400 text-sm mb-1">No active sessions</p>
        <p className="text-gray-600 text-xs">Create a session to enable autonomous agent payments</p>
        <button
          onClick={onCreateClick}
          className="mt-4 px-4 py-2 rounded-lg bg-amber-600/10 text-amber-400 text-sm font-medium hover:bg-amber-600/20 transition-colors"
        >
          Create Session
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {activeSessions.map(session => (
          <SessionCard
            key={session.session_id}
            session={session}
            onPause={onPause}
            onResume={onResume}
            onClose={onClose}
          />
        ))}
      </div>

      {closedCount > 0 && (
        <div className="mt-6 pt-4 border-t border-white/[0.04]">
          <p className="text-xs text-gray-600 mb-2">
            {closedCount} closed session(s)
          </p>
        </div>
      )}
    </>
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
