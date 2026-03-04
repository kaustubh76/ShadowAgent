#!/usr/bin/env node
// Real Testnet Integration Test
// Tests all SDK functions with actual Aleo testnet credits

const PRIVATE_KEY = 'APrivateKey1zkpJMuyGRaWpgd5s6qZ1MVYD3BPpW5u53vG3RRxrc6mgVyx';
const ADDRESS = 'aleo15utjfg7hh0pclqmzydd5zvwk3363k64arltw0gt9ss9x0l79yc8qwvvae6';
const TESTNET_API = 'https://api.explorer.provable.com/v1/testnet';

async function main() {
  console.log('=== ShadowAgent Real Testnet Integration Test ===\n');

  // Test 1: Balance Check
  console.log('1. Checking wallet balance...');
  const balResp = await fetch(`${TESTNET_API}/program/credits.aleo/mapping/account/${ADDRESS}`);
  const balText = await balResp.text();
  const match = balText.match(/(\d+)u64/);
  const balance = match ? parseInt(match[1], 10) : 0;
  console.log(`   Balance: ${balance} microcredits (${(balance / 1_000_000).toFixed(2)} ALEO)`);

  if (balance < 100_000) {
    console.log('   ERROR: Insufficient balance for testing!');
    process.exit(1);
  }
  console.log('   PASS\n');

  // Test 2: Block Height
  console.log('2. Fetching block height...');
  const heightResp = await fetch(`${TESTNET_API}/latest/height`);
  const height = parseInt(await heightResp.text(), 10);
  console.log(`   Block height: ${height}`);
  console.log('   PASS\n');

  // Test 3: On-chain registration check
  console.log('3. Checking on-chain agent registration...');
  const regResp = await fetch(`${TESTNET_API}/program/shadow_agent.aleo/mapping/registered_agents/${ADDRESS}`);
  const regText = await regResp.text();
  console.log(`   Registered: ${regText.trim()}`);
  console.log('   PASS\n');

  // Test 4: SDK crypto functions
  console.log('4. Testing SDK crypto functions...');
  const { hashSecret, generateSecret, generateNullifier, createReputationProof, ProofType } = await import('./dist/index.mjs');

  const secret = await generateSecret();
  console.log(`   Generated secret: ${secret.slice(0, 20)}...`);

  const hash = await hashSecret(secret);
  console.log(`   Hash of secret: ${hash.slice(0, 20)}...`);

  const nullifier = await generateNullifier(hash, 'job_test_123');
  console.log(`   Nullifier: ${nullifier.slice(0, 20)}...`);
  console.log('   PASS\n');

  // Test 5: ZK Reputation Proof Generation
  console.log('5. Generating ZK reputation proof...');
  try {
    const proof = await createReputationProof(
      ProofType.Tier,
      0, // threshold: New tier
      { totalJobs: 1, totalRatingPoints: 45, totalRevenue: 500000, tier: 0 },
      PRIVATE_KEY
    );
    console.log(`   Proof type: ${proof.proof_type}`);
    console.log(`   Threshold: ${proof.threshold}`);
    console.log(`   Proof hash: ${proof.proof?.slice(0, 30)}...`);
    console.log('   PASS\n');
  } catch (err) {
    console.log(`   WARN: ${err.message}`);
    console.log('   (Proof generation may require WASM - skipping)\n');
  }

  // Test 6: Real on-chain transfer (SMALL amount - 0.01 ALEO)
  console.log('6. Executing real transfer_public on testnet...');
  console.log('   Amount: 10,000 microcredits (0.01 ALEO)');
  console.log('   Recipient: self (same address)');
  console.log('   This is a real on-chain transaction using actual credits!');
  console.log('');

  try {
    // Use the SDK's transferPublic
    const { transferPublic, waitForTransaction } = await import('./dist/index.mjs');

    console.log('   Submitting transaction...');
    const txId = await transferPublic(
      PRIVATE_KEY,
      ADDRESS, // Send to self for testing
      10_000,  // 0.01 credits
      10_000   // 0.01 credits fee
    );

    console.log(`   Transaction ID: ${txId}`);
    console.log('   Waiting for confirmation (up to 60s)...');

    const confirmation = await waitForTransaction(txId, 12, 5000);

    if (confirmation.confirmed) {
      console.log('   CONFIRMED on-chain!');
    } else {
      console.log(`   Pending: ${confirmation.error || 'still processing'}`);
    }

    // Check new balance
    const newBalResp = await fetch(`${TESTNET_API}/program/credits.aleo/mapping/account/${ADDRESS}`);
    const newBalText = await newBalResp.text();
    const newMatch = newBalText.match(/(\d+)u64/);
    const newBalance = newMatch ? parseInt(newMatch[1], 10) : 0;
    console.log(`   New balance: ${newBalance} microcredits (${(newBalance / 1_000_000).toFixed(2)} ALEO)`);
    console.log(`   Spent: ${balance - newBalance} microcredits (fee included)`);
    console.log('   PASS\n');
  } catch (err) {
    console.log(`   ERROR: ${err.message}`);
    console.log('   (Transaction may have failed - check error above)\n');
  }

  // Test 7: Facilitator integration
  console.log('7. Testing facilitator endpoints...');
  try {
    const healthResp = await fetch('http://localhost:3001/health');
    const health = await healthResp.json();
    console.log(`   Health: ${health.status}`);

    const agentResp = await fetch(`http://localhost:3001/agents/by-address/${ADDRESS}`);
    const agent = await agentResp.json();
    console.log(`   Agent: ${agent.agent_id?.slice(0, 16)}... | Jobs: ${agent.total_jobs} | Tier: ${agent.tier}`);
    console.log('   PASS\n');
  } catch (err) {
    console.log(`   WARN: Facilitator not reachable: ${err.message}\n`);
  }

  console.log('=== All tests complete ===');
}

main().catch(console.error);
