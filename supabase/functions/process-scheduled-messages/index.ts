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

        let text = msg.message_text;

        // If mention_all, fetch group participants and add mentions
        if (msg.mention_all) {
          try {
            console.log(`[process-scheduled] Fetching participants for mention_all, group: ${msg.group_jid}`);
            
            // Try multiple endpoints to get participants
            let phones: string[] = [];
            
            // Attempt 1: /group/info POST
            const groupRes = await fetch(`${baseUrl}/group/info`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "token": inst.uazapi_instance_token },
              body: JSON.stringify({ groupjid: msg.group_jid, getInviteLink: false, force: false }),
            });
            
            console.log(`[process-scheduled] /group/info response status: ${groupRes.status}`);
            
            if (groupRes.ok) {
              const groupData = await groupRes.json();
              console.log(`[process-scheduled] /group/info keys: ${Object.keys(groupData).join(", ")}`);
              
              // Try all possible participant field names
              const rawParticipants = groupData?.Participants || groupData?.participants 
                || groupData?.members || groupData?.Members || [];
              
              console.log(`[process-scheduled] Raw participants count: ${rawParticipants.length}`);
              if (rawParticipants.length > 0) {
                console.log(`[process-scheduled] First participant sample: ${JSON.stringify(rawParticipants[0])}`);
              }
              
              phones = rawParticipants
                .map((p: any) => {
                  // UAZAPI participant format: { ID: "55...@s.whatsapp.net", ... } or { JID: "..." }
                  const jid = p.ID || p.id || p.JID || p.jid || p.PhoneNumber || p.phoneNumber || p.participant || "";
                  return jid.replace(/@.*$/, "");
                })
                .filter((p: string) => p.length > 5);
            }
            
            // Attempt 2: If no participants found, try GET /group/list with the specific group
            if (phones.length === 0) {
              console.log(`[process-scheduled] Trying /group/list fallback`);
              const listRes = await fetch(`${baseUrl}/group/list?groupjid=${msg.group_jid}`, {
                headers: { "token": inst.uazapi_instance_token },
              });
              if (listRes.ok) {
                const listData = await listRes.json();
                const group = Array.isArray(listData) ? listData[0] : listData;
                const parts = group?.Participants || group?.participants || [];
                console.log(`[process-scheduled] /group/list participants: ${parts.length}`);
                if (parts.length > 0) {
                  console.log(`[process-scheduled] /group/list first participant: ${JSON.stringify(parts[0])}`);
                }
                phones = parts
                  .map((p: any) => {
                    const jid = p.ID || p.id || p.JID || p.jid || p.PhoneNumber || p.phoneNumber || "";
                    return jid.replace(/@.*$/, "");
                  })
                  .filter((p: string) => p.length > 5);
              }
            }
            
            if (phones.length > 0) {
              // UAZAPI format: mentions as comma-separated phone numbers
              sendBody.mentions = phones.join(",");
              sendBody.mentionsEveryOne = true;
              sendBody.mentionsEveryone = true;
              sendBody.mentionsAll = true;
              // Prepend @todos to text for visual display  
              text = `@todos\n${text}`;
              console.log(`[process-scheduled] ✅ Mentioning ${phones.length} participants`);
            } else {
              // No participants found - still send with mentionsEveryOne flag as fallback
              sendBody.mentionsEveryOne = true;
              sendBody.mentionsEveryone = true;
              sendBody.mentionsAll = true;
              text = `@todos\n${text}`;
              console.log("[process-scheduled] ⚠️ No participants found, using mentionsEveryOne flag");
            }
          } catch (mentionErr) {
            console.error("[process-scheduled] Failed to fetch participants for mention:", mentionErr);
            // Still try mentionsEveryOne flag
            sendBody.mentionsEveryOne = true;
            sendBody.mentionsEveryone = true;
            sendBody.mentionsAll = true;
            text = `@todos\n${text}`;
          }
        }

        // Handle media persistence for recurring messages
        let effectiveMediaUrl = msg.media_url;
        if (msg.media_url && msg.is_recurring && msg.media_url.includes("media.bridgeapi.chat/uploads/")) {
          try {
            // Extract the original file path from the URL
            const originalPath = msg.media_url.replace("https://media.bridgeapi.chat/", "");
            const ext = originalPath.split(".").pop() || "bin";
            const scheduledPath = `scheduled/${msg.id}.${ext}`;

            // Copy the file from uploads/ to scheduled/ so the 24h cleanup won't delete it
            const { data: fileData } = await supabase.storage
              .from("command-uploads")
              .download(originalPath);

            if (fileData) {
              const arrayBuffer = await fileData.arrayBuffer();
              await supabase.storage
                .from("command-uploads")
                .upload(scheduledPath, arrayBuffer, { contentType: fileData.type || "application/octet-stream", upsert: true });

              const newMediaUrl = `https://media.bridgeapi.chat/${scheduledPath}`;
              // Update the record so future executions use the persistent URL
              await supabase.from("scheduled_group_messages").update({ media_url: newMediaUrl }).eq("id", msg.id);
              effectiveMediaUrl = newMediaUrl;
              console.log(`[process-scheduled] ✅ Copied media to persistent path: ${scheduledPath}`);
            }
          } catch (copyErr) {
            console.error("[process-scheduled] Failed to copy media to scheduled/:", copyErr);
            // Continue with original URL - it may still work if not yet cleaned
          }
        }

        if (effectiveMediaUrl && msg.media_type) {
          // Send media message
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
              await cleanupScheduledMedia(msg.id, effectiveMediaUrl);
            }
          } else {
            // Reached limits, mark as sent (finished)
            await supabase.from("scheduled_group_messages").update({
              status: "sent",
              sent_at: new Date().toISOString(),
              execution_count: newCount,
            }).eq("id", msg.id);
            await cleanupScheduledMedia(msg.id, effectiveMediaUrl);
          }
        } else {
          // Non-recurring: just mark as sent
          await supabase.from("scheduled_group_messages").update({
            status: "sent",
            sent_at: new Date().toISOString(),
            execution_count: newCount,
          }).eq("id", msg.id);
          await cleanupScheduledMedia(msg.id, effectiveMediaUrl);
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
