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

export default function AgentCard({ agent }: AgentCardProps) {
  const Icon = serviceIcons[agent.service_type] || Settings;
  const colorClass = serviceColors[agent.service_type] || 'service-custom';

  return (
    <Link
      to={`/agents/${agent.agent_id}`}
      className={clsx(
        'card card-hover cursor-pointer group block relative',
        !agent.is_active && 'opacity-60 grayscale hover:grayscale-0 hover:opacity-80'
      )}
      aria-label={`View details for ${getServiceTypeName(agent.service_type)} agent ${agent.agent_id.slice(0, 16)}${!agent.is_active ? ' - Currently inactive' : ''}`}
    >
      {!agent.is_active && (
        <div className="absolute top-2 left-2 px-2 py-1 text-xs font-semibold rounded-full bg-gray-700/80 text-gray-400 backdrop-blur-sm">
          Offline
        </div>
      )}
      <div className="flex items-start justify-between mb-4">
        <div className={clsx('service-icon group-hover:scale-110 transition-transform duration-200', colorClass)}>
          <Icon className="w-5 h-5" />
        </div>
        <TierBadge tier={agent.tier} size="sm" />
      </div>

      <div className="mb-3">
        <h3 className="text-lg font-semibold text-white mb-1">
          {getServiceTypeName(agent.service_type)} Agent
        </h3>
        <p className="text-sm text-gray-400 font-mono truncate">
          {agent.agent_id.slice(0, 16)}...
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span
          className={clsx(
            'text-xs font-medium flex items-center gap-1.5',
            agent.is_active ? 'text-green-400' : 'text-gray-500'
          )}
        >
          {agent.is_active && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
          )}
          {agent.is_active ? 'Active' : 'Inactive'}
        </span>

        <span className="text-shadow-400 group-hover:text-shadow-300 text-sm flex items-center gap-1 transition-colors">
          View Details
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
        </span>
      </div>
    </Link>
  );
}
