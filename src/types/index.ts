export interface Artist {
  id: string
  name: string
  slug: string
  bio: string
  genres: string[]
  imageUrl: string
  spotifyUrl?: string
  instagramUrl?: string
  youtubeUrl?: string
  websiteUrl?: string
  featured: boolean
  country?: string
  email?: string
  vatNumber?: string
  isEuNonGerman?: boolean
  notes?: string
  spotifyId?: string
  discogsId?: string
  songkickId?: string
  lastSyncedAt?: string
}

export interface Release {
  id: string
  title: string
  artistId: string
  artistName: string
  releaseDate: string
  coverArt: string
  type: 'album' | 'ep' | 'single'
  spotifyUrl?: string
  appleMusicUrl?: string
  youtubeUrl?: string
  featured: boolean
  itunesId?: string
}

export interface NewsPost {
  id: string
  title: string
  excerpt: string
  content: string
  publishedAt: string
  imageUrl?: string
  slug: string
}

export interface Video {
  id: string
  title: string
  artistName: string
  youtubeId: string
  thumbnailUrl: string
  publishedAt: string
}

export interface UserProfile {
  id: string
  email: string
  role: 'admin' | 'editor' | 'user'
  createdAt: string
  updatedAt: string
}

export interface Asset {
  id: string
  filename: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
  r2Key: string
  publicUrl: string
  uploadedBy?: string
  createdAt: string
}

export interface Concert {
  id: string
  artistId: string | null
  artistName: string
  eventName: string
  venueName?: string
  city?: string
  country?: string
  eventDate: string
  ticketUrl?: string
  songkickId?: string
  status: 'upcoming' | 'past' | 'cancelled'
  createdAt: string
  updatedAt: string
}

export interface SyncLog {
  id: string
  artistId: string | null
  triggeredBy: 'manual' | 'cron'
  status: 'pending' | 'success' | 'partial' | 'error'
  details: Record<string, unknown> | null
  createdAt: string
}
