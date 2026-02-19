# ShadowAgent Testing Implementation Guide

## Overview

This guide covers comprehensive testing strategies for all ShadowAgent components: Leo smart contracts, Facilitator service, SDK, and Frontend.

### Test Suite Summary

| Component | Tests | Key Test Files |
|-----------|-------|---------------|
| **SDK** | 168 | `client.test.ts`, `agent.test.ts`, `crypto.test.ts`, `decay.test.ts`, `decay-cross-verify.test.ts` |
| **Facilitator** | 342 | `agents.test.ts`, `sessions.test.ts`, `disputes.test.ts`, `refunds.test.ts`, `multisig.test.ts`, `rateLimiter.test.ts`, `x402.test.ts`, `integration.test.ts`, `ttlStore.test.ts`, `resilience.test.ts`, `shutdown.test.ts`, `consistentHash.test.ts`, `health.test.ts`, `verify.test.ts`, `aleo.test.ts`, `indexer.test.ts` |
| **Frontend** | Partial | Component tests (`AgentCard`, `RatingForm`, `TierBadge`), Store tests (`agentStore`, `sdkStore`, `walletStore`), API tests (`api.test.ts`) |
| **Total** | 510+ | All passing |

### SDK Test Environment Setup

The SDK requires a `globalThis.crypto` polyfill for Node.js test environments:

```typescript
// src/jest.setup.ts — referenced in jest.config.js setupFiles
import { webcrypto } from 'crypto';

if (!globalThis.crypto) {
  (globalThis as any).crypto = webcrypto;
}
```

This provides `SHA-256`, `getRandomValues()`, and `randomUUID()` in Node.js, matching the browser `crypto` API the SDK relies on.

---

## 1. Smart Contract Testing

### 1.1 Leo Test Setup

```bash
# Navigate to contract directory
cd shadow_agent

# Create test inputs directory
mkdir -p inputs
```

### 1.2 Unit Test Files

Create test input files for each transition:

```bash
# inputs/test_register.in
[register_agent]
service_type: 1u8
endpoint_hash: 123456789field
bond_amount: 10000000u64
```

```bash
# inputs/test_rating.in
[submit_rating]
agent_address: aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc
job_hash: 111222333field
rating: 45u8
payment_amount: 1000000u64
burn_amount: 500000u64
```

### 1.3 Running Leo Tests

```bash
# Test individual transition (10 credits = 10000000 microcredits)
leo run register_agent 1u8 123456789field 10000000u64

# Run with input file
leo run --input inputs/test_register.in

# Build and check for errors
leo build 2>&1 | tee build.log
```

### 1.4 Test Cases

#### 1.4.1 Registration Tests

```bash
# Test Case: REG-01 - Valid registration with bond
# Expected: Success, returns AgentReputation and AgentBond records
leo run register_agent 1u8 123field 10000000u64

# Test Case: REG-02 - Different service types (all with 10 credit bond)
leo run register_agent 1u8 123field 10000000u64  # NLP
leo run register_agent 2u8 123field 10000000u64  # Vision
leo run register_agent 3u8 123field 10000000u64  # Code

# Test Case: REG-03 - Duplicate address (should fail in finalize)
# Run same address twice - second should fail (address already registered)

# Test Case: REG-04 - Insufficient bond (should fail in transition)
leo run register_agent 1u8 123field 5000000u64  # Only 5 credits - should fail
```

#### 1.4.2 Rating Tests

```bash
# Test Case: RAT-01 - Valid rating (5 stars)
leo run submit_rating aleo1test... 111field 50u8 1000000u64 500000u64

# Test Case: RAT-02 - Valid rating (1 star)
leo run submit_rating aleo1test... 112field 10u8 1000000u64 500000u64

# Test Case: RAT-03 - Invalid rating (0 stars) - should fail
leo run submit_rating aleo1test... 113field 0u8 1000000u64 500000u64

# Test Case: RAT-04 - Invalid rating (60 = 6 stars) - should fail
leo run submit_rating aleo1test... 114field 60u8 1000000u64 500000u64

# Test Case: RAT-05 - Below minimum payment - should fail
leo run submit_rating aleo1test... 115field 45u8 50000u64 500000u64

# Test Case: RAT-06 - Below minimum burn - should fail
leo run submit_rating aleo1test... 116field 45u8 1000000u64 100000u64
```

