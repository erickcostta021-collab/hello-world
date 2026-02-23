import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // List all files in the uploads folder
    const { data: files, error: listError } = await supabase.storage
      .from("command-uploads")
      .list("uploads", { limit: 1000 });

    if (listError) {
      return new Response(JSON.stringify({ error: listError.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!files || files.length === 0) {
      return new Response(JSON.stringify({ deleted: 0, message: "No files found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const toDelete: string[] = [];

    for (const file of files) {
      if (file.created_at) {
        const created = new Date(file.created_at);
        if (created < cutoff) {
          toDelete.push(`uploads/${file.name}`);
        }
      }
    }

    if (toDelete.length === 0) {
      return new Response(JSON.stringify({ deleted: 0, message: "No expired files" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: deleteError } = await supabase.storage
      .from("command-uploads")
      .remove(toDelete);

    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Cleanup: deleted ${toDelete.length} expired files`);

    return new Response(JSON.stringify({ deleted: toDelete.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
