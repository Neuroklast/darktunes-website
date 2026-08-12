export interface Artist {
  id: string
  name: string
  slug: string
  bio: string
  genres: string[]
  imageUrl: string
  /** Optional logo/wordmark image URL shown on hover in the artists grid. */
  logoUrl?: string
  spotifyUrl?: string
  appleMusicUrl?: string
  instagramUrl?: string
  youtubeUrl?: string
  websiteUrl?: string
  facebookUrl?: string
  twitterUrl?: string
  tiktokUrl?: string
  bandcampUrl?: string
  shopUrl?: string
  soundcloudUrl?: string
  /** When true, this artist is guaranteed to appear in the homepage Artists section regardless of shuffle. */
  featured: boolean
  country?: string
  foundedYear?: number
  hometown?: string
  email?: string
  vatNumber?: string
  isEuNonGerman?: boolean
  notes?: string
  spotifyId?: string
  discogsId?: string
  songkickId?: string
  bandsintownId?: string
  bandsintownApiKey?: string
  lastfmName?: string
  soundchartsId?: string
  lastSyncedAt?: string
  isVisible: boolean
  /** When true, artist may publish Fan Pages without label review. */
  landingPublishTrusted?: boolean
  /** Per-platform streaming URLs resolved via the Odesli API (Deezer, Tidal, Amazon Music, etc.) */
  platformLinks?: Record<string, string>
  /** Admin-configured storage quota in bytes. NULL = use system default (no limit). */
  storageQuotaBytes?: number | null
  /** Custom smart links shown on the artist profile (e.g. Linktree-style). */
  smartLinks?: Array<{ label: string; url: string }>
  /** Supabase Auth user ID linked to this artist (null if not yet invited/linked). */
  userId?: string | null
  /** Horizontal focal point for the portrait image (0–100%, default 50). */
  imagePositionX?: number | null
  /** Vertical focal point for the portrait image (0–100%, default 50). */
  imagePositionY?: number | null
  /** Zoom scale for the portrait image (≥1, default 1). */
  imageScale?: number | null
  /** Portal AGB version last accepted for this artist (billing terms). */
  portalTermsVersion?: string | null
  portalTermsAcceptedAt?: string | null
  portalTermsAcceptedBy?: string | null
}

export interface SyncLog {
  id: string
  artistId: string | null
  status: 'success' | 'partial' | 'error'
  message: string | null
  releasesSynced: number
  errors: string[]
  apiSource: string
  rateLimited: boolean
  durationMs?: number | null
  metadata?: Record<string, unknown>
  createdAt: string
}

/**
 * Configuration for a single CTA button in the Hero section.
 * When omitted, the Hero falls back to its default behaviour.
 */
export interface HeroButton {
  /** Custom label. Falls back to the dictionary key when empty/undefined. */
  label?: string
  /** How the button behaves: navigate to a URL, scroll to a page section, or hide it entirely. */
  action?: 'link' | 'scroll' | 'none'
  /**
   * For action='link'  : absolute or relative URL (e.g. '/releases/abc', 'https://open.spotify.com/…').
   * For action='scroll': CSS selector of the target section (e.g. '#releases').
   */
  href?: string
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
  bandcampUrl?: string
  smartlinkUrl?: string
  featured: boolean
  /** Optional hero feature expiry. When passed, featured is turned off automatically. */
  featuredUntil?: string | null
  /** Why the item was auto-removed from the hero carousel. */
  featuredRemovedReason?: 'expired' | 'capacity' | null
  itunesId?: string
  spotifyId?: string
  discogsId?: string
  isrc?: string
  barcode?: string
  catalogNumber?: string
  previewUrl?: string
  smartUrl?: string
  /** Per-platform streaming URLs resolved via the Odesli API (Deezer, Tidal, Amazon Music, etc.) */
  platformLinks?: Record<string, string>
  popularity?: number
  isVisible: boolean
  /**
   * How external sync may update this row:
   * - auto: normal merge
   * - manual_until_street: no fuzzy merge before release_date
   * - locked: never fuzzy-merge
   * Defaults to auto when omitted (legacy fixtures / partial objects).
   */
  syncPolicy?: 'auto' | 'manual_until_street' | 'locked'
  /** When true, this release is only visible in the journalist Promo Pool and never shown on the public homepage. */
  isPromo: boolean
  /** Optional promo/teaser text shown in the Hero section when this release is featured. */
  promoText?: string
  /** Optional hero background image URL, different from the release cover art. */
  heroBgUrl?: string
  /** Custom configuration for the primary CTA button in the Hero section. */
  heroPrimaryBtn?: HeroButton
  /** Custom configuration for the secondary CTA button in the Hero section. */
  heroSecondaryBtn?: HeroButton
  /**
   * All artists credited on this release (from the release_artists junction table).
   * Ordered by sort_order. Falls back to the primary artist when the junction table
   * has no entries (backwards compatibility).
   */
  artists?: { id: string; name: string; slug: string }[]
  /**
   * Free-text field for non-roster guest artists (e.g. remixes, features).
   * Examples: "feat. John Doe", "Remix by XYZ"
   */
  guestArtists?: string
}

