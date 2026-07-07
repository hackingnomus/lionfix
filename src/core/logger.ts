import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendFileWithRetry, writeFileWithRetry } from './errors.js';

export interface LogEntry {
  FECHA: string;
  TECNICO: string;
  OPERACION: string;
  ARCHIVO: string;
  EQUIPO: string;
  RESULTADO: string;
}

export function csvEscape(val: string): string {
  if (val.includes('"') || val.includes(',') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function logActivity(
  inventarioRaiz: string,
  tecnico: string,
  operacion: string,
  archivo: string,
  equipo: string,
  resultado: string,
): void {
  const logFile = join(inventarioRaiz, 'actividades.csv');
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const safeUser = tecnico.toLowerCase().replace(/[^a-z0-9_.-]/g, '') || 'sistema';
  const userDir = join(inventarioRaiz, 'usuarios', safeUser);
  const userLogFile = join(userDir, 'actividades.csv');

  const header = 'FECHA,TECNICO,OPERACION,ARCHIVO,EQUIPO,RESULTADO\n';

  if (!existsSync(logFile)) {
    writeFileWithRetry(logFile, header, 'utf-8');
  }
  mkdirSync(userDir, { recursive: true });
  if (!existsSync(userLogFile)) {
    writeFileWithRetry(userLogFile, header, 'utf-8');
  }

  const line = `${timestamp},${csvEscape(tecnico)},${csvEscape(operacion)},${csvEscape(archivo)},${csvEscape(equipo)},${csvEscape(resultado)}\n`;

  appendFileWithRetry(logFile, line, 'utf-8');
  appendFileWithRetry(userLogFile, line, 'utf-8');
}

export function readLog(inventarioRaiz: string): string {
  const logFile = join(inventarioRaiz, 'actividades.csv');
  if (!existsSync(logFile)) return 'FECHA,TECNICO,OPERACION,ARCHIVO,EQUIPO,RESULTADO\n';
  return readFileSync(logFile, 'utf-8');
}

export function readUserLog(inventarioRaiz: string, usuario: string): string {
  const safe = usuario.toLowerCase().replace(/[^a-z0-9_.-]/g, '') || 'sistema';
  const logFile = join(inventarioRaiz, 'usuarios', safe, 'actividades.csv');
  if (!existsSync(logFile)) return 'FECHA,TECNICO,OPERACION,ARCHIVO,EQUIPO,RESULTADO\n';
  return readFileSync(logFile, 'utf-8');
}

export function parseLog(csv: string): LogEntry[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).filter(Boolean).map(line => {
    const vals = parseCSVLine(line);
    const entry: Record<string, string> = {};
    headers.forEach((h, i) => { entry[h.trim()] = (vals[i] || '').trim(); });
    return entry as unknown as LogEntry;
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
