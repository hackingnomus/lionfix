import { join } from 'node:path';
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execInWSL, execInWSLAsync, detectWSLPackageManager, getMissingCriticalTools, clearToolCache, executeWSL, executeWSLSafe } from './wsl.js';

const wslPathCache = new Map<string, string>();

export interface WSLInventoryResult {
  success: boolean;
  output: string;
  command: string;
}

export interface FileStateSummary {
  verified: number;
  pending: number;
  corrupted: number;
  unclassified: number;
  backed_up: boolean;
  backup_age_days: number;
  trash: number;
  total: number;
  by_category: Record<string, number>;
}

function tryWSLPathConversion(distro: string, winPath: string): string | null {
  const cacheKey = `${distro}:${winPath}`;
  if (wslPathCache.has(cacheKey)) return wslPathCache.get(cacheKey)!;
  try {
    const result = executeWSL(distro, `wslpath "${winPath}" 2>/dev/null`, 10000);
    const converted = result.stdout.trim();
    if (converted) {
      wslPathCache.set(cacheKey, converted);
      return converted;
    }
  } catch {}
  return null;
}

export function getWSLInventoryPath(inventarioRaiz: string): string {
  if (!inventarioRaiz) return '/mnt/c';
  const converted = inventarioRaiz
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):/, (_, letter) => `/mnt/${letter.toLowerCase()}`);
  return converted;
}

export function getWSLInventoryPathWithWSL(distro: string, inventarioRaiz: string): string {
  if (!inventarioRaiz) return '/mnt/c';
  const wslp = tryWSLPathConversion(distro, inventarioRaiz);
  if (wslp) return wslp;
  return getWSLInventoryPath(inventarioRaiz);
}

function checkPrerequisites(distro: string, wslPath: string): string[] {
  const missing = getMissingCriticalTools(distro, wslPath);
  if (missing.length > 0) {
    const parts: string[] = [];
    for (const item of missing) {
      if (item.startsWith('inventario_path:')) {
        const path = item.replace('inventario_path:', '');
        parts.push(`El directorio de inventario no existe en WSL: ${path}`);
        parts.push(`  Usa [I] "Instalar herramientas" para crearlo automaticamente`);
      } else {
        parts.push(`Herramienta no encontrada: ${item}`);
      }
    }
  }
  return missing;
}

function missingToolsMessage(missing: string[], distro: string): WSLInventoryResult {
  const lines = missing.map(m => {
    if (m.startsWith('inventario_path:')) {
      return `  El directorio no existe en WSL: ${m.replace('inventario_path:', '')}`;
    }
    return `  Falta: ${m}`;
  });
  return {
    success: false,
    output: `Prerrequisitos no cumplidos para ${distro}:\n${lines.join('\n')}\n\nUsa [I] "Instalar herramientas" para instalar todo automaticamente.`,
    command: 'prerequisites',
  };
}

// ─── FILE STATES ──────────────────────────────────────────

