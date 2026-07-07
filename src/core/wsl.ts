import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { executeWSL as _executeWSL, executeWSLSafe as _executeWSLSafe, WSLExecutionError, type WSLExecResult, getWSLLog } from './wsl-executor.js';

export const executeWSL = _executeWSL;
export const executeWSLSafe = _executeWSLSafe;

const pmCache = new Map<string, string | null>();
const toolsCache = new Map<string, Map<string, boolean>>();

export function clearToolCache(): void { toolsCache.clear(); pmCache.clear(); }

export function getPMCache(): ReadonlyMap<string, string | null> { return pmCache; }
export function getToolsCache(): ReadonlyMap<string, Map<string, boolean>> { return toolsCache; }

export interface WSLDistro {
  name: string;
  isDefault: boolean;
  state: 'Running' | 'Stopped' | null;
  version: number;
}

export interface WSLPackage {
  name: string;
  version: string;
  description: string;
  installed: boolean;
}

export function decodeWSLBuffer(buf: Buffer): string {
  if (!buf || buf.length === 0) return '';
  const isUTF16LE = buf.indexOf(0) !== -1 || (buf[0] === 0xff && buf[1] === 0xfe);
  const raw = isUTF16LE ? buf.toString('utf-16le') : buf.toString('utf-8');
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function getWSLDistros(): WSLDistro[] {
  let raw: string;
  try {
    const buf = execSync('wsl.exe -l -v', { timeout: 15000, encoding: 'buffer' });
    raw = decodeWSLBuffer(buf);
  } catch {
    return [];
  }

  const lines = raw.split('\n').filter(l => l.trim());
  const result: WSLDistro[] = [];

  for (const line of lines.slice(1)) {
    const parts = line.trim().split(/\s{2,}|\t+/);
    if (parts.length < 2) continue;
    const rawName = parts[0].trim();
    const name = rawName.replace(/^\*\s*/, '').replace(/\s*\(Default\)\s*/i, '').trim();
    if (!name) continue;
    const isDefault = rawName.startsWith('*') || rawName.includes('(Default)');
    const stateRaw = (parts[1]?.trim() || '') as 'Running' | 'Stopped' | '';
    const state: 'Running' | 'Stopped' | null = (stateRaw === 'Running' || stateRaw === 'Stopped') ? stateRaw : null;
    const version = parseInt(parts[2]?.trim() || '2', 10);
    result.push({ name, isDefault, state, version: isNaN(version) ? 2 : version });
  }

  return result;
}

export function getWSLDistroLocation(distro: string): string {
  try {
    const buf = execSync(`wsl.exe --manage "${distro}" --get-path 2>nul`, { timeout: 10000, encoding: 'buffer' });
    const path = decodeWSLBuffer(buf).trim();
    if (path) return path;
  } catch {}

  try {
    const out = execSync(
      `powershell -Command "Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss\\' | Where-Object { (Get-ItemProperty \$_.PSPath).DistributionName -eq '${distro}' } | Get-ItemProperty | Select-Object -ExpandProperty BasePath"`,
      { timeout: 10000, encoding: 'utf-8' },
    );
    const path = out.trim();
    if (path) return path.replace(/\\$/, '');
  } catch {}

  return '';
}

export function getWSLDistrosSimple(): Pick<WSLDistro, 'name' | 'isDefault'>[] {
  try {
    const buf = execSync('wsl.exe -l -q', { timeout: 10000, encoding: 'buffer' });
    const output = decodeWSLBuffer(buf);
    return output.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(name => {
        const isDefault = name.endsWith(' (Default)');
        return {
          name: isDefault ? name.replace(' (Default)', '').trim() : name,
          isDefault,
        };
      });
  } catch {
    return [];
  }
}

export function isWSLAvailable(): boolean {
  try {
    execSync('wsl.exe --version', { timeout: 5000, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function startWSLDistro(distro: string): { success: boolean; error?: string } {
  const methods = [
    { cmd: `bash -c "echo WSL_iniciado_ok"`, label: 'bash' },
    { cmd: `echo WSL_iniciado_ok`, label: 'echo' },
    { cmd: `true`, label: 'true' },
  ];

  for (const method of methods) {
    try {
      executeWSL(distro, method.cmd, 60000);
      return { success: true };
    } catch {}
  }

  try {
    execSync(`wsl.exe --terminate "${distro}"`, { timeout: 15000, stdio: 'ignore' });
    try {
      executeWSL(distro, 'echo reiniciado', 90000);
      return { success: true };
    } catch (e) {
      const msg = e instanceof WSLExecutionError
        ? `stderr: ${e.result.stderr.slice(0, 300)} | exit: ${e.result.exitCode}`
        : String(e);
      return { success: false, error: msg };
    }
  } catch (e) {
    return { success: false, error: `No se pudo reiniciar: ${String(e)}` };
  }
}

export interface WSLVerificationResult {
  success: boolean;
  checks: { command: string; ok: boolean; detail: string }[];
  error?: string;
}

export function verifyWSLDistro(distro: string): WSLVerificationResult {
  const checks: { command: string; ok: boolean; detail: string }[] = [];
  const preFlight = [
    { cmd: 'echo OK', label: 'echo basico' },
    { cmd: 'pwd', label: 'directorio actual' },
    { cmd: 'whoami', label: 'usuario' },
    { cmd: 'uname -a', label: 'kernel' },
    { cmd: 'ls /', label: 'raiz del sistema' },
  ];

  for (const check of preFlight) {
    try {
      const result = executeWSL(distro, check.cmd, 30000);
      checks.push({
        command: check.cmd,
        ok: true,
        detail: result.stdout.slice(0, 200).trim(),
      });
    } catch (err) {
      let detail = '';
      if (err instanceof WSLExecutionError) {
        const r = err.result;
        detail = [
          `exitCode=${r.exitCode}`,
          r.stderr ? `stderr="${r.stderr.slice(0, 200)}"` : '',
          r.stdout ? `stdout="${r.stdout.slice(0, 200)}"` : '',
          r.error ? `error="${r.error}"` : '',
        ].filter(Boolean).join(' | ');
      } else {
        detail = String(err);
      }
      checks.push({ command: check.cmd, ok: false, detail });
      return { success: false, checks, error: `Fallo en verificación: ${check.label} — ${detail}` };
    }
  }

  return { success: true, checks };
}

export function execInWSL(distro: string, command: string): string {
  const result = executeWSL(distro, command, 60000);
  return result.stdout;
}

export function execInWSLAsync(distro: string, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['-d', distro, '--', 'bash', '-c', command];
    const proc = spawn('wsl.exe', args, {
      timeout: 120000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('error', (err) => reject(new Error(`Error en WSL ${distro}: ${err.message}`)));
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`Error en WSL ${distro}: exit ${code}${proc.killed ? ' (timeout)' : ''}: ${stderr.trim()}`));
    });
  });
}

export interface WSLDistroInfo {
  distro: string;
  os?: string;
  kernel?: string;
  packages?: WSLPackage[];
  diskFree?: string;
  uptime?: string;
}

export function getWSLDistroInfo(distro: string): WSLDistroInfo {
  const info: WSLDistroInfo = { distro };

  try { info.os = execInWSL(distro, `cat /etc/os-release 2>/dev/null | grep ^PRETTY_NAME | cut -d= -f2 | tr -d '"'`); }
  catch { info.os = 'desconocido'; }

  try { info.kernel = execInWSL(distro, 'uname -r'); } catch {}

  try { info.diskFree = execInWSL(distro, `df -BG / | tail -1 | awk '{print $4}'`); } catch {}

  try { info.uptime = execInWSL(distro, 'uptime -p'); } catch {}

  return info;
}

export function detectWSLPackageManager(distro: string, force?: boolean): string | null {
  if (!force && pmCache.has(distro)) return pmCache.get(distro) ?? null;
  const commands = [
    { check: `command -v apt 2>/dev/null && echo apt`, pm: 'apt' },
    { check: `command -v apt-get 2>/dev/null && echo apt`, pm: 'apt' },
    { check: `command -v dpkg 2>/dev/null && echo apt`, pm: 'apt' },
    { check: `command -v dnf 2>/dev/null && echo dnf`, pm: 'dnf' },
    { check: `command -v yum 2>/dev/null && echo yum`, pm: 'yum' },
    { check: `command -v pacman 2>/dev/null && echo pacman`, pm: 'pacman' },
    { check: `command -v zypper 2>/dev/null && echo zypper`, pm: 'zypper' },
    { check: `command -v apk 2>/dev/null && echo apk`, pm: 'apk' },
    { check: `test -f /usr/bin/apt && echo apt`, pm: 'apt' },
  ];

  for (const entry of commands) {
    try {
      const result = executeWSL(distro, entry.check, 15000);
      if (result.stdout.trim()) {
        pmCache.set(distro, entry.pm);
        return entry.pm;
      }
    } catch {}
  }

  pmCache.set(distro, null);
  return null;
}

export function listWSLPackages(distro: string, pm: string): WSLPackage[] {
  const packages: WSLPackage[] = [];

  try {
    let output = '';
    if (pm === 'apt') {
      output = execInWSL(distro, `apt list --installed 2>/dev/null | tail -n +2`);
      for (const line of output.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const nameVer = parts[0].split('/');
          packages.push({
            name: nameVer[0] || parts[0],
            version: nameVer[1] || parts[1],
            description: '',
            installed: true,
          });
        }
      }
    } else if (pm === 'dnf' || pm === 'yum') {
      output = execInWSL(distro, `${pm} list installed 2>/dev/null | tail -n +2`);
      for (const line of output.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          packages.push({
            name: parts[0].split('.')[0],
            version: parts[1],
            description: parts.slice(2).join(' '),
            installed: true,
          });
        }
      }
    } else if (pm === 'pacman') {
      output = execInWSL(distro, 'pacman -Q 2>/dev/null');
      for (const line of output.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          packages.push({ name: parts[0], version: parts[1], description: '', installed: true });
        }
      }
    }
  } catch {}

  return packages;
}

