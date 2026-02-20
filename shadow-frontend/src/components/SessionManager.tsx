import { useState, useEffect } from 'react';
import { Zap, X } from 'lucide-react';
import { useAgentStore, type SessionInfo } from '../stores/agentStore';
import { listSessions, closeSession, pauseSession, resumeSession, listPolicies } from '../lib/api';
import { useWalletStore } from '../stores/walletStore';
import CreateSessionForm from './session/CreateSessionForm';
import SessionList from './session/SessionList';
import PolicyManager from './session/PolicyManager';
import SessionRequestModal from './session/SessionRequestModal';
import SessionSettleModal from './session/SessionSettleModal';

interface SessionManagerProps {
  isOpen: boolean;
  onClose: () => void;
  agentAddress: string;
}

export default function SessionManager({ isOpen, onClose, agentAddress }: SessionManagerProps) {
  const { address } = useWalletStore();
  const { sessions, setSessions, updateSession, addTransaction, setPolicies, policies } = useAgentStore();
  const [tab, setTab] = useState<'create' | 'active' | 'policies'>('active');
  const [requestSession, setRequestSession] = useState<SessionInfo | null>(null);
  const [settleSession, setSettleSession] = useState<SessionInfo | null>(null);

  // Load sessions and policies for this agent on open
  useEffect(() => {
    if (isOpen && address) {
      listSessions({ client: address, agent: agentAddress }).then(setSessions);
      listPolicies({ owner: address }).then(setPolicies);
    }
  }, [isOpen, address, agentAddress, setSessions, setPolicies]);

  const agentSessions = sessions.filter(
    s => s.agent === agentAddress && (s.client === address || s.client === 'unknown')
  );
  const activeSessions = agentSessions.filter(s => s.status === 'active' || s.status === 'paused');
  const closedCount = agentSessions.filter(s => s.status === 'closed').length;

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
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-manager-title"
        className="relative bg-surface-1 rounded-2xl border border-white/[0.08] shadow-2xl max-w-lg w-full p-6 animate-scale-in max-h-[85vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 id="session-manager-title" className="text-lg font-bold text-white">Session Payments</h2>
              <p className="text-xs text-gray-500">1 signature, unlimited requests within bounds</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.04] text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/[0.02] rounded-xl p-1 mb-6">
          {(['active', 'create', 'policies'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t
                  ? 'bg-surface-2 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t === 'active' ? `Active (${activeSessions.length})` : t === 'create' ? 'New Session' : `Policies (${policies.length})`}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === 'policies' ? (
          <PolicyManager agentAddress={agentAddress} onSessionCreated={() => setTab('active')} />
        ) : tab === 'create' ? (
          <CreateSessionForm agentAddress={agentAddress} onClose={onClose} onCreated={() => setTab('active')} />
        ) : (
          <SessionList
            activeSessions={activeSessions}
            onPause={handlePause}
            onResume={handleResume}
            onClose={handleClose}
            onCreateClick={() => setTab('create')}
            closedCount={closedCount}
            onRequest={(session) => setRequestSession(session)}
            onSettle={(session) => setSettleSession(session)}
          />
        )}

        {/* Session Request Modal */}
        {requestSession && (
          <SessionRequestModal
            isOpen={!!requestSession}
            onClose={() => setRequestSession(null)}
            session={requestSession}
          />
        )}

        {/* Session Settle Modal */}
        {settleSession && (
          <SessionSettleModal
            isOpen={!!settleSession}
            onClose={() => setSettleSession(null)}
            session={settleSession}
          />
        )}
      </div>
    </div>
  );
}
