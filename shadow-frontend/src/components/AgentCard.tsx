import { memo } from 'react';
import { Link } from 'react-router-dom';
import { AgentListing, ServiceType, getServiceTypeName } from '../stores/agentStore';
import TierBadge from './TierBadge';
import { MessageSquare, Eye, Code, Database, Mic, Layers, Settings, ArrowRight } from 'lucide-react';
import clsx from 'clsx';

interface AgentCardProps {
  agent: AgentListing;
}

const serviceIcons = {
  [ServiceType.NLP]: MessageSquare,
  [ServiceType.Vision]: Eye,
  [ServiceType.Code]: Code,
  [ServiceType.Data]: Database,
  [ServiceType.Audio]: Mic,
  [ServiceType.Multi]: Layers,
  [ServiceType.Custom]: Settings,
};

const serviceColors = {
  [ServiceType.NLP]: 'service-nlp',
  [ServiceType.Vision]: 'service-vision',
  [ServiceType.Code]: 'service-code',
  [ServiceType.Data]: 'service-data',
  [ServiceType.Audio]: 'service-audio',
  [ServiceType.Multi]: 'service-multi',
  [ServiceType.Custom]: 'service-custom',
};

export default memo(function AgentCard({ agent }: AgentCardProps) {
  const Icon = serviceIcons[agent.service_type] || Settings;
  const colorClass = serviceColors[agent.service_type] || 'service-custom';

  return (
    <Link
      to={`/agents/${agent.agent_id}`}
      className={clsx(
        'card card-hover card-shine cursor-pointer group block relative',
        !agent.is_active && 'opacity-50 grayscale hover:grayscale-0 hover:opacity-75'
      )}
      aria-label={`View details for ${getServiceTypeName(agent.service_type)} agent ${agent.agent_id.slice(0, 16)}${!agent.is_active ? ' - Currently inactive' : ''}`}
    >
      {/* Hover glow effect */}
      <div className="absolute -inset-px rounded-xl bg-gradient-to-b from-shadow-500/0 to-shadow-500/0 group-hover:from-shadow-500/10 group-hover:to-transparent transition-all duration-500 pointer-events-none" />

      {!agent.is_active && (
        <div className="absolute top-3 left-3 px-2.5 py-1 text-xs font-semibold rounded-lg bg-surface-3 text-gray-400 border border-white/[0.06]">
          Offline
        </div>
      )}

      <div className="relative">
        <div className="flex items-start justify-between mb-5">
          <div className={clsx('service-icon group-hover:scale-110 transition-all duration-500', colorClass)}>
            <Icon className="w-5 h-5" />
          </div>
          <TierBadge tier={agent.tier} size="sm" />
        </div>

        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white mb-1.5 group-hover:text-shadow-200 transition-colors duration-300">
            {getServiceTypeName(agent.service_type)} Agent
          </h3>
          <p className="text-sm text-gray-500 font-mono truncate">
            {agent.agent_id.slice(0, 16)}...
          </p>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-white/[0.04]">
          <span
            className={clsx(
              'text-xs font-medium flex items-center gap-2',
              agent.is_active ? 'text-emerald-400' : 'text-gray-500'
            )}
          >
            {agent.is_active && (
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="animate-ping-slow absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            )}
            {agent.is_active ? 'Active' : 'Inactive'}
          </span>

          <span className="text-shadow-400 group-hover:text-shadow-300 text-sm flex items-center gap-1.5 transition-colors duration-300">
            Details
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform duration-300" />
          </span>
        </div>
      </div>
    </Link>
  );
});
