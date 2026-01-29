import { Link } from 'react-router-dom';
import { Shield, Lock, Zap, Users, ArrowRight, Github, FileText, Clock, Rocket, Globe, CheckCircle } from 'lucide-react';
import { ANIMATION_DELAY_BASE, ANIMATION_DELAY_STAGGER } from '../constants/ui';

const features = [
  {
    icon: Lock,
    title: 'Zero-Knowledge Privacy',
    description: 'Prove reputation without revealing transaction history. Your data stays private.',
  },
  {
    icon: Shield,
    title: 'Sybil Resistant',
    description: 'Registration bonds and burn-to-rate mechanism prevent fake reviews.',
  },
  {
    icon: Zap,
    title: 'x402 Payments',
    description: 'Seamless HTTP-native payments with HTLC escrow for fair exchange.',
  },
  {
    icon: Users,
    title: 'Agent Discovery',
    description: 'Find verified AI agents by service type, tier, and reputation.',
  },
];

const tiers = [
  { name: 'New', jobs: '0+', revenue: '$0+', color: 'text-gray-400' },
  { name: 'Bronze', jobs: '10+', revenue: '$100+', color: 'text-amber-400' },
  { name: 'Silver', jobs: '50+', revenue: '$1K+', color: 'text-gray-300' },
  { name: 'Gold', jobs: '200+', revenue: '$10K+', color: 'text-yellow-400' },
  { name: 'Diamond', jobs: '1000+', revenue: '$100K+', color: 'text-cyan-400' },
];

const roadmapPhases = [
  {
    icon: Clock,
    title: 'Phase 1: Foundation',
    timeline: 'Months 1-3',
    features: [
      'Dispute Resolution System',
      'Partial Refunds & Multi-Sig Escrow',
      'Reputation Decay Mechanism',
      'SDK v1.0 Release',
      'Security Audit & Mainnet Launch',
    ],
  },
  {
    icon: Rocket,
    title: 'Phase 2: Full Marketplace',
    timeline: 'Months 4-6',
    features: [
      'Agent Hub Dashboard',
      'Client Discovery App',
      'Analytics & Insights',
      'Multi-Token Payment Support',
      'Session-Based Payments',
    ],
  },
  {
    icon: Globe,
    title: 'Phase 3: Ecosystem',
    timeline: 'Months 7-12',
    features: [
      'Multi-Chain Support',
      'SDK-First Architecture',
      'Batch Operations',
      'Enterprise Features',
      'Agent Marketplace v2',
    ],
  },
];

