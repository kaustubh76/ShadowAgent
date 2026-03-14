#!/usr/bin/env ts-node
/**
 * Seed Agents Script
 *
 * Generates Aleo keypairs and registers them as agents on the testnet.
 * Uses the Aleo faucet for testnet credits, then calls register_agent on-chain.
 *
 * Usage:
 *   npx ts-node scripts/seed-agents.ts [--count N] [--facilitator URL]
 *
 * Output: SEED_AGENTS string for .env
 */

import * as crypto from 'crypto';

const FACILITATOR_URL = process.env.FACILITATOR_URL || 'http://localhost:3001';
const FAUCET_URL = 'https://faucet.aleo.org';
const RPC_URL = process.env.ALEO_RPC_URL || 'https://api.explorer.provable.com/v1';
const PROGRAM_ID = process.env.PROGRAM_ID || 'shadow_agent.aleo';

// Service types to cycle through
const SERVICE_TYPES = [1, 2, 3, 4, 5, 6, 7]; // NLP, Vision, Code, Data, Audio, Multi, Custom
const SERVICE_NAMES = ['NLP', 'Vision', 'Code', 'Data', 'Audio', 'Multi', 'Custom'];

interface GeneratedAgent {
  address: string;
  privateKey: string;
  serviceType: number;
  tier: number;
}

async function generateAgents(count: number): Promise<GeneratedAgent[]> {
  console.log(`\n🔑 Generating ${count} agent keypairs...\n`);

  // Dynamic import for ESM @provablehq/sdk
  const { Account } = await import('@provablehq/sdk');

  const agents: GeneratedAgent[] = [];
  for (let i = 0; i < count; i++) {
    const account = new Account();
    const serviceType = SERVICE_TYPES[i % SERVICE_TYPES.length];
    // Distribute tiers: mostly New/Bronze, some Silver/Gold
    const tierWeights = [0, 0, 1, 1, 2, 3];
    const tier = tierWeights[i % tierWeights.length];

    agents.push({
      address: account.address().to_string(),
      privateKey: account.privateKey().to_string(),
      serviceType,
      tier,
    });

    console.log(
      `  Agent ${i + 1}: ${account.address().to_string().slice(0, 20)}... ` +
      `(${SERVICE_NAMES[serviceType - 1]}, Tier ${tier})`
    );
  }

  return agents;
}

async function checkBalance(address: string): Promise<number> {
  try {
    const response = await fetch(
      `${RPC_URL}/testnet/program/credits.aleo/mapping/account/${address}`
    );
    if (response.ok) {
      const text = await response.text();
      const match = text.match(/(\d+)u64/);
      return match ? parseInt(match[1], 10) : 0;
    }
  } catch {
    // RPC unavailable
  }
  return 0;
}

async function waitForBalance(address: string, minBalance: number, maxWaitMs = 120_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const balance = await checkBalance(address);
    if (balance >= minBalance) {
      console.log(`    ✅ Balance: ${(balance / 1_000_000).toFixed(2)} credits`);
      return true;
    }
    await new Promise(r => setTimeout(r, 10_000));
    process.stdout.write('.');
  }
  console.log(`\n    ⚠️  Timeout waiting for balance`);
  return false;
}

async function registerWithFacilitator(agent: GeneratedAgent): Promise<boolean> {
  try {
    const response = await fetch(`${FACILITATOR_URL}/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: agent.address,
        service_type: agent.serviceType,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`    ✅ Registered with facilitator: ${data.agent_id?.slice(0, 20)}...`);
      return true;
    } else {
      const error = await response.json().catch(() => ({}));
      console.log(`    ⚠️  Facilitator registration failed: ${error.error || response.status}`);
      return false;
    }
  } catch (err) {
    console.log(`    ⚠️  Facilitator unreachable: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

function buildSeedAgentsString(agents: GeneratedAgent[]): string {
  return agents
    .map(a => `${a.address}:${a.serviceType}:${a.tier}`)
    .join(',');
}

async function main() {
  const args = process.argv.slice(2);
  const countIdx = args.indexOf('--count');
  const count = countIdx >= 0 ? parseInt(args[countIdx + 1], 10) : 8;
  const facilitatorOnly = args.includes('--facilitator-only');

  console.log('╔══════════════════════════════════════════╗');
  console.log('║   ShadowAgent - Agent Seeding Script     ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`\nConfig:`);
  console.log(`  Facilitator: ${FACILITATOR_URL}`);
  console.log(`  RPC:         ${RPC_URL}`);
  console.log(`  Program:     ${PROGRAM_ID}`);
  console.log(`  Count:       ${count}`);
  console.log(`  Mode:        ${facilitatorOnly ? 'Facilitator-only (no on-chain)' : 'Full (on-chain + facilitator)'}`);

  // Generate keypairs
  const agents = await generateAgents(count);

  if (facilitatorOnly) {
    // Just register with facilitator (no faucet/on-chain needed)
    console.log('\n📡 Registering agents with facilitator...\n');
    let registered = 0;
    for (const agent of agents) {
      console.log(`  Agent: ${agent.address.slice(0, 20)}... (${SERVICE_NAMES[agent.serviceType - 1]})`);
      const ok = await registerWithFacilitator(agent);
      if (ok) registered++;
    }
    console.log(`\n✅ Registered ${registered}/${agents.length} agents with facilitator`);
  } else {
    console.log('\n💧 Faucet funding required for on-chain registration.');
    console.log('   Each agent needs ~15 credits (10 bond + 5 fees).');
    console.log('   Visit https://faucet.aleo.org/ and fund each address.\n');

    console.log('   Addresses to fund:\n');
    for (const agent of agents) {
      console.log(`   ${agent.address}`);
    }

    console.log('\n   After funding, re-run with --facilitator-only to register.');
  }

  // Output SEED_AGENTS string
  const seedString = buildSeedAgentsString(agents);
  console.log('\n═══════════════════════════════════════════');
  console.log('📋 SEED_AGENTS for .env:\n');
  console.log(`SEED_AGENTS=${seedString}`);
  console.log('\n═══════════════════════════════════════════');

  // Also output private keys for reference
  console.log('\n🔐 Private keys (save these if you want to manage agents later):\n');
  for (const agent of agents) {
    console.log(`  ${agent.address.slice(0, 20)}... → ${agent.privateKey}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
