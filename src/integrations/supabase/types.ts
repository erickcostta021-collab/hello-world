export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      cdn_scripts: {
        Row: {
          content: string
          content_type: string
          created_at: string
          id: string
          is_active: boolean
          is_obfuscated: boolean
          slug: string
          subdomain: string | null
          updated_at: string
          version: string
        }
        Insert: {
          content: string
          content_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_obfuscated?: boolean
          slug: string
          subdomain?: string | null
          updated_at?: string
          version: string
        }
        Update: {
          content?: string
          content_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_obfuscated?: boolean
          slug?: string
          subdomain?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      contact_instance_preferences: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          instance_id: string
          lead_phone: string | null
          location_id: string
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          instance_id: string
          lead_phone?: string | null
          location_id: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          instance_id?: string
          lead_phone?: string | null
          location_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_instance_preferences_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_contact_phone_mapping: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          location_id: string
          original_phone: string
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          location_id: string
          original_phone: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          location_id?: string
          original_phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      ghl_processed_messages: {
        Row: {
          created_at: string
          id: string
          message_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
        }
        Relationships: []
      }
      ghl_subaccounts: {
        Row: {
          account_name: string
          company_id: string | null
          created_at: string
          embed_token: string | null
          ghl_access_token: string | null
          ghl_refresh_token: string | null
          ghl_subaccount_token: string | null
          ghl_token_expires_at: string | null
          ghl_token_scopes: string | null
          ghl_user_id: string | null
          id: string
          location_id: string
          oauth_installed_at: string | null
          oauth_last_refresh: string | null
          skip_outbound: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name: string
          company_id?: string | null
          created_at?: string
          embed_token?: string | null
          ghl_access_token?: string | null
          ghl_refresh_token?: string | null
          ghl_subaccount_token?: string | null
          ghl_token_expires_at?: string | null
          ghl_token_scopes?: string | null
          ghl_user_id?: string | null
          id?: string
          location_id: string
          oauth_installed_at?: string | null
          oauth_last_refresh?: string | null
          skip_outbound?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          company_id?: string | null
          created_at?: string
          embed_token?: string | null
          ghl_access_token?: string | null
          ghl_refresh_token?: string | null
          ghl_subaccount_token?: string | null
          ghl_token_expires_at?: string | null
          ghl_token_scopes?: string | null
          ghl_user_id?: string | null
          id?: string
          location_id?: string
          oauth_installed_at?: string | null
          oauth_last_refresh?: string | null
          skip_outbound?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      instances: {
        Row: {
          created_at: string
          ghl_user_id: string | null
          id: string
          ignore_groups: boolean | null
          instance_name: string
          instance_status: Database["public"]["Enums"]["instance_status"]
          is_official_api: boolean
          phone: string | null
          profile_pic_url: string | null
          subaccount_id: string | null
          uazapi_base_url: string | null
          uazapi_instance_token: string
          updated_at: string
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          created_at?: string
          ghl_user_id?: string | null
          id?: string
          ignore_groups?: boolean | null
          instance_name: string
          instance_status?: Database["public"]["Enums"]["instance_status"]
          is_official_api?: boolean
          phone?: string | null
          profile_pic_url?: string | null
          subaccount_id?: string | null
          uazapi_base_url?: string | null
          uazapi_instance_token: string
          updated_at?: string
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          created_at?: string
          ghl_user_id?: string | null
          id?: string
          ignore_groups?: boolean | null
          instance_name?: string
          instance_status?: Database["public"]["Enums"]["instance_status"]
          is_official_api?: boolean
          phone?: string | null
          profile_pic_url?: string | null
          subaccount_id?: string | null
          uazapi_base_url?: string | null
          uazapi_instance_token?: string
          updated_at?: string
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instances_subaccount_id_fkey"
            columns: ["subaccount_id"]
            isOneToOne: false
            referencedRelation: "ghl_subaccounts"
            referencedColumns: ["id"]
          },
        ]
      }
      message_map: {
        Row: {
          contact_id: string | null
          created_at: string
          from_me: boolean | null
          ghl_message_id: string
          id: string
          is_deleted: boolean | null
          is_edited: boolean | null
          location_id: string
          message_text: string | null
          message_type: string | null
          original_timestamp: string
          reactions: Json | null
          uazapi_message_id: string | null
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          from_me?: boolean | null
          ghl_message_id: string
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          location_id: string
          message_text?: string | null
          message_type?: string | null
          original_timestamp?: string
          reactions?: Json | null
          uazapi_message_id?: string | null
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          from_me?: boolean | null
          ghl_message_id?: string
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          location_id?: string
          message_text?: string | null
          message_type?: string | null
          original_timestamp?: string
          reactions?: Json | null
          uazapi_message_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          instance_limit: number
          is_paused: boolean
          paused_at: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          instance_limit?: number
          is_paused?: boolean
          paused_at?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          instance_limit?: number
          is_paused?: boolean
          paused_at?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      registration_requests: {
        Row: {
          code: string
          created_at: string
          email: string
          expires_at: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      server_health_alerts: {
        Row: {
          created_at: string
          first_detected_at: string
          id: string
          instance_id: string | null
          instance_name: string
          resolved_at: string | null
          server_url: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          first_detected_at?: string
          id?: string
          instance_id?: string | null
          instance_name: string
          resolved_at?: string | null
          server_url: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          first_detected_at?: string
          id?: string
          instance_id?: string | null
          instance_name?: string
          resolved_at?: string | null
          server_url?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_health_alerts_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          external_supabase_key: string | null
          external_supabase_pat: string | null
          external_supabase_url: string | null
          ghl_agency_token: string | null
          ghl_client_id: string | null
          ghl_client_secret: string | null
          ghl_conversation_provider_id: string | null
          global_webhook_url: string | null
          id: string
          shared_from_user_id: string | null
          track_id: string | null
          uazapi_admin_token: string | null
          uazapi_base_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          external_supabase_key?: string | null
          external_supabase_pat?: string | null
          external_supabase_url?: string | null
          ghl_agency_token?: string | null
          ghl_client_id?: string | null
          ghl_client_secret?: string | null
          ghl_conversation_provider_id?: string | null
          global_webhook_url?: string | null
          id?: string
          shared_from_user_id?: string | null
          track_id?: string | null
          uazapi_admin_token?: string | null
          uazapi_base_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          external_supabase_key?: string | null
          external_supabase_pat?: string | null
          external_supabase_url?: string | null
          ghl_agency_token?: string | null
          ghl_client_id?: string | null
          ghl_client_secret?: string | null
          ghl_conversation_provider_id?: string | null
          global_webhook_url?: string | null
          id?: string
          shared_from_user_id?: string | null
          track_id?: string | null
          uazapi_admin_token?: string | null
          uazapi_base_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_metrics: {
        Row: {
          created_at: string
          error_type: string | null
          function_name: string
          id: string
          instance_id: string | null
          location_id: string | null
          processing_time_ms: number | null
          status_code: number
        }
        Insert: {
          created_at?: string
          error_type?: string | null
          function_name: string
          id?: string
          instance_id?: string | null
          location_id?: string | null
          processing_time_ms?: number | null
          status_code?: number
        }
        Update: {
          created_at?: string
          error_type?: string | null
          function_name?: string
          id?: string
          instance_id?: string | null
          location_id?: string | null
          processing_time_ms?: number | null
          status_code?: number
        }
        Relationships: [
          {
            foreignKeyName: "webhook_metrics_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_health_alerts: { Args: never; Returns: undefined }
      cleanup_old_message_mappings: { Args: never; Returns: undefined }
      cleanup_old_phone_mappings: { Args: never; Returns: undefined }
      cleanup_old_processed_messages: { Args: never; Returns: undefined }
      cleanup_old_webhook_metrics: { Args: never; Returns: undefined }
      generate_embed_token: { Args: never; Returns: string }
      get_admin_oauth_credentials: {
        Args: never
        Returns: {
          ghl_client_id: string
          ghl_client_secret: string
        }[]
      }
      get_effective_user_id: { Args: { p_user_id: string }; Returns: string }
      get_token_owner: { Args: { p_agency_token: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      upsert_subaccounts: {
        Args: { p_locations: Json; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      instance_status: "connected" | "connecting" | "disconnected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      instance_status: ["connected", "connecting", "disconnected"],
    },
  },
} as const
