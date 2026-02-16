import { useAuth } from "@/hooks/useAuth";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

const Register = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <RegisterForm />;
};

export default Register;
