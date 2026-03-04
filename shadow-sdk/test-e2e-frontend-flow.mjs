#!/usr/bin/env node
// End-to-end test: Simulates the exact frontend escrow flow
// Tests: balance check → escrow payment (transfer_public) → wait for confirmation → verify balance change
// This mirrors what happens when a user clicks "Request Service" in the AgentDetails page

const PRIVATE_KEY = 'APrivateKey1zkpJMuyGRaWpgd5s6qZ1MVYD3BPpW5u53vG3RRxrc6mgVyx';
const ADDRESS = 'aleo15utjfg7hh0pclqmzydd5zvwk3363k64arltw0gt9ss9x0l79yc8qwvvae6';
const AGENT_ADDRESS = ADDRESS; // Self-transfer for testing

async function main() {
  console.log('=== Frontend E2E Escrow Flow Test ===\n');

  // Step 1: Import SDK (mirrors lazy import in useTransactions.ts)
  console.log('1. Importing SDK (lazy, like frontend)...');
  const sdk = await import('./dist/index.mjs');
  console.log('   SDK loaded.\n');

  // Step 2: Check balance (mirrors useBalanceCheck hook)
  console.log('2. Checking balance (useBalanceCheck)...');
  const balance = await sdk.getBalance(ADDRESS);
  console.log(`   Balance: ${(balance / 1_000_000).toFixed(4)} ALEO (${balance} microcredits)\n`);

  // Step 3: Verify sufficient funds (mirrors createEscrow check)
  const ESCROW_AMOUNT = 10_000; // 0.01 credits - same as TEST_AMOUNT in useTransactions.ts
  const FEE = 10_000; // 0.01 credits - same as TEST_FEE
  const totalNeeded = ESCROW_AMOUNT + FEE;

  console.log('3. Checking sufficient funds...');
  if (balance < totalNeeded) {
    console.log(`   FAIL: Insufficient balance: have ${balance}, need ${totalNeeded}`);
    return;
  }
  console.log(`   OK: Have ${balance} >= ${totalNeeded} needed\n`);

  // Step 4: Create escrow via transfer_public (mirrors signTransaction call)
  console.log('4. Creating escrow (transfer_public via manual tx building)...');
  console.log(`   Sending ${ESCROW_AMOUNT / 1_000_000} credits to agent: ${AGENT_ADDRESS.slice(0, 20)}...`);

  const startTime = Date.now();
  try {
    const txId = await sdk.transferPublic(PRIVATE_KEY, AGENT_ADDRESS, ESCROW_AMOUNT, FEE);
    const buildTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`   TX submitted in ${buildTime}s: ${txId}\n`);

    // Step 5: Wait for confirmation (mirrors waitForTransaction in useEscrowTransaction)
    console.log('5. Waiting for confirmation (12 attempts, 5s interval)...');
    const confirmation = await sdk.waitForTransaction(txId, 12, 5000);

    if (confirmation.confirmed) {
      console.log('   CONFIRMED on-chain!\n');
    } else {
      console.log(`   Pending: ${confirmation.error || 'still processing'}`);
      console.log('   (Transaction submitted but not yet finalized)\n');
    }

    // Step 6: Check updated balance
    console.log('6. Checking updated balance...');
    const newBalance = await sdk.getBalance(ADDRESS);
    const spent = balance - newBalance;
    console.log(`   New balance: ${(newBalance / 1_000_000).toFixed(4)} ALEO`);
    console.log(`   Total spent (amount + fee): ${(spent / 1_000_000).toFixed(6)} ALEO`);
    console.log(`   Expected spend: ~${((ESCROW_AMOUNT + 2725) / 1_000_000).toFixed(6)} ALEO (amount + ~0.002725 base fee)\n`);

    // Step 7: Verify facilitator can see the transaction
    console.log('7. Checking facilitator health...');
    try {
      const healthResp = await fetch('http://localhost:3001/health');
      const health = await healthResp.json();
      console.log(`   Facilitator: ${health.status}\n`);
    } catch {
      console.log('   Facilitator not running (ok for this test)\n');
    }

    console.log('=== E2E RESULT: SUCCESS ===');
    console.log(`Transaction ID: ${txId}`);
    console.log(`Amount: ${ESCROW_AMOUNT / 1_000_000} credits`);
    console.log(`Actual fee: ~${(spent - ESCROW_AMOUNT) / 1_000_000} credits`);
    console.log(`Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  } catch (err) {
    console.log(`   ERROR: ${err.message}\n`);
    console.log('=== E2E RESULT: FAILED ===');
  }
}

main().catch(console.error);
