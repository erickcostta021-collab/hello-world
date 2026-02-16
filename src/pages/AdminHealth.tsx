import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Activity, AlertTriangle, CheckCircle, RefreshCw, Server, TrendingUp } from "lucide-react";
import { toast } from "sonner";

interface WebhookMetric {
  function_name: string;
  error_type: string | null;
  created_at: string;
  processing_time_ms: number | null;
}

interface HealthAlert {
  id: string;
  instance_name: string;
  server_url: string;
  status: string;
  first_detected_at: string;
  resolved_at: string | null;
}

interface AggregatedMetrics {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  error429Count: number;
  error5xxCount: number;
  avgProcessingTime: number;
  byFunction: Record<string, { total: number; errors: number }>;
  byMinute: Array<{ minute: string; total: number; errors: number }>;
}

function aggregateMetrics(metrics: WebhookMetric[]): AggregatedMetrics {
  const result: AggregatedMetrics = {
    totalRequests: metrics.length,
    successCount: 0,
    errorCount: 0,
    error429Count: 0,
    error5xxCount: 0,
    avgProcessingTime: 0,
    byFunction: {},
    byMinute: [],
  };

  let totalTime = 0;
  let timeCount = 0;
  const minuteMap = new Map<string, { total: number; errors: number }>();

  for (const m of metrics) {
    const isError = m.error_type && m.error_type !== "success";
    if (isError) {
      result.errorCount++;
      if (m.error_type === "429") result.error429Count++;
      if (m.error_type === "5xx") result.error5xxCount++;
    } else {
      result.successCount++;
    }

    if (m.processing_time_ms) {
      totalTime += m.processing_time_ms;
      timeCount++;
    }

    // By function
    if (!result.byFunction[m.function_name]) {
      result.byFunction[m.function_name] = { total: 0, errors: 0 };
    }
    result.byFunction[m.function_name].total++;
    if (isError) result.byFunction[m.function_name].errors++;

    // By minute
    const minute = new Date(m.created_at).toISOString().slice(0, 16);
    if (!minuteMap.has(minute)) minuteMap.set(minute, { total: 0, errors: 0 });
    const entry = minuteMap.get(minute)!;
    entry.total++;
    if (isError) entry.errors++;
  }

  result.avgProcessingTime = timeCount > 0 ? Math.round(totalTime / timeCount) : 0;
  result.byMinute = Array.from(minuteMap.entries())
    .map(([minute, data]) => ({ minute: minute.slice(11), ...data }))
    .sort((a, b) => a.minute.localeCompare(b.minute))
    .slice(-30); // Last 30 minutes

  return result;
}

