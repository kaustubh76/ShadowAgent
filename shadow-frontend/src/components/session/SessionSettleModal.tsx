import { useState } from 'react';
import { DollarSign, Loader2, X, CheckCircle } from 'lucide-react';
import { settleSession } from '../../lib/api';
import { useAgentStore, type SessionInfo } from '../../stores/agentStore';
import { useToast } from '../../contexts/ToastContext';

interface SessionSettleModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: SessionInfo;
}

export default function SessionSettleModal({ isOpen, onClose, session }: SessionSettleModalProps) {
  const { updateSession, addTransaction } = useAgentStore();
  const toast = useToast();
  const spentCredits = session.spent / 1_000_000;
  const [amount, setAmount] = useState(spentCredits.toFixed(2));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);

  if (!isOpen) return null;

  const handleSettle = async () => {
    const creditsAmount = parseFloat(amount);
    if (!creditsAmount || creditsAmount <= 0) return;
    if (creditsAmount > spentCredits) {
      setError(`Cannot settle more than spent amount (${spentCredits.toFixed(2)} credits)`);
      return;
    }

    const microcredits = Math.round(creditsAmount * 1_000_000);
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await settleSession(session.session_id, microcredits);

      if (result.success) {
        if (result.session) {
          updateSession(session.session_id, {
            spent: result.session.spent,
            request_count: result.session.request_count,
          });
        }
        addTransaction({
          type: 'session_settled',
          agentId: session.agent,
          amount: microcredits,
        });
        toast.success(`Settled ${creditsAmount.toFixed(2)} credits`);
        setSettled(true);
      } else {
        setError(result.error || 'Settlement failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-settle-title"
        className="relative bg-surface-1 rounded-2xl border border-white/[0.08] shadow-2xl max-w-md w-full p-6 animate-scale-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-500/20 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 id="session-settle-title" className="text-lg font-bold text-white">Settle Session</h2>
              <p className="text-xs text-gray-500">Release accumulated payments to agent</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.04] text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {settled ? (
          /* Success State */
          <div className="text-center py-6 animate-fade-in">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-7 h-7 text-emerald-400" />
            </div>
            <p className="text-white font-medium mb-1">Settlement Complete</p>
            <p className="text-gray-400 text-sm">{amount} credits released to agent</p>
            <button
              onClick={onClose}
              className="mt-6 btn btn-outline"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Session Summary */}
            <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] p-4 mb-5 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Total Spent</span>
                <span className="text-white font-medium">{spentCredits.toFixed(2)} credits</span>
              </div>
              <div className="border-t border-white/[0.04]" />
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Requests Made</span>
                <span className="text-white font-medium">{session.request_count}</span>
              </div>
              <div className="border-t border-white/[0.04]" />
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Agent</span>
                <span className="text-gray-300 font-mono text-xs">{session.agent.slice(0, 16)}...</span>
              </div>
            </div>

            {/* Settlement Amount */}
            <div className="mb-5">
              <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
                Settlement Amount (credits)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0.01"
                  step="0.01"
                  max={spentCredits}
                  className="flex-1 bg-surface-2 border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/40"
                  disabled={isSubmitting}
                />
                <button
                  onClick={() => setAmount(spentCredits.toFixed(2))}
                  className="px-3 py-2.5 rounded-lg text-xs font-medium bg-white/[0.04] text-gray-400 hover:text-white hover:bg-white/[0.08] transition-colors"
                >
                  Full
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/5 border border-red-500/20 text-red-400 text-sm mb-4 animate-fade-in">
                {error}
              </div>
            )}

            {/* Settle Button */}
            <button
              onClick={handleSettle}
              disabled={isSubmitting || !parseFloat(amount) || parseFloat(amount) <= 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Settling...</>
              ) : (
                <><DollarSign className="w-4 h-4" /> Settle {amount || '0'} Credits</>
              )}
            </button>

            <p className="text-xs text-gray-600 text-center mt-3">
              This releases funds from the session to the agent.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
