import { useState } from 'react';
import { X, ArrowLeftRight } from 'lucide-react';

interface PartialRefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (agentAmount: number) => void;
  totalAmount: number;
  agentAddress: string;
  jobHash: string;
}

export default function PartialRefundModal({
  isOpen,
  onClose,
  onSubmit,
  totalAmount,
  agentAddress,
  jobHash,
}: PartialRefundModalProps) {
  const [agentPercent, setAgentPercent] = useState(50);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const agentAmount = Math.floor((totalAmount * agentPercent) / 100);
  const clientAmount = totalAmount - agentAmount;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(agentAmount);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-1 rounded-2xl border border-white/[0.08] shadow-2xl max-w-md w-full p-6 animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center">
              <ArrowLeftRight className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Partial Refund</h2>
              <p className="text-xs text-gray-500">Propose a split on the escrow payment</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.04] text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info */}
        <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] p-4 mb-6 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Job Hash</span>
            <span className="text-gray-300 font-mono text-xs">{jobHash.slice(0, 20)}...</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Agent</span>
            <span className="text-gray-300 font-mono text-xs">{agentAddress.slice(0, 16)}...</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Total Escrow</span>
            <span className="text-white font-semibold">{(totalAmount / 1_000_000).toFixed(2)} credits</span>
          </div>
        </div>

        {/* Slider */}
        <div className="mb-6">
          <label className="text-sm text-gray-400 mb-3 block">Split Ratio</label>
          <input
            type="range"
            min={1}
            max={99}
            value={agentPercent}
            onChange={(e) => setAgentPercent(Number(e.target.value))}
            className="w-full h-2 rounded-full bg-surface-3 appearance-none cursor-pointer accent-shadow-500"
          />
          <div className="flex justify-between mt-3">
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">Agent receives</p>
              <p className="text-lg font-bold text-shadow-400">{agentPercent}%</p>
              <p className="text-xs text-gray-400">{(agentAmount / 1_000_000).toFixed(4)} credits</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">Client receives</p>
              <p className="text-lg font-bold text-green-400">{100 - agentPercent}%</p>
              <p className="text-xs text-gray-400">{(clientAmount / 1_000_000).toFixed(4)} credits</p>
            </div>
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
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-shadow-600 hover:bg-shadow-500 text-white transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Submitting...' : 'Propose Refund'}
          </button>
        </div>
      </div>
    </div>
  );
}
