#!/usr/bin/env node
// Real transfer test with explicit baseFee to override the SDK's excessive 10K ALEO minimum

const PRIVATE_KEY = 'APrivateKey1zkpJMuyGRaWpgd5s6qZ1MVYD3BPpW5u53vG3RRxrc6mgVyx';
const ADDRESS = 'aleo15utjfg7hh0pclqmzydd5zvwk3363k64arltw0gt9ss9x0l79yc8qwvvae6';
const ALEO_API_BASE = 'https://api.explorer.provable.com/v1';

async function main() {
  console.log('=== Transfer with explicit baseFee ===\n');

  // Check balance
  const balResp = await fetch(`${ALEO_API_BASE}/testnet/program/credits.aleo/mapping/account/${ADDRESS}`);
  const balText = await balResp.text();
  const match = balText.match(/(\d+)u64/);
  const balance = match ? parseInt(match[1], 10) : 0;
  console.log(`Balance: ${(balance / 1_000_000).toFixed(4)} ALEO (${balance} microcredits)\n`);

  const sdk = await import('@provablehq/sdk');
  const { Account, ProgramManager, AleoNetworkClient, AleoKeyProvider, NetworkRecordProvider } = sdk;

  const account = new Account({ privateKey: PRIVATE_KEY });
  const networkClient = new AleoNetworkClient(ALEO_API_BASE);
  const keyProvider = new AleoKeyProvider();
  keyProvider.useCache(true);
  const recordProvider = new NetworkRecordProvider(account, networkClient);
  const programManager = new ProgramManager(ALEO_API_BASE, keyProvider, recordProvider);
  programManager.setAccount(account);

  // First estimate the fee
  console.log('Step 1: Estimating execution fee...');
  let estimatedFee = 0;
  try {
    estimatedFee = await programManager.estimateExecutionFee({
      programName: 'credits.aleo',
      functionName: 'transfer_public',
      inputs: [ADDRESS, '10000u64'],
      privateFee: false,
    });
    console.log(`  Estimated base fee: ${estimatedFee} microcredits (${Number(estimatedFee) / 1_000_000} ALEO)`);
  } catch (err) {
    console.log(`  Fee estimation failed: ${err.message}`);
    estimatedFee = 5000; // fallback
  }

  // Add 20% buffer to estimated fee
  const baseFee = Math.ceil(Number(estimatedFee) * 1.2);
  const priorityFee = 1000; // 0.001 ALEO
  const transferAmount = 10_000; // 0.01 ALEO

  console.log(`  baseFee to use: ${baseFee} microcredits (${baseFee / 1_000_000} ALEO)`);
  console.log(`  priorityFee: ${priorityFee} microcredits`);
  console.log(`  transfer amount: ${transferAmount} microcredits`);
  console.log(`  total cost: ~${(baseFee + priorityFee + transferAmount) / 1_000_000} ALEO`);
  console.log('');

  // Execute with explicit baseFee
  console.log('Step 2: Executing transfer_public with explicit baseFee...');
  try {
    const txResult = await programManager.execute({
      programName: 'credits.aleo',
      functionName: 'transfer_public',
      inputs: [ADDRESS, `${transferAmount}u64`],
      priorityFee: priorityFee,
      baseFee: baseFee, // <-- Override the SDK's excessive base fee
      privateFee: false,
    });

    const txId = typeof txResult === 'string' ? txResult : (txResult?.transactionId || txResult?.id || JSON.stringify(txResult).slice(0, 100));
    console.log(`  Transaction submitted! ID: ${txId}\n`);

    // Wait for confirmation
    console.log('Step 3: Waiting for on-chain confirmation...');
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const cleanId = txId.replace(/^"/, '').replace(/"$/, '');
        const resp = await fetch(`${ALEO_API_BASE}/testnet/transaction/${cleanId}`);
        if (resp.ok) {
          const data = await resp.json();
          console.log(`  CONFIRMED! Type: ${data.type || 'execute'}`);

          // Check new balance
          const newBalResp = await fetch(`${ALEO_API_BASE}/testnet/program/credits.aleo/mapping/account/${ADDRESS}`);
          const newBalText = await newBalResp.text();
          const newMatch = newBalText.match(/(\d+)u64/);
          const newBalance = newMatch ? parseInt(newMatch[1], 10) : 0;
          console.log(`  Old balance: ${(balance / 1_000_000).toFixed(6)} ALEO`);
          console.log(`  New balance: ${(newBalance / 1_000_000).toFixed(6)} ALEO`);
          console.log(`  Total spent: ${((balance - newBalance) / 1_000_000).toFixed(6)} ALEO`);
          console.log('\n  SUCCESS! Real on-chain transfer completed!');
          return;
        }
        console.log(`  Attempt ${i + 1}/15: pending...`);
      } catch {
        console.log(`  Attempt ${i + 1}/15: checking...`);
      }
    }
    console.log('  Transaction still pending after 75 seconds. Check explorer manually.');
    console.log(`  TX: ${txId}`);

  } catch (err) {
    console.log(`  ERROR: ${err.message}\n`);

    if (err.message.includes('microcredits')) {
      // Parse the fee from error message
      const feeMatch = err.message.match(/requires a fee of (\d+) microcredits/);
      const balMatch = err.message.match(/has (\d+) microcredits/);
      if (feeMatch && balMatch) {
        console.log(`  Required: ${parseInt(feeMatch[1]) / 1_000_000} ALEO`);
        console.log(`  Available: ${parseInt(balMatch[1]) / 1_000_000} ALEO`);
      }
    }
  }
}

main().catch(console.error);
