import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { slug, repoUrl } = await req.json();
    if (!slug || !repoUrl) {
      return new Response(JSON.stringify({ error: "slug and repoUrl required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the script content from the repo URL
    const res = await fetch(repoUrl);
    if (!res.ok) throw new Error(`Failed to fetch from ${repoUrl}: ${res.status}`);
    const content = await res.text();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("cdn_scripts")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("slug", slug)
      .select("slug, version, is_active");

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, contentLength: content.length, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
