import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, ChevronRight, Settings } from "lucide-react";
import { Subaccount } from "@/hooks/useSubaccounts";
import { useInstances } from "@/hooks/useInstances";
import { useNavigate } from "react-router-dom";

interface SubaccountCardProps {
  subaccount: Subaccount;
  onClick: () => void;
}

export const SubaccountCard = memo(function SubaccountCard({ subaccount, onClick }: SubaccountCardProps) {
  const { instances } = useInstances(subaccount.id);
  const navigate = useNavigate();

  const connectedCount = instances.filter(i => i.instance_status === "connected").length;
  const totalCount = instances.length;

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/subaccount/${subaccount.id}/settings`);
  };

  const isAppInstalled = !!subaccount.ghl_access_token;

  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5 bg-card border-border group"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg text-card-foreground line-clamp-1">
                {subaccount.account_name}
              </CardTitle>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                {subaccount.location_id}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSettingsClick}
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          {!isAppInstalled && (
            <Badge variant="outline" className="border-warning text-warning">
              App não instalado
            </Badge>
          )}
          {totalCount > 0 ? (
            <>
              <Badge
                variant={connectedCount > 0 ? "default" : "secondary"}
                className={connectedCount > 0 ? "bg-success text-success-foreground" : ""}
              >
                {connectedCount} conectada{connectedCount !== 1 ? "s" : ""}
              </Badge>
              {totalCount > connectedCount && (
                <Badge variant="outline" className="border-border text-muted-foreground">
                  {totalCount - connectedCount} offline
                </Badge>
              )}
            </>
          ) : isAppInstalled ? (
            <Badge variant="outline" className="border-border text-muted-foreground">
              Sem instâncias
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
});
