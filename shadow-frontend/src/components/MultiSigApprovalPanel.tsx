import { CheckCircle, Clock, Users } from 'lucide-react';

interface MultiSigApprovalPanelProps {
  signers: [string, string, string];
  approvals: [boolean, boolean, boolean];
  requiredSigs: number;
  sigCount: number;
  status: 'locked' | 'released' | 'refunded';
}

export default function MultiSigApprovalPanel({
  signers,
  approvals,
  requiredSigs,
  sigCount,
  status,
}: MultiSigApprovalPanelProps) {
  const isReleased = status === 'released';
  const isRefunded = status === 'refunded';

  return (
    <div className="bg-white/[0.02] rounded-xl border border-white/[0.06] p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-white">Multi-Sig Approval</span>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-lg ${
          isReleased ? 'bg-green-400/10 text-green-400 border border-green-400/20' :
          isRefunded ? 'bg-red-400/10 text-red-400 border border-red-400/20' :
          'bg-yellow-400/10 text-yellow-400 border border-yellow-400/20'
        }`}>
          {isReleased ? 'Released' : isRefunded ? 'Refunded' : `${sigCount}/${requiredSigs} Signed`}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-surface-3 rounded-full h-1.5 mb-4">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${
            isReleased ? 'bg-green-400' : 'bg-shadow-500'
          }`}
          style={{ width: `${(sigCount / requiredSigs) * 100}%` }}
        />
      </div>

      {/* Signers List */}
      <div className="space-y-2">
        {signers.map((signer, index) => {
          const isApproved = approvals[index];
          // Skip duplicate signers (signer_3 === signer_1 means only 2 signers)
          if (index > 0 && signer === signers[0]) return null;

          return (
            <div key={index} className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                  isApproved
                    ? 'bg-green-400/10 border border-green-400/20'
                    : 'bg-white/[0.03] border border-white/[0.06]'
                }`}>
                  {isApproved ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-gray-500" />
                  )}
                </div>
                <span className="text-xs font-mono text-gray-400 truncate">
                  {signer.slice(0, 12)}...{signer.slice(-6)}
                </span>
              </div>
              <span className={`text-xs font-medium ${isApproved ? 'text-green-400' : 'text-gray-600'}`}>
                {isApproved ? 'Approved' : 'Pending'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