#### 1.4.3 Reputation Update Tests

```bash
# Test Case: UPD-01 - Valid update
# First create a rating record, then update reputation

# Test Case: UPD-02 - Verify job count increments
# Test Case: UPD-03 - Verify rating points accumulate
# Test Case: UPD-04 - Verify revenue accumulates
# Test Case: UPD-05 - Verify tier upgrades at thresholds
```

#### 1.4.4 Proof Generation Tests

```bash
# Test Case: PRV-01 - Prove tier >= Bronze
leo run prove_tier <reputation_record> 1u8

# Test Case: PRV-02 - Prove rating >= 4.0
leo run prove_rating <reputation_record> 40u8

# Test Case: PRV-03 - Prove jobs >= 10
leo run prove_jobs <reputation_record> 10u64

# Test Case: PRV-04 - Prove revenue in range
leo run prove_revenue_range <reputation_record> 1000000u64 10000000u64

# Test Case: PRV-05 - Prove tier below actual (should succeed)
# Test Case: PRV-06 - Prove tier above actual (should fail)
```

#### 1.4.5 Escrow Tests

```bash
# Test Case: ESC-01 - Create valid escrow
leo run create_escrow aleo1agent... 1000000u64 123field 456field 100u64

# Test Case: ESC-02 - Claim with correct secret
leo run claim_escrow <escrow_record> <secret>

# Test Case: ESC-03 - Claim with wrong secret (should fail)
leo run claim_escrow <escrow_record> <wrong_secret>

# Test Case: ESC-04 - Refund after deadline
leo run refund_escrow <escrow_record>

# Test Case: ESC-05 - Refund before deadline (should fail)
# Test Case: ESC-06 - Claim after deadline (should fail)
```

### 1.5 Test Script

```bash
#!/bin/bash
# test_contract.sh

set -e

echo "=== ShadowAgent Contract Tests ==="

# Build
echo "Building contract..."
leo build

# Test Registration
echo "Testing registration..."
leo run register_agent 1u8 123field 10000000u64 && echo "✓ REG-01 passed"

# Test Rating (valid)
echo "Testing valid rating..."
leo run submit_rating aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc 111field 45u8 1000000u64 500000u64 && echo "✓ RAT-01 passed"

# Test Rating (invalid - should fail)
echo "Testing invalid rating..."
if leo run submit_rating aleo1test... 113field 0u8 1000000u64 500000u64 2>/dev/null; then
    echo "✗ RAT-03 failed - should have rejected 0 rating"
    exit 1
else
    echo "✓ RAT-03 passed - correctly rejected 0 rating"
fi

# Test Escrow
echo "Testing escrow..."
leo run create_escrow aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc 1000000u64 123field 456field 100u64 && echo "✓ ESC-01 passed"

echo ""
echo "=== All tests passed! ==="
```

---

## 2. Facilitator Service Testing

### 2.1 Test Setup

```bash
cd shadow-facilitator

# Install test dependencies
npm install --save-dev jest @types/jest ts-jest supertest @types/supertest

# Create jest config
npx ts-jest config:init
```

### 2.2 Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

> **Coverage Exceptions (MVP):** The following components are stubbed in the MVP and may not meet the 80% threshold: proof verification in `aleo.service.ts` (returns placeholder `true`), event indexer in `indexer.service.ts` (uses in-memory cache). These are documented as planned for Phase 10a (Foundation Hardening). See [02_Facilitator_Implementation.md](02_Facilitator_Implementation.md) for details.

### 2.3 Test Files

#### 2.3.1 Agent Routes Tests

