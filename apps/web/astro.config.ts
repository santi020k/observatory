import cloudflare from '@astrojs/cloudflare'
import { defineConfig } from 'astro/config'

export default defineConfig({
  adapter: cloudflare({
    imageService: 'compile'
  }),
  output: 'server',
  security: {
    checkOrigin: true
  },
  server: {
    host: true,
    port: 4321
  },
  vite: {
    ssr: {
      optimizeDeps: {
        ignoreOutdatedRequests: true,
        include: ['zod']
      }
    }
  }
})
