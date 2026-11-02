import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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
