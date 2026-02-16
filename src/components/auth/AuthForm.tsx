import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, Mail, KeyRound, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import logo from "@/assets/bridge-api-logo.jpg";

type AuthStep = "login" | "request-code" | "enter-code" | "create-account";

export function AuthForm() {
  const [step, setStep] = useState<AuthStep>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error, data } = await signIn(email, password);
      if (error) throw error;
      
      // Check if user is paused
      if (data?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_paused")
          .eq("user_id", data.user.id)
          .maybeSingle();
        
        if (profile?.is_paused) {
          await supabase.auth.signOut();
          toast.error("Sua conta está pausada. Entre em contato com o administrador.");
          setLoading(false);
          return;
        }
      }
      
      toast.success("Login realizado com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("send-registration-code", {
        body: { email },
      });

      if (error) throw error;

      toast.success("Código enviado! Verifique seu e-mail.");
      setStep("enter-code");
    } catch (error: any) {
      console.error("Error requesting code:", error);
      toast.error(error.message || "Erro ao solicitar código");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (code.length !== 6) {
      toast.error("Digite o código completo");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("verify-registration-code", {
        body: { email, code },
      });

      if (error) throw error;

      if (data.valid) {
        toast.success(data.message);
        setCodeVerified(true);
        setStep("create-account");
      } else {
        toast.error(data.error || "Código inválido");
      }
    } catch (error: any) {
      console.error("Error verifying code:", error);
      toast.error(error.message || "Erro ao verificar código");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    setLoading(true);

    try {
      const { error } = await signUp(email, password);
      if (error) throw error;

      // Marcar código como usado
      await supabase.functions.invoke("mark-code-used", {
        body: { email },
      });

      toast.success("Conta criada com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  };

  const resetToLogin = () => {
    setStep("login");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setCode("");
    setCodeVerified(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="text-center">
          <div className="flex flex-col items-center gap-3 mb-4">
            <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-lg">
              <img src={logo} alt="Bridge API" className="w-full h-full object-cover" />
            </div>
            <span className="text-xl font-semibold text-foreground">Bridge API</span>
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">
            Instance Manager
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {step === "login" && "Entre para gerenciar suas instâncias"}
            {step === "request-code" && "Informe seu e-mail para receber o código"}
            {step === "enter-code" && "Digite o código enviado para seu e-mail"}
            {step === "create-account" && "Crie sua senha"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="bg-secondary border-border"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Entrar
              </Button>
            </form>
          )}

          {step === "request-code" && (
            <form onSubmit={handleRequestCode} className="space-y-4">
              <div className="p-4 bg-secondary/50 rounded-lg border border-border">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-primary mt-0.5" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">Verificação por E-mail</p>
                    <p>Enviaremos um código de verificação para o seu e-mail. Use-o para confirmar sua conta e criar sua senha.</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email" className="text-foreground">Seu Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-secondary border-border"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar Código de Verificação
              </Button>
            </form>
          )}

          {step === "enter-code" && (
            <div className="space-y-4">
              <div className="p-4 bg-secondary/50 rounded-lg border border-border">
                <div className="flex items-start gap-3">
                  <KeyRound className="h-5 w-5 text-primary mt-0.5" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">Verifique seu E-mail</p>
                    <p>Enviamos um código de 6 dígitos para <strong>{email}</strong>. Verifique sua caixa de entrada e spam.</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Código de Verificação</Label>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={code}
                    onChange={(value) => setCode(value)}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </div>
              <Button
                onClick={handleVerifyCode}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={loading || code.length !== 6}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verificar Código
              </Button>
              <Button
                variant="ghost"
                onClick={() => setStep("request-code")}
                className="w-full text-muted-foreground"
              >
                Reenviar código
              </Button>
            </div>
          )}

          {step === "create-account" && (
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-primary" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">E-mail Verificado!</p>
                    <p className="text-muted-foreground">Agora crie sua senha para finalizar o cadastro.</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Email</Label>
                <Input
                  type="email"
                  value={email}
                  disabled
                  className="bg-secondary/50 border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password" className="text-foreground">Senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-foreground">Confirmar Senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="bg-secondary border-border"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Conta
              </Button>
            </form>
          )}

          <div className="mt-4 text-center">
            {step === "login" ? (
              <button
                type="button"
                onClick={() => setStep("request-code")}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Não tem conta? Solicite acesso
              </button>
            ) : (
              <button
                type="button"
                onClick={resetToLogin}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Já tem conta? Entre aqui
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
