import { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Loader2, Search, Users, Tag, Phone, UsersRound } from "lucide-react";

interface GhlContact {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  isGroup?: boolean;
  jid?: string;
}

interface ImportGhlContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subaccountId: string;
  onImport: (contacts: { phone: string; firstName?: string; lastName?: string; fullName?: string }[]) => void;
}

export function ImportGhlContactsDialog({
  open, onOpenChange, subaccountId, onImport,
}: ImportGhlContactsDialogProps) {
  const [contacts, setContacts] = useState<GhlContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [fetched, setFetched] = useState(false);
  const [hideGroups, setHideGroups] = useState(true);
  const [loadProgress, setLoadProgress] = useState("");

  useEffect(() => {
    if (!open) {
      setContacts([]);
      setSelectedIds(new Set());
      setSearchQuery("");
      setTagFilter("");
      setFetched(false);
      setHideGroups(true);
      setLoadingMore(false);
      setLoadProgress("");
    }
  }, [open]);

  const dedup = (list: GhlContact[]) => {
    const seen = new Set<string>();
    return list.filter((c) => {
      const key = (c.phone || c.jid || c.id).replace(/\D/g, "") || c.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const fetchContacts = async (query?: string) => {
    setLoading(true);
    setContacts([]);
    setFetched(false);
    try {
      let startAfterId: string | null = null;
      let page = 0;
      const maxPages = 50;

      // First page
      const body: Record<string, unknown> = { subaccountId, limit: 100 };
      if (query) body.query = query;

      const { data, error } = await supabase.functions.invoke("list-ghl-contacts", { body });
      if (error) throw new Error(error.message || "Erro ao buscar contatos");
      if (data?.error) throw new Error(data.error);

      const firstBatch = (data?.contacts || []).filter((c: GhlContact) => c.phone || c.jid);
      const unique = dedup(firstBatch);
      setContacts(unique);
      setFetched(true);
      setLoading(false);

      startAfterId = data?.startAfterId || null;
      page = 1;

      if (!startAfterId) {
        if (unique.length === 0) toast.info("Nenhum contato com telefone encontrado.");
        return;
      }

      // Remaining pages in background
      setLoadingMore(true);
      let allContacts = [...unique];

      while (startAfterId && page < maxPages) {
        setLoadProgress(`Carregando página ${page + 1}... (${allContacts.length} contatos)`);
        const nextBody: Record<string, unknown> = { subaccountId, limit: 100, startAfterId };
        if (query) nextBody.query = query;

        const { data: nextData, error: nextErr } = await supabase.functions.invoke("list-ghl-contacts", { body: nextBody });
        if (nextErr || nextData?.error) break;

        const batch = (nextData?.contacts || []).filter((c: GhlContact) => c.phone || c.jid);
        allContacts = dedup([...allContacts, ...batch]);
        setContacts(allContacts);

        startAfterId = nextData?.startAfterId || null;
        page++;
      }

      setLoadingMore(false);
      setLoadProgress("");

      if (allContacts.length === 0) {
        toast.info("Nenhum contato com telefone encontrado.");
      }
    } catch (err: any) {
      console.error("GHL contacts error:", err);
      toast.error(err.message || "Erro ao buscar contatos do GHL.");
      setLoading(false);
      setLoadingMore(false);
      setLoadProgress("");
    }
  };

  const filteredContacts = useMemo(() => {
    let result = contacts;
    if (hideGroups) {
      result = result.filter((c) => !c.isGroup);
    }
    if (!searchQuery.trim()) return result;
    const q = searchQuery.toLowerCase();
    return result.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q)
    );
  }, [contacts, searchQuery, hideGroups]);

  const allSelected = filteredContacts.length > 0 && filteredContacts.every((c) => selectedIds.has(c.id));

  const toggleAll = () => {
    if (allSelected) {
      const newSet = new Set(selectedIds);
      filteredContacts.forEach((c) => newSet.delete(c.id));
      setSelectedIds(newSet);
    } else {
      const newSet = new Set(selectedIds);
      filteredContacts.forEach((c) => newSet.add(c.id));
      setSelectedIds(newSet);
    }
  };

  const toggleContact = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleImport = () => {
    const selected = contacts.filter((c) => selectedIds.has(c.id));
    if (selected.length === 0) {
      toast.error("Selecione pelo menos um contato.");
      return;
    }
    const mapped = selected.map((c) => ({
      phone: c.isGroup && c.jid ? c.jid : c.phone.replace(/\D/g, ""),
      firstName: c.firstName || undefined,
      lastName: c.lastName || undefined,
      fullName: c.name || undefined,
    }));
    onImport(mapped);
    onOpenChange(false);
    toast.success(`${mapped.length} contato(s) importados!`);
  };

  const handleFetchAll = () => {
    fetchContacts(tagFilter.trim() || undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Importar Contatos do GHL
          </DialogTitle>
          <DialogDescription>
            Busque contatos diretamente do GoHighLevel. Você pode filtrar por tag ou buscar todos.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {/* Tag filter */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm">
                <Tag className="h-4 w-4" /> Filtrar por Tag (opcional)
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Pesquisar tag..."
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>

            {/* Fetch button */}
            {!fetched && !loading && (
              <Button
                onClick={handleFetchAll}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0"
              >
                <Search className="h-4 w-4 mr-2" />
                {tagFilter.trim() ? "Buscar com filtro" : "Buscar todos"}
              </Button>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Buscando contatos...</span>
              </div>
            )}

            {/* Loading more indicator */}
            {loadingMore && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border/30">
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                <span className="text-xs text-muted-foreground">{loadProgress || "Carregando mais contatos..."}</span>
              </div>
            )}

            {/* Contact list */}
            {fetched && !loading && contacts.length > 0 && (
              <>
                {/* Search + Hide groups toggle */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar nos resultados..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Switch
                      id="hide-groups"
                      checked={hideGroups}
                      onCheckedChange={setHideGroups}
                    />
                    <Label htmlFor="hide-groups" className="text-xs whitespace-nowrap cursor-pointer">
                      <UsersRound className="h-3.5 w-3.5 inline mr-1" />
                      Ocultar grupos
                    </Label>
                  </div>
                </div>

                {/* Select all */}
                <div
                  className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/30 cursor-pointer"
                  onClick={toggleAll}
                >
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                  />
                  <span className="text-sm font-medium">
                    {allSelected ? "Desmarcar todos" : "Selecionar todos"} ({filteredContacts.length})
                  </span>
                  {selectedIds.size > 0 && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {selectedIds.size} selecionado(s)
                    </Badge>
                  )}
                </div>

                {/* Contacts */}
                <ScrollArea className="h-[300px]">
                  <div className="space-y-1 pr-3">
                    {filteredContacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="flex items-center gap-3 p-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => toggleContact(contact.id)}
                      >
                        <Checkbox
                          checked={selectedIds.has(contact.id)}
                          onCheckedChange={() => toggleContact(contact.id)}
                        />
                        {contact.isGroup ? (
                          <UsersRound className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        ) : (
                          <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="text-sm truncate block">
                            {contact.name || contact.phone}
                          </span>
                          {contact.name && (
                            <span className="text-xs text-muted-foreground">
                              {contact.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Tip */}
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <p className="text-xs text-amber-200/80">
                    <strong>💡 Dica:</strong> Os contatos importados incluem nome completo, primeiro nome e sobrenome automaticamente. Use as variáveis {"{name}"}, {"{firstName}"} e {"{lastName}"} nas mensagens!
                  </p>
                </div>
              </>
            )}

            {/* Empty state */}
            {fetched && !loading && contacts.length === 0 && (
              <div className="text-center py-8">
                <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum contato encontrado.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFetchAll}
                  className="mt-3"
                >
                  Tentar novamente
                </Button>
              </div>
            )}
          </div>
        </DialogBody>

        {/* Footer */}
        {fetched && contacts.length > 0 && !loading && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border/30 shrink-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleImport}
              disabled={selectedIds.size === 0}
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white border-0"
            >
              <Search className="h-4 w-4 mr-2" />
              Importar {selectedIds.size > 0 ? `(${selectedIds.size})` : "selecionados"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
