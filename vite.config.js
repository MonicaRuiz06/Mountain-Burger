import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync, existsSync } from 'node:fs';

// Todos los archivos viven en la raíz (sin carpetas), así que los íconos
// se copian a dist desde aquí en lugar de usar la carpeta public.
const ICONS = ['icon.svg', 'icon-192.png', 'icon-512.png'];
const copyIcons = () => ({
  name: 'copiar-iconos',
  generateBundle() {
    for (const f of ICONS) if (existsSync(f)) this.emitFile({ type: 'asset', fileName: f, source: readFileSync(f) });
  }
});

export default defineConfig({
  publicDir: false,
  plugins: [
    react(),
    copyIcons(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Mountain Burger · Cali Grill',
        short_name: 'Mountain Burger',
        description: 'Producción, inventario, costos y caja de Mountain Burger',
        lang: 'es-CO',
        theme_color: '#2f5f96',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: '/index.html'
      }
    })
  ]
});
