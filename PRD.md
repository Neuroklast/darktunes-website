# darkTunes Music Group - Music Label Website

A modern alternative music label website featuring immersive design with CRT effects, animated modals, dynamic content presentation, and a full-featured admin panel for content management.

**Experience Qualities**:

1. **Immersive** - Deep dark atmosphere with vintage CRT aesthetics that pull users into the alternative music world
2. **Dynamic** - Smooth scrolling interactions with shrinking logo, overlay modals with build-up animations creating engaging transitions
3. **Bold** - High-contrast design with powerful typography and striking visuals that command attention

**Complexity Level**: Complex Application (advanced functionality with multiple views and data management)
This application combines a public-facing content showcase with a comprehensive admin panel for content management. It features database integration (Supabase), cloud storage (Cloudflare R2), user authentication, role-based access control, and real-time content management capabilities.

## Essential Features

### Shrinking Logo Header

- **Functionality**: Logo starts large and shrinks as user scrolls down
- **Purpose**: Creates dynamic visual hierarchy and saves screen space while maintaining brand presence
- **Trigger**: Page scroll event
- **Progression**: User loads page → sees large logo → scrolls down → logo smoothly shrinks and header becomes compact
- **Success criteria**: Logo transitions smoothly between sizes, header remains fixed and functional at all scroll positions

### Video Overlay Modal

- **Functionality**: Clicking video thumbnails opens full-screen modal with animated entrance
- **Purpose**: Provides immersive video viewing experience without navigation
- **Trigger**: Click on video thumbnail or play button
- **Progression**: User clicks video → backdrop fades in → modal scales up with spring animation → video loads/plays → user can close modal
- **Success criteria**: Modal animates smoothly, video embeds properly, clicking outside closes modal

### CRT Screen Effect

- **Functionality**: Subtle scanline overlay with noise texture across entire page
- **Purpose**: Creates vintage monitor aesthetic fitting alternative music label brand
- **Trigger**: Applied on page load
- **Progression**: Effect is always present as subtle overlay → enhances dark atmosphere without obscuring content
- **Success criteria**: Effect is visible but not distracting, performs well, enhances rather than hinders readability

### Content Sections

- **Functionality**: Hero banner, new releases grid, artist roster, news feed, video gallery, footer
- **Purpose**: Present label's content in organized, visually appealing sections
- **Trigger**: Page load and scroll
- **Progression**: User scrolls → sections appear → hover interactions reveal more info → clicks navigate to details
- **Success criteria**: All sections load properly, content is accessible, responsive across devices

### Admin Panel

- **Functionality**: Full content management system with authentication, role-based access, and CRUD operations
- **Purpose**: Enables label staff to manage all website content without developer intervention
- **Trigger**: Admin navigates to /admin route, logs in with credentials
- **Progression**: User logs in → sees dashboard → selects content type → creates/edits/deletes content → changes reflected on public site
- **Success criteria**: Secure authentication, intuitive interface, real-time updates, proper permission enforcement

### Database Integration

- **Functionality**: Supabase backend for storing artists, releases, news, videos, user profiles
- **Purpose**: Centralized data management with real-time synchronization between admin and public views
- **Trigger**: Application start, user interactions, admin content updates
- **Progression**: Data requested → Supabase queries → results cached → UI updates → changes propagate in real-time
- **Success criteria**: Fast queries, reliable persistence, automatic sync, proper data relationships

### Cloud Storage

- **Functionality**: Cloudflare R2 for storing and serving images, cover art, and media files
- **Purpose**: Scalable, cost-effective asset management with CDN delivery
- **Trigger**: Admin uploads file, public site requests asset
- **Progression**: File uploaded → stored in R2 → public URL generated → used in content → served via CDN
- **Success criteria**: Fast uploads, reliable delivery, proper access control, URL generation

## Edge Case Handling

- **Empty Content**: Display placeholder messages or hide sections when no data available
- **Slow Network**: Show loading skeletons for images, lazy load video embeds
- **Long Artist Names**: Truncate with ellipsis or use responsive font sizing
- **Mobile Touch**: Ensure all hover effects have touch equivalents, modal closes with swipe down
- **Small Screens**: Stack grid layouts, reduce logo size range, simplify header navigation

## Design Direction

The design should evoke a gritty, underground alternative music scene with a retro-futuristic edge. Think late-night studio sessions, vintage recording equipment, and the raw energy of alternative music culture. The CRT effect and dark palette create an immersive atmosphere that feels both nostalgic and contemporary.

