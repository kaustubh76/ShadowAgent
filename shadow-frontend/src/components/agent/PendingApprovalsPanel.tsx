import { useState, useEffect } from 'react';
import { Users, CheckCircle, Loader2 } from 'lucide-react';
import { getPendingEscrows, approveMultiSigEscrow, type MultiSigEscrowData } from '../../lib/api';
import { useWalletStore } from '../../stores/walletStore';
import { useAgentStore } from '../../stores/agentStore';
import { useToast } from '../../contexts/ToastContext';

export default function PendingApprovalsPanel() {
  const { address } = useWalletStore();
  const { setPendingEscrows } = useAgentStore();
  const toast = useToast();
  const [escrows, setEscrows] = useState<MultiSigEscrowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingHash, setApprovingHash] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getPendingEscrows(address)
      .then(data => {
        setEscrows(data);
        setPendingEscrows(data);
      })
      .finally(() => setLoading(false));
  }, [address, setPendingEscrows]);

  if (loading || escrows.length === 0) return null;

  const handleApprove = async (jobHash: string) => {
    if (!address) return;
    setApprovingHash(jobHash);
    try {
      const result = await approveMultiSigEscrow(jobHash, address);
      if (result.success) {
        toast.success(result.threshold_met ? 'Escrow released!' : 'Approval recorded');
        // Refresh list
        const updated = await getPendingEscrows(address);
        setEscrows(updated);
        setPendingEscrows(updated);
      } else {
        toast.error(result.error || 'Approval failed');
      }
    } finally {
      setApprovingHash(null);
    }
  };

  return (
    <div className="card animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <Users className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Pending Approvals</h2>
          <p className="text-xs text-gray-500">{escrows.length} escrow(s) awaiting your signature</p>
        </div>
      </div>

      <div className="space-y-3">
        {escrows.map(escrow => (
          <div key={escrow.job_hash} className="bg-white/[0.02] rounded-xl border border-white/[0.04] p-4">
            {/* Amount + Signature Progress */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-white font-medium">
                {(escrow.amount / 1_000_000).toFixed(2)} credits
              </span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-400/20">
                {escrow.sig_count}/{escrow.required_sigs} signed
              </span>
            </div>

            {/* Details */}
            <div className="text-xs text-gray-500 space-y-1 mb-3">
              <p>Job: <span className="font-mono text-gray-400">{escrow.job_hash.slice(0, 20)}...</span></p>
              <p>Agent: <span className="font-mono text-gray-400">{escrow.agent.slice(0, 16)}...</span></p>
              <p>Created: {new Date(escrow.created_at).toLocaleDateString()}</p>
            </div>

            {/* Signer Progress Bar */}
            <div className="w-full bg-white/[0.04] rounded-full h-1.5 mb-3">
              <div
                className="h-1.5 rounded-full bg-shadow-500 transition-all"
                style={{ width: `${(escrow.sig_count / escrow.required_sigs) * 100}%` }}
              />
            </div>

            {/* Signer Status */}
            <div className="flex gap-2 mb-3">
              {escrow.signers.map((signer, i) => (
                <div
                  key={i}
                  className={`flex-1 text-center py-1 rounded-md text-[10px] font-medium border ${
                    escrow.approvals[i]
                      ? 'bg-green-500/10 text-green-400 border-green-500/20'
                      : 'bg-white/[0.02] text-gray-500 border-white/[0.04]'
                  }`}
                >
                  {signer.slice(0, 8)}...
                  {escrow.approvals[i] && ' ✓'}
                </div>
              ))}
            </div>

            {/* Approve Button */}
            <button
              onClick={() => handleApprove(escrow.job_hash)}
              disabled={approvingHash === escrow.job_hash}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-shadow-600/20 text-shadow-300 border border-shadow-500/30 hover:bg-shadow-600/30 transition-all disabled:opacity-50"
            >
              {approvingHash === escrow.job_hash ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Approving...</>
              ) : (
                <><CheckCircle className="w-3 h-3" /> Approve Escrow</>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
