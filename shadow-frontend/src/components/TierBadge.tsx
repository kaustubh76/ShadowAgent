import clsx from 'clsx';
import { Tier } from '../stores/agentStore';
import { Award, Star, Trophy, Gem, TrendingDown } from 'lucide-react';

interface TierBadgeProps {
  tier: Tier;
  effectiveTier?: Tier;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const tierConfig = {
  [Tier.New]: {
    icon: Star,
    className: 'tier-new',
    label: 'New',
    glowColor: '',
  },
  [Tier.Bronze]: {
    icon: Award,
    className: 'tier-bronze',
    label: 'Bronze',
    glowColor: '',
  },
  [Tier.Silver]: {
    icon: Award,
    className: 'tier-silver',
    label: 'Silver',
    glowColor: '',
  },
  [Tier.Gold]: {
    icon: Trophy,
    className: 'tier-gold',
    label: 'Gold',
    glowColor: 'shadow-[0_0_8px_rgba(255,215,0,0.15)]',
  },
  [Tier.Diamond]: {
    icon: Gem,
    className: 'tier-diamond',
    label: 'Diamond',
    glowColor: 'shadow-[0_0_12px_rgba(185,242,255,0.2)] animate-glow-pulse',
  },
};

const sizeConfig = {
  sm: { badge: 'px-2 py-0.5 text-[10px] gap-1', icon: 'w-3 h-3' },
  md: { badge: 'px-2.5 py-1 text-xs gap-1.5', icon: 'w-3.5 h-3.5' },
  lg: { badge: 'px-3 py-1.5 text-sm gap-1.5', icon: 'w-4 h-4' },
};

export default function TierBadge({ tier, effectiveTier, size = 'md', showLabel = true }: TierBadgeProps) {
  const config = tierConfig[tier] || tierConfig[Tier.New];
  const sizes = sizeConfig[size];
  const Icon = config.icon;
  const hasDecay = effectiveTier !== undefined && effectiveTier < tier;

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={clsx(
          'tier-badge inline-flex items-center rounded-full font-semibold transition-all duration-300 hover:scale-105',
          config.className,
          config.glowColor,
          sizes.badge
        )}
        role="status"
        aria-label={`Agent tier: ${config.label}${hasDecay ? ` (effective: ${tierConfig[effectiveTier]?.label || 'New'})` : ''}`}
      >
        <Icon className={sizes.icon} />
        {showLabel && <span>{config.label}</span>}
      </span>
      {hasDecay && (
        <span
          className="inline-flex items-center gap-0.5 text-[10px] text-amber-400"
          title={`Effective tier: ${tierConfig[effectiveTier]?.label || 'New'} (due to inactivity decay)`}
        >
          <TrendingDown className="w-3 h-3" />
        </span>
      )}
    </span>
  );
}
