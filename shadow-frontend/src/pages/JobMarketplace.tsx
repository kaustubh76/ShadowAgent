import { useEffect, useState, useMemo } from 'react';
import { Briefcase, Search, Filter, RefreshCw, X, DollarSign, Clock, Users, ChevronDown, ChevronUp, ArrowUpDown, Lock, ExternalLink, Zap } from 'lucide-react';
import { useAgentStore, type JobInfo, ServiceType, getServiceTypeName } from '../stores/agentStore';
import { fetchJobs } from '../lib/api';
import { useWalletStore } from '../stores/walletStore';
import { Link, useNavigate } from 'react-router-dom';
import { ANIMATION_DELAY_BASE } from '../constants/ui';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-500/10 text-gray-400',
  open: 'bg-blue-500/10 text-blue-400',
  in_progress: 'bg-amber-500/10 text-amber-400',
  completed: 'bg-green-500/10 text-green-400',
  cancelled: 'bg-red-500/10 text-red-400',
};

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  open: 'Open',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const SERVICE_TYPES = [
  ServiceType.NLP,
  ServiceType.Vision,
  ServiceType.Code,
  ServiceType.Data,
  ServiceType.Audio,
  ServiceType.Multi,
  ServiceType.Custom,
];

function SkeletonJobCard({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="card space-y-3 animate-fade-in"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex items-center justify-between">
        <div className="skeleton w-48 h-5" />
        <div className="skeleton w-16 h-5 rounded-full" />
      </div>
      <div className="skeleton w-full h-4" />
      <div className="skeleton w-3/4 h-4" />
      <div className="flex gap-3 pt-2">
        <div className="skeleton w-20 h-5 rounded" />
        <div className="skeleton w-24 h-5 rounded" />
        <div className="skeleton w-28 h-5 rounded" />
      </div>
    </div>
  );
}

