// Single-operator local auth — one password, session tokens.
// The dashboard runs on the owner's machine; there is no signup and no cloud.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

type UserRow = {
  id: string;
  email: string;
  passHash: string;
  salt: string;
  createdAt: string;
};

type SessionRow = {
  id: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
};

const AUTH_FILE = () => path.join(process.cwd(), 'data', 'auth.json');

function scryptHash(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

type AuthData = { users: UserRow[]; sessions: SessionRow[] };

function loadAuth(): AuthData {
  if (fs.existsSync(AUTH_FILE())) {
    try {
      const d = JSON.parse(fs.readFileSync(AUTH_FILE(), 'utf8'));
      d.users ??= [];
      d.sessions ??= [];
      return d;
    } catch {
      /* fall through */
    }
  }
  return { users: [], sessions: [] };
}

function saveAuth(d: AuthData) {
  fs.writeFileSync(AUTH_FILE(), JSON.stringify(d, null, 2), 'utf8');
}

function bootstrapPassword(): string {
  // .env at workspace root or local; if unset, generate a one-time random password
  const env = process.env.LOCAL_ADMIN_PASSWORD;
  if (env) return env;
  const generated = crypto.randomBytes(16).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
  console.log(`[auth] ⚠️  LOCAL_ADMIN_PASSWORD not set — generated bootstrap password: ${generated}`);
  console.log('[auth]   set the env var to lock it down, or change via /api/auth/change-password');
  return generated;
}

/** Ensure the single operator account exists (password from .env on first boot). */
export function ensureBootstrapUser(): void {
  const d = loadAuth();
  if (d.users.length > 0) return;
  const password = bootstrapPassword();
  const salt = crypto.randomBytes(16).toString('hex');
  const user: UserRow = {
    id: crypto.randomUUID(),
    email: 'owner@local',
    passHash: scryptHash(password, salt),
    salt,
    createdAt: new Date().toISOString(),
  };
  d.users.push(user);
  saveAuth(d);
  console.log('[auth] operator account ready (password from LOCAL_ADMIN_PASSWORD or default)');
}

/** Change the operator password (also invalidates all sessions). */
export function changePassword(current: string, next: string): { ok: boolean; error?: string } {
  const d = loadAuth();
  const user = d.users[0];
  if (!user) return { ok: false, error: 'no operator account' };
  if (scryptHash(current, user.salt) !== user.passHash) {
    return { ok: false, error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' };
  }
  if (typeof next !== 'string' || next.length < 6) {
    return { ok: false, error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' };
  }
  const salt = crypto.randomBytes(16).toString('hex');
  user.salt = salt;
  user.passHash = scryptHash(next, salt);
  d.sessions = [];
  saveAuth(d);
  return { ok: true };
}

export function verifyPassword(password: string): boolean {
  const d = loadAuth();
  const user = d.users[0];
  if (!user) return false;
  const a = Buffer.from(scryptHash(password, user.salt), 'hex');
  const b = Buffer.from(user.passHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createSession(): { token: string; expiresAt: string } {
  const d = loadAuth();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  d.sessions.push({ id: crypto.randomUUID(), tokenHash: tokenHash(token), createdAt: new Date().toISOString(), expiresAt });
  // keep sessions trimmed
  const now = new Date().toISOString();
  d.sessions = d.sessions.filter((s) => s.expiresAt > now).slice(-20);
  saveAuth(d);
  return { token, expiresAt };
}

export function verifySession(token: string | undefined | null): boolean {
  if (!token) return false;
  const d = loadAuth();
  const now = new Date().toISOString();
  return d.sessions.some((s) => s.tokenHash === tokenHash(token) && s.expiresAt > now);
}

export function signOut(token: string | undefined | null): void {
  if (!token) return;
  const d = loadAuth();
  d.sessions = d.sessions.filter((s) => s.tokenHash !== tokenHash(token));
  saveAuth(d);
}
