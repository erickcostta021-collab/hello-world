import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find pending messages that are due
    const { data: pendingMessages, error: fetchError } = await supabase
      .from("scheduled_group_messages")
      .select("*, instances!inner(uazapi_instance_token, uazapi_base_url, instance_name, user_id)")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(50);

    if (fetchError) {
      console.error("Error fetching scheduled messages:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!pendingMessages || pendingMessages.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[process-scheduled] Found ${pendingMessages.length} pending messages`);

    let processed = 0;
    let failed = 0;

    for (const msg of pendingMessages) {
      const inst = (msg as any).instances;
      let baseUrl = inst.uazapi_base_url?.replace(/\/+$/, "");

      if (!baseUrl) {
        // Fallback to user settings
        const { data: settings } = await supabase
          .from("user_settings")
          .select("uazapi_base_url")
          .eq("user_id", inst.user_id)
          .limit(1);
        baseUrl = settings?.[0]?.uazapi_base_url?.replace(/\/+$/, "");
      }

      if (!baseUrl) {
        await supabase.from("scheduled_group_messages").update({
          status: "failed", last_error: "Base URL não configurada",
        }).eq("id", msg.id);
        failed++;
        continue;
      }

      try {
        let endpoint = "/send/text";
        let sendBody: Record<string, unknown> = {
          number: msg.group_jid,
        };

        // If mention_all, prepend @todos
        const text = msg.mention_all ? `@todos\n${msg.message_text}` : msg.message_text;

        if (msg.media_url && msg.media_type) {
          // Send media message
          if (msg.media_type === "audio") {
            endpoint = "/send/audio";
            sendBody.url = msg.media_url;
            if (text) sendBody.text = text;
          } else {
            endpoint = "/send/media";
            sendBody.url = msg.media_url;
            sendBody.type = msg.media_type === "document" ? "document" : msg.media_type;
            if (text) sendBody.caption = text;
          }
        } else {
          sendBody.text = text;
        }

        console.log(`[process-scheduled] Sending to ${msg.group_jid} via ${endpoint}`);

        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "token": inst.uazapi_instance_token },
          body: JSON.stringify(sendBody),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`[process-scheduled] Send failed (${response.status}):`, errText);
          await supabase.from("scheduled_group_messages").update({
            status: "failed", last_error: `HTTP ${response.status}: ${errText.substring(0, 200)}`,
          }).eq("id", msg.id);
          failed++;
          continue;
        }

        // Mark as sent
        await supabase.from("scheduled_group_messages").update({
          status: "sent", sent_at: new Date().toISOString(),
        }).eq("id", msg.id);

        // If recurring, create next occurrence
        if (msg.is_recurring && msg.recurring_interval) {
          const nextDate = new Date(msg.scheduled_for);
          switch (msg.recurring_interval) {
            case "daily": nextDate.setDate(nextDate.getDate() + 1); break;
            case "weekly": nextDate.setDate(nextDate.getDate() + 7); break;
            case "monthly": nextDate.setMonth(nextDate.getMonth() + 1); break;
          }

          await supabase.from("scheduled_group_messages").insert({
            user_id: msg.user_id,
            instance_id: msg.instance_id,
            group_jid: msg.group_jid,
            group_name: msg.group_name,
            message_text: msg.message_text,
            mention_all: msg.mention_all,
            media_url: msg.media_url,
            media_type: msg.media_type,
            scheduled_for: nextDate.toISOString(),
            is_recurring: true,
            recurring_interval: msg.recurring_interval,
            status: "pending",
          });
        }

        processed++;
      } catch (e) {
        console.error(`[process-scheduled] Error processing message ${msg.id}:`, e);
        await supabase.from("scheduled_group_messages").update({
          status: "failed", last_error: e instanceof Error ? e.message : "Unknown error",
        }).eq("id", msg.id);
        failed++;
      }
    }

    console.log(`[process-scheduled] Done: ${processed} sent, ${failed} failed`);
    return new Response(JSON.stringify({ processed, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[process-scheduled] Fatal error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