export default function JobMarketplace() {
  const { address, connected } = useWalletStore();
  const { jobs, setJobs } = useAgentStore();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [serviceFilter, setServiceFilter] = useState<ServiceType | ''>('');
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc' | 'escrow'>('newest');
  const [searchQuery, setSearchQuery] = useState('');

  const loadJobs = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string | number> = {};
      if (statusFilter) params.status = statusFilter;
      if (serviceFilter) params.service_type = serviceFilter;
      const result = await fetchJobs(params as Parameters<typeof fetchJobs>[0]);
      setJobs(result);
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, [statusFilter, serviceFilter]);

  const filteredJobs = useMemo(() => {
    let result = [...jobs];

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        j => j.title.toLowerCase().includes(q) || j.description.toLowerCase().includes(q)
      );
    }

    // Sort
    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'price_asc':
        result.sort((a, b) => a.pricing - b.pricing);
        break;
      case 'price_desc':
        result.sort((a, b) => b.pricing - a.pricing);
        break;
      case 'escrow':
        result.sort((a, b) => b.escrow_amount - a.escrow_amount);
        break;
    }

    return result;
  }, [jobs, searchQuery, sortBy]);

  const activeFilterCount = [serviceFilter !== '', statusFilter !== ''].filter(Boolean).length;

  const handleClearFilters = () => {
    setServiceFilter('');
    setStatusFilter('');
    setSearchQuery('');
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Job Marketplace</h1>
          <p className="text-gray-400 mt-1.5">
            Browse escrow-backed jobs from verified agents
          </p>
        </div>
        <button
          onClick={loadJobs}
          disabled={isLoading}
          className="btn btn-secondary flex items-center gap-2 self-start"
        >
          <RefreshCw className={`w-4 h-4 transition-transform duration-500 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Search + Filters */}
      <div
        className="card opacity-0 animate-fade-in-up"
        style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-shadow-600/15 flex items-center justify-center">
              <Filter className="w-4 h-4 text-shadow-400" />
            </div>
            <h2 className="text-base font-semibold text-white">Search & Filter</h2>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-shadow-600 text-white animate-scale-in">
                {activeFilterCount}
              </span>
            )}
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={handleClearFilters}
              className="text-sm text-gray-500 hover:text-white transition-colors duration-300 flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              Clear All
            </button>
          )}
        </div>

        {/* Search bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search jobs by title or description..."
            className="w-full bg-surface-2 border border-white/[0.06] rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500/40"
          />
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {/* Service Type */}
          <div>
            <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Service Type</label>
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value ? Number(e.target.value) as ServiceType : '')}
              className="input"
              aria-label="Filter by service type"
            >
              <option value="">All Types</option>
              {SERVICE_TYPES.map(st => (
                <option key={st} value={st}>{getServiceTypeName(st)}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input"
              aria-label="Filter by status"
            >
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Sort */}
          <div>
            <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Sort By</label>
            <div className="relative">
              <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="input pl-9"
                aria-label="Sort jobs"
              >
                <option value="newest">Newest First</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="escrow">Escrow Amount</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div>
        <div className="flex items-center gap-2.5 mb-5">
          <Briefcase className="w-4 h-4 text-gray-500" />
          <h2 className="text-base font-semibold text-white">
            {filteredJobs.length} Job{filteredJobs.length !== 1 ? 's' : ''} Found
          </h2>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonJobCard key={i} delay={i * ANIMATION_DELAY_BASE} />
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center py-20 card animate-fade-in">
            <Briefcase className="w-14 h-14 text-gray-700 mx-auto mb-5" />
            <h3 className="text-xl font-semibold text-white mb-2">No Jobs Found</h3>
            <p className="text-gray-400 mb-8 max-w-md mx-auto text-sm leading-relaxed">
              No jobs match your current filters. Try adjusting your search or clearing filters.
            </p>
            <button
              onClick={handleClearFilters}
              className="btn btn-outline flex items-center gap-2 mx-auto"
            >
              <X className="w-4 h-4" />
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredJobs.map((job, index) => (
              <JobCard
                key={job.job_id}
                job={job}
                isExpanded={expandedId === job.job_id}
                onToggle={() => setExpandedId(expandedId === job.job_id ? null : job.job_id)}
                isOwnJob={address === job.client}
                canAccept={connected && address !== job.agent && job.status === 'open'}
                onAccept={() => navigate(`/agents/${job.agent}`)}
                delay={index * ANIMATION_DELAY_BASE}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JobCard({
  job,
  isExpanded,
  onToggle,
  isOwnJob,
  canAccept,
  onAccept,
  delay,
}: {
  job: JobInfo;
  isExpanded: boolean;
  onToggle: () => void;
  isOwnJob: boolean;
  canAccept: boolean;
  onAccept: () => void;
  delay: number;
}) {
  const pricingCredits = job.pricing / 1_000_000;
  const escrowCredits = job.escrow_amount / 1_000_000;

  return (
    <div
      className="card opacity-0 animate-fade-in-up"
      style={{ animationDelay: `${delay}s`, animationFillMode: 'forwards' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-white truncate">{job.title}</h3>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${statusColors[job.status] || ''}`}>
            {statusLabels[job.status] || job.status}
          </span>
          {isOwnJob && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-shadow-500/10 text-shadow-400 whitespace-nowrap">
              Your Job
            </span>
          )}
        </div>
        <button
          onClick={onToggle}
          className="p-1 rounded hover:bg-white/[0.04] text-gray-500 hover:text-white transition-colors flex-shrink-0"
        >
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Description preview */}
      <p className="text-sm text-gray-400 mb-3 line-clamp-2">{job.description}</p>

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="px-2 py-0.5 rounded bg-white/[0.04] text-gray-400">
          {getServiceTypeName(job.service_type)}
        </span>
        <span className="flex items-center gap-1 text-gray-400">
          <DollarSign className="w-3 h-3" />
          {pricingCredits.toFixed(2)} credits
        </span>
        <span className="flex items-center gap-1 text-amber-400">
          <Lock className="w-3 h-3" />
          {escrowCredits.toFixed(2)} escrow
        </span>
        {job.multisig_enabled && (
          <span className="flex items-center gap-1 text-blue-400">
            <Users className="w-3 h-3" />
            {job.required_signatures}-of-3 multi-sig
          </span>
        )}
        <span className="flex items-center gap-1 text-gray-500">
          <Clock className="w-3 h-3" />
          {new Date(job.created_at).toLocaleDateString()}
        </span>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-white/[0.04] space-y-3">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-gray-500 block mb-1">Agent</span>
              <Link
                to={`/agents/${job.agent}`}
                className="font-mono text-shadow-400 hover:text-shadow-300 transition-colors flex items-center gap-1"
              >
                {job.agent.slice(0, 16)}...
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
            <div>
              <span className="text-gray-500 block mb-1">Client</span>
              <span className="font-mono text-gray-400">{job.client.slice(0, 16)}...</span>
            </div>
            <div>
              <span className="text-gray-500 block mb-1">Job Hash</span>
              <span className="font-mono text-gray-400">{job.job_hash.slice(0, 20)}...</span>
            </div>
            <div>
              <span className="text-gray-500 block mb-1">Escrow Status</span>
              <span className={`font-medium ${
                job.escrow_status === 'locked' ? 'text-amber-400' :
                job.escrow_status === 'released' ? 'text-green-400' :
                job.escrow_status === 'refunded' ? 'text-red-400' :
                'text-gray-500'
              }`}>
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
                    {s.slice(0, 20)}...
                  </div>
                ))}
              </div>
            </div>
          )}

          {canAccept && (
            <button
              onClick={onAccept}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-shadow-600/20 text-shadow-300 border border-shadow-500/30 text-sm font-medium hover:bg-shadow-600/30 transition-all mt-1"
            >
              <Zap className="w-3.5 h-3.5" />
              Accept Job — {(job.pricing / 1_000_000).toFixed(2)} credits
            </button>
          )}
        </div>
      )}
    </div>
  );
}
