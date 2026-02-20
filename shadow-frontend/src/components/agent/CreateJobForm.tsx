import { useState } from 'react';
import { Briefcase, X, Lock, Users, AlertCircle, Loader2 } from 'lucide-react';
import { ServiceType, getServiceTypeName, useAgentStore } from '../../stores/agentStore';
import { createJob, createMultiSigEscrow } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

interface CreateJobFormProps {
  isOpen: boolean;
  onClose: () => void;
  agentAddress: string;
}

const SERVICE_TYPES = [
  ServiceType.NLP,
  ServiceType.Vision,
  ServiceType.Code,
  ServiceType.Data,
  ServiceType.Audio,
  ServiceType.Multi,
  ServiceType.Custom,
];

export default function CreateJobForm({ isOpen, onClose, agentAddress }: CreateJobFormProps) {
  const { addJob, addTransaction } = useAgentStore();
  const toast = useToast();

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType>(ServiceType.NLP);
  const [pricing, setPricing] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [secretHash, setSecretHash] = useState('');
  const [escrowAmount, setEscrowAmount] = useState('');

  // Multi-sig options
  const [multiSigEnabled, setMultiSigEnabled] = useState(false);
  const [signers, setSigners] = useState(['', '', '']);
  const [requiredSigs, setRequiredSigs] = useState(2);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidAddress = (addr: string) => addr.startsWith('aleo1') && addr.length > 10;
  const validSigners = signers.filter(s => isValidAddress(s));

  const canSubmit =
    title.trim() &&
    description.trim() &&
    parseFloat(pricing) > 0 &&
    parseFloat(escrowAmount) > 0 &&
    isValidAddress(clientAddress) &&
    secretHash.trim() &&
    (!multiSigEnabled || validSigners.length >= requiredSigs);

  const handleSignerChange = (index: number, value: string) => {
    const updated = [...signers];
    updated[index] = value;
    setSigners(updated);
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setServiceType(ServiceType.NLP);
    setPricing('');
    setClientAddress('');
    setSecretHash('');
    setEscrowAmount('');
    setMultiSigEnabled(false);
    setSigners(['', '', '']);
    setRequiredSigs(2);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);

    const pricingMicrocredits = Math.round(parseFloat(pricing) * 1_000_000);
    const escrowMicrocredits = Math.round(parseFloat(escrowAmount) * 1_000_000);

    try {
      const jobResult = await createJob({
        agent: agentAddress,
        client: clientAddress,
        title: title.trim(),
        description: description.trim(),
        service_type: serviceType,
        pricing: pricingMicrocredits,
        escrow_amount: escrowMicrocredits,
        secret_hash: secretHash.trim(),
        multisig_enabled: multiSigEnabled,
        signers: multiSigEnabled ? signers as [string, string, string] : undefined,
        required_signatures: multiSigEnabled ? requiredSigs : undefined,
      });

      if (!jobResult.success || !jobResult.job) {
        setError(jobResult.error || 'Failed to create job');
        return;
      }

      // If multi-sig enabled, also create the multi-sig escrow
      if (multiSigEnabled) {
        const escrowResult = await createMultiSigEscrow({
          agent: agentAddress,
          owner: clientAddress,
          amount: escrowMicrocredits,
          job_hash: jobResult.job.job_hash,
          secret_hash: secretHash.trim(),
          signers: signers as [string, string, string],
          required_signatures: requiredSigs,
        });

        if (!escrowResult.success) {
          toast.warning('Job created but multi-sig escrow setup failed: ' + escrowResult.error);
        }
      }

      addJob(jobResult.job);
      addTransaction({
        type: 'job_created',
        agentId: agentAddress,
        amount: escrowMicrocredits,
      });

      toast.success(`Job "${title}" created successfully!`);
      resetForm();
      onClose();
    } catch {
      setError('Network error creating job');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-job-title"
        className="relative bg-surface-1 rounded-2xl border border-white/[0.08] shadow-2xl max-w-lg w-full p-6 animate-scale-in max-h-[85vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/20 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 id="create-job-title" className="text-lg font-bold text-white">Create Escrow-Backed Job</h2>
              <p className="text-xs text-gray-500">Define a job with escrow payment protection</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.04] text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Job Metadata */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="text-sm text-gray-400 mb-1.5 block">Job Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500/40"
              placeholder="e.g. NLP Translation Service"
            />
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-1.5 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500/40 resize-none"
              placeholder="Describe the job scope and deliverables..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400 mb-1.5 block">Service Type</label>
              <select
                value={serviceType}
                onChange={(e) => setServiceType(Number(e.target.value) as ServiceType)}
                className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-shadow-500/40"
              >
                {SERVICE_TYPES.map(st => (
                  <option key={st} value={st}>{getServiceTypeName(st)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1.5 block">Pricing (credits)</label>
              <input
                type="number"
                min="0.001"
                step="0.01"
                value={pricing}
                onChange={(e) => setPricing(e.target.value)}
                className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500/40"
                placeholder="5.00"
              />
            </div>
          </div>
        </div>

        {/* Escrow Config */}
        <div className="space-y-4 mb-6">
          <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <Lock className="w-4 h-4 text-blue-400" />
            Escrow Configuration
          </h3>

          <div>
            <label className="text-sm text-gray-400 mb-1.5 block">Client Address</label>
            <div className="relative">
              <input
                type="text"
                value={clientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
                className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500/40 font-mono"
                placeholder="aleo1..."
              />
              {clientAddress && isValidAddress(clientAddress) && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-400" />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400 mb-1.5 block">Escrow Amount (credits)</label>
              <input
                type="number"
                min="0.001"
                step="0.01"
                value={escrowAmount}
                onChange={(e) => setEscrowAmount(e.target.value)}
                className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500/40"
                placeholder="5.00"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1.5 block">Secret Hash</label>
              <input
                type="text"
                value={secretHash}
                onChange={(e) => setSecretHash(e.target.value)}
                className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500/40 font-mono"
                placeholder="hash..."
              />
            </div>
          </div>
        </div>

        {/* Multi-Sig Toggle */}
        <div className="mb-6">
          <label className="flex items-center gap-3 cursor-pointer group">
            <div
              className={`w-10 h-5 rounded-full transition-all relative ${
                multiSigEnabled ? 'bg-shadow-600' : 'bg-white/[0.08]'
              }`}
              onClick={() => setMultiSigEnabled(!multiSigEnabled)}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                  multiSigEnabled ? 'left-5' : 'left-0.5'
                }`}
              />
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
              <span className="text-sm text-gray-400 group-hover:text-white transition-colors">
                Enable Multi-Sig Escrow
              </span>
            </div>
          </label>

          {multiSigEnabled && (
            <div className="mt-4 space-y-3 pl-1">
              <label className="text-sm text-gray-400 mb-2 block">Co-Signers (3 addresses)</label>
              {signers.map((signer, index) => (
                <div key={index} className="relative">
                  <input
                    type="text"
                    value={signer}
                    onChange={(e) => handleSignerChange(index, e.target.value)}
                    placeholder={`Signer ${index + 1} Aleo address`}
                    className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-shadow-500/40 font-mono"
                  />
                  {signer && isValidAddress(signer) && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-400" />
                  )}
                </div>
              ))}

              <div>
                <label className="text-sm text-gray-400 mb-2 block">Required Approvals</label>
                <div className="flex gap-2">
                  {[1, 2, 3].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRequiredSigs(n)}
                      className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        requiredSigs === n
                          ? 'bg-shadow-600/20 text-shadow-300 border border-shadow-500/30'
                          : 'bg-white/[0.02] border border-white/[0.06] text-gray-400 hover:text-white hover:border-white/[0.1]'
                      }`}
                    >
                      {n}-of-3
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/5 border border-red-500/10 rounded-xl p-3 mb-6">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Info */}
        <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 mb-6">
          <div className="flex items-center gap-2 text-xs text-blue-400">
            <Lock className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              Creating this job will register an escrow-backed listing. The client funds the escrow to activate the job.
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-white/[0.08] text-gray-400 hover:text-white hover:bg-white/[0.04] transition-all text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !canSubmit}
            className="flex-1 px-4 py-2.5 rounded-xl bg-shadow-600 hover:bg-shadow-500 text-white transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Briefcase className="w-4 h-4" />
                Create Job
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
