import { defineConfig, type Plugin } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { isModelChunk, isModelManifest } from './src/pwa-caching';

/**
 * The background-removal library bundles a copy of the ONNX runtime's wasm file that the app never
 * loads (the app serves its own from public/models). Dropping it keeps the site about 24 MB smaller.
 */
function dropUnusedWasm(): Plugin {
  return {
    name: 'drop-unused-wasm',
    generateBundle(_options, bundle) {
      for (const key of Object.keys(bundle)) if (key.endsWith('.wasm')) delete bundle[key];
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  worker: { format: 'es' },
  plugins: [
    dropUnusedWasm(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-180.png'],
      manifest: {
        name: 'Icon Maker',
        short_name: 'Icon Maker',
        description: 'Convert HEIC photos to PNG, remove backgrounds and make icons. Everything stays on your device.',
        display: 'standalone',
        start_url: './',
        scope: './',
        background_color: '#f5f6f8',
        theme_color: '#2557d6',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell is cached on install. The model files (about 100 MB) are not: they are cached
        // the first time background removal is used, by the runtime rule below.
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,webmanifest}'],
        globIgnores: ['models/**'],
        // The HEIC decoder is 3.2 MB and must be available offline.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // The file list is checked on the network first (falling back to the stored copy offline).
            urlPattern: isModelManifest,
            handler: 'NetworkFirst',
            options: {
              // Keep this name in step with MODEL_CACHE in src/core/segment.ts.
              cacheName: 'icon-maker-models',
              networkTimeoutSeconds: 4,
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: isModelChunk,
            handler: 'CacheFirst',
            options: { cacheName: 'icon-maker-models', cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/core/**/*.test.ts'],
  },
});
