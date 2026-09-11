# /public/icons — PWA Icons & Screenshots

This directory contains the branded PWA icon set and install-sheet screenshots.
To regenerate icons from the official darkTunes logo, use
[RealFaviconGenerator](https://realfavicongenerator.net/) or
[Maskable.app](https://maskable.app/editor).

## Required files

| File | Size | Notes |
| --- | --- | --- |
| `icon-192.png` | 192×192 px | Standard app icon, solid `#101010` background |
| `icon-512.png` | 512×512 px | Standard app icon (high-res), solid `#101010` background |
| `icon-192-maskable.png` | 192×192 px | Maskable — ≥10 % safe-zone padding, `#101010` background |
| `icon-512-maskable.png` | 512×512 px | Maskable — ≥10 % safe-zone padding, `#101010` background |
| `screenshot-desktop.png` | 1280×720 px | PWA install sheet preview (desktop/wide) |
| `screenshot-mobile.png` | 390×844 px | PWA install sheet preview (portrait/mobile) |

## Apple Touch Icon

`icon-192.png` is also used as the `apple-touch-icon` (referenced in
`app/layout.tsx`). It must be a non-transparent PNG with a solid dark
background (`#101010`) so it looks correct on iOS.
