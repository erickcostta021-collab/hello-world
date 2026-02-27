import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { message, count = 5 } = await req.json();
    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Você é um especialista em copywriting para WhatsApp. Gere ${count} variações da mensagem fornecida pelo usuário.

REGRAS:
- Mantenha o mesmo significado e intenção
- Varie a estrutura, palavras e tom (formal, informal, amigável, direto)
- Use emojis de forma variada
- Mantenha os campos dinâmicos como {{primeiro_nome}}, {{nome}}, {{sobrenome}} intactos
- Cada variação deve parecer natural e única
- NÃO adicione saudações se a mensagem original não tiver
- Mantenha aproximadamente o mesmo tamanho

Retorne APENAS um JSON array com as variações, sem markdown, sem explicação. Exemplo:
["variação 1", "variação 2", "variação 3"]`,
          },
          { role: "user", content: message },
        ],
        temperature: 0.9,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido, tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("Erro no gateway de IA");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    // Parse the JSON array from the response
    let variations: string[];
    try {
      // Try to extract JSON array from potential markdown wrapping
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      variations = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      variations = [content];
    }

    return new Response(JSON.stringify({ variations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-message-variations error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
