import { useState } from 'react';
import { X, Star } from 'lucide-react';

interface RatingFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (rating: number, jobHash: string) => void;
  agentAddress: string;
}

export default function RatingForm({
  isOpen,
  onClose,
  onSubmit,
  agentAddress,
}: RatingFormProps) {
  const [selectedRating, setSelectedRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [jobHash, setJobHash] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Convert 1-5 stars to 10-50 scaled rating for API
  const scaledRating = selectedRating * 10;

  const handleSubmit = async () => {
    if (!selectedRating || !jobHash.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(scaledRating, jobHash.trim());
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-1 rounded-2xl border border-white/[0.08] shadow-2xl max-w-md w-full p-6 animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-amber-500/20 border border-yellow-500/20 flex items-center justify-center">
              <Star className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Submit Rating</h2>
              <p className="text-xs text-gray-500">Rate this agent's service quality</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.04] text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Agent Info */}
        <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] p-4 mb-6">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Agent</span>
            <span className="text-gray-300 font-mono text-xs">{agentAddress.slice(0, 16)}...</span>
          </div>
        </div>

        {/* Star Rating */}
        <div className="mb-6">
          <label className="text-sm text-gray-400 mb-3 block">Rating</label>
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                onClick={() => setSelectedRating(star)}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                className="p-1 transition-transform hover:scale-110"
              >
                <Star
                  className={`w-8 h-8 transition-colors ${
                    star <= (hoveredRating || selectedRating)
                      ? 'text-yellow-400 fill-yellow-400'
                      : 'text-gray-600'
                  }`}
                />
              </button>
            ))}
          </div>
          {selectedRating > 0 && (
            <p className="text-center text-xs text-gray-500 mt-2">
              {selectedRating}/5 stars (scaled: {scaledRating}/50)
            </p>
          )}
        </div>

        {/* Job Hash */}
        <div className="mb-6">
          <label className="text-sm text-gray-400 mb-2 block">Job Hash</label>
          <input
            type="text"
            value={jobHash}
            onChange={(e) => setJobHash(e.target.value)}
            placeholder="Enter the job hash for this service"
            className="w-full bg-surface-2 border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/40 font-mono"
          />
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
            disabled={isSubmitting || !selectedRating || !jobHash.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-white transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              'Submitting...'
            ) : (
              <>
                <Star className="w-4 h-4" />
                Submit Rating
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
