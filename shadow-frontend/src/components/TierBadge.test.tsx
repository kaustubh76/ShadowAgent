import { describe, it, expect } from 'vitest';
import { render, screen } from '../test/utils';
import TierBadge from './TierBadge';
import { Tier } from '../stores/agentStore';

describe('TierBadge', () => {
  it('renders correct label for each tier', () => {
    const tiers: [Tier, string][] = [
      [Tier.New, 'New'],
      [Tier.Bronze, 'Bronze'],
      [Tier.Silver, 'Silver'],
      [Tier.Gold, 'Gold'],
      [Tier.Diamond, 'Diamond'],
    ];

    for (const [tier, label] of tiers) {
      const { unmount } = render(<TierBadge tier={tier} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it('hides label when showLabel is false', () => {
    render(<TierBadge tier={Tier.Gold} showLabel={false} />);
    expect(screen.queryByText('Gold')).not.toBeInTheDocument();
  });

  it('has role status', () => {
    render(<TierBadge tier={Tier.Silver} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has correct aria-label', () => {
    render(<TierBadge tier={Tier.Gold} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Agent tier: Gold');
  });

  it('shows decay indicator when effectiveTier < tier', () => {
    render(<TierBadge tier={Tier.Gold} effectiveTier={Tier.Silver} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', expect.stringContaining('effective: Silver'));
  });

  it('does not show decay when effectiveTier equals tier', () => {
    render(<TierBadge tier={Tier.Gold} effectiveTier={Tier.Gold} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Agent tier: Gold');
  });

  it('renders fallback for unknown tier', () => {
    render(<TierBadge tier={99 as Tier} />);
    // Falls back to New config
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
