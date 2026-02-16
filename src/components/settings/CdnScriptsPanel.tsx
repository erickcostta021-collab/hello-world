import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle2, Circle, Loader2, Code, Copy, Shield, Download, ShieldCheck } from "lucide-react";

function getScriptUrl(slug: string, subdomain?: string | null): string {
  if (subdomain) return `https://${subdomain}/${slug}`;
  const lower = slug.toLowerCase();
  if (lower.includes("toolkit")) return `https://toolkit.bridgeapi.chat/${slug}`;
  if (lower.includes("recorder") || lower.includes("ghost") || lower.includes("bundle")) return `https://recorder.bridgeapi.chat/${slug}`;
  return `https://switch.bridgeapi.chat/${slug}`;
}

interface CdnScript {
  id: string;
  slug: string;
  version: string;
  content: string;
  content_type: string;
  subdomain: string | null;
  is_active: boolean;
  is_obfuscated: boolean;
  created_at: string;
  updated_at: string;
}

export function CdnScriptsPanel() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editScript, setEditScript] = useState<CdnScript | null>(null);
  const [obfuscatingId, setObfuscatingId] = useState<string | null>(null);
  const [form, setForm] = useState({ slug: "", version: "", content: "", content_type: "application/javascript", subdomain: "" });

  const { data: scripts, isLoading } = useQuery({
    queryKey: ["cdn-scripts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cdn_scripts")
        .select("*")
        .order("slug")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CdnScript[];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (script: Partial<CdnScript> & { id?: string }) => {
      if (script.id) {
        const { error } = await supabase.from("cdn_scripts").update({
          slug: script.slug,
          version: script.version,
          content: script.content,
          content_type: script.content_type,
          subdomain: script.subdomain || null,
          is_obfuscated: false,
        }).eq("id", script.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cdn_scripts").insert({
          slug: script.slug!,
          version: script.version!,
          content: script.content!,
          content_type: script.content_type!,
          subdomain: (script as any).subdomain || null,
          is_active: true,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cdn-scripts"] });
      toast.success(editScript ? "Script atualizado!" : "Script criado!");
      resetForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cdn_scripts").update({ is_active: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cdn-scripts"] });
      toast.success("Versão ativada!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cdn_scripts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cdn-scripts"] });
      toast.success("Script removido!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const obfuscateMutation = useMutation({
    mutationFn: async (id: string) => {
      setObfuscatingId(id);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/obfuscate-script`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ script_id: id }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao ofuscar");
      return json;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["cdn-scripts"] });
      toast.success(`Ofuscado! ${data.original_size} → ${data.obfuscated_size} bytes`);
      setObfuscatingId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setObfuscatingId(null);
    },
  });

  const resetForm = () => {
    setForm({ slug: "", version: "", content: "", content_type: "application/javascript", subdomain: "" });
    setEditScript(null);
    setDialogOpen(false);
  };

  const openEdit = (script: CdnScript) => {
    setEditScript(script);
    setForm({ slug: script.slug, version: script.version, content: script.content, content_type: script.content_type, subdomain: script.subdomain || "" });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.slug || !form.version || !form.content) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    upsertMutation.mutate({ ...form, subdomain: form.subdomain || null, id: editScript?.id });
  };

  // Group scripts by slug
  const grouped = (scripts || []).reduce<Record<string, CdnScript[]>>((acc, s) => {
    (acc[s.slug] = acc[s.slug] || []).push(s);
    return acc;
  }, {});

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-card-foreground flex items-center gap-2">
            <Code className="h-5 w-5" />
            CDN Scripts
          </CardTitle>
          <CardDescription>
            Gerencie scripts servidos via switch.bridgeapi.chat
          </CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-primary hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-1" /> Novo Script
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editScript ? "Editar Script" : "Novo Script CDN"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Slug (URL path)</Label>
                  <Input
                    placeholder="bridge-switcher"
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    className="bg-secondary border-border"
                  />
                  <p className="text-xs text-muted-foreground">
                    URL: <strong>{form.slug ? getScriptUrl(form.slug, form.subdomain || null) : "subdominio.bridgeapi.chat/slug"}</strong>
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Subdomínio</Label>
                  <Input
                    placeholder="presence.bridgeapi.chat"
                    value={form.subdomain}
                    onChange={(e) => setForm({ ...form, subdomain: e.target.value })}
                    className="bg-secondary border-border"
                  />
                  <p className="text-xs text-muted-foreground">
                    Deixe vazio para detectar automaticamente pelo slug
                  </p>
                  <Label>Versão</Label>
                  <Input
                    placeholder="v6.15"
                    value={form.version}
                    onChange={(e) => setForm({ ...form, version: e.target.value })}
                    className="bg-secondary border-border"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Content-Type</Label>
                <Input
                  value={form.content_type}
                  onChange={(e) => setForm({ ...form, content_type: e.target.value })}
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>Código JavaScript</Label>
                <Textarea
                  placeholder="// Cole o código do script aqui..."
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  className="bg-secondary border-border font-mono text-xs min-h-[300px]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetForm}>Cancelar</Button>
                <Button onClick={handleSubmit} disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editScript ? "Salvar" : "Criar e Ativar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum script cadastrado. Clique em "Novo Script" para começar.
          </p>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([slug, versions]) => (
              <div key={slug} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-foreground">/{slug}</h4>
                  <button
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => {
                      const url = getScriptUrl(slug, versions[0]?.subdomain);
                      navigator.clipboard.writeText(url);
                      toast.success("URL copiada!");
                    }}
                  >
                    <Copy className="h-3 w-3" />
                    {getScriptUrl(slug, versions[0]?.subdomain)}
                  </button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Versão</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Atualizado</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {versions.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-sm">{s.version}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {s.is_active ? (
                              <Badge variant="default" className="bg-green-600">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Ativa
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <Circle className="h-3 w-3 mr-1" /> Inativa
                              </Badge>
                            )}
                            {s.is_obfuscated && (
                              <Badge variant="outline" className="border-amber-500 text-amber-500">
                                <ShieldCheck className="h-3 w-3 mr-1" /> Ofuscado
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(s.updated_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const blob = new Blob([s.content], { type: s.content_type });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `${s.slug}-${s.version}.js`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                            Editar
                          </Button>
                          {s.is_obfuscated ? (
                            <Button variant="outline" size="sm" disabled className="opacity-50">
                              <ShieldCheck className="h-4 w-4 mr-1" />
                              Ofuscado
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (confirm("Ofuscar este script? O código original será substituído."))
                                  obfuscateMutation.mutate(s.id);
                              }}
                              disabled={obfuscatingId === s.id}
                            >
                              {obfuscatingId === s.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Shield className="h-4 w-4 mr-1" />
                              )}
                              Ofuscar
                            </Button>
                          )}
                          {!s.is_active && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => activateMutation.mutate(s.id)}
                              disabled={activateMutation.isPending}
                            >
                              Ativar
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm("Remover este script?")) deleteMutation.mutate(s.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
