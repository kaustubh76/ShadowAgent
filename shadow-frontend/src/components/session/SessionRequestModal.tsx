import { useState } from 'react';
import { Send, Loader2, X, Zap, Receipt } from 'lucide-react';
import { sessionRequest } from '../../lib/api';
import { useAgentStore, type SessionInfo } from '../../stores/agentStore';
import { useToast } from '../../contexts/ToastContext';

interface SessionRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: SessionInfo;
}

export default function SessionRequestModal({ isOpen, onClose, session }: SessionRequestModalProps) {
  const { updateSession, addTransaction } = useAgentStore();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [requestHash, setRequestHash] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const remaining = (session.max_total - session.spent) / 1_000_000;
  const maxPerRequest = session.max_per_request / 1_000_000;
  const effectiveMax = Math.min(maxPerRequest, remaining);
  const spentPct = session.max_total > 0 ? (session.spent / session.max_total) * 100 : 0;

  const handleSubmit = async () => {
    const creditsAmount = parseFloat(amount);
    if (!creditsAmount || creditsAmount <= 0) return;
    if (creditsAmount > effectiveMax) {
      setError(`Amount exceeds maximum (${effectiveMax.toFixed(2)} credits)`);
      return;
    }

    const microcredits = Math.round(creditsAmount * 1_000_000);
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await sessionRequest(
        session.session_id,
        microcredits,
        requestHash || undefined
      );

      if (result.success && result.session) {
        updateSession(session.session_id, {
          spent: result.session.spent,
          request_count: result.session.request_count,
          receipts: result.session.receipts,
        });
        addTransaction({
          type: 'session_request',
          agentId: session.agent,
          amount: microcredits,
        });
        toast.success(`Request submitted: ${creditsAmount.toFixed(2)} credits`);
        setAmount('');
        setRequestHash('');
      } else {
        setError(result.error || 'Request failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get latest receipts (last 5)
  const recentReceipts = (session.receipts || []).slice(-5).reverse();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-request-title"
        className="relative bg-surface-1 rounded-2xl border border-white/[0.08] shadow-2xl max-w-md w-full p-6 animate-scale-in max-h-[85vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-shadow-500/20 to-shadow-700/20 border border-shadow-500/20 flex items-center justify-center">
              <Send className="w-5 h-5 text-shadow-400" />
            </div>
            <div>
              <h2 id="session-request-title" className="text-lg font-bold text-white">Make Request</h2>
              <p className="text-xs text-gray-500">Spend within session budget</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.04] text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Budget Progress */}
        <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] p-4 mb-5">
          <div className="flex justify-between text-xs mb-2">
            <span className="text-gray-400 flex items-center gap-1">
              <Zap className="w-3 h-3" />
              Budget
            </span>
            <span className="text-white font-medium">
              {(session.spent / 1_000_000).toFixed(2)} / {(session.max_total / 1_000_000).toFixed(2)} credits
            </span>
          </div>
          <div className="w-full bg-white/[0.04] rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                spentPct > 80 ? 'bg-red-400' : spentPct > 50 ? 'bg-amber-400' : 'bg-green-400'
              }`}
              style={{ width: `${Math.min(spentPct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs mt-2 text-gray-500">
            <span>{remaining.toFixed(2)} remaining</span>
            <span>{session.request_count} requests</span>
          </div>
        </div>

        {/* Amount Input */}
        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
            Amount (credits)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Max ${effectiveMax.toFixed(2)}`}
              min="0.01"
              step="0.01"
              max={effectiveMax}
              className="flex-1 bg-surface-2 border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500/40"
              disabled={isSubmitting}
            />
            <button
              onClick={() => setAmount(effectiveMax.toFixed(2))}
              className="px-3 py-2.5 rounded-lg text-xs font-medium bg-white/[0.04] text-gray-400 hover:text-white hover:bg-white/[0.08] transition-colors"
            >
              Max
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-1">Per-request cap: {maxPerRequest.toFixed(2)} credits</p>
        </div>

        {/* Optional Request Hash */}
        <div className="mb-5">
          <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
            Request Hash <span className="text-gray-600">(optional)</span>
          </label>
          <input
            type="text"
            value={requestHash}
            onChange={(e) => setRequestHash(e.target.value)}
            placeholder="e.g. service request identifier"
            className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500/40 font-mono"
            disabled={isSubmitting}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/5 border border-red-500/20 text-red-400 text-sm mb-4 animate-fade-in">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !parseFloat(amount) || parseFloat(amount) <= 0}
          className="btn btn-primary w-full flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
          ) : (
            <><Send className="w-4 h-4" /> Submit Request</>
          )}
        </button>

        {/* Recent Receipts */}
        {recentReceipts.length > 0 && (
          <div className="mt-5 pt-4 border-t border-white/[0.04]">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
              <Receipt className="w-3 h-3" />
              Recent Receipts
            </div>
            <div className="space-y-2">
              {recentReceipts.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 font-mono">{r.request_hash?.slice(0, 12) || 'auto'}...</span>
                  <div className="flex items-center gap-3">
                    <span className="text-white font-medium">{(r.amount / 1_000_000).toFixed(2)} cr</span>
                    <span className="text-gray-600">{new Date(r.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
