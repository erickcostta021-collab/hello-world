import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

    const body = await req.json();
    const { action, instanceId, messageId } = body;

    if (!instanceId) {
      return new Response(JSON.stringify({ error: "instanceId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the instance exists
    const { data: inst, error: instErr } = await supabase
      .from("instances")
      .select("id")
      .eq("id", instanceId)
      .maybeSingle();

    if (instErr || !inst) {
      return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const { data, error } = await supabase
        .from("scheduled_group_messages")
        .select("*")
        .eq("instance_id", instanceId)
        .order("scheduled_for", { ascending: true });

      if (error) throw error;

      return new Response(JSON.stringify({ messages: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update" && messageId) {
      const { updates } = body;
      if (!updates) {
        return new Response(JSON.stringify({ error: "updates required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabase
        .from("scheduled_group_messages")
        .update(updates)
        .eq("id", messageId)
        .eq("instance_id", instanceId);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete" && messageId) {
      const { error } = await supabase
        .from("scheduled_group_messages")
        .delete()
        .eq("id", messageId)
        .eq("instance_id", instanceId);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "clear-history") {
      const { error } = await supabase
        .from("scheduled_group_messages")
        .delete()
        .eq("instance_id", instanceId)
        .in("status", ["sent", "failed", "cancelled"]);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