export interface NewsPost {
  id: string
  title: string
  excerpt: string
  content: string
  publishedAt: string
  /** IANA timezone used when scheduling (e.g. Europe/Berlin). */
  publishedAtTimezone?: string
  imageUrl?: string
  slug: string
  featured: boolean
  /** Optional hero feature expiry. When passed, featured is turned off automatically. */
  featuredUntil?: string | null
  /** Why the post was auto-removed from the hero carousel. */
  featuredRemovedReason?: 'expired' | 'capacity' | null
  isPressOnly: boolean
  /**
   * Optional artist association. When set, this news post is shown only on that
   * artist's profile page and not under any other artist.
   */
  artistId?: string | null
  /**
   * Post lifecycle status:
   * - `draft`     — only visible to admins/editors
   * - `published` — public (and `published_at` ≤ now)
   * - `scheduled` — will become public at `published_at` (which is in the future)
   * - `archived`  — removed from public view, kept for record
   */
  status: 'draft' | 'published' | 'scheduled' | 'archived'
  /** Optional embargo timestamp — content is hidden until this time passes */
  embargoUntil?: string | null
  /** Contact person/email for this press release */
  mediaContact?: string | null
  /** Category of press release, e.g. "album announcement", "tour", "label news" */
  releaseCategory?: string | null
  /** Optional hero background image URL, separate from the cover imageUrl. */
  heroBgUrl?: string
  /** Custom configuration for the primary CTA button in the Hero section. */
  heroPrimaryBtn?: HeroButton
  /** Custom configuration for the secondary CTA button in the Hero section. */
  heroSecondaryBtn?: HeroButton
  /** Reviewer (editor/admin) that approved the post for publication. */
  reviewedBy?: string | null
  /**
   * All artists associated with this news post (from the news_post_artists junction table).
   * Ordered by sort_order. Falls back to the single artistId when no junction rows exist.
   */
  artists?: { id: string; name: string; slug: string }[]
}

export interface PortalFeatureFlag {
  id: string
  label: string
  enabled: boolean
  targetRole: 'artist' | 'journalist'
  updatedAt: string
}

export interface LabelMessage {
  id: string
  artistId: string
  subject: string
  body: string
  bodyHtml?: string | null
  read: boolean
  readAt?: string | null
  starred?: boolean
  deletedAt?: string | null
  sentAt: string
  /** Custom folder the message belongs to (null = Inbox). */
  folderId?: string | null
  /** Sender email address (for external/incoming messages). */
  senderEmail?: string | null
  /** True if this message was sent to/from an external email address. */
  isExternal?: boolean
  /** ID of the original message this was forwarded from. */
  forwardedFrom?: string | null
  /** True when the message has associated file attachments. */
  hasAttachments?: boolean
  /** Auth user who sent on behalf of the label (when known). */
  senderUserId?: string | null
  /** Client-supplied idempotency id for send retries. */
  clientMessageId?: string | null
}

export interface ArtistReply {
  id: string
  messageId: string
  artistId: string
  body: string
  bodyHtml?: string | null
  deletedAt?: string | null
  sentAt: string
}

export interface MessageTemplate {
  id: string
  name: string
  subject: string
  bodyHtml: string
  createdAt: string
}

export interface JournalistDownload {
  id: string
  journalistId: string
  releaseId: string | null
  assetId?: string
  assetKey: string
  downloadedAt: string
}

export interface AccreditationRequest {
  id: string
  journalistId: string
  eventName: string
  eventDate: string
  publication: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  adminNote?: string
  createdAt: string
  updatedAt: string
}