export function wslFileStates(distro: string, inventarioRaiz: string): WSLInventoryResult {
  const wslPath = getWSLInventoryPath(inventarioRaiz);
  const missing = checkPrerequisites(distro, wslPath);
  if (missing.length > 0) return missingToolsMessage(missing, distro);

  const lines: string[] = [];
  try {
    const total = execInWSL(distro, `cd "${wslPath}" && find . -type f -not -path './backups/*' -not -path './.papelera/*' -not -name '.*' | wc -l`).trim();
    lines.push(`TOTAL ARCHIVOS: ${total}`);

    const hashDb = execInWSL(distro, `cd "${wslPath}" && cat .hashes.sha256 2>/dev/null | wc -l`).trim();
    const sinHash = parseInt(total) - parseInt(hashDb || '0');
    lines.push(`  Con hash SHA-256: ${hashDb}`);
    lines.push(`  Sin verificar:    ${Math.max(0, sinHash)}`);

    const vacios = execInWSL(distro, `cd "${wslPath}" && find . -type f -size 0 -not -path './backups/*' -not -path './.papelera/*' 2>/dev/null | wc -l`).trim();
    if (parseInt(vacios) > 0) lines.push(`  Archivos vacios:   ${vacios}`);

    const pendientes = execInWSL(distro, `cd "${wslPath}" && ls -1 por_clasificar/ 2>/dev/null | grep -v '^\\.' | wc -l`).trim();
    lines.push(`  Sin clasificar:   ${pendientes}`);
    if (parseInt(pendientes) > 0) {
      const names = execInWSL(distro, `cd "${wslPath}" && ls -1 por_clasificar/ 2>/dev/null | grep -v '^\\.' | head -5`).trim();
      if (names) lines.push(`     Ultimos: ${names.split('\n').join(', ')}`);
    }

    const papelera = execInWSL(distro, `cd "${wslPath}" && find .papelera -type f 2>/dev/null | wc -l`).trim();
    if (parseInt(papelera) > 0) lines.push(`  En papelera:       ${papelera}`);

    const ultimoBackup = execInWSL(distro, `cd "${wslPath}" && cat .ultimo_backup 2>/dev/null | grep -o '"[^"]*"' | tr -d '"'`).trim();
    lines.push(`  Ultimo backup:    ${ultimoBackup || 'Nunca'}`);

    return { success: true, output: lines.join('\n'), command: 'file_states' };
  } catch (e) {
    return { success: false, output: `Error en ${distro}: ${e instanceof Error ? e.message : String(e)}`, command: 'file_states' };
  }
}

// ─── READY ISOs ───────────────────────────────────────────

export function wslReadyISOs(distro: string, inventarioRaiz: string): WSLInventoryResult {
  const wslPath = getWSLInventoryPath(inventarioRaiz);
  const missing = checkPrerequisites(distro, wslPath);
  if (missing.length > 0) return missingToolsMessage(missing, distro);

  try {
    const partes: string[] = ['ISOS LISTOS PARA EL TECNICO:\n'];

    const categorias = [
      { dir: 'ISOs/Herramientas', nombre: 'HERRAMIENTAS' },
      { dir: 'ISOs/Windows', nombre: 'WINDOWS' },
      { dir: 'ISOs/Linux', nombre: 'LINUX' },
    ];

    for (const cat of categorias) {
      const count = execInWSL(distro, `cd "${wslPath}" && find "${cat.dir}" -type f \\( -iname '*.iso' -o -iname '*.img' \\) 2>/dev/null | wc -l`).trim();
      if (parseInt(count) > 0) {
        partes.push(`${cat.nombre}: ${count} archivos`);
        const names = execInWSL(distro, `cd "${wslPath}" && find "${cat.dir}" -type f \\( -iname '*.iso' -o -iname '*.img' \\) -exec basename {} \\; 2>/dev/null | sort`).trim();
        for (const n of names.split('\n').filter(Boolean)) {
          partes.push(`    ${n}`);
        }
        const tamano = execInWSL(distro, `cd "${wslPath}" && du -sh "${cat.dir}" 2>/dev/null | cut -f1`).trim();
        if (tamano) partes.push(`    Total: ${tamano}`);
      }
    }

    const otrosCount = execInWSL(distro, `cd "${wslPath}" && find ISOs/Otros -type f \\( -iname '*.iso' -o -iname '*.img' \\) 2>/dev/null | wc -l`).trim();
    if (parseInt(otrosCount) > 0) partes.push(`OTROS: ${otrosCount}`);

    return { success: true, output: partes.join('\n'), command: 'ready_isos' };
  } catch (e) {
    return { success: false, output: `Error en ${distro}: ${e instanceof Error ? e.message : String(e)}`, command: 'ready_isos' };
  }
}

// ─── DIAGNOSTIC TOOLS ─────────────────────────────────────

