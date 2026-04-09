import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRACE_PERIOD_DAYS = 3;

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ENFORCE-GRACE-PERIOD] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    logStep("Checking for expired grace periods");

    const gracePeriodCutoff = new Date();
    gracePeriodCutoff.setDate(gracePeriodCutoff.getDate() - GRACE_PERIOD_DAYS);

    // Find users with expired grace period (is_paused=false, paused_at set and expired)
    const { data: expiredProfiles, error: fetchError } = await supabaseAdmin
      .from("profiles")
      .select("user_id, email, paused_at, instance_limit")
      .eq("is_paused", false)
      .not("paused_at", "is", null)
      .lt("paused_at", gracePeriodCutoff.toISOString());

    if (fetchError) {
      logStep("Error fetching expired profiles", { error: fetchError.message });
      throw fetchError;
    }

    if (!expiredProfiles || expiredProfiles.length === 0) {
      logStep("No expired grace periods found");
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Found expired grace periods", { count: expiredProfiles.length });

    let processed = 0;

    for (const profile of expiredProfiles) {
      try {
        const limit = profile.instance_limit ?? 0;

        // Get all instances for this user
        const { data: instances, error: listError } = await supabaseAdmin
          .from("instances")
          .select("id, instance_status, phone")
          .eq("user_id", profile.user_id);

        if (listError) {
          logStep("Error listing instances", { userId: profile.user_id, error: listError.message });
          continue;
        }

        const totalInstances = instances?.length ?? 0;

        if (limit === 0) {
          // No active subscription — delete ALL instances and pause
          const { data: deleted } = await supabaseAdmin
            .from("instances")
            .delete()
            .eq("user_id", profile.user_id)
            .select("id");

          await supabaseAdmin
            .from("profiles")
            .update({ is_paused: true })
            .eq("user_id", profile.user_id);

          logStep("No subscription - all instances deleted, account paused", {
            userId: profile.user_id,
            email: profile.email,
            deleted: deleted?.length ?? 0,
          });
        } else if (totalInstances > limit) {
          // Has subscription but excess instances — trim excess
          const excess = totalInstances - limit;

          // Sort: disconnected first, then connecting, then connected
          // Within same status, prefer ones without a phone (empty)
          const sorted = (instances ?? []).sort((a, b) => {
            const statusOrder: Record<string, number> = {
              disconnected: 0,
              connecting: 1,
              connected: 2,
            };
            const aOrder = statusOrder[a.instance_status] ?? 0;
            const bOrder = statusOrder[b.instance_status] ?? 0;
            if (aOrder !== bOrder) return aOrder - bOrder;
            // Prefer deleting ones without a phone number (empty)
            const aEmpty = !a.phone ? 0 : 1;
            const bEmpty = !b.phone ? 0 : 1;
            return aEmpty - bEmpty;
          });

          const toDelete = sorted.slice(0, excess);
          const deleteIds = toDelete.map((i) => i.id);

          const { data: deleted } = await supabaseAdmin
            .from("instances")
            .delete()
            .in("id", deleteIds)
            .select("id");

          // Clear paused_at since we handled it
          await supabaseAdmin
            .from("profiles")
            .update({ paused_at: null })
            .eq("user_id", profile.user_id);

          logStep("Excess instances trimmed", {
            userId: profile.user_id,
            email: profile.email,
            limit,
            had: totalInstances,
            deleted: deleted?.length ?? 0,
            deletedIds: deleteIds,
          });
        } else {
          // Instances within limit — just clear paused_at
          await supabaseAdmin
            .from("profiles")
            .update({ paused_at: null })
            .eq("user_id", profile.user_id);

          logStep("Instances within limit, grace period cleared", {
            userId: profile.user_id,
            instances: totalInstances,
            limit,
          });
        }

        processed++;
      } catch (err) {
        logStep("Error processing user", { userId: profile.user_id, error: String(err) });
      }
    }

    logStep("Finished processing", { processed, total: expiredProfiles.length });

    return new Response(JSON.stringify({ processed, total: expiredProfiles.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
