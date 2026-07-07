import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { detectPlatform, detectUSBDrives } from './usb.js';
import { parseLog, readLog, LogEntry } from './logger.js';
import { listBackups } from './backup.js';
import { trashSize } from './trash.js';
import { formatBytes } from '../utils/format.js';

export interface Dashboard {
  pendientes: number;
  total_inventario: number;
  espacio_usado: string;
  espacio_libre: string;
  ultimo_backup: string | null;
  total_actividades: number;
  total_usuarios: number;
  usb_detectados: number;
  version: string;
  top5_mas_grandes: { name: string; size: string }[];
  backup_age_dias: number | null;
  trash_count: number;
  archivos_por_categoria: { isos: number; herramientas: number; drivers: number; documentos: number; otros: number };
}

export interface InventoryCount {
  isos: number;
  herramientas: number;
  drivers: number;
  documentos: number;
  otros: number;
  total: number;
}

export function getInventoryCounts(inventarioRaiz: string): InventoryCount {
  const result: InventoryCount = { isos: 0, herramientas: 0, drivers: 0, documentos: 0, otros: 0, total: 0 };

  if (!existsSync(inventarioRaiz)) return result;

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.')) continue;
      const full = join(dir, entry);
      if (entry === 'backups') continue;
      if (entry === 'usuarios') continue;
      if (entry === '.papelera') continue;
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        result.total++;
        const parent = dir.replace(inventarioRaiz, '').split(/[\\/]/).filter(Boolean);
        if (parent.length === 0) parent.push('Raiz');
        if (parent.includes('ISOs')) result.isos++;
        else if (parent.includes('Herramientas')) result.herramientas++;
        else if (parent.includes('Drivers')) result.drivers++;
        else if (parent.includes('Documentos')) result.documentos++;
        else result.otros++;
      }
    }
  }

  walk(inventarioRaiz);
  return result;
}



export function getPendingCount(porClasificarDir: string): number {
  if (!existsSync(porClasificarDir)) return 0;
  return readdirSync(porClasificarDir).filter(f => {
    if (f.startsWith('.')) return false;
    const ext = f.split('.').pop()?.toLowerCase() || '';
    return !/^(crdownload|part|tmp|downloading|download|opdownload|partial|aria2)$/.test(ext);
  }).length;
}

export function getDiskInfo(inventarioRaiz: string): { used: string; free: string } {
  try {
    if (process.platform === 'win32') {
      const root = inventarioRaiz.split(':')[0] || 'C';
      try {
        const out = execSync(
          `powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk -Filter 'DeviceID=\\"${root}:\\"' | Select-Object @{N='Size';E={$_.Size}},@{N='Free';E={$_.FreeSpace}} | ConvertTo-Csv -NoTypeInformation"`,
          { encoding: 'utf-8', timeout: 5000 },
        );
        const lines = out.trim().split('\n');
        if (lines.length > 1) {
          const parts = lines[1].split(',');
          const size = parseInt(parts[0]?.replace(/"/g, ''), 10);
          const free = parseInt(parts[1]?.replace(/"/g, ''), 10);
          if (!isNaN(free) && !isNaN(size)) {
            return { used: formatBytes(size - free), free: formatBytes(free) };
          }
        }
      } catch { }
      try {
        const out = execSync(`wmic logicaldisk where deviceid="${root}:" get freespace,size /format:csv 2>nul`, { encoding: 'utf-8', timeout: 5000 });
        const lines = out.trim().split('\n');
        if (lines.length > 1) {
          const parts = lines[1].split(',');
          const free = parseInt(parts[1], 10);
          const size = parseInt(parts[2], 10);
          if (!isNaN(free) && !isNaN(size)) {
            return { used: formatBytes(size - free), free: formatBytes(free) };
          }
        }
      } catch { }
    } else {
      const df = execSync(`df -B1 "${inventarioRaiz}" 2>/dev/null | tail -1`, { encoding: 'utf-8', timeout: 5000 });
      const parts = df.trim().split(/\s+/);
      if (parts.length >= 4) {
        const total = parseInt(parts[1], 10);
        const used = parseInt(parts[2], 10);
        const free = parseInt(parts[3], 10);
        if (!isNaN(total) && !isNaN(free)) {
          return {
            used: formatBytes(used),
            free: formatBytes(free),
          };
        }
      }
    }
  } catch { }
  return { used: 'N/A', free: 'N/A' };
}

export function getTop5LargestFiles(inventarioRaiz: string): { name: string; size: string }[] {
  const files: { name: string; size: number }[] = [];
  function walk(dir: string, prefix: string) {
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith('.') || entry === 'backups' || entry === '.papelera' || entry === 'usuarios') continue;
        const full = join(dir, entry);
        const rel = prefix ? `${prefix}/${entry}` : entry;
        if (statSync(full).isDirectory()) { walk(full, rel); }
        else { files.push({ name: rel, size: statSync(full).size }); }
      }
    } catch { }
  }
  walk(inventarioRaiz, '');
  files.sort((a, b) => b.size - a.size);
  return files.slice(0, 5).map(f => ({
    name: f.name,
    size: formatBytes(f.size),
  }));
}

function getBackupAgeDays(inventarioRaiz: string): number | null {
  const backups = listBackups(inventarioRaiz);
  if (backups.length === 0) return null;
  const latest = backups[0];
  try {
    const stat = statSync(latest);
    const ageMs = Date.now() - stat.mtimeMs;
    return Math.floor(ageMs / 86400000);
  } catch { return null; }
}

export async function getDashboard(inventarioRaiz: string): Promise<Dashboard> {
  const porClasificar = join(inventarioRaiz, 'por_clasificar');
  const pending = getPendingCount(porClasificar);
  const counts = getInventoryCounts(inventarioRaiz);
  const disk = getDiskInfo(inventarioRaiz);
  const logs = parseLog(readLog(inventarioRaiz));

  let lastBackup: string | null = null;
  const backupMeta = join(inventarioRaiz, '.ultimo_backup');
  if (existsSync(backupMeta)) {
    const raw = readFileSync(backupMeta, 'utf-8');
    const match = raw.match(/^ultimo_backup="(.+)"$/m);
    if (match) lastBackup = match[1];
  }

  const top5 = getTop5LargestFiles(inventarioRaiz);
  const backupAge = getBackupAgeDays(inventarioRaiz);
  const trashCount = trashSize(inventarioRaiz);

  return {
    pendientes: pending,
    total_inventario: counts.total,
    espacio_usado: disk.used,
    espacio_libre: disk.free,
    ultimo_backup: lastBackup,
    total_actividades: logs.length,
    total_usuarios: (() => {
      try {
        const usersDir = join(inventarioRaiz, 'usuarios');
        if (!existsSync(usersDir)) return 0;
        return readdirSync(usersDir).filter(f =>
          statSync(join(usersDir, f)).isDirectory()
        ).length;
      } catch { return 0; }
    })(),
    usb_detectados: detectUSBDrives(detectPlatform()).length,
    version: '5.0.0',
    top5_mas_grandes: top5,
    backup_age_dias: backupAge,
    trash_count: trashCount,
    archivos_por_categoria: {
      isos: counts.isos,
      herramientas: counts.herramientas,
      drivers: counts.drivers,
      documentos: counts.documentos,
      otros: counts.otros,
    },
  };
}