export function wslDiagnosticTools(distro: string, inventarioRaiz: string): WSLInventoryResult {
  const wslPath = getWSLInventoryPath(inventarioRaiz);
  const missing = checkPrerequisites(distro, wslPath);
  if (missing.length > 0) return missingToolsMessage(missing, distro);

  try {
    const partes: string[] = ['HERRAMIENTAS DE DIAGNOSTICO PARA REPARACION:\n'];

    const subcategorias = [
      { dir: 'Herramientas/Diagnostico_Disco', nombre: 'Diagnostico de Disco' },
      { dir: 'Herramientas/Recuperacion_Datos', nombre: 'Recuperacion de Datos' },
      { dir: 'Herramientas/RAM', nombre: 'Memoria RAM' },
      { dir: 'Herramientas/Sistema', nombre: 'Sistema' },
      { dir: 'Herramientas/Otros', nombre: 'Otras Utilidades' },
    ];

    for (const sub of subcategorias) {
      const count = execInWSL(distro, `cd "${wslPath}" && ls -1 "${sub.dir}" 2>/dev/null | grep -v '^\\.' | wc -l`).trim();
      if (parseInt(count) > 0) {
        const names = execInWSL(distro, `cd "${wslPath}" && ls -1 "${sub.dir}" 2>/dev/null | grep -v '^\\.' | head -5`).trim();
        partes.push(`${sub.nombre}: ${count} herramienta(s)`);
        for (const n of names.split('\n').filter(Boolean)) {
          partes.push(`    ${n}`);
        }
        if (parseInt(count) > 5) partes.push(`    ... y ${parseInt(count) - 5} mas`);
      } else {
        partes.push(`${sub.nombre}: (vacio)`);
      }
    }

    return { success: true, output: partes.join('\n'), command: 'diagnostic_tools' };
  } catch (e) {
    return { success: false, output: `Error en ${distro}: ${e instanceof Error ? e.message : String(e)}`, command: 'diagnostic_tools' };
  }
}

// ─── DRIVERS BY DEVICE ────────────────────────────────────

export function wslDriversByDevice(distro: string, inventarioRaiz: string): WSLInventoryResult {
  const wslPath = getWSLInventoryPath(inventarioRaiz);
  const missing = checkPrerequisites(distro, wslPath);
  if (missing.length > 0) return missingToolsMessage(missing, distro);

  try {
    const partes: string[] = ['DRIVERS DISPONIBLES POR DISPOSITIVO:\n'];

    const familias = [
      { dir: 'Drivers/Red', nombre: 'RED' },
      { dir: 'Drivers/Video', nombre: 'VIDEO' },
      { dir: 'Drivers/Audio', nombre: 'AUDIO' },
      { dir: 'Drivers/Chipset', nombre: 'CHIPSET' },
      { dir: 'Drivers/Otros', nombre: 'OTROS' },
    ];

    for (const fam of familias) {
      const marcas = execInWSL(distro, `cd "${wslPath}" && ls -1d "${fam.dir}"/*/ 2>/dev/null | xargs -r basename -a 2>/dev/null`).trim();
      if (marcas) {
        partes.push(`${fam.nombre}:`);
        for (const marca of marcas.split('\n').filter(Boolean)) {
          const count = execInWSL(distro, `cd "${wslPath}" && ls -1 "${fam.dir}/${marca}" 2>/dev/null | grep -v '^\\.' | wc -l`).trim();
          const names = execInWSL(distro, `cd "${wslPath}" && ls -1 "${fam.dir}/${marca}" 2>/dev/null | grep -v '^\\.' | head -3`).trim();
          partes.push(`    ${marca.toUpperCase()} (${count} archivos)`);
          for (const n of names.split('\n').filter(Boolean)) {
            partes.push(`      ${n}`);
          }
        }
      } else {
        const count = execInWSL(distro, `cd "${wslPath}" && ls -1 "${fam.dir}" 2>/dev/null | grep -v '^\\.' | wc -l`).trim();
        if (parseInt(count) > 0) {
          partes.push(`${fam.nombre}: ${count} archivo(s)`);
        }
      }
    }

    return { success: true, output: partes.join('\n'), command: 'drivers_by_device' };
  } catch (e) {
    return { success: false, output: `Error en ${distro}: ${e instanceof Error ? e.message : String(e)}`, command: 'drivers_by_device' };
  }
}

