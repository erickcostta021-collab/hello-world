import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ArrowLeft, CheckCircle, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import logo from "@/assets/bridge-api-logo.jpg";
import { z } from "zod";

const emailSchema = z.string().email("Email inválido");

const registerSchema = z.object({
  fullName: z.string().min(3, "Nome deve ter pelo menos 3 caracteres").max(100),
  phone: z.string().min(10, "Telefone inválido").max(20),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

type Step = "email" | "verify" | "details" | "success";

export function RegisterForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = emailSchema.safeParse(email);
    if (!result.success) {
      toast.error("Email inválido");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-registration-code", {
        body: { email: email.trim().toLowerCase() },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      toast.success("Código enviado para seu email!");
      setStep("verify");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar código");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length < 4) {
      toast.error("Digite o código recebido");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-registration-code", {
        body: { email: email.trim().toLowerCase(), code: code.trim() },
      });
      if (error) throw error;
      if (!data?.valid) {
        toast.error(data?.error || "Código inválido ou expirado");
        return;
      }
      // Mark code as used
      await supabase.functions.invoke("mark-code-used", {
        body: { email: email.trim().toLowerCase() },
      });
      toast.success("Código verificado!");
      setStep("details");
    } catch (err: any) {
      toast.error(err.message || "Erro ao verificar código");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = registerSchema.safeParse({ fullName, phone, password, confirmPassword });
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }
    setLoading(true);
    try {
      const trimmedEmail = email.trim().toLowerCase();
      // Create user via edge function (bypasses Supabase SMTP)
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: { email: trimmedEmail, password },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      // Sign in immediately since email is already confirmed
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (signInError) throw signInError;

      // Update profile with name and phone
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({
            full_name: fullName.trim(),
            phone: phone.replace(/\D/g, ""),
            email: trimmedEmail,
          })
          .eq("user_id", user.id);
      }

      toast.success("Conta criada com sucesso!");
      setStep("success");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  };

  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-border bg-card">
          <CardHeader className="text-center">
            <div className="flex flex-col items-center gap-3 mb-4">
              <div className="w-16 h-16 rounded-full bg-brand-green/20 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-brand-green" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">Conta Criada!</CardTitle>
            <CardDescription className="text-muted-foreground">
              Sua conta foi criada e ativada com sucesso.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => navigate("/dashboard")}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Ir para o Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="text-center">
          <Link to="/" className="absolute top-4 left-4 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex flex-col items-center gap-3 mb-4">
            <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-lg">
              <img src={logo} alt="Bridge API" className="w-full h-full object-cover" />
            </div>
            <span className="text-xl font-semibold text-foreground">Bridge API</span>
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">Criar Conta</CardTitle>
          <CardDescription className="text-muted-foreground">
            {step === "email" && "Informe seu email para começar"}
            {step === "verify" && "Digite o código enviado para seu email"}
            {step === "details" && "Complete seus dados para finalizar"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "email" && (
            <form onSubmit={handleSendCode} className="space-y-4">
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
              <Button type="submit" className="w-full bg-brand-green hover:bg-brand-green/90 text-white" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                Enviar Código de Verificação
              </Button>
            </form>
          )}

          {step === "verify" && (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code" className="text-foreground">Código de Verificação</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="ABC123"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  required
                  maxLength={6}
                  className="bg-secondary border-border text-center text-lg tracking-widest font-mono"
                />
                <p className="text-xs text-muted-foreground">Verifique sua caixa de entrada e spam</p>
              </div>
              <Button type="submit" className="w-full bg-brand-green hover:bg-brand-green/90 text-white" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Verificar Código
              </Button>
              <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={() => setStep("email")}>
                Voltar
              </Button>
            </form>
          )}

          {step === "details" && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-foreground">Nome Completo</Label>
                <Input id="fullName" type="text" placeholder="Seu nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="bg-secondary border-border" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-foreground">Número de Telefone</Label>
                <Input id="phone" type="tel" placeholder="(00) 00000-0000" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} required className="bg-secondary border-border" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground">Senha</Label>
                <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="bg-secondary border-border" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-foreground">Confirmar Senha</Label>
                <Input id="confirmPassword" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} className="bg-secondary border-border" />
              </div>
              <Button type="submit" className="w-full bg-brand-green hover:bg-brand-green/90 text-white" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Conta
              </Button>
            </form>
          )}

          <div className="mt-4 text-center">
            <Link to="/login" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              Já tem conta? Entre aqui
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
