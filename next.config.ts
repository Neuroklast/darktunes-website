import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import withSerwistInit from '@serwist/next'
import withBundleAnalyzerInit from '@next/bundle-analyzer'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')
import { buildContentSecurityPolicy } from './src/lib/security/contentSecurityPolicy'

const withSerwist = withSerwistInit({
  disable: process.env.NODE_ENV !== 'production',
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  // Never intercept admin / API / auth routes in the service worker
  exclude: [/\/api\//, /\/admin\//, /\/portal\//, /\/press\//, /\/promo-pool\//],
  // Hashed JS chunks are cached at runtime (CacheFirst in sw.ts). Precaching them
  // causes bad-precaching-response 404s after deploy when old chunk hashes 404.
  manifestTransforms: [
    async (manifestEntries) => ({
      manifest: manifestEntries.filter((entry) => {
        const url = typeof entry === 'string' ? entry : entry.url
        return !/\/_next\/static\/chunks\//.test(url)
      }),
      warnings: [],
    }),
  ],
})

const withBundleAnalyzer = withBundleAnalyzerInit({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig: NextConfig = {
  // Allow images from Cloudflare R2 CDN and other external domains.
  // unoptimized: wsrv.nl handles resize/WebP — avoids Vercel Image Optimization (402 on Hobby limit).
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.r2.dev',
      },
      {
        protocol: 'https',
        hostname: 'is*.mzstatic.com',
        pathname: '/image/**',
      },
      {
        protocol: 'https',
        hostname: 'wsrv.nl',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '*.bcbits.com',
      },
    ],
  },
  async rewrites() {
    return [{ source: '/@:slug', destination: '/fan/:slug' }]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            value: buildContentSecurityPolicy(),
          },
        ],
      },
    ]
  },
  // Tailwind v4 + tw-animate-css use PostCSS features that require transpiling
  transpilePackages: [],
  // web-push pulls Node net/tls — must never land in the client bundle
  serverExternalPackages: ['sharp', 'fontkit', '@pdf-lib/fontkit', 'web-push'],
  outputFileTracingIncludes: {
    '/api/portal/epk/export': ['./src/lib/epk/export/assets/**/*'],
    '/api/epk/share/[token]': ['./src/lib/epk/export/assets/**/*'],
    '/api/epk/press/[slug]/export': ['./src/lib/epk/export/assets/**/*'],
  },
  experimental: {
    // konva/react-konva omitted: optimizePackageImports tree-shakes shape side-effects
    // required by react-konva (see src/lib/epk/konvaShapes.ts).
    optimizePackageImports: ['framer-motion', '@phosphor-icons/react', 'lenis'],
  },
}

export default withBundleAnalyzer(withSerwist(withNextIntl(nextConfig)))