export function installWSLPackage(distro: string, pm: string, packageName: string): string {
  let cmd = '';
  if (pm === 'apt') cmd = `DEBIAN_FRONTEND=noninteractive sudo -n apt install -y "${packageName}"`;
  else if (pm === 'dnf' || pm === 'yum') cmd = `${pm} install -y "${packageName}"`;
  else if (pm === 'pacman') cmd = `pacman -S --noconfirm "${packageName}"`;
  else if (pm === 'zypper') cmd = `zypper install -y "${packageName}"`;
  else if (pm === 'apk') cmd = `apk add "${packageName}"`;
  else throw new Error(`Package manager ${pm} no soportado`);

  return execInWSL(distro, cmd);
}

export function updateWSLPackages(distro: string, pm: string): string {
  let cmd = '';
  if (pm === 'apt') cmd = 'DEBIAN_FRONTEND=noninteractive sudo -n apt update && DEBIAN_FRONTEND=noninteractive sudo -n apt upgrade -y';
  else if (pm === 'dnf' || pm === 'yum') cmd = `${pm} update -y`;
  else if (pm === 'pacman') cmd = 'pacman -Syu --noconfirm';
  else if (pm === 'zypper') cmd = 'zypper update -y';
  else if (pm === 'apk') cmd = 'apk update && apk upgrade';
  else throw new Error(`Package manager ${pm} no soportado`);

  return execInWSL(distro, cmd);
}

