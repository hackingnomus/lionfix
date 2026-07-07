import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';

const PAPELERA_NAME = '.papelera';

function getPapeleraDir(inventarioRaiz: string): string {
  return join(inventarioRaiz, PAPELERA_NAME);
}

export interface TrashEntry {
  nombre_original: string;
  ruta_original: string;
  fecha: string;
  hash: string;
  tecnico: string;
}

export function moveToTrash(
  filePath: string,
  inventarioRaiz: string,
  tecnico: string,
): string | null {
  const papelera = getPapeleraDir(inventarioRaiz);
  const trashDir = join(papelera, 'archivos');
  const metaDir = join(papelera, 'meta');
  mkdirSync(trashDir, { recursive: true });
  mkdirSync(metaDir, { recursive: true });

  const name = basename(filePath);
  const timestamp = Date.now();
  const trashName = `${timestamp}_${name}`;
  const trashPath = join(trashDir, trashName);
  const metaPath = join(metaDir, `${trashName}.meta`);

  try {
    renameSync(filePath, trashPath);
  } catch {
    return null;
  }

  const entry: TrashEntry = {
    nombre_original: name,
    ruta_original: filePath,
    fecha: new Date().toISOString().replace('T', ' ').slice(0, 19),
    hash: '',
    tecnico,
  };

  writeFileSync(metaPath, JSON.stringify(entry, null, 2), 'utf-8');
  return trashPath;
}

export function listTrash(inventarioRaiz: string): TrashEntry[] {
  const metaDir = join(getPapeleraDir(inventarioRaiz), 'meta');
  if (!existsSync(metaDir)) return [];

  return readdirSync(metaDir)
    .filter(f => f.endsWith('.meta'))
    .map(f => {
      try {
        const raw = readFileSync(join(metaDir, f), 'utf-8');
        return JSON.parse(raw) as TrashEntry;
      } catch { return null; }
    })
    .filter((e): e is TrashEntry => e !== null);
}

export function restoreFromTrash(
  trashFileName: string,
  inventarioRaiz: string,
  tecnico: string,
): boolean {
  const papelera = getPapeleraDir(inventarioRaiz);
  const trashPath = join(papelera, 'archivos', trashFileName);
  const metaPath = join(papelera, 'meta', `${trashFileName}.meta`);

  if (!existsSync(metaPath)) return false;

  try {
    const raw = readFileSync(metaPath, 'utf-8');
    const entry = JSON.parse(raw) as TrashEntry;
    if (existsSync(trashPath)) {
      renameSync(trashPath, entry.ruta_original);
      unlinkSync(metaPath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function emptyTrash(inventarioRaiz: string): number {
  const papelera = getPapeleraDir(inventarioRaiz);
  const trashDir = join(papelera, 'archivos');
  const metaDir = join(papelera, 'meta');
  let count = 0;

  if (existsSync(trashDir)) {
    for (const f of readdirSync(trashDir)) {
      try { unlinkSync(join(trashDir, f)); count++; } catch { }
    }
  }
  if (existsSync(metaDir)) {
    for (const f of readdirSync(metaDir)) {
      try { unlinkSync(join(metaDir, f)); } catch { }
    }
  }
  return count;
}

export function trashSize(inventarioRaiz: string): number {
  const papelera = getPapeleraDir(inventarioRaiz);
  const trashDir = join(papelera, 'archivos');
  if (!existsSync(trashDir)) return 0;
  try {
    return readdirSync(trashDir).filter(f => !f.startsWith('.')).length;
  } catch { return 0; }
}