// ─── INTEGRITY CHECK ──────────────────────────────────────

export function wslIntegrityCheck(distro: string, inventarioRaiz: string): WSLInventoryResult {
  const wslPath = getWSLInventoryPath(inventarioRaiz);
  const missing = checkPrerequisites(distro, wslPath);
  if (missing.length > 0) return missingToolsMessage(missing, distro);

  try {
    const partes: string[] = ['VERIFICACION DE INTEGRIDAD DEL INVENTARIO:\n'];

    const hashDb = execInWSL(distro, `cd "${wslPath}" && wc -l < .hashes.sha256 2>/dev/null || echo 0`).trim();
    if (parseInt(hashDb) === 0) {
      partes.push('Base de hashes vacia. Ejecuta "verify" para generar.');
      return { success: true, output: partes.join('\n'), command: 'integrity_check' };
    }

    partes.push(`Entradas en .hashes.sha256: ${hashDb}`);

    const ok = execInWSL(distro, `cd "${wslPath}" && awk '{if ($4 == "OK") count++} END {print count+0}' .hashes.sha256 2>/dev/null || echo 0`).trim();
    partes.push(`  Verificados OK:     ${ok}`);

    const corrupt = execInWSL(distro, `cd "${wslPath}" && awk '{if ($4 == "CORRUPTO") count++} END {print count+0}' .hashes.sha256 2>/dev/null || echo 0`).trim();
    if (parseInt(corrupt) > 0) partes.push(`  Corruptos:          ${corrupt} REVISAR`);

    const nuevo = execInWSL(distro, `cd "${wslPath}" && awk '{if ($4 == "NUEVO") count++} END {print count+0}' .hashes.sha256 2>/dev/null || echo 0`).trim();
    if (parseInt(nuevo) > 0) partes.push(`  Nuevos sin verify:  ${nuevo}`);

    const validos = execInWSL(distro, `cd "${wslPath}" && awk '{if ($2 ~ /^\\.\\// && $1 ~ /^[a-f0-9]{64}$/) count++} END {print count+0}' .hashes.sha256 2>/dev/null || echo 0`).trim();
    if (parseInt(validos) !== parseInt(hashDb)) {
      partes.push(`  Entradas invalidas: ${parseInt(hashDb) - parseInt(validos)}`);
    }

    return { success: true, output: partes.join('\n'), command: 'integrity_check' };
  } catch (e) {
    return { success: false, output: `Error en ${distro}: ${e instanceof Error ? e.message : String(e)}`, command: 'integrity_check' };
  }
}

// ─── CATEGORY STATES ──────────────────────────────────────

