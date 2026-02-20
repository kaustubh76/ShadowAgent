import { useState, useEffect } from 'react';
import { Briefcase, DollarSign, Lock, Loader2, Zap, Users } from 'lucide-react';
import { fetchJobs } from '../lib/api';
import type { JobInfo } from '../stores/agentStore';
import { getServiceTypeName } from '../stores/agentStore';
import { FACILITATOR_ENABLED } from '../config';

interface AgentJobsListProps {
  agentAddress: string;
  onAcceptJob: (job: JobInfo) => void;
}

export default function AgentJobsList({ agentAddress, onAcceptJob }: AgentJobsListProps) {
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!FACILITATOR_ENABLED) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchJobs({ agent: agentAddress, status: 'open' })
      .then((result) => {
        if (!cancelled) {
          setJobs(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [agentAddress]);

  if (!FACILITATOR_ENABLED) return null;

  if (loading) {
    return (
      <div
        className="card opacity-0 animate-fade-in-up mb-6"
        style={{ animationDelay: '0.25s', animationFillMode: 'forwards' }}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Briefcase className="w-4 h-4 text-blue-400" />
          </div>
          <h2 className="text-base font-semibold text-white">Available Jobs</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (jobs.length === 0) return null;

  return (
    <div
      className="card opacity-0 animate-fade-in-up mb-6"
      style={{ animationDelay: '0.25s', animationFillMode: 'forwards' }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <Briefcase className="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-white">Available Jobs</h2>
          <p className="text-xs text-gray-500">{jobs.length} open job{jobs.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="space-y-3">
        {jobs.map((job) => {
          const pricingCredits = job.pricing / 1_000_000;
          const escrowCredits = job.escrow_amount / 1_000_000;

          return (
            <div
              key={job.job_id}
              className="bg-white/[0.02] rounded-xl border border-white/[0.04] p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="text-sm font-medium text-white truncate">{job.title}</h3>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap bg-blue-500/10 text-blue-400">
                    Open
                  </span>
                </div>
              </div>

              {job.description && (
                <p className="text-xs text-gray-400 mb-3 line-clamp-2">
                  {job.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 text-xs mb-3">
                <span className="px-2 py-0.5 rounded bg-white/[0.04] text-gray-400">
                  {getServiceTypeName(job.service_type)}
                </span>
                <span className="flex items-center gap-1 text-gray-400">
                  <DollarSign className="w-3 h-3" />
                  {pricingCredits.toFixed(2)} credits
                </span>
                <span className="flex items-center gap-1 text-gray-500">
                  <Lock className="w-3 h-3" />
                  Escrow: {escrowCredits.toFixed(2)}
                </span>
                {job.multisig_enabled && (
                  <span className="flex items-center gap-1 text-blue-400">
                    <Users className="w-3 h-3" />
                    {job.required_signatures}-of-3
                  </span>
                )}
              </div>

              <button
                onClick={() => onAcceptJob(job)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-shadow-600/20 text-shadow-300 border border-shadow-500/30 text-sm font-medium hover:bg-shadow-600/30 transition-all"
              >
                <Zap className="w-3.5 h-3.5" />
                Accept Job — {pricingCredits.toFixed(2)} credits
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
