import { useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

export default function Documentation() {
  useEffect(() => {
    window.open("https://docs.uazapi.com/", "_blank");
  }, []);

  return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] gap-4">
        <p className="text-muted-foreground text-sm">
          A documentação foi aberta em uma nova aba.
        </p>
        <a
          href="https://docs.uazapi.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline text-sm"
        >
          Clique aqui caso não tenha aberto
        </a>
      </div>
    </DashboardLayout>
  );
}
