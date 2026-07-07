import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, statSync } from 'node:fs';

export interface FileStat {
  mtime: number;
  size: number;
}

export function calculateHash(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

export function calculateHashStream(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk: Buffer) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export function readFileStat(filePath: string): FileStat {
  const stat = statSync(filePath);
  return { mtime: Math.floor(stat.mtimeMs / 1000), size: stat.size };
}

export interface HashCacheEntry {
  hash: string;
  mtime: number;
  size: number;
}

export function parseHashDB(content: string): Map<string, HashCacheEntry> {
  const map = new Map<string, HashCacheEntry>();
  for (const line of content.trim().split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split(/\s+/);
    if (parts.length >= 4) {
      const hash = parts[0];
      let relPath = parts[1];
      if (relPath.startsWith('./')) relPath = relPath.slice(2);
      const mtime = parseInt(parts[2], 10);
      const size = parseInt(parts[3], 10);
      if (!isNaN(mtime) && !isNaN(size)) {
        map.set(relPath, { hash, mtime, size });
      }
    }
  }
  return map;
}

export function serializeHashDB(map: Map<string, HashCacheEntry>): string {
  const lines: string[] = [];
  for (const [relPath, entry] of map) {
    lines.push(`${entry.hash} ./${relPath} ${entry.mtime} ${entry.size}`);
  }
  return lines.join('\n');
}

export type CheckStatus = 'OK' | 'NUEVO' | 'CORRUPTO';

export interface CheckResult {
  status: CheckStatus;
  hash: string;
  mtime: number;
  size: number;
}

export async function checkFileIntegrity(
  filePath: string,
  relPath: string,
  cached: HashCacheEntry | undefined,
): Promise<CheckResult> {
  const stat = readFileStat(filePath);

  if (cached && cached.mtime === stat.mtime && cached.size === stat.size) {
    return { status: 'OK', hash: cached.hash, ...stat };
  }

  const hash = await calculateHashStream(filePath);

  if (!cached) {
    return { status: 'NUEVO', hash, ...stat };
  }

  if (hash !== cached.hash) {
    return { status: 'CORRUPTO', hash, ...stat };
  }

  return { status: 'OK', hash, ...stat };
}
