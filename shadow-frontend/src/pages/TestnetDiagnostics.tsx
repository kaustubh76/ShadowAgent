import { useState, useCallback, useRef } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Circle,
  Play,
  Send,
  ChevronDown,
  ChevronRight,
  Wallet,
  Coins,
  Box,
  UserCheck,
  Key,
  Heart,
  ArrowRightLeft,
} from 'lucide-react';
import { useShieldWallet } from '../providers/WalletProvider';
import { useToast } from '../contexts/ToastContext';
import { API_BASE } from '../config';
import { fetchWithRetry } from '../lib/api';
import FaucetWidget from '../components/FaucetWidget';
import {
  getBalance,
  getBlockHeight,
  generateSecret,
  hashSecret,
  generateNullifier,
  isAddressRegistered,
  transferPublic,
  waitForTransaction,
  credits,
} from '../services/aleo';

// ============================================
// Types
// ============================================

type TestStatus = 'pending' | 'running' | 'pass' | 'fail' | 'warn';

interface TestDetail {
  label: string;
  value: string;
}

interface TestResult {
  id: string;
  name: string;
  status: TestStatus;
  duration: number | null;
  details: TestDetail[];
  error?: string;
}

const INITIAL_TESTS: TestResult[] = [
  { id: 'wallet', name: 'Wallet Connection', status: 'pending', duration: null, details: [] },
  { id: 'balance', name: 'Balance Check', status: 'pending', duration: null, details: [] },
  { id: 'block', name: 'Block Height', status: 'pending', duration: null, details: [] },
  { id: 'registration', name: 'On-Chain Registration', status: 'pending', duration: null, details: [] },
  { id: 'crypto', name: 'SDK Crypto Functions', status: 'pending', duration: null, details: [] },
  { id: 'facilitator', name: 'Facilitator Health', status: 'pending', duration: null, details: [] },
];

const TRANSFER_TEST: TestResult = {
  id: 'transfer',
  name: 'Real On-Chain Transfer',
  status: 'pending',
  duration: null,
  details: [],
};

const TEST_ICONS: Record<string, typeof Activity> = {
  wallet: Wallet,
  balance: Coins,
  block: Box,
  registration: UserCheck,
  crypto: Key,
  facilitator: Heart,
  transfer: ArrowRightLeft,
};

// ============================================
// Status helpers
// ============================================

function StatusIcon({ status }: { status: TestStatus }) {
  switch (status) {
    case 'pass':
      return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    case 'fail':
      return <XCircle className="w-5 h-5 text-red-400" />;
    case 'warn':
      return <AlertTriangle className="w-5 h-5 text-amber-400" />;
    case 'running':
      return <Loader2 className="w-5 h-5 text-shadow-400 animate-spin" />;
    default:
      return <Circle className="w-5 h-5 text-gray-600" />;
  }
}

function statusColor(status: TestStatus): string {
  switch (status) {
    case 'pass': return 'border-emerald-500/20 bg-emerald-500/5';
    case 'fail': return 'border-red-500/20 bg-red-500/5';
    case 'warn': return 'border-amber-500/20 bg-amber-500/5';
    case 'running': return 'border-shadow-500/20 bg-shadow-500/5';
    default: return 'border-white/[0.04] bg-white/[0.02]';
  }
}

// ============================================
// TestCard component
// ============================================