```typescript
// tests/routes/agents.test.ts
import request from 'supertest';
import express from 'express';
import agentsRouter from '../../src/routes/agents';
import { indexerService } from '../../src/services/indexer';

// Mock the indexer service
jest.mock('../../src/services/indexer');

const app = express();
app.use(express.json());
app.use('/agents', agentsRouter);

describe('Agents API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /agents', () => {
    it('should return empty array when no agents', async () => {
      (indexerService.searchAgents as jest.Mock).mockReturnValue({
        agents: [],
        total: 0,
      });

      const response = await request(app)
        .get('/agents')
        .expect(200);

      expect(response.body).toEqual({
        agents: [],
        total: 0,
        limit: 20,
        offset: 0,
      });
    });

    it('should filter by service type', async () => {
      const mockAgents = [
        { agent_id: '123', service_type: 1, tier: 2, is_active: true },
      ];

      (indexerService.searchAgents as jest.Mock).mockReturnValue({
        agents: mockAgents,
        total: 1,
      });

      const response = await request(app)
        .get('/agents?service_type=1')
        .expect(200);

      expect(indexerService.searchAgents).toHaveBeenCalledWith(
        expect.objectContaining({ service_type: 1 })
      );
      expect(response.body.agents).toHaveLength(1);
    });

    it('should filter by minimum tier', async () => {
      (indexerService.searchAgents as jest.Mock).mockReturnValue({
        agents: [],
        total: 0,
      });

      await request(app)
        .get('/agents?min_tier=2')
        .expect(200);

      expect(indexerService.searchAgents).toHaveBeenCalledWith(
        expect.objectContaining({ min_tier: 2 })
      );
    });

    it('should respect pagination limits', async () => {
      (indexerService.searchAgents as jest.Mock).mockReturnValue({
        agents: [],
        total: 0,
      });

      const response = await request(app)
        .get('/agents?limit=50&offset=10')
        .expect(200);

      expect(response.body.limit).toBe(50);
      expect(response.body.offset).toBe(10);
    });

    it('should cap limit at 100', async () => {
      (indexerService.searchAgents as jest.Mock).mockReturnValue({
        agents: [],
        total: 0,
      });

      const response = await request(app)
        .get('/agents?limit=500')
        .expect(200);

      expect(response.body.limit).toBe(100);
    });
  });

  describe('GET /agents/:agentId', () => {
    it('should return 404 for non-existent agent', async () => {
      (indexerService.getAgent as jest.Mock).mockReturnValue(undefined);

      await request(app)
        .get('/agents/nonexistent')
        .expect(404);
    });

    it('should return agent details', async () => {
      const mockAgent = {
        agent_id: '123',
        service_type: 1,
        tier: 2,
        is_active: true,
      };

      (indexerService.getAgent as jest.Mock).mockReturnValue(mockAgent);

      const response = await request(app)
        .get('/agents/123')
        .expect(200);

      expect(response.body).toEqual(mockAgent);
    });
  });
});
```

#### 2.3.2 Verification Routes Tests

```typescript
// tests/routes/verify.test.ts
import request from 'supertest';
import express from 'express';
import verifyRouter from '../../src/routes/verify';
import { aleoService } from '../../src/services/aleo';

jest.mock('../../src/services/aleo');

const app = express();
app.use(express.json());
app.use('/verify', verifyRouter);

describe('Verify API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /verify/escrow', () => {
    it('should return 400 for missing fields', async () => {
      const response = await request(app)
        .post('/verify/escrow')
        .send({})
        .expect(400);

      expect(response.body.valid).toBe(false);
      expect(response.body.error).toContain('Missing required fields');
    });

    it('should verify valid escrow proof', async () => {
      (aleoService.verifyEscrowProof as jest.Mock).mockResolvedValue(true);

      const response = await request(app)
        .post('/verify/escrow')
        .send({
          proof: { proof: 'abc', nullifier: 'def', commitment: 'ghi' },
          expected_agent: 'aleo1test...',
          min_amount: 100000,
        })
        .expect(200);

      expect(response.body.valid).toBe(true);
    });

    it('should reject invalid escrow proof', async () => {
      (aleoService.verifyEscrowProof as jest.Mock).mockResolvedValue(false);

      const response = await request(app)
        .post('/verify/escrow')
        .send({
          proof: { proof: 'invalid', nullifier: 'def', commitment: 'ghi' },
          expected_agent: 'aleo1test...',
        })
        .expect(200);

      expect(response.body.valid).toBe(false);
    });
  });

  describe('POST /verify/reputation', () => {
    it('should verify valid reputation proof', async () => {
      (aleoService.verifyReputationProof as jest.Mock).mockResolvedValue({
        valid: true,
        tier: 2,
      });

      const response = await request(app)
        .post('/verify/reputation')
        .send({
          proof: { proof_type: 4, threshold: 2, proof: 'abc' },
          proof_type: 4,
          threshold: 2,
        })
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.tier).toBe(2);
    });

    it('should reject proof that does not meet threshold', async () => {
      (aleoService.verifyReputationProof as jest.Mock).mockResolvedValue({
        valid: false,
      });

      const response = await request(app)
        .post('/verify/reputation')
        .send({
          proof: { proof_type: 4, threshold: 4, proof: 'abc' },
          proof_type: 4,
          threshold: 4,
        })
        .expect(200);

      expect(response.body.valid).toBe(false);
    });
  });
});
```

