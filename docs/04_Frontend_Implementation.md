# ShadowAgent Frontend Implementation Guide

## Overview

This guide covers building the demo UI for ShadowAgent using React and Tailwind CSS. The frontend provides two main views: Agent Dashboard and Client Discovery.

---

## 1. Project Setup

### 1.1 Create React App

```bash
# Using Vite (recommended)
npm create vite@latest shadow-agent-ui -- --template react-ts
cd shadow-agent-ui

# Install dependencies
npm install
npm install @aleohq/sdk axios zustand
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 1.2 Project Structure

```
shadow-agent-ui/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Layout.tsx
│   │   ├── agent/
│   │   │   ├── AgentDashboard.tsx
│   │   │   ├── ReputationCard.tsx
│   │   │   ├── ProofGenerator.tsx
│   │   │   └── EscrowManager.tsx
│   │   ├── client/
│   │   │   ├── ClientDashboard.tsx
│   │   │   ├── AgentSearch.tsx
│   │   │   ├── AgentCard.tsx
│   │   │   └── PaymentFlow.tsx
│   │   ├── common/
│   │   │   ├── TierBadge.tsx
│   │   │   ├── StarRating.tsx
│   │   │   ├── TransactionLog.tsx
│   │   │   └── ConnectWallet.tsx
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Card.tsx
│   │       ├── Input.tsx
│   │       └── Select.tsx
│   ├── hooks/
│   │   ├── useAleo.ts
│   │   ├── useAgent.ts
│   │   ├── useClient.ts
│   │   └── useTransactions.ts
│   ├── store/
│   │   ├── walletStore.ts
│   │   ├── agentStore.ts
│   │   └── clientStore.ts
│   ├── services/
│   │   ├── api.ts
│   │   └── aleo.ts
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   └── format.ts
│   └── styles/
│       └── globals.css
├── public/
├── index.html
├── tailwind.config.js
├── vite.config.ts
└── package.json
```

### 1.3 Tailwind Configuration

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ShadowAgent brand colors
        shadow: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
      },
    },
  },
  plugins: [],
}
```

### 1.4 Global Styles

```css
/* src/styles/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-gray-900 text-white;
  }
}

@layer components {
  .card {
    @apply bg-gray-800 rounded-lg border border-gray-700 p-6;
  }

  .btn-primary {
    @apply bg-shadow-600 hover:bg-shadow-700 text-white font-medium py-2 px-4 rounded-lg transition-colors;
  }

  .btn-secondary {
    @apply bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors;
  }

  .input {
    @apply bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-shadow-500;
  }
}
```

---

## 2. Types

```typescript
// src/types/index.ts

export enum Tier {
  New = 0,
  Bronze = 1,
  Silver = 2,
  Gold = 3,
  Diamond = 4,
}

export enum ServiceType {
  NLP = 1,
  Vision = 2,
  Code = 3,
  Data = 4,
  Audio = 5,
  Multi = 6,
  Custom = 7,
}

export interface AgentReputation {
  owner: string;
  agentId: string;
  totalJobs: number;
  totalRatingPoints: number;
  totalRevenue: number;
  tier: Tier;
  createdAt: number;
  lastUpdated: number;
}

export interface AgentListing {
  agentId: string;
  serviceType: ServiceType;
  tier: Tier;
  endpoint?: string;
  isActive: boolean;
}

export interface Transaction {
  id: string;
  type: 'escrow_created' | 'escrow_claimed' | 'rating_submitted' | 'reputation_updated';
  timestamp: number;
  details: string;
  isPrivate: boolean;
}

export interface WalletState {
  connected: boolean;
  address: string | null;
  balance: number;
}
```

---

## 3. State Management (Zustand)

### 3.1 Wallet Store

```typescript
// src/store/walletStore.ts
import { create } from 'zustand';
import { WalletState } from '../types';

interface WalletStore extends WalletState {
  connect: (address: string) => void;
  disconnect: () => void;
  setBalance: (balance: number) => void;
}

export const useWalletStore = create<WalletStore>((set) => ({
  connected: false,
  address: null,
  balance: 0,

  connect: (address) => set({
    connected: true,
    address,
  }),

  disconnect: () => set({
    connected: false,
    address: null,
    balance: 0,
  }),

  setBalance: (balance) => set({ balance }),
}));
```

