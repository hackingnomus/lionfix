import { statSync, readdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { calculateHashStream } from './integrity.js';

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  hash?: string;
  size?: number;
}

export function verifyDownload(filePath: string): VerifyResult {
  try {
    const stat = statSync(filePath);
    if (stat.size === 0) return { ok: false, reason: 'Archivo vacío' };

    const ext = extname(filePath).toLowerCase().replace('.', '');
    const incompleteExts = /^(crdownload|part|tmp|downloading|download|opdownload|partial|aria2)$/;
    if (incompleteExts.test(ext)) {
      return { ok: false, reason: `Descarga incompleta (.${ext})` };
    }

    if (ext === 'iso' && stat.size < 1048576) {
      return { ok: false, reason: `ISO truncado: menos de 1 MB` };
    }

    return { ok: true, size: stat.size };
  } catch {
    return { ok: false, reason: 'No se puede leer el archivo' };
  }
}

export function verifyDownloadDir(
  dirPath: string,
): { file: string; ok: boolean; reason?: string }[] {
  if (!existsSync(dirPath)) return [];
  const results: { file: string; ok: boolean; reason?: string }[] = [];
  for (const entry of readdirSync(dirPath)) {
    const full = join(dirPath, entry);
    if (statSync(full).isFile()) {
      const r = verifyDownload(full);
      results.push({ file: entry, ...r });
    }
  }
  return results;
}

export async function verifyDownloadWithHash(filePath: string): Promise<VerifyResult> {
  const base = verifyDownload(filePath);
  if (!base.ok) return base;
  try {
    const hash = await calculateHashStream(filePath);
    return { ...base, hash };
  } catch {
    return { ...base, reason: 'Error calculando hash' };
  }
}
