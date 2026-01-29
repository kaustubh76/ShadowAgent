// ShadowAgent Facilitator - Indexer Service
// Indexes and caches agent listings from on-chain data

import { AgentListing, SearchParams, SearchResult } from '../types';
import { aleoService } from './aleo';
import { logger } from '../index';

// Configuration from environment
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS || '300000', 10); // 5 minutes default
const INDEX_INTERVAL_MS = parseInt(process.env.INDEX_INTERVAL_MS || '60000', 10); // 1 minute default
const MAX_CACHED_AGENTS = parseInt(process.env.MAX_CACHED_AGENTS || '10000', 10);

interface CacheEntry {
  data: AgentListing;
  timestamp: number;
}

interface IndexerStats {
  cachedAgents: number;
  trackedAgents: number;
  lastIndexTime: number;
  totalFetches: number;
  cacheHits: number;
  cacheMisses: number;
}

export class IndexerService {
  private cache: Map<string, CacheEntry> = new Map();
  private agentIds: Set<string> = new Set();
  private lastIndexTime: number = 0;
  private indexing: boolean = false;
  private indexInterval: NodeJS.Timeout | null = null;
  private stats: IndexerStats = {
    cachedAgents: 0,
    trackedAgents: 0,
    lastIndexTime: 0,
    totalFetches: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  constructor() {
    // Initialize with empty cache
  }

  /**
   * Start background indexing
   */
  startIndexing(): void {
    if (this.indexInterval) {
      return; // Already running
    }

    logger?.info('Starting background indexer...');

    // Initial index
    this.indexAgents().catch(err => {
      logger?.error('Initial indexing failed:', err);
    });

    // Schedule periodic indexing
    this.indexInterval = setInterval(() => {
      this.indexAgents().catch(err => {
        logger?.error('Periodic indexing failed:', err);
      });
    }, INDEX_INTERVAL_MS);
  }

  /**
   * Stop background indexing
   */
  stopIndexing(): void {
    if (this.indexInterval) {
      clearInterval(this.indexInterval);
      this.indexInterval = null;
      logger?.info('Background indexer stopped');
    }
  }

  /**
   * Index agents from on-chain data
   * Fetches all tracked agent IDs and updates the cache
   */
  async indexAgents(): Promise<void> {
    if (this.indexing) {
      return; // Already indexing
    }

    this.indexing = true;
    const startTime = Date.now();

    try {
      const agentIdsToCheck = Array.from(this.agentIds);

      if (agentIdsToCheck.length === 0) {
        logger?.debug('No agents to index');
        return;
      }

      logger?.debug(`Indexing ${agentIdsToCheck.length} agents...`);

      // Fetch listings in batches
      const listings = await aleoService.getAllAgentListings(agentIdsToCheck);

      // Update cache with fetched listings
      const fetchedIds = new Set<string>();
      for (const listing of listings) {
        this.cacheAgent(listing);
        fetchedIds.add(listing.agent_id);
      }

      // Remove agents that no longer exist on-chain
      for (const agentId of agentIdsToCheck) {
        if (!fetchedIds.has(agentId)) {
          this.cache.delete(agentId);
          this.agentIds.delete(agentId);
        }
      }

      this.lastIndexTime = Date.now();
      this.stats.lastIndexTime = this.lastIndexTime;

      logger?.debug(`Indexed ${listings.length} agents in ${Date.now() - startTime}ms`);
    } catch (error) {
      logger?.error('Error during indexing:', error);
    } finally {
      this.indexing = false;
    }
  }

  /**
   * Add an agent ID to track
   */
  trackAgent(agentId: string): void {
    if (this.agentIds.size >= MAX_CACHED_AGENTS) {
      logger?.warn('Max cached agents reached, not tracking new agent');
      return;
    }
    this.agentIds.add(agentId);
    this.stats.trackedAgents = this.agentIds.size;
  }

  /**
   * Remove an agent ID from tracking
   */
  untrackAgent(agentId: string): void {
    this.agentIds.delete(agentId);
    this.cache.delete(agentId);
    this.stats.trackedAgents = this.agentIds.size;
    this.stats.cachedAgents = this.cache.size;
  }

  /**
   * Cache an agent listing
   */
  cacheAgent(listing: AgentListing): void {
    if (this.cache.size >= MAX_CACHED_AGENTS && !this.cache.has(listing.agent_id)) {
      // Evict oldest entry
      const oldestKey = this.findOldestCacheEntry();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(listing.agent_id, {
      data: listing,
      timestamp: Date.now(),
    });
    this.agentIds.add(listing.agent_id);

    this.stats.cachedAgents = this.cache.size;
    this.stats.trackedAgents = this.agentIds.size;
  }

  /**
   * Find the oldest cache entry for eviction
   */
  private findOldestCacheEntry(): string | null {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  /**
   * Get agent from cache or fetch from chain
   */
  async getAgent(agentId: string): Promise<AgentListing | null> {
    this.stats.totalFetches++;

    // Check cache first
    const cached = this.cache.get(agentId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      this.stats.cacheHits++;
      return cached.data;
    }

    this.stats.cacheMisses++;

    // Fetch from chain
    try {
      const listing = await aleoService.getAgentListing(agentId);
      if (listing) {
        this.cacheAgent(listing);
        return listing;
      }
    } catch (error) {
      logger?.error(`Error fetching agent ${agentId}:`, error);

      // Return stale cache entry if available
      if (cached) {
        logger?.debug(`Returning stale cache entry for ${agentId}`);
        return cached.data;
      }
    }

    return null;
  }

  /**
   * Search agents with filters
   */
  async searchAgents(params: SearchParams): Promise<SearchResult> {
    const {
      service_type,
      min_tier,
      is_active = true,
      limit = 20,
      offset = 0,
    } = params;

    // Get all cached agents
    let agents = this.getAllCachedAgents();

    // Apply filters
    if (service_type !== undefined) {
      agents = agents.filter(a => a.service_type === service_type);
    }

    if (min_tier !== undefined) {
      agents = agents.filter(a => a.tier >= min_tier);
    }

    if (is_active !== undefined) {
      agents = agents.filter(a => a.is_active === is_active);
    }

    // Sort by tier (highest first), then by registration time if available
    agents.sort((a, b) => {
      if (b.tier !== a.tier) {
        return b.tier - a.tier;
      }
      // Secondary sort by registered_at if available
      const aTime = a.registered_at || 0;
      const bTime = b.registered_at || 0;
      return bTime - aTime;
    });

    const total = agents.length;

    // Apply pagination
    const paginated = agents.slice(offset, offset + limit);

    return {
      agents: paginated,
      total,
      limit,
      offset,
    };
  }

  /**
   * Get all cached agents (with freshness check)
   */
  getAllCachedAgents(): AgentListing[] {
    const now = Date.now();
    const agents: AgentListing[] = [];
    const staleThreshold = CACHE_TTL_MS * 2; // Allow slightly stale entries for search

    for (const [, entry] of this.cache.entries()) {
      if (now - entry.timestamp < staleThreshold) {
        agents.push(entry.data);
      }
    }

    return agents;
  }

  /**
   * Get cache statistics
   */
  getStats(): IndexerStats {
    return {
      ...this.stats,
      cachedAgents: this.cache.size,
      trackedAgents: this.agentIds.size,
    };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.stats.cachedAgents = 0;
    this.stats.cacheHits = 0;
    this.stats.cacheMisses = 0;
    this.stats.totalFetches = 0;
  }

  /**
   * Import agents from a list of IDs
   * Useful for bootstrapping from an external indexer or config file
   */
  async importAgents(agentIds: string[]): Promise<number> {
    let imported = 0;

    for (const agentId of agentIds) {
      if (this.agentIds.size >= MAX_CACHED_AGENTS) {
        logger?.warn('Max cached agents reached during import');
        break;
      }

      try {
        const listing = await aleoService.getAgentListing(agentId);
        if (listing) {
          this.cacheAgent(listing);
          imported++;
        }
      } catch (error) {
        logger?.debug(`Failed to import agent ${agentId}:`, error);
      }
    }

    logger?.info(`Imported ${imported} agents`);
    return imported;
  }

  /**
   * Register a new agent (called when agent registers on-chain)
   * This can be triggered by listening to transaction events
   */
  async onAgentRegistered(agentId: string): Promise<void> {
    this.trackAgent(agentId);

    // Fetch immediately
    try {
      const listing = await aleoService.getAgentListing(agentId);
      if (listing) {
        this.cacheAgent(listing);
        logger?.info(`New agent registered: ${agentId}`);
      }
    } catch (error) {
      logger?.error(`Failed to fetch newly registered agent ${agentId}:`, error);
    }
  }

  /**
   * Handle agent listing update
   */
  async onAgentUpdated(agentId: string): Promise<void> {
    // Re-fetch the agent listing
    try {
      const listing = await aleoService.getAgentListing(agentId);
      if (listing) {
        this.cacheAgent(listing);
        logger?.debug(`Agent updated: ${agentId}`);
      } else {
        // Agent might have been deactivated or removed
        this.untrackAgent(agentId);
      }
    } catch (error) {
      logger?.error(`Failed to fetch updated agent ${agentId}:`, error);
    }
  }
}

// Export singleton instance
export const indexerService = new IndexerService();