### 3.2 Agent Store

```typescript
// src/store/agentStore.ts
import { create } from 'zustand';
import { AgentReputation, Transaction, Tier } from '../types';

interface AgentStore {
  reputation: AgentReputation | null;
  transactions: Transaction[];
  isRegistered: boolean;

  setReputation: (rep: AgentReputation) => void;
  addTransaction: (tx: Transaction) => void;
  updateReputation: (jobRating: number, payment: number) => void;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  reputation: null,
  transactions: [],
  isRegistered: false,

  setReputation: (reputation) => set({
    reputation,
    isRegistered: true,
  }),

  addTransaction: (tx) => set((state) => ({
    transactions: [tx, ...state.transactions].slice(0, 50),
  })),

  updateReputation: (jobRating, payment) => set((state) => {
    if (!state.reputation) return state;

    const newJobs = state.reputation.totalJobs + 1;
    const newPoints = state.reputation.totalRatingPoints + jobRating;
    const newRevenue = state.reputation.totalRevenue + payment;

    // Calculate tier
    let tier = Tier.New;
    if (newJobs >= 1000 && newRevenue >= 100000) tier = Tier.Diamond;
    else if (newJobs >= 200 && newRevenue >= 10000) tier = Tier.Gold;
    else if (newJobs >= 50 && newRevenue >= 1000) tier = Tier.Silver;
    else if (newJobs >= 10 && newRevenue >= 100) tier = Tier.Bronze;

    return {
      reputation: {
        ...state.reputation,
        totalJobs: newJobs,
        totalRatingPoints: newPoints,
        totalRevenue: newRevenue,
        tier,
        lastUpdated: Date.now(),
      },
    };
  }),
}));
```

### 3.3 Client Store

```typescript
// src/store/clientStore.ts
import { create } from 'zustand';
import { AgentListing, Transaction, ServiceType, Tier } from '../types';

interface ClientStore {
  searchResults: AgentListing[];
  selectedAgent: AgentListing | null;
  transactions: Transaction[];
  filters: {
    serviceType: ServiceType | null;
    minTier: Tier;
  };

  setSearchResults: (results: AgentListing[]) => void;
  selectAgent: (agent: AgentListing | null) => void;
  setFilters: (filters: Partial<ClientStore['filters']>) => void;
  addTransaction: (tx: Transaction) => void;
}

export const useClientStore = create<ClientStore>((set) => ({
  searchResults: [],
  selectedAgent: null,
  transactions: [],
  filters: {
    serviceType: null,
    minTier: Tier.New,
  },

  setSearchResults: (results) => set({ searchResults: results }),

  selectAgent: (agent) => set({ selectedAgent: agent }),

  setFilters: (filters) => set((state) => ({
    filters: { ...state.filters, ...filters },
  })),

  addTransaction: (tx) => set((state) => ({
    transactions: [tx, ...state.transactions].slice(0, 50),
  })),
}));
```

---

## 4. Common Components

### 4.1 Tier Badge

```tsx
// src/components/common/TierBadge.tsx
import { Tier } from '../../types';

interface TierBadgeProps {
  tier: Tier;
  size?: 'sm' | 'md' | 'lg';
}

const tierConfig = {
  [Tier.New]: { label: 'New', color: 'bg-gray-500', icon: '○' },
  [Tier.Bronze]: { label: 'Bronze', color: 'bg-amber-700', icon: '●' },
  [Tier.Silver]: { label: 'Silver', color: 'bg-gray-300', icon: '●●' },
  [Tier.Gold]: { label: 'Gold', color: 'bg-yellow-500', icon: '●●●' },
  [Tier.Diamond]: { label: 'Diamond', color: 'bg-blue-400', icon: '◆' },
};

export function TierBadge({ tier, size = 'md' }: TierBadgeProps) {
  const config = tierConfig[tier];

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-2',
  };

  return (
    <span className={`
      inline-flex items-center gap-1 rounded-full font-medium
      ${config.color} text-white ${sizeClasses[size]}
    `}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}
```

### 4.2 Star Rating

