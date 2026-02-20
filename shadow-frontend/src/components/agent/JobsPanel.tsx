import { useState } from 'react';
import { Briefcase, Clock, DollarSign, Users, ChevronDown, ChevronUp, Play, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useAgentStore, getServiceTypeName } from '../../stores/agentStore';
import { updateJobStatus } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import CreateJobForm from './CreateJobForm';

interface JobsPanelProps {
  agentAddress: string;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-500/10 text-gray-400',
  open: 'bg-blue-500/10 text-blue-400',
  in_progress: 'bg-amber-500/10 text-amber-400',
  completed: 'bg-green-500/10 text-green-400',
  cancelled: 'bg-red-500/10 text-red-400',
};

const escrowColors: Record<string, string> = {
  pending: 'text-gray-500',
  locked: 'text-amber-400',
  released: 'text-green-400',
  refunded: 'text-red-400',
};

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  open: 'Open',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// Valid status transitions (mirrors backend)
const statusTransitions: Record<string, { next: string; label: string; icon: typeof Play; color: string }[]> = {
  draft: [
    { next: 'open', label: 'Publish', icon: Play, color: 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' },
    { next: 'cancelled', label: 'Cancel', icon: XCircle, color: 'bg-red-500/10 text-red-400 hover:bg-red-500/20' },
  ],
  open: [
    { next: 'in_progress', label: 'Start Work', icon: Play, color: 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' },
    { next: 'cancelled', label: 'Cancel', icon: XCircle, color: 'bg-red-500/10 text-red-400 hover:bg-red-500/20' },
  ],
  in_progress: [
    { next: 'completed', label: 'Complete', icon: CheckCircle, color: 'bg-green-500/10 text-green-400 hover:bg-green-500/20' },
    { next: 'cancelled', label: 'Cancel', icon: XCircle, color: 'bg-red-500/10 text-red-400 hover:bg-red-500/20' },
  ],
};

export default function JobsPanel({ agentAddress }: JobsPanelProps) {
  const { jobs, updateJob, addTransaction } = useAgentStore();
  const toast = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingJobId, setUpdatingJobId] = useState<string | null>(null);

  const handleStatusUpdate = async (jobId: string, newStatus: string) => {
    setUpdatingJobId(jobId);
    try {
      const result = await updateJobStatus(jobId, { status: newStatus });
      if (result.success && result.job) {
        updateJob(jobId, { status: result.job.status, updated_at: result.job.updated_at });
        const txTypeMap: Record<string, 'job_started' | 'job_completed' | 'job_cancelled'> = {
          in_progress: 'job_started',
          completed: 'job_completed',
          cancelled: 'job_cancelled',
        };
        const txType = txTypeMap[newStatus];
        if (txType) {
          const job = jobs.find(j => j.job_id === jobId);
          addTransaction({ type: txType, agentId: agentAddress, amount: job?.escrow_amount });
        }
        toast.success(`Job status updated to ${newStatus.replace('_', ' ')}`);
      } else {
        toast.error(result.error || 'Failed to update job status');
      }
    } catch {
      toast.error('Network error updating job status');
    } finally {
      setUpdatingJobId(null);
    }
  };

  const agentJobs = jobs.filter(j => j.agent === agentAddress);
  const activeJobs = agentJobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
  const completedJobs = agentJobs.filter(j => j.status === 'completed' || j.status === 'cancelled');

  return (
    <>
      <div
        className="card opacity-0 animate-fade-in-up"
        style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Jobs</h2>
              <p className="text-xs text-gray-500">
                {activeJobs.length} active{completedJobs.length > 0 ? `, ${completedJobs.length} completed` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-4 py-2 rounded-xl bg-shadow-600/20 text-shadow-300 border border-shadow-500/30 text-sm font-medium hover:bg-shadow-600/30 transition-all"
          >
            + New Job
          </button>
        </div>

        {agentJobs.length === 0 ? (
          <div className="text-center py-8">
            <Briefcase className="w-8 h-8 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No jobs yet. Create your first escrow-backed job.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {agentJobs.map(job => {
              const isExpanded = expandedId === job.job_id;
              const pricingCredits = job.pricing / 1_000_000;
              const escrowCredits = job.escrow_amount / 1_000_000;

              return (
                <div key={job.job_id} className="bg-white/[0.02] rounded-xl border border-white/[0.04] p-4">
                  {/* Header Row */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="text-sm font-medium text-white truncate">{job.title}</h3>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${statusColors[job.status] || ''}`}>
                        {statusLabels[job.status] || job.status}
                      </span>
                    </div>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : job.job_id)}
                      className="p-1 rounded hover:bg-white/[0.04] text-gray-500 hover:text-white transition-colors flex-shrink-0"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Tags Row */}
                  <div className="flex items-center gap-3 text-xs mb-2">
                    <span className="px-2 py-0.5 rounded bg-white/[0.04] text-gray-400">
                      {getServiceTypeName(job.service_type)}
                    </span>
                    <span className="flex items-center gap-1 text-gray-400">
                      <DollarSign className="w-3 h-3" />
                      {pricingCredits.toFixed(2)} credits
                    </span>
                    <span className={`flex items-center gap-1 ${escrowColors[job.escrow_status] || 'text-gray-500'}`}>
                      Escrow: {escrowCredits.toFixed(2)}
                    </span>
                    {job.multisig_enabled && (
                      <span className="flex items-center gap-1 text-blue-400">
                        <Users className="w-3 h-3" />
                        {job.required_signatures}-of-3
                      </span>
                    )}
                  </div>

                  {/* Client & Date */}
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>Client: {job.client.slice(0, 12)}...</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(job.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-2">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Description</p>
                        <p className="text-sm text-gray-300">{job.description}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-gray-500">Job Hash:</span>
                          <span className="text-gray-400 font-mono ml-1">{job.job_hash.slice(0, 20)}...</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Escrow Status:</span>
                          <span className={`ml-1 ${escrowColors[job.escrow_status] || 'text-gray-400'}`}>
                            {job.escrow_status}
                          </span>
                        </div>
                      </div>
                      {job.multisig_enabled && job.signers && (
                        <div className="text-xs">
                          <span className="text-gray-500">Signers:</span>
                          <div className="mt-1 space-y-1">
                            {job.signers.map((s, i) => (
                              <div key={i} className="font-mono text-gray-400 pl-2">
                                {s.slice(0, 16)}...
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Status Actions */}
                      {statusTransitions[job.status] && (
                        <div className="flex gap-2 pt-2">
                          {statusTransitions[job.status].map(action => {
                            const ActionIcon = action.icon;
                            const isUpdating = updatingJobId === job.job_id;
                            return (
                              <button
                                key={action.next}
                                onClick={() => handleStatusUpdate(job.job_id, action.next)}
                                disabled={isUpdating}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-white/[0.04] disabled:opacity-50 ${action.color}`}
                              >
                                {isUpdating ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <ActionIcon className="w-3 h-3" />
                                )}
                                {action.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CreateJobForm
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        agentAddress={agentAddress}
      />
    </>
  );
}
