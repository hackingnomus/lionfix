import { readdirSync, existsSync, statSync, createReadStream, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { registrarAdicion } from './changes.js';
import { logActivity } from './logger.js';

const INCOMPLETE_EXTS = /^(crdownload|part|tmp|downloading|download|opdownload|partial|aria2)$/i;

export function classifyByExtension(ext: string): string {
  const e = ext.toLowerCase();
  if (/^(crdownload|part|tmp|downloading|download|opdownload|partial|aria2)$/.test(e)) return 'INCOMPLETO';
  if (/^(iso|img)$/.test(e)) return 'ISOs';
  if (/^(exe|msi|bat|ps1|cmd|sh)$/.test(e)) return 'Herramientas';
  if (/^(zip|rar|7z|tar|gz)$/.test(e)) return 'Drivers';
  if (/^(pdf|doc|docx|txt|md)$/.test(e)) return 'Documentos';
  return 'Otros';
}

function classifyISO(name: string, nameLower: string): string {
  if (/hiren|ubcd|ultimate\.boot|boot\.repair|gparted|clonezilla/i.test(nameLower)) {
    if (/hiren/i.test(nameLower)) return 'ISOs/Herramientas/HirensBootCD';
    if (/clonezilla/i.test(nameLower)) return 'ISOs/Herramientas/Clonezilla';
    return 'ISOs/Herramientas/UltimateBootCD';
  }
  if (/win|windows/i.test(nameLower)) return 'ISOs/Windows';
  if (/ubuntu|mint|debian|fedora|arch|manjaro|opensuse|linux/i.test(nameLower)) {
    let distro = 'Otros';
    if (/ubuntu/i.test(nameLower)) distro = 'Ubuntu';
    else if (/mint/i.test(nameLower)) distro = 'Mint';
    else if (/debian/i.test(nameLower)) distro = 'Debian';
    else if (/fedora/i.test(nameLower)) distro = 'Fedora';
    return `ISOs/Linux/${distro}`;
  }
  return 'ISOs/Otros';
}

function classifyDriver(nameLower: string): string {
  if (/red|lan|wlan|network/i.test(nameLower)) {
    const marca = /realtek/i.test(nameLower) ? 'Realtek' : /intel/i.test(nameLower) ? 'Intel' : 'Generico';
    return `Drivers/Red/${marca}`;
  }
  if (/audio|sound/i.test(nameLower)) return 'Drivers/Audio/Generico';
  if (/video|graphics|nvidia|amd|radeon/i.test(nameLower)) {
    const marca = /nvidia/i.test(nameLower) ? 'NVIDIA' : /amd/i.test(nameLower) ? 'AMD' : 'Generico';
    return `Drivers/Video/${marca}`;
  }
  if (/chipset/i.test(nameLower)) return 'Drivers/Chipset/Generico';
  return 'Drivers/Otros/Generico';
}

function classifyTool(nameLower: string): string {
  if (/victoria|hdd\.regenerator|crystaldisk|disk|hdd|ssd/i.test(nameLower)) return 'Herramientas/Diagnostico_Disco';
  if (/testdisk|recuva|recuper|data\.recovery/i.test(nameLower)) return 'Herramientas/Recuperacion_Datos';
  if (/memtest|ram|memoria/i.test(nameLower)) return 'Herramientas/RAM';
  if (/cpu-z|hwmonitor|aida|prime|cinebench/i.test(nameLower)) return 'Herramientas/Sistema';
  return 'Herramientas/Otros';
}

export function classifyFile(fileName: string, extension: string): string {
  const nameLower = fileName.toLowerCase();
  const ext = extension.toLowerCase();

  if (ext === 'iso' || ext === 'img') return classifyISO(fileName, nameLower);
  if (/^(exe|msi|bat|ps1|sh|cmd)$/.test(ext)) return classifyTool(nameLower);
  if (/^(zip|rar|7z|tar|gz)$/.test(ext)) return classifyDriver(nameLower);
  if (/^(pdf|doc|docx|txt|md)$/.test(ext)) return 'Documentos';
  return 'Otros';
}

export function resolveCollision(destDir: string, fileName: string): string {
  const base = extname(fileName) ? fileName.slice(0, -(extname(fileName).length)) : fileName;
  const ext = extname(fileName);
  let counter = 1;
  let newName = `${base}_v${counter}${ext}`;
  while (existsSync(join(destDir, newName))) {
    counter++;
    newName = `${base}_v${counter}${ext}`;
  }
  return newName;
}

/**
 * Calcula el hash SHA-256 usando streams para no cargar archivos grandes en RAM.
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk: Buffer) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Busca archivos duplicados en el inventario usando la caché de hashes.
 * Primero consulta .hashes.sha256 (O(1)), y solo si no encuentra
 * coincidencia cae a walk + hash (O(n)).
 */
export async function findInventoryDuplicates(
  inventarioRaiz: string,
  sourceHash: string,
  sourceName: string,
): Promise<string[]> {
  const duplicates: string[] = [];

  // Fast path: consultar caché .hashes.sha256
  const hashDbPath = join(inventarioRaiz, '.hashes.sha256');
  if (existsSync(hashDbPath)) {
    try {
      const raw = readFileSync(hashDbPath, 'utf-8');
      for (const line of raw.trim().split('\n')) {
        if (!line.trim()) continue;
        const parts = line.split(/\s+/);
        if (parts.length >= 4) {
          const hash = parts[0];
          let relPath = parts[1];
          if (relPath.startsWith('./')) relPath = relPath.slice(2);
          const fileName = relPath.split('/').pop() || '';
          if (hash === sourceHash && fileName !== sourceName) {
            duplicates.push(join(inventarioRaiz, relPath));
          }
        }
      }
      if (duplicates.length > 0) return duplicates;
    } catch { /* fall through to slow path */ }
  }

  // Slow path: walk + hash (solo si no hay caché o no hubo match)
  async function walk(dir: string) {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }

    for (const entry of entries) {
      if (
        entry.startsWith('.') ||
        entry === 'backups' ||
        entry === '.papelera' ||
        entry === 'usuarios' ||
        entry === 'por_clasificar'
      ) continue;

      const fullPath = join(dir, entry);
      try {
        if (statSync(fullPath).isDirectory()) {
          await walk(fullPath);
        } else {
          const h = await calculateFileHash(fullPath);
          if (h === sourceHash && entry !== sourceName) {
            duplicates.push(fullPath);
          }
        }
      } catch { /* ignore unreadable files */ }
    }
  }

  await walk(inventarioRaiz);
  return duplicates;
}

/**
 * Registra la adición de un archivo al inventario en el log de cambios.
 */
export function registrarAdicionInventario(
  inventarioRaiz: string,
  destPath: string,
  hash: string,
  tecnico: string,
): void {
  try {
    registrarAdicion(inventarioRaiz, destPath, hash, tecnico);
  } catch { /* no bloquear si falla el log */ }
}

export function getPendingFiles(porClasificarDir: string): string[] {
  if (!existsSync(porClasificarDir)) return [];
  return readdirSync(porClasificarDir).filter(f => {
    if (f.startsWith('.')) return false;
    const ext = f.split('.').pop() || '';
    return !INCOMPLETE_EXTS.test(ext);
  });
}