export function checkWSLNetwork(distro: string): { ping: boolean; dns: boolean; internet: boolean } {
  const result = { ping: false, dns: false, internet: false };
  try {
    execInWSL(distro, 'ping -c 1 -W 2 8.8.8.8 2>/dev/null');
    result.ping = true;
  } catch {}
  try {
    execInWSL(distro, 'nslookup google.com 2>/dev/null || host google.com 2>/dev/null || dig google.com 2>/dev/null');
    result.dns = true;
  } catch {}
  try {
    execInWSL(distro, 'curl -s --max-time 5 https://google.com >/dev/null 2>&1 || wget -q --timeout=5 -O /dev/null https://google.com 2>/dev/null');
    result.internet = true;
  } catch {}
  return result;
}

const INVENTORY_TOOLS = [
  'find', 'sha256sum', 'wc', 'sort', 'uniq', 'head', 'tail',
  'grep', 'awk', 'cut', 'tr', 'du', 'df', 'xargs', 'basename', 'which',
] as const;

export type WSLToolName = typeof INVENTORY_TOOLS[number];

export function checkWSLTools(distro: string, tools?: WSLToolName[]): Map<string, boolean> {
  const checkTools = tools || [...INVENTORY_TOOLS];
  const key = `${distro}:${checkTools.join(',')}`;
  if (toolsCache.has(key)) return toolsCache.get(key)!;

  const result = new Map<string, boolean>();
  for (const tool of checkTools) {
    try {
      executeWSL(distro, `command -v ${tool} 2>/dev/null`, 15000);
      result.set(tool, true);
    } catch {
      result.set(tool, false);
    }
  }
  toolsCache.set(key, result);
  return result;
}