export function wslCategoryStates(distro: string, inventarioRaiz: string): WSLInventoryResult {
  const wslPath = getWSLInventoryPath(inventarioRaiz);
  const missing = checkPrerequisites(distro, wslPath);
  if (missing.length > 0) return missingToolsMessage(missing, distro);

  try {
    const categorias = [
      { dir: 'ISOs', nombre: 'ISOs' },
      { dir: 'Herramientas', nombre: 'Herramientas' },
      { dir: 'Drivers', nombre: 'Drivers' },
      { dir: 'Documentos', nombre: 'Documentos' },
      { dir: 'por_clasificar', nombre: 'Sin Clasificar' },
      { dir: 'Otros', nombre: 'Otros' },
    ];

    const partes: string[] = ['ESTADO POR CATEGORIA:\n'];
    let totalArchivos = 0;
    let totalSize = 0;

    partes.push('  Categoria              Archivos  Tamano     Estado');
    partes.push('  ----------------------------------------------------');

    for (const cat of categorias) {
      const count = execInWSL(distro, `cd "${wslPath}" && find "${cat.dir}" -type f -not -name '.*' 2>/dev/null | wc -l`).trim();
      const size = execInWSL(distro, `cd "${wslPath}" && du -sh "${cat.dir}" 2>/dev/null | cut -f1`).trim() || '0';
      const c = parseInt(count);
      totalArchivos += c;

      let estado = 'Listo';
      if (cat.dir === 'por_clasificar' && c > 0) estado = 'Pendiente';
      else if (c === 0) estado = 'Vacio';

      partes.push(`  ${cat.nombre.padEnd(22)} ${count.padStart(5)}  ${size.padStart(9)}  ${estado}`);
    }

    const totalSizeStr = execInWSL(distro, `cd "${wslPath}" && du -sh --exclude=backups --exclude=.papelera . 2>/dev/null | cut -f1`).trim();
    partes.push(`  ----------------------------------------------------`);
    partes.push(`  TOTAL                   ${String(totalArchivos).padStart(5)}  ${totalSizeStr.padStart(9)}`);

    return { success: true, output: partes.join('\n'), command: 'category_states' };
  } catch (e) {
    return { success: false, output: `Error en ${distro}: ${e instanceof Error ? e.message : String(e)}`, command: 'category_states' };
  }
}

// ─── TECH QUICK SUMMARY ───────────────────────────────────

export function wslTechQuickSummary(distro: string, inventarioRaiz: string): WSLInventoryResult {
  const wslPath = getWSLInventoryPath(inventarioRaiz);
  const missing = checkPrerequisites(distro, wslPath);
  if (missing.length > 0) return missingToolsMessage(missing, distro);

  try {
    const partes: string[] = [
      '========================================',
      '   RESUMEN RAPIDO  INVENTARIO TALLER',
      '========================================\n',
    ];

    const total = execInWSL(distro, `cd "${wslPath}" && find . -type f -not -path './backups/*' -not -path './.papelera/*' -not -name '.*' | wc -l`).trim();
    partes.push(`Archivos en inventario: ${total}`);

    const pendientes = execInWSL(distro, `cd "${wslPath}" && ls -1 por_clasificar/ 2>/dev/null | grep -v '^\\.' | wc -l`).trim();
    if (parseInt(pendientes) > 0) partes.push(`Archivos sin clasificar: ${pendientes}`);

    const isos = execInWSL(distro, `cd "${wslPath}" && find ISOs -type f \\( -iname '*.iso' -o -iname '*.img' \\) 2>/dev/null | wc -l`).trim();
    partes.push(`ISOs para boot/reparacion: ${isos}`);

    const herramientas = execInWSL(distro, `cd "${wslPath}" && find Herramientas -type f -not -name '.*' 2>/dev/null | wc -l`).trim();
    partes.push(`Herramientas diagnostico: ${herramientas}`);

    const drivers = execInWSL(distro, `cd "${wslPath}" && find Drivers -type f -not -name '.*' 2>/dev/null | wc -l`).trim();
    partes.push(`Drivers disponibles: ${drivers}`);

    const corrupt = execInWSL(distro, `cd "${wslPath}" && awk '{if ($4 == "CORRUPTO") count++} END {print count+0}' .hashes.sha256 2>/dev/null || echo 0`).trim();
    if (parseInt(corrupt) > 0) partes.push(`Archivos CORRUPTOS: ${corrupt}  REVISAR URGENTE`);

    const papelera = execInWSL(distro, `cd "${wslPath}" && find .papelera -type f 2>/dev/null | wc -l`).trim();
    if (parseInt(papelera) > 0) partes.push(`En papelera: ${papelera} (usar "trash empty" para liberar)`);

    const disk = execInWSL(distro, `df -BG "${wslPath}" | tail -1 | awk '{print $4}'`).trim();
    partes.push(`Espacio libre: ${disk}`);

    const lastBk = execInWSL(distro, `cd "${wslPath}" && cat .ultimo_backup 2>/dev/null | grep -o '"[^"]*"' | tr -d '"'`).trim() || 'Nunca';
    partes.push(`Ultimo backup: ${lastBk}`);

    partes.push('\n========================================');

    return { success: true, output: partes.join('\n'), command: 'tech_quick_summary' };
  } catch (e) {
    return { success: false, output: `Error en ${distro}: ${e instanceof Error ? e.message : String(e)}`, command: 'tech_quick_summary' };
  }
}

