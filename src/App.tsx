import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/hooks/useAuth";
import { useAccountStatus } from "@/hooks/useAccountStatus";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

// Lazy-loaded pages for code splitting
const Index = lazy(() => import("./pages/Index"));
const MainLogin = lazy(() => import("./pages/MainLogin"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Settings = lazy(() => import("./pages/Settings"));
const SubaccountSettings = lazy(() => import("./pages/SubaccountSettings"));
const EmbedInstances = lazy(() => import("./pages/EmbedInstances"));
const OAuthCallback = lazy(() => import("./pages/OAuthCallback"));
const OAuthSuccess = lazy(() => import("./pages/OAuthSuccess"));
const AdminHealth = lazy(() => import("./pages/AdminHealth"));
const NotFound = lazy(() => import("./pages/NotFound"));

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