export interface EditorActivityLogEntry {
  id: string
  editorId: string
  action: string
  entityType: string
  entityId: string
  entityName?: string
  changes?: unknown
  createdAt: string
}

export interface DashboardNotification {
  id: string
  recipientId: string
  type: string
  entityType: string
  entityId: string
  entityName?: string
  senderId?: string | null
  read: boolean
  createdAt: string
}

/** @deprecated Use DashboardNotification */
export type EditorNotification = DashboardNotification

export interface InterviewRequest {
  id: string
  journalistId: string
  artistId: string
  subject: string
  message: string
  preferredDate?: string
  status: string
  artistReply?: string
  createdAt: string
}

export interface Video {
  id: string
  title: string
  artistName: string
  artistId?: string
  youtubeId: string
  thumbnailUrl: string
  publishedAt: string
  isVisible: boolean
  isShort: boolean
}

export interface UserProfile {
  id: string
  email: string
  role: 'admin' | 'editor' | 'journalist' | 'user' | 'artist' | 'press'
  createdAt: string
  updatedAt: string
}

export type PressCategory =
  | 'promo'
  | 'live'
  | 'stage'
  | 'artwork'
  | 'logo'
  | 'social'
  | 'document'
  | 'photo'
  | 'other'

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
  folderId?: string
  artistId?: string
  artistIds: string[]
  releaseId?: string
  tags: string[]
  sha256Hash?: string
  altText?: string
  isPressApproved: boolean
  pressSuggested: boolean
  pressCategory?: PressCategory
  pressCaption?: string
  photographerCredit?: string
  downloadableForPress: boolean
}

export interface PressKitItem {
  id: string
  assetId: string
  artistId?: string
  displayOrder: number
  createdAt: string
}

/** Asset joined with press kit membership for public/journalist views. */
export interface PressAsset extends Asset {
  kitItemId: string
  kitDisplayOrder: number
  kitArtistId?: string
}

export interface AssetFolder {
  id: string
  name: string
  parentId: string | null
  artistId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  children?: AssetFolder[]
  assetCount?: number
}

export interface ArtistAsset {
  id: string
  artistId: string
  filename: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
  r2Key: string
  publicUrl: string
  label?: string
  createdAt: string
}

/** A single marketing activity documented by the label for an artist. */
export interface PromoLogEntry {
  id: string
  artistId: string
  actionDate: string
  description: string
  budgetAmount: number | null
  budgetCurrency: string
  proofUrl: string | null
  proofR2Key: string | null
  createdBy: string | null
  createdAt: string
}

export interface SpotifyPlaylistEntry {
  label: string
  uri: string
  /** Spotify embed theme. 'dark' is the default Spotify look; 'light' inverts it. */
  theme?: 'dark' | 'light'
  /** Optional hex accent colour used for the tab-selector button in the multi-player UI. */
  accentColor?: string
}

/**
 * A single selectable topic in the contact form.
 * Stored as a JSON array in site_settings under the key `contact_topics`.
 */
export interface ContactTopicConfig {
  /** Internal value sent with the form submission (must be unique). */
  value: string
  /** German label shown in the topic dropdown. */
  label_de: string
  /** English label shown in the topic dropdown. */
  label_en: string
}

/**
 * A custom social/web link that appears in the footer social icons row.
 * Allows any URL + a phosphor-icons logo name (e.g. "InstagramLogo") or a
 * generic "Globe" fallback.
 */
export interface CustomSocialLink {
  /** Unique stable id (uuid or nanoid). */
  id: string
  /** Display label used as aria-label and tooltip. */
  label: string
  /** Target URL (https://…). */
  url: string
  /**
   * Phosphor icon component name. Must be a key of SOCIAL_ICON_MAP in Footer.tsx.
   * Defaults to "Globe" when the name is not recognised.
   */
  icon: string
}

export interface FeatureToggles {
  /** Enable/disable the journalist Promo Pool area. Default: true */
  promoPool: boolean
  /** Enable/disable editor access to the admin CMS. Default: true */
  editorTools: boolean
}

/** Identifies a reorderable section on the public homepage. */
export type HomepageSection = 'releases' | 'spotify' | 'videos' | 'concerts' | 'news' | 'newsletter'

