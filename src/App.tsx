import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePausedCheck } from "@/hooks/usePausedCheck";
import { Loader2 } from "lucide-react";

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
      staleTime: 1000 * 60, // 1 minute — avoid refetching on every navigation
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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isPaused, checking } = usePausedCheck();

  if (loading || checking) {
    return <PageLoader />;
  }

  if (!user || isPaused) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
            {/* Public embed route - no auth required */}
            <Route path="/embed/:embedToken" element={<EmbedInstances />} />
            {/* Admin health dashboard */}
            <Route
              path="/admin/health"
              element={
                <ProtectedRoute>
                  <AdminHealth />
                </ProtectedRoute>
              }
            />
            {/* OAuth routes - public for GHL */}
            <Route path="/oauth/callback" element={<OAuthCallback />} />
            <Route path="/oauth/success/:locationId" element={<OAuthSuccess />} />
            <Route path="/oauth/success" element={<OAuthSuccess />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