## Color Selection

Dark, moody palette with vibrant purple accents representing the alternative music underground scene.

- **Primary Color**: Deep Purple `oklch(0.35 0.15 290)` - Represents the alternative/gothic music aesthetic, mysterious and bold
- **Secondary Color**: Bright Magenta `oklch(0.714 0.203 305.504)` - Eye-catching accent for CTAs and highlights, energetic and vibrant
- **Accent Color**: Vivid Purple `oklch(0.65 0.25 290)` - For interactive elements and emphasis, bridges primary and secondary
- **Background**: Near Black `oklch(0.12 0 0)` - Deep dark base for maximum contrast and atmosphere
- **Card Background**: Dark Gray `oklch(0.20 0 0)` - Subtle elevation while maintaining darkness

**Foreground/Background Pairings**:

- Background `oklch(0.12 0 0)`: White text `oklch(1 0 0)` - Ratio 19.4:1 ✓
- Primary `oklch(0.35 0.15 290)`: White text `oklch(1 0 0)` - Ratio 6.8:1 ✓
- Secondary `oklch(0.714 0.203 305.504)`: White text `oklch(1 0 0)` - Ratio 5.2:1 ✓
- Accent `oklch(0.65 0.25 290)`: Near Black text `oklch(0.12 0 0)` - Ratio 8.1:1 ✓

## Font Selection

Typefaces should feel technical yet stylish, combining the precision of music production with creative expression.

- **Primary (Headings/Display)**: Oxanium - Geometric sans with technical edge, perfect for bold artist names and titles
- **Secondary (Body)**: Roboto Slab - Sturdy serif for readable body text with character
- **Accent (UI/Code)**: JetBrains Mono - Monospace for technical elements and labels

**Typographic Hierarchy**:

- H1 (Page Title): Oxanium Bold/72px/tight tracking - Maximum impact for hero headlines
- H2 (Section Headers): Oxanium Bold/48px/wide tracking - Clear section delineation
- H3 (Card Titles): Oxanium SemiBold/24px/normal tracking - Prominent content titles
- Body (Content): Roboto Slab Regular/16px/1.6 line-height - Comfortable reading
- Labels (Metadata): JetBrains Mono Regular/12px/uppercase/wide tracking - Technical precision

## Animations

Animations should feel powerful and intentional, like the drop of a heavy beat. Use spring physics for organic motion that feels alive. The modal entrance should build anticipation - backdrop fades in first, then content scales up with slight overshoot for impact. Logo shrink should be butter-smooth using transform for performance. Hover effects should be quick (150ms) to feel responsive. CRT scanlines should subtly animate to enhance the vintage monitor effect without being distracting.

## Component Selection

- **Components**:
  - Dialog (Shadcn) for video modals with custom overlay styling
  - Card (Shadcn) for releases and news with hover effects
  - Button (Shadcn) with bold styling for CTAs
  - Badge (Shadcn) for genre tags and labels
  - Separator for section dividers
  
- **Customizations**:
  - Custom CRT overlay component with CSS scanlines and noise
  - Custom shrinking header with scroll-triggered animations
  - Custom video modal with spring animations via framer-motion
  - Grid layouts using CSS Grid with gap spacing

- **States**:
  - Buttons: subtle scale on hover, brightness increase, accent glow on primary
  - Cards: lift with shadow on hover, border glow effect
  - Modal: backdrop blur with fade-in, content scale-up with spring
  - Logo: smooth size transition on scroll threshold
  
- **Icon Selection**:
  - Play (filled) for video playback
  - X for modal close
  - List/Hamburger for mobile menu
  - MusicNote, Calendar, Tag for metadata
  - Social icons (Instagram, Spotify, YouTube) for artist links
  
- **Spacing**:
  - Container padding: px-4 md:px-8 lg:px-16
  - Section spacing: py-16 md:py-24
  - Card gap: gap-6 md:gap-8
  - Component spacing: space-y-4 for vertical, gap-4 for grids
  
- **Mobile**:
  - Logo shrinks less dramatically on mobile (already starts smaller)
  - Grids collapse from 3-4 columns to 1-2 columns
  - Modal takes full screen on mobile
  - Header navigation collapses to hamburger menu below lg breakpoint
  - Touch targets minimum 44px for buttons and interactive elements