export interface SiteSettings {
  labelName: string
  /** Compact brand name for PWA, sidebars, and email From-prefix. Falls back to derived short name. */
  labelShortName: string
  labelTagline: string
  contactEmail: string
  privacyPolicyUrl: string
  termsUrl: string
  instagramUrl: string
  youtubeUrl: string
  spotifyUrl: string
  spotifyPlaylistUri: string
  /** Multiple playlists for the multi-player. Falls back to spotifyPlaylistUri when empty. */
  spotifyPlaylists: SpotifyPlaylistEntry[]
  heroBadge: string
  heroNewsBadge: string
  heroDescription: string
  seoTitle: string
  seoDescription: string
  ogTitle: string
  ogDescription: string
  /** Impressum (Legal Notice) fields — required by German law */
  impressumCompanyName: string
  impressumLegalForm: string
  impressumRepresentative: string
  impressumAddress: string
  impressumVatId: string
  impressumRegisterCourt: string
  impressumRegisterNumber: string
  impressumPhone: string
  impressumEmail: string
  /** Full privacy policy text (Markdown or HTML). Displayed on /datenschutz. */
  datenschutzContent: string
  /** English privacy policy text (Markdown or HTML). Displayed on /datenschutz for the EN locale. */
  datenschutzContentEn?: string
  /** Portal AGB / terms body (Markdown or HTML) — DE. Empty → code default with placeholders. */
  agbContent: string
  /** Portal AGB / terms body (Markdown or HTML) — EN. */
  agbContentEn: string
  /** Version string for portal terms acceptance (e.g. 2026-08-01). */
  portalTermsVersion: string
  /** Structured label billing address for invoice PDFs (optional; falls back to impressum). */
  labelBillingStreet: string
  labelBillingPostalCode: string
  labelBillingCity: string
  labelBillingCountry: string
  /** URL of the placeholder image shown in ConsentGate before the user opts in. */
  consentPlaceholderUrl: string
  /** Visual overlay: animated noise/grain opacity (0–1). Default 0.04. */
  noiseOpacity: number
  /** Visual overlay: whether CRT scanline effect is active. */
  crtScanlinesEnabled: boolean
  /** Visual overlay: vignette intensity (0–1). Default 0.5. */
  vignetteIntensity: number
  /** Shopify / Darkmerch store URL. Empty string when not configured. */
  shopifyStoreUrl: string
  /** YouTube channel ID for video sync. */
  youtubeChannelId: string
  /** Number of videos shown per page in the Videos grid. Default: 9. */
  videosPerPage: number
  /** When true, the Videos section on the homepage shows only the first page and links to /videos for all videos. */
  videosLinkToPage: boolean
  /** When true, YouTube Shorts (≤180 s or #shorts tag) are hidden from the public /videos page. Default: false. */
  excludeShortsFromPublic: boolean
  /**
   * Grid rows of videos shown on `/artists/[slug]` before "Show all".
   * Visible items = rows × responsive columns (1 / 2 md / 3 xl). Default: 2.
   */
  artistProfileVideoRows: number
  /**
   * Grid rows of news shown on `/artists/[slug]` before "Show all".
   * Visible items = rows × responsive columns (1 / 2 md). Default: 2.
   */
  artistProfileNewsRows: number
  /** Number of concerts shown per page in the Events section. Default: 8. */
  concertsPerPage: number
  /** When true, the Events section on the homepage shows only the first page and links to /events for all events. */
  concertsLinkToPage: boolean
  /** Auto-advance interval for the releases carousel in ms. 0 = disabled. Default 0. */
  carouselAutoplayMs: number
  /** Feature flags: enable/disable portal modules globally. */
  featureToggles: FeatureToggles
  /** R2 URL of the custom label logo shown in the header and footer. Falls back to static asset when empty. */
  logoUrl?: string
  /** R2 URL of the custom favicon. Used in <head> meta. Falls back to /icons/icon-192.png when empty. */
  faviconUrl?: string
  /** Custom headline for the About page. Falls back to i18n default when empty. */
  aboutHeadline?: string
  /** Custom subheading for the About page. Falls back to i18n default when empty. */
  aboutSubheading?: string
  /** Main About page body text (Markdown or HTML). Rendered on /about. */
  aboutBody?: string
  // ── Section Text Overrides ────────────────────────────────────────────────
  /** Override for the newsletter section heading. Falls back to i18n default when empty. */
  newsletterHeading?: string
  /** Override for the newsletter section description. Falls back to i18n default when empty. */
  newsletterDescription?: string
  /** Override for the Spotify section heading. Falls back to i18n default when empty. */
  spotifySectionHeading?: string
  /** Override for the Spotify section subheading. Falls back to i18n default when empty. */
  spotifySectionSubheading?: string
  /** Override for the Videos section heading. Falls back to i18n default when empty. */
  videosSectionHeading?: string
  /** Override for the Videos section subheading. Falls back to i18n default when empty. */
  videosSectionSubheading?: string
  /** Override for the News section heading. Falls back to i18n default when empty. */
  newsSectionHeading?: string
  /** Override for the News section subheading. Falls back to i18n default when empty. */
  newsSectionSubheading?: string
  /** Override for the Concerts section heading. Falls back to i18n default when empty. */
  concertsSectionHeading?: string
  /** Override for the Concerts section subheading. Falls back to i18n default when empty. */
  concertsSectionSubheading?: string
  /** Override for the Releases section heading. Falls back to i18n default when empty. */
  releasesSectionHeading?: string
  /** Override for the Releases section subheading. Falls back to i18n default when empty. */
  releasesSectionSubheading?: string
  // ── Hero Section ──────────────────────────────────────────────────────────
  /** @deprecated No longer used. Featured items are determined by the featured flag on releases/news. */
  heroContentType?: 'release' | 'news'
  /** @deprecated No longer used. Featured items are determined by the featured flag on releases/news. */
  heroFeaturedId?: string
  /** R2 URL of a custom hero background image that overrides the release/news cover art. */
  heroCustomBgUrl?: string
  /** Global fallback label for the hero primary button when item-level label is not set. */
  heroDefaultPrimaryBtnLabel?: string
  /** Global fallback label for the hero secondary button when item-level label is not set. */
  heroDefaultSecondaryBtnLabel?: string
  // ── Homepage Section Order ────────────────────────────────────────────────
  /**
   * Order in which the reorderable sections appear on the homepage.
   * Hero is always first and is not included here.
   * Defaults to ['releases','spotify','videos','concerts','news','newsletter'].
   */
  homepageSectionOrder?: HomepageSection[]
  /** Number of news items shown as a sneak peek on the homepage. Default: 3, max: 12. */
  homepageNewsCount?: number
  /**
   * Configurable topics for the contact form.
   * When empty, the form falls back to the four built-in topics
   * (label, shop, booking, other).
   */
  contactTopics?: ContactTopicConfig[]
  // ── Custom Social Links ───────────────────────────────────────────────────
  /**
   * Arbitrary social / web links rendered in the footer alongside the built-in
   * Instagram / YouTube / Spotify icons.  Stored as a JSON array.
   */
  customSocialLinks?: CustomSocialLink[]
  /**
   * SubmitHub playlister URL for music submissions. Falls back to the
   * hardcoded darkTunes SubmitHub link when empty.
   */
  submitHubUrl?: string
  /** Override label text for the SubmitHub button (falls back to i18n key). */
  submitHubLabel?: string
  /** Override description for the SubmitHub section (falls back to i18n key). */
  submitHubDescription?: string
  /** Override heading for the Submit Music section on the contact page (falls back to i18n key). */
  submitHubSectionHeading?: string
  /** Whether the About link should appear in the global header navigation. */
  showAboutInHeader?: boolean
  /** Whether the About link should appear in the global footer navigation. */
  showAboutInFooter?: boolean
  /** Display label for the About link in navigation menus. */
  aboutNavLabel?: string
  // ── Color Theme Tokens ────────────────────────────────────────────────────
  /**
   * CSS color overrides for the site's design tokens. Each value is a valid
   * CSS color string (hex, oklch, rgb, etc.).  An empty string means "use the
   * default from globals.css".  All tokens correspond directly to CSS custom
   * properties (`--primary`, `--secondary`, etc.) defined in globals.css.
   */
  /** Override for the `--primary` CSS custom property. */
  themePrimary?: string
  /** Override for the `--secondary` CSS custom property. */
  themeSecondary?: string
  /** Override for the `--background` CSS custom property. */
  themeBackground?: string
  /** Override for the `--foreground` CSS custom property. */
  themeForeground?: string
  /** Override for the `--card` CSS custom property. */
  themeCard?: string
  /** Override for the `--muted` CSS custom property. */
  themeMuted?: string
  /** Override for the `--accent` CSS custom property. */
  themeAccent?: string
  /** Override for the `--border` CSS custom property. */
  themeBorder?: string
  // ── Gradient Tokens ───────────────────────────────────────────────────────
  /** Start color of the hero gradient (`--gradient-hero`). */
  themeGradientHeroFrom?: string
  /** End color of the hero gradient (`--gradient-hero`). */
  themeGradientHeroTo?: string
  /** CSS direction / angle of the hero gradient, e.g. "135deg" or "to right". */
  themeGradientHeroDir?: string
  /** Start color of the accent gradient (`--gradient-accent`). */
  themeGradientAccentFrom?: string
  /** End color of the accent gradient (`--gradient-accent`). */
  themeGradientAccentTo?: string
  /** CSS direction / angle of the accent gradient. */
  themeGradientAccentDir?: string
  /**
   * Full structured theme config stored as a JSON blob in site_settings
   * (key = 'theme_config').  When present this takes precedence over the
   * individual flat theme_* keys for typography, glass, and animation
   * tokens.  Colors and gradients still fall back to flat keys for
   * backward compatibility.
   */
  themeConfig?: import('@/config/themeConfig').ThemeConfig
  /**
   * How long admin invite links remain valid (hours).
   * Min 24, max 168 (7 days). Default 168.
   * Stored as site_settings.invite_link_expiry_hours.
   */
  inviteLinkExpiryHours: number
}

