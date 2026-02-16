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

    // Find all users who have paused_at set, is_paused = false, and grace period has expired
    const gracePeriodCutoff = new Date();
    gracePeriodCutoff.setDate(gracePeriodCutoff.getDate() - GRACE_PERIOD_DAYS);

    const { data: expiredProfiles, error: fetchError } = await supabaseAdmin
      .from("profiles")
      .select("user_id, email, paused_at")
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
        // 1. Unlink all instances from subaccounts for this user
        const { data: unlinked, error: unlinkError } = await supabaseAdmin
          .from("instances")
          .update({ subaccount_id: null })
          .eq("user_id", profile.user_id)
          .not("subaccount_id", "is", null)
          .select("id");

        if (unlinkError) {
          logStep("Error unlinking instances", { userId: profile.user_id, error: unlinkError.message });
          continue;
        }

        const unlinkedCount = unlinked?.length ?? 0;

        // 2. Set is_paused = true (fully paused)
        const { error: pauseError } = await supabaseAdmin
          .from("profiles")
          .update({ is_paused: true })
          .eq("user_id", profile.user_id);

        if (pauseError) {
          logStep("Error pausing user", { userId: profile.user_id, error: pauseError.message });
          continue;
        }

        logStep("Grace period expired - account paused and instances unlinked", {
          userId: profile.user_id,
          email: profile.email,
          instancesUnlinked: unlinkedCount,
        });

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