```tsx
// src/components/common/StarRating.tsx
import { useState } from 'react';

interface StarRatingProps {
  rating?: number;
  onRate?: (rating: number) => void;
  readonly?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function StarRating({
  rating = 0,
  onRate,
  readonly = false,
  size = 'md',
}: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
  };

  const displayRating = hovered ?? rating;

  return (
    <div className={`flex gap-1 ${sizeClasses[size]}`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          className={`
            transition-colors
            ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}
            ${star <= displayRating ? 'text-yellow-400' : 'text-gray-600'}
          `}
          onClick={() => !readonly && onRate?.(star)}
          onMouseEnter={() => !readonly && setHovered(star)}
          onMouseLeave={() => !readonly && setHovered(null)}
        >
          ★
        </button>
      ))}
    </div>
  );
}
```

### 4.3 Transaction Log

```tsx
// src/components/common/TransactionLog.tsx
import { Transaction } from '../../types';

interface TransactionLogProps {
  transactions: Transaction[];
}

const typeLabels = {
  escrow_created: 'Escrow Created',
  escrow_claimed: 'Escrow Claimed',
  rating_submitted: 'Rating Submitted',
  reputation_updated: 'Reputation Updated',
};

export function TransactionLog({ transactions }: TransactionLogProps) {
  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Transaction Log</h3>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {transactions.length === 0 ? (
          <p className="text-gray-400 text-center py-4">No transactions yet</p>
        ) : (
          transactions.map((tx) => (
            <div
              key={tx.id}
              className="flex items-start gap-3 p-3 bg-gray-900 rounded-lg"
            >
              <div className="flex-shrink-0">
                {tx.isPrivate ? (
                  <span className="text-shadow-400">🔒</span>
                ) : (
                  <span className="text-green-400">📝</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {typeLabels[tx.type]}
                  </span>
                  {tx.isPrivate && (
                    <span className="text-xs bg-shadow-600 px-2 py-0.5 rounded">
                      PRIVATE
                    </span>
                  )}
                </div>
                <p className="text-gray-400 text-sm truncate">
                  {tx.details}
                </p>
                <p className="text-gray-500 text-xs">
                  {new Date(tx.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

### 4.4 Connect Wallet Button

```tsx
// src/components/common/ConnectWallet.tsx
import { useState } from 'react';
import { useWalletStore } from '../../store/walletStore';

