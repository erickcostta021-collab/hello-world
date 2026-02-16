import { useMemo } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Creates a Supabase client optimized for embed/iframe contexts.
 * This client does NOT persist sessions (no localStorage), making it work
 * in cross-origin iframes where localStorage may be blocked.
 */
export function useEmbedSupabase(): SupabaseClient<Database> {
  const client = useMemo(() => {
    return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // Don't persist session - this makes it work in iframes
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }, []);

  return client;
}

/**
 * Creates an anonymous Supabase client for one-off requests.
 * Useful for edge cases where hooks can't be used.
 */
export function createEmbedSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
