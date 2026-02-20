import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Shield, User, Users, Menu, X, AlertTriangle, Clock, Briefcase } from 'lucide-react';
import ConnectWallet from './ConnectWallet';
import { useAgentStore } from '../stores/agentStore';
import clsx from 'clsx';

export default function Header() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pendingCount = useAgentStore(s => s.pendingEscrows.length);

  const navItems = [
    { path: '/', label: 'Home', icon: Shield },
    { path: '/client', label: 'Find Agents', icon: Users },
    { path: '/jobs', label: 'Jobs', icon: Briefcase },
    { path: '/agent', label: 'Agent Dashboard', icon: User },
    { path: '/disputes', label: 'Disputes', icon: AlertTriangle },
    { path: '/activity', label: 'Activity', icon: Clock },
  ];

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Track scroll for header background intensity
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 16);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={clsx(
        'sticky top-0 z-50 transition-all duration-500',
        scrolled
          ? 'bg-surface-0/80 backdrop-blur-2xl border-b border-white/[0.06] shadow-lg shadow-black/20'
          : 'bg-transparent border-b border-transparent'
      )}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[72px]">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-shadow-500 to-shadow-700 flex items-center justify-center shadow-glow-sm group-hover:shadow-glow transition-shadow duration-500">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -inset-1 rounded-xl bg-shadow-500/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">
              Shadow<span className="text-shadow-400">Agent</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center">
            <div className="flex items-center gap-1 bg-white/[0.03] rounded-xl p-1 border border-white/[0.04]">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={clsx(
                      'relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300',
                      isActive
                        ? 'bg-shadow-600/20 text-shadow-300 shadow-inner-glow'
                        : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                    {item.path === '/agent' && pendingCount > 0 && (
                      <span className="w-4 h-4 rounded-full bg-shadow-500 text-white text-[9px] font-bold flex items-center justify-center animate-scale-in">
                        {pendingCount}
                      </span>
                    )}
                    {isActive && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-shadow-500 rounded-full" />
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Desktop Wallet */}
          <div className="hidden md:block">
            <ConnectWallet />
          </div>

          {/* Mobile Hamburger Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={clsx(
              'md:hidden p-2.5 rounded-xl transition-all duration-300',
              mobileMenuOpen
                ? 'bg-surface-3 text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
            )}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Panel */}
      {mobileMenuOpen && (
        <nav
          className="md:hidden border-t border-white/[0.04] bg-surface-0/95 backdrop-blur-2xl animate-fade-in-down"
          role="navigation"
          aria-hidden={!mobileMenuOpen}
        >
          <div className="container mx-auto px-4 py-4 space-y-1">
            {navItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={clsx(
                    'flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 opacity-0 animate-fade-in-up',
                    isActive
                      ? 'bg-shadow-600/15 text-shadow-300 border border-shadow-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                  )}
                  style={{ animationDelay: `${index * 0.05}s`, animationFillMode: 'forwards' }}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                  {item.path === '/agent' && pendingCount > 0 && (
                    <span className="w-5 h-5 rounded-full bg-shadow-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {pendingCount}
                    </span>
                  )}
                </Link>
              );
            })}
            <div className="pt-4 border-t border-white/[0.04]">
              <ConnectWallet />
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
