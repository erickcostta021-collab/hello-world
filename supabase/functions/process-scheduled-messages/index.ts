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

    // Helper: clean up scheduled media file when campaign is done
    const cleanupScheduledMedia = async (msgId: string, mediaUrl: string | null) => {
      if (mediaUrl && mediaUrl.includes("media.bridgeapi.chat/scheduled/")) {
        try {
          const path = mediaUrl.replace("https://media.bridgeapi.chat/", "");
          await supabase.storage.from("command-uploads").remove([path]);
          console.log(`[process-scheduled] 🗑️ Cleaned up scheduled media: ${path}`);
        } catch (e) {
          console.error("[process-scheduled] Failed to cleanup scheduled media:", e);
        }
      }
    };

    let processed = 0;
    let failed = 0;

    // Process in parallel batches of 5 for better throughput
    const BATCH_SIZE = 5;
    for (let i = 0; i < pendingMessages.length; i += BATCH_SIZE) {
      const batch = pendingMessages.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(async (msg) => {
        const inst = (msg as any).instances;
        let baseUrl = inst.uazapi_base_url?.replace(/\/+$/, "");

        if (!baseUrl) {
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
          return "failed";
        }

        let endpoint = "/send/text";
        let sendBody: Record<string, unknown> = { number: msg.group_jid };
        let text = msg.message_text.replace(/^@todos[\n ]?/, "").trim();

        if (msg.mention_all) {
          sendBody.mentions = "all";
        }

        let effectiveMediaUrl = msg.media_url;
        if (msg.media_url && msg.is_recurring && msg.media_url.includes("media.bridgeapi.chat/uploads/")) {
          try {
            const originalPath = msg.media_url.replace("https://media.bridgeapi.chat/", "");
            const ext = originalPath.split(".").pop() || "bin";
            const scheduledPath = `scheduled/${msg.id}.${ext}`;
            const { data: fileData } = await supabase.storage.from("command-uploads").download(originalPath);
            if (fileData) {
              const arrayBuffer = await fileData.arrayBuffer();
              await supabase.storage.from("command-uploads").upload(scheduledPath, arrayBuffer, { contentType: fileData.type || "application/octet-stream", upsert: true });
              const newMediaUrl = `https://media.bridgeapi.chat/${scheduledPath}`;
              await supabase.from("scheduled_group_messages").update({ media_url: newMediaUrl }).eq("id", msg.id);
              effectiveMediaUrl = newMediaUrl;
            }
          } catch (copyErr) {
            console.error("[process-scheduled] Failed to copy media to scheduled/:", copyErr);
          }
        }

        if (effectiveMediaUrl && msg.media_type) {
          if (msg.media_type === "audio") {
            endpoint = "/send/audio";
            sendBody.url = effectiveMediaUrl;
            sendBody.file = effectiveMediaUrl;
            if (text) sendBody.text = text;
          } else {
            endpoint = "/send/media";
            sendBody.url = effectiveMediaUrl;
            sendBody.file = effectiveMediaUrl;
            sendBody.type = msg.media_type === "document" ? "document" : msg.media_type;
            if (text) { sendBody.caption = text; sendBody.text = text; }
          }
        } else {
          sendBody.text = text;
        }

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
          return "failed";
        }

        const newCount = (msg.execution_count || 0) + 1;

        if (msg.is_recurring && msg.recurring_interval) {
          const reachedMaxExec = msg.max_executions && newCount >= msg.max_executions;
          const pastEndDate = msg.end_date && new Date(msg.end_date) <= new Date();

          if (!reachedMaxExec && !pastEndDate) {
            const nextDate = new Date(msg.scheduled_for);
            const sendTime = msg.send_time || null;

            switch (msg.recurring_interval) {
              case "daily":
                nextDate.setDate(nextDate.getDate() + 1);
                break;
              case "weekly": {
                const weekdays: number[] = msg.weekdays || [];
                if (weekdays.length > 0) {
                  const currentDay = nextDate.getDay();
                  const sorted = [...weekdays].sort();
                  let nextDay = sorted.find((d: number) => d > currentDay);
                  if (nextDay === undefined) {
                    nextDay = sorted[0];
                    nextDate.setDate(nextDate.getDate() + (7 - currentDay + nextDay));
                  } else {
                    nextDate.setDate(nextDate.getDate() + (nextDay - currentDay));
                  }
                } else {
                  nextDate.setDate(nextDate.getDate() + 7);
                }
                break;
              }
              case "monthly":
                nextDate.setMonth(nextDate.getMonth() + 1);
                if (msg.day_of_month) nextDate.setDate(msg.day_of_month);
                break;
            }

            if (sendTime) {
              const [h, m] = sendTime.split(":").map(Number);
              nextDate.setHours(h, m, 0, 0);
            }

            if (!msg.end_date || nextDate <= new Date(msg.end_date)) {
              await supabase.from("scheduled_group_messages").update({
                status: "pending", scheduled_for: nextDate.toISOString(),
                execution_count: newCount, sent_at: new Date().toISOString(), last_error: null,
              }).eq("id", msg.id);
            } else {
              await supabase.from("scheduled_group_messages").update({
                status: "sent", sent_at: new Date().toISOString(), execution_count: newCount,
              }).eq("id", msg.id);
              await cleanupScheduledMedia(msg.id, effectiveMediaUrl);
            }
          } else {
            await supabase.from("scheduled_group_messages").update({
              status: "sent", sent_at: new Date().toISOString(), execution_count: newCount,
            }).eq("id", msg.id);
            await cleanupScheduledMedia(msg.id, effectiveMediaUrl);
          }
        } else {
          await supabase.from("scheduled_group_messages").update({
            status: "sent", sent_at: new Date().toISOString(), execution_count: newCount,
          }).eq("id", msg.id);
          await cleanupScheduledMedia(msg.id, effectiveMediaUrl);
        }

        return "sent";
      }));

      for (const r of results) {
        if (r.status === "fulfilled" && r.value === "sent") processed++;
        else failed++;
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
