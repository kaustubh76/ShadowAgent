#!/usr/bin/env node
// Check the actual fee estimation for transfer_public

const PRIVATE_KEY = 'APrivateKey1zkpJMuyGRaWpgd5s6qZ1MVYD3BPpW5u53vG3RRxrc6mgVyx';
const ADDRESS = 'aleo15utjfg7hh0pclqmzydd5zvwk3363k64arltw0gt9ss9x0l79yc8qwvvae6';
const ALEO_API_BASE = 'https://api.explorer.provable.com/v1';

async function main() {
  console.log('=== Fee Estimation Check ===\n');

  // Check balance
  const balResp = await fetch(`${ALEO_API_BASE}/testnet/program/credits.aleo/mapping/account/${ADDRESS}`);
  const balText = await balResp.text();
  console.log(`Raw balance response: ${balText}`);
  const match = balText.match(/(\d+)u64/);
  const balance = match ? parseInt(match[1], 10) : 0;
  console.log(`Parsed balance: ${balance}`);
  console.log(`In ALEO: ${balance / 1_000_000}`);
  console.log('');

  // The fee error said 10,000,002,725
  const fee = 10_000_002_725;
  console.log(`Required fee: ${fee}`);
  console.log(`In ALEO: ${fee / 1_000_000}`);
  console.log(`Balance > Fee? ${balance > fee}`);
  console.log('');

  // Let's check what a recent transfer_public transaction costs on testnet
  console.log('Checking recent transfer_public fees on testnet...');
  try {
    const resp = await fetch(`${ALEO_API_BASE}/testnet/latest/block`);
    const block = await resp.json();
    console.log(`Latest block height: ${block.header?.metadata?.height || 'unknown'}`);

    // Check transactions in the block
    if (block.transactions) {
      for (const tx of block.transactions) {
        if (tx.transaction?.execution?.transitions) {
          for (const t of tx.transaction.execution.transitions) {
            if (t.program === 'credits.aleo' && t.function === 'transfer_public') {
              console.log(`Found transfer_public in block!`);
              console.log(`  Fee: ${tx.transaction.fee?.transition?.outputs?.[0]?.value || 'unknown'}`);
            }
          }
        }
      }
    }
  } catch (err) {
    console.log(`Error checking blocks: ${err.message}`);
  }

  // Check the ProgramManager's fee estimation
  console.log('\nTrying to estimate fee via SDK...');
  const sdk = await import('@provablehq/sdk');
  const { Account, ProgramManager, AleoNetworkClient, AleoKeyProvider, NetworkRecordProvider } = sdk;

  const account = new Account({ privateKey: PRIVATE_KEY });
  const networkClient = new AleoNetworkClient(ALEO_API_BASE);
  const keyProvider = new AleoKeyProvider();
  keyProvider.useCache(true);
  const recordProvider = new NetworkRecordProvider(account, networkClient);
  const programManager = new ProgramManager(ALEO_API_BASE, keyProvider, recordProvider);
  programManager.setAccount(account);

  // Try estimateExecutionFee
  try {
    const estimated = await programManager.estimateExecutionFee({
      programName: 'credits.aleo',
      functionName: 'transfer_public',
      inputs: [ADDRESS, '10000u64'],
      privateFee: false,
    });
    console.log(`Estimated fee: ${estimated}`);
    console.log(`In ALEO: ${Number(estimated) / 1_000_000}`);
  } catch (err) {
    console.log(`estimateExecutionFee error: ${err.message}`);
  }

  // Try with estimateNetworkFee
  try {
    if (programManager.estimateNetworkFee) {
      const netFee = await programManager.estimateNetworkFee('credits.aleo', 'transfer_public', [ADDRESS, '10000u64']);
      console.log(`Network fee: ${netFee}`);
    }
  } catch (err) {
    console.log(`estimateNetworkFee error: ${err.message}`);
  }

  // Check the fee multiplier or minimum fee on the network
  console.log('\nChecking network configuration...');
  try {
    const latestResp = await fetch(`${ALEO_API_BASE}/testnet/latest/block`);
    const latestBlock = await latestResp.json();
    const header = latestBlock.header;
    if (header?.metadata) {
      console.log(`Proof target: ${header.metadata.proof_target}`);
      console.log(`Coinbase target: ${header.metadata.coinbase_target}`);
      console.log(`Cumulative weight: ${header.metadata.cumulative_weight}`);
    }
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
}

main().catch(console.error);
