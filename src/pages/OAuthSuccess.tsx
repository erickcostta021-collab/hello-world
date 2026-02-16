import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { CheckCircle, Settings, Phone, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const OAuthSuccess = () => {
  const { locationId } = useParams();
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(15);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate("/dashboard");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-lg">
        <div className="mb-6 flex justify-center">
          <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center animate-in zoom-in duration-500">
            <CheckCircle className="w-12 h-12 text-green-500" />
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-foreground mb-2">
          App instalado com sucesso!
        </h1>
        
        <p className="text-muted-foreground mb-6">
          Falta apenas um passo para ativar o provedor de SMS.
        </p>

        {/* Manual activation steps */}
        <div className="bg-muted/50 border rounded-lg p-4 mb-6 text-left">
          <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Ative o provedor SMS manualmente:
          </h3>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0">1</span>
              <span>No GHL, vá em <strong className="text-foreground">Settings</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0">2</span>
              <span>Clique em <strong className="text-foreground">Phone Numbers</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0">3</span>
              <span>Abra <strong className="text-foreground">Advanced Settings</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0">4</span>
              <span>Em <strong className="text-foreground">SMS Provider</strong>, selecione o app e clique <strong className="text-foreground">Save</strong></span>
            </li>
          </ol>
        </div>

        <div className="flex items-center justify-center gap-2 mb-4">
          <Phone className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Settings <ChevronRight className="w-3 h-3 inline" /> Phone Numbers <ChevronRight className="w-3 h-3 inline" /> Advanced Settings <ChevronRight className="w-3 h-3 inline" /> SMS Provider
          </span>
        </div>

        {locationId && (
          <p className="text-xs text-muted-foreground/60 mb-4">
            Location ID: {locationId}
          </p>
        )}

        <Button 
          onClick={() => navigate("/dashboard")} 
          className="mb-2"
        >
          Ir para o Dashboard
        </Button>

        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
            {countdown}
          </div>
          <span>Redirecionando automaticamente...</span>
        </div>
      </div>
    </div>
  );
};

export default OAuthSuccess;
