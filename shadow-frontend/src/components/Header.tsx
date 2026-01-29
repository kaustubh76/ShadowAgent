import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Shield, User, Users, Menu, X } from 'lucide-react';
import ConnectWallet from './ConnectWallet';
import clsx from 'clsx';

export default function Header() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { path: '/', label: 'Home', icon: Shield },
    { path: '/client', label: 'Find Agents', icon: Users },
    { path: '/agent', label: 'Agent Dashboard', icon: User },
  ];

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <header className="border-b border-gray-800/50 bg-gray-900/80 backdrop-blur-lg sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 hover:scale-105 transition-transform duration-200">
            <Shield className="w-8 h-8 text-shadow-500" />
            <span className="text-xl font-bold text-white">ShadowAgent</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={clsx(
                    'relative flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200',
                    isActive
                      ? 'bg-shadow-600/20 text-shadow-400 after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:w-8 after:h-0.5 after:bg-shadow-500 after:rounded-full'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Desktop Wallet */}
          <div className="hidden md:block">
            <ConnectWallet />
          </div>

          {/* Mobile Hamburger Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-gray-400 hover:text-white transition-colors duration-200 p-2"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Panel */}
      {mobileMenuOpen && (
        <nav
          className="md:hidden border-t border-gray-800/50 bg-gray-900/95 backdrop-blur-lg animate-fade-in-down"
          role="navigation"
          aria-hidden={!mobileMenuOpen}
        >
          <div className="container mx-auto px-4 py-4 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={clsx(
                    'flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200',
                    isActive
                      ? 'bg-shadow-600/20 text-shadow-400'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
            <div className="pt-3 border-t border-gray-800/50">
              <ConnectWallet />
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
