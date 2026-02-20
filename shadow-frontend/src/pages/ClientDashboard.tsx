import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, RefreshCw, SearchX, X, Users, ChevronLeft, ChevronRight, ArrowUpDown, Briefcase, DollarSign, Clock, Loader2 } from 'lucide-react';
import {
  useAgentStore,
  ServiceType,
  Tier,
  getServiceTypeName,
  getTierName,
} from '../stores/agentStore';
import type { JobInfo } from '../stores/agentStore';
import { searchAgents, fetchJobs } from '../lib/api';
import { useWalletStore } from '../stores/walletStore';
import AgentCard from '../components/AgentCard';
import { ANIMATION_DELAY_BASE } from '../constants/ui';

function SkeletonCard({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="card space-y-4 animate-fade-in"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex items-start justify-between">
        <div className="skeleton w-11 h-11 rounded-xl" />
        <div className="skeleton w-16 h-5 rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="skeleton w-3/4 h-5" />
        <div className="skeleton w-1/2 h-4" />
      </div>
      <div className="pt-4 border-t border-white/[0.04]">
        <div className="flex items-center justify-between">
          <div className="skeleton w-14 h-4" />
          <div className="skeleton w-20 h-4" />
        </div>
      </div>
    </div>
  );
}

const JOB_STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-500/10 text-blue-400',
  in_progress: 'bg-amber-500/10 text-amber-400',
  completed: 'bg-green-500/10 text-green-400',
  cancelled: 'bg-red-500/10 text-red-400',
  draft: 'bg-gray-500/10 text-gray-400',
};

const JOB_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  draft: 'Draft',
};

const ESCROW_COLORS: Record<string, string> = {
  pending: 'text-gray-500',
  locked: 'text-amber-400',
  released: 'text-green-400',
  refunded: 'text-red-400',
};

