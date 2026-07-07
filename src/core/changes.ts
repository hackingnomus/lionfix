import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { appendFileWithRetry } from './errors.js';

function getLogPath(inventarioRaiz: string): string {
  const path = join(inventarioRaiz, 'cambios_inventario.log');
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

function timestamp(): string {
  const d = new Date();
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

export function registrarAdicion(
  inventarioRaiz: string,
  archivo: string,
  hash: string,
  tecnico: string,
): void {
  const log = getLogPath(inventarioRaiz);
  const line = `[${timestamp()}] TIPO:ADICION ARCHIVO:${archivo} HASH:${hash} TECNICO:${tecnico}\n`;
  appendFileWithRetry(log, line, 'utf-8');
}

export function registrarEliminacion(
  inventarioRaiz: string,
  archivo: string,
  hash: string,
  tecnico: string,
): void {
  const log = getLogPath(inventarioRaiz);
  const line = `[${timestamp()}] TIPO:ELIMINACION ARCHIVO:${archivo} HASH:${hash} TECNICO:${tecnico}\n`;
  appendFileWithRetry(log, line, 'utf-8');
}

export function registrarModificacion(
  inventarioRaiz: string,
  archivo: string,
  hashAnterior: string,
  hashNuevo: string,
  tecnico: string,
): void {
  const log = getLogPath(inventarioRaiz);
  const line = `[${timestamp()}] TIPO:MODIFICACION ARCHIVO:${archivo} HASH_ANTERIOR:${hashAnterior} HASH_NUEVO:${hashNuevo} TECNICO:${tecnico}\n`;
  appendFileWithRetry(log, line, 'utf-8');
}
