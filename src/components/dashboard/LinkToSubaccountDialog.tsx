import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Link2 } from "lucide-react";
import { useInstances, Instance } from "@/hooks/useInstances";
import { useSubaccounts } from "@/hooks/useSubaccounts";

interface LinkToSubaccountDialogProps {
  instance: Instance;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LinkToSubaccountDialog({ instance, open, onOpenChange }: LinkToSubaccountDialogProps) {
  const [selectedSubaccountId, setSelectedSubaccountId] = useState<string>("");

  const { linkInstanceToSubaccount, canCreateInstance } = useInstances();
  const { subaccounts, isLoading: loadingSubaccounts } = useSubaccounts();

  const handleLink = () => {
    if (!selectedSubaccountId) return;

    linkInstanceToSubaccount.mutate(
      { instanceId: instance.id, subaccountId: selectedSubaccountId },
      {
        onSuccess: () => {
          onOpenChange(false);
          setSelectedSubaccountId("");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-card-foreground">
            Vincular a Subconta
          </DialogTitle>
          <DialogDescription>
            Vincule "{instance.instance_name}" a uma subconta do GoHighLevel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Selecione a Subconta</Label>
            <Select
              value={selectedSubaccountId}
              onValueChange={setSelectedSubaccountId}
            >
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue placeholder="Selecione uma subconta" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {loadingSubaccounts ? (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : subaccounts.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">
                    Nenhuma subconta disponível
                  </div>
                ) : (
                  subaccounts.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.account_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {!canCreateInstance && (
            <p className="text-xs text-destructive">
              Limite de instâncias vinculadas atingido. Faça upgrade do seu plano.
            </p>
          )}

          <Button
            className="w-full bg-primary hover:bg-primary/90"
            onClick={handleLink}
            disabled={!selectedSubaccountId || linkInstanceToSubaccount.isPending || !canCreateInstance}
          >
            {linkInstanceToSubaccount.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            <Link2 className="h-4 w-4 mr-2" />
            Vincular à Subconta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
