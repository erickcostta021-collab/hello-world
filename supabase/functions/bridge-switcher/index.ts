import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Validate contactId to prevent saving preferences with placeholder values
  function isValidContactId(value: string | null): boolean {
    if (!value) return false;
    const v = value.trim();
    if (v.length < 10) return false;
    
    // Block known GHL placeholder values
    const blocked = new Set(['conversations', 'contacts', 'detail', 'inbox', 'chat']);
    if (blocked.has(v.toLowerCase())) return false;
    
    // Real IDs almost always have digits/underscores/hyphens, not pure alphabetic
    if (/^[a-zA-Z]+$/.test(v)) return false;
    
    return true;
  }

  // Helper to get lead phone from contact mapping
  async function getLeadPhone(contactId: string, locationId: string): Promise<string | null> {
    const { data } = await supabase
      .from("ghl_contact_phone_mapping")
      .select("original_phone")
      .eq("contact_id", contactId)
      .eq("location_id", locationId)
      .maybeSingle();
    return data?.original_phone || null;
  }

  // Helper to write/update contactId -> phone mapping (avoid UPSERT without a unique constraint)
  async function writeContactPhoneMapping(params: {
    contactId: string;
    locationId: string;
    originalPhone: string;
  }): Promise<void> {
    const { contactId, locationId, originalPhone } = params;
    const nowIso = new Date().toISOString();

    // Try update first (most common)
    const { data: updated, error: updateError } = await supabase
      .from("ghl_contact_phone_mapping")
      .update({ original_phone: originalPhone, updated_at: nowIso })
      .eq("contact_id", contactId)
      .eq("location_id", locationId)
      .select("id");

    if (updateError) {
      console.error("Error updating phone mapping:", updateError);
      return;
    }

    if (updated && updated.length > 0) return;

    // No row updated -> insert
    const { error: insertError } = await supabase
      .from("ghl_contact_phone_mapping")
      .insert({
        contact_id: contactId,
        location_id: locationId,
        original_phone: originalPhone,
        updated_at: nowIso,
      });

    if (insertError) {
      console.error("Error inserting phone mapping:", insertError);
    }
  }

  try {
    // GET: Recuperar preferência atual do contato
    if (req.method === "GET") {
      const url = new URL(req.url);
      const contactId = url.searchParams.get("contactId");
      const locationId = url.searchParams.get("locationId");
      const phone = url.searchParams.get("phone"); // New: direct phone parameter

      if (!locationId) {
        return new Response(
          JSON.stringify({ error: "locationId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Need at least contactId or phone
      if (!contactId && !phone) {
        return new Response(
          JSON.stringify({ activeInstanceId: null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("GET preference request:", { contactId, locationId, phone });

      let preference = null;

      // Priority 1: Direct phone lookup (most reliable)
      if (phone && phone.length >= 10) {
        const normalizedPhone = phone.replace(/\D/g, '');
        
        const { data, error } = await supabase
          .from("contact_instance_preferences")
          .select("instance_id")
          .eq("location_id", locationId)
          .or(`lead_phone.eq.${normalizedPhone},lead_phone.like.%${normalizedPhone.slice(-10)}`)
          .maybeSingle();

        if (error) {
          console.error("Error fetching preference by phone:", error);
        } else {
          preference = data;
        }
        
        console.log("Direct phone preference result:", { phone: normalizedPhone, instanceId: preference?.instance_id });
      }

      // Priority 2: ContactId lookup (fallback)
      if (!preference && contactId && isValidContactId(contactId)) {
        // Step 1: Get the lead's phone from contact mapping
        const leadPhone = await getLeadPhone(contactId, locationId);
        console.log("Lead phone lookup:", { contactId, leadPhone });

        if (leadPhone) {
          // Step 2: Query by lead_phone (works across all GHL contacts for the same lead)
          const { data, error } = await supabase
            .from("contact_instance_preferences")
            .select("instance_id")
            .eq("lead_phone", leadPhone)
            .eq("location_id", locationId)
            .maybeSingle();

          if (error) {
            console.error("Error fetching preference by lead_phone:", error);
          } else {
            preference = data;
          }
          
          console.log("Lead phone preference result:", { leadPhone, instanceId: preference?.instance_id });
        }

        // Fallback to contact_id if no lead_phone match
        if (!preference) {
          const { data, error } = await supabase
            .from("contact_instance_preferences")
            .select("instance_id")
            .eq("contact_id", contactId)
            .eq("location_id", locationId)
            .maybeSingle();

          if (error) {
            console.error("Error fetching preference by contact_id:", error);
          } else {
            preference = data;
          }
          
          console.log("Contact ID fallback result:", { contactId, instanceId: preference?.instance_id });
        }
      }

      return new Response(
        JSON.stringify({ activeInstanceId: preference?.instance_id || null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST: Salvar preferência de instância para o contato
    if (req.method === "POST") {
      const body = await req.json();
      const { instanceId, contactId, locationId, phone, conversationId, previousInstanceName, newInstanceName } = body;

      if (!instanceId || !locationId) {
        return new Response(
          JSON.stringify({ error: "instanceId and locationId are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Need at least contactId or phone
      if (!contactId && !phone) {
        return new Response(
          JSON.stringify({ error: "contactId or phone is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("POST save preference:", { contactId, instanceId, locationId, phone });

      // 1) Feed mapping table when phone is available in payload
      // This makes future lookups (contactId -> lead_phone) reliable.
      if (contactId && isValidContactId(contactId) && phone && phone.length >= 10) {
        const normalizedPhone = String(phone).replace(/\D/g, "");
        if (normalizedPhone.length >= 10) {
          console.log("🧩 Saving contactId->phone mapping:", {
            contactId,
            locationId,
            original_phone: normalizedPhone,
          });
          await writeContactPhoneMapping({
            contactId,
            locationId,
            originalPhone: normalizedPhone,
          });
        }
      }

      // Determine the lead phone to use
      let leadPhone: string | null = null;
      
      // Priority 1: Direct phone from request
      if (phone && phone.length >= 10) {
        leadPhone = phone.replace(/\D/g, ''); // Normalize to digits
      }
      
      // Priority 2: Get phone from contact mapping
      if (!leadPhone && contactId && isValidContactId(contactId)) {
        leadPhone = await getLeadPhone(contactId, locationId);
      }
      
      console.log("Resolved leadPhone:", leadPhone);

      const nowIso = new Date().toISOString();
      
      if (leadPhone) {
        // STRATEGY: First try to update existing record by phone, then insert if not found
        // This avoids upsert issues with composite keys
        
        const normalizedPhone = leadPhone.replace(/\D/g, '');
        const last10 = normalizedPhone.slice(-10);
        
        // Step 1: Check if a preference exists for this phone in this location
        const { data: existing } = await supabase
          .from("contact_instance_preferences")
          .select("id, contact_id, lead_phone")
          .eq("location_id", locationId)
          .or(`lead_phone.eq.${leadPhone},lead_phone.like.%${normalizedPhone},lead_phone.like.%${last10}%`)
          .limit(1);
        
        const existingPref = existing?.[0];
        
        if (existingPref) {
          // Step 2a: UPDATE existing record
          console.log("Updating existing preference:", existingPref.id);
          const { error: updateError } = await supabase
            .from("contact_instance_preferences")
            .update({
              instance_id: instanceId,
              contact_id: contactId || existingPref.contact_id, // Keep original if no new one
              lead_phone: leadPhone, // Normalize phone
              updated_at: nowIso,
            })
            .eq("id", existingPref.id);
          
          if (updateError) {
            console.error("Error updating preference:", updateError);
            return new Response(
              JSON.stringify({ success: false, error: updateError.message }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else {
          // Step 2b: INSERT new record
          console.log("Inserting new preference for phone:", leadPhone.slice(0, 15));
          const { error: insertError } = await supabase
            .from("contact_instance_preferences")
            .insert({
              contact_id: contactId || `phone_${leadPhone}`,
              location_id: locationId,
              instance_id: instanceId,
              lead_phone: leadPhone,
              updated_at: nowIso,
            });
          
          if (insertError) {
            console.error("Error inserting preference:", insertError);
            // Try fallback with contactId if available
            if (contactId && isValidContactId(contactId)) {
              const { error: fallbackError } = await supabase
                .from("contact_instance_preferences")
                .upsert(
                  {
                    contact_id: contactId,
                    location_id: locationId,
                    instance_id: instanceId,
                    updated_at: nowIso,
                  },
                  { onConflict: "contact_id,location_id" }
                );
              
              if (fallbackError) {
                console.error("Fallback error:", fallbackError);
                return new Response(
                  JSON.stringify({ success: false, error: fallbackError.message }),
                  { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
              }
            } else {
              return new Response(
                JSON.stringify({ success: false, error: insertError.message }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        }
      } else if (contactId && isValidContactId(contactId)) {
        // No phone available - use contact_id based upsert
        const { error } = await supabase
          .from("contact_instance_preferences")
          .upsert(
            {
              contact_id: contactId,
              location_id: locationId,
              instance_id: instanceId,
              updated_at: nowIso,
            },
            { onConflict: "contact_id,location_id" }
          );

        if (error) {
          console.error("Error saving preference by contactId:", error);
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ success: false, error: "No valid identifier to save preference" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Preference saved successfully:", { contactId, instanceId, leadPhone });

      // Create GHL InternalComment (visible in conversation history, NOT sent to contact)
      // Resolves conversation by PHONE (not frontend conversationId which can be stale)
      if (previousInstanceName && newInstanceName && previousInstanceName !== newInstanceName && leadPhone) {
        console.log("Creating GHL InternalComment for instance switch via phone lookup");

        try {
          // Get the GHL access token for this location
          const { data: subaccountRows } = await supabase
            .from("ghl_subaccounts")
            .select("ghl_access_token, ghl_token_expires_at")
            .eq("location_id", locationId)
            .not("ghl_access_token", "is", null)
            .order("oauth_installed_at", { ascending: false, nullsFirst: false })
            .limit(1);
          const subaccount = subaccountRows?.[0] || null;

          if (subaccount?.ghl_access_token) {
            // Check if token needs refresh (expires in less than 5 minutes)
            const expiresAt = subaccount.ghl_token_expires_at ? new Date(subaccount.ghl_token_expires_at) : null;
            const needsRefresh = expiresAt && expiresAt.getTime() - Date.now() < 5 * 60 * 1000;

            if (needsRefresh) {
              console.log("Token needs refresh, skipping InternalComment creation");
            } else {
              const commentContent = "🔄 Instância alterada: " + previousInstanceName + " → " + newInstanceName;

              // 1) Resolve conversation by phone (not the frontend conversationId which may be stale)
              // Format phone for GHL search (with country code if available)
              const phoneForSearch = leadPhone.startsWith("55") ? "+" + leadPhone : leadPhone;
              console.log("Searching conversation by phone:", phoneForSearch);

              const searchResponse = await fetch(
                "https://services.leadconnectorhq.com/conversations/search?locationId=" + locationId + "&query=" + encodeURIComponent(phoneForSearch),
                {
                  headers: {
                    Authorization: "Bearer " + subaccount.ghl_access_token,
                    Version: "2021-04-15",
                    Accept: "application/json",
                  },
                }
              );

              if (!searchResponse.ok) {
                const errorText = await searchResponse.text();
                console.error("Failed to search conversation by phone:", searchResponse.status, errorText);
              } else {
                const searchData = await searchResponse.json();
                const conversations = searchData?.conversations || [];
                console.log("Found conversations:", conversations.length);

                // Find the conversation that matches this phone
                const matchedConv = conversations.find((c: { contactId?: string; phone?: string; id?: string }) => {
                  const convPhone = c.phone?.replace(/\D/g, '') || '';
                  const normalizedLead = leadPhone.replace(/\D/g, '');
                  return convPhone.endsWith(normalizedLead.slice(-10)) || normalizedLead.endsWith(convPhone.slice(-10));
                }) || conversations[0]; // Fallback to first result

                if (!matchedConv) {
                  console.log("No conversation found for phone:", phoneForSearch);
                } else {
                  const resolvedConversationId = matchedConv.id;
                  const resolvedContactId = matchedConv.contactId;
                  console.log("Resolved conversation:", { resolvedConversationId, resolvedContactId });

                  if (!resolvedContactId) {
                    console.log("No contactId in matched conversation");
                  } else {
                    // 2) Create InternalComment using resolved IDs
                    const ghlResponse = await fetch(
                      "https://services.leadconnectorhq.com/conversations/messages",
                      {
                        method: "POST",
                        headers: {
                          Authorization: "Bearer " + subaccount.ghl_access_token,
                          "Content-Type": "application/json",
                          Version: "2021-04-15",
                        },
                        body: JSON.stringify({
                          type: "InternalComment",
                          conversationId: resolvedConversationId,
                          contactId: resolvedContactId,
                          message: commentContent,
                        }),
                      }
                    );

                    if (ghlResponse.ok) {
                      console.log("GHL InternalComment created successfully for conversation:", resolvedConversationId);
                    } else {
                      const errorText = await ghlResponse.text();
                      console.error("Failed to create GHL InternalComment:", ghlResponse.status, errorText);
                    }
                  }
                }
              }
            }
          } else {
            console.log("No GHL access token found for location:", locationId);
          }
        } catch (commentError) {
          console.error("Error creating GHL InternalComment:", commentError);
          // Don't fail the request just because comment creation failed
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
