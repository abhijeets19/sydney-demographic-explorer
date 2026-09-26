import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, '../data/out');
const TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.bin': 'application/octet-stream',
  '.pmtiles': 'application/octet-stream',
};

/** Serves data/out at /data with HTTP Range support (PMTiles needs byte ranges). Dev only. */
function dataPlugin(): Plugin {
  return {
    name: 'sdx-data',
    configureServer(server) {
      server.middlewares.use('/data', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
        const file = path.resolve(DATA_DIR, `.${rel}`);
        if (!file.startsWith(DATA_DIR + path.sep)) {
          res.statusCode = 403;
          res.end();
          return;
        }
        let stat: fs.Stats;
        try {
          stat = fs.statSync(file);
        } catch {
          next();
          return;
        }
        if (!stat.isFile()) {
          next();
          return;
        }
        res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('ETag', `"${stat.size}-${stat.mtimeMs}"`);
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
        if (m) {
          const start = m[1] ? Number(m[1]) : Math.max(0, stat.size - Number(m[2]));
          const end = m[1] && m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
          if (start > end || start >= stat.size) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${stat.size}`);
            res.end();
            return;
          }
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
          res.setHeader('Content-Length', end - start + 1);
          fs.createReadStream(file, { start, end }).pipe(res);
        } else {
          res.setHeader('Content-Length', stat.size);
          fs.createReadStream(file).pipe(res);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), dataPlugin()],
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: path.resolve(HERE, 'index.html'),
        bench: path.resolve(HERE, 'bench.html'),
      },
    },
  },
});
