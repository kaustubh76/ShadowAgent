import { Component, ReactNode, useEffect } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { Home, AlertTriangle } from 'lucide-react';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import AgentDashboard from './pages/AgentDashboard';
import ClientDashboard from './pages/ClientDashboard';
import AgentDetails from './pages/AgentDetails';
import { ToastProvider } from './contexts/ToastContext';
import { useSDKStore } from './stores/sdkStore';

// 404 Page
function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
      <div className="text-6xl font-bold text-gray-700 mb-2">404</div>
      <h1 className="text-2xl font-bold text-white mb-2">Page Not Found</h1>
      <p className="text-gray-400 mb-8 text-center max-w-md">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link to="/" className="btn btn-primary flex items-center gap-2">
        <Home className="w-4 h-4" />
        Go Home
      </Link>
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
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
          <div className="card max-w-md w-full text-center animate-fade-in">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-white mb-2">Something went wrong</h1>
            <p className="text-gray-400 mb-6 text-sm">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn btn-primary"
            >
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
  const { initializeClient, checkHealth } = useSDKStore();

  // Initialize SDK client on app load
  useEffect(() => {
    // Initialize the SDK client with default config
    initializeClient();

    // Set up periodic health checks (every 30 seconds)
    const healthInterval = setInterval(() => {
      checkHealth();
    }, 30000);

    return () => clearInterval(healthInterval);
  }, [initializeClient, checkHealth]);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="agent" element={<AgentDashboard />} />
            <Route path="client" element={<ClientDashboard />} />
            <Route path="agents/:agentId" element={<AgentDetails />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
