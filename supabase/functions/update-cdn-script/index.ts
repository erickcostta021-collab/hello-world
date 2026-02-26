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
    const { slug, content, version } = await req.json();
    if (!slug || !content) {
      return new Response(JSON.stringify({ error: "slug and content required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if slug exists
    const { data: existing } = await supabase
      .from("cdn_scripts")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from("cdn_scripts")
        .update({ content, version: version || "v1.0", updated_at: new Date().toISOString() })
        .eq("slug", slug)
        .select("slug, version, is_active");
      if (error) throw error;
      result = { action: "updated", data };
    } else {
      const { data, error } = await supabase
        .from("cdn_scripts")
        .insert({ slug, content, version: version || "v1.0", is_active: true })
        .select("slug, version, is_active");
      if (error) throw error;
      result = { action: "inserted", data };
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