#### 2.3.3 Health Routes Tests

```typescript
// tests/routes/health.test.ts
import request from 'supertest';
import express from 'express';
import healthRouter from '../../src/routes/health';
import { aleoService } from '../../src/services/aleo';

jest.mock('../../src/services/aleo');

const app = express();
app.use('/health', healthRouter);

describe('Health API', () => {
  describe('GET /health', () => {
    it('should return ok status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('GET /health/ready', () => {
    it('should return ready when Aleo is connected', async () => {
      (aleoService.getBlockHeight as jest.Mock).mockResolvedValue(1234567);

      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body.status).toBe('ready');
      expect(response.body.blockHeight).toBe(1234567);
    });

    it('should return not ready when Aleo is disconnected', async () => {
      (aleoService.getBlockHeight as jest.Mock).mockResolvedValue(0);

      const response = await request(app)
        .get('/health/ready')
        .expect(503);

      expect(response.body.status).toBe('not ready');
    });
  });
});
```

### 2.4 Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/routes/agents.test.ts

# Run in watch mode
npm test -- --watch
```

---

## 3. SDK Testing

### 3.1 Test Setup

```bash
cd shadow-sdk

# Install test dependencies
npm install --save-dev jest @types/jest ts-jest
```

### 3.2 Client SDK Tests

```typescript
// tests/client.test.ts
import { ShadowAgentClient } from '../src/client';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ShadowAgentClient', () => {
  let client: ShadowAgentClient;

  beforeEach(() => {
    // Mock axios.create
    mockedAxios.create.mockReturnValue({
      get: jest.fn(),
      post: jest.fn(),
    } as any);

    client = new ShadowAgentClient({
      privateKey: 'APrivateKey1test...',
      network: 'testnet',
    });
  });

  describe('searchAgents', () => {
    it('should search agents with filters', async () => {
      const mockAgents = [
        { agent_id: '123', service_type: 1, tier: 2 },
      ];

      const facilitator = (client as any).facilitator;
      facilitator.get.mockResolvedValue({
        data: { agents: mockAgents, total: 1 },
      });

      const results = await client.searchAgents({
        serviceType: 1,
        minTier: 2,
      });

      expect(results).toEqual(mockAgents);
      expect(facilitator.get).toHaveBeenCalledWith('/agents', {
        params: { serviceType: 1, minTier: 2 },
      });
    });

    it('should return empty array on error', async () => {
      const facilitator = (client as any).facilitator;
      facilitator.get.mockRejectedValue(new Error('Network error'));

      // Should handle gracefully or throw
      await expect(client.searchAgents({})).rejects.toThrow();
    });
  });

  describe('submitRating', () => {
    it('should scale stars to rating', async () => {
      const executeSpy = jest.spyOn(client as any, 'aleo')
        .mockImplementation(() => ({
          execute: jest.fn().mockResolvedValue('tx123'),
        }));

      // Stars 5 should become rating 50
      // Stars 4 should become rating 40
      // etc.
    });

    it('should reject invalid star ratings', async () => {
      await expect(
        client.submitRating({
          agentAddress: 'aleo1...',
          jobHash: '123',
          stars: 6, // Invalid
          paymentAmount: 100000n,
        })
      ).rejects.toThrow('Stars must be between 1 and 5');
    });
  });
});
```

### 3.3 Agent SDK Tests

```typescript
// tests/agent.test.ts
import { ShadowAgentServer } from '../src/agent';
import { Tier, ServiceType } from '../src/common/types';

