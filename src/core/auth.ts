import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, readdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { hostname } from 'node:os';

interface UserEntry {
  username: string;
  passwordHash: string;
}

const MAX_LOGIN_ATTEMPTS = 3;

function getUsersDb(inventarioRaiz: string): string {
  return join(inventarioRaiz, '.usuarios.db');
}

function getMachineId(): string {
  try {
    if (process.platform === 'linux') {
      const id = readFileSync('/etc/machine-id', 'utf-8').trim();
      return `${id}_${hostname()}`;
    }
  } catch { }
  return `${hostname()}_${process.env.USER || process.env.USERNAME || 'unknown'}`;
}

const HASH_OLD_SHA256_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (storedHash.length === HASH_OLD_SHA256_LEN && !storedHash.includes(':')) {
    return createHash('sha256').update(password, 'utf-8').digest('hex') === storedHash;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  const derived = scryptSync(password, salt, 32).toString('hex');
  const derivedBuf = Buffer.from(derived);
  const hashBuf = Buffer.from(hash);
  if (derivedBuf.length !== hashBuf.length) return false;
  return timingSafeEqual(derivedBuf, hashBuf);
}

export function sanitizeUsername(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
}

export function loadUsers(inventarioRaiz: string): UserEntry[] {
  const db = getUsersDb(inventarioRaiz);
  if (!existsSync(db)) return [];
  const raw = readFileSync(db, 'utf-8').trim();
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(line => {
    const [username, passwordHash] = line.split(':');
    return { username, passwordHash };
  });
}

export function saveUser(inventarioRaiz: string, username: string, passwordHash: string): void {
  const db = getUsersDb(inventarioRaiz);
  mkdirSync(dirname(db), { recursive: true });

  let users = loadUsers(inventarioRaiz);
  users = users.filter(u => u.username !== username);
  users.push({ username, passwordHash });

  const content = users.map(u => `${u.username}:${u.passwordHash}`).join('\n') + '\n';
  const tmpDb = db + '.tmp';
  writeFileSync(tmpDb, content, 'utf-8');
  if (process.platform !== 'win32') try { chmodSync(tmpDb, 0o600); } catch { }
  renameSync(tmpDb, db);
}


export function userExists(inventarioRaiz: string, username: string): boolean {
  return loadUsers(inventarioRaiz).some(u => u.username === username);
}

export function getUserHash(inventarioRaiz: string, username: string): string | undefined {
  return loadUsers(inventarioRaiz).find(u => u.username === username)?.passwordHash;
}

export function checkMachineId(inventarioRaiz: string, installedId?: string): boolean {
  const current = getMachineId();
  if (!installedId) return true;
  if (installedId !== current) {
    const db = getUsersDb(inventarioRaiz);
    writeFileSync(db, '', 'utf-8');
    return false;
  }
  return true;
}

export function getCurrentMachineId(): string {
  return getMachineId();
}

export function ensureUserDir(inventarioRaiz: string, username: string): string {
  const safe = sanitizeUsername(username);
  const userDir = join(inventarioRaiz, 'usuarios', safe);
  mkdirSync(userDir, { recursive: true });
  const logFile = join(userDir, 'actividades.csv');
  if (!existsSync(logFile)) {
    writeFileSync(logFile, 'FECHA,TECNICO,OPERACION,ARCHIVO,EQUIPO,RESULTADO\n', 'utf-8');
  }
  return userDir;
}

export function saveUserAndCreateDir(inventarioRaiz: string, username: string, passwordHash: string): void {
  saveUser(inventarioRaiz, username, passwordHash);
  ensureUserDir(inventarioRaiz, username);
}

function getLoginAttemptsDir(inventarioRaiz: string): string {
  const d = join(inventarioRaiz, '.login_attempts');
  mkdirSync(d, { recursive: true });
  return d;
}

export function getLoginAttempts(inventarioRaiz: string, username: string): number {
  const dir = getLoginAttemptsDir(inventarioRaiz);
  const file = join(dir, sanitizeUsername(username));
  if (!existsSync(file)) return 0;
  try {
    const raw = readFileSync(file, 'utf-8').trim();
    const lines = raw.split('\n').filter(Boolean);
    
    const now = Date.now();
    const recent = lines.filter(ts => now - parseInt(ts, 10) < 300000);
    writeFileSync(file, recent.join('\n') + '\n', 'utf-8');
    return recent.length;
  } catch { return 0; }
}

export function recordLoginAttempt(inventarioRaiz: string, username: string): void {
  const dir = getLoginAttemptsDir(inventarioRaiz);
  const file = join(dir, sanitizeUsername(username));
  writeFileSync(file, Date.now().toString() + '\n', { flag: 'a' });
}

export function resetLoginAttempts(inventarioRaiz: string, username: string): void {
  const dir = getLoginAttemptsDir(inventarioRaiz);
  const file = join(dir, sanitizeUsername(username));
  try { writeFileSync(file, '', 'utf-8'); } catch { }
}

export function isLoginBlocked(inventarioRaiz: string, username: string): boolean {
  return getLoginAttempts(inventarioRaiz, username) >= MAX_LOGIN_ATTEMPTS;
}