export function checkWSLToolsAll(distro: string): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [tool, available] of checkWSLTools(distro)) {
    result[tool] = available;
  }
  return result;
}

export function checkWSLPathExists(distro: string, wslPath: string): boolean {
  try {
    executeWSL(distro, `test -d "${wslPath}"`, 15000);
    return true;
  } catch {
    return false;
  }
}

function wslPathToWindows(wslPath: string): string {
  const m = wslPath.match(/^\/mnt\/([a-z])\/(.*)$/);
  if (m) {
    return `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, '\\')}`;
  }
  return '';
}

function convertWindowsToWSLPath(winPath: string): string {
  return winPath
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):/, (_, letter) => `/mnt/${letter.toLowerCase()}`);
}

export function ensureWSLPath(distro: string, wslPath: string): boolean {
  
  try {
    executeWSL(distro, `mkdir -p "${wslPath}"`, 30000);
    if (checkWSLPathExists(distro, wslPath)) return true;
  } catch {}

  
  try {
    executeWSL(distro, `sudo mkdir -p "${wslPath}" 2>/dev/null; test -d "${wslPath}"`, 30000);
    if (checkWSLPathExists(distro, wslPath)) return true;
  } catch {}

  
  const winPath = wslPathToWindows(wslPath);
  if (winPath) {
    try {
      mkdirSync(winPath, { recursive: true });
      if (checkWSLPathExists(distro, wslPath)) return true;
    } catch {}
  }

  
  if (winPath) {
    try {
      execSync(`if not exist "${winPath}" mkdir "${winPath}"`, { shell: 'cmd.exe', timeout: 10000 });
      return checkWSLPathExists(distro, wslPath);
    } catch {}
  }

  return false;
}

