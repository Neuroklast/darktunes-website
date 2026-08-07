export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      artist_members: {
        Row: {
          id: string
          user_id: string
          artist_id: string
          member_role: 'owner' | 'member' | 'guest'
          invited_by: string | null
          joined_at: string
        }
        Insert: {
          id?: string
          user_id: string
          artist_id: string
          member_role?: 'owner' | 'member' | 'guest'
          invited_by?: string | null
          joined_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          artist_id?: string
          member_role?: 'owner' | 'member' | 'guest'
          invited_by?: string | null
          joined_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_members_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      sos_rules_presets: {
        Row: {
          id: string
          name: string
          config: Record<string, unknown>
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          config: Record<string, unknown>
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          config?: Record<string, unknown>
          updated_at?: string
        }
        Relationships: []
      }
      sos_accounting_workspaces: {
        Row: {
          id: string
          period_start: string
          period_end: string
          config: Record<string, unknown>
          bronze_batch_ids: string[]
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          period_start: string
          period_end: string
          config?: Record<string, unknown>
          bronze_batch_ids?: string[]
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          period_start?: string
          period_end?: string
          config?: Record<string, unknown>
          bronze_batch_ids?: string[]
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sos_period_summaries: {
        Row: {
          id: string
          period_start: string
          period_end: string
          total_revenue: number
          total_payout: number
          artist_count: number
          artist_breakdowns: unknown[]
          platform_breakdowns: unknown[]
          source_batch_ids: string[]
          created_at: string
        }
        Insert: {
          id?: string
          period_start: string
          period_end: string
          total_revenue?: number
          total_payout?: number
          artist_count?: number
          artist_breakdowns?: unknown[]
          platform_breakdowns?: unknown[]
          source_batch_ids?: string[]
          created_at?: string
        }
        Update: {
          id?: string
          period_start?: string
          period_end?: string
          total_revenue?: number
          total_payout?: number
          artist_count?: number
          artist_breakdowns?: unknown[]
          platform_breakdowns?: unknown[]
          source_batch_ids?: string[]
        }
        Relationships: []
      }
      settlement_periods: {
        Row: {
          id: string
          period_start: string
          period_end: string
          label: string
          status: 'open' | 'under_review' | 'approved' | 'locked' | 'archived'
          notes: string | null
          locked_at: string | null
          locked_by: string | null
          archived_at: string | null
          archived_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          period_start: string
          period_end: string
          label: string
          status?: 'open' | 'under_review' | 'approved' | 'locked' | 'archived'
          notes?: string | null
          locked_at?: string | null
          locked_by?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          period_start?: string
          period_end?: string
          label?: string
          status?: 'open' | 'under_review' | 'approved' | 'locked' | 'archived'
          notes?: string | null
          locked_at?: string | null
          locked_by?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      artist_settlement_ledger: {
        Row: {
          id: string
          artist_id: string
          settlement_period_id: string | null
          entry_type:
            | 'statement_payout'
            | 'invoice_liability'
            | 'payment'
            | 'carry_in'
            | 'carry_out'
            | 'correction'
            | 'opening_balance'
            | 'partial_payment'
          amount_eur: number
          currency: string | null
          amount_original: number | null
          fx_rate: number | null
          reference_type: string | null
          reference_id: string | null
          description: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          settlement_period_id?: string | null
          entry_type:
            | 'statement_payout'
            | 'invoice_liability'
            | 'payment'
            | 'carry_in'
            | 'carry_out'
            | 'correction'
            | 'opening_balance'
            | 'partial_payment'
          amount_eur: number
          currency?: string | null
          amount_original?: number | null
          fx_rate?: number | null
          reference_type?: string | null
          reference_id?: string | null
          description?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          settlement_period_id?: string | null
          entry_type?:
            | 'statement_payout'
            | 'invoice_liability'
            | 'payment'
            | 'carry_in'
            | 'carry_out'
            | 'correction'
            | 'opening_balance'
            | 'partial_payment'
          amount_eur?: number
          currency?: string | null
          amount_original?: number | null
          fx_rate?: number | null
          reference_type?: string | null
          reference_id?: string | null
          description?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      period_carry_forwards: {
        Row: {
          id: string
          from_period_id: string
          to_period_id: string | null
          artist_id: string
          opening_balance_eur: number
          breakdown: Record<string, unknown>
          applied_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          from_period_id: string
          to_period_id?: string | null
          artist_id: string
          opening_balance_eur?: number
          breakdown?: Record<string, unknown>
          applied_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          from_period_id?: string
          to_period_id?: string | null
          artist_id?: string
          opening_balance_eur?: number
          breakdown?: Record<string, unknown>
          applied_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      financial_audit_events: {
        Row: {
          id: string
          entity_type: string
          entity_id: string
          action: string
          actor_id: string | null
          before_data: Record<string, unknown> | null
          after_data: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          entity_type: string
          entity_id: string
          action: string
          actor_id?: string | null
          before_data?: Record<string, unknown> | null
          after_data?: Record<string, unknown> | null
          created_at?: string
        }
        Update: {
          id?: string
          entity_type?: string
          entity_id?: string
          action?: string
          actor_id?: string | null
          before_data?: Record<string, unknown> | null
          after_data?: Record<string, unknown> | null
          created_at?: string
        }
        Relationships: []
      }
      app_logs: {
        Row: {
          id: string
          source: string
          level: 'error' | 'warn' | 'info'
          message: string
          details: Record<string, unknown>
          user_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          source: string
          level?: 'error' | 'warn' | 'info'
          message: string
          details?: Record<string, unknown>
          user_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          source?: string
          level?: 'error' | 'warn' | 'info'
          message?: string
          details?: Record<string, unknown>
          user_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      api_credentials: {
        Row: {
          label_id: string
          key: string
          value: string
          category: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          label_id?: string
          key: string
          value?: string
          category?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          label_id?: string
          key?: string
          value?: string
          category?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'api_credentials_updated_by_fkey'
            columns: ['updated_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      genres: {
        Row: {
          id: string
          name: string
          slug: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          created_at?: string
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          key: string
          resource_type: string
          resource_id: string | null
          created_at: string
        }
        Insert: {
          key: string
          resource_type: string
          resource_id?: string | null
          created_at?: string
        }
        Update: {
          key?: string
          resource_type?: string
          resource_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      sync_queue: {
        Row: {
          id: string
          artist_id: string | null
          job_type: string
          status: string
          scheduled_at: string
          started_at: string | null
          finished_at: string | null
          locked_until: string | null
          cancel_requested_at: string | null
          cancelled_at: string | null
          error_message: string | null
          attempt_count: number
          created_at: string
        }
        Insert: {
          id?: string
          artist_id?: string | null
          job_type?: string
          status?: string
          scheduled_at?: string
          started_at?: string | null
          finished_at?: string | null
          locked_until?: string | null
          cancel_requested_at?: string | null
          cancelled_at?: string | null
          error_message?: string | null
          attempt_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          artist_id?: string | null
          job_type?: string
          status?: string
          scheduled_at?: string
          started_at?: string | null
          finished_at?: string | null
          locked_until?: string | null
          cancel_requested_at?: string | null
          cancelled_at?: string | null
          error_message?: string | null
          attempt_count?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sync_queue_artist_id_fkey'
            columns: ['artist_id']
            isOneToOne: false
            referencedRelation: 'artists'
            referencedColumns: ['id']
          }
        ]
      }
      user_invites: {
        Row: {
          id: string
          email: string
          role: string
          token_hash: string
          portal: boolean
          artist_id: string | null
          granted_by: string | null
          auth_user_id: string | null
          expires_at: string
          accepted_at: string | null
          revoked_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          role: string
          token_hash: string
          portal?: boolean
          artist_id?: string | null
          granted_by?: string | null
          auth_user_id?: string | null
          expires_at: string
          accepted_at?: string | null
          revoked_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          role?: string
          token_hash?: string
          portal?: boolean
          artist_id?: string | null
          granted_by?: string | null
          auth_user_id?: string | null
          expires_at?: string
          accepted_at?: string | null
          revoked_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_invites_artist_id_fkey'
            columns: ['artist_id']
            isOneToOne: false
            referencedRelation: 'artists'
            referencedColumns: ['id']
          },
        ]
      }
      users: {
        Row: {
          id: string
          email: string
          role: 'admin' | 'editor' | 'journalist' | 'user' | 'artist' | 'press'
          avatar_url: string | null
          provider: string
          full_name: string | null
          is_active: boolean | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id: string
          email: string
          role?: 'admin' | 'editor' | 'journalist' | 'user' | 'artist' | 'press'
          avatar_url?: string | null
          provider?: string
          full_name?: string | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          email?: string
          role?: 'admin' | 'editor' | 'journalist' | 'user' | 'artist' | 'press'
          avatar_url?: string | null
          provider?: string
          full_name?: string | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          role: 'admin' | 'editor' | 'journalist' | 'user' | 'artist'
          can_publish_news: boolean
          can_edit_news: boolean
          can_manage_artists: boolean
          can_manage_releases: boolean
          can_manage_videos: boolean
          can_view_admin_panel: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          role: 'admin' | 'editor' | 'journalist' | 'user' | 'artist'
          can_publish_news?: boolean
          can_edit_news?: boolean
          can_manage_artists?: boolean
          can_manage_releases?: boolean
          can_manage_videos?: boolean
          can_view_admin_panel?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          role?: 'admin' | 'editor' | 'journalist' | 'user' | 'artist'
          can_publish_news?: boolean
          can_edit_news?: boolean
          can_manage_artists?: boolean
          can_manage_releases?: boolean
          can_manage_videos?: boolean
          can_view_admin_panel?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      artists: {
        Row: {
          id: string
          name: string
          slug: string
          bio: string | null
          genres: string[]
          image_url: string | null
          spotify_url: string | null
          apple_music_url: string | null
          instagram_url: string | null
          youtube_url: string | null
          website_url: string | null
          featured: boolean
          country: string | null
          founding_year: number | null
          hometown: string | null
          email: string | null
          vat_number: string | null
          is_eu_non_german: boolean
          notes: string | null
          spotify_id: string | null
          discogs_id: string | null
          songkick_id: string | null
          bandsintown_id: string | null
          last_synced_at: string | null
          user_id: string | null
          facebook_url: string | null
          twitter_url: string | null
          tiktok_url: string | null
          bandcamp_url: string | null
          shop_url: string | null
          soundcloud_url: string | null
          is_visible: boolean
          logo_url: string | null
          platform_links: Record<string, string> | null
          storage_quota_bytes: number | null
          smart_links: Array<{ label: string; url: string }> | null
          bandsintown_api_key: string | null
          lastfm_name: string | null
          soundcharts_id: string | null
          image_position_x: number | null
          image_position_y: number | null
          image_scale: number | null
          landing_publish_trusted: boolean
          portal_terms_version: string | null
          portal_terms_accepted_at: string | null
          portal_terms_accepted_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          bio?: string | null
          genres?: string[]
          image_url?: string | null
          spotify_url?: string | null
          apple_music_url?: string | null
          instagram_url?: string | null
          youtube_url?: string | null
          website_url?: string | null
          featured?: boolean
          country?: string | null
          founding_year?: number | null
          hometown?: string | null
          email?: string | null
          vat_number?: string | null
          is_eu_non_german?: boolean
          notes?: string | null
          spotify_id?: string | null
          discogs_id?: string | null
          songkick_id?: string | null
          bandsintown_id?: string | null
          last_synced_at?: string | null
          user_id?: string | null
          facebook_url?: string | null
          twitter_url?: string | null
          tiktok_url?: string | null
          bandcamp_url?: string | null
          shop_url?: string | null
          soundcloud_url?: string | null
          is_visible?: boolean
          logo_url?: string | null
          platform_links?: Record<string, string> | null
          storage_quota_bytes?: number | null
          smart_links?: Array<{ label: string; url: string }> | null
          bandsintown_api_key?: string | null
          lastfm_name?: string | null
          soundcharts_id?: string | null
          image_position_x?: number | null
          image_position_y?: number | null
          image_scale?: number | null
          landing_publish_trusted?: boolean
          portal_terms_version?: string | null
          portal_terms_accepted_at?: string | null
          portal_terms_accepted_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          bio?: string | null
          genres?: string[]
          image_url?: string | null
          spotify_url?: string | null
          apple_music_url?: string | null
          instagram_url?: string | null
          youtube_url?: string | null
          website_url?: string | null
          featured?: boolean
          country?: string | null
          founding_year?: number | null
          hometown?: string | null
          email?: string | null
          vat_number?: string | null
          is_eu_non_german?: boolean
          notes?: string | null
          spotify_id?: string | null
          discogs_id?: string | null
          songkick_id?: string | null
          bandsintown_id?: string | null
          last_synced_at?: string | null
          user_id?: string | null
          facebook_url?: string | null
          twitter_url?: string | null
          tiktok_url?: string | null
          bandcamp_url?: string | null
          shop_url?: string | null
          soundcloud_url?: string | null
          is_visible?: boolean
          logo_url?: string | null
          platform_links?: Record<string, string> | null
          storage_quota_bytes?: number | null
          smart_links?: Array<{ label: string; url: string }> | null
          bandsintown_api_key?: string | null
          lastfm_name?: string | null
          soundcharts_id?: string | null
          image_position_x?: number | null
          image_position_y?: number | null
          image_scale?: number | null
          landing_publish_trusted?: boolean
          portal_terms_version?: string | null
          portal_terms_accepted_at?: string | null
          portal_terms_accepted_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      artist_private_data: {
        Row: {
          artist_id: string
          email: string | null
          vat_number: string | null
          notes: string | null
          bandsintown_api_key: string | null
          storage_quota_bytes: number | null
          is_eu_non_german: boolean
          updated_at: string
        }
        Insert: {
          artist_id: string
          email?: string | null
          vat_number?: string | null
          notes?: string | null
          bandsintown_api_key?: string | null
          storage_quota_bytes?: number | null
          is_eu_non_german?: boolean
          updated_at?: string
        }
        Update: {
          artist_id?: string
          email?: string | null
          vat_number?: string | null
          notes?: string | null
          bandsintown_api_key?: string | null
          storage_quota_bytes?: number | null
          is_eu_non_german?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'artist_private_data_artist_id_fkey'
            columns: ['artist_id']
            isOneToOne: true
            referencedRelation: 'artists'
            referencedColumns: ['id']
          },
        ]
      }
      artist_epks: {
        Row: {
          id: string
          artist_id: string
          bio_short: string | null
          bio_medium: string | null
          bio_long: string | null
          press_quote: string | null
          booking_contact: string | null
          press_contact: string | null
          rider_stage_plot_url: string | null
          rider_technical_url: string | null
          rider_hospitality_url: string | null
          onboarding_completed: boolean
          epk_theme: string
          epk_layout: string
          epk_orientation: string
          epk_bg_image_url: string | null
          epk_bg_opacity: number
          epk_sections_order: string[]
          epk_sections_hidden: string[]
          epk_password_hash: string | null
          epk_password_sections: string[]
          epk_gallery_photos: string[]
          epk_custom_theme_tokens: Record<string, string> | null
          custom_links: Array<{ label: string; url: string }> | null
          epk_document: Record<string, unknown> | null
          epk_document_version: number
          epk_editor_mode: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          bio_short?: string | null
          bio_medium?: string | null
          bio_long?: string | null
          press_quote?: string | null
          booking_contact?: string | null
          press_contact?: string | null
          rider_stage_plot_url?: string | null
          rider_technical_url?: string | null
          rider_hospitality_url?: string | null
          onboarding_completed?: boolean
          epk_theme?: string
          epk_layout?: string
          epk_orientation?: string
          epk_bg_image_url?: string | null
          epk_bg_opacity?: number
          epk_sections_order?: string[]
          epk_sections_hidden?: string[]
          epk_password_hash?: string | null
          epk_password_sections?: string[]
          epk_gallery_photos?: string[]
          epk_custom_theme_tokens?: Record<string, string> | null
          custom_links?: Array<{ label: string; url: string }> | null
          epk_document?: Record<string, unknown> | null
          epk_document_version?: number
          epk_editor_mode?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          bio_short?: string | null
          bio_medium?: string | null
          bio_long?: string | null
          press_quote?: string | null
          booking_contact?: string | null
          press_contact?: string | null
          rider_stage_plot_url?: string | null
          rider_technical_url?: string | null
          rider_hospitality_url?: string | null
          onboarding_completed?: boolean
          epk_theme?: string
          epk_layout?: string
          epk_orientation?: string
          epk_bg_image_url?: string | null
          epk_bg_opacity?: number
          epk_sections_order?: string[]
          epk_sections_hidden?: string[]
          epk_password_hash?: string | null
          epk_password_sections?: string[]
          epk_gallery_photos?: string[]
          epk_custom_theme_tokens?: Record<string, string> | null
          custom_links?: Array<{ label: string; url: string }> | null
          epk_document?: Record<string, unknown> | null
          epk_document_version?: number
          epk_editor_mode?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      epk_versions: {
        Row: {
          id: string
          artist_id: string
          document: Record<string, unknown>
          version_number: number
          label: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          document: Record<string, unknown>
          version_number: number
          label?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          document?: Record<string, unknown>
          version_number?: number
          label?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      epk_fonts: {
        Row: {
          id: string
          artist_id: string | null
          name: string
          r2_key: string
          mime_type: string
          created_at: string
        }
        Insert: {
          id?: string
          artist_id?: string | null
          name: string
          r2_key: string
          mime_type?: string
          created_at?: string
        }
        Update: {
          id?: string
          artist_id?: string | null
          name?: string
          r2_key?: string
          mime_type?: string
          created_at?: string
        }
        Relationships: []
      }
      epk_share_links: {
        Row: {
          id: string
          artist_id: string
          token: string
          password_hash: string | null
          expires_at: string | null
          label: string | null
          created_by: string | null
          created_at: string
          revoked_at: string | null
        }
        Insert: {
          id?: string
          artist_id: string
          token: string
          password_hash?: string | null
          expires_at?: string | null
          label?: string | null
          created_by?: string | null
          created_at?: string
          revoked_at?: string | null
        }
        Update: {
          id?: string
          artist_id?: string
          token?: string
          password_hash?: string | null
          expires_at?: string | null
          label?: string | null
          created_by?: string | null
          created_at?: string
          revoked_at?: string | null
        }
        Relationships: []
      }
      tour_share_links: {
        Row: {
          id: string
          tour_id: string
          artist_id: string
          token: string
          label: string | null
          is_active: boolean
          expires_at: string | null
          created_by: string | null
          created_at: string
          revoked_at: string | null
        }
        Insert: {
          id?: string
          tour_id: string
          artist_id: string
          token: string
          label?: string | null
          is_active?: boolean
          expires_at?: string | null
          created_by?: string | null
          created_at?: string
          revoked_at?: string | null
        }
        Update: {
          id?: string
          tour_id?: string
          artist_id?: string
          token?: string
          label?: string | null
          is_active?: boolean
          expires_at?: string | null
          created_by?: string | null
          created_at?: string
          revoked_at?: string | null
        }
        Relationships: []
      }
      epk_download_events: {
        Row: {
          id: string
          artist_id: string
          source: string
          share_link_id: string | null
          ip_hash: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          source: string
          share_link_id?: string | null
          ip_hash?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          source?: string
          share_link_id?: string | null
          ip_hash?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Relationships: []
      }
      epk_templates: {
        Row: {
          id: string
          name: string
          description: string | null
          document: Json
          is_published: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          document: Json
          is_published?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          document?: Json
          is_published?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      artist_billing_profiles: {
        Row: {
          id: string
          artist_id: string
          legal_name: string
          street: string
          postal_code: string
          city: string
          country: string
          tax_number: string | null
          vat_id: string | null
          is_small_business: boolean
          tax_status: string
          iban: string | null
          bic: string | null
          paypal_email: string | null
          vat_vies_valid: boolean | null
          vat_vies_checked_at: string | null
          vat_vies_trader_name: string | null
          vat_vies_request_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          legal_name?: string
          street?: string
          postal_code?: string
          city?: string
          country?: string
          tax_number?: string | null
          vat_id?: string | null
          is_small_business?: boolean
          tax_status?: string
          iban?: string | null
          bic?: string | null
          paypal_email?: string | null
          vat_vies_valid?: boolean | null
          vat_vies_checked_at?: string | null
          vat_vies_trader_name?: string | null
          vat_vies_request_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          legal_name?: string
          street?: string
          postal_code?: string
          city?: string
          country?: string
          tax_number?: string | null
          vat_id?: string | null
          is_small_business?: boolean
          tax_status?: string
          iban?: string | null
          bic?: string | null
          paypal_email?: string | null
          vat_vies_valid?: boolean | null
          vat_vies_checked_at?: string | null
          vat_vies_trader_name?: string | null
          vat_vies_request_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      artist_invoices: {
        Row: {
          id: string
          artist_id: string
          invoice_number: string
          artist_invoice_number: string | null
          statement_id: string | null
          client_name: string
          client_email: string
          client_address: string | null
          line_items: { description: string; qty: number; unit_price_cents: number }[]
          currency: string
          tax_rate_pct: number
          status: 'draft' | 'sent' | 'received' | 'partially_paid' | 'paid' | 'cancelled'
          due_date: string | null
          issued_date: string
          notes: string | null
          pdf_url: string | null
          pdf_sha256: string | null
          service_period_start: string | null
          service_period_end: string | null
          fx_rate: number | null
          fx_rate_date: string | null
          fx_rate_source: string | null
          received_at: string | null
          received_by: string | null
          paid_at: string | null
          paid_by: string | null
          paid_amount_cents: number
          outstanding_amount_cents: number | null
          payment_method: 'sepa' | 'paypal' | 'manual' | 'other' | null
          payment_reference: string | null
          settlement_period_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          invoice_number: string
          artist_invoice_number?: string | null
          statement_id?: string | null
          client_name: string
          client_email: string
          client_address?: string | null
          line_items?: { description: string; qty: number; unit_price_cents: number }[]
          currency?: string
          tax_rate_pct?: number
          status?: 'draft' | 'sent' | 'received' | 'partially_paid' | 'paid' | 'cancelled'
          due_date?: string | null
          issued_date?: string
          notes?: string | null
          pdf_url?: string | null
          pdf_sha256?: string | null
          service_period_start?: string | null
          service_period_end?: string | null
          fx_rate?: number | null
          fx_rate_date?: string | null
          fx_rate_source?: string | null
          received_at?: string | null
          received_by?: string | null
          paid_at?: string | null
          paid_by?: string | null
          paid_amount_cents?: number
          outstanding_amount_cents?: number | null
          payment_method?: 'sepa' | 'paypal' | 'manual' | 'other' | null
          payment_reference?: string | null
          settlement_period_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          invoice_number?: string
          artist_invoice_number?: string | null
          statement_id?: string | null
          client_name?: string
          client_email?: string
          client_address?: string | null
          line_items?: { description: string; qty: number; unit_price_cents: number }[]
          currency?: string
          tax_rate_pct?: number
          status?: 'draft' | 'sent' | 'received' | 'partially_paid' | 'paid' | 'cancelled'
          due_date?: string | null
          issued_date?: string
          notes?: string | null
          pdf_url?: string | null
          pdf_sha256?: string | null
          service_period_start?: string | null
          service_period_end?: string | null
          fx_rate?: number | null
          fx_rate_date?: string | null
          fx_rate_source?: string | null
          received_at?: string | null
          received_by?: string | null
          paid_at?: string | null
          paid_by?: string | null
          paid_amount_cents?: number
          outstanding_amount_cents?: number | null
          payment_method?: 'sepa' | 'paypal' | 'manual' | 'other' | null
          payment_reference?: string | null
          settlement_period_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      artist_landing_pages: {
        Row: {
          id: string
          artist_id: string
          document: Record<string, unknown>
          document_version: number
          template_id: string | null
          publish_status: 'draft' | 'pending_review' | 'published' | 'rejected'
          seo_title: string | null
          seo_description: string | null
          og_image_asset_id: string | null
          published_at: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          review_comment: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          document?: Record<string, unknown>
          document_version?: number
          template_id?: string | null
          publish_status?: 'draft' | 'pending_review' | 'published' | 'rejected'
          seo_title?: string | null
          seo_description?: string | null
          og_image_asset_id?: string | null
          published_at?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_comment?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          document?: Record<string, unknown>
          document_version?: number
          template_id?: string | null
          publish_status?: 'draft' | 'pending_review' | 'published' | 'rejected'
          seo_title?: string | null
          seo_description?: string | null
          og_image_asset_id?: string | null
          published_at?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_comment?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_landing_pages_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: true
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_documents: {
        Row: {
          id: string
          artist_id: string
          label: string
          category: string
          file_path: string
          file_size_bytes: number | null
          mime_type: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          label: string
          category?: string
          file_path: string
          file_size_bytes?: number | null
          mime_type?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          label?: string
          category?: string
          file_path?: string
          file_size_bytes?: number | null
          mime_type?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      streaming_stats: {
        Row: {
          id: string
          artist_id: string
          platform: string
          period: string
          streams: number
          created_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          platform: string
          period: string
          streams?: number
          created_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          platform?: string
          period?: string
          streams?: number
          created_at?: string
        }
        Relationships: []
      }
      sales_statements: {
        Row: {
          id: string
          artist_id: string
          filename: string
          r2_key: string
          period: string
          amount_eur: number | null
          status:
            | 'draft'
            | 'label_approved'
            | 'artist_notified'
            | 'viewed'
            | 'invoiced'
            | 'paid'
            | 'superseded'
            | 'cancelled'
            | 'acknowledged'
          label_notes: string | null
          label_approved_at: string | null
          period_start: string | null
          period_end: string | null
          total_streams: number
          batch_id: string | null
          first_viewed_at: string | null
          last_viewed_at: string | null
          view_count: number
          document_type: 'original' | 'correction' | 'storno'
          correction_of_id: string | null
          superseded_by_id: string | null
          version: number
          reporting_currency: string
          amount_reporting: number | null
          fx_rate_to_eur: number | null
          fx_rate_date: string | null
          fx_source: string | null
          settlement_period_id: string | null
          is_archived: boolean
          created_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          filename: string
          r2_key: string
          period: string
          amount_eur?: number | null
          status?:
            | 'draft'
            | 'label_approved'
            | 'artist_notified'
            | 'viewed'
            | 'invoiced'
            | 'paid'
            | 'superseded'
            | 'cancelled'
            | 'acknowledged'
          label_notes?: string | null
          label_approved_at?: string | null
          period_start?: string | null
          period_end?: string | null
          total_streams?: number
          batch_id?: string | null
          first_viewed_at?: string | null
          last_viewed_at?: string | null
          view_count?: number
          document_type?: 'original' | 'correction' | 'storno'
          correction_of_id?: string | null
          superseded_by_id?: string | null
          version?: number
          reporting_currency?: string
          amount_reporting?: number | null
          fx_rate_to_eur?: number | null
          fx_rate_date?: string | null
          fx_source?: string | null
          settlement_period_id?: string | null
          is_archived?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          filename?: string
          r2_key?: string
          period?: string
          amount_eur?: number | null
          status?:
            | 'draft'
            | 'label_approved'
            | 'artist_notified'
            | 'viewed'
            | 'invoiced'
            | 'paid'
            | 'superseded'
            | 'cancelled'
            | 'acknowledged'
          label_notes?: string | null
          label_approved_at?: string | null
          period_start?: string | null
          period_end?: string | null
          total_streams?: number
          batch_id?: string | null
          first_viewed_at?: string | null
          last_viewed_at?: string | null
          view_count?: number
          document_type?: 'original' | 'correction' | 'storno'
          correction_of_id?: string | null
          superseded_by_id?: string | null
          version?: number
          reporting_currency?: string
          amount_reporting?: number | null
          fx_rate_to_eur?: number | null
          fx_rate_date?: string | null
          fx_source?: string | null
          settlement_period_id?: string | null
          is_archived?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_statements_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_import_batches: {
        Row: {
          id: string
          period_start: string
          period_end: string
          distributor: string
          r2_key: string
          file_hash: string | null
          row_count: number
          status: 'uploaded' | 'processing' | 'completed' | 'failed'
          rules_preset_id: string | null
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          period_start: string
          period_end: string
          distributor: string
          r2_key: string
          file_hash?: string | null
          row_count?: number
          status?: 'uploaded' | 'processing' | 'completed' | 'failed'
          rules_preset_id?: string | null
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          period_start?: string
          period_end?: string
          distributor?: string
          r2_key?: string
          file_hash?: string | null
          row_count?: number
          status?: 'uploaded' | 'processing' | 'completed' | 'failed'
          rules_preset_id?: string | null
          uploaded_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      artist_listener_metrics: {
        Row: {
          id: string
          artist_id: string
          source: string
          metric_type: string
          period: string
          value: number
          country: string
          fetched_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          source: string
          metric_type: string
          period: string
          value?: number
          country?: string
          fetched_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          source?: string
          metric_type?: string
          period?: string
          value?: number
          country?: string
          fetched_at?: string
        }
        Relationships: []
      }
      spotify_track_play_snapshots: {
        Row: {
          id: string
          artist_id: string
          release_id: string | null
          spotify_track_id: string
          spotify_album_id: string | null
          track_name: string | null
          play_count: number
          period: string
          scraped_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          release_id?: string | null
          spotify_track_id: string
          spotify_album_id?: string | null
          track_name?: string | null
          play_count?: number
          period: string
          scraped_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          release_id?: string | null
          spotify_track_id?: string
          spotify_album_id?: string | null
          track_name?: string | null
          play_count?: number
          period?: string
          scraped_at?: string
        }
        Relationships: []
      }
      apify_usage_months: {
        Row: {
          year_month: string
          urls_charged: number
          budget: number
          updated_at: string
        }
        Insert: {
          year_month: string
          urls_charged?: number
          budget?: number
          updated_at?: string
        }
        Update: {
          year_month?: string
          urls_charged?: number
          budget?: number
          updated_at?: string
        }
        Relationships: []
      }
      artist_territory_metrics: {
        Row: {
          id: string
          artist_id: string
          period: string
          platform: string
          country: string
          streams: number
          revenue_eur: number
          quantity: number
          source_batch_id: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          period: string
          platform?: string
          country?: string
          streams?: number
          revenue_eur?: number
          quantity?: number
          source_batch_id?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          period?: string
          platform?: string
          country?: string
          streams?: number
          revenue_eur?: number
          quantity?: number
          source_batch_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sales_statement_line_items: {
        Row: {
          id: string
          statement_id: string
          release_id: string | null
          platform: string | null
          country: string | null
          streams: number
          revenue_eur: number
          quantity: number
          amount_original: number | null
          currency_original: string | null
          fx_rate: number | null
          fx_rate_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          statement_id: string
          release_id?: string | null
          platform?: string | null
          country?: string | null
          streams?: number
          revenue_eur?: number
          quantity?: number
          amount_original?: number | null
          currency_original?: string | null
          fx_rate?: number | null
          fx_rate_date?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          statement_id?: string
          release_id?: string | null
          platform?: string | null
          country?: string | null
          streams?: number
          revenue_eur?: number
          quantity?: number
          amount_original?: number | null
          currency_original?: string | null
          fx_rate?: number | null
          fx_rate_date?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_statement_line_items_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_statement_line_items_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "sales_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      event_impact: {
        Row: {
          id: string
          concert_id: string
          artist_id: string
          country: string
          window_days: number
          streams_before: number
          streams_after: number
          delta_streams: number
          delta_pct: number
          revenue_before: number
          revenue_after: number
          calculated_at: string
        }
        Insert: {
          id?: string
          concert_id: string
          artist_id: string
          country: string
          window_days?: number
          streams_before?: number
          streams_after?: number
          delta_streams?: number
          delta_pct?: number
          revenue_before?: number
          revenue_after?: number
          calculated_at?: string
        }
        Update: {
          id?: string
          concert_id?: string
          artist_id?: string
          country?: string
          window_days?: number
          streams_before?: number
          streams_after?: number
          delta_streams?: number
          delta_pct?: number
          revenue_before?: number
          revenue_after?: number
          calculated_at?: string
        }
        Relationships: []
      }
      promo_impact: {
        Row: {
          id: string
          promo_log_id: string
          artist_id: string
          window_days: number
          streams_before: number
          streams_after: number
          delta_streams: number
          delta_pct: number
          revenue_before: number
          revenue_after: number
          calculated_at: string
        }
        Insert: {
          id?: string
          promo_log_id: string
          artist_id: string
          window_days?: number
          streams_before?: number
          streams_after?: number
          delta_streams?: number
          delta_pct?: number
          revenue_before?: number
          revenue_after?: number
          calculated_at?: string
        }
        Update: {
          id?: string
          promo_log_id?: string
          artist_id?: string
          window_days?: number
          streams_before?: number
          streams_after?: number
          delta_streams?: number
          delta_pct?: number
          revenue_before?: number
          revenue_after?: number
          calculated_at?: string
        }
        Relationships: []
      }
      page_events: {
        Row: {
          id: string
          event_type: 'page_view' | 'shop_click' | 'smart_link_click' | 'news_view'
          path: string
          artist_id: string | null
          news_post_id: string | null
          release_id: string | null
          referrer_host: string | null
          session_hash: string | null
          created_at: string
        }
        Insert: {
          id?: string
          event_type: 'page_view' | 'shop_click' | 'smart_link_click' | 'news_view'
          path: string
          artist_id?: string | null
          news_post_id?: string | null
          release_id?: string | null
          referrer_host?: string | null
          session_hash?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          event_type?: 'page_view' | 'shop_click' | 'smart_link_click' | 'news_view'
          path?: string
          artist_id?: string | null
          news_post_id?: string | null
          release_id?: string | null
          referrer_host?: string | null
          session_hash?: string | null
          created_at?: string
        }
        Relationships: []
      }
      merch_orders: {
        Row: {
          id: string
          artist_id: string
          source: 'shopify' | 'darkmerch'
          external_id: string
          period: string
          product_title: string
          country: string
          quantity: number
          revenue_eur: number
          source_batch_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          source: 'shopify' | 'darkmerch'
          external_id: string
          period: string
          product_title?: string
          country?: string
          quantity?: number
          revenue_eur?: number
          source_batch_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          source?: 'shopify' | 'darkmerch'
          external_id?: string
          period?: string
          product_title?: string
          country?: string
          quantity?: number
          revenue_eur?: number
          source_batch_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      releases: {
        Row: {
          id: string
          title: string
          artist_id: string | null
          release_date: string
          cover_art: string | null
          type: 'album' | 'ep' | 'single'
          spotify_url: string | null
          apple_music_url: string | null
          youtube_url: string | null
          bandcamp_url: string | null
          smartlink_url: string | null
          featured: boolean
          featured_until: string | null
          featured_removed_reason: string | null
          itunes_id: string | null
          spotify_id: string | null
          discogs_id: string | null
          isrc: string | null
          barcode: string | null
          catalog_number: string | null
          preview_url: string | null
          smart_url: string | null
          platform_links: Record<string, string> | null
          popularity: number | null
          is_visible: boolean
          is_promo: boolean
          promo_text: string | null
          hero_bg_url: string | null
          hero_primary_btn_label: string | null
          hero_primary_btn_action: string | null
          hero_primary_btn_href: string | null
          hero_secondary_btn_label: string | null
          hero_secondary_btn_action: string | null
          hero_secondary_btn_href: string | null
          guest_artists: string | null
          sync_policy: 'auto' | 'manual_until_street' | 'locked'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          artist_id?: string | null
          release_date: string
          cover_art?: string | null
          type: 'album' | 'ep' | 'single'
          spotify_url?: string | null
          apple_music_url?: string | null
          youtube_url?: string | null
          bandcamp_url?: string | null
          smartlink_url?: string | null
          featured?: boolean
          featured_until?: string | null
          featured_removed_reason?: string | null
          itunes_id?: string | null
          spotify_id?: string | null
          discogs_id?: string | null
          isrc?: string | null
          barcode?: string | null
          catalog_number?: string | null
          preview_url?: string | null
          smart_url?: string | null
          platform_links?: Record<string, string> | null
          popularity?: number | null
          is_visible?: boolean
          is_promo?: boolean
          promo_text?: string | null
          hero_bg_url?: string | null
          hero_primary_btn_label?: string | null
          hero_primary_btn_action?: string | null
          hero_primary_btn_href?: string | null
          hero_secondary_btn_label?: string | null
          hero_secondary_btn_action?: string | null
          hero_secondary_btn_href?: string | null
          guest_artists?: string | null
          sync_policy?: 'auto' | 'manual_until_street' | 'locked'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          artist_id?: string | null
          release_date?: string
          cover_art?: string | null
          type?: 'album' | 'ep' | 'single'
          spotify_url?: string | null
          apple_music_url?: string | null
          youtube_url?: string | null
          bandcamp_url?: string | null
          smartlink_url?: string | null
          featured?: boolean
          featured_until?: string | null
          featured_removed_reason?: string | null
          itunes_id?: string | null
          spotify_id?: string | null
          discogs_id?: string | null
          isrc?: string | null
          barcode?: string | null
          catalog_number?: string | null
          preview_url?: string | null
          smart_url?: string | null
          platform_links?: Record<string, string> | null
          popularity?: number | null
          is_visible?: boolean
          is_promo?: boolean
          promo_text?: string | null
          hero_bg_url?: string | null
          hero_primary_btn_label?: string | null
          hero_primary_btn_action?: string | null
          hero_primary_btn_href?: string | null
          hero_secondary_btn_label?: string | null
          hero_secondary_btn_action?: string | null
          hero_secondary_btn_href?: string | null
          guest_artists?: string | null
          sync_policy?: 'auto' | 'manual_until_street' | 'locked'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      concerts: {
        Row: {
          id: string
          artist_id: string | null
          event_name: string
          venue_name: string | null
          venue_address: string | null
          venue_city: string | null
          venue_country: string | null
          concert_date: string
          ticket_url: string | null
          songkick_id: string | null
          bandsintown_id: string | null
          status: string
          created_by: string | null
          source: string
          created_at: string
          updated_at: string
          event_time: string | null
          event_type: string
          trailer_url: string | null
          venue_lat: number | null
          venue_lng: number | null
          venue_osm_id: string | null
          news_post_id: string | null
        }
        Insert: {
          id?: string
          artist_id?: string | null
          event_name: string
          venue_name?: string | null
          venue_address?: string | null
          venue_city?: string | null
          venue_country?: string | null
          concert_date: string
          ticket_url?: string | null
          songkick_id?: string | null
          bandsintown_id?: string | null
          status?: string
          created_by?: string | null
          source?: string
          created_at?: string
          updated_at?: string
          event_time?: string | null
          event_type?: string
          trailer_url?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          venue_osm_id?: string | null
          news_post_id?: string | null
        }
        Update: {
          id?: string
          artist_id?: string | null
          event_name?: string
          venue_name?: string | null
          venue_address?: string | null
          venue_city?: string | null
          venue_country?: string | null
          concert_date?: string
          ticket_url?: string | null
          songkick_id?: string | null
          bandsintown_id?: string | null
          status?: string
          created_by?: string | null
          source?: string
          created_at?: string
          updated_at?: string
          event_time?: string | null
          event_type?: string
          trailer_url?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          venue_osm_id?: string | null
          news_post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "concerts_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      concert_artists: {
        Row: {
          id: string
          concert_id: string
          artist_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          concert_id: string
          artist_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          concert_id?: string
          artist_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "concert_artists_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concert_artists_concert_id_fkey"
            columns: ["concert_id"]
            isOneToOne: false
            referencedRelation: "concerts"
            referencedColumns: ["id"]
          },
        ]
      }
      tours: {
        Row: {
          id: string
          artist_id: string
          name: string
          description: string | null
          start_date: string | null
          end_date: string | null
          archived: boolean
          sort_order: number
          settings: Json
          route_cache: Json | null
          budget: Json | null
          tech_documents: Json
          currency: string
          total_budget: number | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          name: string
          description?: string | null
          start_date?: string | null
          end_date?: string | null
          archived?: boolean
          sort_order?: number
          settings?: Json
          route_cache?: Json | null
          budget?: Json | null
          tech_documents?: Json
          currency?: string
          total_budget?: number | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          name?: string
          description?: string | null
          start_date?: string | null
          end_date?: string | null
          archived?: boolean
          sort_order?: number
          settings?: Json
          route_cache?: Json | null
          budget?: Json | null
          tech_documents?: Json
          currency?: string
          total_budget?: number | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tour_stops: {
        Row: {
          id: string
          tour_id: string
          artist_id: string
          concert_id: string | null
          sort_order: number
          stop_date: string
          is_travel_day: boolean
          venue_name: string | null
          venue_address: string | null
          venue_city: string | null
          venue_country: string | null
          venue_lat: number | null
          venue_lng: number | null
          venue_validated: boolean
          hotel_name: string | null
          hotel_address: string | null
          hotel_city: string | null
          hotel_country: string | null
          hotel_lat: number | null
          hotel_lng: number | null
          hotel_validated: boolean
          arrival_time: string | null
          show_status: string
          day_schedule: Json | null
          deal: Json | null
          settlement: Json | null
          per_diems: Json
          rooming: Json
          travel_manifest: Json
          venue_details: Json | null
          venue_contact_info: Json | null
          guest_list: Json
          guest_list_limit: number | null
          notes: string | null
          external_guest_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tour_id: string
          artist_id: string
          concert_id?: string | null
          sort_order?: number
          stop_date: string
          is_travel_day?: boolean
          venue_name?: string | null
          venue_address?: string | null
          venue_city?: string | null
          venue_country?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          venue_validated?: boolean
          hotel_name?: string | null
          hotel_address?: string | null
          hotel_city?: string | null
          hotel_country?: string | null
          hotel_lat?: number | null
          hotel_lng?: number | null
          hotel_validated?: boolean
          arrival_time?: string | null
          show_status?: string
          day_schedule?: Json | null
          deal?: Json | null
          settlement?: Json | null
          per_diems?: Json
          rooming?: Json
          travel_manifest?: Json
          venue_details?: Json | null
          venue_contact_info?: Json | null
          guest_list?: Json
          guest_list_limit?: number | null
          notes?: string | null
          external_guest_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tour_id?: string
          artist_id?: string
          concert_id?: string | null
          sort_order?: number
          stop_date?: string
          is_travel_day?: boolean
          venue_name?: string | null
          venue_address?: string | null
          venue_city?: string | null
          venue_country?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          venue_validated?: boolean
          hotel_name?: string | null
          hotel_address?: string | null
          hotel_city?: string | null
          hotel_country?: string | null
          hotel_lat?: number | null
          hotel_lng?: number | null
          hotel_validated?: boolean
          arrival_time?: string | null
          show_status?: string
          day_schedule?: Json | null
          deal?: Json | null
          settlement?: Json | null
          per_diems?: Json
          rooming?: Json
          travel_manifest?: Json
          venue_details?: Json | null
          venue_contact_info?: Json | null
          guest_list?: Json
          guest_list_limit?: number | null
          notes?: string | null
          external_guest_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tour_contacts: {
        Row: {
          id: string
          artist_id: string
          contact_type: string
          name: string
          company: string | null
          email: string | null
          phone: string | null
          address: string | null
          city: string | null
          country: string | null
          last_contact_date: string | null
          notes: string | null
          previous_deals: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          contact_type?: string
          name: string
          company?: string | null
          email?: string | null
          phone?: string | null
          address?: string | null
          city?: string | null
          country?: string | null
          last_contact_date?: string | null
          notes?: string | null
          previous_deals?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          contact_type?: string
          name?: string
          company?: string | null
          email?: string | null
          phone?: string | null
          address?: string | null
          city?: string | null
          country?: string | null
          last_contact_date?: string | null
          notes?: string | null
          previous_deals?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tour_tasks: {
        Row: {
          id: string
          artist_id: string
          tour_id: string | null
          stop_id: string | null
          title: string
          description: string | null
          due_date: string
          priority: string
          completed: boolean
          assigned_to: string | null
          task_type: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          tour_id?: string | null
          stop_id?: string | null
          title: string
          description?: string | null
          due_date: string
          priority?: string
          completed?: boolean
          assigned_to?: string | null
          task_type?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          tour_id?: string | null
          stop_id?: string | null
          title?: string
          description?: string | null
          due_date?: string
          priority?: string
          completed?: boolean
          assigned_to?: string | null
          task_type?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tour_crew_members: {
        Row: {
          id: string
          tour_id: string
          artist_id: string
          name: string
          role: string
          email: string | null
          phone: string | null
          passport_number: string | null
          passport_expiry: string | null
          passport_issue_place: string | null
          date_of_birth: string | null
          nationality: string | null
          visa_info: string | null
          room_assignment: string | null
          bus_assignment: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tour_id: string
          artist_id: string
          name: string
          role?: string
          email?: string | null
          phone?: string | null
          passport_number?: string | null
          passport_expiry?: string | null
          passport_issue_place?: string | null
          date_of_birth?: string | null
          nationality?: string | null
          visa_info?: string | null
          room_assignment?: string | null
          bus_assignment?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tour_id?: string
          artist_id?: string
          name?: string
          role?: string
          email?: string | null
          phone?: string | null
          passport_number?: string | null
          passport_expiry?: string | null
          passport_issue_place?: string | null
          date_of_birth?: string | null
          nationality?: string | null
          visa_info?: string | null
          room_assignment?: string | null
          bus_assignment?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tour_merch_items: {
        Row: {
          id: string
          artist_id: string
          sku: string
          name: string
          category: string
          variants: Json
          base_price: number
          currency: string
          box: string | null
          photo_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          sku: string
          name: string
          category?: string
          variants?: Json
          base_price?: number
          currency?: string
          box?: string | null
          photo_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          sku?: string
          name?: string
          category?: string
          variants?: Json
          base_price?: number
          currency?: string
          box?: string | null
          photo_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tour_merch_settlements: {
        Row: {
          id: string
          stop_id: string
          artist_id: string
          settlement: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          stop_id: string
          artist_id: string
          settlement?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          stop_id?: string
          artist_id?: string
          settlement?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tour_collaborators: {
        Row: {
          tour_id: string
          artist_id: string
          invited_by: string | null
          created_at: string
        }
        Insert: {
          tour_id: string
          artist_id: string
          invited_by?: string | null
          created_at?: string
        }
        Update: {
          tour_id?: string
          artist_id?: string
          invited_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      tour_stop_performing_artists: {
        Row: {
          stop_id: string
          artist_id: string
          created_at: string
        }
        Insert: {
          stop_id: string
          artist_id: string
          created_at?: string
        }
        Update: {
          stop_id?: string
          artist_id?: string
          created_at?: string
        }
        Relationships: []
      }
      tour_stop_artist_private: {
        Row: {
          stop_id: string
          artist_id: string
          deal: Json | null
          settlement: Json | null
          private_notes: string | null
          version: number
          created_at: string
          updated_at: string
        }
        Insert: {
          stop_id: string
          artist_id: string
          deal?: Json | null
          settlement?: Json | null
          private_notes?: string | null
          version?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          stop_id?: string
          artist_id?: string
          deal?: Json | null
          settlement?: Json | null
          private_notes?: string | null
          version?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tour_artist_finance: {
        Row: {
          tour_id: string
          artist_id: string
          budget: Json | null
          total_budget: number | null
          currency: string
          version: number
          created_at: string
          updated_at: string
        }
        Insert: {
          tour_id: string
          artist_id: string
          budget?: Json | null
          total_budget?: number | null
          currency?: string
          version?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          tour_id?: string
          artist_id?: string
          budget?: Json | null
          total_budget?: number | null
          currency?: string
          version?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      news_posts: {
        Row: {
          id: string
          title: string
          slug: string
          excerpt: string | null
          content: string
          image_url: string | null
         featured: boolean
         featured_until: string | null
         featured_removed_reason: string | null
         is_press_only: boolean
          status: string
          published_at: string
          created_at: string
          updated_at: string
          artist_id: string | null
          reviewed_by: string | null
          embargo_until: string | null
          media_contact: string | null
          release_category: string | null
          hero_bg_url: string | null
          hero_primary_btn_label: string | null
          hero_primary_btn_action: string | null
          hero_primary_btn_href: string | null
          hero_secondary_btn_label: string | null
          hero_secondary_btn_action: string | null
          hero_secondary_btn_href: string | null
          published_at_timezone: string | null
        }
        Insert: {
          id?: string
          title: string
          slug: string
          excerpt?: string | null
          content: string
          image_url?: string | null
          featured?: boolean
          featured_until?: string | null
          featured_removed_reason?: string | null
          is_press_only?: boolean
          status?: string
          published_at?: string
          published_at_timezone?: string | null
          created_at?: string
          updated_at?: string
          artist_id?: string | null
          reviewed_by?: string | null
          embargo_until?: string | null
          media_contact?: string | null
          release_category?: string | null
          hero_bg_url?: string | null
          hero_primary_btn_label?: string | null
          hero_primary_btn_action?: string | null
          hero_primary_btn_href?: string | null
          hero_secondary_btn_label?: string | null
          hero_secondary_btn_action?: string | null
          hero_secondary_btn_href?: string | null
        }
        Update: {
          id?: string
          title?: string
          slug?: string
          excerpt?: string | null
          content?: string
          image_url?: string | null
          featured?: boolean
          featured_until?: string | null
          featured_removed_reason?: string | null
          is_press_only?: boolean
          status?: string
          published_at?: string
          published_at_timezone?: string | null
          created_at?: string
          updated_at?: string
          artist_id?: string | null
          reviewed_by?: string | null
          embargo_until?: string | null
          media_contact?: string | null
          release_category?: string | null
          hero_bg_url?: string | null
          hero_primary_btn_label?: string | null
          hero_primary_btn_action?: string | null
          hero_primary_btn_href?: string | null
          hero_secondary_btn_label?: string | null
          hero_secondary_btn_action?: string | null
          hero_secondary_btn_href?: string | null
        }
        Relationships: []
      }
      release_artists: {
        Row: {
          release_id: string
          artist_id: string
          sort_order: number
        }
        Insert: {
          release_id: string
          artist_id: string
          sort_order?: number
        }
        Update: {
          release_id?: string
          artist_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: 'release_artists_release_id_fkey'
            columns: ['release_id']
            isOneToOne: false
            referencedRelation: 'releases'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'release_artists_artist_id_fkey'
            columns: ['artist_id']
            isOneToOne: false
            referencedRelation: 'artists'
            referencedColumns: ['id']
          },
        ]
      }
      news_post_artists: {
        Row: {
          news_post_id: string
          artist_id: string
          sort_order: number
        }
        Insert: {
          news_post_id: string
          artist_id: string
          sort_order?: number
        }
        Update: {
          news_post_id?: string
          artist_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: 'news_post_artists_news_post_id_fkey'
            columns: ['news_post_id']
            isOneToOne: false
            referencedRelation: 'news_posts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'news_post_artists_artist_id_fkey'
            columns: ['artist_id']
            isOneToOne: false
            referencedRelation: 'artists'
            referencedColumns: ['id']
          },
        ]
      }
      videos: {
        Row: {
          id: string
          title: string
          artist_id: string | null
          youtube_id: string
          thumbnail_url: string | null
          is_visible: boolean
          is_short: boolean
          published_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          artist_id?: string | null
          youtube_id: string
          thumbnail_url?: string | null
          is_visible?: boolean
          is_short?: boolean
          published_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          artist_id?: string | null
          youtube_id?: string
          thumbnail_url?: string | null
          is_visible?: boolean
          is_short?: boolean
          published_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "videos_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          id: string
          filename: string
          original_filename: string
          mime_type: string
          size_bytes: number
          r2_key: string
          public_url: string
          uploaded_by: string | null
          created_at: string
          folder_id: string | null
          artist_id: string | null
          tags: string[]
          sha256_hash: string | null
          release_id: string | null
          alt_text: string | null
          is_press_approved: boolean
          press_suggested: boolean
          press_category: string | null
          press_caption: string | null
          photographer_credit: string | null
          downloadable_for_press: boolean
        }
        Insert: {
          id?: string
          filename: string
          original_filename: string
          mime_type: string
          size_bytes: number
          r2_key: string
          public_url: string
          uploaded_by?: string | null
          created_at?: string
          folder_id?: string | null
          artist_id?: string | null
          tags?: string[]
          sha256_hash?: string | null
          release_id?: string | null
          alt_text?: string | null
          is_press_approved?: boolean
          press_suggested?: boolean
          press_category?: string | null
          press_caption?: string | null
          photographer_credit?: string | null
          downloadable_for_press?: boolean
        }
        Update: {
          id?: string
          filename?: string
          original_filename?: string
          mime_type?: string
          size_bytes?: number
          r2_key?: string
          public_url?: string
          uploaded_by?: string | null
          created_at?: string
          folder_id?: string | null
          artist_id?: string | null
          tags?: string[]
          sha256_hash?: string | null
          release_id?: string | null
          alt_text?: string | null
          is_press_approved?: boolean
          press_suggested?: boolean
          press_category?: string | null
          press_caption?: string | null
          photographer_credit?: string | null
          downloadable_for_press?: boolean
        }
        Relationships: []
      }
      asset_artists: {
        Row: {
          asset_id: string
          artist_id: string
        }
        Insert: {
          asset_id: string
          artist_id: string
        }
        Update: {
          asset_id?: string
          artist_id?: string
        }
        Relationships: []
      }
      asset_folders: {
        Row: {
          id: string
          name: string
          parent_id: string | null
          artist_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          parent_id?: string | null
          artist_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          parent_id?: string | null
          artist_id?: string | null
          created_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      media_folders: {
        Row: {
          id: string
          name: string
          parent_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          parent_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          parent_id?: string | null
          created_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      media_files: {
        Row: {
          id: string
          filename: string
          original_filename: string
          mime_type: string
          size_bytes: number
          r2_key: string
          public_url: string
          uploaded_by: string | null
          created_at: string
          folder_id: string | null
          artist_id: string | null
          tags: string[]
          sha256_hash: string | null
        }
        Insert: {
          id?: string
          filename: string
          original_filename: string
          mime_type: string
          size_bytes: number
          r2_key: string
          public_url: string
          uploaded_by?: string | null
          created_at?: string
          folder_id?: string | null
          artist_id?: string | null
          tags?: string[]
          sha256_hash?: string | null
        }
        Update: {
          id?: string
          filename?: string
          original_filename?: string
          mime_type?: string
          size_bytes?: number
          r2_key?: string
          public_url?: string
          uploaded_by?: string | null
          created_at?: string
          folder_id?: string | null
          artist_id?: string | null
          tags?: string[]
          sha256_hash?: string | null
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          value: string
          updated_at: string
        }
        Insert: {
          key: string
          value: string
          updated_at?: string
        }
        Update: {
          key?: string
          value?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          id: string
          artist_id: string | null
          status: 'success' | 'partial' | 'error'
          message: string | null
          releases_synced: number
          errors: string[]
          api_source: string
          rate_limited: boolean
          duration_ms: number | null
          metadata: Record<string, unknown>
          created_at: string
        }
        Insert: {
          id?: string
          artist_id?: string | null
          status: 'success' | 'partial' | 'error'
          message?: string | null
          releases_synced?: number
          errors?: string[]
          api_source?: string
          rate_limited?: boolean
          duration_ms?: number | null
          metadata?: Record<string, unknown>
          created_at?: string
        }
        Update: {
          id?: string
          artist_id?: string | null
          status?: 'success' | 'partial' | 'error'
          message?: string | null
          releases_synced?: number
          errors?: string[]
          api_source?: string
          rate_limited?: boolean
          duration_ms?: number | null
          metadata?: Record<string, unknown>
          created_at?: string
        }
        Relationships: []
      }
      release_checklists: {
        Row: {
          id: string
          artist_id: string
          release_id: string
          task: string
          is_completed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          release_id: string
          task: string
          is_completed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          release_id?: string
          task?: string
          is_completed?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      press_kit_items: {
        Row: {
          id: string
          asset_id: string
          artist_id: string | null
          display_order: number
          created_at: string
        }
        Insert: {
          id?: string
          asset_id: string
          artist_id?: string | null
          display_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          asset_id?: string
          artist_id?: string | null
          display_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "press_kit_items_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "press_kit_items_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      press_photos: {
        Row: {
          id: string
          title: string
          alt_text: string | null
          r2_key: string
          public_url: string
          display_order: number
          category: string
          artist_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          alt_text?: string | null
          r2_key: string
          public_url: string
          display_order?: number
          category?: string
          artist_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          alt_text?: string | null
          r2_key?: string
          public_url?: string
          display_order?: number
          category?: string
          artist_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      promo_tracks: {
        Row: {
          id: string
          title: string
          artist_name: string
          artist_id: string | null
          r2_key: string
          file_size_bytes: number | null
          duration_seconds: number | null
          display_order: number
          genre: string | null
          bpm: number | null
          key: string | null
          release_date: string | null
          nda_required: boolean
          embargo_until: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          artist_name: string
          artist_id?: string | null
          r2_key: string
          file_size_bytes?: number | null
          duration_seconds?: number | null
          display_order?: number
          genre?: string | null
          bpm?: number | null
          key?: string | null
          release_date?: string | null
          nda_required?: boolean
          embargo_until?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          artist_name?: string
          artist_id?: string | null
          r2_key?: string
          file_size_bytes?: number | null
          duration_seconds?: number | null
          display_order?: number
          genre?: string | null
          bpm?: number | null
          key?: string | null
          release_date?: string | null
          nda_required?: boolean
          embargo_until?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'promo_tracks_artist_id_fkey'
            columns: ['artist_id']
            isOneToOne: false
            referencedRelation: 'artists'
            referencedColumns: ['id']
          }
        ]
      }
      journalist_applications: {
        Row: {
          id: string
          user_id: string | null
          email: string
          name: string
          outlet: string
          message: string | null
          website_url: string | null
          reason: string | null
          status: 'pending' | 'approved' | 'rejected'
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          email: string
          name: string
          outlet: string
          message?: string | null
          website_url?: string | null
          reason?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          email?: string
          name?: string
          outlet?: string
          message?: string | null
          website_url?: string | null
          reason?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      portal_feature_flags: {
        Row: {
          id: string
          label: string
          enabled: boolean
          target_role: string
          updated_at: string
        }
        Insert: {
          id: string
          label: string
          enabled?: boolean
          target_role: string
          updated_at?: string
        }
        Update: {
          id?: string
          label?: string
          enabled?: boolean
          target_role?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          id: string
          name: string
          subject: string
          body_html: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          subject?: string
          body_html?: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          subject?: string
          body_html?: string
          created_at?: string
        }
        Relationships: []
      }
      artist_replies: {
        Row: {
          id: string
          message_id: string
          artist_id: string
          body: string
          body_html: string | null
          deleted_at: string | null
          sent_at: string
        }
        Insert: {
          id?: string
          message_id: string
          artist_id: string
          body: string
          body_html?: string | null
          deleted_at?: string | null
          sent_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          artist_id?: string
          body?: string
          body_html?: string | null
          deleted_at?: string | null
          sent_at?: string
        }
        Relationships: []
      }
      message_folders: {
        Row: {
          id: string
          name: string
          icon: string | null
          color: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          icon?: string | null
          color?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          icon?: string | null
          color?: string | null
          created_at?: string
        }
        Relationships: []
      }
      message_rules: {
        Row: {
          id: string
          name: string
          condition_field: string
          condition_operator: string
          condition_value: string
          action_type: string
          action_target: string | null
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          condition_field: string
          condition_operator: string
          condition_value: string
          action_type: string
          action_target?: string | null
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          condition_field?: string
          condition_operator?: string
          condition_value?: string
          action_type?: string
          action_target?: string | null
          active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      message_receipts: {
        Row: {
          message_source: string
          message_id: string
          user_id: string
          read_at: string
        }
        Insert: {
          message_source: string
          message_id: string
          user_id: string
          read_at?: string
        }
        Update: {
          message_source?: string
          message_id?: string
          user_id?: string
          read_at?: string
        }
        Relationships: []
      }
      message_internal_notes: {
        Row: {
          id: string
          message_source: string
          message_id: string
          author_user_id: string
          body: string
          created_at: string
        }
        Insert: {
          id?: string
          message_source: string
          message_id: string
          author_user_id: string
          body: string
          created_at?: string
        }
        Update: {
          id?: string
          message_source?: string
          message_id?: string
          author_user_id?: string
          body?: string
          created_at?: string
        }
        Relationships: []
      }
      message_events: {
        Row: {
          id: string
          message_source: string
          message_id: string
          actor_user_id: string | null
          event_type: string
          payload: Json
          created_at: string
        }
        Insert: {
          id?: string
          message_source: string
          message_id: string
          actor_user_id?: string | null
          event_type: string
          payload?: Json
          created_at?: string
        }
        Update: {
          id?: string
          message_source?: string
          message_id?: string
          actor_user_id?: string | null
          event_type?: string
          payload?: Json
          created_at?: string
        }
        Relationships: []
      }
      message_attachments: {
        Row: {
          id: string
          message_id: string
          filename: string
          url: string
          mime_type: string
          size: number
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          filename: string
          url: string
          mime_type: string
          size?: number
          created_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          filename?: string
          url?: string
          mime_type?: string
          size?: number
          created_at?: string
        }
        Relationships: []
      }
      label_messages: {
        Row: {
          id: string
          artist_id: string
          subject: string
          body: string
          body_html: string | null
          read: boolean
          read_at: string | null
          starred: boolean
          deleted_at: string | null
          sent_at: string
          folder_id: string | null
          sender_email: string | null
          is_external: boolean
          forwarded_from: string | null
          has_attachments: boolean
          sender_user_id: string | null
          client_message_id: string | null
        }
        Insert: {
          id?: string
          artist_id: string
          subject: string
          body: string
          body_html?: string | null
          read?: boolean
          read_at?: string | null
          starred?: boolean
          deleted_at?: string | null
          sent_at?: string
          folder_id?: string | null
          sender_email?: string | null
          is_external?: boolean
          forwarded_from?: string | null
          has_attachments?: boolean
          sender_user_id?: string | null
          client_message_id?: string | null
        }
        Update: {
          id?: string
          artist_id?: string
          subject?: string
          body?: string
          body_html?: string | null
          read?: boolean
          read_at?: string | null
          starred?: boolean
          deleted_at?: string | null
          sent_at?: string
          folder_id?: string | null
          sender_email?: string | null
          is_external?: boolean
          forwarded_from?: string | null
          has_attachments?: boolean
          sender_user_id?: string | null
          client_message_id?: string | null
        }
        Relationships: []
      }
      artist_assets: {
        Row: {
          id: string
          artist_id: string
          filename: string
          original_filename: string
          mime_type: string
          size_bytes: number
          r2_key: string
          public_url: string
          label: string | null
          created_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          filename: string
          original_filename: string
          mime_type: string
          size_bytes: number
          r2_key: string
          public_url: string
          label?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          filename?: string
          original_filename?: string
          mime_type?: string
          size_bytes?: number
          r2_key?: string
          public_url?: string
          label?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_assets_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          }
        ]
      }
      promo_log_entries: {
        Row: {
          id: string
          artist_id: string
          action_date: string
          description: string
          budget_amount: number | null
          budget_currency: string
          proof_url: string | null
          proof_r2_key: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          action_date: string
          description: string
          budget_amount?: number | null
          budget_currency?: string
          proof_url?: string | null
          proof_r2_key?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          action_date?: string
          description?: string
          budget_amount?: number | null
          budget_currency?: string
          proof_url?: string | null
          proof_r2_key?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_log_entries_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          }
        ]
      }
      journalist_downloads: {
        Row: {
          id: string
          journalist_id: string
          release_id: string | null
          asset_id: string | null
          asset_key: string
          downloaded_at: string
        }
        Insert: {
          id?: string
          journalist_id: string
          release_id?: string | null
          asset_id?: string | null
          asset_key: string
          downloaded_at?: string
        }
        Update: {
          id?: string
          journalist_id?: string
          release_id?: string | null
          asset_id?: string | null
          asset_key?: string
          downloaded_at?: string
        }
        Relationships: []
      }
      accreditation_requests: {
        Row: {
          id: string
          journalist_id: string
          event_name: string
          event_date: string
          publication: string
          reason: string
          status: 'pending' | 'approved' | 'rejected'
          admin_note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          journalist_id: string
          event_name: string
          event_date: string
          publication: string
          reason: string
          status?: 'pending' | 'approved' | 'rejected'
          admin_note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          journalist_id?: string
          event_name?: string
          event_date?: string
          publication?: string
          reason?: string
          status?: 'pending' | 'approved' | 'rejected'
          admin_note?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      editor_activity_log: {
        Row: {
          id: string
          editor_id: string
          action: string
          entity_type: string
          entity_id: string
          entity_name: string | null
          changes: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          editor_id: string
          action: string
          entity_type: string
          entity_id: string
          entity_name?: string | null
          changes?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          editor_id?: string
          action?: string
          entity_type?: string
          entity_id?: string
          entity_name?: string | null
          changes?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      editor_notifications: {
        Row: {
          id: string
          recipient_id: string
          type: string
          entity_type: string
          entity_id: string
          entity_name: string | null
          sender_id: string | null
          read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          recipient_id: string
          type: string
          entity_type: string
          entity_id: string
          entity_name?: string | null
          sender_id?: string | null
          read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          recipient_id?: string
          type?: string
          entity_type?: string
          entity_id?: string
          entity_name?: string | null
          sender_id?: string | null
          read?: boolean
          created_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          artist_id: string | null
          type: string
          entity_type: string
          entity_id: string | null
          entity_name: string | null
          sender_id: string | null
          payload: Json
          dedupe_key: string | null
          read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          artist_id?: string | null
          type: string
          entity_type: string
          entity_id?: string | null
          entity_name?: string | null
          sender_id?: string | null
          payload?: Json
          dedupe_key?: string | null
          read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          artist_id?: string | null
          type?: string
          entity_type?: string
          entity_id?: string | null
          entity_name?: string | null
          sender_id?: string | null
          payload?: Json
          dedupe_key?: string | null
          read?: boolean
          created_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          user_id: string
          event_type: string
          in_app: boolean
          email: boolean
          push: boolean
          updated_at: string
        }
        Insert: {
          user_id: string
          event_type: string
          in_app?: boolean
          email?: boolean
          push?: boolean
          updated_at?: string
        }
        Update: {
          user_id?: string
          event_type?: string
          in_app?: boolean
          email?: boolean
          push?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
          created_at: string
          last_seen_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent?: string | null
          created_at?: string
          last_seen_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          user_agent?: string | null
          created_at?: string
          last_seen_at?: string
        }
        Relationships: []
      }
      interview_requests: {
        Row: {
          id: string
          journalist_id: string
          artist_id: string
          subject: string
          message: string
          preferred_date: string | null
          status: string
          artist_reply: string | null
          created_at: string
        }
        Insert: {
          id?: string
          journalist_id: string
          artist_id: string
          subject: string
          message: string
          preferred_date?: string | null
          status?: string
          artist_reply?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          journalist_id?: string
          artist_id?: string
          subject?: string
          message?: string
          preferred_date?: string | null
          status?: string
          artist_reply?: string | null
          created_at?: string
        }
        Relationships: []
      }
      role_changes: {
        Row: {
          id: string
          user_id: string
          old_role: string
          new_role: string
          changed_by: string
          changed_at: string
          reason: string | null
          ip_address: string | null
        }
        Insert: {
          id?: string
          user_id: string
          old_role: string
          new_role: string
          changed_by: string
          changed_at?: string
          reason?: string | null
          ip_address?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          old_role?: string
          new_role?: string
          changed_by?: string
          changed_at?: string
          reason?: string | null
          ip_address?: string | null
        }
        Relationships: []
      }
      ban_history: {
        Row: {
          id: string
          user_id: string
          banned: boolean
          banned_until: string | null
          changed_by: string
          changed_at: string
          reason: string | null
        }
        Insert: {
          id?: string
          user_id: string
          banned: boolean
          banned_until?: string | null
          changed_by: string
          changed_at?: string
          reason?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          banned?: boolean
          banned_until?: string | null
          changed_by?: string
          changed_at?: string
          reason?: string | null
        }
        Relationships: []
      }
      custom_permission_definitions: {
        Row: {
          id: string
          name: string
          label: string
          description: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          label: string
          description?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          label?: string
          description?: string | null
          created_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      custom_roles: {
        Row: {
          id: string
          name: string
          label: string
          description: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          label: string
          description?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          label?: string
          description?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      custom_role_permissions: {
        Row: {
          role_id: string
          permission_name: string
        }
        Insert: {
          role_id: string
          permission_name: string
        }
        Update: {
          role_id?: string
          permission_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          }
        ]
      }
      user_custom_roles: {
        Row: {
          user_id: string
          role_id: string
          assigned_by: string | null
          assigned_at: string
        }
        Insert: {
          user_id: string
          role_id: string
          assigned_by?: string | null
          assigned_at?: string
        }
        Update: {
          user_id?: string
          role_id?: string
          assigned_by?: string | null
          assigned_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_custom_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_custom_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rbac_audit_log: {
        Row: {
          id: string
          actor_id: string | null
          action: string
          target_type: string
          target_id: string | null
          old_value: Record<string, unknown> | null
          new_value: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id?: string | null
          action: string
          target_type: string
          target_id?: string | null
          old_value?: Record<string, unknown> | null
          new_value?: Record<string, unknown> | null
          created_at?: string
        }
        Update: {
          id?: string
          actor_id?: string | null
          action?: string
          target_type?: string
          target_id?: string | null
          old_value?: Record<string, unknown> | null
          new_value?: Record<string, unknown> | null
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          id: string
          actor_id: string | null
          action: string
          resource: string
          resource_id: string | null
          details: Record<string, unknown> | null
          ip_address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id?: string | null
          action: string
          resource: string
          resource_id?: string | null
          details?: Record<string, unknown> | null
          ip_address?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          actor_id?: string | null
          action?: string
          resource?: string
          resource_id?: string | null
          details?: Record<string, unknown> | null
          ip_address?: string | null
        }
        Relationships: []
      }
      release_submissions: {
        Row: {
          id: string
          artist_id: string
          status: 'received' | 'reviewed' | 'accepted' | 'rejected'
          title: string
          release_date: string | null
          type: 'album' | 'ep' | 'single' | 'compilation' | null
          genre: string | null
          catalog_number: string | null
          isrc: string | null
          label_copy: string | null
          audio_download_url: string
          cover_art_url: string
          cover_art_verified: boolean
          spotify_url: string | null
          apple_music_url: string | null
          youtube_url: string | null
          notes: string | null
          form_data: Record<string, unknown> | null
          admin_reply: string | null
          admin_reply_at: string | null
          progress_note: string | null
          release_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          status?: 'received' | 'reviewed' | 'accepted' | 'rejected'
          title: string
          release_date?: string | null
          type?: 'album' | 'ep' | 'single' | 'compilation' | null
          genre?: string | null
          catalog_number?: string | null
          isrc?: string | null
          label_copy?: string | null
          audio_download_url: string
          cover_art_url: string
          cover_art_verified?: boolean
          spotify_url?: string | null
          apple_music_url?: string | null
          youtube_url?: string | null
          notes?: string | null
          form_data?: Record<string, unknown> | null
          admin_reply?: string | null
          admin_reply_at?: string | null
          progress_note?: string | null
          release_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          status?: 'received' | 'reviewed' | 'accepted' | 'rejected'
          title?: string
          release_date?: string | null
          type?: 'album' | 'ep' | 'single' | 'compilation' | null
          genre?: string | null
          catalog_number?: string | null
          isrc?: string | null
          label_copy?: string | null
          audio_download_url?: string
          cover_art_url?: string
          cover_art_verified?: boolean
          spotify_url?: string | null
          apple_music_url?: string | null
          youtube_url?: string | null
          notes?: string | null
          form_data?: Record<string, unknown> | null
          admin_reply?: string | null
          admin_reply_at?: string | null
          progress_note?: string | null
          release_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      release_submission_tracks: {
        Row: {
          id: string
          submission_id: string
          track_number: number
          title: string | null
          isrc: string | null
          composer: string | null
          author: string | null
          genre: string | null
          language: string | null
          gema: boolean | null
          explicit: boolean | null
          live: boolean | null
          cover: boolean | null
          instrumental: boolean | null
          preview_start_seconds: number | null
          duration_seconds: number | null
          form_data: Record<string, unknown> | null
          display_order: number
          created_at: string
        }
        Insert: {
          id?: string
          submission_id: string
          track_number: number
          title?: string | null
          isrc?: string | null
          composer?: string | null
          author?: string | null
          genre?: string | null
          language?: string | null
          gema?: boolean | null
          explicit?: boolean | null
          live?: boolean | null
          cover?: boolean | null
          instrumental?: boolean | null
          preview_start_seconds?: number | null
          duration_seconds?: number | null
          form_data?: Record<string, unknown> | null
          display_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          submission_id?: string
          track_number?: number
          title?: string | null
          isrc?: string | null
          composer?: string | null
          author?: string | null
          genre?: string | null
          language?: string | null
          gema?: boolean | null
          explicit?: boolean | null
          live?: boolean | null
          cover?: boolean | null
          instrumental?: boolean | null
          preview_start_seconds?: number | null
          duration_seconds?: number | null
          form_data?: Record<string, unknown> | null
          display_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'release_submission_tracks_submission_id_fkey'
            columns: ['submission_id']
            isOneToOne: false
            referencedRelation: 'release_submissions'
            referencedColumns: ['id']
          },
        ]
      }
      video_submissions: {
        Row: {
          id: string
          artist_id: string
          status: 'received' | 'reviewed' | 'accepted' | 'rejected'
          title: string
          description: string | null
          download_url: string
          thumbnail_url: string | null
          youtube_title: string | null
          youtube_description: string | null
          youtube_tags: string[]
          youtube_category: string | null
          target_publish_date: string | null
          notes: string | null
          form_data: Record<string, unknown> | null
          admin_reply: string | null
          admin_reply_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          status?: 'received' | 'reviewed' | 'accepted' | 'rejected'
          title: string
          description?: string | null
          download_url: string
          thumbnail_url?: string | null
          youtube_title?: string | null
          youtube_description?: string | null
          youtube_tags?: string[]
          youtube_category?: string | null
          target_publish_date?: string | null
          notes?: string | null
          form_data?: Record<string, unknown> | null
          admin_reply?: string | null
          admin_reply_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          status?: 'received' | 'reviewed' | 'accepted' | 'rejected'
          title?: string
          description?: string | null
          download_url?: string
          thumbnail_url?: string | null
          youtube_title?: string | null
          youtube_description?: string | null
          youtube_tags?: string[]
          youtube_category?: string | null
          target_publish_date?: string | null
          notes?: string | null
          form_data?: Record<string, unknown> | null
          admin_reply?: string | null
          admin_reply_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      submission_form_drafts: {
        Row: {
          id: string
          artist_id: string
          user_id: string
          form_type: 'release' | 'video'
          payload: Record<string, unknown>
          updated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          user_id: string
          form_type: 'release' | 'video'
          payload?: Record<string, unknown>
          updated_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          user_id?: string
          form_type?: 'release' | 'video'
          payload?: Record<string, unknown>
          updated_at?: string
          created_at?: string
        }
        Relationships: []
      }
      submission_form_schema: {
        Row: {
          id: string
          form_type: 'release' | 'video'
          field_key: string
          field_label_en: string
          field_label_de: string
          field_type:
            | 'text'
            | 'url'
            | 'date'
            | 'date_dmy'
            | 'select'
            | 'textarea'
            | 'boolean'
            | 'number'
            | 'year'
            | 'ean'
            | 'isrc'
            | 'duration'
            | 'seconds'
            | 'email'
          field_scope: 'release' | 'track'
          field_group: string | null
          field_options: Record<string, unknown> | null
          visibility_condition: Record<string, unknown> | null
          type_rules: Record<string, unknown> | null
          validation: Record<string, unknown> | null
          is_required: boolean
          is_visible: boolean
          display_order: number
          placeholder_en: string | null
          placeholder_de: string | null
        }
        Insert: {
          id?: string
          form_type: 'release' | 'video'
          field_key: string
          field_label_en: string
          field_label_de: string
          field_type:
            | 'text'
            | 'url'
            | 'date'
            | 'date_dmy'
            | 'select'
            | 'textarea'
            | 'boolean'
            | 'number'
            | 'year'
            | 'ean'
            | 'isrc'
            | 'duration'
            | 'seconds'
            | 'email'
          field_scope?: 'release' | 'track'
          field_group?: string | null
          field_options?: Record<string, unknown> | null
          visibility_condition?: Record<string, unknown> | null
          type_rules?: Record<string, unknown> | null
          validation?: Record<string, unknown> | null
          is_required?: boolean
          is_visible?: boolean
          display_order?: number
          placeholder_en?: string | null
          placeholder_de?: string | null
        }
        Update: {
          id?: string
          form_type?: 'release' | 'video'
          field_key?: string
          field_label_en?: string
          field_label_de?: string
          field_type?:
            | 'text'
            | 'url'
            | 'date'
            | 'date_dmy'
            | 'select'
            | 'textarea'
            | 'boolean'
            | 'number'
            | 'year'
            | 'ean'
            | 'isrc'
            | 'duration'
            | 'seconds'
            | 'email'
          field_scope?: 'release' | 'track'
          field_group?: string | null
          field_options?: Record<string, unknown> | null
          visibility_condition?: Record<string, unknown> | null
          type_rules?: Record<string, unknown> | null
          validation?: Record<string, unknown> | null
          is_required?: boolean
          is_visible?: boolean
          display_order?: number
          placeholder_en?: string | null
          placeholder_de?: string | null
        }
        Relationships: []
      }
      portal_faq_categories: {
        Row: {
          id: string
          slug: string
          title_en: string
          title_de: string | null
          sort_order: number
          is_published: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          title_en: string
          title_de?: string | null
          sort_order?: number
          is_published?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          title_en?: string
          title_de?: string | null
          sort_order?: number
          is_published?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      portal_faq_items: {
        Row: {
          id: string
          category_id: string
          slug: string
          question_en: string
          question_de: string | null
          answer_html_en: string
          answer_html_de: string | null
          keywords: string[]
          portal_route: string | null
          sort_order: number
          is_published: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          category_id: string
          slug: string
          question_en: string
          question_de?: string | null
          answer_html_en: string
          answer_html_de?: string | null
          keywords?: string[]
          portal_route?: string | null
          sort_order?: number
          is_published?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          category_id?: string
          slug?: string
          question_en?: string
          question_de?: string | null
          answer_html_en?: string
          answer_html_de?: string | null
          keywords?: string[]
          portal_route?: string | null
          sort_order?: number
          is_published?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_faq_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "portal_faq_categories"
            referencedColumns: ["id"]
          }
        ]
      }
      submission_release_type_rules: {
        Row: {
          id: string
          release_type: 'single' | 'ep' | 'album' | 'compilation'
          track_count_mode: 'fixed_1' | 'user_specified'
          min_tracks: number
          max_tracks: number
          display_order: number
        }
        Insert: {
          id?: string
          release_type: 'single' | 'ep' | 'album' | 'compilation'
          track_count_mode: 'fixed_1' | 'user_specified'
          min_tracks?: number
          max_tracks?: number
          display_order?: number
        }
        Update: {
          id?: string
          release_type?: 'single' | 'ep' | 'album' | 'compilation'
          track_count_mode?: 'fixed_1' | 'user_specified'
          min_tracks?: number
          max_tracks?: number
          display_order?: number
        }
        Relationships: []
      }
      portal_feedback: {
        Row: {
          id: string
          artist_id: string
          user_id: string
          category: 'bug' | 'feature' | 'ux' | 'general' | 'praise'
          rating: number | null
          subject: string | null
          message: string
          status: 'new' | 'reviewed' | 'archived'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          user_id: string
          category: 'bug' | 'feature' | 'ux' | 'general' | 'praise'
          rating?: number | null
          subject?: string | null
          message: string
          status?: 'new' | 'reviewed' | 'archived'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          user_id?: string
          category?: 'bug' | 'feature' | 'ux' | 'general' | 'praise'
          rating?: number | null
          subject?: string | null
          message?: string
          status?: 'new' | 'reviewed' | 'archived'
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_feedback_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          }
        ]
      }
      support_known_errors: {
        Row: {
          id: string
          fingerprint: string
          label: string
          notes: string | null
          active: boolean
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          fingerprint: string
          label: string
          notes?: string | null
          active?: boolean
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          fingerprint?: string
          label?: string
          notes?: string | null
          active?: boolean
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_known_errors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      zammad_ticket_log: {
        Row: {
          id: string
          fingerprint: string | null
          ticket_type: 'manual' | 'auto_error'
          status:
            | 'sent'
            | 'skipped'
            | 'failed'
            | 'blocked_known'
            | 'blocked_duplicate'
            | 'blocked_unconfigured'
          zammad_ticket_id: number | null
          user_id: string | null
          customer_email: string | null
          customer_name: string | null
          title: string
          view_path: string | null
          error_source: string | null
          details: Record<string, unknown>
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          fingerprint?: string | null
          ticket_type: 'manual' | 'auto_error'
          status:
            | 'sent'
            | 'skipped'
            | 'failed'
            | 'blocked_known'
            | 'blocked_duplicate'
            | 'blocked_unconfigured'
          zammad_ticket_id?: number | null
          user_id?: string | null
          customer_email?: string | null
          customer_name?: string | null
          title: string
          view_path?: string | null
          error_source?: string | null
          details?: Record<string, unknown>
          error_message?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          fingerprint?: string | null
          ticket_type?: 'manual' | 'auto_error'
          status?:
            | 'sent'
            | 'skipped'
            | 'failed'
            | 'blocked_known'
            | 'blocked_duplicate'
            | 'blocked_unconfigured'
          zammad_ticket_id?: number | null
          user_id?: string | null
          customer_email?: string | null
          customer_name?: string | null
          title?: string
          view_path?: string | null
          error_source?: string | null
          details?: Record<string, unknown>
          error_message?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "zammad_ticket_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      user_roles: {
        Row: {
          id: string
          user_id: string
          role: 'admin' | 'editor' | 'journalist' | 'user' | 'artist' | 'press'
          granted_at: string
          granted_by: string | null
        }
        Insert: {
          id?: string
          user_id: string
          role: 'admin' | 'editor' | 'journalist' | 'user' | 'artist' | 'press'
          granted_at?: string
          granted_by?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          role?: 'admin' | 'editor' | 'journalist' | 'user' | 'artist' | 'press'
          granted_at?: string
          granted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      portal_message_folders: {
        Row: {
          id: string
          artist_id: string
          name: string
          color: string | null
          icon: string | null
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          name: string
          color?: string | null
          icon?: string | null
          position?: number
          created_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          name?: string
          color?: string | null
          icon?: string | null
          position?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_message_folders_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          }
        ]
      }
      portal_messages: {
        Row: {
          id: string
          from_artist_id: string
          to_artist_id: string | null
          to_label: boolean
          subject: string
          body: string
          body_html: string | null
          sent_at: string
          read_at: string | null
          starred: boolean
          deleted_at: string | null
          folder_id: string | null
          has_attachments: boolean
          sender_user_id: string | null
          client_message_id: string | null
          assignee_user_id: string | null
          priority: string
          tags: string[]
          search_vector: string | null
        }
        Insert: {
          id?: string
          from_artist_id: string
          to_artist_id?: string | null
          to_label?: boolean
          subject?: string
          body?: string
          body_html?: string | null
          sent_at?: string
          read_at?: string | null
          starred?: boolean
          deleted_at?: string | null
          folder_id?: string | null
          has_attachments?: boolean
          sender_user_id?: string | null
          client_message_id?: string | null
          assignee_user_id?: string | null
          priority?: string
          tags?: string[]
        }
        Update: {
          id?: string
          from_artist_id?: string
          to_artist_id?: string | null
          to_label?: boolean
          subject?: string
          body?: string
          body_html?: string | null
          sent_at?: string
          read_at?: string | null
          starred?: boolean
          deleted_at?: string | null
          folder_id?: string | null
          has_attachments?: boolean
          sender_user_id?: string | null
          client_message_id?: string | null
          assignee_user_id?: string | null
          priority?: string
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "portal_messages_from_artist_id_fkey"
            columns: ["from_artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_messages_to_artist_id_fkey"
            columns: ["to_artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          }
        ]
      }
      portal_message_attachments: {
        Row: {
          id: string
          message_id: string
          file_url: string
          file_name: string
          file_size: number | null
          mime_type: string | null
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          file_url: string
          file_name: string
          file_size?: number | null
          mime_type?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          file_url?: string
          file_name?: string
          file_size?: number | null
          mime_type?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "portal_messages"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      get_assets_storage_stats: {
        Args: Record<string, never>
        /** JSON object: used_bytes, asset_count, zero_size_count */
        Returns: {
          used_bytes: number
          asset_count: number
          zero_size_count: number
        }
      }
    }
    Enums: {
      sync_status: 'success' | 'partial' | 'error'
      sync_api_source: 'itunes' | 'spotify' | 'discogs' | 'songkick' | 'odesli' | 'all'
      submission_status: 'received' | 'reviewed' | 'accepted' | 'rejected'
    }
  }
}
