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
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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
  Plus,
  CalendarClock,
} from "lucide-react";
import { GroupDetailDialog } from "./GroupDetailDialog";
import { CreateGroupDialog } from "./CreateGroupDialog";
import { ScheduledMessagesDialog } from "./ScheduledMessagesDialog";

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
  profilePicUrl?: string;
}

export function GroupManagerDialog({ open, onOpenChange, instance }: GroupManagerDialogProps) {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<GroupInfo | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [scheduledOpen, setScheduledOpen] = useState(false);
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

  const handleGroupClick = (group: GroupInfo) => {
    setSelectedGroup(group);
    setDetailOpen(true);
  };

  const handleGroupNameChanged = (groupId: string, newName: string) => {
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, name: newName } : g));
    if (selectedGroup?.id === groupId) {
      setSelectedGroup(prev => prev ? { ...prev, name: newName } : prev);
    }
  };

  const handleCreateGroup = () => {
    setCreateOpen(true);
  };

  const handleScheduledMessages = () => {
    setScheduledOpen(true);
  };

  const content = (
    <div className="flex flex-col gap-4">
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={handleCreateGroup}
          size="sm"
          className="bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white border-0"
        >
          <Plus className="h-4 w-4 mr-1" />
          Criar Grupo
        </Button>
        <Button
          onClick={handleScheduledMessages}
          size="sm"
          className="bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white border-0"
        >
          <CalendarClock className="h-4 w-4 mr-1" />
          Mensagens Programadas
        </Button>
        <Button
          onClick={fetchGroups}
          disabled={loading}
          size="sm"
          className="bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white border-0"
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Buscar Grupos
        </Button>
      </div>

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
              onClick={() => handleGroupClick(group)}
              title="Clique para ver detalhes do grupo"
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10 shrink-0 rounded-lg">
                    {group.profilePicUrl ? (
                      <AvatarImage src={group.profilePicUrl} alt={group.name} className="object-cover" />
                    ) : null}
                    <AvatarFallback className="rounded-lg bg-muted text-muted-foreground text-xs font-medium">
                      {group.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-medium text-card-foreground text-sm truncate">
                      {group.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {group.memberCount != null && group.memberCount > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {group.memberCount}
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

  const detailDialog = selectedGroup && (
    <GroupDetailDialog
      open={detailOpen}
      onOpenChange={setDetailOpen}
      instance={instance}
      groupId={selectedGroup.id}
      groupName={selectedGroup.name}
      onGroupNameChanged={handleGroupNameChanged}
    />
  );

  const createDialog = (
    <CreateGroupDialog
      open={createOpen}
      onOpenChange={setCreateOpen}
      instance={instance}
      onCreated={fetchGroups}
    />
  );

  const scheduledDialog = (
    <ScheduledMessagesDialog
      open={scheduledOpen}
      onOpenChange={setScheduledOpen}
    />
  );

  if (isMobile) {
    return (
      <>
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
        {detailDialog}
        {createDialog}
        {scheduledDialog}
      </>
    );
  }

  return (
    <>
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
      {detailDialog}
      {createDialog}
      {scheduledDialog}
    </>
  );
}
