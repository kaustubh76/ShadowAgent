import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';

export default function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-surface-0 relative">
      {/* Ambient background layers */}
      <div className="mesh-bg" />
      <div className="grid-pattern" />
      <div className="noise-overlay" />

      {/* Content */}
      <div className="relative z-10">
        <Header />
        <div className="divider-glow" />
        <main key={location.pathname} className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
          <Outlet />
        </main>
        <footer className="relative border-t border-white/[0.04] mt-auto">
          <div className="divider-glow opacity-30" />
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <div className="w-5 h-5 rounded-md bg-shadow-600/20 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-sm bg-shadow-500/60" />
                </div>
                <span>ShadowAgent</span>
                <span className="text-gray-700">|</span>
                <span>Privacy-Preserving AI Marketplace on Aleo</span>
              </div>
              <p className="text-gray-600 text-xs">
                Built with zero-knowledge proofs for the autonomous economy
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
