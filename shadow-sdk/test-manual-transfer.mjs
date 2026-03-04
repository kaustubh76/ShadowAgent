#!/usr/bin/env node
// Manual transaction building - bypasses SDK's broken fee floor
// Uses: buildAuthorization → estimateFee → buildFeeAuthorization → buildTransaction → submit

const PRIVATE_KEY = 'APrivateKey1zkpJMuyGRaWpgd5s6qZ1MVYD3BPpW5u53vG3RRxrc6mgVyx';
const ADDRESS = 'aleo15utjfg7hh0pclqmzydd5zvwk3363k64arltw0gt9ss9x0l79yc8qwvvae6';
const ALEO_API_BASE = 'https://api.explorer.provable.com/v1';

async function main() {
  console.log('=== Manual Transaction Building ===\n');

  // Check balance
  const balResp = await fetch(`${ALEO_API_BASE}/testnet/program/credits.aleo/mapping/account/${ADDRESS}`);
  const balText = await balResp.text();
  const match = balText.match(/(\d+)u64/);
  const balance = match ? parseInt(match[1], 10) : 0;
  console.log(`Balance: ${(balance / 1_000_000).toFixed(4)} ALEO\n`);

  const sdk = await import('@provablehq/sdk');
  const { Account, PrivateKey, ProgramManager, AleoNetworkClient, AleoKeyProvider, NetworkRecordProvider } = sdk;

  const account = new Account({ privateKey: PRIVATE_KEY });
  const privKey = PrivateKey.from_string(PRIVATE_KEY);

  const networkClient = new AleoNetworkClient(ALEO_API_BASE);
  const keyProvider = new AleoKeyProvider();
  keyProvider.useCache(true);
  const recordProvider = new NetworkRecordProvider(account, networkClient);
  const programManager = new ProgramManager(ALEO_API_BASE, keyProvider, recordProvider);
  programManager.setAccount(account);

  // Step 1: Build the Authorization
  console.log('Step 1: Building authorization...');
  const authorization = await programManager.buildAuthorization({
    programName: 'credits.aleo',
    functionName: 'transfer_public',
    privateKey: privKey,
    inputs: [ADDRESS, '10000u64'],
  });
  console.log('  Authorization built!\n');

  // Step 2: Get execution ID
  console.log('Step 2: Getting execution ID...');
  const executionId = authorization.toExecutionId().toString();
  console.log(`  Execution ID: ${executionId.slice(0, 30)}...\n`);

  // Step 3: Estimate the actual fee
  console.log('Step 3: Estimating fee...');
  const baseFeeMicrocredits = await programManager.estimateFeeForAuthorization({
    authorization,
    programName: 'credits.aleo',
  });
  const baseFeeCredits = Number(baseFeeMicrocredits) / 1_000_000;
  console.log(`  Estimated base fee: ${baseFeeMicrocredits} microcredits (${baseFeeCredits} ALEO)`);

  const priorityFeeCredits = 0; // No additional priority fee
  const totalFee = baseFeeCredits + priorityFeeCredits;
  console.log(`  Total fee: ${totalFee} ALEO`);
  console.log(`  + Transfer amount: 0.01 ALEO`);
  console.log(`  = Total cost: ${totalFee + 0.01} ALEO\n`);

  if (totalFee + 0.01 > balance / 1_000_000) {
    console.log('  ERROR: Insufficient balance!');
    return;
  }

  // Step 4: Build fee authorization
  console.log('Step 4: Building fee authorization...');
  const feeAuthorization = await programManager.buildFeeAuthorization({
    deploymentOrExecutionId: executionId,
    baseFeeCredits: baseFeeCredits,
    priorityFeeCredits: priorityFeeCredits,
    privateKey: privKey,
  });
  console.log('  Fee authorization built!\n');

  // Step 5: Build transaction from authorizations
  console.log('Step 5: Building transaction...');
  const tx = await programManager.buildTransactionFromAuthorization({
    programName: 'credits.aleo',
    authorization,
    feeAuthorization,
  });
  console.log(`  Transaction built! ID: ${tx.id()}\n`);

  // Step 6: Submit transaction
  console.log('Step 6: Submitting transaction to network...');
  const txId = await networkClient.submitTransaction(tx.toString());
  console.log(`  Submitted! TX ID: ${txId}\n`);

  // Step 7: Wait for confirmation
  console.log('Step 7: Waiting for confirmation...');
  const cleanTxId = (tx.id() || txId).replace(/"/g, '');
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const resp = await fetch(`${ALEO_API_BASE}/testnet/transaction/${cleanTxId}`);
      if (resp.ok) {
        const data = await resp.json();
        console.log(`  CONFIRMED on-chain! Type: ${data.type}`);

        // Check new balance
        await new Promise(r => setTimeout(r, 2000));
        const newBalResp = await fetch(`${ALEO_API_BASE}/testnet/program/credits.aleo/mapping/account/${ADDRESS}`);
        const newBalText = await newBalResp.text();
        const newMatch = newBalText.match(/(\d+)u64/);
        const newBalance = newMatch ? parseInt(newMatch[1], 10) : 0;
        console.log(`\n  Old balance: ${(balance / 1_000_000).toFixed(6)} ALEO`);
        console.log(`  New balance: ${(newBalance / 1_000_000).toFixed(6)} ALEO`);
        console.log(`  Actual cost: ${((balance - newBalance) / 1_000_000).toFixed(6)} ALEO`);
        console.log(`\n  === REAL ON-CHAIN TRANSFER COMPLETE! ===`);
        return;
      }
      console.log(`  Attempt ${i + 1}/20: pending...`);
    } catch {
      console.log(`  Attempt ${i + 1}/20: checking...`);
    }
  }
  console.log(`  Transaction pending. Check explorer: ${ALEO_API_BASE}/testnet/transaction/${cleanTxId}`);
}

main().catch(err => {
  console.error(`FATAL: ${err.message}`);
  if (err.stack) console.error(err.stack.split('\n').slice(0, 5).join('\n'));
});
