// Local JSON store — single source of truth, fully offline.
// data/db.json holds everything; backups roll on server boot (14 days kept).
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Db, Customer, Contract, Payment, Settings } from '../../src/types';

const DATA_DIR = () => path.join(process.cwd(), 'data');
const DB_FILE = () => path.join(DATA_DIR(), 'db.json');
const BACKUP_DIR = () => path.join(DATA_DIR(), 'backups');
const SEED_FILE = () => path.join(process.cwd(), 'data', 'seed-data.json');

let cache: Db | null = null;
let lastMtime = -1;

export function cryptoId(): string {
  return crypto.randomUUID();
}

export function defaultSettings(): Settings {
  return {
    promptpayId: '0812345678',
    promptpayName: 'ชื่อผู้รับเงิน',
    lateFeePerDay: 50,
    collectionFee: 100,
  };
}

function emptyDb(): Db {
  return { customers: [], contracts: [], payments: [], settings: defaultSettings() };
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function rollBackups() {
  try {
    ensureDir(BACKUP_DIR());
    const stamp = new Date().toISOString().slice(0, 10);
    const target = path.join(BACKUP_DIR(), `db-${stamp}.json`);
    if (fs.existsSync(DB_FILE()) && !fs.existsSync(target)) {
      fs.copyFileSync(DB_FILE(), target);
    }
    // keep the newest 14 backups
    const files = fs.readdirSync(BACKUP_DIR()).filter((f) => f.startsWith('db-') && f.endsWith('.json')).sort();
    while (files.length > 14) {
      const oldest = files.shift();
      if (oldest) fs.unlinkSync(path.join(BACKUP_DIR(), oldest));
    }
  } catch (e) {
    console.error('[store] backup failed:', (e as Error).message);
  }
}

export function loadDb(): Db {
  ensureDir(DATA_DIR());
  const mtime = fs.existsSync(DB_FILE()) ? fs.statSync(DB_FILE()).mtimeMs : -1;
  if (cache && mtime === lastMtime) return cache;
  if (fs.existsSync(DB_FILE())) {
    try {
      cache = JSON.parse(fs.readFileSync(DB_FILE(), 'utf8')) as Db;
    } catch (e) {
      console.error('[store] db.json corrupt, starting fresh:', (e as Error).message);
      cache = emptyDb();
    }
  } else {
    cache = emptyDb();
  }
  // migrate: guarantee every table exists
  cache.customers ??= [];
  cache.contracts ??= [];
  cache.payments ??= [];
  cache.settings = { ...defaultSettings(), ...cache.settings };
  lastMtime = mtime;
  return cache;
}

export function persist() {
  ensureDir(DATA_DIR());
  const tmp = DB_FILE() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache ?? emptyDb(), null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE());
  lastMtime = fs.statSync(DB_FILE()).mtimeMs;
}

export function ensureSeed(): void {
  const db = loadDb();
  if (db.customers.length > 0) return;
  // First boot: import real data if seed-data.json exists (exported from the
  // owner's Excel collection sheet), otherwise stay empty.
  if (fs.existsSync(SEED_FILE())) {
    try {
      const seed = JSON.parse(fs.readFileSync(SEED_FILE(), 'utf8'));
      db.customers = seed.customers ?? [];
      db.contracts = seed.contracts ?? [];
      db.payments = seed.payments ?? [];
      if (seed.settings) db.settings = { ...db.settings, ...seed.settings };
      persist();
      console.log(`[store] seeded: ${db.customers.length} customers, ${db.contracts.length} contracts`);
      return;
    } catch (e) {
      console.error('[store] seed-data.json invalid — starting empty:', (e as Error).message);
    }
  }
  persist();
}

export function saveDb(db: Db) {
  cache = db;
  persist();
}

/* ------------------------------ backups API ------------------------------ */

export function backupTo(dir: string): string {
  ensureDir(dir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(dir, `manual-backup-${stamp}.json`);
  fs.copyFileSync(DB_FILE(), file);
  return file;
}

export function restoreFrom(jsonText: string): Db {
  const parsed = JSON.parse(jsonText) as Db;
  if (!Array.isArray(parsed.customers) || !Array.isArray(parsed.contracts)) {
    throw new Error('ไฟล์สำรองไม่ถูกต้อง (ไม่พบ customers/contracts)');
  }
  parsed.payments ??= [];
  parsed.settings = { ...defaultSettings(), ...parsed.settings };
  saveDb(parsed);
  return parsed;
}

/* --------------------------- schedule generation -------------------------- */

/** Build installment rows for a new contract: N monthly rows on dueDay. */
export function buildSchedule(
  startDate: string,
  dueDay: number,
  totalPeriods: number,
  monthlyAmount: number
): Contract['installments'] {
  const rows: Contract['installments'] = [];
  const start = new Date(startDate + 'T00:00:00');
  const base = new Date(start.getFullYear(), start.getMonth(), 1); // month grid
  for (let no = 1; no <= totalPeriods; no++) {
    const month = new Date(base.getFullYear(), base.getMonth() + (no - 1), 1);
    const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const day = Math.min(dueDay, lastDay);
    const iso = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    rows.push({ no, dueDate: iso, amount: monthlyAmount, status: 'due', paidAt: null, paymentId: null });
  }
  return rows;
}
