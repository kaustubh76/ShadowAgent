import clsx from 'clsx';
import { Tier } from '../stores/agentStore';
import { Award, Star, Trophy, Gem } from 'lucide-react';

interface TierBadgeProps {
  tier: Tier;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const tierConfig = {
  [Tier.New]: {
    icon: Star,
    className: 'tier-new',
    label: 'New',
    effect: '',
  },
  [Tier.Bronze]: {
    icon: Award,
    className: 'tier-bronze',
    label: 'Bronze',
    effect: '',
  },
  [Tier.Silver]: {
    icon: Award,
    className: 'tier-silver',
    label: 'Silver',
    effect: '',
  },
  [Tier.Gold]: {
    icon: Trophy,
    className: 'tier-gold',
    label: 'Gold',
    effect: 'shadow-yellow-500/30 shadow-sm',
  },
  [Tier.Diamond]: {
    icon: Gem,
    className: 'tier-diamond',
    label: 'Diamond',
    effect: 'shadow-cyan-400/40 shadow-sm animate-glow-pulse',
  },
};

const sizeConfig = {
  sm: { badge: 'px-1.5 py-0.5 text-xs', icon: 'w-3 h-3' },
  md: { badge: 'px-2 py-1 text-sm', icon: 'w-4 h-4' },
  lg: { badge: 'px-3 py-1.5 text-base', icon: 'w-5 h-5' },
};

export default function TierBadge({ tier, size = 'md', showLabel = true }: TierBadgeProps) {
  const config = tierConfig[tier] || tierConfig[Tier.New];
  const sizes = sizeConfig[size];
  const Icon = config.icon;

  return (
    <span
      className={clsx(
        'tier-badge inline-flex items-center gap-1 rounded-full font-medium animate-scale-in transition-transform hover:scale-105',
        config.className,
        config.effect,
        sizes.badge
      )}
      role="status"
      aria-label={`Agent tier: ${config.label}`}
    >
      <Icon className={sizes.icon} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
