import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

const OAuthCallback = () => {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Captura os parâmetros OAuth do GHL
    const code = searchParams.get("code");
    const locationId = searchParams.get("locationId");
    const companyId = searchParams.get("companyId");
    const stateFromUrl = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    // Se o provedor retornou erro, não redirecionar para o backend.
    if (error) {
      console.warn("OAuth error received:", { error, errorDescription });
      return;
    }

    // Se o usuário acessar /oauth/callback manualmente (sem parâmetros),
    // não devemos redirecionar para a função do backend.
    if (!code) return;

    // Recupera state do localStorage caso o provedor não o tenha retornado.
    // Isso reduz falhas do tipo "Missing user context in state".
    const state =
      stateFromUrl ||
      (typeof window !== "undefined" ? localStorage.getItem("ghl_oauth_state") : null);

    // Redireciona para a Edge Function com todos os parâmetros
    const edgeFunctionUrl = new URL(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth-callback`
    );

    if (code) edgeFunctionUrl.searchParams.set("code", code);
    if (locationId) edgeFunctionUrl.searchParams.set("locationId", locationId);
    if (companyId) edgeFunctionUrl.searchParams.set("companyId", companyId);
    if (state) edgeFunctionUrl.searchParams.set("state", state);

    // Redireciona imediatamente
    window.location.href = edgeFunctionUrl.toString();
  }, [searchParams]);

  const hasCode = !!searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const hasAnyParams = [...searchParams.keys()].length > 0;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        {hasCode && !error ? (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Processando autenticação...</p>
          </>
        ) : error ? (
          <>
            <h1 className="text-lg font-semibold text-foreground">Falha na instalação OAuth</h1>
            <p className="text-muted-foreground mt-2 max-w-md">
              O provedor retornou um erro ao tentar autorizar o app.
            </p>
            <div className="mt-4 text-left max-w-xl mx-auto">
              <div className="rounded-md border border-border bg-card p-3 text-xs text-muted-foreground break-all">
                <div>
                  <strong className="text-foreground">error:</strong> {error}
                </div>
                {errorDescription && (
                  <div className="mt-1">
                    <strong className="text-foreground">error_description:</strong> {errorDescription}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-foreground">Callback OAuth</h1>
            <p className="text-muted-foreground mt-2 max-w-md">
              Esta URL é usada apenas como retorno do GoHighLevel. Para testar, inicie a
              instalação pelo Marketplace para que os parâmetros (ex: <code>code</code>) sejam
              enviados.
            </p>

            {hasAnyParams && (
              <div className="mt-4 text-left max-w-xl mx-auto">
                <p className="text-xs text-muted-foreground mb-2">
                  Diagnóstico (parâmetros recebidos):
                </p>
                <div className="rounded-md border border-border bg-card p-3 text-xs text-muted-foreground break-all">
                  {Array.from(searchParams.entries()).map(([k, v]) => (
                    <div key={`${k}-${v}`} className="flex gap-2">
                      <span className="min-w-[110px] text-foreground font-medium">{k}</span>
                      <span>{v || "(vazio)"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default OAuthCallback;
