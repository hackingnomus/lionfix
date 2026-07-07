import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface DiagnosticResult {
  check: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
}

export function runDiagnostics(inventarioRaiz: string): DiagnosticResult[] {
  const results: DiagnosticResult[] = [];

  
  const cfgPath = join(inventarioRaiz, '..', 'config.cfg');
  if (existsSync(cfgPath)) {
    results.push({ check: 'config.cfg', status: 'ok', message: 'Archivo de configuración existe' });
  } else {
    results.push({ check: 'config.cfg', status: 'warn', message: 'No encontrado, usando valores por defecto' });
  }

  
  if (existsSync(inventarioRaiz)) {
    results.push({ check: 'INVENTARIO_RAIZ', status: 'ok', message: `Directorio raíz: ${inventarioRaiz}` });
  } else {
    results.push({ check: 'INVENTARIO_RAIZ', status: 'error', message: 'Directorio raíz no existe' });
    return results;
  }

  
  const criticalDirs = ['por_clasificar', 'backups', 'usuarios'];
  for (const dir of criticalDirs) {
    const full = join(inventarioRaiz, dir);
    if (existsSync(full)) {
      results.push({ check: `dir/${dir}`, status: 'ok', message: `Directorio ${dir}/ existe` });
    } else {
      results.push({ check: `dir/${dir}`, status: 'warn', message: `Directorio ${dir}/ no encontrado` });
    }
  }

  
  const criticalFiles = ['.hashes.sha256', 'actividades.csv', '.usuarios.db'];
  for (const file of criticalFiles) {
    const full = join(inventarioRaiz, file);
    if (existsSync(full)) {
      results.push({ check: `file/${file}`, status: 'ok', message: `${file} existe` });
    }
  }

  
  try {
    if (process.platform === 'win32') {
      const root = inventarioRaiz.split(':')[0] || 'C';
      let freeGB = -1;
      try {
        const out = execSync(
          `powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk -Filter 'DeviceID=\\"${root}:\\"' | Select-Object @{N='FreeGB';E={$_.FreeSpace/1GB}} | ConvertTo-Csv -NoTypeInformation"`,
          { encoding: 'utf-8', timeout: 5000 },
        );
        const lines = out.trim().split('\n');
        if (lines.length > 1) {
          freeGB = parseFloat(lines[1]?.replace(/"/g, ''));
        }
      } catch { }
      if (freeGB < 0) {
        try {
          const out = execSync(`wmic logicaldisk where deviceid="${root}:" get freespace /format:csv 2>nul`, { encoding: 'utf-8', timeout: 5000 });
          const lines = out.trim().split('\n');
          if (lines.length > 1) {
            freeGB = parseInt(lines[1].split(',')[1], 10) / 1073741824;
          }
        } catch { }
      }
      if (freeGB >= 0) {
        if (freeGB < 1) {
          results.push({ check: 'disco', status: 'error', message: `Espacio libre crítico: ${freeGB.toFixed(1)} GB` });
        } else {
          results.push({ check: 'disco', status: 'ok', message: `Espacio libre: ${freeGB.toFixed(1)} GB` });
        }
      }
    } else {
      const df = execSync(`df -BG "${inventarioRaiz}" 2>/dev/null | tail -1`, { encoding: 'utf-8', timeout: 5000 });
      const parts = df.trim().split(/\s+/);
      if (parts.length >= 4) {
        const freeGB = parseInt(parts[3]?.replace('G', '') || '0', 10);
        if (freeGB < 1) {
          results.push({ check: 'disco', status: 'error', message: `Espacio libre crítico: ${freeGB} GB` });
        } else {
          results.push({ check: 'disco', status: 'ok', message: `Espacio libre: ${freeGB} GB` });
        }
      }
    }
  } catch {
    results.push({ check: 'disco', status: 'warn', message: 'No se pudo verificar espacio en disco' });
  }

  // 6. Required modules check
  const modules = ['exceljs', 'pdfkit', 'archiver'];
  for (const mod of modules) {
    try {
      const pkgPath = join(__dirname, '..', '..', 'node_modules', mod, 'package.json');
      if (existsSync(pkgPath)) {
        results.push({ check: `mod/${mod}`, status: 'ok', message: `Módulo ${mod} disponible` });
      } else {
        results.push({ check: `mod/${mod}`, status: 'error', message: `Módulo ${mod} no instalado` });
      }
    } catch {
      results.push({ check: `mod/${mod}`, status: 'error', message: `Módulo ${mod} no instalado` });
    }
  }

  // 7. Hash DB integrity check
  const hashDbPath = join(inventarioRaiz, '.hashes.sha256');
  if (existsSync(hashDbPath)) {
    try {
      const raw = readFileSync(hashDbPath, 'utf-8');
      const lines = raw.trim().split('\n').filter(Boolean);
      let valid = 0;
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 4 && /^[a-f0-9]{64}$/i.test(parts[0])) valid++;
      }
      results.push({ check: 'hashdb', status: 'ok', message: `${valid}/${lines.length} entradas válidas en hashes.sha256` });
    } catch {
      results.push({ check: 'hashdb', status: 'error', message: 'Error leyendo hashes.sha256' });
    }
  } else {
    results.push({ check: 'hashdb', status: 'warn', message: 'hashes.sha256 no existe (ejecuta verify primero)' });
  }

  return results;
}
