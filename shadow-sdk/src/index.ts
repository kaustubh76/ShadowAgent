// ShadowAgent SDK - Main Entry Point
// Privacy-Preserving AI Agent Marketplace on Aleo

// Client SDK
export { ShadowAgentClient, createClient } from './client';

// Agent SDK
export { ShadowAgentServer, createAgent } from './agent';

// Types
export {
  // Enums
  ServiceType,
  Tier,
  ProofType,
  EscrowStatus,
  // Interfaces
  AgentListing,
  AgentReputation,
  RatingRecord,
  ReputationProof,
  EscrowRecord,
  PaymentSession,
  PaymentTerms,
  SearchParams,
  SearchResult,
  EscrowProof,
  VerificationResult,
  ClientConfig,
  AgentConfig,
  RequestOptions,
  RequestResult,
  TransactionReceipt,
  HealthStatus,
  // Constants
  TIER_THRESHOLDS,
  RATING_CONSTANTS,
  // Phase 10a: New feature types
  DisputeStatus,
  RefundStatus,
  PartialRefundProposal,
  Dispute,
  DecayedReputation,
  DECAY_CONSTANTS,
  MultiSigEscrowConfig,
  MultiSigEscrow,
} from './types';

// Crypto utilities
export {
  generateSecret,
  hashSecret,
  generateJobHash,
  generateNullifier,
  generateAgentId,
  encodeBase64,
  decodeBase64,
  generateCommitment,
  verifyHash,
  generateSessionId,
  signData,
  verifySignature,
  generateBondCommitment,
  createEscrowProof,
  createReputationProof,
  createAccount,
  executeTransaction,
  getAddress,
  generatePrivateKey,
  currency,
  rating,
  credits,
  // Real on-chain functions
  getBalance,
  getBlockHeight,
  transferPublic,
  transferPrivate,
  executeCreditsProgram,
  executeProgram,
  waitForTransaction,
  // Phase 10a: Extension program & decay utilities
  SHADOW_AGENT_EXT_PROGRAM,
  calculateDecayedRating,
  estimateDecayPeriods,
  calculateEffectiveTier,
} from './crypto';

// Version
export const VERSION = '0.1.0';

// Import for quickStart helpers (using ESM imports, not require)
import { ShadowAgentClient as ClientClass, createClient as createClientFn } from './client';
import { ShadowAgentServer as ServerClass, createAgent as createAgentFn } from './agent';

// Quick start helpers
export const quickStart = {
  /**
   * Create a client for consuming AI services
   *
   * @example
   * ```typescript
   * import { quickStart } from '@shadowagent/sdk';
   *
   * const client = quickStart.client({ privateKey: 'your-key' });
   * const agents = await client.searchAgents({ service_type: ServiceType.NLP });
   * ```
   */
  client: (config?: {
    privateKey?: string;
    network?: 'testnet' | 'mainnet';
    facilitatorUrl?: string;
  }) => {
    return new ClientClass(config);
  },

  /**
   * Create an agent server for providing AI services
   *
   * @example
   * ```typescript
   * import { quickStart, ServiceType } from '@shadowagent/sdk';
   *
   * const agent = quickStart.agent({
   *   privateKey: 'your-key',
   *   serviceType: ServiceType.NLP,
   *   pricePerRequest: 100000
   * });
   *
   * app.use('/api', agent.middleware());
   * ```
   */
  agent: (config: {
    privateKey: string;
    serviceType: number;
    pricePerRequest?: number;
    network?: 'testnet' | 'mainnet';
    facilitatorUrl?: string;
  }) => {
    return new ServerClass(config);
  },
};

// Default export (using ESM imports)
export default {
  ShadowAgentClient: ClientClass,
  ShadowAgentServer: ServerClass,
  createClient: createClientFn,
  createAgent: createAgentFn,
  quickStart,
  VERSION,
};
