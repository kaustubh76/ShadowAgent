import { useState } from 'react';
import { Zap } from 'lucide-react';
import { useAgentStore } from '../../stores/agentStore';
import { createSession } from '../../lib/api';
import { useWalletStore } from '../../stores/walletStore';

interface CreateSessionFormProps {
  agentAddress: string;
  onClose: () => void;
  onCreated: () => void;
}

// Convert hours to blocks (~6s/block)
const hoursToBlocks = (hours: number) => Math.floor((hours * 3600) / 6);

export default function CreateSessionForm({ agentAddress, onClose, onCreated }: CreateSessionFormProps) {
  const { address } = useWalletStore();
  const { addSession, addTransaction } = useAgentStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [maxTotal, setMaxTotal] = useState('10');
  const [maxPerRequest, setMaxPerRequest] = useState('0.5');
  const [rateLimit, setRateLimit] = useState('100');
  const [durationHours, setDurationHours] = useState('24');

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
        onCreated();
      } else {
        setError(result.error || 'Failed to create session');
      }
    } catch {
      setError('Network error creating session');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
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
  );
}
