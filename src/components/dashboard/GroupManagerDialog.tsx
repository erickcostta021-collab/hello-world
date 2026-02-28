import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { Instance } from "@/hooks/useInstances";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Users,
  Search,
  Loader2,
  RefreshCw,
  Shield,
  Copy,
} from "lucide-react";

interface GroupManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: Instance;
}

interface GroupInfo {
  id: string;
  name: string;
  memberCount?: number;
  isAdmin?: boolean;
}

export function GroupManagerDialog({ open, onOpenChange, instance }: GroupManagerDialogProps) {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const isMobile = useIsMobile();

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("list-groups", {
        body: { instanceId: instance.id },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setGroups(data?.groups || []);
      toast.success(`${data?.groups?.length || 0} grupos encontrados`);
    } catch (err: any) {
      console.error("Failed to fetch groups:", err);
      toast.error(err.message || "Erro ao buscar grupos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchGroups();
    } else {
      setGroups([]);
      setSearchQuery("");
    }
  }, [open]);

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const adminCount = groups.filter((g) => g.isAdmin).length;

  const copyGroupId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast.success("ID do grupo copiado!");
  };

  const content = (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar grupos..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Stats */}
      {groups.length > 0 && (
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-card-foreground">
              {groups.length} Grupos Encontrados
            </p>
            <p className="text-xs text-muted-foreground">
              {adminCount} como administrador
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-8 w-8"
            onClick={fetchGroups}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Buscando grupos...</span>
        </div>
      )}

      {/* Groups Grid */}
      {!loading && filteredGroups.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredGroups.map((group) => (
            <Card
              key={group.id}
              className="bg-card/60 border-border/50 hover:border-primary/40 transition-all cursor-pointer"
              onClick={() => copyGroupId(group.id)}
              title="Clique para copiar o ID do grupo"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-medium text-card-foreground text-sm truncate">
                      {group.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {group.memberCount != null && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {group.memberCount} participantes
                        </div>
                      )}
                      {group.isAdmin && (
                        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30">
                          <Shield className="h-2.5 w-2.5 mr-0.5" />
                          Admin
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Copy className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && groups.length === 0 && (
        <div className="text-center py-12">
          <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum grupo encontrado</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchGroups}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Buscar Grupos
          </Button>
        </div>
      )}

      {/* No results from search */}
      {!loading && groups.length > 0 && filteredGroups.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            Nenhum grupo corresponde à pesquisa "{searchQuery}"
          </p>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Gerenciador de Grupos
            </DrawerTitle>
          </DrawerHeader>
          <div className="p-4 pb-6 overflow-y-auto max-h-[70vh]">
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Gerenciador de Grupos
          </DialogTitle>
          <DialogDescription>
            Gerencie os grupos do WhatsApp de <strong>{instance.instance_name}</strong>
          </DialogDescription>
        </DialogHeader>
        <DialogBody>{content}</DialogBody>
      </DialogContent>
    </Dialog>
  );
}