function TestCard({ test }: { test: TestResult }) {
  const [expanded, setExpanded] = useState(test.status !== 'pending');
  const Icon = TEST_ICONS[test.id] || Activity;

  const showDetails = test.details.length > 0 || test.error;

  return (
    <div className={`rounded-xl border transition-all duration-300 ${statusColor(test.status)}`}>
      <button
        onClick={() => showDetails && setExpanded(!expanded)}
        className="w-full flex items-center gap-4 p-4 text-left"
        disabled={!showDetails}
      >
        <div className="w-10 h-10 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-gray-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">{test.name}</span>
            {test.duration !== null && (
              <span className="text-xs text-gray-500">{test.duration}ms</span>
            )}
          </div>
          {test.error && !expanded && (
            <p className="text-xs text-red-400 truncate mt-0.5">{test.error}</p>
          )}
        </div>

        <StatusIcon status={test.status} />

        {showDetails && (
          <div className="text-gray-500">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        )}
      </button>

      {expanded && showDetails && (
        <div className="px-4 pb-4 pt-0 border-t border-white/[0.04] mt-0">
          <div className="space-y-1.5 pt-3">
            {test.details.map((d, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-gray-500 shrink-0 min-w-[100px]">{d.label}:</span>
                <span className="text-gray-300 font-mono break-all">{d.value}</span>
              </div>
            ))}
            {test.error && (
              <div className="flex items-start gap-2 text-xs">
                <span className="text-red-400 shrink-0 min-w-[100px]">Error:</span>
                <span className="text-red-300 font-mono break-all">{test.error}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Main Page
// ============================================

export default function TestnetDiagnostics() {
  const { publicKey, connected, privateKey } = useShieldWallet();
  const { showToast } = useToast();
  const [tests, setTests] = useState<TestResult[]>(INITIAL_TESTS);
  const [transferTest, setTransferTest] = useState<TestResult>(TRANSFER_TEST);
  const [running, setRunning] = useState(false);
  const [transferRunning, setTransferRunning] = useState(false);
  const abortRef = useRef(false);

  const updateTest = useCallback((id: string, updates: Partial<TestResult>) => {
    setTests(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  // ---- Test runners ----

  const runWalletTest = useCallback(async () => {
    const start = Date.now();
    updateTest('wallet', { status: 'running', details: [], error: undefined });

    if (!connected || !publicKey) {
      updateTest('wallet', {
        status: 'fail',
        duration: Date.now() - start,
        details: [],
        error: 'Wallet not connected. Set VITE_SHIELD_WALLET_PRIVATE_KEY in .env',
      });
      return false;
    }

    updateTest('wallet', {
      status: 'pass',
      duration: Date.now() - start,
      details: [
        { label: 'Address', value: publicKey },
        { label: 'Network', value: 'Aleo Testnet' },
      ],
    });
    return true;
  }, [connected, publicKey, updateTest]);

  const runBalanceTest = useCallback(async () => {
    const start = Date.now();
    updateTest('balance', { status: 'running', details: [], error: undefined });

    try {
      const balance = await getBalance(publicKey!);
      const sufficient = balance >= 100_000;

      updateTest('balance', {
        status: sufficient ? 'pass' : 'warn',
        duration: Date.now() - start,
        details: [
          { label: 'Balance', value: `${balance.toLocaleString()} microcredits` },
          { label: 'ALEO', value: credits.format(balance) },
          { label: 'Sufficient', value: sufficient ? 'Yes (>= 100,000)' : 'No (< 100,000 microcredits)' },
        ],
        error: sufficient ? undefined : 'Low balance — fund via https://faucet.aleo.org',
      });
      return true;
    } catch (err) {
      updateTest('balance', {
        status: 'fail',
        duration: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }, [publicKey, updateTest]);

  const runBlockHeightTest = useCallback(async () => {
    const start = Date.now();
    updateTest('block', { status: 'running', details: [], error: undefined });

    try {
      const height = await getBlockHeight();

      updateTest('block', {
        status: 'pass',
        duration: Date.now() - start,
        details: [
          { label: 'Block Height', value: height.toLocaleString() },
          { label: 'Timestamp', value: new Date().toISOString() },
        ],
      });
      return true;
    } catch (err) {
      updateTest('block', {
        status: 'fail',
        duration: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }, [updateTest]);

  const runRegistrationTest = useCallback(async () => {
    const start = Date.now();
    updateTest('registration', { status: 'running', details: [], error: undefined });

    try {
      const registered = await isAddressRegistered(publicKey!);

      updateTest('registration', {
        status: 'pass',
        duration: Date.now() - start,
        details: [
          { label: 'Address', value: publicKey! },
          { label: 'Registered', value: registered ? 'Yes' : 'No' },
          { label: 'Program', value: 'shadow_agent.aleo' },
        ],
      });
      return true;
    } catch (err) {
      updateTest('registration', {
        status: 'fail',
        duration: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }, [publicKey, updateTest]);

  const runCryptoTest = useCallback(async () => {
    const start = Date.now();
    updateTest('crypto', { status: 'running', details: [], error: undefined });

    try {
      const secret = await generateSecret();
      const hash = await hashSecret(secret);
      const nullifier = await generateNullifier(hash, 'diag_test_' + Date.now());

      updateTest('crypto', {
        status: 'pass',
        duration: Date.now() - start,
        details: [
          { label: 'Secret', value: secret.slice(0, 24) + '...' },
          { label: 'Hash', value: hash.slice(0, 24) + '...' },
          { label: 'Nullifier', value: nullifier.slice(0, 24) + '...' },
        ],
      });
      return true;
    } catch (err) {
      updateTest('crypto', {
        status: 'fail',
        duration: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }, [updateTest]);

  const runFacilitatorTest = useCallback(async () => {
    const start = Date.now();
    updateTest('facilitator', { status: 'running', details: [], error: undefined });

    try {
      const resp = await fetchWithRetry(`${API_BASE}/health`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      updateTest('facilitator', {
        status: 'pass',
        duration: Date.now() - start,
        details: [
          { label: 'Status', value: data.status || 'ok' },
          { label: 'Version', value: data.version || 'unknown' },
          { label: 'Endpoint', value: API_BASE },
        ],
      });
      return true;
    } catch (err) {
      updateTest('facilitator', {
        status: 'warn',
        duration: Date.now() - start,
        details: [{ label: 'Endpoint', value: API_BASE }],
        error: `Facilitator unreachable: ${err instanceof Error ? err.message : String(err)}`,
      });
      return true; // warn, not fatal
    }
  }, [updateTest]);

  // ---- Run all tests ----

  const runAllTests = useCallback(async () => {
    setRunning(true);
    abortRef.current = false;

    // Reset
    setTests(INITIAL_TESTS.map(t => ({ ...t, status: 'pending', duration: null, details: [], error: undefined })));

    const runners = [
      runWalletTest,
      runBalanceTest,
      runBlockHeightTest,
      runRegistrationTest,
      runCryptoTest,
      runFacilitatorTest,
    ];

    let passed = 0;
    let failed = 0;

    for (const runner of runners) {
      if (abortRef.current) break;
      const ok = await runner();
      if (ok) passed++; else failed++;
    }

    showToast(
      failed > 0
        ? `Diagnostics: ${failed} test(s) failed`
        : `All ${passed} tests passed`,
      failed > 0 ? 'error' : 'success'
    );

    setRunning(false);
  }, [runWalletTest, runBalanceTest, runBlockHeightTest, runRegistrationTest, runCryptoTest, runFacilitatorTest, showToast]);

  // ---- Transfer test ----

  const runTransferTest = useCallback(async () => {
    if (!privateKey || !publicKey) {
      showToast('Wallet not connected', 'error');
      return;
    }

    setTransferRunning(true);
    const start = Date.now();
    setTransferTest({ ...TRANSFER_TEST, status: 'running', details: [
      { label: 'Amount', value: '10,000 microcredits (0.01 ALEO)' },
      { label: 'Recipient', value: 'Self (same address)' },
      { label: 'Status', value: 'Submitting transaction...' },
    ] });

    try {
      const txId = await transferPublic(privateKey, publicKey, 10_000, 10_000);

      setTransferTest(prev => ({
        ...prev,
        details: [
          { label: 'Amount', value: '10,000 microcredits (0.01 ALEO)' },
          { label: 'Recipient', value: 'Self (same address)' },
          { label: 'Transaction ID', value: txId },
          { label: 'Status', value: 'Waiting for on-chain confirmation (up to ~5 min)...' },
        ],
      }));

      const confirmation = await waitForTransaction(txId, 60, 5000);

      // Check new balance
      const newBalance = await getBalance(publicKey);

      setTransferTest({
        id: 'transfer',
        name: 'Real On-Chain Transfer',
        status: confirmation.confirmed ? 'pass' : 'warn',
        duration: Date.now() - start,
        details: [
          { label: 'Amount', value: '10,000 microcredits (0.01 ALEO)' },
          { label: 'Transaction ID', value: txId },
          { label: 'Confirmed', value: confirmation.confirmed ? 'Yes' : 'Pending (tx submitted successfully)' },
          ...(confirmation.confirmed
            ? [{ label: 'New Balance', value: `${newBalance.toLocaleString()} microcredits (${credits.format(newBalance)} ALEO)` }]
            : [{ label: 'Note', value: 'Transaction was submitted to Aleo testnet. Confirmation may take a few more minutes. Check explorer for status.' }]
          ),
        ],
        error: confirmation.confirmed ? undefined : undefined, // Not an error — tx was submitted
      });

      showToast(
        confirmation.confirmed ? 'Transfer confirmed on-chain!' : 'Transfer submitted! Confirmation still processing on Aleo testnet.',
        confirmation.confirmed ? 'success' : 'warning'
      );
    } catch (err) {
      setTransferTest({
        id: 'transfer',
        name: 'Real On-Chain Transfer',
        status: 'fail',
        duration: Date.now() - start,
        details: [
          { label: 'Amount', value: '10,000 microcredits (0.01 ALEO)' },
          { label: 'Recipient', value: 'Self (same address)' },
        ],
        error: err instanceof Error ? err.message : String(err),
      });
      showToast('Transfer failed', 'error');
    } finally {
      setTransferRunning(false);
    }
  }, [privateKey, publicKey, showToast]);

  // ---- Summary counts ----

  const allTests = [...tests, transferTest];
  const passCount = allTests.filter(t => t.status === 'pass').length;
  const failCount = allTests.filter(t => t.status === 'fail').length;
  const warnCount = allTests.filter(t => t.status === 'warn').length;
  const hasRun = allTests.some(t => t.status !== 'pending');

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-shadow-500 to-shadow-700 flex items-center justify-center shadow-glow-sm">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Testnet Diagnostics</h1>
            <p className="text-sm text-gray-400">Real Aleo testnet integration tests</p>
          </div>
        </div>
        <span className="px-3 py-1 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Testnet
        </span>
      </div>

      {/* Summary bar */}
      {hasRun && (
        <div className="flex items-center gap-4 p-4 rounded-xl border border-white/[0.04] bg-white/[0.02]">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-emerald-400 font-medium">{passCount} passed</span>
          </div>
          {failCount > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <XCircle className="w-4 h-4 text-red-400" />
              <span className="text-red-400 font-medium">{failCount} failed</span>
            </div>
          )}
          {warnCount > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400 font-medium">{warnCount} warnings</span>
            </div>
          )}
        </div>
      )}

      {/* Standard tests */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Standard Tests</h2>
          <button
            onClick={runAllTests}
            disabled={running}
            className="btn btn-primary flex items-center gap-2 text-sm"
          >
            {running ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {running ? 'Running...' : 'Run All Tests'}
          </button>
        </div>

        <div className="space-y-2">
          {tests.map(test => (
            <TestCard key={test.id} test={test} />
          ))}
        </div>
      </div>

      {/* Transfer test (separate) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">On-Chain Transfer</h2>
            <p className="text-xs text-gray-500 mt-0.5">Sends 0.01 ALEO to self — costs real testnet credits</p>
          </div>
          <button
            onClick={runTransferTest}
            disabled={transferRunning || !connected}
            className="btn btn-outline flex items-center gap-2 text-sm border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
          >
            {transferRunning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {transferRunning ? 'Executing...' : 'Execute Transfer'}
          </button>
        </div>

        <TestCard test={transferTest} />
      </div>

      {/* Faucet widget */}
      <FaucetWidget />
    </div>
  );
}
