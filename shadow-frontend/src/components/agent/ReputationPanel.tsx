import { Shield, Award, DollarSign, BarChart3, TrendingDown } from 'lucide-react';
import { Tier, getTierName } from '../../stores/agentStore';
import { ANIMATION_DELAY_BASE } from '../../constants/ui';

interface AgentReputation {
  totalJobs: number;
  totalRatingPoints: number;
  totalRevenue: number;
  tier: Tier;
}

interface ReputationPanelProps {
  reputation: AgentReputation;
}

export default function ReputationPanel({ reputation }: ReputationPanelProps) {
  const avgRating =
    reputation.totalJobs > 0
      ? reputation.totalRatingPoints / reputation.totalJobs / 10
      : 0;

  const stats = [
    { icon: BarChart3, gradient: 'from-blue-500/15 to-blue-600/15', iconColor: 'text-blue-400', label: 'Total Jobs', value: String(reputation.totalJobs) },
    { icon: Award, gradient: 'from-yellow-500/15 to-amber-500/15', iconColor: 'text-yellow-400', label: 'Avg Rating', value: avgRating > 0 ? `${avgRating.toFixed(1)} ★` : 'N/A' },
    { icon: DollarSign, gradient: 'from-emerald-500/15 to-green-500/15', iconColor: 'text-emerald-400', label: 'Total Revenue', value: `$${(reputation.totalRevenue / 1_000_000).toFixed(2)}` },
    { icon: Shield, gradient: 'from-purple-500/15 to-shadow-500/15', iconColor: 'text-purple-400', label: 'Current Tier', value: getTierName(reputation.tier) },
  ];

  return (
    <>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="card card-shine group opacity-0 animate-fade-in-up"
              style={{ animationDelay: `${index * ANIMATION_DELAY_BASE}s`, animationFillMode: 'forwards' }}
            >
              <div className="flex items-center gap-4">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center group-hover:scale-110 transition-transform duration-500`}>
                  <Icon className={`w-5 h-5 ${stat.iconColor}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">{stat.label}</p>
                  <p className="text-xl font-bold text-white mt-0.5">{stat.value}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Decay Warning Banner */}
      {reputation.tier > Tier.New && (
        <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-4 flex items-start gap-3 animate-fade-in">
          <TrendingDown className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-300 font-medium">Reputation Decay Active</p>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              Inactive agents lose 5% of their effective rating every ~7 days. Complete jobs regularly to maintain your tier.
              Your nominal tier is <span className="text-white font-medium">{getTierName(reputation.tier)}</span> —
              use the companion program's decay-aware proof to verify your current effective rating on-chain.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
