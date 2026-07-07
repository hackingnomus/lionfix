import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { hostname as osHostname } from 'node:os';
import { hashPassword, sanitizeUsername, saveUserAndCreateDir, userExists, loadUsers } from './auth.js';
import { logActivity } from './logger.js';
import { decodeWSLBuffer } from './wsl.js';
import type { Workbook, Worksheet } from 'exceljs';

export interface ExcelUserRow {
  username: string;
  password?: string;
  fullName?: string;
  role?: string;
}

export async function readUsersFromExcel(filePath: string): Promise<ExcelUserRow[]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const rows: ExcelUserRow[] = [];
  const headerRow = ws.getRow(1);
  const colMap = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => {
    const val = cell.text?.toString().toLowerCase().trim();
    if (val) colMap.set(val, colNumber);
  });

  const usernameCol = colMap.get('usuario') ?? colMap.get('username') ?? colMap.get('user') ?? 1;
  const passwordCol = colMap.get('password') ?? colMap.get('pass') ?? colMap.get('contraseña') ?? 0;
  const fullNameCol = colMap.get('nombre') ?? colMap.get('fullname') ?? colMap.get('name') ?? 0;
  const roleCol = colMap.get('rol') ?? colMap.get('role') ?? 0;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const username = row.getCell(usernameCol).text?.toString().trim();
    if (!username) return;
    const safe = sanitizeUsername(username);
    if (!safe) return;
    rows.push({
      username: safe,
      password: passwordCol ? row.getCell(passwordCol).text?.toString().trim() || safe : safe,
      fullName: fullNameCol ? row.getCell(fullNameCol).text?.toString().trim() : undefined,
      role: roleCol ? row.getCell(roleCol).text?.toString().trim() : undefined,
    });
  });

  return rows;
}

