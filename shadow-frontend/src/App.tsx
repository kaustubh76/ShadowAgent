import { Component, ReactNode, useEffect } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { Home, AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import AgentDashboard from './pages/AgentDashboard';
import ClientDashboard from './pages/ClientDashboard';
import AgentDetails from './pages/AgentDetails';
import DisputeCenter from './pages/DisputeCenter';
import { ToastProvider } from './contexts/ToastContext';
import { useSDKStore } from './stores/sdkStore';

// 404 Page
function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
      <div className="relative mb-6">
        <div className="text-[120px] font-bold leading-none tracking-tighter bg-gradient-to-b from-gray-600 to-gray-800 bg-clip-text text-transparent select-none">
          404
        </div>
        <div className="absolute inset-0 text-[120px] font-bold leading-none tracking-tighter bg-gradient-to-b from-shadow-400/20 to-transparent bg-clip-text text-transparent blur-2xl select-none">
          404
        </div>
      </div>
      <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">Page Not Found</h1>
      <p className="text-gray-400 mb-10 text-center max-w-md text-sm leading-relaxed">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => window.history.back()}
          className="btn btn-outline flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Go Back
        </button>
        <Link to="/" className="btn btn-primary flex items-center gap-2">
          <Home className="w-4 h-4" />
          Go Home
        </Link>
      </div>
    </div>
  );
}

// Error Boundary
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Error logged to browser console for debugging
    // In production, this should send to error tracking service
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface-0 flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2 tracking-tight">Something went wrong</h1>
            <p className="text-gray-400 mb-3 text-sm leading-relaxed">
              An unexpected error occurred. Please try reloading the page.
            </p>
            {this.state.error?.message && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 mb-6">
                <p className="text-red-400 text-xs font-mono break-all">{this.state.error.message}</p>
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  const { initializeClient } = useSDKStore();

  const { checkHealth } = useSDKStore();

  // Initialize SDK client and check facilitator health on app load
  useEffect(() => {
    initializeClient();
  }, [initializeClient]);

  // Periodically check facilitator health (every 30s)
  useEffect(() => {
    const interval = setInterval(() => {
      checkHealth();
    }, 30_000);
    // Initial check after SDK init settles
    const timeout = setTimeout(() => checkHealth(), 2_000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [checkHealth]);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="agent" element={<AgentDashboard />} />
            <Route path="client" element={<ClientDashboard />} />
            <Route path="agents/:agentId" element={<AgentDetails />} />
            <Route path="disputes" element={<DisputeCenter />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
