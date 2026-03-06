import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/hooks/useAuth";
import { useAccountStatus } from "@/hooks/useAccountStatus";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

// Retry wrapper for lazy imports — handles chunk load failures after deploys
function lazyRetry(factory: () => Promise<any>, retries = 2): Promise<any> {
  return factory().catch((err) => {
    if (retries > 0) {
      return new Promise((resolve) => setTimeout(resolve, 500)).then(() =>
        lazyRetry(factory, retries - 1)
      );
    }
    // Force reload if all retries fail (new deploy likely changed chunk hashes)
    window.location.reload();
    throw err;
  });
}

// Lazy-loaded pages with retry for chunk load resilience
const Index = lazy(() => lazyRetry(() => import("./pages/Index")));
const MainLogin = lazy(() => lazyRetry(() => import("./pages/MainLogin")));
const Login = lazy(() => lazyRetry(() => import("./pages/Login")));
const Register = lazy(() => lazyRetry(() => import("./pages/Register")));
const ResetPassword = lazy(() => lazyRetry(() => import("./pages/ResetPassword")));
const Checkout = lazy(() => lazyRetry(() => import("./pages/Checkout")));
const Dashboard = lazy(() => lazyRetry(() => import("./pages/Dashboard")));
const Settings = lazy(() => lazyRetry(() => import("./pages/Settings")));
const SubaccountSettings = lazy(() => lazyRetry(() => import("./pages/SubaccountSettings")));
const EmbedInstances = lazy(() => lazyRetry(() => import("./pages/EmbedInstances")));
const OAuthCallback = lazy(() => lazyRetry(() => import("./pages/OAuthCallback")));
const OAuthSuccess = lazy(() => lazyRetry(() => import("./pages/OAuthSuccess")));
const AdminHealth = lazy(() => lazyRetry(() => import("./pages/AdminHealth")));
const NotFound = lazy(() => lazyRetry(() => import("./pages/NotFound")));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      refetchOnWindowFocus: false,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

/**
 * Uses the unified useAccountStatus hook instead of a separate usePausedCheck,
 * eliminating one redundant Supabase query per protected route mount.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const { isPaused, isLoading: statusLoading } = useAccountStatus();
  const didSignOutRef = useRef(false);

  useEffect(() => {
    if (!statusLoading && isPaused && !didSignOutRef.current) {
      didSignOutRef.current = true;
      signOut();
    }
  }, [isPaused, statusLoading, signOut]);

  if (loading || statusLoading) {
    return <PageLoader />;
  }

  if (!user || isPaused) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

const AppRoutes = () => (
  <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/login" element={<MainLogin />} />
      <Route path="/convidadospormim" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/subaccount/:id/settings"
        element={
          <ProtectedRoute>
            <SubaccountSettings />
          </ProtectedRoute>
        }
      />
      <Route path="/embed/:embedToken" element={<EmbedInstances />} />
      <Route
        path="/admin/health"
        element={
          <ProtectedRoute>
            <AdminHealth />
          </ProtectedRoute>
        }
      />
      <Route path="/oauth/callback" element={<OAuthCallback />} />
      <Route path="/oauth/success/:locationId" element={<OAuthSuccess />} />
      <Route path="/oauth/success" element={<OAuthSuccess />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </Suspense>
);

function UnhandledRejectionGuard({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      console.error("Unhandled rejection:", event.reason);
      toast.error("Ocorreu um erro inesperado. Tente novamente.");
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);
  return <>{children}</>;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <UnhandledRejectionGuard>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </UnhandledRejectionGuard>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
