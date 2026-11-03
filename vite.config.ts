import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
})()

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(`${new Date().toISOString().slice(0, 10)} · ${commit}`),
  },
  plugins: [
    preact(),
    VitePWA({
      // L'utente decide quando aggiornare: avviso «Nuova versione» invece del ricaricamento a sorpresa.
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Singlish',
        short_name: 'Singlish',
        description: 'Impara l’inglese dalle canzoni: espressioni, parole e ripasso quotidiano.',
        lang: 'it',
        dir: 'ltr',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        start_url: '/?source=pwa',
        scope: '/',
        theme_color: '#111317',
        background_color: '#111317',
        categories: ['education', 'music'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Ripasso', short_name: 'Ripasso', url: '/?source=shortcut#/session', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Aggiungi canzone', short_name: 'Aggiungi', url: '/?source=shortcut#/songs/new', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
        ],
        screenshots: [
          { src: 'screenshots/today.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Il ripasso di oggi' },
          { src: 'screenshots/study.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Il testo con espressioni e parole evidenziate' },
          { src: 'screenshots/session.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Una card della sessione' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,json,woff2}'],
        globIgnores: ['screenshots/**'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
})