// ─── CLEANUP TEMP ─────────────────────────────────────────

export function wslCleanupTemp(distro: string, inventarioRaiz: string): WSLInventoryResult {
  const wslPath = getWSLInventoryPath(inventarioRaiz);
  const missing = checkPrerequisites(distro, wslPath);
  if (missing.length > 0) return missingToolsMessage(missing, distro);

  try {
    const output = execInWSL(distro, `cd "${wslPath}" && find por_clasificar -type f \\( -iname '*.tmp' -o -iname '*.part' -o -iname '*.crdownload' -o -iname '*.download' \\) -delete -print 2>/dev/null | wc -l`);
    return { success: true, output: `Archivos temporales eliminados: ${output.trim()}`, command: 'cleanup_temp' };
  } catch (e) {
    return { success: false, output: `Error en ${distro}: ${e instanceof Error ? e.message : String(e)}`, command: 'cleanup_temp' };
  }
}

// ─── FIND DUPLICATES ──────────────────────────────────────

export function wslFindDuplicates(distro: string, inventarioRaiz: string): WSLInventoryResult {
  const wslPath = getWSLInventoryPath(inventarioRaiz);
  const missing = checkPrerequisites(distro, wslPath);
  if (missing.length > 0) return missingToolsMessage(missing, distro);

  try {
    const output = execInWSL(distro, `cd "${wslPath}" && find . -type f -not -path './backups/*' -not -path './.papelera/*' -not -name '.*' -exec sha256sum {} + | sort | uniq -w64 -dD 2>/dev/null | head -20`);
    const lines = output.trim().split('\n').filter(Boolean);
    if (lines.length === 0) {
      return { success: true, output: 'No se encontraron archivos duplicados.', command: 'find_duplicates' };
    }
    return { success: true, output: `Duplicados encontrados (${lines.length}):\n${lines.join('\n')}`, command: 'find_duplicates' };
  } catch (e) {
    return { success: false, output: `Error en ${distro}: ${e instanceof Error ? e.message : String(e)}`, command: 'find_duplicates' };
  }
}

// ─── INVENTORY TREE ───────────────────────────────────────

export function wslInventoryTree(distro: string, inventarioRaiz: string): WSLInventoryResult {
  const wslPath = getWSLInventoryPath(inventarioRaiz);
  const missing = checkPrerequisites(distro, wslPath);
  if (missing.length > 0) return missingToolsMessage(missing, distro);

  try {
    const output = execInWSL(distro, `cd "${wslPath}" && (tree -L 2 --dirsfirst -I 'backups|.papelera|.hashes*|.usuarios*|.machine_id|.ultimo_backup|.login_attempts|node_modules|.git' 2>/dev/null || find . -maxdepth 2 -not -path './backups/*' -not -path './.papelera/*' -not -name '.*' | sort | head -60)`);
    return { success: true, output: output.trim(), command: 'tree' };
  } catch (e) {
    return { success: false, output: `Error en ${distro}: ${e instanceof Error ? e.message : String(e)}`, command: 'tree' };
  }
}

// ─── INSTALL TOOLS ────────────────────────────────────────

