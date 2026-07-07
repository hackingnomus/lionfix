import { existsSync, readdirSync, copyFileSync, mkdirSync, statSync, readFileSync } from 'node:fs';
import { join, basename, sep } from 'node:path';
import { execSync } from 'node:child_process';
import { platform } from 'node:os';

const RELEVANT_EXTS = /\.(iso|img|exe|msi|bat|sh|zip|rar|7z)$/i;

function walkFiles(dir: string, maxDepth = 5): string[] {
  const results: string[] = [];
  function inner(path: string, depth: number) {
    if (depth > maxDepth) return;
    let entries: string[];
    try { entries = readdirSync(path); } catch { return; }
    for (const entry of entries) {
      if (entry.startsWith('.') || entry.startsWith('System Volume Information') || entry === '$RECYCLE.BIN') continue;
      const full = join(path, entry);
      try {
        const st = statSync(full);
        if (st.isDirectory()) {
          inner(full, depth + 1);
        } else if (RELEVANT_EXTS.test(entry)) {
          results.push(full);
        }
      } catch {  }
    }
  }
  inner(dir, 0);
  return results;
}

function countByExt(files: string[]): { isos: number; tools: number; drivers: number } {
  let isos = 0, tools = 0, drivers = 0;
  for (const f of files) {
    const ext = f.toLowerCase();
    if (ext.endsWith('.iso') || ext.endsWith('.img')) isos++;
    else if (ext.endsWith('.exe') || ext.endsWith('.msi') || ext.endsWith('.bat') || ext.endsWith('.sh')) tools++;
    else if (ext.endsWith('.zip') || ext.endsWith('.rar') || ext.endsWith('.7z')) drivers++;
  }
  return { isos, tools, drivers };
}

export function detectPlatform(): 'wsl' | 'linux' | 'macos' | 'windows' {
  if (platform() === 'win32') return 'windows';
  if (platform() === 'darwin') return 'macos';
  try {
    const version = readFileSync('/proc/version', 'utf-8');
    if (version.toLowerCase().includes('microsoft')) return 'wsl';
  } catch { }
  return 'linux';
}

export function detectUSBDrives(plat: 'wsl' | 'linux' | 'macos' | 'windows'): string[] {
  const drives: string[] = [];

  if (plat === 'wsl') {
    try {
      const result = execSync(
        'powershell.exe -NoProfile -Command "Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 } | Select-Object -ExpandProperty DeviceID"',
        { encoding: 'utf-8', timeout: 10000 },
      );
      for (const line of result.trim().split('\n')) {
        const drv = line.trim();
        if (!drv) continue;
        const letter = drv.replace(':', '').toLowerCase();
        const mntPath = `/mnt/${letter}`;
        if (existsSync(mntPath) && readdirSync(mntPath).length > 0) {
          drives.push(mntPath);
        }
      }
    } catch { }
  } else if (plat === 'linux') {
    const user = process.env.USER || 'root';
    for (const base of [`/media/${user}`, `/run/media/${user}`]) {
      if (existsSync(base)) {
        for (const entry of readdirSync(base)) {
          drives.push(join(base, entry));
        }
      }
    }
  } else if (plat === 'windows') {
    try {
      const result = execSync(
        'wmic logicaldisk where drivetype=2 get deviceid 2>nul',
        { encoding: 'utf-8', timeout: 5000 },
      );
      for (const line of result.trim().split('\n').slice(1)) {
        const drv = line.trim();
        if (drv) drives.push(drv + sep);
      }
    } catch { }
  }

  return drives;
}

export function copyFromUSB(
  drivePath: string,
  destDir: string,
): { copied: number; skipped: number; error?: string } {
  let copied = 0;
  let skipped = 0;

  try {
    mkdirSync(destDir, { recursive: true });
    const files = walkFiles(drivePath);
    for (const file of files) {
      const name = basename(file);
      const dest = join(destDir, name);
      if (existsSync(dest)) {
        skipped++;
      } else {
        try {
          copyFileSync(file, dest);
          copied++;
        } catch {
          skipped++;
        }
      }
    }
  } catch (e) {
    return { copied, skipped, error: e instanceof Error ? e.message : String(e) };
  }

  return { copied, skipped };
}

export function scanUSBDrive(
  drivePath: string,
): Promise<{ isos: number; tools: number; drivers: number; total: number }> {
  return new Promise((resolve) => {
    try {
      const files = walkFiles(drivePath);
      const counts = countByExt(files);
      resolve({ ...counts, total: files.length });
    } catch {
      resolve({ isos: 0, tools: 0, drivers: 0, total: 0 });
    }
  });
}
