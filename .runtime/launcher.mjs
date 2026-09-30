// Launcher: starts the local server, waits for it, then opens the dashboard
// in the default browser. Called from start.bat (desktop shortcut).
import { spawn, exec } from 'child_process';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const ROOT = path.dirname(fileURLToPath(import.meta.url)); // .runtime
const APP = path.dirname(ROOT);                            // project root
const NODE_CANDIDATES = [
  process.env.NB_NODE_BIN,
  path.join(process.env.LOCALAPPDATA || '', 'Programs', '@codebufffreebuff-desktop', 'Freebuff.exe'),
].filter(Boolean);

const nodeBin = NODE_CANDIDATES.find((p) => existsSync(p));
if (!nodeBin) {
  console.error('ไม่พบ Node runtime (Freebuff desktop) — ติดตั้ง Freebuff ก่อน หรือตั้ง NB_NODE_BIN');
  process.exit(1);
}

const PORT = 3000;
const URL = `http://localhost:${PORT}`;
const LOG = path.join(APP, 'data', 'server.log');

const ping = () => new Promise((resolve) => {
  const req = http.get(`${URL}/api/settings`, (res) => { res.resume(); resolve(res.statusCode === 401 || res.statusCode === 200); });
  req.on('error', () => resolve(false));
  req.setTimeout(1200, () => { req.destroy(); resolve(false); });
});

if (await ping()) {
  console.log('server already running');
} else {
  const child = spawn(nodeBin, [path.join(APP, '.runtime', 'tsx-cli.mjs'), path.join(APP, 'server.ts')], {
    cwd: APP,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production' },
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await new Promise((r) => setTimeout(r, 500));
    up = await ping();
  }
  if (!up) {
    console.error('server ไม่ตอบสนอง — ดู log: ' + LOG);
    process.exit(1);
  }
}

exec(`start "" "${URL}"`);
console.log('opened', URL);
setTimeout(() => process.exit(0), 800);
