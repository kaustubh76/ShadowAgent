import { useState } from 'react';
import { Shield, AlertCircle, Loader2 } from 'lucide-react';
import { useShieldWallet } from '../../providers/WalletProvider';
import { useToast } from '../../contexts/ToastContext';
import { useBalanceCheck } from '../../hooks/useTransactions';
import {
  MAX_BOND_AMOUNT,
  POLL_INTERVAL,
  MAX_POLL_ATTEMPTS,
} from '../../constants/ui';
import {
  SHADOW_AGENT_PROGRAM_ID,
  REGISTRATION_BOND,
  ServiceType,
  buildRegisterAgentInputs,
  formatU8ForLeo,
  formatFieldForLeo,
  formatU64ForLeo,
} from '../../services/aleo';
import { getServiceTypeName } from '../../stores/agentStore';
import { API_BASE, FACILITATOR_ENABLED } from '../../config';

interface RegistrationFormProps {
  onRegistered: () => void;
}

export default function RegistrationForm({ onRegistered }: RegistrationFormProps) {
  const { publicKey, signTransaction } = useShieldWallet();
  const toast = useToast();
  const { checkBalance } = useBalanceCheck();

  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  // Form state
  const [selectedServiceType, setSelectedServiceType] = useState<ServiceType>(ServiceType.NLP);
  const [endpointUrl, setEndpointUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [bondAmount, setBondAmount] = useState<number>(REGISTRATION_BOND);
  const [bondError, setBondError] = useState<string | null>(null);

  const validateUrl = (url: string) => {
    if (!url) { setUrlError(null); return; }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        setUrlError('URL must use HTTPS');
      } else {
        setUrlError(null);
      }
    } catch {
      setUrlError('Please enter a valid URL');
    }
  };

  const validateBond = (amount: number) => {
    if (amount < REGISTRATION_BOND) {
      setBondError(`Minimum bond is ${REGISTRATION_BOND / 1_000_000} credits`);
    } else if (amount > MAX_BOND_AMOUNT * 1_000_000) {
      setBondError(`Maximum bond is ${MAX_BOND_AMOUNT.toLocaleString()} credits`);
    } else if (!Number.isFinite(amount) || amount <= 0) {
      setBondError('Please enter a valid amount');
    } else {
      setBondError(null);
    }
  };

  const handleRegister = async () => {
    if (!publicKey) {
      setError('Please connect your Shield Wallet first');
      return;
    }

    if (!endpointUrl) {
      setError('Please enter your service endpoint URL');
      return;
    }

    try {
      const url = new URL(endpointUrl);
      if (url.protocol !== 'https:') {
        setError('Endpoint URL must use HTTPS');
        return;
      }
    } catch {
      setError('Please enter a valid URL (e.g. https://your-service.example.com/api)');
      return;
    }

    if (bondAmount < REGISTRATION_BOND) {
      setError(`Minimum bond is ${REGISTRATION_BOND / 1_000_000} credits`);
      return;
    }

    if (bondAmount > MAX_BOND_AMOUNT * 1_000_000) {
      setError(`Bond amount exceeds maximum (${MAX_BOND_AMOUNT.toLocaleString()} credits)`);
      return;
    }

    if (!Number.isFinite(bondAmount) || bondAmount <= 0) {
      setError('Please enter a valid bond amount');
      return;
    }

    setIsRegistering(true);
    setError(null);
    setTxStatus('Building registration transaction...');
    toast.info('Preparing agent registration...');
    checkBalance();

    try {
      const inputs = await buildRegisterAgentInputs(selectedServiceType, endpointUrl, bondAmount);

      setTxStatus('Signing transaction with Shield Wallet...');
      toast.info('Signing transaction with Shield Wallet...');

      const txId = await signTransaction(
        SHADOW_AGENT_PROGRAM_ID,
        'register_agent',
        [
          formatU8ForLeo(inputs.service_type),
          formatFieldForLeo(inputs.endpoint_hash),
          formatU64ForLeo(inputs.bond_amount),
        ],
        Math.floor(bondAmount / 1000)
      );

      setTxStatus(`Transaction submitted: ${txId.slice(0, 16)}...`);
      toast.success('Transaction submitted to network!');

      setTxStatus('Waiting for on-chain confirmation (this may take up to 60 seconds)...');
      toast.info('Waiting for blockchain confirmation...');

      let confirmed = false;
      for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
        try {
          const response = await fetch(
            `https://api.explorer.provable.com/v1/testnet/transaction/${txId}`
          );
          if (response.ok) {
            const txData = await response.json();
            if (txData.status === 'confirmed' || txData.type === 'execute') {
              confirmed = true;
              break;
            }
          }
        } catch {
          // Continue polling
        }
      }

      if (confirmed) {
        setTxStatus('Registration confirmed!');
        toast.success(`Agent registered successfully as ${getServiceTypeName(selectedServiceType)} agent!`);

        // Notify facilitator (non-blocking)
        if (FACILITATOR_ENABLED) {
          fetch(`${API_BASE}/agents/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              address: publicKey,
              service_type: selectedServiceType,
              endpoint_url: endpointUrl,
              bond_amount: bondAmount,
              tx_id: txId,
            }),
          }).catch(() => {});
        }

        onRegistered();
      } else {
        setTxStatus('Transaction still pending - this may take a few minutes');
        toast.warning('Transaction pending - check Aleo Explorer for status');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Registration failed';
      setError(errorMessage);
      toast.error(errorMessage);
      setTxStatus(null);
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-scale-in">
      <div className="text-center mb-10">
        <div className="relative inline-block mb-5">
          <div className="w-18 h-18 rounded-2xl bg-gradient-to-br from-shadow-500 to-shadow-700 p-4 mx-auto shadow-glow-sm">
            <Shield className="w-10 h-10 text-white animate-float" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">Register as an Agent</h1>
        <p className="text-gray-400 max-w-lg mx-auto leading-relaxed">
          Join the marketplace and start monetizing your AI services with privacy-preserving reputation.
        </p>
      </div>

      <div className="card">
        {error && (
          <div className="flex items-center gap-3 bg-red-500/5 border border-red-500/20 text-red-300 p-4 rounded-xl mb-6 animate-fade-in-down">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {txStatus && (
          <div className="flex items-center gap-3 bg-blue-500/5 border border-blue-500/20 text-blue-300 p-4 rounded-xl mb-6 animate-fade-in-down">
            <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
            <span className="text-sm">{txStatus}</span>
          </div>
        )}

        <div className="space-y-6">
          {/* Service Type */}
          <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}>
            <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Service Type</label>
            <select
              value={selectedServiceType}
              onChange={(e) => setSelectedServiceType(Number(e.target.value))}
              className="input"
              disabled={isRegistering}
            >
              {Object.values(ServiceType)
                .filter((v) => typeof v === 'number')
                .map((type) => (
                  <option key={type} value={type}>
                    {getServiceTypeName(type as ServiceType)}
                  </option>
                ))}
            </select>
          </div>

          {/* Endpoint URL */}
          <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}>
            <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Service Endpoint URL</label>
            <input
              type="url"
              value={endpointUrl}
              onChange={(e) => {
                setEndpointUrl(e.target.value);
                validateUrl(e.target.value);
              }}
              onBlur={() => validateUrl(endpointUrl)}
              placeholder="https://your-service.example.com/api"
              className={`input ${urlError ? 'border-red-500/50 focus:border-red-500/50' : ''}`}
              disabled={isRegistering}
            />
            {urlError ? (
              <p className="text-xs text-red-400 mt-1.5">{urlError}</p>
            ) : (
              <p className="text-xs text-gray-600 mt-1.5">
                Your endpoint URL will be hashed for privacy. Only you can reveal it.
              </p>
            )}
          </div>

          {/* Bond Amount */}
          <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}>
            <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
              Registration Bond (min: {REGISTRATION_BOND / 1_000_000}, max: {MAX_BOND_AMOUNT.toLocaleString()} credits)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={bondAmount / 1_000_000}
                onChange={(e) => {
                  const newAmount = parseFloat(e.target.value) * 1_000_000;
                  setBondAmount(newAmount);
                  validateBond(newAmount);
                }}
                onBlur={() => validateBond(bondAmount)}
                min={REGISTRATION_BOND / 1_000_000}
                max={MAX_BOND_AMOUNT}
                step={1}
                className={`input ${bondError ? 'border-red-500/50 focus:border-red-500/50' : ''}`}
                disabled={isRegistering}
              />
              <span className="text-gray-500 text-sm font-medium">credits</span>
            </div>
            {bondError ? (
              <p className="text-xs text-red-400 mt-1.5">{bondError}</p>
            ) : (
              <p className="text-xs text-gray-600 mt-1.5">
                Higher bonds signal stronger commitment and provide better Sybil resistance.
              </p>
            )}
          </div>

          {/* Registration Bond Info */}
          <div className="bg-shadow-950/40 border border-shadow-500/10 rounded-xl p-5 opacity-0 animate-fade-in-up" style={{ animationDelay: '0.4s', animationFillMode: 'forwards' }}>
            <h3 className="text-sm font-semibold text-white mb-3">Registration Bond</h3>
            <ul className="text-xs text-gray-400 space-y-2">
              <li className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-shadow-500 mt-1.5 flex-shrink-0" />
                Stake is held by you in an AgentBond record
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-shadow-500 mt-1.5 flex-shrink-0" />
                Bond is fully returned when you unregister
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-shadow-500 mt-1.5 flex-shrink-0" />
                One agent per wallet address (Sybil resistance)
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-shadow-500 mt-1.5 flex-shrink-0" />
                Transaction is signed via Shield Wallet
              </li>
            </ul>
          </div>

          {/* Register Button */}
          <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '0.5s', animationFillMode: 'forwards' }}>
            <button
              onClick={handleRegister}
              disabled={isRegistering || !endpointUrl || !!urlError || !!bondError}
              className="btn btn-primary w-full py-3.5 flex items-center justify-center gap-2 text-base"
            >
              {isRegistering ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Registering...
                </>
              ) : (
                <>
                  <Shield className="w-5 h-5" />
                  Register Agent ({bondAmount / 1_000_000} credits)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
