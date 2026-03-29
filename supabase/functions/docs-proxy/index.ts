const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    // Forward path after the function name to docs.uazapi.com
    const pathMatch = url.pathname.match(/\/docs-proxy\/(.*)/);
    const targetPath = pathMatch?.[1] || "";
    const targetUrl = `https://docs.uazapi.com/${targetPath}${url.search}`;

    const resp = await fetch(targetUrl, {
      headers: {
        "User-Agent": req.headers.get("user-agent") || "Mozilla/5.0",
        "Accept": req.headers.get("accept") || "*/*",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });

    const contentType = resp.headers.get("content-type") || "";

    // Only transform HTML content
    if (contentType.includes("text/html")) {
      let html = await resp.text();

      // Replace branding
      html = html.replace(/uazapiGO\s*V2/gi, "BridgeAPI");
      html = html.replace(/uazapiGO/gi, "BridgeAPI");
      html = html.replace(/uazapi/gi, "BridgeAPI");

      // Inject CSS to hide unwanted sections and fix base URL for assets
      const hideCSS = `<style>
        /* Hide Monitor de Eventos and Administração sidebar items */
        [class*="sidebar"] a[href*="monitor"],
        [class*="sidebar"] a[href*="eventos"],
        [class*="sidebar"] a[href*="admin"] {
          display: none !important;
        }
      </style>
      <script>
        document.addEventListener('DOMContentLoaded', function() {
          function hideElements() {
            var allLinks = document.querySelectorAll('a, button, [role="treeitem"], [role="menuitem"], li, div');
            allLinks.forEach(function(el) {
              var text = el.textContent && el.textContent.trim();
              if (text === 'Monitor de Eventos' || text === 'Admininstração' || text === 'Administração') {
                var parent = el.closest('li') || el.closest('[role="treeitem"]') || el;
                parent.style.display = 'none';
              }
            });
          }
          hideElements();
          // Re-run after dynamic content loads
          var observer = new MutationObserver(function() { hideElements(); });
          observer.observe(document.body, { childList: true, subtree: true });
        });
      </script>`;

      // Insert before </head>
      html = html.replace("</head>", hideCSS + "</head>");

      return new Response(html, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    // For non-HTML (JS, CSS, images, etc.), proxy as-is
    const body = await resp.arrayBuffer();
    return new Response(body, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to proxy documentation" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
