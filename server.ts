import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import open from 'open';
import { handleOpencodeApi } from './opencode-api';

const distDir = path.join(__dirname, '..', 'dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // 1. API Routes
  if (url.pathname.startsWith('/api/opencode')) {
    try {
      await handleOpencodeApi(req, res);
    } catch (err) {
      console.error('API Error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
    }
    return;
  }

  // 2. Static Files Serve
  // Default to index.html for SPA routing
  let filePath = path.join(distDir, url.pathname === '/' ? 'index.html' : url.pathname);
  
  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch {
    // If file doesn't exist, fallback to index.html for React Router
    filePath = path.join(distDir, 'index.html');
  }

  try {
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';
    const content = await fs.promises.readFile(filePath);
    
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Internal Server Error');
    }
  }
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3003;

server.listen(PORT, '127.0.0.1', () => {
  const localUrl = `http://localhost:${PORT}`;
  console.log(`Server is running locally at: ${localUrl}`);
  console.log('Automatically opening browser...');
  
  // Open the browser
  open(localUrl).catch(err => {
    console.error('Failed to open browser automatically. Please open the link above manually.');
  });
});