export function wslInstallInventoryTools(distro: string, pm: string | null | undefined = undefined): WSLInventoryResult {
  try {
    if (pm === undefined) pm = detectWSLPackageManager(distro);
    if (!pm) return { success: false, output: 'No se detecto gestor de paquetes.', command: 'install_tools' };

    const lines: string[] = [];
    lines.push(`Instalando herramientas necesarias en ${distro} (${pm})...\n`);

    let preCmd = '';
    let installCmd = '';
    const tools = ['tree', 'findutils', 'coreutils', 'grep', 'gawk'];

    if (pm === 'apt') {
      preCmd = 'DEBIAN_FRONTEND=noninteractive sudo -n apt update -qq 2>/dev/null || true';
      installCmd = `DEBIAN_FRONTEND=noninteractive sudo -n apt install -y ${tools.join(' ')} 2>&1 | tail -10`;
    } else if (pm === 'dnf' || pm === 'yum') {
      preCmd = `${pm} check-update 2>/dev/null || true`;
      installCmd = `${pm} install -y ${tools.join(' ')} 2>&1 | tail -10`;
    } else if (pm === 'pacman') {
      installCmd = `pacman -S --noconfirm ${tools.join(' ')} 2>&1 | tail -10`;
    } else if (pm === 'zypper') {
      installCmd = `zypper install -y ${tools.join(' ')} 2>&1 | tail -10`;
    } else if (pm === 'apk') {
      installCmd = `apk add ${tools.join(' ')} 2>&1 | tail -10`;
    } else {
      return { success: false, output: `Gestor ${pm} no soportado para instalacion automatica`, command: 'install_tools' };
    }

    if (preCmd) {
      try {
        executeWSL(distro, preCmd, 120000);
        lines.push('Repositorios actualizados');
      } catch (e) {
        lines.push(`No se pudo actualizar repositorios (continuando): ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const result = executeWSL(distro, installCmd, 180000);
    const gotLines = result.stdout.split('\n').filter(Boolean);
    lines.push(...gotLines.slice(-5));

    lines.push(`\nInstalacion completada en ${distro}`);
    lines.push('   Puedes verificar con [2] File States, [D] Duplicados, [T] Arbol');

    clearToolCache();

    return { success: true, output: lines.join('\n'), command: 'install_tools' };
  } catch (e) {
    return { success: false, output: `Error instalando en ${distro}: ${e instanceof Error ? e.message : String(e)}`, command: 'install_tools' };
  }
}

// ─── SYMLINK ──────────────────────────────────────────────

export function wslSymlinkInventory(distro: string, inventarioRaiz: string, linkPath?: string): WSLInventoryResult {
  const wslPath = getWSLInventoryPath(inventarioRaiz);
  try {
    const homeDir = execInWSL(distro, 'echo $HOME').trim();
    const link = linkPath || `${homeDir}/inventario`;
    execInWSL(distro, `ln -sf "${wslPath}" "${link}" 2>/dev/null; echo "Link creado: ${link} -> ${wslPath}"`);
    return { success: true, output: `Enlace creado en WSL:\n  ${link} \u2192 ${wslPath}\n  Accede con: cd ~/inventario`, command: 'symlink' };
  } catch (e) {
    return { success: false, output: `Error en ${distro}: ${e instanceof Error ? e.message : String(e)}`, command: 'symlink' };
  }
}

// ─── GENERIC COMMAND ──────────────────────────────────────

export function wslInventoryCommand(distro: string, inventarioRaiz: string, command: string): string {
  const wslPath = getWSLInventoryPath(inventarioRaiz);
  const fullCmd = `cd "${wslPath}" && ${command}`;
  return execInWSL(distro, fullCmd);
}

export async function wslInventoryCommandAsync(distro: string, inventarioRaiz: string, command: string): Promise<string> {
  const wslPath = getWSLInventoryPath(inventarioRaiz);
  const fullCmd = `cd "${wslPath}" && ${command}`;
  return execInWSLAsync(distro, fullCmd);
}
