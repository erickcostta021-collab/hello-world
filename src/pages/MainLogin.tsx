import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link } from "react-router-dom";
import { Loader2, Mail, Lock, Eye, EyeOff, ArrowLeft, KeyRound, CheckCircle, User, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import logo from "@/assets/bridge-api-logo.jpg";

type ActivationStep = "idle" | "resend" | "enter-code" | "create-account";

const MainLogin = () => {
  const { user, loading: authLoading, signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});

  // Forgot password state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  // Activation flow state
  const [activationStep, setActivationStep] = useState<ActivationStep>("idle");
  const [activationLoading, setActivationLoading] = useState(false);
  const [activationCode, setActivationCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const validateEmail = (val: string) => {
    if (!val.trim()) return "O email é obrigatório";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return "Email inválido";
    return undefined;
  };

  const validatePassword = (val: string) => {
    if (!val) return "A senha é obrigatória";
    if (val.length < 6) return "Mínimo de 6 caracteres";
    return undefined;
  };

  const handleBlur = (field: "email" | "password") => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    if (field === "email") {
      setErrors((prev) => ({ ...prev, email: validateEmail(email) }));
    } else {
      setErrors((prev) => ({ ...prev, password: validatePassword(password) }));
    }
  };

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (touched.email) {
      setErrors((prev) => ({ ...prev, email: validateEmail(val) }));
    }
  };

  const handlePasswordChange = (val: string) => {
    setPassword(val);
    if (touched.password) {
      setErrors((prev) => ({ ...prev, password: validatePassword(val) }));
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const emailErr = validateEmail(email);
    const passwordErr = validatePassword(password);
    setErrors({ email: emailErr, password: passwordErr });
    setTouched({ email: true, password: true });

    if (emailErr || passwordErr) return;

    setLoading(true);

    try {
      const { error, data } = await signIn(email, password);
      if (error) {
        if (error.message?.toLowerCase().includes("email not confirmed")) {
          setActivationStep("resend");
          toast.error("Este e-mail está cadastrado mas a conta ainda não foi ativada.");
          setLoading(false);
          return;
        }
        throw error;
      }

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
      setActivationStep("idle");
      toast.error(error.message || "Email ou senha incorretos");
    } finally {
      setLoading(false);
    }
  };

  const handleResendActivation = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return;

    setActivationLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-registration-code", {
        body: { email: trimmedEmail },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      toast.success("Código de ativação enviado! Verifique seu e-mail.");
      setActivationStep("enter-code");
      setActivationCode("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao reenviar código de ativação");
    } finally {
      setActivationLoading(false);
    }
  };

  const handleVerifyActivationCode = async () => {
    if (activationCode.length !== 6) {
      toast.error("Digite o código completo");
      return;
    }

    setActivationLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-registration-code", {
        body: { email: email.trim().toLowerCase(), code: activationCode },
      });

      if (error) throw error;

      if (data.valid) {
        toast.success("Código verificado! Crie sua senha.");
        setActivationStep("create-account");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast.error(data.error || "Código inválido ou expirado");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao verificar código");
    } finally {
      setActivationLoading(false);
    }
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim() || fullName.trim().length < 3) {
      toast.error("Nome deve ter pelo menos 3 caracteres");
      return;
    }
    if (phone.replace(/\D/g, "").length < 10) {
      toast.error("Telefone inválido");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    setActivationLoading(true);
    try {
      const trimmedEmail = email.trim().toLowerCase();

      const { data, error } = await supabase.functions.invoke("create-user", {
        body: { email: trimmedEmail, password: newPassword },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        setActivationLoading(false);
        return;
      }

      await supabase.functions.invoke("mark-code-used", {
        body: { email: trimmedEmail },
      });

      const { error: signInError } = await signIn(trimmedEmail, newPassword);
      if (signInError) throw signInError;

      // Update profile with name and phone
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        await supabase
          .from("profiles")
          .update({
            full_name: fullName.trim(),
            phone: phone.replace(/\D/g, ""),
            email: trimmedEmail,
          })
          .eq("user_id", authUser.id);
      }

      toast.success("Conta ativada com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar conta");
    } finally {
      setActivationLoading(false);
    }
  };

  const resetActivation = () => {
    setActivationStep("idle");
    setActivationCode("");
    setNewPassword("");
    setConfirmPassword("");
    setFullName("");
    setPhone("");
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = forgotEmail.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Digite um email válido");
      return;
    }

    setForgotLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-reset-password", {
        body: { email: trimmedEmail },
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
        setForgotLoading(false);
        return;
      }

      setForgotSent(true);
      toast.success("Email de recuperação enviado!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao enviar email de recuperação");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <Link
        to="/"
        className="absolute top-6 left-6 z-10 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-200 group"
      >
        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform duration-200" />
        <span className="text-sm font-medium">Voltar</span>
      </Link>

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <div className="w-full max-w-md relative animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl overflow-hidden shadow-lg mb-6 transition-transform hover:scale-105 duration-300">
            <img src={logo} alt="Bridge API" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {activationStep === "enter-code" ? "Verificar Código" :
             activationStep === "create-account" ? "Criar Senha" :
             "Bem-vindo de volta"}
          </h1>
          <p className="text-muted-foreground">
            {activationStep === "enter-code" ? "Digite o código enviado para seu e-mail" :
             activationStep === "create-account" ? "Defina sua senha para ativar a conta" :
             "Entre na sua conta para continuar"}
          </p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl border border-border p-8 shadow-xl shadow-black/10">

          {/* ===== LOGIN FORM ===== */}
          {(activationStep === "idle" || activationStep === "resend") && (
            <>
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="main-email" className="text-foreground text-sm font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="main-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => handleEmailChange(e.target.value)}
                      onBlur={() => handleBlur("email")}
                      className={`pl-10 bg-secondary border-border h-11 transition-all duration-200 focus:ring-2 focus:ring-primary/20 ${
                        touched.email && errors.email ? "border-destructive focus:ring-destructive/20" :
                        touched.email && !errors.email && email ? "border-primary/50" : ""
                      }`}
                      autoComplete="email"
                    />
                  </div>
                  {touched.email && errors.email && (
                    <p className="text-xs text-destructive animate-in fade-in slide-in-from-top-1 duration-200">{errors.email}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="main-password" className="text-foreground text-sm font-medium">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="main-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => handlePasswordChange(e.target.value)}
                      onBlur={() => handleBlur("password")}
                      className={`pl-10 pr-10 bg-secondary border-border h-11 transition-all duration-200 focus:ring-2 focus:ring-primary/20 ${
                        touched.password && errors.password ? "border-destructive focus:ring-destructive/20" :
                        touched.password && !errors.password && password ? "border-primary/50" : ""
                      }`}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-200"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {touched.password && errors.password && (
                    <p className="text-xs text-destructive animate-in fade-in slide-in-from-top-1 duration-200">{errors.password}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => { setForgotEmail(email); setForgotSent(false); setForgotOpen(true); }}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors duration-200"
                  >
                    Esqueci minha senha
                  </button>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-base transition-all duration-200 hover:shadow-lg hover:shadow-primary/20"
                  disabled={loading}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Entrar
                </Button>

                {/* Resend activation panel */}
                {activationStep === "resend" && (
                  <div className="mt-4 p-4 rounded-xl border border-primary/20 bg-primary/5 text-center space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <p className="text-sm text-muted-foreground">
                      Sua conta ainda não foi ativada. Deseja reenviar o código de ativação?
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleResendActivation}
                      disabled={activationLoading}
                      className="border-primary/30 text-primary hover:bg-primary/10"
                    >
                      {activationLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                      Reenviar Código de Ativação
                    </Button>
                  </div>
                )}
              </form>

              <div className="mt-6 pt-6 border-t border-border text-center">
                <p className="text-sm text-muted-foreground">
                  Não tem uma conta?{" "}
                  <Link to="/register" className="text-primary hover:text-primary/80 font-medium transition-colors duration-200">
                    Cadastre-se
                  </Link>
                </p>
              </div>
            </>
          )}

          {/* ===== ENTER CODE STEP ===== */}
          {activationStep === "enter-code" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="p-4 bg-secondary/50 rounded-lg border border-border">
                <div className="flex items-start gap-3">
                  <KeyRound className="h-5 w-5 text-primary mt-0.5" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">Verifique seu E-mail</p>
                    <p>Enviamos um código de 6 dígitos para <strong className="text-foreground">{email}</strong>. Verifique sua caixa de entrada e spam.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Código de Verificação</Label>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={activationCode} onChange={setActivationCode}>
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
                onClick={handleVerifyActivationCode}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={activationLoading || activationCode.length !== 6}
              >
                {activationLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verificar Código
              </Button>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResendActivation}
                  disabled={activationLoading}
                  className="flex-1 text-muted-foreground"
                >
                  Reenviar código
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetActivation}
                  className="flex-1 text-muted-foreground"
                >
                  Voltar ao login
                </Button>
              </div>
            </div>
          )}

          {/* ===== CREATE ACCOUNT STEP ===== */}
          {activationStep === "create-account" && (
            <form onSubmit={handleCreateAccount} className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-primary" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">E-mail Verificado!</p>
                    <p className="text-muted-foreground">Crie sua senha para ativar a conta.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Nome Completo</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type="text"
                    placeholder="Seu nome completo"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    minLength={3}
                    className="pl-10 bg-secondary border-border h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Telefone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type="tel"
                    placeholder="(00) 00000-0000"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    required
                    className="pl-10 bg-secondary border-border h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Email</Label>
                <Input type="email" value={email} disabled className="bg-secondary/50 border-border" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-pw" className="text-foreground">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="new-pw"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pl-10 pr-10 bg-secondary border-border h-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-pw" className="text-foreground">Confirmar Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="confirm-pw"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pl-10 bg-secondary border-border h-11"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                disabled={activationLoading}
              >
                {activationLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Ativar Conta
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetActivation}
                className="w-full text-muted-foreground"
              >
                Voltar ao login
              </Button>
            </form>
          )}
        </div>
      </div>

      {/* Forgot Password Dialog */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Recuperar senha</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {forgotSent
                ? "Verifique sua caixa de entrada para o link de recuperação."
                : "Digite seu email e enviaremos um link para redefinir sua senha."}
            </DialogDescription>
          </DialogHeader>

          {forgotSent ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="h-8 w-8 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Um email foi enviado para <strong className="text-foreground">{forgotEmail}</strong>.
                Verifique sua caixa de entrada e siga as instruções.
              </p>
              <Button variant="outline" onClick={() => setForgotOpen(false)} className="mt-2">
                Fechar
              </Button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email" className="text-foreground">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="pl-10 bg-secondary border-border"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setForgotOpen(false)} className="flex-1">
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                  disabled={forgotLoading}
                >
                  {forgotLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MainLogin;