function createWindowsDir(inventarioRaiz: string): boolean {
  try {
    mkdirSync(inventarioRaiz, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export function getMissingCriticalTools(distro: string, wslPath: string): string[] {
  const missing: string[] = [];
  const tools = checkWSLTools(distro);

  const critical = ['find', 'sha256sum', 'wc', 'sort', 'uniq', 'head', 'tail', 'grep'];
  for (const tool of critical) {
    if (!tools.get(tool)) missing.push(tool);
  }

  if (!checkWSLPathExists(distro, wslPath)) {
    missing.push(`inventario_path:${wslPath}`);
  }

  return missing;
}

export interface AutoRepairReport {
  success: boolean;
  distroStarted: boolean;
  toolsInstalled: string[];
  pathCreated: boolean;
  errors: string[];
  output: string;
  verification?: WSLVerificationResult;
  pmDetected?: string | null;
  log?: WSLExecResult[];
}

export function autoRepairDistro(distro: string, inventarioRaiz: string, wslPath: string): AutoRepairReport {
  const report: AutoRepairReport = {
    success: false,
    distroStarted: false,
    toolsInstalled: [],
    pathCreated: false,
    errors: [],
    output: '',
  };

  const lines: string[] = [];
  lines.push(`Auto-reparacion de ${distro}...`);
  lines.push('');

  
  lines.push('[0/4] Verificando que la distribucion pueda ejecutar comandos...');
  const verification = verifyWSLDistro(distro);
  report.verification = verification;
  report.log = getWSLLog().slice(-20);

  if (!verification.success) {
    const failedCheck = verification.checks.find(c => !c.ok);
    lines.push(`  Error en verificación basica:`);
    lines.push(`  Comando:  ${failedCheck?.command ?? 'desconocido'}`);
    lines.push(`  Detalle:  ${failedCheck?.detail ?? 'sin detalle'}`);
    lines.push('');
    lines.push(`  La distribucion "${distro}" no responde a comandos basicos.`);
    lines.push(`  Posibles causas:`);
    lines.push(`    - WSL no esta correctamente instalado`);
    lines.push(`    - La distribucion esta corrupta o no se inicio`);
    lines.push(`    - wsl.exe no esta disponible en el PATH`);
    lines.push('');
    lines.push(`  Para diagnosticar manualmente:`);
    lines.push(`    wsl -d "${distro}" -- echo OK`);
    lines.push(`    wsl -l -v`);
    lines.push(`    wsl --version`);
    report.errors.push(`Verificación falló: ${failedCheck?.detail ?? 'error desconocido'}`);
    report.output = lines.join('\n') + '\n\n' + formatVerificationDetail(verification);
    return report;
  }
  lines.push('  OK - Comandos basicos funcionan correctamente');
  lines.push('');

  
  lines.push('[1/4] Verificando estado de la distribucion...');
  try {
    const distros = getWSLDistros();
    const distroInfo = distros.find(d => d.name === distro);
    if (distroInfo && distroInfo.state === 'Stopped') {
      lines.push('  Estado: DETENIDA');
      lines.push('  Iniciando distribucion...');
      const startResult = startWSLDistro(distro);
      if (startResult.success) {
        report.distroStarted = true;
        lines.push('  OK - Distribucion iniciada');
      } else {
        lines.push(`  Error al iniciar: ${startResult.error ?? 'sin detalle'}`);
        report.errors.push(`No se pudo iniciar la distribución: ${startResult.error ?? 'error desconocido'}`);
      }
    } else if (distroInfo && distroInfo.state === 'Running') {
      report.distroStarted = true;
      lines.push('  OK - Distribucion en ejecucion');
    } else {
      lines.push('  Estado: desconocido, continuando...');
    }
  } catch (e) {
    lines.push(`  Error verificando estado: ${String(e)}`);
  }
  lines.push('');

  
  lines.push('[2/4] Detectando gestor de paquetes...');
  const pm = detectWSLPackageManager(distro, true);
  report.pmDetected = pm;

  if (!pm) {
    const errMsg = 'No se detecto gestor de paquetes';
    report.errors.push(errMsg);
    lines.push(`  ${errMsg}`);
    lines.push(`  Ninguno de los siguientes esta disponible:`);
    lines.push(`    apt, apt-get, dpkg, dnf, yum, pacman, zypper, apk`);
    lines.push(`  Sugerencia: Revisa que la distribucion tenga un gestor instalado`);
  } else {
    lines.push(`  OK - Gestor detectado: ${pm}`);
  }
  lines.push('');

  
  lines.push('[3/4] Verificando herramientas criticas...');
  const missing = getMissingCriticalTools(distro, wslPath);
  const missingTools = missing.filter(m => !m.startsWith('inventario_path:'));

  if (missingTools.length > 0) {
    lines.push(`  Herramientas faltantes: ${missingTools.join(', ')}`);
    if (pm) {
      lines.push('  Instalando...');
      try {
        let preCmd = '';
        let installCmd = '';
        const allTools = [...new Set([...missingTools, 'tree', 'findutils', 'coreutils', 'grep', 'gawk'])];

        if (pm === 'apt') {
          preCmd = 'DEBIAN_FRONTEND=noninteractive sudo -n apt update -qq 2>/dev/null || true';
          installCmd = `DEBIAN_FRONTEND=noninteractive sudo -n apt install -y ${allTools.join(' ')} 2>&1 | tail -5`;
        } else if (pm === 'dnf' || pm === 'yum') {
          preCmd = `${pm} check-update 2>/dev/null || true`;
          installCmd = `${pm} install -y ${allTools.join(' ')} 2>&1 | tail -5`;
        } else if (pm === 'pacman') {
          installCmd = `pacman -S --noconfirm ${allTools.join(' ')} 2>&1 | tail -5`;
        } else if (pm === 'zypper') {
          installCmd = `zypper install -y ${allTools.join(' ')} 2>&1 | tail -5`;
        } else if (pm === 'apk') {
          installCmd = `apk add ${allTools.join(' ')} 2>&1 | tail -5`;
        }

        if (preCmd) {
          try { executeWSL(distro, preCmd, 120000); } catch {}
        }
        if (installCmd) {
          executeWSL(distro, installCmd, 180000);
          report.toolsInstalled = allTools;
          lines.push(`  OK - ${allTools.length} paquete(s) instalado(s)`);
          clearToolCache();
        }
      } catch (e) {
        const msg = e instanceof WSLExecutionError
          ? `exit=${e.result.exitCode} stderr="${e.result.stderr.slice(0, 200)}"`
          : String(e);
        report.errors.push(`Error instalando herramientas: ${msg}`);
        lines.push(`  Error instalando: ${msg}`);
      }
    } else {
      lines.push('  No se pueden instalar (sin gestor de paquetes)');
    }
  } else {
    lines.push('  OK - Todas las herramientas criticas presentes');
  }
  lines.push('');

  
  lines.push('[4/4] Verificando ruta de inventario...');
  const pathMissing = missing.some(m => m.startsWith('inventario_path:'));
  if (pathMissing) {
    lines.push(`  Ruta no existe en WSL: ${wslPath}`);
    lines.push('  Creando...');
    try {
      if (ensureWSLPath(distro, wslPath)) {
        report.pathCreated = true;
        lines.push('  OK - Ruta creada');
      } else {
        const errMsg = 'No se pudo crear la ruta de inventario en WSL';
        report.errors.push(errMsg);
        lines.push(`  ${errMsg}`);
        const winHint = wslPathToWindows(wslPath);
        if (winHint) {
          lines.push(`  Sugerencia: Crea la carpeta manualmente:`);
          lines.push(`    mkdir "${winHint}"`);
        }
      }
    } catch (e) {
      const msg = e instanceof WSLExecutionError
        ? `exit=${e.result.exitCode} ${e.result.stderr.slice(0, 200)}`
        : String(e);
      report.errors.push(`Error creando ruta: ${msg}`);
      lines.push(`  Error: ${msg}`);
    }
  } else {
    lines.push('  OK - Ruta de inventario existe');
  }
  lines.push('');

  
  report.success = report.errors.length === 0;
  if (report.success) {
    lines.push('Reparacion completada sin errores.');
  } else {
    lines.push(`Reparacion completada con ${report.errors.length} error(es):`);
    for (const err of report.errors) {
      lines.push(`  - ${err}`);
    }
  }

  report.log = getWSLLog().slice(-50);
  report.output = lines.join('\n');
  return report;
}

function formatVerificationDetail(v: WSLVerificationResult): string {
  const parts = ['--- Detalle de verificacion ---'];
  for (const c of v.checks) {
    parts.push(`  ${c.ok ? 'OK' : 'FAIL'} | ${c.command}`);
    parts.push(`       ${c.detail}`);
  }
  return parts.join('\n');
}
