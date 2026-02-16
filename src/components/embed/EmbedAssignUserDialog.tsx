import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw, User } from "lucide-react";
import { toast } from "sonner";
import { createEmbedSupabaseClient } from "@/hooks/useEmbedSupabase";

interface GHLUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role?: string;
}

interface EmbedAssignUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  instanceName: string;
  currentUserId: string | null;
  embedToken: string;
  locationId: string;
  onAssigned: (userId: string | null, userName: string | null) => void;
}

export function EmbedAssignUserDialog({
  open,
  onOpenChange,
  instanceId,
  instanceName,
  currentUserId,
  embedToken,
  locationId,
  onAssigned,
}: EmbedAssignUserDialogProps) {
  const [ghlUsers, setGhlUsers] = useState<GHLUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>(currentUserId || "none");
  const [saving, setSaving] = useState(false);
  const [hasToken, setHasToken] = useState(true);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      // Use server-side proxy to fetch GHL users - no tokens exposed to client
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/uazapi-proxy-embed`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embedToken, instanceId, action: "ghl-users", locationId }),
      });

      const data = await res.json().catch(() => ({}));
      
      if (data.error === "App não instalado na subconta") {
        setHasToken(false);
        setGhlUsers([]);
        return;
      }

      setHasToken(true);
      setGhlUsers(data.users || []);
    } catch (error) {
      console.error("Error fetching GHL users:", error);
      toast.error("Erro ao carregar usuários");
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (open) {
      setSelectedUserId(currentUserId || "none");
      fetchUsers();
    }
  }, [open, currentUserId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const userId = selectedUserId === "none" ? null : selectedUserId;
      const supabase = createEmbedSupabaseClient();
      
      const { error } = await supabase
        .from("instances")
        .update({ ghl_user_id: userId })
        .eq("id", instanceId);

      if (error) throw error;

      const selectedUser = ghlUsers.find(u => u.id === userId);
      onAssigned(userId, selectedUser?.name || null);
      toast.success("Usuário atribuído com sucesso!");
      onOpenChange(false);
    } catch (error) {
      console.error("Error assigning user:", error);
      toast.error("Erro ao atribuir usuário");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => onOpenChange(false)}>
      <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-card-foreground mb-2">
          Atribuir Usuário GHL
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Vincule um usuário do GoHighLevel à instância <strong>{instanceName}</strong>
        </p>

        {!hasToken ? (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg mb-4">
            <span className="text-sm text-destructive">App não instalado na subconta</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={loadingUsers}>
                <SelectTrigger className="flex-1 bg-secondary border-border">
                  <SelectValue placeholder="Selecione um usuário" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="none">
                    <span className="text-muted-foreground">Nenhum usuário</span>
                  </SelectItem>
                  {ghlUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3" />
                        <span>{user.name}</span>
                        <span className="text-xs text-muted-foreground">({user.email})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={fetchUsers}
                disabled={loadingUsers}
                className="border-border shrink-0"
              >
                <RefreshCw className={`h-4 w-4 ${loadingUsers ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {loadingUsers && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border">
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !hasToken}
            className="bg-primary hover:bg-primary/90"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}
