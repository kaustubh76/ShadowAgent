import { Zap, TrendingUp, Clock } from 'lucide-react';
import { useAgentStore } from '../../stores/agentStore';

export default function ActiveSessionsPanel({ agentAddress }: { agentAddress: string }) {
  const { sessions } = useAgentStore();
  const activeSessions = sessions.filter(
    s => s.agent === agentAddress && (s.status === 'active' || s.status === 'paused')
  );

  if (activeSessions.length === 0) return null;

  return (
    <div className="card animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
          <Zap className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Active Sessions</h2>
          <p className="text-xs text-gray-500">{activeSessions.length} client session(s) with pre-authorized spending</p>
        </div>
      </div>

      <div className="space-y-3">
        {activeSessions.map(session => {
          const spentCredits = session.spent / 1_000_000;
          const maxCredits = session.max_total / 1_000_000;
          const spentPct = session.max_total > 0 ? (session.spent / session.max_total) * 100 : 0;

          return (
            <div key={session.session_id} className="bg-white/[0.02] rounded-xl border border-white/[0.04] p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${session.status === 'active' ? 'bg-green-400' : 'bg-yellow-400'}`} />
                  <span className="text-xs font-mono text-gray-500">{session.session_id.slice(0, 16)}...</span>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  session.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'
                }`}>
                  {session.status}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-gray-400 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Budget Used
                </span>
                <span className="text-white font-medium">{spentCredits.toFixed(2)} / {maxCredits.toFixed(2)} credits</span>
              </div>
              <div className="w-full bg-white/[0.04] rounded-full h-1.5 mb-2">
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    spentPct > 80 ? 'bg-red-400' : spentPct > 50 ? 'bg-amber-400' : 'bg-green-400'
                  }`}
                  style={{ width: `${Math.min(spentPct, 100)}%` }}
                />
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>{session.request_count} requests</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(session.created_at).toLocaleDateString()}
                </span>
                <span className="text-gray-600">Client: {session.client.slice(0, 12)}...</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
