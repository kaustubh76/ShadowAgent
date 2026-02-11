import { useState } from 'react';
import { X, AlertTriangle, FileText } from 'lucide-react';

interface DisputeFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (evidenceHash: string) => void;
  agentAddress: string;
  jobHash: string;
  escrowAmount: number;
}

export default function DisputeForm({
  isOpen,
  onClose,
  onSubmit,
  agentAddress,
  jobHash,
  escrowAmount,
}: DisputeFormProps) {
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!evidenceDescription.trim()) return;
    setIsSubmitting(true);
    try {
      // Hash the evidence description (in production, this would hash uploaded files)
      const encoder = new TextEncoder();
      const data = encoder.encode(evidenceDescription);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const evidenceHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      await onSubmit(evidenceHash);
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Open Dispute</h2>
              <p className="text-xs text-gray-500">Submit evidence to dispute this escrow</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.04] text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning */}
        <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3 mb-6">
          <p className="text-red-400 text-xs">
            Opening a dispute will lock the escrow until an admin resolves it. This action is recorded on-chain.
          </p>
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
            <span className="text-gray-400">Escrow Amount</span>
            <span className="text-white font-semibold">{(escrowAmount / 1_000_000).toFixed(2)} credits</span>
          </div>
        </div>

        {/* Evidence */}
        <div className="mb-6">
          <label className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <FileText className="w-3.5 h-3.5" />
            Evidence Description
          </label>
          <textarea
            value={evidenceDescription}
            onChange={(e) => setEvidenceDescription(e.target.value)}
            placeholder="Describe the issue with this job/service delivery..."
            rows={4}
            className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/40 resize-none"
          />
          <p className="text-xs text-gray-600 mt-1">
            This will be hashed and stored on-chain as evidence.
          </p>
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
            disabled={isSubmitting || !evidenceDescription.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Submitting...' : 'Open Dispute'}
          </button>
        </div>
      </div>
    </div>
  );
}