describe('ShadowAgentServer', () => {
  let agent: ShadowAgentServer;

  beforeEach(() => {
    agent = new ShadowAgentServer({
      privateKey: 'APrivateKey1test...',
      network: 'testnet',
      serviceType: ServiceType.NLP,
      endpointUrl: 'https://example.com',
      pricePerRequest: 100000,
    });
  });

  describe('calculateTier', () => {
    it('should return New for no activity', () => {
      const tier = (agent as any).calculateTier(0n, 0n);
      expect(tier).toBe(Tier.New);
    });

    it('should return Bronze at threshold', () => {
      const tier = (agent as any).calculateTier(10n, 10_000_000n);
      expect(tier).toBe(Tier.Bronze);
    });

    it('should return Silver at threshold', () => {
      const tier = (agent as any).calculateTier(50n, 100_000_000n);
      expect(tier).toBe(Tier.Silver);
    });

    it('should return Gold at threshold', () => {
      const tier = (agent as any).calculateTier(200n, 1_000_000_000n);
      expect(tier).toBe(Tier.Gold);
    });

    it('should return Diamond at threshold', () => {
      const tier = (agent as any).calculateTier(1000n, 10_000_000_000n);
      expect(tier).toBe(Tier.Diamond);
    });

    it('should require both jobs AND revenue', () => {
      // High jobs, low revenue
      expect((agent as any).calculateTier(1000n, 0n)).toBe(Tier.New);

      // Low jobs, high revenue
      expect((agent as any).calculateTier(0n, 10_000_000_000n)).toBe(Tier.New);
    });
  });

  describe('getAverageRating', () => {
    it('should return null when no jobs', () => {
      expect(agent.getAverageRating()).toBeNull();
    });

    it('should calculate correct average', async () => {
      // Mock reputation
      (agent as any).reputation = {
        totalJobs: 10n,
        totalRatingPoints: 450n, // 45 avg scaled
      };

      expect(agent.getAverageRating()).toBe(4.5);
    });
  });

  describe('generateEscrowSecret', () => {
    it('should generate unique secrets', () => {
      const secret1 = agent.generateEscrowSecret('job1');
      const secret2 = agent.generateEscrowSecret('job2');

      expect(secret1.secretHash).not.toBe(secret2.secretHash);
    });

    it('should store secrets for retrieval', () => {
      agent.generateEscrowSecret('job123');
      const secret = agent.getSecret('job123');

      expect(secret).toBeDefined();
    });
  });
});
```

### 3.4 Crypto Utils Tests

```typescript
// tests/utils/crypto.test.ts
import {
  generateRandomField,
  generateJobHash,
  generateSecret,
  generateNullifier,
} from '../src/utils/crypto';

