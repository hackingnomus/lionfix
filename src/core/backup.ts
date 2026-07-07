import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, createWriteStream } from 'node:fs';
import { join, basename } from 'node:path';
import archiver from 'archiver';
import { spawn } from 'node:child_process';
import { logActivity } from './logger.js';
import { formatBytes as formatSize } from '../utils/format.js';

export async function createBackup(
  inventarioRaiz: string,
  tecnico: string,
): Promise<{ path: string; size: string }> {
  const backupDir = join(inventarioRaiz, 'backups');
  mkdirSync(backupDir, { recursive: true });

  const now = new Date();
  const fecha = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
  const backupPath = join(backupDir, `inventario_${fecha}.tar.gz`);

  return new Promise((resolve, reject) => {
    const output = createWriteStream(backupPath);
    const archive = archiver('tar', { gzip: true });

    output.on('close', () => {
      const size = formatSize(archive.pointer());
      rotateBackups(inventarioRaiz);
      logActivity(inventarioRaiz, tecnico, 'backup', backupPath, '*', 'OK');
      writeFileSync(join(inventarioRaiz, '.ultimo_backup'),
        `ultimo_backup="${now.toLocaleDateString()} ${now.toLocaleTimeString()}"\n` +
        `archivo_backup="${basename(backupPath)}"\n` +
        `tamano_backup="${size}"\n`,
        'utf-8',
      );
      resolve({ path: backupPath, size });
    });

    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(inventarioRaiz, false, (entry) => {
      const name = entry.name || '';
      if (name.startsWith('backups/') || name.startsWith('.estado_verificacion') || name.startsWith('.ultimo_backup')) {
        return false;
      }
      return entry;
    });
    archive.finalize();
  });
}

export function listBackups(inventarioRaiz: string): string[] {
  const backupDir = join(inventarioRaiz, 'backups');
  if (!existsSync(backupDir)) return [];
  const files = readdirSync(backupDir);
  return files
    .filter((f: string) => f.startsWith('inventario_') && f.endsWith('.tar.gz'))
    .sort()
    .reverse()
    .map((f: string) => join(backupDir, f));
}

export async function restoreBackup(
  backupPath: string,
  inventarioRaiz: string,
  tecnico: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tarCmd = process.platform === 'win32' ? 'tar.exe' : 'tar';
    const pathArg = process.platform === 'win32' ? backupPath.replace(/\\/g, '/') : backupPath;
    const proc = spawn(tarCmd, ['-xzf', pathArg], { cwd: inventarioRaiz, stdio: 'ignore' });
    proc.on('exit', (code: number | null) => {
      if (code === 0) {
        logActivity(inventarioRaiz, tecnico, 'restaurar_backup', basename(backupPath), '*', 'OK');
        resolve();
      } else {
        reject(new Error(`tar exit code: ${code ?? 'señal'}. Asegúrate de tener ${tarCmd} instalado.`));
      }
    });
    proc.on('error', (err) => {
      reject(new Error(`No se pudo ejecutar tar: ${err.message}. Instala tar o usa 7zip.`));
    });
  });
}

function rotateBackups(inventarioRaiz: string): void {
  const backups = listBackups(inventarioRaiz);
  if (backups.length > 5) {
    const toDelete = backups.slice(5);
    for (const b of toDelete) {
      try { unlinkSync(b); } catch { }
    }
  }
}


