import { useState } from 'react';
import { Users, X, Lock } from 'lucide-react';

interface MultiSigEscrowFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (signers: [string, string, string], requiredSigs: number) => void;
  agentAddress: string;
  amount: number;
}

export default function MultiSigEscrowForm({
  isOpen,
  onClose,
  onSubmit,
  agentAddress,
  amount,
}: MultiSigEscrowFormProps) {
  const [signers, setSigners] = useState(['', '', '']);
  const [requiredSigs, setRequiredSigs] = useState(2);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignerChange = (index: number, value: string) => {
    const updated = [...signers];
    updated[index] = value;
    setSigners(updated);
  };

  const validSigners = signers.filter(s => s.startsWith('aleo1') && s.length > 10);
  const nonEmptySigners = signers.filter(s => s.trim());
  const hasDuplicates = new Set(nonEmptySigners).size !== nonEmptySigners.length;

  const handleSubmit = async () => {
    if (validSigners.length < requiredSigs || hasDuplicates) return;

    setIsSubmitting(true);
    try {
      await onSubmit(signers as [string, string, string], requiredSigs);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-1 rounded-2xl border border-white/[0.08] shadow-2xl max-w-lg w-full p-6 animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Multi-Sig Escrow</h2>
              <p className="text-xs text-gray-500">Require multiple approvals for payment release</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.04] text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Escrow Summary */}
        <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] p-4 mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-400">Agent</span>
            <span className="text-gray-300 font-mono text-xs">{agentAddress.slice(0, 16)}...</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Amount</span>
            <span className="text-white font-semibold">{(amount / 1_000_000).toFixed(2)} credits</span>
          </div>
        </div>

        {/* Signers */}
        <div className="mb-6">
          <label className="text-sm text-gray-400 mb-3 block">Co-Signers (up to 3 addresses)</label>
          <div className="space-y-3">
            {signers.map((signer, index) => (
              <div key={index} className="relative">
                <input
                  type="text"
                  value={signer}
                  onChange={(e) => handleSignerChange(index, e.target.value)}
                  placeholder={`Signer ${index + 1} Aleo address`}
                  className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500/40 font-mono"
                />
                {signer && signer.startsWith('aleo1') && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-400" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Required Signatures */}
        <div className="mb-6">
          <label className="text-sm text-gray-400 mb-3 block">Required Approvals</label>
          <div className="flex gap-2">
            {[1, 2, 3].map(n => (
              <button
                key={n}
                onClick={() => setRequiredSigs(n)}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  requiredSigs === n
                    ? 'bg-shadow-600/20 text-shadow-300 border border-shadow-500/30'
                    : 'bg-white/[0.02] border border-white/[0.06] text-gray-400 hover:text-white hover:border-white/[0.1]'
                }`}
              >
                {n}-of-3
              </button>
            ))}
          </div>
        </div>

        {/* Status */}
        <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 mb-6">
          <div className={`flex items-center gap-2 text-xs ${hasDuplicates ? 'text-red-400' : 'text-blue-400'}`}>
            <Lock className="w-3.5 h-3.5" />
            <span>
              {hasDuplicates
                ? 'Duplicate signer addresses detected. Each signer must be unique.'
                : `${validSigners.length} valid signer${validSigners.length !== 1 ? 's' : ''} configured.${
                    validSigners.length < requiredSigs
                      ? ` Need at least ${requiredSigs} for ${requiredSigs}-of-3 threshold.`
                      : ' Ready to create escrow.'
                  }`}
            </span>
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
            disabled={isSubmitting || validSigners.length < requiredSigs || hasDuplicates}
            className="flex-1 px-4 py-2.5 rounded-xl bg-shadow-600 hover:bg-shadow-500 text-white transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              'Creating...'
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Create Multi-Sig Escrow
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
