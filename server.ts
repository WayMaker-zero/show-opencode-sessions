import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as net from 'node:net';
import open from 'open';
import { handleOpencodeApi, resolveOpencodeRoot, enableShutdown, getLastHeartbeatTime } from './opencode-api';

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

function getLockFilePath(): string {
  const info = resolveOpencodeRoot();
  if (info && info.root) {
    return path.join(info.root, 'show-session.lock');
  }
  return path.join(os.tmpdir(), 'show-opencode-sessions.lock');
}

async function shutdownOldInstance(lockFile: string): Promise<void> {
  if (!fs.existsSync(lockFile)) return;

  try {
    const content = fs.readFileSync(lockFile, 'utf8');
    const { port, pid } = JSON.parse(content);

    // Check if pid is running
    let isAlive = false;
    try {
      process.kill(pid, 0);
      isAlive = true;
    } catch (_) {}

    if (isAlive) {
      console.log(`[Bootstrap] 发现正在运行的旧实例 (PID: ${pid}, Port: ${port})。`);
      
      // Try sending a graceful shutdown request
      try {
        await new Promise<void>((resolve, reject) => {
          const req = http.get(`http://127.0.0.1:${port}/api/opencode/shutdown`, (res) => {
            if (res.statusCode === 200) resolve();
            else reject(new Error('Shutdown request failed'));
          });
          req.on('error', reject);
          req.setTimeout(500, () => {
            req.destroy();
            reject(new Error('Timeout'));
          });
        });
        console.log('[Bootstrap] 已发送停机信号，等待端口释放...');
      } catch (e) {
        console.log('[Bootstrap] 优雅停机请求失败或超时，准备强制终止。');
      }

      // Loop and wait for process to exit (up to 1s)
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        try {
          process.kill(pid, 0);
        } catch (_) {
          isAlive = false;
          break;
        }
      }

      if (isAlive) {
        console.log(`[Bootstrap] 正在强制杀死僵死进程: ${pid}`);
        try {
          process.kill(pid, 'SIGKILL');
        } catch (err) {
          console.error('[Bootstrap] 强杀进程失败:', err);
        }
      }
    }
  } catch (err) {
    console.warn('[Bootstrap] 解析或清理锁文件失败:', err);
  } finally {
    try {
      fs.unlinkSync(lockFile);
    } catch (_) {}
  }
}

function findFreePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const testServer = net.createServer();
    testServer.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        testServer.close(() => {
          findFreePort(startPort + 1).then(resolve).catch(reject);
        });
      } else {
        reject(err);
      }
    });

    testServer.once('listening', () => {
      testServer.close(() => resolve(startPort));
    });

    testServer.listen(startPort, '127.0.0.1');
  });
}

async function bootstrap() {
  const lockFile = getLockFilePath();
  
  // A. Shutdown old instance if running
  await shutdownOldInstance(lockFile);

  // B. Find a free port
  const defaultPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3003;
  const PORT = await findFreePort(defaultPort);

  // C. Enable API shutdown in production
  enableShutdown();

  // D. Write current process lock
  try {
    fs.writeFileSync(lockFile, JSON.stringify({ port: PORT, pid: process.pid }), 'utf8');
  } catch (err) {
    console.error('[Bootstrap] 写入锁文件失败:', err);
  }

  // E. Listen
  server.listen(PORT, '127.0.0.1', () => {
    const localUrl = `http://localhost:${PORT}`;
    console.log(`Server is running locally at: ${localUrl}`);
    console.log('Automatically opening browser...');
    
    open(localUrl).catch(err => {
      console.error('Failed to open browser automatically:', err);
    });
  });

  // F. Heartbeat checker for self-shutdown
  const CHECK_INTERVAL = 2000; // Check every 2 seconds
  const IDLE_TIMEOUT = 10000;  // 10 seconds timeout
  setInterval(() => {
    const lastHeartbeat = getLastHeartbeatTime();
    if (Date.now() - lastHeartbeat > IDLE_TIMEOUT) {
      console.log('[Server] 检测到没有任何活跃网页连接（所有标签页已关闭）。正在自动停机自毁...');
      cleanupLock();
      process.exit(0);
    }
  }, CHECK_INTERVAL);

  // G. Cleanup on exit signals
  const cleanupLock = () => {
    try {
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
      }
    } catch (_) {}
  };
  process.on('exit', cleanupLock);
  process.on('SIGINT', () => { cleanupLock(); process.exit(0); });
  process.on('SIGTERM', () => { cleanupLock(); process.exit(0); });
}

bootstrap().catch(err => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