export async function importUsersFromExcel(
  inventarioRaiz: string,
  excelPath: string,
  tecnico: string,
  setTecnico?: boolean,
): Promise<{ imported: number; skipped: number; errors: string[]; users: string[] }> {
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;
  const importedUsers: string[] = [];

  try {
    const users = await readUsersFromExcel(excelPath);
    for (const u of users) {
      try {
        if (userExists(inventarioRaiz, u.username)) {
          skipped++;
          continue;
        }
        saveUserAndCreateDir(inventarioRaiz, u.username, hashPassword(u.password || u.username));
        logActivity(inventarioRaiz, tecnico, 'importar_usuario_excel', u.username, '*', 'OK');
        importedUsers.push(u.username);
        imported++;
      } catch (e) {
        errors.push(`${u.username}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Guardar ruta del Excel en config.cfg
    if (imported > 0) {
      try {
        const { saveConfig } = await import('../config/index.js');
        saveConfig('EXCEL_USERS_PATH', excelPath);

        // Si se solicita, auto-asignar el primer usuario importado como TECNICO
        if (setTecnico && importedUsers.length > 0) {
          saveConfig('TECNICO', importedUsers[0]);
        }
      } catch { }
    }
  } catch (e) {
    errors.push(`Error leyendo Excel: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { imported, skipped, errors, users: importedUsers };
}

export function readSystemUsers(): { username: string; fullName?: string }[] {
  const users: { username: string; fullName?: string }[] = [];

  if (process.platform === 'win32') {
    try {
      const out = execSync('net user', { encoding: 'utf-8', timeout: 10000 });
      const lines = out.split('\n');
      let inTable = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.includes('---')) { inTable = true; continue; }
        if (!inTable || !trimmed || trimmed.startsWith('El comando')) continue;
        const parts = trimmed.split(/\s{2,}/);
        for (const p of parts) {
          const u = p.trim();
          if (u && !u.startsWith('.')) users.push({ username: u.toLowerCase() });
        }
      }
    } catch {
      try {
        const out2 = execSync('whoami', { encoding: 'utf-8', timeout: 5000 });
        const u = out2.trim().split('\\').pop()?.toLowerCase();
        if (u) users.push({ username: u });
      } catch { }
    }
  } else {
    try {
      const out = execSync('cat /etc/passwd 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
      for (const line of out.split('\n')) {
        const parts = line.trim().split(':');
        if (parts.length >= 7) {
          const uid = parseInt(parts[2], 10);
          if (uid >= 1000 && uid < 65534) {
            users.push({ username: parts[0], fullName: parts[4] || undefined });
          }
        }
      }
    } catch {
      try {
        const u = execSync('whoami', { encoding: 'utf-8', timeout: 5000 }).trim().toLowerCase();
        if (u) users.push({ username: u });
      } catch { }
    }
  }

  return users;
}

export function findExcelFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => /\.xlsx?$/i.test(f)).map(f => join(dir, f));
}

export interface EnvironmentInfo {
  platform: string;
  hostname: string;
  arch: string;
  nodeVersion: string;
  shell: string;
  wslAvailable: boolean;
  wslDistro: string;
  isWSL: boolean;
}

export function getEnvironmentInfo(): EnvironmentInfo {
  const info: EnvironmentInfo = {
    platform: process.platform,
    hostname: osHostname(),
    arch: process.arch,
    nodeVersion: process.version,
    shell: process.env.SHELL || process.env.ComSpec || 'unknown',
    wslAvailable: false,
    wslDistro: process.env.WSL_DISTRO_NAME || '',
    isWSL: false,
  };

  if (process.platform === 'linux' && existsSync('/proc/sys/kernel/osrelease')) {
    try {
      const osRelease = readFileSync('/proc/sys/kernel/osrelease', 'utf-8').toLowerCase();
      if (osRelease.includes('microsoft') || osRelease.includes('wsl')) {
        info.isWSL = true;
      }
    } catch { }
  }

  if (process.platform === 'win32') {
    try {
      execSync('wsl.exe --status', { timeout: 3000 });
      info.wslAvailable = true;
      try {
        const buf = execSync('wsl.exe -l -q', { timeout: 5000 });
        info.wslDistro = decodeWSLBuffer(buf).split('\n')[0] || '';
      } catch { }
    } catch { }
  }

  return info;
}

const LOGIN_EXCEL_FILE = 'login_history.xlsx';

const LOGIN_COLUMNS = [
  { header: 'FECHA', key: 'fecha', width: 22 },
  { header: 'USUARIO', key: 'usuario', width: 20 },
  { header: 'HOSTNAME', key: 'hostname', width: 25 },
  { header: 'PLATAFORMA', key: 'plataforma', width: 12 },
  { header: 'ARQUITECTURA', key: 'arch', width: 12 },
  { header: 'NODE', key: 'node', width: 12 },
  { header: 'SHELL', key: 'shell', width: 20 },
  { header: 'WSL', key: 'wsl', width: 10 },
  { header: 'DISTRO_WSL', key: 'wslDistro', width: 25 },
  { header: 'TIPO', key: 'tipo', width: 15 },
];

export async function logLoginToExcel(
  inventarioRaiz: string,
  username: string,
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const filePath = join(inventarioRaiz, LOGIN_EXCEL_FILE);

  let wb: Workbook;
  let ws: Worksheet;

  const env = getEnvironmentInfo();

  if (existsSync(filePath)) {
    wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    ws = wb.getWorksheet('LoginHistory') || wb.addWorksheet('LoginHistory');
    const existingCols = new Set<string>();
    ws.getRow(1).eachCell((cell) => {
      existingCols.add(cell.text?.toString().trim());
    });
    for (const col of LOGIN_COLUMNS) {
      if (!existingCols.has(col.header)) {
        const c = ws.getColumn(ws.columnCount + 1);
        c.header = col.header;
        c.key = col.key;
        c.width = col.width;
      }
    }
  } else {
    wb = new ExcelJS.Workbook();
    ws = wb.addWorksheet('LoginHistory');
    ws.columns = LOGIN_COLUMNS.map(c => ({ ...c }));
    ws.getRow(1).font = { bold: true };
  }

  ws.addRow({
    fecha: new Date().toISOString().replace('T', ' ').slice(0, 19),
    usuario: username,
    hostname: env.hostname,
    plataforma: env.platform,
    arch: env.arch,
    node: env.nodeVersion,
    shell: env.shell,
    wsl: env.wslAvailable ? 'SI' : 'NO',
    wslDistro: env.wslDistro || (env.isWSL ? 'Si (WSL interno)' : ''),
    tipo: 'login',
  });

  mkdirSync(dirname(filePath), { recursive: true });
  await wb.xlsx.writeFile(filePath);
}

const REGISTRATION_EXCEL_FILE = 'usuarios_registrados.xlsx';

const REGISTRATION_COLUMNS = [
  { header: 'FECHA', key: 'fecha', width: 22 },
  { header: 'USUARIO', key: 'usuario', width: 20 },
  { header: 'HOSTNAME', key: 'hostname', width: 25 },
  { header: 'PLATAFORMA', key: 'plataforma', width: 12 },
  { header: 'ARQUITECTURA', key: 'arch', width: 12 },
  { header: 'NODE', key: 'node', width: 12 },
  { header: 'SHELL', key: 'shell', width: 20 },
];

export async function logUserRegistrationToExcel(
  inventarioRaiz: string,
  username: string,
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const filePath = join(inventarioRaiz, REGISTRATION_EXCEL_FILE);

  let wb: Workbook;
  let ws: Worksheet;

  const env = getEnvironmentInfo();

  if (existsSync(filePath)) {
    wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    ws = wb.getWorksheet('RegistroUsuarios') || wb.addWorksheet('RegistroUsuarios');
    const existingCols = new Set<string>();
    ws.getRow(1).eachCell((cell) => {
      existingCols.add(cell.text?.toString().trim());
    });
    for (const col of REGISTRATION_COLUMNS) {
      if (!existingCols.has(col.header)) {
        const c = ws.getColumn(ws.columnCount + 1);
        c.header = col.header;
        c.key = col.key;
        c.width = col.width;
      }
    }
  } else {
    wb = new ExcelJS.Workbook();
    ws = wb.addWorksheet('RegistroUsuarios');
    ws.columns = REGISTRATION_COLUMNS.map(c => ({ ...c }));
    ws.getRow(1).font = { bold: true };
  }

  ws.addRow({
    fecha: new Date().toISOString().replace('T', ' ').slice(0, 19),
    usuario: username,
    hostname: env.hostname,
    plataforma: env.platform,
    arch: env.arch,
    node: env.nodeVersion,
    shell: env.shell,
  });

  mkdirSync(dirname(filePath), { recursive: true });
  await wb.xlsx.writeFile(filePath);
}

const MOVEMENT_EXCEL_FILE = 'auditoria.xlsx';

const MOVEMENT_COLUMNS = [
  { header: 'FECHA', key: 'fecha', width: 22 },
  { header: 'USUARIO', key: 'usuario', width: 20 },
  { header: 'ACCION', key: 'accion', width: 30 },
  { header: 'DETALLE', key: 'detalle', width: 60 },
  { header: 'VISTA', key: 'vista', width: 25 },
  { header: 'IP', key: 'ip', width: 15 },
];

export async function logMovementToExcel(
  inventarioRaiz: string,
  username: string,
  accion: string,
  detalle: string,
  vista: string,
): Promise<void> {
  try {
    const ExcelJS = (await import('exceljs')).default;
    const filePath = join(inventarioRaiz, MOVEMENT_EXCEL_FILE);

    let wb: Workbook;
    let ws: Worksheet;

    if (existsSync(filePath)) {
      wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(filePath);
      ws = wb.getWorksheet('Auditoria') || wb.addWorksheet('Auditoria');
      const existingCols = new Set<string>();
      ws.getRow(1).eachCell((cell) => {
        existingCols.add(cell.text?.toString().trim());
      });
      for (const col of MOVEMENT_COLUMNS) {
        if (!existingCols.has(col.header)) {
          const c = ws.getColumn(ws.columnCount + 1);
          c.header = col.header;
          c.key = col.key;
          c.width = col.width;
        }
      }
    } else {
      wb = new ExcelJS.Workbook();
      ws = wb.addWorksheet('Auditoria');
      ws.columns = MOVEMENT_COLUMNS.map(c => ({ ...c }));
      ws.getRow(1).font = { bold: true };
    }

    ws.addRow({
      fecha: new Date().toISOString().replace('T', ' ').slice(0, 19),
      usuario: username,
      accion,
      detalle,
      vista,
      ip: '127.0.0.1',
    });

    mkdirSync(dirname(filePath), { recursive: true });
    await wb.xlsx.writeFile(filePath);
  } catch { }
}

export async function exportUsersToExcel(
  inventarioRaiz: string,
  outputPath?: string,
): Promise<string> {
  const ExcelJS = (await import('exceljs')).default;
  const userList = loadUsers(inventarioRaiz);
  const filePath = outputPath || join(inventarioRaiz, 'usuarios_export.xlsx');

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Usuarios');

  ws.columns = [
    { header: 'USUARIO', key: 'usuario', width: 22 },
    { header: 'HASH', key: 'hash', width: 70 },
    { header: 'FECHA_EXPORT', key: 'fecha', width: 22 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const u of userList) {
    ws.addRow({
      usuario: u.username,
      hash: u.passwordHash,
      fecha: new Date().toISOString().replace('T', ' ').slice(0, 19),
    });
  }

  mkdirSync(dirname(filePath), { recursive: true });
  await wb.xlsx.writeFile(filePath);
  return filePath;
}

export async function getLoginHistory(inventarioRaiz: string): Promise<{ fecha: string; usuario: string; hostname: string; plataforma: string; tipo: string }[]> {
  const filePath = join(inventarioRaiz, LOGIN_EXCEL_FILE);
  if (!existsSync(filePath)) return [];

  try {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('LoginHistory');
    if (!ws) return [];

    const rows: { fecha: string; usuario: string; hostname: string; plataforma: string; tipo: string }[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      rows.push({
        fecha: row.getCell(1).text?.toString() || '',
        usuario: row.getCell(2).text?.toString() || '',
        hostname: row.getCell(3).text?.toString() || '',
        plataforma: row.getCell(4).text?.toString() || '',
        tipo: row.getCell(5).text?.toString() || '',
      });
    });
    return rows;
  } catch {
    return [];
  }
}