// ── Messaging ──────────────────────────────────────────────────────────────

export interface MessageFolder {
  id: string
  name: string
  /** Phosphor icon name (e.g. "Inbox", "Archive", "Star"). */
  icon?: string
  /** Hex color for the folder badge. */
  color?: string
  createdAt: string
}

export type MessageRuleConditionField = 'subject' | 'body' | 'artist_id' | 'sender_email'
export type MessageRuleConditionOperator = 'contains' | 'equals' | 'starts_with' | 'ends_with'
export type MessageRuleActionType = 'move_to_folder' | 'mark_read' | 'star' | 'delete'

export interface MessageRule {
  id: string
  name: string
  conditionField: MessageRuleConditionField
  conditionOperator: MessageRuleConditionOperator
  conditionValue: string
  actionType: MessageRuleActionType
  /** Target folder id when actionType is "move_to_folder". */
  actionTarget?: string
  active: boolean
  createdAt: string
}

export interface MessageAttachment {
  id: string
  messageId: string
  filename: string
  url: string
  /** MIME type, e.g. "application/pdf". */
  mimeType: string
  /** File size in bytes. */
  size: number
  createdAt: string
}

export interface Concert {
  id: string
  artistId: string | null
  artistName: string
  eventName: string
  venueName: string | null
  /** Street address of the venue */
  venueAddress: string | null
  venueCity: string | null
  venueCountry: string | null
  concertDate: string
  ticketUrl: string | null
  songkickId: string | null
  bandsintownId: string | null
  status: string
  createdAt: string
  updatedAt: string
  /** Time of the event (HH:MM format) */
  eventTime: string | null
  /** Event type: 'gig' | 'dj_set' | 'tour' | custom string */
  eventType: string
  /** Optional YouTube/video trailer URL */
  trailerUrl: string | null
  /** Latitude for venue OSM lookup */
  venueLat: number | null
  /** Longitude for venue OSM lookup */
  venueLng: number | null
  /** OpenStreetMap place_id for the venue */
  venueOsmId: string | null
  /** Linked news post ID */
  newsPostId: string | null
  /** Featured/supporting artists (populated from concert_artists join) */
  featuredArtists?: { id: string; name: string; slug: string }[]
}