describe('Crypto Utilities', () => {
  describe('generateRandomField', () => {
    it('should generate non-empty string', () => {
      const field = generateRandomField();
      expect(field).toBeTruthy();
      expect(typeof field).toBe('string');
    });

    it('should generate unique values', () => {
      const field1 = generateRandomField();
      const field2 = generateRandomField();
      expect(field1).not.toBe(field2);
    });
  });

  describe('generateJobHash', () => {
    it('should generate consistent hash for same inputs', () => {
      const hash1 = generateJobHash('/api/analyze', 'POST', 1000);
      const hash2 = generateJobHash('/api/analyze', 'POST', 1000);
      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different inputs', () => {
      const hash1 = generateJobHash('/api/analyze', 'POST', 1000);
      const hash2 = generateJobHash('/api/analyze', 'GET', 1000);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('generateSecret', () => {
    it('should return secret and hash', () => {
      const { secret, hash } = generateSecret();
      expect(secret).toBeTruthy();
      expect(hash).toBeTruthy();
    });

    it('should generate different secrets each time', () => {
      const s1 = generateSecret();
      const s2 = generateSecret();
      expect(s1.secret).not.toBe(s2.secret);
    });
  });

  describe('generateNullifier', () => {
    it('should be deterministic', () => {
      const n1 = generateNullifier('aleo1abc...', 'job123');
      const n2 = generateNullifier('aleo1abc...', 'job123');
      expect(n1).toBe(n2);
    });

    it('should be unique per client+job pair', () => {
      const n1 = generateNullifier('aleo1abc...', 'job123');
      const n2 = generateNullifier('aleo1abc...', 'job456');
      const n3 = generateNullifier('aleo1xyz...', 'job123');
      expect(n1).not.toBe(n2);
      expect(n1).not.toBe(n3);
    });
  });
});
```

### 3.5 Reputation Decay Tests (Phase 10a)

```typescript
// src/decay.test.ts — Tests for calculateDecayedRating and estimateDecayPeriods

describe('Reputation Decay', () => {
  test('applies 95% decay per period', () => { /* ... */ });
  test('caps at MAX_DECAY_STEPS (10)', () => { /* ... */ });
  test('estimateDecayPeriods returns correct count', () => { /* ... */ });
  test('calculateEffectiveTier downgrades after decay', () => { /* ... */ });
});

// src/decay-cross-verify.test.ts — Cross-verifies SDK decay math against Leo contract logic
describe('Decay Cross-Verification', () => {
  test('SDK and contract produce identical decay results', () => { /* ... */ });
  test('tier boundaries match after decay', () => { /* ... */ });
});
```

---

## 4. Frontend Testing

### 4.1 Test Setup

```bash
cd shadow-frontend

# Install test dependencies
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom
```

### 4.2 Vitest Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
  },
});
```

```typescript
// tests/setup.ts
import '@testing-library/jest-dom';
```

### 4.3 Component Tests

```typescript
// tests/components/TierBadge.test.tsx
import { render, screen } from '@testing-library/react';
import { TierBadge } from '../../src/components/common/TierBadge';
import { Tier } from '../../src/types';

describe('TierBadge', () => {
  it('renders New tier correctly', () => {
    render(<TierBadge tier={Tier.New} />);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('renders Bronze tier correctly', () => {
    render(<TierBadge tier={Tier.Bronze} />);
    expect(screen.getByText('Bronze')).toBeInTheDocument();
  });

  it('renders with different sizes', () => {
    const { rerender } = render(<TierBadge tier={Tier.Gold} size="sm" />);
    expect(screen.getByText('Gold')).toHaveClass('text-xs');

    rerender(<TierBadge tier={Tier.Gold} size="lg" />);
    expect(screen.getByText('Gold')).toHaveClass('text-base');
  });
});
```

```typescript
// tests/components/StarRating.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { StarRating } from '../../src/components/common/StarRating';

describe('StarRating', () => {
  it('renders 5 stars', () => {
    render(<StarRating />);
    const stars = screen.getAllByRole('button');
    expect(stars).toHaveLength(5);
  });

  it('displays correct rating', () => {
    render(<StarRating rating={3} readonly />);
    // Check visual state of stars
  });

  it('calls onRate when clicked', () => {
    const onRate = vi.fn();
    render(<StarRating onRate={onRate} />);

    const stars = screen.getAllByRole('button');
    fireEvent.click(stars[3]); // Click 4th star

    expect(onRate).toHaveBeenCalledWith(4);
  });

  it('does not call onRate when readonly', () => {
    const onRate = vi.fn();
    render(<StarRating rating={3} onRate={onRate} readonly />);

    const stars = screen.getAllByRole('button');
    fireEvent.click(stars[4]);

    expect(onRate).not.toHaveBeenCalled();
  });
});
```

### 4.4 Store Tests

```typescript
// tests/store/agentStore.test.ts
import { useAgentStore } from '../../src/store/agentStore';
import { Tier } from '../../src/types';

describe('Agent Store', () => {
  beforeEach(() => {
    // Reset store
    useAgentStore.setState({
      reputation: null,
      transactions: [],
      isRegistered: false,
    });
  });

  it('sets reputation correctly', () => {
    const mockRep = {
      owner: 'aleo1...',
      agentId: '123',
      totalJobs: 10,
      totalRatingPoints: 450,
      totalRevenue: 1000,
      tier: Tier.Bronze,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };

    useAgentStore.getState().setReputation(mockRep);

    expect(useAgentStore.getState().reputation).toEqual(mockRep);
    expect(useAgentStore.getState().isRegistered).toBe(true);
  });

  it('adds transactions', () => {
    const tx = {
      id: '1',
      type: 'rating_submitted' as const,
      timestamp: Date.now(),
      details: 'Test',
      isPrivate: true,
    };

    useAgentStore.getState().addTransaction(tx);

    expect(useAgentStore.getState().transactions).toHaveLength(1);
    expect(useAgentStore.getState().transactions[0]).toEqual(tx);
  });

  it('limits transactions to 50', () => {
    for (let i = 0; i < 60; i++) {
      useAgentStore.getState().addTransaction({
        id: String(i),
        type: 'rating_submitted',
        timestamp: Date.now(),
        details: `Test ${i}`,
        isPrivate: true,
      });
    }

    expect(useAgentStore.getState().transactions).toHaveLength(50);
  });

  it('updates reputation correctly', () => {
    // Set initial reputation
    useAgentStore.getState().setReputation({
      owner: 'aleo1...',
      agentId: '123',
      totalJobs: 9,
      totalRatingPoints: 400,
      totalRevenue: 9_000_000, // $90
      tier: Tier.New,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    });

    // Add job that should trigger Bronze
    useAgentStore.getState().updateReputation(45, 1_000_000); // $10

    const rep = useAgentStore.getState().reputation;
    expect(rep?.totalJobs).toBe(10);
    expect(rep?.totalRatingPoints).toBe(445);
    expect(rep?.totalRevenue).toBe(10_000_000);
    expect(rep?.tier).toBe(Tier.Bronze);
  });
});
```

### 4.5 Running Frontend Tests

```bash
# Run tests
npm test

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch

# Run specific file
npm test -- tests/components/TierBadge.test.tsx
```

---

## 5. Integration Tests

### 5.1 End-to-End Test Scenario

```typescript
// tests/e2e/full-flow.test.ts

describe('Full Flow Integration', () => {
  it('should complete agent registration → service → rating flow', async () => {
    // 1. Agent registers
    // 2. Agent appears in search
    // 3. Client creates escrow
    // 4. Agent delivers service
    // 5. Agent claims escrow
    // 6. Client submits rating
    // 7. Agent updates reputation
    // 8. Agent generates proof
    // 9. Verify proof shows updated tier
  });

  it('should handle escrow timeout correctly', async () => {
    // 1. Client creates escrow
    // 2. Wait for deadline
    // 3. Client requests refund
    // 4. Verify funds returned
  });

  it('should prevent double rating', async () => {
    // 1. Client completes job
    // 2. Client submits rating
    // 3. Client tries to submit again
    // 4. Verify second rating fails
  });
});
```

### 5.2 Test Checklist

```
SMART CONTRACT
□ REG-01: Valid agent registration with bond
□ REG-02: Duplicate address rejection
□ REG-03: Insufficient bond rejection
□ UNREG-01: Valid unregistration with bond return
□ RAT-01: Valid 5-star rating
□ RAT-02: Valid 1-star rating
□ RAT-03: Invalid 0-star rejection
□ RAT-04: Invalid 6-star rejection
□ RAT-05: Below minimum payment rejection
□ RAT-06: Below minimum burn rejection
□ UPD-01: Valid reputation update
□ UPD-02: Tier upgrade at Bronze threshold
□ UPD-03: Tier upgrade at Silver threshold
□ PRV-01: Valid tier proof
□ PRV-02: Invalid tier proof rejection
□ ESC-01: Valid escrow creation
□ ESC-02: Valid escrow claim
□ ESC-03: Invalid secret rejection
□ ESC-04: Valid timeout refund
□ ESC-05: Early refund rejection

FACILITATOR
□ API-01: Agent search returns results
□ API-02: Agent search filters work
□ API-03: Agent lookup by ID
□ API-04: Escrow proof verification
□ API-05: Reputation proof verification
□ API-06: Health check endpoints

SDK
□ SDK-01: Client search agents
□ SDK-02: Client create escrow
□ SDK-03: Client submit rating
□ SDK-04: Agent register
□ SDK-05: Agent update reputation
□ SDK-06: Agent generate proofs
□ SDK-07: Middleware handles 402

FRONTEND
□ UI-01: Wallet connection
□ UI-02: Agent dashboard renders
□ UI-03: Reputation card displays data
□ UI-04: Proof generator works
□ UI-05: Client search works
□ UI-06: Agent cards render
□ UI-07: Transaction log updates
```

---

## 6. CI/CD Integration

### 6.1 GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  contract-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install Leo
        run: |
          curl -sSf https://install.leo-lang.org | sh
          echo "$HOME/.leo/bin" >> $GITHUB_PATH

      - name: Build and Test Contract
        run: |
          cd shadow_agent
          leo build
          ./test_contract.sh

  facilitator-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install and Test
        run: |
          cd shadow-facilitator
          npm ci
          npm test -- --coverage

      - name: Upload Coverage
        uses: codecov/codecov-action@v3

  sdk-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install and Test
        run: |
          cd shadow-sdk
          npm ci
          npm test -- --coverage

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install and Test
        run: |
          cd shadow-frontend
          npm ci
          npm test -- --coverage
```

---

*End of Testing Implementation Guide*
