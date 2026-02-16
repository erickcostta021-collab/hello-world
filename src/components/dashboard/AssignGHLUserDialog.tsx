import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, User, RefreshCw } from "lucide-react";
import { useGHLUsers, GHLUser } from "@/hooks/useGHLUsers";
import { toast } from "sonner";

interface Subaccount {
  id: string;
  location_id: string;
  ghl_access_token: string | null;
  ghl_token_expires_at: string | null;
  user_id: string;
}

interface AssignGHLUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceName: string;
  currentUserId: string | null;
  subaccount: Subaccount | null;
  onAssign: (userId: string | null) => void;
  isAssigning: boolean;
}

export function AssignGHLUserDialog({
  open,
  onOpenChange,
  instanceName,
  currentUserId,
  subaccount,
  onAssign,
  isAssigning,
}: AssignGHLUserDialogProps) {
  const [ghlUsers, setGhlUsers] = useState<GHLUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>(currentUserId || "none");
  const { fetchLocationUsers, loading: fetchingUsers } = useGHLUsers();

  useEffect(() => {
    if (open && subaccount?.ghl_access_token) {
      loadUsers();
    }
    if (open) {
      setSelectedUserId(currentUserId || "none");
    }
  }, [open, subaccount, currentUserId]);

  const loadUsers = async () => {
    if (!subaccount?.ghl_access_token) {
      toast.error("App não instalado - instale o app na subconta primeiro");
      return;
    }

    setLoadingUsers(true);
    try {
      const users = await fetchLocationUsers(
        subaccount.location_id,
        subaccount.ghl_access_token,
        {
          subaccountUserId: subaccount.user_id,
          tokenExpiresAt: subaccount.ghl_token_expires_at,
        }
      );
      setGhlUsers(users);
    } catch (error: any) {
      toast.error("Erro ao carregar usuários: " + error.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleAssign = () => {
    const userId = selectedUserId === "none" ? null : selectedUserId;
    onAssign(userId);
  };

  const selectedUser = ghlUsers.find(u => u.id === selectedUserId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-card-foreground flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Atribuir Usuário GHL
          </DialogTitle>
          <DialogDescription>
            Vincule um usuário do GoHighLevel à instância "{instanceName}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!subaccount?.ghl_access_token ? (
            <div className="text-center py-4 text-amber-400">
              Instale o app na subconta primeiro (via OAuth) para carregar os usuários
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Label>Usuário GHL</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadUsers}
                  disabled={loadingUsers || fetchingUsers}
                >
                  <RefreshCw className={`h-4 w-4 ${loadingUsers ? "animate-spin" : ""}`} />
                </Button>
              </div>

              {loadingUsers ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Selecione um usuário" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground">Nenhum usuário</span>
                    </SelectItem>
                    {ghlUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        <div className="flex flex-col">
                          <span>{user.name}</span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {selectedUser && (
                <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                  <p className="text-sm font-medium">{selectedUser.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
                  {selectedUser.phone && (
                    <p className="text-xs text-muted-foreground">{selectedUser.phone}</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)} 
            className="border-border"
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleAssign} 
            disabled={isAssigning || !subaccount?.ghl_access_token}
          >
            {isAssigning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
