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
            sendBody.file = msg.media_url;
            if (text) sendBody.text = text;
          } else {
          endpoint = "/send/media";
          sendBody.url = msg.media_url;
          sendBody.file = msg.media_url;
          sendBody.type = msg.media_type === "document" ? "document" : msg.media_type;
          if (text) {
            sendBody.caption = text;
            sendBody.text = text;
          }
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

        const newCount = (msg.execution_count || 0) + 1;

        // If recurring, check if we should schedule the next occurrence on the same row
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
                if (msg.day_of_month) {
                  nextDate.setDate(msg.day_of_month);
                }
                break;
            }

            if (sendTime) {
              const [h, m] = sendTime.split(":").map(Number);
              nextDate.setHours(h, m, 0, 0);
            }

            if (!msg.end_date || nextDate <= new Date(msg.end_date)) {
              // Reuse the same row: update to pending with next scheduled_for
              await supabase.from("scheduled_group_messages").update({
                status: "pending",
                scheduled_for: nextDate.toISOString(),
                execution_count: newCount,
                sent_at: new Date().toISOString(),
                last_error: null,
              }).eq("id", msg.id);
            } else {
              // No more occurrences, mark as sent (finished)
              await supabase.from("scheduled_group_messages").update({
                status: "sent",
                sent_at: new Date().toISOString(),
                execution_count: newCount,
              }).eq("id", msg.id);
            }
          } else {
            // Reached limits, mark as sent (finished)
            await supabase.from("scheduled_group_messages").update({
              status: "sent",
              sent_at: new Date().toISOString(),
              execution_count: newCount,
            }).eq("id", msg.id);
          }
        } else {
          // Non-recurring: just mark as sent
          await supabase.from("scheduled_group_messages").update({
            status: "sent",
            sent_at: new Date().toISOString(),
            execution_count: newCount,
          }).eq("id", msg.id);
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
