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

    // Extract user from auth header
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);

    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    const body = await req.json();
    const { action, instanceId, messageId } = body;

    if (!instanceId) {
      return new Response(JSON.stringify({ error: "instanceId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the instance exists AND belongs to the user
    const { data: inst, error: instErr } = await supabase
      .from("instances")
      .select("id, user_id")
      .eq("id", instanceId)
      .maybeSingle();

    if (instErr || !inst) {
      return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (inst.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const { data, error } = await supabase
        .from("scheduled_group_messages")
        .select("*")
        .eq("instance_id", instanceId)
        .eq("user_id", userId)
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
        .eq("instance_id", instanceId)
        .eq("user_id", userId);

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
        .eq("instance_id", instanceId)
        .eq("user_id", userId);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "clear-history") {
      // Only clear non-recurring sent/failed/cancelled messages for THIS user
      const { error } = await supabase
        .from("scheduled_group_messages")
        .delete()
        .eq("instance_id", instanceId)
        .eq("user_id", userId)
        .eq("is_recurring", false)
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
