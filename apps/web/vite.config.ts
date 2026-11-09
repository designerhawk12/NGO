import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        donor: fileURLToPath(new URL('./donor/index.html', import.meta.url)),
      },
    },
  },
  plugins: [
    react(),
    {
      name: 'donor-portal-rewrite',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url) {
            const [pathname, search] = req.url.split('?')
            if (pathname === '/donor' || pathname === '/donor/') {
              req.url = '/donor/index.html' + (search ? `?${search}` : '')
            }
          }
          next()
        })
      },
    },
  ],
})
