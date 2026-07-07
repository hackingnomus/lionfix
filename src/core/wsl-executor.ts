import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface WSLExecResult {
  command: string;
  args: string[];
  distro: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  signal: NodeJS.Signals | null;
  durationMs: number;
  error: string | null;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_DIR = join(__dirname, '..', '..', 'logs');
const LOG_FILE = join(LOG_DIR, 'wsl-executor.log');

if (!existsSync(LOG_DIR)) {
  try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}
}

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function safeStr(v: unknown, max = 500): string {
  const s = String(v ?? '');
  return s.length > max ? s.slice(0, max) + '...' : s;
}

function appendLog(entry: WSLExecResult): void {
  try {
    const line = [
      `[${timestamp()}]`,
      `distro=${entry.distro}`,
      `exit=${entry.exitCode}`,
      `signal=${entry.signal}`,
      `dur=${entry.durationMs}ms`,
      `cmd=${safeStr(entry.command, 200)}`,
      `stdout=${safeStr(entry.stdout, 300)}`,
      `stderr=${safeStr(entry.stderr, 300)}`,
      `error=${entry.error ?? 'none'}`,
    ].join(' | ');
    appendFileSync(LOG_FILE, line + '\n', 'utf-8');
  } catch {}
}

function decodeWSLBuffer(buf: Buffer): string {
  if (!buf || buf.length === 0) return '';
  const isUTF16LE = buf.indexOf(0) !== -1 || (buf[0] === 0xff && buf[1] === 0xfe);
  const raw = isUTF16LE ? buf.toString('utf-16le') : buf.toString('utf-8');
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function decodeWSLBufferPublic(buf: Buffer): string {
  return decodeWSLBuffer(buf);
}

const logRing: WSLExecResult[] = [];
const MAX_LOG_RING = 1000;

export function getWSLLog(): WSLExecResult[] {
  return [...logRing];
}

export class WSLExecutionError extends Error {
  public readonly result: WSLExecResult;

  constructor(result: WSLExecResult) {
    const parts: string[] = [
      `WSL ejecucion fallida`,
      `  Distro:     ${result.distro}`,
      `  Comando:    ${result.command}`,
      `  ExitCode:   ${result.exitCode}`,
      `  Senal:      ${result.signal ?? 'ninguna'}`,
      `  Duracion:   ${result.durationMs}ms`,
    ];
    if (result.stderr) parts.push(`  stderr:     ${result.stderr.slice(0, 1000)}`);
    if (result.stdout) parts.push(`  stdout:     ${result.stdout.slice(0, 500)}`);
    if (result.error) parts.push(`  Error:      ${result.error}`);
    super(parts.join('\n'));
    this.name = 'WSLExecutionError';
    this.result = result;
  }
}

export function executeWSL(
  distro: string,
  command: string,
  timeout = 60000,
): WSLExecResult {
  const start = Date.now();
  const args = ['-d', distro, '--', 'bash', '-c', command];

  let stdoutBuf: Buffer | null = null;
  let stderrBuf: Buffer | null = null;
  let status: number | null = null;
  let signal: NodeJS.Signals | null = null;
  let spawnError: string | null = null;

  try {
    const result = spawnSync('wsl.exe', args, {
      timeout,
      encoding: 'buffer',
      maxBuffer: 10 * 1024 * 1024,
    });
    stdoutBuf = result.stdout;
    stderrBuf = result.stderr;
    status = result.status;
    signal = result.signal;
    if (result.error) spawnError = result.error.message;
  } catch (err) {
    spawnError = err instanceof Error ? err.message : String(err);
  }

  const duration = Date.now() - start;
  const stdout = decodeWSLBuffer(stdoutBuf ?? Buffer.alloc(0));
  const stderr = decodeWSLBuffer(stderrBuf ?? Buffer.alloc(0));

  const entry: WSLExecResult = {
    command,
    args,
    distro,
    exitCode: status,
    stdout,
    stderr,
    signal,
    durationMs: duration,
    error: spawnError,
  };

  logRing.push(entry);
  if (logRing.length > MAX_LOG_RING) logRing.splice(0, logRing.length - MAX_LOG_RING);
  appendLog(entry);

  if (spawnError !== null || status !== 0) {
    throw new WSLExecutionError(entry);
  }

  return entry;
}

export function executeWSLSafe(
  distro: string,
  command: string,
  timeout = 60000,
): WSLExecResult {
  try {
    return executeWSL(distro, command, timeout);
  } catch (err) {
    if (err instanceof WSLExecutionError) return err.result;
    const fallback: WSLExecResult = {
      command,
      args: [],
      distro,
      exitCode: null,
      stdout: '',
      stderr: '',
      signal: null,
      durationMs: 0,
      error: err instanceof Error ? err.message : String(err),
    };
    logRing.push(fallback);
    return fallback;
  }
}

export function formatWSLLog(entries?: WSLExecResult[]): string {
  const list = entries ?? logRing;
  if (list.length === 0) return '(sin comandos ejecutados)';
  return list.map((e, i) => {
    const ok = e.exitCode === 0 && !e.error;
    return [
      `[${i + 1}] ${ok ? 'OK' : 'FAIL'}`,
      `  Distro:   ${e.distro}`,
      `  Comando:  ${e.command}`,
      `  ExitCode: ${e.exitCode}`,
      `  Duracion: ${e.durationMs}ms`,
      e.signal ? `  Senal:    ${e.signal}` : '',
      e.stderr ? `  stderr:   ${e.stderr.slice(0, 300)}` : '',
      e.error ? `  Error:    ${e.error}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}
