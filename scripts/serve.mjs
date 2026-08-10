import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const preferredPort = Number(process.env.PORT ?? 8080);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml'
};

function requestHandler(req, res) {
  (async () => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const requested = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      let filePath = path.join(dist, requested);

      if (!filePath.startsWith(dist)) {
        res.writeHead(403).end('Forbidden');
        return;
      }

      const info = await stat(filePath).catch(() => null);
      if (!info || info.isDirectory()) filePath = path.join(dist, 'index.html');

      const body = await readFile(filePath);
      res.writeHead(200, { 'content-type': types[path.extname(filePath)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  })();
}

// Windows can reserve ("exclude") arbitrary TCP ports for Hyper-V/WSL, which fails
// bind attempts with EACCES even though the port is otherwise free. Try a few
// candidates before giving up.
function listen(ports) {
  const [port, ...rest] = ports;
  const server = createServer(requestHandler);

  server.once('error', (error) => {
    if ((error.code === 'EACCES' || error.code === 'EADDRINUSE') && rest.length) {
      console.warn(`Port ${port} unavailable (${error.code}), trying ${rest[0]}...`);
      listen(rest);
      return;
    }
    console.error(`Could not start the preview server: ${error.message}`);
    if (error.code === 'EACCES') {
      console.error('Set a free port explicitly with: $env:PORT=3000; npm run serve');
    }
    process.exit(1);
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`Preview of dist/ at http://localhost:${port}`);
  });
}

listen(process.env.PORT ? [preferredPort] : [preferredPort, 4173, 8081, 3000]);
