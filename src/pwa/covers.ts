import type { RuntimeCaching } from 'workbox-build'

/** Same hosts as safeCoverUrl (src/domain/spotify.ts); anchored so port and userinfo never match. */
export const COVER_URL_PATTERN = /^https:\/\/(i\.scdn\.co|mosaic\.scdn\.co|[a-z0-9-]+\.spotifycdn\.com)\//

export const coverRuntimeCaching = {
  urlPattern: COVER_URL_PATTERN,
  handler: 'CacheFirst',
  options: {
    cacheName: 'covers',
    expiration: { maxEntries: 60, maxAgeSeconds: 90 * 24 * 60 * 60 },
    // 0: images from another origin arrive opaque.
    cacheableResponse: { statuses: [0, 200] },
  },
} satisfies RuntimeCaching