export default function ClientDashboard() {
  const {
    searchResults,
    filters,
    isSearching,
    setSearchResults,
    setFilters,
    setSearching,
  } = useAgentStore();

  const { connected, address } = useWalletStore();

  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<'default' | 'tier' | 'service'>('default');
  const PAGE_SIZE = 12;

  // Tab state
  const [activeTab, setActiveTab] = useState<'search' | 'jobs'>('search');

  // My Jobs state
  const [myJobs, setMyJobs] = useState<JobInfo[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobStatusFilter, setJobStatusFilter] = useState('all');

  const sortedResults = useMemo(() => {
    const results = [...searchResults];
    if (sortBy === 'tier') {
      results.sort((a, b) => b.tier - a.tier);
    } else if (sortBy === 'service') {
      results.sort((a, b) => a.service_type - b.service_type);
    }
    return results;
  }, [searchResults, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sortedResults.length / PAGE_SIZE));
  const pagedResults = useMemo(
    () => sortedResults.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [sortedResults, page]
  );

  // Reset page when results or sort changes
  useEffect(() => { setPage(0); }, [searchResults, sortBy]);

  const handleClearFilters = () => {
    setFilters({
      service_type: undefined,
      min_tier: undefined,
      is_active: undefined,
    });
  };

  const handleSearch = async () => {
    setSearching(true);
    setError(null);

    try {
      const result = await searchAgents(filters);
      setSearchResults(result.agents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search agents');
      // Use demo data on error
      setSearchResults([
        {
          agent_id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          service_type: ServiceType.NLP,
          endpoint_hash: 'hash1',
          tier: Tier.Gold,
          is_active: true,
        },
        {
          agent_id: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
          service_type: ServiceType.Vision,
          endpoint_hash: 'hash2',
          tier: Tier.Silver,
          is_active: true,
        },
        {
          agent_id: '567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
          service_type: ServiceType.Code,
          endpoint_hash: 'hash3',
          tier: Tier.Diamond,
          is_active: true,
        },
        {
          agent_id: 'def1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
          service_type: ServiceType.Data,
          endpoint_hash: 'hash4',
          tier: Tier.Bronze,
          is_active: true,
        },
      ]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    handleSearch();
  }, []);

  // Load My Jobs when switching to jobs tab
  useEffect(() => {
    if (activeTab === 'jobs' && connected && address) {
      setJobsLoading(true);
      fetchJobs({ client: address }).then((jobs) => {
        setMyJobs(jobs);
        setJobsLoading(false);
      });
    }
  }, [activeTab, connected, address]);

  const filteredJobs = useMemo(() => {
    if (jobStatusFilter === 'all') return myJobs;
    return myJobs.filter(j => j.status === jobStatusFilter);
  }, [myJobs, jobStatusFilter]);

  const activeFilterCount = [
    filters.service_type !== undefined,
    filters.min_tier !== undefined,
    filters.is_active !== undefined,
  ].filter(Boolean).length;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            {activeTab === 'search' ? 'Find AI Agents' : 'My Jobs'}
          </h1>
          <p className="text-gray-400 mt-1.5">
            {activeTab === 'search'
              ? 'Discover verified agents with privacy-preserving reputation proofs'
              : 'Track your escrow-backed jobs across all agents'}
          </p>
        </div>
        {activeTab === 'search' && (
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="btn btn-secondary flex items-center gap-2 self-start"
          >
            <RefreshCw className={`w-4 h-4 transition-transform duration-500 ${isSearching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 bg-white/[0.03] rounded-xl p-1 border border-white/[0.04] w-fit">
        <button
          onClick={() => setActiveTab('search')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
            activeTab === 'search'
              ? 'bg-shadow-600/20 text-shadow-300'
              : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          Find Agents
        </button>
        <button
          onClick={() => setActiveTab('jobs')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
            activeTab === 'jobs'
              ? 'bg-shadow-600/20 text-shadow-300'
              : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          My Jobs
        </button>
      </div>

      {activeTab === 'search' ? (
        <>
          {/* Filters */}
          <div
            className="card opacity-0 animate-fade-in-up"
            style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-shadow-600/15 flex items-center justify-center">
                  <Filter className="w-4 h-4 text-shadow-400" />
                </div>
                <h2 className="text-base font-semibold text-white">Filters</h2>
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

            <div className="grid md:grid-cols-3 gap-4">
              {/* Service Type */}
              <div>
                <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Service Type</label>
                <select
                  value={filters.service_type ?? ''}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      service_type: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="input"
                  aria-label="Filter by service type"
                >
                  <option value="">All Types</option>
                  {Object.values(ServiceType)
                    .filter((v) => typeof v === 'number')
                    .map((type) => (
                      <option key={type} value={type}>
                        {getServiceTypeName(type as ServiceType)}
                      </option>
                    ))}
                </select>
              </div>

              {/* Minimum Tier */}
              <div>
                <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Minimum Tier</label>
                <select
                  value={filters.min_tier ?? ''}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      min_tier: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="input"
                  aria-label="Filter by minimum tier"
                >
                  <option value="">Any Tier</option>
                  {Object.values(Tier)
                    .filter((v) => typeof v === 'number')
                    .map((tier) => (
                      <option key={tier} value={tier}>
                        {getTierName(tier as Tier)}
                      </option>
                    ))}
                </select>
              </div>

              {/* Active Only */}
              <div>
                <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Status</label>
                <select
                  value={filters.is_active === undefined ? '' : String(filters.is_active)}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      is_active: e.target.value === '' ? undefined : e.target.value === 'true',
                    })
                  }
                  className="input"
                  aria-label="Filter by agent status"
                >
                  <option value="">All</option>
                  <option value="true">Active Only</option>
                  <option value="false">Inactive Only</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button onClick={handleSearch} disabled={isSearching} className="btn btn-primary">
                <Search className="w-4 h-4 mr-2" />
                Search Agents
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 bg-red-500/5 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm animate-fade-in-down">
              <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Results */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-gray-500" />
                <h2 className="text-base font-semibold text-white">
                  {searchResults.length} Agent{searchResults.length !== 1 ? 's' : ''} Found
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-3.5 h-3.5 text-gray-500" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'default' | 'tier' | 'service')}
                  className="bg-surface-2 border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-shadow-500/40"
                  aria-label="Sort agents"
                >
                  <option value="default">Default</option>
                  <option value="tier">By Tier</option>
                  <option value="service">By Service</option>
                </select>
              </div>
            </div>

            {isSearching ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} delay={i * ANIMATION_DELAY_BASE} />
                ))}
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-20 card animate-fade-in">
                <SearchX className="w-14 h-14 text-gray-700 mx-auto mb-5" />
                <h3 className="text-xl font-semibold text-white mb-2">No Agents Found</h3>
                <p className="text-gray-400 mb-8 max-w-md mx-auto text-sm leading-relaxed">
                  No agents match your current search criteria. Try adjusting your filters or clearing them to see all available agents.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={handleClearFilters}
                    className="btn btn-outline flex items-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Clear Filters
                  </button>
                  <button
                    onClick={handleSearch}
                    className="btn btn-secondary flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {pagedResults.map((agent, index) => (
                  <div
                    key={agent.agent_id}
                    className="opacity-0 animate-fade-in-up"
                    style={{ animationDelay: `${index * ANIMATION_DELAY_BASE}s`, animationFillMode: 'forwards' }}
                  >
                    <AgentCard agent={agent} />
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {sortedResults.length > PAGE_SIZE && (
              <div className="flex items-center justify-center gap-4 mt-8">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="btn btn-outline flex items-center gap-1.5 px-3 py-2 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <span className="text-sm text-gray-400">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="btn btn-outline flex items-center gap-1.5 px-3 py-2 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Next page"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        /* My Jobs Tab */
        <div>
          {!connected ? (
            <div className="text-center py-16 bg-white/[0.02] rounded-2xl border border-white/[0.04]">
              <Briefcase className="w-10 h-10 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-sm">Connect your wallet to view your jobs.</p>
            </div>
          ) : jobsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* Status Filter */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <Briefcase className="w-4 h-4 text-gray-500" />
                  <h2 className="text-base font-semibold text-white">
                    {filteredJobs.length} Job{filteredJobs.length !== 1 ? 's' : ''}
                  </h2>
                </div>
                <select
                  value={jobStatusFilter}
                  onChange={(e) => setJobStatusFilter(e.target.value)}
                  className="bg-surface-2 border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-shadow-500/40"
                  aria-label="Filter jobs by status"
                >
                  <option value="all">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {filteredJobs.length === 0 ? (
                <div className="text-center py-16 bg-white/[0.02] rounded-2xl border border-white/[0.04]">
                  <Briefcase className="w-10 h-10 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-sm">
                    {jobStatusFilter === 'all'
                      ? 'No jobs yet. Browse agents to find services.'
                      : `No ${JOB_STATUS_LABELS[jobStatusFilter]?.toLowerCase() || jobStatusFilter} jobs.`}
                  </p>
                  {jobStatusFilter === 'all' && (
                    <button
                      onClick={() => setActiveTab('search')}
                      className="mt-4 btn btn-outline text-sm"
                    >
                      Find Agents
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredJobs.map((job, index) => {
                    const pricingCredits = job.pricing / 1_000_000;
                    const escrowCredits = job.escrow_amount / 1_000_000;

                    return (
                      <div
                        key={job.job_id}
                        className="bg-white/[0.02] rounded-xl border border-white/[0.06] p-5 hover:border-white/[0.1] transition-all duration-300 opacity-0 animate-fade-in-up"
                        style={{ animationDelay: `${index * 0.05}s`, animationFillMode: 'forwards' }}
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <h3 className="text-sm font-medium text-white truncate">{job.title}</h3>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${JOB_STATUS_COLORS[job.status] || ''}`}>
                              {JOB_STATUS_LABELS[job.status] || job.status}
                            </span>
                          </div>
                        </div>

                        {/* Tags */}
                        <div className="flex items-center gap-3 text-xs mb-2">
                          <span className="px-2 py-0.5 rounded bg-white/[0.04] text-gray-400">
                            {getServiceTypeName(job.service_type)}
                          </span>
                          <span className="flex items-center gap-1 text-gray-400">
                            <DollarSign className="w-3 h-3" />
                            {pricingCredits.toFixed(2)} credits
                          </span>
                          <span className={`flex items-center gap-1 ${ESCROW_COLORS[job.escrow_status] || 'text-gray-500'}`}>
                            Escrow: {escrowCredits.toFixed(2)}
                          </span>
                        </div>

                        {/* Agent & Date */}
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>
                            Agent:{' '}
                            <Link
                              to={`/agents/${job.agent}`}
                              className="text-gray-400 hover:text-shadow-300 transition-colors font-mono"
                            >
                              {job.agent.slice(0, 12)}...
                            </Link>
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(job.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
