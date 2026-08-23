import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import ghlHandler from './api/ghl.js'
import authHandler from './api/auth.js'

function localApiPlugin() {
  return {
    name: 'local-api-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/api/ghl') || req.url?.startsWith('/api/auth')) {
          let bodyStr = '';
          req.on('data', chunk => { bodyStr += chunk; });
          req.on('end', async () => {
            try {
              if (bodyStr) {
                req.body = JSON.parse(bodyStr);
              }
            } catch { /* ignore */ }
            
            res.status = (code) => {
              res.statusCode = code;
              return res;
            };
            res.json = (data) => {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(data));
            };

            if (req.url?.startsWith('/api/ghl')) {
              await ghlHandler(req, res);
            } else if (req.url?.startsWith('/api/auth')) {
              await authHandler(req, res);
            }
          });
          return;
        }
        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localApiPlugin()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.js',
  }
})

