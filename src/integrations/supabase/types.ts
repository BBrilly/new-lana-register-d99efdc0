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
  public: {
    Tables: {
      admin_registration_overrides: {
        Row: {
          approved_by: string | null
          approved_by_nostr_hex: string | null
          created_at: string
          id: string
          justification: string
          unregistered_senders: string[] | null
          wallet_id: string
        }
        Insert: {
          approved_by?: string | null
          approved_by_nostr_hex?: string | null
          created_at?: string
          id?: string
          justification: string
          unregistered_senders?: string[] | null
          wallet_id: string
        }
        Update: {
          approved_by?: string | null
          approved_by_nostr_hex?: string | null
          created_at?: string
          id?: string
          justification?: string
          unregistered_senders?: string[] | null
          wallet_id?: string
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string
          id: string
          nostr_hex_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nostr_hex_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nostr_hex_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          api_key: string
          contact_info: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          last_request_at: string | null
          rate_limit_per_hour: number
          request_count_current_hour: number
          service_name: string
          updated_at: string
        }
        Insert: {
          api_key: string
          contact_info?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_request_at?: string | null
          rate_limit_per_hour?: number
          request_count_current_hour?: number
          service_name: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          contact_info?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_request_at?: string | null
          rate_limit_per_hour?: number
          request_count_current_hour?: number
          service_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      balance_snapshots: {
        Row: {
          id: string
          recorded_at: string
          total_balance_lana: number
          wallet_count: number
        }
        Insert: {
          id?: string
          recorded_at?: string
          total_balance_lana?: number
          wallet_count?: number
        }
        Update: {
          id?: string
          recorded_at?: string
          total_balance_lana?: number
          wallet_count?: number
        }
        Relationships: []
      }
      block_tx: {
        Row: {
          all_block_transactions: number
          block_id: number
          created_at: string
          id: string
          time_audit: string
          time_staked: string
          transaction_including_registered_wallets: number
        }
        Insert: {
          all_block_transactions?: number
          block_id: number
          created_at?: string
          id?: string
          time_audit?: string
          time_staked: string
          transaction_including_registered_wallets?: number
        }
        Update: {
          all_block_transactions?: number
          block_id?: number
          created_at?: string
          id?: string
          time_audit?: string
          time_staked?: string
          transaction_including_registered_wallets?: number
        }
        Relationships: []
      }
      deleted_wallets: {
        Row: {
          created_at: string
          deleted_at: string
          id: string
          main_wallet_id: string | null
          nostr_hex_id: string
          original_wallet_uuid: string | null
          reason: string
          wallet_id: string | null
          wallet_type: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string
          id?: string
          main_wallet_id?: string | null
          nostr_hex_id: string
          original_wallet_uuid?: string | null
          reason: string
          wallet_id?: string | null
          wallet_type?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string
          id?: string
          main_wallet_id?: string | null
          nostr_hex_id?: string
          original_wallet_uuid?: string | null
          reason?: string
          wallet_id?: string | null
          wallet_type?: string | null
        }
        Relationships: []
      }
      main_wallets: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          is_owned: boolean
          name: string
          nostr_hex_id: string
          profile_pic_link: string | null
          status: string | null
          updated_at: string
          user_id: string | null
          wallet_id: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_owned?: boolean
          name: string
          nostr_hex_id: string
          profile_pic_link?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string | null
          wallet_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_owned?: boolean
          name?: string
          nostr_hex_id?: string
          profile_pic_link?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string | null
          wallet_id?: string | null
        }
        Relationships: []
      }
      registered_lana_events: {
        Row: {
          amount: number
          block_id: number | null
          created_at: string | null
          detected_at: string | null
          id: string
          nostr_87005_event_id: string | null
          nostr_87005_published: boolean | null
          nostr_87005_published_at: string | null
          notes: string | null
          split: number
          transaction_id: string | null
          wallet_id: string
        }
        Insert: {
          amount: number
          block_id?: number | null
          created_at?: string | null
          detected_at?: string | null
          id?: string
          nostr_87005_event_id?: string | null
          nostr_87005_published?: boolean | null
          nostr_87005_published_at?: string | null
          notes?: string | null
          split: number
          transaction_id?: string | null
          wallet_id: string
        }
        Update: {
          amount?: number
          block_id?: number | null
          created_at?: string | null
          detected_at?: string | null
          id?: string
          nostr_87005_event_id?: string | null
          nostr_87005_published?: boolean | null
          nostr_87005_published_at?: string | null
          notes?: string | null
          split?: number
          transaction_id?: string | null
          wallet_id?: string
        }
        Relationships: []
      }
      rpc_nodes: {
        Row: {
          created_at: string
          description: string | null
          host: string
          id: string
          name: string
          password: string | null
          port: number
          username: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          host: string
          id?: string
          name: string
          password?: string | null
          port: number
          username?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          host?: string
          id?: string
          name?: string
          password?: string | null
          port?: number
          username?: string | null
        }
        Relationships: []
      }
      subscription_proposals: {
        Row: {
          amount_eur: number
          amount_lana: number
          amount_lanoshi: number
          created_at: string | null
          exchange_rate: number
          id: string
          main_wallet_id: string
          nostr_event_id: string | null
          nostr_hex_id: string
          proposal_month: string
          published_at: string | null
        }
        Insert: {
          amount_eur: number
          amount_lana: number
          amount_lanoshi: number
          created_at?: string | null
          exchange_rate: number
          id?: string
          main_wallet_id: string
          nostr_event_id?: string | null
          nostr_hex_id: string
          proposal_month: string
          published_at?: string | null
        }
        Update: {
          amount_eur?: number
          amount_lana?: number
          amount_lanoshi?: number
          created_at?: string | null
          exchange_rate?: number
          id?: string
          main_wallet_id?: string
          nostr_event_id?: string | null
          nostr_hex_id?: string
          proposal_month?: string
          published_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_proposals_main_wallet_id_fkey"
            columns: ["main_wallet_id"]
            isOneToOne: false
            referencedRelation: "main_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      system_parameters: {
        Row: {
          created_at: number
          electrum: Json
          event_id: string
          fetched_at: string | null
          freeze_lana_account_above: string | null
          fx: Json
          id: string
          max_cap_lanas_on_split: string | null
          pubkey: string
          raw_event: Json
          relays: Json
          split: string
          split_ends_at: string | null
          split_started_at: string | null
          split_target_lana: string | null
          trusted_signers: Json
          updated_at: string | null
          valid_from: string
          version: string
        }
        Insert: {
          created_at: number
          electrum: Json
          event_id: string
          fetched_at?: string | null
          freeze_lana_account_above?: string | null
          fx: Json
          id?: string
          max_cap_lanas_on_split?: string | null
          pubkey: string
          raw_event: Json
          relays: Json
          split: string
          split_ends_at?: string | null
          split_started_at?: string | null
          split_target_lana?: string | null
          trusted_signers: Json
          updated_at?: string | null
          valid_from: string
          version: string
        }
        Update: {
          created_at?: number
          electrum?: Json
          event_id?: string
          fetched_at?: string | null
          freeze_lana_account_above?: string | null
          fx?: Json
          id?: string
          max_cap_lanas_on_split?: string | null
          pubkey?: string
          raw_event?: Json
          relays?: Json
          split?: string
          split_ends_at?: string | null
          split_started_at?: string | null
          split_target_lana?: string | null
          trusted_signers?: Json
          updated_at?: string | null
          valid_from?: string
          version?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          block_id: number | null
          created_at: string | null
          from_wallet_id: string | null
          id: string
          notes: string | null
          to_wallet_id: string | null
        }
        Insert: {
          amount: number
          block_id?: number | null
          created_at?: string | null
          from_wallet_id?: string | null
          id?: string
          notes?: string | null
          to_wallet_id?: string | null
        }
        Update: {
          amount?: number
          block_id?: number | null
          created_at?: string | null
          from_wallet_id?: string | null
          id?: string
          notes?: string | null
          to_wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_from_wallet_id_fkey"
            columns: ["from_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_wallet_id_fkey"
            columns: ["to_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      unregistered_lana_events: {
        Row: {
          detected_at: string | null
          id: string
          nostr_87003_event_id: string | null
          nostr_87003_published: boolean | null
          nostr_87003_published_at: string | null
          nostr_deletion_event_ids: string[] | null
          nostr_deletion_published: boolean | null
          nostr_deletion_published_at: string | null
          nostr_dm_event_id: string | null
          nostr_dm_sent: boolean | null
          nostr_event_id: string | null
          notes: string | null
          return_amount_unregistered_lana: number | null
          return_transaction_date: string | null
          return_transaction_id: string | null
          return_wallet_id: string | null
          unregistered_amount: number
          wallet_id: string
        }
        Insert: {
          detected_at?: string | null
          id?: string
          nostr_87003_event_id?: string | null
          nostr_87003_published?: boolean | null
          nostr_87003_published_at?: string | null
          nostr_deletion_event_ids?: string[] | null
          nostr_deletion_published?: boolean | null
          nostr_deletion_published_at?: string | null
          nostr_dm_event_id?: string | null
          nostr_dm_sent?: boolean | null
          nostr_event_id?: string | null
          notes?: string | null
          return_amount_unregistered_lana?: number | null
          return_transaction_date?: string | null
          return_transaction_id?: string | null
          return_wallet_id?: string | null
          unregistered_amount: number
          wallet_id: string
        }
        Update: {
          detected_at?: string | null
          id?: string
          nostr_87003_event_id?: string | null
          nostr_87003_published?: boolean | null
          nostr_87003_published_at?: string | null
          nostr_deletion_event_ids?: string[] | null
          nostr_deletion_published?: boolean | null
          nostr_deletion_published_at?: string | null
          nostr_dm_event_id?: string | null
          nostr_dm_sent?: boolean | null
          nostr_event_id?: string | null
          notes?: string | null
          return_amount_unregistered_lana?: number | null
          return_transaction_date?: string | null
          return_transaction_id?: string | null
          return_wallet_id?: string | null
          unregistered_amount?: number
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unregistered_lana_events_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_types: {
        Row: {
          created_at: string
          id: string
          name: string
          visible_in_form: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          visible_in_form?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          visible_in_form?: boolean
        }
        Relationships: []
      }
      wallets: {
        Row: {
          amount_unregistered_lanoshi: number | null
          created_at: string
          freeze_reason: string
          frozen: boolean
          id: string
          main_wallet_id: string
          notes: string | null
          registration_source: string | null
          split_created: number | null
          updated_at: string
          wallet_id: string | null
          wallet_type: string
        }
        Insert: {
          amount_unregistered_lanoshi?: number | null
          created_at?: string
          freeze_reason?: string
          frozen?: boolean
          id?: string
          main_wallet_id: string
          notes?: string | null
          registration_source?: string | null
          split_created?: number | null
          updated_at?: string
          wallet_id?: string | null
          wallet_type: string
        }
        Update: {
          amount_unregistered_lanoshi?: number | null
          created_at?: string
          freeze_reason?: string
          frozen?: boolean
          id?: string
          main_wallet_id?: string
          notes?: string | null
          registration_source?: string | null
          split_created?: number | null
          updated_at?: string
          wallet_id?: string | null
          wallet_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_main_wallet_id_fkey"
            columns: ["main_wallet_id"]
            isOneToOne: false
            referencedRelation: "main_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      blockchain_monitor_cron: { Args: never; Returns: undefined }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
