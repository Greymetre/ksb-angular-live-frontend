const fs = require('fs');
const http = require('http');
const path = require('path');

const port = Number(process.env.PORT) || 4200;
const candidates = [
  path.join(__dirname, 'browser'),
  path.join(__dirname, 'dist', 'fieldkonnect-ui', 'browser'),
  path.join(__dirname, 'dist', 'fieldkonnect-ui'),
];

const publicDir = candidates.find((candidate) => fs.existsSync(path.join(candidate, 'index.html')));

if (!publicDir) {
  console.error('No Angular build found. Run "npm run build" before starting the server.');
  process.exit(1);
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendFile(response, filePath) {
  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Internal server error');
      return;
    }

    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
    });
    response.end(contents);
  });
}

const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const appBasePath = '/FieldKonnect';

  if (requestPath === '/' || requestPath === appBasePath) {
    response.writeHead(302, { Location: `${appBasePath}/` });
    response.end();
    return;
  }

  const servedPath = requestPath === appBasePath
    ? '/'
    : requestPath.startsWith(`${appBasePath}/`)
      ? requestPath.slice(appBasePath.length)
      : requestPath;

  if (servedPath === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (servedPath === '/runtime-config.js') {
    const apiOrigin = String(
      process.env.API_ORIGIN ||
      process.env.BACKEND_URL ||
      'http://localhost:8080'
    ).replace(/\/+$/, '');
    const googleMapsApiKey = String(process.env.GOOGLE_MAPS_API_KEY || '');
    response.writeHead(200, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(`window.__KSB_CONFIG__=${JSON.stringify({ apiOrigin, googleMapsApiKey })};`);
    return;
  }

  const normalizedPath = path.normalize(servedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(publicDir, normalizedPath === '/' ? 'index.html' : normalizedPath);

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isFile()) {
      sendFile(response, filePath);
      return;
    }

    sendFile(response, path.join(publicDir, 'index.html'));
  });
});

server.listen(port, '0.0.0.0', () => {
  const address = server.address();
  const resolvedHost = typeof address === 'object' && address ? address.address : 'unknown';
  console.log(`Frontend server listening on ${resolvedHost}:${port}`);
  console.log(`Serving Angular files from ${publicDir}`);
});
