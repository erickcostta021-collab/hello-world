import { useEffect, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

// Sections to hide from the sidebar (CSS selectors injected into iframe)
const HIDDEN_SECTIONS = ["Monitor de Eventos", "Admininstração"];

export default function Documentation() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Attempt to hide sections and rebrand after iframe loads
  // Note: This only works if the iframe is same-origin or CORS allows it
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;

        // Hide unwanted sections
        const allElements = doc.querySelectorAll("*");
        allElements.forEach((el) => {
          const text = el.textContent?.trim();
          if (text && HIDDEN_SECTIONS.includes(text) && el.closest("a, button, li, div[class]")) {
            const parent = el.closest("li, div[class], a") || el;
            (parent as HTMLElement).style.display = "none";
          }
        });

        // Replace uazapi with bridgeapi
        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (node.nodeValue && /uazapi/i.test(node.nodeValue)) {
            node.nodeValue = node.nodeValue.replace(/uazapiGO/gi, "BridgeAPI").replace(/uazapi/gi, "BridgeAPI");
          }
        }

        // Replace in title
        if (doc.title) {
          doc.title = doc.title.replace(/uazapi/gi, "BridgeAPI");
        }
      } catch {
        // Cross-origin restriction — iframe content cannot be modified
        console.info("Documentation iframe is cross-origin; branding overlay applied instead.");
      }
    };

    iframe.addEventListener("load", handleLoad);
    return () => iframe.removeEventListener("load", handleLoad);
  }, []);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)] w-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Documentação da API</h1>
            <p className="text-xs text-muted-foreground">
              Referência completa dos endpoints da BridgeAPI
            </p>
          </div>
        </div>
        <div className="flex-1 relative">
          <iframe
            ref={iframeRef}
            src="https://docs.uazapi.com/"
            className="w-full h-full border-0"
            title="Documentação BridgeAPI"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
