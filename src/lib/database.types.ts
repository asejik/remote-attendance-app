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
    PostgrestVersion: "13.0.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      attendance_events: {
        Row: {
          accuracy_m: number | null
          captured_at: string
          captured_by: string
          created_at: string
          device_info: Json
          distance_m: number | null
          face_photo_path: string | null
          flag_count: number | null
          flags: string[]
          id: string
          latitude: number | null
          liveness_passed: boolean
          longitude: number | null
          organization_id: string
          photos_deleted_at: string | null
          received_at: string
          review_note: string | null
          review_status: Database["public"]["Enums"]["review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          site_id: string | null
          site_name_snapshot: string | null
          site_photo_path: string | null
          staff_id: string
          type: Database["public"]["Enums"]["event_type"]
          updated_at: string
          within_radius: boolean | null
        }
        Insert: {
          accuracy_m?: number | null
          captured_at: string
          captured_by?: string
          created_at?: string
          device_info?: Json
          distance_m?: number | null
          face_photo_path?: string | null
          flag_count?: number | null
          flags?: string[]
          id: string
          latitude?: number | null
          liveness_passed?: boolean
          longitude?: number | null
          organization_id: string
          photos_deleted_at?: string | null
          received_at?: string
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          site_id?: string | null
          site_name_snapshot?: string | null
          site_photo_path?: string | null
          staff_id: string
          type: Database["public"]["Enums"]["event_type"]
          updated_at?: string
          within_radius?: boolean | null
        }
        Update: {
          accuracy_m?: number | null
          captured_at?: string
          captured_by?: string
          created_at?: string
          device_info?: Json
          distance_m?: number | null
          face_photo_path?: string | null
          flag_count?: number | null
          flags?: string[]
          id?: string
          latitude?: number | null
          liveness_passed?: boolean
          longitude?: number | null
          organization_id?: string
          photos_deleted_at?: string | null
          received_at?: string
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          site_id?: string | null
          site_name_snapshot?: string | null
          site_photo_path?: string | null
          staff_id?: string
          type?: Database["public"]["Enums"]["event_type"]
          updated_at?: string
          within_radius?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_organization_id_site_id_fkey"
            columns: ["organization_id", "site_id"]
            isOneToOne: false
            referencedRelation: "work_sites"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "attendance_events_organization_id_staff_id_fkey"
            columns: ["organization_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      attendance_logs: {
        Row: {
          device_info: Json | null
          id: string
          latitude: number
          longitude: number
          photo_path: string
          site_id: string | null
          site_name_snapshot: string | null
          site_photo_path: string | null
          sync_status: string | null
          timestamp: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          device_info?: Json | null
          id?: string
          latitude: number
          longitude: number
          photo_path: string
          site_id?: string | null
          site_name_snapshot?: string | null
          site_photo_path?: string | null
          sync_status?: string | null
          timestamp?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          device_info?: Json | null
          id?: string
          latitude?: number
          longitude?: number
          photo_path?: string
          site_id?: string | null
          site_name_snapshot?: string | null
          site_photo_path?: string | null
          sync_status?: string | null
          timestamp?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          at: string
          details: Json
          id: number
          organization_id: string
          target_id: string | null
          target_table: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          at?: string
          details?: Json
          id?: never
          organization_id: string
          target_id?: string | null
          target_table: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          at?: string
          details?: Json
          id?: never
          organization_id?: string
          target_id?: string | null
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          geofence_mode: Database["public"]["Enums"]["geofence_mode"]
          id: string
          name: string
          photo_retention_days: number
          price_per_seat_ngn: number | null
          seats: number | null
          site_photo_required: boolean
          slug: string
          status: string
          suspended_at: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          geofence_mode?: Database["public"]["Enums"]["geofence_mode"]
          id?: string
          name: string
          photo_retention_days?: number
          price_per_seat_ngn?: number | null
          seats?: number | null
          site_photo_required?: boolean
          slug: string
          status?: string
          suspended_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          geofence_mode?: Database["public"]["Enums"]["geofence_mode"]
          id?: string
          name?: string
          photo_retention_days?: number
          price_per_seat_ngn?: number | null
          seats?: number | null
          site_photo_required?: boolean
          slug?: string
          status?: string
          suspended_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          full_name: string | null
          id: string
          role: string | null
        }
        Insert: {
          full_name?: string | null
          id: string
          role?: string | null
        }
        Update: {
          full_name?: string | null
          id?: string
          role?: string | null
        }
        Relationships: []
      }
      sites: {
        Row: {
          id: string
          latitude: number
          longitude: number
          name: string
          radius_meters: number | null
        }
        Insert: {
          id?: string
          latitude: number
          longitude: number
          name: string
          radius_meters?: number | null
        }
        Update: {
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          radius_meters?: number | null
        }
        Relationships: []
      }
      staff: {
        Row: {
          consent_accepted_at: string | null
          consent_version: number | null
          created_at: string
          created_by: string | null
          deactivated_at: string | null
          full_name: string
          id: string
          organization_id: string
          phone: string | null
          reference_photo_path: string | null
          role: Database["public"]["Enums"]["staff_role"]
          staff_code: string
          status: Database["public"]["Enums"]["staff_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          consent_accepted_at?: string | null
          consent_version?: number | null
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          full_name: string
          id?: string
          organization_id: string
          phone?: string | null
          reference_photo_path?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          staff_code: string
          status?: Database["public"]["Enums"]["staff_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          consent_accepted_at?: string | null
          consent_version?: number | null
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          full_name?: string
          id?: string
          organization_id?: string
          phone?: string | null
          reference_photo_path?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          staff_code?: string
          status?: Database["public"]["Enums"]["staff_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      work_sites: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          created_by: string | null
          id: string
          latitude: number
          longitude: number
          name: string
          organization_id: string
          radius_m: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          latitude: number
          longitude: number
          name: string
          organization_id: string
          radius_m?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          organization_id?: string
          radius_m?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_sites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_consent:
        | { Args: never; Returns: string }
        | { Args: { p_version: number }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      login_throttle_blocked: { Args: { p_key: string }; Returns: string }
      login_throttle_record_failure: {
        Args: {
          p_block?: string
          p_key: string
          p_limit?: number
          p_window?: string
        }
        Returns: boolean
      }
      mark_photos_deleted: { Args: { p_event_ids: string[] }; Returns: number }
      mark_reference_photo_deleted: {
        Args: { p_staff_ids: string[] }
        Returns: number
      }
      orphan_event_photos: {
        Args: { p_limit?: number; p_min_age?: string }
        Returns: {
          name: string
        }[]
      }
      photos_to_purge: {
        Args: { p_limit?: number }
        Returns: {
          event_id: string
          face_photo_path: string
          site_photo_path: string
        }[]
      }
      reference_photos_to_purge: {
        Args: { p_limit?: number }
        Returns: {
          reference_photo_path: string
          staff_id: string
        }[]
      }
      review_event: {
        Args: {
          decision: Database["public"]["Enums"]["review_status"]
          event_id: string
          note?: string
        }
        Returns: {
          accuracy_m: number | null
          captured_at: string
          captured_by: string
          created_at: string
          device_info: Json
          distance_m: number | null
          face_photo_path: string | null
          flag_count: number | null
          flags: string[]
          id: string
          latitude: number | null
          liveness_passed: boolean
          longitude: number | null
          organization_id: string
          photos_deleted_at: string | null
          received_at: string
          review_note: string | null
          review_status: Database["public"]["Enums"]["review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          site_id: string | null
          site_name_snapshot: string | null
          site_photo_path: string | null
          staff_id: string
          type: Database["public"]["Enums"]["event_type"]
          updated_at: string
          within_radius: boolean | null
        }
        SetofOptions: {
          from: "*"
          to: "attendance_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      staff_pin_set: {
        Args: { p_pin: string; p_staff_id: string }
        Returns: undefined
      }
      staff_pin_verify: {
        Args: { p_org_slug: string; p_pin: string; p_staff_code: string }
        Returns: {
          locked_until: string
          result: string
          staff_id: string
          user_id: string
        }[]
      }
      update_org_settings: {
        Args: {
          geofence_mode?: Database["public"]["Enums"]["geofence_mode"]
          photo_retention_days?: number
          site_photo_required?: boolean
        }
        Returns: {
          created_at: string
          geofence_mode: Database["public"]["Enums"]["geofence_mode"]
          id: string
          name: string
          photo_retention_days: number
          price_per_seat_ngn: number | null
          seats: number | null
          site_photo_required: boolean
          slug: string
          status: string
          suspended_at: string | null
          timezone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      event_type: "CLOCK_IN" | "CLOCK_OUT"
      geofence_mode: "flag" | "block"
      review_status: "pending" | "approved" | "rejected"
      staff_role: "admin" | "supervisor" | "worker"
      staff_status: "active" | "deactivated"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      event_type: ["CLOCK_IN", "CLOCK_OUT"],
      geofence_mode: ["flag", "block"],
      review_status: ["pending", "approved", "rejected"],
      staff_role: ["admin", "supervisor", "worker"],
      staff_status: ["active", "deactivated"],
    },
  },
} as const
