import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';

export default function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-900">
      <Header />
      <div className="h-[1px] bg-gradient-to-r from-transparent via-shadow-500/50 to-transparent" />
      <main key={location.pathname} className="container mx-auto px-4 py-8 animate-fade-in">
        <Outlet />
      </main>
      <footer className="border-t border-gray-800 py-6 mt-auto">
        <div className="h-[1px] bg-gradient-to-r from-transparent via-shadow-500/20 to-transparent -mt-6 mb-6" />
        <div className="container mx-auto px-4 text-center text-gray-500 text-sm">
          <p>ShadowAgent - Privacy-Preserving AI Marketplace on Aleo</p>
          <p className="mt-1">Built with zero-knowledge proofs for the autonomous economy</p>
        </div>
      </footer>
    </div>
  );
}
