#!/usr/bin/env node
// Test the fixed SDK transferPublic and other functions

const PRIVATE_KEY = 'APrivateKey1zkpJMuyGRaWpgd5s6qZ1MVYD3BPpW5u53vG3RRxrc6mgVyx';
const ADDRESS = 'aleo15utjfg7hh0pclqmzydd5zvwk3363k64arltw0gt9ss9x0l79yc8qwvvae6';

async function main() {
  console.log('=== Fixed SDK Integration Test ===\n');

  const sdk = await import('./dist/index.mjs');

  // Test 1: Balance
  console.log('1. Balance check...');
  const balance = await sdk.getBalance(ADDRESS);
  console.log(`   ${(balance / 1_000_000).toFixed(4)} ALEO\n`);

  // Test 2: Block height
  console.log('2. Block height...');
  const height = await sdk.getBlockHeight();
  console.log(`   Height: ${height}\n`);

  // Test 3: ZK Proof
  console.log('3. ZK reputation proof...');
  const proof = await sdk.createReputationProof(
    sdk.ProofType.Tier, 0,
    { totalJobs: 1, totalRatingPoints: 45, totalRevenue: 500000, tier: 0 },
    PRIVATE_KEY
  );
  console.log(`   Proof generated! Type: ${proof.proof_type}\n`);

  // Test 4: Fixed transferPublic
  console.log('4. Transfer (using fixed manual tx building)...');
  console.log('   Sending 0.01 ALEO to self...');
  try {
    const txId = await sdk.transferPublic(PRIVATE_KEY, ADDRESS, 10_000, 1_000);
    console.log(`   TX: ${txId}\n`);

    // Wait for confirmation
    console.log('5. Waiting for confirmation...');
    const result = await sdk.waitForTransaction(txId, 15, 5000);
    if (result.confirmed) {
      console.log('   CONFIRMED!\n');
    } else {
      console.log(`   Pending: ${result.error || 'still processing'}\n`);
    }

    // Check new balance
    const newBalance = await sdk.getBalance(ADDRESS);
    console.log(`6. New balance: ${(newBalance / 1_000_000).toFixed(4)} ALEO`);
    console.log(`   Spent: ${((balance - newBalance) / 1_000_000).toFixed(6)} ALEO\n`);
  } catch (err) {
    console.log(`   ERROR: ${err.message}\n`);
  }

  console.log('=== All tests complete ===');
}

main().catch(console.error);
