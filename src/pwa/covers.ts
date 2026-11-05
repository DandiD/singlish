import type { VitePWAOptions } from 'vite-plugin-pwa'

type RuntimeCaching = NonNullable<NonNullable<VitePWAOptions['workbox']>['runtimeCaching']>[number]

/** Same hosts as safeCoverUrl (src/domain/spotify.ts); anchored so port and userinfo never match. */
export const COVER_URL_PATTERN = /^https:\/\/(i\.scdn\.co|mosaic\.scdn\.co|[a-z0-9-]+\.spotifycdn\.com)\//

export const coverRuntimeCaching = {
  urlPattern: COVER_URL_PATTERN,
  handler: 'CacheFirst',
  options: {
    cacheName: 'covers',
    expiration: { maxEntries: 60, maxAgeSeconds: 90 * 24 * 60 * 60 },
    // Images load in CORS mode (crossorigin="anonymous"), so only real 200s are cached, never opaque ones.
    cacheableResponse: { statuses: [200] },
  },
} satisfies RuntimeCaching