export function ConnectWallet() {
  const { connected, address, connect, disconnect } = useWalletStore();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);

    try {
      // In production, use Leo Wallet adapter
      // For demo, generate mock address
      const mockAddress = `aleo1${Math.random().toString(36).slice(2, 12)}...`;
      connect(mockAddress);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  if (connected) {
    return (
      <div className="flex items-center gap-3">
        <div className="text-sm">
          <p className="text-gray-400">Connected</p>
          <p className="font-mono text-shadow-400">{address}</p>
        </div>
        <button
          onClick={disconnect}
          className="btn-secondary text-sm"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={isConnecting}
      className="btn-primary"
    >
      {isConnecting ? 'Connecting...' : 'Connect Wallet'}
    </button>
  );
}
```

---

## 5. Agent Dashboard Components

### 5.1 Reputation Card

```tsx
// src/components/agent/ReputationCard.tsx
import { useAgentStore } from '../../store/agentStore';
import { TierBadge } from '../common/TierBadge';
import { StarRating } from '../common/StarRating';

export function ReputationCard() {
  const { reputation, isRegistered } = useAgentStore();

  if (!isRegistered || !reputation) {
    return (
      <div className="card text-center py-8">
        <p className="text-gray-400 mb-4">Not registered as an agent yet</p>
        <button className="btn-primary">Register Agent</button>
      </div>
    );
  }

  const avgRating = reputation.totalJobs > 0
    ? (reputation.totalRatingPoints / reputation.totalJobs / 10).toFixed(1)
    : '0.0';

  const formatRevenue = (cents: number) => {
    return `$${(cents / 100).toLocaleString()}`;
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">My Reputation</h3>
        <TierBadge tier={reputation.tier} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 rounded-lg p-4">
          <p className="text-gray-400 text-sm mb-1">Total Jobs</p>
          <p className="text-2xl font-bold">{reputation.totalJobs}</p>
        </div>

        <div className="bg-gray-900 rounded-lg p-4">
          <p className="text-gray-400 text-sm mb-1">Revenue</p>
          <p className="text-2xl font-bold">{formatRevenue(reputation.totalRevenue)}</p>
        </div>

        <div className="bg-gray-900 rounded-lg p-4 col-span-2">
          <p className="text-gray-400 text-sm mb-2">Average Rating</p>
          <div className="flex items-center gap-3">
            <StarRating rating={parseFloat(avgRating)} readonly />
            <span className="text-xl font-bold">{avgRating}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-700">
        <p className="text-xs text-gray-500">
          Last updated: {new Date(reputation.lastUpdated).toLocaleString()}
        </p>
        <p className="text-xs text-shadow-400 mt-1">
          This data is PRIVATE - only you can see these details
        </p>
      </div>
    </div>
  );
}
```

### 5.2 Proof Generator

```tsx
// src/components/agent/ProofGenerator.tsx
import { useState } from 'react';
import { useAgentStore } from '../../store/agentStore';
import { Tier } from '../../types';

type ProofType = 'tier' | 'rating' | 'jobs' | 'revenue';

export function ProofGenerator() {
  const { reputation } = useAgentStore();
  const [proofType, setProofType] = useState<ProofType>('tier');
  const [threshold, setThreshold] = useState('');
  const [generatedProof, setGeneratedProof] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!reputation) return;

    setIsGenerating(true);

    try {
      // Simulate proof generation
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Generate mock proof result
      const proofLabels = {
        tier: `Tier ≥ ${['New', 'Bronze', 'Silver', 'Gold', 'Diamond'][parseInt(threshold) || 0]}`,
        rating: `Average rating ≥ ${threshold || '4.0'} stars`,
        jobs: `Completed ≥ ${threshold || '10'} jobs`,
        revenue: `Revenue in range specified`,
      };

      setGeneratedProof(`✓ Verified: ${proofLabels[proofType]}`);
    } catch (error) {
      console.error('Proof generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Generate Proof</h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-2">
            Proof Type
          </label>
          <select
            value={proofType}
            onChange={(e) => setProofType(e.target.value as ProofType)}
            className="input w-full"
          >
            <option value="tier">Tier Proof</option>
            <option value="rating">Rating Proof</option>
            <option value="jobs">Jobs Count Proof</option>
            <option value="revenue">Revenue Range Proof</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">
            {proofType === 'tier' ? 'Minimum Tier' :
             proofType === 'rating' ? 'Minimum Rating' :
             proofType === 'jobs' ? 'Minimum Jobs' :
             'Revenue Range'}
          </label>

          {proofType === 'tier' ? (
            <select
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="input w-full"
            >
              <option value="0">New (0)</option>
              <option value="1">Bronze (1)</option>
              <option value="2">Silver (2)</option>
              <option value="3">Gold (3)</option>
              <option value="4">Diamond (4)</option>
            </select>
          ) : (
            <input
              type="text"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder={
                proofType === 'rating' ? '4.0' :
                proofType === 'jobs' ? '10' :
                '$1,000 - $10,000'
              }
              className="input w-full"
            />
          )}
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating || !reputation}
          className="btn-primary w-full"
        >
          {isGenerating ? 'Generating...' : 'Generate Proof'}
        </button>

        {generatedProof && (
          <div className="bg-green-900/20 border border-green-500 rounded-lg p-4">
            <p className="text-green-400 font-medium">{generatedProof}</p>
            <button className="text-sm text-green-300 hover:text-green-200 mt-2">
              Copy Proof
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500 mt-4">
        Proofs are ZK attestations - they verify thresholds without revealing
        your actual data.
      </p>
    </div>
  );
}
```

### 5.3 Agent Dashboard

```tsx
// src/components/agent/AgentDashboard.tsx
import { ReputationCard } from './ReputationCard';
import { ProofGenerator } from './ProofGenerator';
import { TransactionLog } from '../common/TransactionLog';
import { useAgentStore } from '../../store/agentStore';

export function AgentDashboard() {
  const { transactions } = useAgentStore();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Agent Dashboard</h2>

      <div className="grid lg:grid-cols-2 gap-6">
        <ReputationCard />
        <ProofGenerator />
      </div>

      <TransactionLog transactions={transactions} />
    </div>
  );
}
```

---

## 6. Client Dashboard Components

### 6.1 Agent Card

```tsx
// src/components/client/AgentCard.tsx
import { AgentListing, ServiceType } from '../../types';
import { TierBadge } from '../common/TierBadge';

interface AgentCardProps {
  agent: AgentListing;
  onSelect: () => void;
}

const serviceTypeLabels = {
  [ServiceType.NLP]: 'NLP',
  [ServiceType.Vision]: 'Vision',
  [ServiceType.Code]: 'Code',
  [ServiceType.Data]: 'Data',
  [ServiceType.Audio]: 'Audio',
  [ServiceType.Multi]: 'Multi-modal',
  [ServiceType.Custom]: 'Custom',
};

export function AgentCard({ agent, onSelect }: AgentCardProps) {
  return (
    <div className="card hover:border-shadow-500 transition-colors cursor-pointer"
         onClick={onSelect}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="font-mono text-sm text-gray-400">
            {agent.agentId.slice(0, 8)}...{agent.agentId.slice(-8)}
          </p>
          <span className="inline-block mt-1 text-xs bg-gray-700 px-2 py-0.5 rounded">
            {serviceTypeLabels[agent.serviceType]}
          </span>
        </div>
        <TierBadge tier={agent.tier} size="sm" />
      </div>

      <div className="flex items-center justify-between">
        <span className={`text-sm ${agent.isActive ? 'text-green-400' : 'text-gray-400'}`}>
          {agent.isActive ? '● Active' : '○ Inactive'}
        </span>
        <button className="btn-primary text-sm">
          Hire Agent
        </button>
      </div>

      <p className="text-xs text-shadow-400 mt-3">
        Tier verified via ZK proof - details private
      </p>
    </div>
  );
}
```

### 6.2 Agent Search

```tsx
// src/components/client/AgentSearch.tsx
import { useState } from 'react';
import { useClientStore } from '../../store/clientStore';
import { ServiceType, Tier } from '../../types';

export function AgentSearch() {
  const { filters, setFilters, setSearchResults } = useClientStore();
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    setIsSearching(true);

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Mock results
      const mockResults = [
        {
          agentId: 'aleo1abc123def456...',
          serviceType: filters.serviceType || ServiceType.NLP,
          tier: Tier.Silver,
          isActive: true,
        },
        {
          agentId: 'aleo1xyz789uvw012...',
          serviceType: filters.serviceType || ServiceType.NLP,
          tier: Tier.Gold,
          isActive: true,
        },
        {
          agentId: 'aleo1qrs456tuv789...',
          serviceType: filters.serviceType || ServiceType.Code,
          tier: Tier.Bronze,
          isActive: false,
        },
      ].filter(a => a.tier >= filters.minTier);

      setSearchResults(mockResults);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Search Agents</h3>

      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-2">
            Service Type
          </label>
          <select
            value={filters.serviceType || ''}
            onChange={(e) => setFilters({
              serviceType: e.target.value ? parseInt(e.target.value) : null,
            })}
            className="input w-full"
          >
            <option value="">All Types</option>
            <option value="1">NLP</option>
            <option value="2">Vision</option>
            <option value="3">Code</option>
            <option value="4">Data</option>
            <option value="5">Audio</option>
            <option value="6">Multi-modal</option>
            <option value="7">Custom</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">
            Minimum Tier
          </label>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map((tier) => (
              <button
                key={tier}
                onClick={() => setFilters({ minTier: tier })}
                className={`
                  flex-1 py-2 rounded text-sm font-medium transition-colors
                  ${filters.minTier === tier
                    ? 'bg-shadow-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}
                `}
              >
                {['○', '●', '●●', '●●●', '◆'][tier]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-end">
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="btn-primary w-full"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 6.3 Client Dashboard

```tsx
// src/components/client/ClientDashboard.tsx
import { AgentSearch } from './AgentSearch';
import { AgentCard } from './AgentCard';
import { TransactionLog } from '../common/TransactionLog';
import { useClientStore } from '../../store/clientStore';

export function ClientDashboard() {
  const { searchResults, transactions, selectAgent } = useClientStore();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Find Agents</h2>

      <AgentSearch />

      {searchResults.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">
            Results ({searchResults.length})
          </h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {searchResults.map((agent) => (
              <AgentCard
                key={agent.agentId}
                agent={agent}
                onSelect={() => selectAgent(agent)}
              />
            ))}
          </div>
        </div>
      )}

      <TransactionLog transactions={transactions} />
    </div>
  );
}
```

---

## 7. Layout Components

### 7.1 Header

```tsx
// src/components/layout/Header.tsx
import { ConnectWallet } from '../common/ConnectWallet';

export function Header() {
  return (
    <header className="bg-gray-800 border-b border-gray-700">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔐</span>
          <h1 className="text-xl font-bold">
            Shadow<span className="text-shadow-400">Agent</span>
          </h1>
        </div>

        <ConnectWallet />
      </div>
    </header>
  );
}
```

### 7.2 Sidebar

```tsx
// src/components/layout/Sidebar.tsx
interface SidebarProps {
  activeView: 'agent' | 'client';
  onViewChange: (view: 'agent' | 'client') => void;
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  return (
    <aside className="w-64 bg-gray-800 border-r border-gray-700 min-h-screen p-4">
      <nav className="space-y-2">
        <button
          onClick={() => onViewChange('agent')}
          className={`
            w-full text-left px-4 py-3 rounded-lg transition-colors
            ${activeView === 'agent'
              ? 'bg-shadow-600 text-white'
              : 'text-gray-400 hover:bg-gray-700'}
          `}
        >
          <span className="mr-3">🤖</span>
          Agent View
        </button>

        <button
          onClick={() => onViewChange('client')}
          className={`
            w-full text-left px-4 py-3 rounded-lg transition-colors
            ${activeView === 'client'
              ? 'bg-shadow-600 text-white'
              : 'text-gray-400 hover:bg-gray-700'}
          `}
        >
          <span className="mr-3">👤</span>
          Client View
        </button>
      </nav>

      <div className="mt-8 p-4 bg-gray-900 rounded-lg">
        <h4 className="font-medium mb-2">Privacy Mode</h4>
        <p className="text-xs text-gray-400">
          All transaction details are private.
          Only verified tier badges are public.
        </p>
      </div>
    </aside>
  );
}
```

### 7.3 Layout

```tsx
// src/components/layout/Layout.tsx
import { ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: ReactNode;
  activeView: 'agent' | 'client';
  onViewChange: (view: 'agent' | 'client') => void;
}

export function Layout({ children, activeView, onViewChange }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-900">
      <Header />

      <div className="flex">
        <Sidebar activeView={activeView} onViewChange={onViewChange} />

        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

---

## 8. Main App

```tsx
// src/App.tsx
import { useState } from 'react';
import { Layout } from './components/layout/Layout';
import { AgentDashboard } from './components/agent/AgentDashboard';
import { ClientDashboard } from './components/client/ClientDashboard';
import './styles/globals.css';

function App() {
  const [activeView, setActiveView] = useState<'agent' | 'client'>('agent');

  return (
    <Layout activeView={activeView} onViewChange={setActiveView}>
      {activeView === 'agent' ? (
        <AgentDashboard />
      ) : (
        <ClientDashboard />
      )}
    </Layout>
  );
}

export default App;
```

---

## 9. Entry Point

```tsx
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

---

## 10. Build and Run

```bash
# Development
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## 11. Demo Data Setup

For the hackathon demo, add this to initialize mock data:

```typescript
// src/utils/mockData.ts
import { useAgentStore } from '../store/agentStore';
import { Tier, Transaction } from '../types';

export function initializeMockData() {
  const agentStore = useAgentStore.getState();

  // Set mock reputation
  agentStore.setReputation({
    owner: 'aleo1shadow...demo',
    agentId: '123456789',
    totalJobs: 47,
    totalRatingPoints: 2162, // ~4.6 avg
    totalRevenue: 4700, // $47.00
    tier: Tier.Silver,
    createdAt: Date.now() - 86400000 * 30, // 30 days ago
    lastUpdated: Date.now(),
  });

  // Add mock transactions
  const mockTransactions: Transaction[] = [
    {
      id: '1',
      type: 'reputation_updated',
      timestamp: Date.now() - 300000,
      details: '47→48 jobs, tier unchanged',
      isPrivate: true,
    },
    {
      id: '2',
      type: 'rating_submitted',
      timestamp: Date.now() - 600000,
      details: 'Burned 0.5 credits',
      isPrivate: true,
    },
    {
      id: '3',
      type: 'escrow_claimed',
      timestamp: Date.now() - 900000,
      details: 'Amount hidden',
      isPrivate: true,
    },
  ];

  mockTransactions.forEach(tx => agentStore.addTransaction(tx));
}
```

---

*End of Frontend Implementation Guide*
