# darkTunes Admin Panel

Access the admin panel by visiting `/admin` (or creating a separate deployment for it).

## Features

- **User Authentication**: Secure login/signup via Supabase Auth
- **Role-Based Access Control**: Admin and Editor roles with different permissions
- **Artists Management**: Create, read, update, and delete artist profiles
  - Skeleton loading states for smooth UX (no layout shifts)
  - External API ID fields (Spotify, Discogs, Songkick) for auto-sync
  - Per-artist **Sync Now** button (triggers `POST /api/sync-artist`)
- **Releases Management**: Manage music releases with iTunes API integration
- **News Management**: Create and publish news posts and announcements
- **Videos Management**: Manage music videos and YouTube content
- **Assets Management**: Upload and organize media files via Cloudflare R2

## Setup

### 1. Configure Supabase

Follow the instructions in `DEPLOYMENT.md` to:
- Create a Supabase project
- Set up the database schema
- Configure environment variables

### 2. Create First Admin User

After signing up through the app, run this SQL in Supabase:

```sql
UPDATE public.profiles 
SET role = 'admin' 
WHERE email = 'your-email@example.com';
```

### 3. Access Admin Panel

Navigate to the admin route in your application. You'll be prompted to log in if not authenticated.

## Usage

### Artists
- Add new artists with their bio, genres, and social links
- Fill in **Spotify Artist ID**, **Discogs Artist ID**, **Songkick Artist ID** to enable auto-sync
- Click **Sync Now** (↻ icon) on any artist row to immediately pull releases from iTunes + Songkick
- Update artist information
- Mark artists as featured
- Delete artists (cascades to their releases)

### Releases
- Manually add releases or sync from iTunes API
- Edit release metadata (title, date, type, cover art)
- Add streaming links (Spotify, Apple Music, YouTube)
- Feature releases on the homepage

### News
- Create news posts with markdown support
- Add featured images
- Schedule or publish immediately
- Edit or delete existing posts

### Videos
- Add music videos by YouTube ID
- Organize video gallery
- Set thumbnails and metadata

### Assets
- Upload images and media files to Cloudflare R2
- Browse uploaded assets
- Copy public URLs for use in content
- Delete unused assets

## Permissions

- **Admin**: Full access to all features, user management
- **Editor**: Can manage content (artists, releases, news, videos, assets)
- **User**: Read-only access (default for new signups)

## Development

To run the admin panel locally with Supabase:

1. Copy `.env.example` to `.env.local`
2. Fill in your Supabase credentials
3. Run `npm run dev`
4. Navigate to `/admin`

##Integration Notes

The admin panel is designed to work alongside the main site. You can:
- Deploy it as a separate subdomain (`admin.darktunes.com`)
- Include it as a route in the main application
- Run it as a standalone admin application

All data is stored in Supabase and shared between the public site and admin panel.
