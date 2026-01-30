import { useEffect, useState } from 'react';
import { Search, Filter, RefreshCw, SearchX, X, Users } from 'lucide-react';
import {
  useAgentStore,
  ServiceType,
  Tier,
  getServiceTypeName,
  getTierName,
} from '../stores/agentStore';
import { searchAgents } from '../lib/api';
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

export default function ClientDashboard() {
  const {
    searchResults,
    filters,
    isSearching,
    setSearchResults,
    setFilters,
    setSearching,
  } = useAgentStore();

  const [error, setError] = useState<string | null>(null);

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
          <h1 className="text-3xl font-bold text-white tracking-tight">Find AI Agents</h1>
          <p className="text-gray-400 mt-1.5">
            Discover verified agents with privacy-preserving reputation proofs
          </p>
        </div>
        <button
          onClick={handleSearch}
          disabled={isSearching}
          className="btn btn-secondary flex items-center gap-2 self-start"
        >
          <RefreshCw className={`w-4 h-4 transition-transform duration-500 ${isSearching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

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
            {searchResults.map((agent, index) => (
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
      </div>
    </div>
  );
}