export default function AdminHealth() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [metrics, setMetrics] = useState<AggregatedMetrics | null>(null);
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningCheck, setRunningCheck] = useState(false);

  useEffect(() => {
    checkAdmin();
  }, [user]);

  async function checkAdmin() {
    if (!user) return;
    const { data } = await supabase.rpc("is_admin");
    if (!data) {
      navigate("/dashboard");
      return;
    }
    setIsAdmin(true);
    await loadData();
  }

  async function loadData() {
    setLoading(true);
    try {
      // Load metrics from last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: rawMetrics } = await supabase
        .from("webhook_metrics")
        .select("function_name, error_type, created_at, processing_time_ms")
        .gte("created_at", oneHourAgo)
        .order("created_at", { ascending: false })
        .limit(1000);

      setMetrics(aggregateMetrics((rawMetrics as WebhookMetric[]) || []));

      // Load active alerts
      const { data: activeAlerts } = await supabase
        .from("server_health_alerts")
        .select("id, instance_name, server_url, status, first_detected_at, resolved_at")
        .order("created_at", { ascending: false })
        .limit(50);

      setAlerts((activeAlerts as HealthAlert[]) || []);
    } catch (e) {
      console.error("Failed to load health data:", e);
    } finally {
      setLoading(false);
    }
  }

  async function runHealthCheck() {
    setRunningCheck(true);
    try {
      const { data, error } = await supabase.functions.invoke("health-check");
      if (error) throw error;
      toast.success(`Verificação concluída: ${data.checked} servidores, ${data.offline} offline`);
      await loadData();
    } catch (e: any) {
      toast.error(e.message || "Erro ao executar verificação");
    } finally {
      setRunningCheck(false);
    }
  }

  if (isAdmin === null || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const errorRate = metrics && metrics.totalRequests > 0
    ? ((metrics.errorCount / metrics.totalRequests) * 100).toFixed(1)
    : "0.0";

  const activeAlerts = alerts.filter(a => a.status === "offline");
  const recentRecovered = alerts.filter(a => a.status === "recovered").slice(0, 10);

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Dashboard de Saúde
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Monitoramento de webhooks e servidores (última hora)</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button onClick={runHealthCheck} disabled={runningCheck}>
              {runningCheck ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Server className="h-4 w-4 mr-2" />}
              Verificar Servidores
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-foreground">{metrics?.totalRequests || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Webhooks Processados</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className={`text-2xl font-bold ${Number(errorRate) > 5 ? "text-destructive" : "text-emerald-400"}`}>
                {errorRate}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">Taxa de Erro</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-amber-400">{metrics?.error429Count || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Rate Limits (429)</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-foreground">{metrics?.avgProcessingTime || 0}ms</div>
              <p className="text-xs text-muted-foreground mt-1">Tempo Médio</p>
            </CardContent>
          </Card>
        </div>

        {/* Active Alerts */}
        {activeAlerts.length > 0 && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Servidores Offline ({activeAlerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {activeAlerts.map((alert) => {
                const elapsed = Math.round((Date.now() - new Date(alert.first_detected_at).getTime()) / 60000);
                return (
                  <div key={alert.id} className="flex items-center justify-between p-3 bg-card/50 rounded-lg border border-border/50">
                    <div>
                      <span className="font-medium text-card-foreground">{alert.instance_name}</span>
                      <span className="text-xs text-muted-foreground ml-2">{alert.server_url}</span>
                    </div>
                    <Badge variant="destructive" className="shrink-0">
                      {elapsed >= 60 ? `${Math.round(elapsed / 60)}h` : `${elapsed}min`} offline
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Function breakdown + Volume timeline */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* By Function */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Volume por Função
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {metrics && Object.entries(metrics.byFunction).length > 0 ? (
                Object.entries(metrics.byFunction).map(([fn, data]) => (
                  <div key={fn} className="flex items-center justify-between">
                    <span className="text-sm font-mono text-card-foreground">{fn}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{data.total}</span>
                      {data.errors > 0 && (
                        <Badge variant="destructive" className="text-xs">{data.errors} erros</Badge>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma métrica registrada na última hora</p>
              )}
            </CardContent>
          </Card>

          {/* Volume per minute (simple bar representation) */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Volume por Minuto
              </CardTitle>
            </CardHeader>
            <CardContent>
              {metrics && metrics.byMinute.length > 0 ? (
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {metrics.byMinute.map((entry) => {
                    const maxTotal = Math.max(...metrics.byMinute.map(e => e.total), 1);
                    const width = (entry.total / maxTotal) * 100;
                    const errorWidth = entry.errors > 0 ? (entry.errors / maxTotal) * 100 : 0;
                    return (
                      <div key={entry.minute} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-12 shrink-0 font-mono">{entry.minute}</span>
                        <div className="flex-1 relative h-5">
                          <div
                            className="absolute inset-y-0 left-0 bg-primary/30 rounded"
                            style={{ width: `${width}%` }}
                          />
                          {errorWidth > 0 && (
                            <div
                              className="absolute inset-y-0 left-0 bg-destructive/50 rounded"
                              style={{ width: `${errorWidth}%` }}
                            />
                          )}
                          <span className="relative z-10 text-xs px-1 leading-5 text-foreground">
                            {entry.total}{entry.errors > 0 ? ` (${entry.errors}❌)` : ""}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum dado por minuto disponível</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recently Recovered */}
        {recentRecovered.length > 0 && (
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                Recuperados Recentemente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentRecovered.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between p-2 text-sm">
                  <span className="text-card-foreground">{alert.instance_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {alert.resolved_at ? new Date(alert.resolved_at).toLocaleString("pt-BR") : ""}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
