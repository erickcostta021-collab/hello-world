import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface GHLUser {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role?: string;
}

async function refreshGHLToken(locationId: string, userId: string): Promise<string | null> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const response = await fetch(`${supabaseUrl}/functions/v1/refresh-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId, userId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Token refresh failed:", errorData);
      return null;
    }

    const data = await response.json();
    return data.access_token || null;
  } catch (error) {
    console.error("Token refresh error:", error);
    return null;
  }
}

export function useGHLUsers() {
  const [loading, setLoading] = useState(false);

  /**
   * Ensures the access token is valid. If expired, refreshes it automatically.
   * Returns the valid access token or null if refresh failed.
   */
  const ensureValidToken = async (
    locationId: string,
    subaccountUserId: string,
    accessToken: string | null,
    tokenExpiresAt: string | null
  ): Promise<string | null> => {
    if (!accessToken) return null;

    // Check if token is expired (with 5 min buffer)
    if (tokenExpiresAt) {
      const expiresAt = new Date(tokenExpiresAt);
      const now = new Date();
      const bufferMs = 5 * 60 * 1000; // 5 minutes buffer

      if (now.getTime() >= expiresAt.getTime() - bufferMs) {
        console.log("[useGHLUsers] Token expired, refreshing...");
        const newToken = await refreshGHLToken(locationId, subaccountUserId);
        if (newToken) {
          console.log("[useGHLUsers] Token refreshed successfully");
          return newToken;
        }
        console.error("[useGHLUsers] Token refresh failed");
        return null;
      }
    }

    return accessToken;
  };

  const fetchLocationUsers = async (
    locationId: string,
    accessToken?: string | null,
    options?: {
      subaccountUserId?: string;
      tokenExpiresAt?: string | null;
    }
  ): Promise<GHLUser[]> => {
    let token = accessToken || null;

    // Auto-refresh if expiry info provided
    if (options?.subaccountUserId && token) {
      token = await ensureValidToken(
        locationId,
        options.subaccountUserId,
        token,
        options.tokenExpiresAt ?? null
      );
    }

    if (!token) {
      console.warn("Token OAuth não disponível - instale o app na subconta primeiro");
      return [];
    }

    setLoading(true);
    try {
      // Use OAuth access token from app installation
      const response = await fetch(
        `https://services.leadconnectorhq.com/users/?locationId=${locationId}`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Version": "2021-07-28",
            "Accept": "application/json",
          },
        }
      );

      if (!response.ok) {
        // Try search endpoint as fallback
        const altResponse = await fetch(
          `https://services.leadconnectorhq.com/users/search?locationId=${locationId}&limit=100`,
          {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Version": "2021-07-28",
              "Accept": "application/json",
            },
          }
        );

        if (!altResponse.ok) {
          const errorData = await altResponse.json().catch(() => ({}));
          console.error("Failed to fetch GHL users:", errorData);
          return [];
        }

        const altData = await altResponse.json();
        const usersArray = altData.users || altData.data || [];
        return usersArray.map((u: any) => ({
          id: u.id,
          name: u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
          firstName: u.firstName || "",
          lastName: u.lastName || "",
          email: u.email || "",
          phone: u.phone,
          role: u.role || u.type,
        }));
      }

      const data = await response.json();
      const usersArray = data.users || data.data || [];
      return usersArray.map((u: any) => ({
        id: u.id,
        name: u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
        firstName: u.firstName || "",
        lastName: u.lastName || "",
        email: u.email || "",
        phone: u.phone,
        role: u.role || u.type,
      }));
    } finally {
      setLoading(false);
    }
  };

  return {
    fetchLocationUsers,
    ensureValidToken,
    loading,
  };
}