export interface TourCollaboratorSummary {
  artistId: string
  artistName: string
  artistSlug: string | null
}

export interface Tour {
  id: string
  artistId: string
  name: string
  description: string | null
  startDate: string | null
  endDate: string | null
  archived: boolean
  sortOrder: number
  settings: import('@/lib/tour-planner/types').TourPlannerSettings
  routeCache: import('@/lib/tour-planner/types').RouteResult | null
  budget: import('@/lib/tour-planner/types').TourBudget | null
  techDocuments: import('@/lib/tour-planner/types').TechDocument[]
  currency: string
  totalBudget: number | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  /** Present when loaded for portal: owner or collaborator */
  accessRole?: 'owner' | 'collaborator'
  collaborators?: TourCollaboratorSummary[]
  ownerArtistName?: string | null
}

export interface TourStop {
  id: string
  tourId: string
  artistId: string
  concertId: string | null
  sortOrder: number
  stopDate: string
  isTravelDay: boolean
  venueName: string | null
  venueAddress: string | null
  venueCity: string | null
  venueCountry: string | null
  venueLat: number | null
  venueLng: number | null
  venueValidated: boolean
  hotelName: string | null
  hotelAddress: string | null
  hotelCity: string | null
  hotelCountry: string | null
  hotelLat: number | null
  hotelLng: number | null
  hotelValidated: boolean
  arrivalTime: string | null
  showStatus: import('@/lib/tour-planner/types').ShowStatus
  daySchedule: import('@/lib/tour-planner/types').DaySchedule | null
  deal: import('@/lib/tour-planner/types').DealStructure | null
  settlement: import('@/lib/tour-planner/types').Settlement | null
  perDiems: import('@/lib/tour-planner/types').PerDiem[]
  rooming: import('@/lib/tour-planner/types').RoomingAssignment[]
  travelManifest: import('@/lib/tour-planner/types').TravelManifest[]
  venueDetails: import('@/lib/tour-planner/types').VenueDetails | null
  venueContactInfo: import('@/lib/tour-planner/types').VenueContactInfo | null
  guestList: import('@/lib/tour-planner/types').GuestListEntry[]
  guestListLimit: number | null
  notes: string | null
  externalGuestNotes: string | null
  performingArtistIds: string[]
  privateDataVersion: number | null
  privateDataUpdatedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface TourContact {
  id: string
  artistId: string
  contactType: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  country: string | null
  lastContactDate: string | null
  notes: string | null
  previousDeals: import('@/lib/tour-planner/types').ContactDealHistory[]
  createdAt: string
  updatedAt: string
}

export interface TourTask {
  id: string
  artistId: string
  tourId: string | null
  stopId: string | null
  title: string
  description: string | null
  dueDate: string
  priority: 'low' | 'medium' | 'high'
  completed: boolean
  assignedTo: string | null
  taskType: 'follow-up' | 'contract' | 'payment' | 'logistics' | 'other'
  createdAt: string
  updatedAt: string
}

export interface TourCrewMember {
  id: string
  tourId: string
  artistId: string
  name: string
  role: string
  email: string | null
  phone: string | null
  passportNumber: string | null
  passportExpiry: string | null
  passportIssuePlace: string | null
  dateOfBirth: string | null
  nationality: string | null
  visaInfo: string | null
  roomAssignment: string | null
  busAssignment: string | null
  createdAt: string
  updatedAt: string
}

export interface TourMerchItem {
  id: string
  artistId: string
  sku: string
  name: string
  category: 'soft' | 'hard'
  variants: import('@/lib/tour-planner/types').MerchVariant[]
  basePrice: number
  currency: string
  box: string | null
  photoUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface TourMerchSettlementRecord {
  id: string
  stopId: string
  artistId: string
  settlement: import('@/lib/tour-planner/types').MerchSettlement
  createdAt: string
  updatedAt: string
}

export type SubmissionStatus = 'received' | 'reviewed' | 'accepted' | 'rejected'

export interface ReleaseSubmission {
  id: string
  artistId: string
  status: SubmissionStatus
  title: string
  releaseDate: string | null
  type: 'album' | 'ep' | 'single' | 'compilation' | null
  genre: string | null
  catalogNumber: string | null
  isrc: string | null
  labelCopy: string | null
  audioDownloadUrl: string
  coverArtUrl: string
  coverArtVerified: boolean
  spotifyUrl: string | null
  appleMusicUrl: string | null
  youtubeUrl: string | null
  notes: string | null
  formData: Record<string, unknown> | null
  adminReply: string | null
  adminReplyAt: string | null
  /** Label progress note visible to the artist (pipeline update, not a formal decision). */
  progressNote: string | null
  /** Catalog release created from this submission (draft), if any */
  releaseId?: string | null
  /** Admin list enrichment (not a DB column). */
  artistName?: string | null
  createdAt: string
  updatedAt: string
}

export interface VideoSubmission {
  id: string
  artistId: string
  status: SubmissionStatus
  title: string
  description: string | null
  downloadUrl: string
  thumbnailUrl: string | null
  youtubeTitle: string | null
  youtubeDescription: string | null
  youtubeTags: string[]
  youtubeCategory: string | null
  targetPublishDate: string | null
  notes: string | null
  formData: Record<string, unknown> | null
  adminReply: string | null
  adminReplyAt: string | null
  createdAt: string
  updatedAt: string
}

export type {
  SubmissionFieldType,
  SubmissionFieldScope,
  VisibilityCondition,
  SubmissionReleaseType,
  TrackCountMode,
  FieldTypeRules,
  TypeFieldRule,
} from '@/lib/submissions/fieldTypes'

export interface PortalFaqCategory {
  id: string
  slug: string
  titleEn: string
  titleDe: string | null
  sortOrder: number
  isPublished: boolean
  createdAt: string
  updatedAt: string
}

export interface PortalFaqItem {
  id: string
  categoryId: string
  slug: string
  questionEn: string
  questionDe: string | null
  answerHtmlEn: string
  answerHtmlDe: string | null
  keywords: string[]
  portalRoute: string | null
  sortOrder: number
  isPublished: boolean
  createdAt: string
  updatedAt: string
}

export interface PortalFaqTree {
  category: PortalFaqCategory
  items: PortalFaqItem[]
}

export interface SubmissionFormField {
  id: string
  formType: 'release' | 'video'
  fieldKey: string
  fieldLabels: Record<string, string>
  fieldType: import('@/lib/submissions/fieldTypes').SubmissionFieldType
  fieldScope: import('@/lib/submissions/fieldTypes').SubmissionFieldScope
  fieldGroup: string | null
  fieldOptions: Record<string, unknown> | null
  visibilityCondition: import('@/lib/submissions/fieldTypes').VisibilityCondition | null
  typeRules: import('@/lib/submissions/fieldTypes').FieldTypeRules | null
  validation: Record<string, unknown> | null
  isRequired: boolean
  isVisible: boolean
  displayOrder: number
  placeholders: Record<string, string> | null
}

export interface SubmissionReleaseTypeRule {
  id: string
  releaseType: import('@/lib/submissions/fieldTypes').SubmissionReleaseType
  trackCountMode: import('@/lib/submissions/fieldTypes').TrackCountMode
  minTracks: number
  maxTracks: number
  displayOrder: number
}

export interface ReleaseSubmissionTrack {
  id: string
  submissionId: string
  trackNumber: number
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
  previewStartSeconds: number | null
  durationSeconds: number | null
  formData: Record<string, unknown> | null
  displayOrder: number
  createdAt: string
}

// ---------------------------------------------------------------------------
// Portal Messages — artist-to-artist / artist-to-label messaging
// ---------------------------------------------------------------------------

export interface PortalMessage {
  id: string
  fromArtistId: string
  toArtistId: string | null
  toLabel: boolean
  subject: string
  body: string
  bodyHtml: string | null
  sentAt: string
  readAt: string | null
  starred: boolean
  deletedAt: string | null
  folderId: string | null
  hasAttachments: boolean
  senderUserId?: string | null
  clientMessageId?: string | null
  /** Staff assignee for shared inbox (artist → label). */
  assigneeUserId?: string | null
  priority?: 'low' | 'normal' | 'high' | 'urgent' | string
  tags?: string[]
  /** Populated by the API layer — sender artist name */
  fromArtistName?: string
  /** Populated by the API layer — recipient artist name */
  toArtistName?: string
}

export interface MessageInternalNote {
  id: string
  messageSource: 'label' | 'portal'
  messageId: string
  authorUserId: string
  body: string
  createdAt: string
}

export interface MessageEvent {
  id: string
  messageSource: 'label' | 'portal'
  messageId: string
  actorUserId: string | null
  eventType: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface PortalMessageFolder {
  id: string
  artistId: string
  name: string
  color: string | null
  icon: string | null
  position: number
  createdAt: string
}

export interface PortalMessageAttachment {
  id: string
  messageId: string
  fileUrl: string
  fileName: string
  fileSize: number | null
  mimeType: string | null
  createdAt: string
}
