import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useEmbedSupabase } from "@/hooks/useEmbedSupabase";
import { Smartphone, Loader2, RefreshCw, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmbedInstanceCard, EmbedInstance } from "@/components/embed/EmbedInstanceCard";

interface SubaccountData {
  id: string;
  account_name: string;
  location_id: string;
  user_id: string;
  uazapi_base_url?: string | null;
  embed_password?: string | null;
}

export default function EmbedInstances() {
  const { embedToken } = useParams();
  const [searchParams] = useSearchParams();
  const isIframe = searchParams.get("iframe") === "true";
  const supabase = useEmbedSupabase();
  
  const [loading, setLoading] = useState(true);
  const [subaccount, setSubaccount] = useState<SubaccountData | null>(null);
  const [instances, setInstances] = useState<EmbedInstance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [storedPassword, setStoredPassword] = useState<string | null>(null);

  const fetchData = async () => {
    if (!embedToken) {
      setError("Token inválido");
      setLoading(false);
      return;
    }

    try {
      console.log("[EmbedInstances] Fetching subaccount for token:", embedToken);
      
      // Fetch subaccount by embed token - only safe columns, NO tokens
      const { data: subData, error: subError } = await supabase
        .from("ghl_subaccounts")
        .select("id, account_name, location_id, user_id, embed_password")
        .eq("embed_token", embedToken)
        .maybeSingle();

      console.log("[EmbedInstances] Subaccount query result:", { subData, subError });

      if (subError) {
        console.error("[EmbedInstances] Subaccount error:", subError);
        setError(`Erro ao buscar subconta: ${subError.message}`);
        setLoading(false);
        return;
      }
      
      if (!subData) {
        setError("Subconta não encontrada");
        setLoading(false);
        return;
      }

      // Check if password is required
      if ((subData as any).embed_password) {
        setStoredPassword((subData as any).embed_password);
        setPasswordRequired(true);
        setLoading(false);
        // Don't load instances until password is verified
        setSubaccount(subData as SubaccountData);
        return;
      }

      setSubaccount(subData as SubaccountData);

      // Fetch track_id via server-side proxy (RLS blocks direct access)
      try {
        const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/uazapi-proxy-embed`;
        const trackRes = await fetch(proxyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ embedToken, action: "get-track-id" }),
        });
        const trackData = await trackRes.json().catch(() => null);
        setTrackId(trackData?.trackId || null);
      } catch {
        console.error("Failed to fetch track_id");
      }

      // Fetch instances for this subaccount
      const { data: instData, error: instError } = await supabase
        .from("instances")
        .select("id, instance_name, instance_status, ghl_user_id, phone, profile_pic_url, uazapi_instance_token, uazapi_base_url, embed_visible_options, is_official_api")
        .eq("subaccount_id", subData.id)
        .order("instance_name");

      if (instError) {
        console.error("Error fetching instances:", instError);
        setInstances([]);
      } else {
        setInstances((instData || []).map(i => ({
          ...i,
          uazapi_instance_token: i.uazapi_instance_token || "",
          uazapi_base_url: i.uazapi_base_url || null,
          embed_visible_options: i.embed_visible_options as any || null,
          is_official_api: i.is_official_api || false,
        })));
      }
    } catch (err) {
      console.error("Error:", err);
      setError("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const loadInstancesAfterPassword = async () => {
    if (!subaccount) return;
    setLoading(true);
    try {
      const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/uazapi-proxy-embed`;
      const trackRes = await fetch(proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embedToken, action: "get-track-id" }),
      });
      const trackData = await trackRes.json().catch(() => null);
      setTrackId(trackData?.trackId || null);

      const { data: instData } = await supabase
        .from("instances")
        .select("id, instance_name, instance_status, ghl_user_id, phone, profile_pic_url, uazapi_instance_token, uazapi_base_url, embed_visible_options, is_official_api")
        .eq("subaccount_id", subaccount.id)
        .order("instance_name");

      setInstances((instData || []).map(i => ({
        ...i,
        uazapi_instance_token: i.uazapi_instance_token || "",
        uazapi_base_url: i.uazapi_base_url || null,
        embed_visible_options: i.embed_visible_options as any || null,
        is_official_api: i.is_official_api || false,
      })));
    } catch {
      console.error("Error loading instances after password");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = () => {
    if (passwordInput === storedPassword) {
      setPasswordRequired(false);
      setPasswordError(false);
      loadInstancesAfterPassword();
    } else {
      setPasswordError(true);
    }
  };

  useEffect(() => {
    fetchData();
  }, [embedToken]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isIframe ? "bg-transparent" : "bg-background"}`}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isIframe ? "bg-transparent" : "bg-background"}`}>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (passwordRequired) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isIframe ? "bg-transparent" : "bg-background"}`}>
        <div className="w-full max-w-sm p-6 space-y-4 text-center">
          <Lock className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Acesso protegido</h2>
          <p className="text-sm text-muted-foreground">Digite a senha para acessar as instâncias.</p>
          <form onSubmit={(e) => { e.preventDefault(); handlePasswordSubmit(); }} className="space-y-3">
            <Input
              type="password"
              placeholder="Senha"
              value={passwordInput}
              onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }}
              className={passwordError ? "border-destructive" : ""}
              autoFocus
            />
            {passwordError && <p className="text-sm text-destructive">Senha incorreta</p>}
            <Button type="submit" className="w-full">Entrar</Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isIframe ? "bg-transparent p-2" : "bg-background p-6"}`}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            {!isIframe && subaccount && (
              <h1 className="text-xl font-semibold text-foreground">
                {subaccount.account_name}
              </h1>
            )}
            <p className="text-sm text-muted-foreground">
              {instances.length} instância{instances.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="border-border"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Instances Grid */}
        {instances.length === 0 ? (
          <div className="text-center py-12">
            <Smartphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhuma instância encontrada</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {instances.map((instance) => (
              <EmbedInstanceCard
                key={instance.id}
                instance={instance}
                subaccountId={subaccount!.id}
                embedToken={embedToken!}
                locationId={subaccount!.location_id}
                trackId={trackId}
                onStatusChange={handleRefresh}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
