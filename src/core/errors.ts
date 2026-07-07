import { writeFileSync, appendFileSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export class LionFixError extends Error {
  constructor(
    public code: string,
    message: string,
    public severity: 'info' | 'warn' | 'error' | 'critical' = 'error',
    public context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'LionFixError';
  }
}

export function wrapError(err: unknown, code: string, context?: Record<string, unknown>): LionFixError {
  if (err instanceof LionFixError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new LionFixError(code, message, 'error', context);
}

export function tryOrDefault<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

export async function tryOrDefaultAsync<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

export function formatError(err: unknown): string {
  if (err instanceof LionFixError) {
    return `[${err.code}] ${err.message} (${err.severity})`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

function syncSleep(ms: number): void {
  const start = Date.now();
  while (Date.now() - start < ms) {  }
}

const EBUSY_DELAYS = [100, 200, 400, 800, 1600];

function isEBUSY(err: unknown): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === 'EBUSY';
}

function tryWriteFallback(path: string, data: string | Buffer, encoding?: BufferEncoding): void {
  try {
    const fallback = path + '.pending';
    writeFileSync(fallback, data, { encoding: encoding ?? 'utf-8' });
  } catch {  }
}

export function reconcilePendingFiles(inventarioRaiz: string): void {
  try {
    for (const f of readdirSync(inventarioRaiz)) {
      if (!f.endsWith('.csv.pending') && !f.endsWith('.xlsx.pending')) continue;
      const pendingPath = join(inventarioRaiz, f);
      const originalPath = pendingPath.replace(/\.pending$/, '');
      const content = readFileSync(pendingPath, 'utf-8');
      appendFileSync(originalPath, content, 'utf-8');
      renameSync(pendingPath, pendingPath + '.reconciled');
    }
  } catch {  }
}

export function writeFileWithRetry(
  path: string,
  data: string | Buffer,
  encoding?: BufferEncoding,
): void {
  for (let attempt = 0; attempt <= EBUSY_DELAYS.length; attempt++) {
    try {
      writeFileSync(path, data, { encoding: encoding ?? 'utf-8' });
      return;
    } catch (err: unknown) {
      if (isEBUSY(err) && attempt < EBUSY_DELAYS.length) {
        syncSleep(EBUSY_DELAYS[attempt]);
        continue;
      }
      if (isEBUSY(err)) {
        tryWriteFallback(path, data, encoding);
        return;
      }
      throw err;
    }
  }
}

export function appendFileWithRetry(
  path: string,
  data: string | Buffer,
  encoding?: BufferEncoding,
): void {
  for (let attempt = 0; attempt <= EBUSY_DELAYS.length; attempt++) {
    try {
      appendFileSync(path, data, { encoding: encoding ?? 'utf-8' });
      return;
    } catch (err: unknown) {
      if (isEBUSY(err) && attempt < EBUSY_DELAYS.length) {
        syncSleep(EBUSY_DELAYS[attempt]);
        continue;
      }
      if (isEBUSY(err)) {
        
        const existing = tryOrDefault(() => readFileSync(path, 'utf-8'), '');
        tryWriteFallback(path, existing + data, encoding);
        return;
      }
      throw err;
    }
  }
}
