import { describe, it, expect } from 'vitest';
import { render, screen } from '../test/utils';
import AgentCard from './AgentCard';
import { ServiceType, Tier } from '../stores/agentStore';

const makeAgent = (overrides = {}) => ({
  agent_id: 'aleo1abcdefghijklmnopqrstuvwxyz1234567890abcdef',
  service_type: ServiceType.NLP,
  endpoint_hash: 'hash123',
  tier: Tier.Gold,
  is_active: true,
  ...overrides,
});

describe('AgentCard', () => {
  it('renders service type name', () => {
    render(<AgentCard agent={makeAgent()} />);
    expect(screen.getByText('NLP Agent')).toBeInTheDocument();
  });

  it('renders truncated agent_id', () => {
    render(<AgentCard agent={makeAgent()} />);
    // agent_id.slice(0, 16) = 'aleo1abcdefghijk' + '...'
    expect(screen.getByText('aleo1abcdefghijk...')).toBeInTheDocument();
  });

  it('shows Active status for active agent', () => {
    render(<AgentCard agent={makeAgent({ is_active: true })} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows Inactive for inactive agent', () => {
    render(<AgentCard agent={makeAgent({ is_active: false })} />);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('shows Offline badge for inactive agent', () => {
    render(<AgentCard agent={makeAgent({ is_active: false })} />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('links to agent details page', () => {
    const agent = makeAgent();
    render(<AgentCard agent={agent} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', `/agents/${agent.agent_id}`);
  });

  it('has aria-label describing the agent', () => {
    render(<AgentCard agent={makeAgent()} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('aria-label', expect.stringContaining('NLP'));
  });

  it('renders correct service type for Vision', () => {
    render(<AgentCard agent={makeAgent({ service_type: ServiceType.Vision })} />);
    expect(screen.getByText('Vision Agent')).toBeInTheDocument();
  });

  it('renders correct service type for Code', () => {
    render(<AgentCard agent={makeAgent({ service_type: ServiceType.Code })} />);
    expect(screen.getByText('Code Agent')).toBeInTheDocument();
  });

  it('applies opacity class for inactive agent', () => {
    render(<AgentCard agent={makeAgent({ is_active: false })} />);
    const link = screen.getByRole('link');
    expect(link.className).toContain('opacity-50');
  });

  it('shows Details text', () => {
    render(<AgentCard agent={makeAgent()} />);
    expect(screen.getByText('Details')).toBeInTheDocument();
  });
});
