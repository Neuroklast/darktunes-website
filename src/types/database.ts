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
      profiles: {
        Row: {
          id: string
          email: string
          role: 'admin' | 'editor' | 'user'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          role?: 'admin' | 'editor' | 'user'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          role?: 'admin' | 'editor' | 'user'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
          instagram_url: string | null
          youtube_url: string | null
          website_url: string | null
          featured: boolean
          country: string | null
          email: string | null
          vat_number: string | null
          is_eu_non_german: boolean
          notes: string | null
          spotify_id: string | null
          discogs_id: string | null
          songkick_id: string | null
          last_synced_at: string | null
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
          instagram_url?: string | null
          youtube_url?: string | null
          website_url?: string | null
          featured?: boolean
          country?: string | null
          email?: string | null
          vat_number?: string | null
          is_eu_non_german?: boolean
          notes?: string | null
          spotify_id?: string | null
          discogs_id?: string | null
          songkick_id?: string | null
          last_synced_at?: string | null
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
          instagram_url?: string | null
          youtube_url?: string | null
          website_url?: string | null
          featured?: boolean
          country?: string | null
          email?: string | null
          vat_number?: string | null
          is_eu_non_german?: boolean
          notes?: string | null
          spotify_id?: string | null
          discogs_id?: string | null
          songkick_id?: string | null
          last_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      releases: {
        Row: {
          id: string
          title: string
          artist_id: string | null
          artist_name: string
          release_date: string
          cover_art: string | null
          type: 'album' | 'ep' | 'single'
          spotify_url: string | null
          apple_music_url: string | null
          youtube_url: string | null
          featured: boolean
          itunes_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          artist_id?: string | null
          artist_name: string
          release_date: string
          cover_art?: string | null
          type: 'album' | 'ep' | 'single'
          spotify_url?: string | null
          apple_music_url?: string | null
          youtube_url?: string | null
          featured?: boolean
          itunes_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          artist_id?: string | null
          artist_name?: string
          release_date?: string
          cover_art?: string | null
          type?: 'album' | 'ep' | 'single'
          spotify_url?: string | null
          apple_music_url?: string | null
          youtube_url?: string | null
          featured?: boolean
          itunes_id?: string | null
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
          published_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          slug: string
          excerpt?: string | null
          content: string
          image_url?: string | null
          published_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          slug?: string
          excerpt?: string | null
          content?: string
          image_url?: string | null
          published_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      videos: {
        Row: {
          id: string
          title: string
          artist_name: string
          youtube_id: string
          thumbnail_url: string | null
          published_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          artist_name: string
          youtube_id: string
          thumbnail_url?: string | null
          published_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          artist_name?: string
          youtube_id?: string
          thumbnail_url?: string | null
          published_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          id: string
          artist_id: string | null
          triggered_by: 'manual' | 'cron'
          status: 'pending' | 'success' | 'partial' | 'error'
          details: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          artist_id?: string | null
          triggered_by?: 'manual' | 'cron'
          status?: 'pending' | 'success' | 'partial' | 'error'
          details?: Record<string, unknown> | null
          created_at?: string
        }
        Update: {
          id?: string
          artist_id?: string | null
          triggered_by?: 'manual' | 'cron'
          status?: 'pending' | 'success' | 'partial' | 'error'
          details?: Record<string, unknown> | null
          created_at?: string
        }
        Relationships: []
      }
      concerts: {
        Row: {
          id: string
          artist_id: string | null
          artist_name: string
          event_name: string
          venue_name: string | null
          city: string | null
          country: string | null
          event_date: string
          ticket_url: string | null
          songkick_id: string | null
          status: 'upcoming' | 'past' | 'cancelled'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          artist_id?: string | null
          artist_name: string
          event_name: string
          venue_name?: string | null
          city?: string | null
          country?: string | null
          event_date: string
          ticket_url?: string | null
          songkick_id?: string | null
          status?: 'upcoming' | 'past' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          artist_id?: string | null
          artist_name?: string
          event_name?: string
          venue_name?: string | null
          city?: string | null
          country?: string | null
          event_date?: string
          ticket_url?: string | null
          songkick_id?: string | null
          status?: 'upcoming' | 'past' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