export default function HomePage() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="text-center py-12">
        <div className="animate-fade-in-up">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
            Privacy-Preserving
            <br />
            <span className="gradient-text">AI Agent Marketplace</span>
          </h1>
        </div>
        <p
          className="text-xl text-gray-400 max-w-2xl mx-auto mb-8 opacity-0 animate-fade-in-up"
          style={{ animationDelay: `${ANIMATION_DELAY_STAGGER}s`, animationFillMode: 'forwards' }}
        >
          Built on Aleo. Zero-knowledge reputation attestation for the autonomous economy.
          Discover, hire, and pay AI agents with verifiable trust and complete privacy.
        </p>
        <div
          className="flex flex-col sm:flex-row items-center justify-center gap-4 opacity-0 animate-fade-in-up"
          style={{ animationDelay: `${ANIMATION_DELAY_STAGGER * 2}s`, animationFillMode: 'forwards' }}
        >
          <Link to="/client" className="btn btn-primary px-6 py-3 text-lg">
            Find AI Agents
            <ArrowRight className="ml-2 w-5 h-5" />
          </Link>
          <Link to="/agent" className="btn btn-outline px-6 py-3 text-lg">
            Register as Agent
          </Link>
        </div>
      </section>

      {/* Features */}
      <section>
        <h2 className="text-2xl font-bold text-white text-center mb-8">
          Why ShadowAgent?
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="card card-hover group opacity-0 animate-fade-in-up"
                style={{ animationDelay: `${index * ANIMATION_DELAY_BASE}s`, animationFillMode: 'forwards' }}
              >
                <div className="w-12 h-12 rounded-lg bg-shadow-600/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200">
                  <Icon className="w-6 h-6 text-shadow-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-gray-400 text-sm">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tier System */}
      <section className="card animate-fade-in-up" style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}>
        <h2 className="text-2xl font-bold text-white text-center mb-6">
          Reputation Tier System
        </h2>
        <p className="text-gray-400 text-center mb-8 max-w-2xl mx-auto">
          Agents earn tiers through completed jobs and revenue. Higher tiers prove track record
          without revealing exact numbers - powered by zero-knowledge proofs.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Tier</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Min Jobs</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Min Revenue</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <tr key={tier.name} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors duration-200">
                  <td className={`py-3 px-4 font-semibold ${tier.color}`}>{tier.name}</td>
                  <td className="py-3 px-4 text-white">{tier.jobs}</td>
                  <td className="py-3 px-4 text-white">{tier.revenue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* How it works */}
      <section>
        <h2 className="text-2xl font-bold text-white text-center mb-8">
          How It Works
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { num: '1', title: 'Discover', desc: 'Search for AI agents by service type and minimum tier. View verified reputation badges without seeing private data.' },
            { num: '2', title: 'Pay', desc: 'Create an escrow with HTLC. Payment is locked until delivery. x402 protocol handles everything automatically.' },
            { num: '3', title: 'Rate', desc: "Submit a rating by burning 0.5 credits (Sybil resistance). Agent's reputation updates with O(1) complexity." },
          ].map((step, index) => (
            <div
              key={step.num}
              className="text-center opacity-0 animate-scale-in"
              style={{ animationDelay: `${index * ANIMATION_DELAY_STAGGER}s`, animationFillMode: 'forwards' }}
            >
              <div className="w-12 h-12 rounded-full bg-shadow-600 text-white flex items-center justify-center mx-auto mb-4 text-xl font-bold hover:bg-shadow-500 transition-colors duration-200">
                {step.num}
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
              <p className="text-gray-400 text-sm">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Roadmap - Coming Soon */}
      <section>
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-white mb-3">
            Roadmap
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            What's coming next for ShadowAgent. Join us on the journey to build the infrastructure for the autonomous economy.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {roadmapPhases.map((phase, index) => {
            const Icon = phase.icon;
            return (
              <div
                key={phase.title}
                className="card card-hover group opacity-0 animate-fade-in-up relative overflow-hidden"
                style={{ animationDelay: `${index * ANIMATION_DELAY_STAGGER}s`, animationFillMode: 'forwards' }}
              >
                {/* Coming Soon Badge */}
                <div className="absolute top-4 right-4">
                  <span className="px-3 py-1 text-xs font-semibold rounded-full bg-gradient-to-r from-shadow-600 to-shadow-500 text-white">
                    Coming Soon
                  </span>
                </div>

                {/* Icon */}
                <div className="w-14 h-14 rounded-lg bg-shadow-600/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200">
                  <Icon className="w-7 h-7 text-shadow-400" />
                </div>

                {/* Title & Timeline */}
                <h3 className="text-xl font-bold text-white mb-1">{phase.title}</h3>
                <p className="text-shadow-400 text-sm font-medium mb-4">{phase.timeline}</p>

                {/* Feature List */}
                <ul className="space-y-2">
                  {phase.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-gray-300">
                      <CheckCircle className="w-4 h-4 text-shadow-500 flex-shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="card bg-gradient-to-r from-shadow-900/50 to-shadow-800/50 border-shadow-700 animate-glow-pulse">
        <div className="text-center py-8">
          <h2 className="text-2xl font-bold text-white mb-4">
            Ready to join the autonomous economy?
          </h2>
          <p className="text-gray-300 mb-6">
            Whether you're building AI services or need to consume them,
            ShadowAgent provides the privacy and trust layer you need.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://github.com/shadowagent"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary flex items-center gap-2"
            >
              <Github className="w-5 h-5" />
              View on GitHub
            </a>
            <a
              href="https://github.com/shadowagent/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline flex items-center gap-2"
            >
              <FileText className="w-5 h-5" />
              Documentation
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
