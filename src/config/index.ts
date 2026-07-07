import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export interface Config {
  INVENTARIO_RAIZ: string;
  TECNICO: string;
  USAR_DOBLE_HASH: string;
  UMBRAL_DISCO_GB: string;
  DOWNLOADS_DIR: string;
  PORTABLE_MODE: string;
  AI_API_KEY: string;
  AI_MODEL: string;
  AI_BASE_URL: string;
  EXCEL_USERS_PATH: string;
}

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = join(dirname(__filename), '../..');

function detectProjectRoot(): string {
  const candidates = [
    PROJECT_ROOT,
    join(process.cwd(), 'lionfix-v5'),
    process.cwd(),
  ];
  for (const p of candidates) {
    if (existsSync(join(p, 'package.json'))) return p;
  }
  return PROJECT_ROOT;
}

function resolveInventoryRoot(base: string): string {
  const fallback = join(base, 'inventario');
  try { mkdirSync(fallback, { recursive: true }); } catch { }
  return fallback;
}

export function loadConfig(configPath?: string): Config {
  const root = detectProjectRoot();
  const path = configPath || join(root, 'config.cfg');

  const defaults: Config = {
    INVENTARIO_RAIZ: resolveInventoryRoot(root),
    TECNICO: process.env.USER || 'tecnico',
    USAR_DOBLE_HASH: 'no',
    UMBRAL_DISCO_GB: '10',
    DOWNLOADS_DIR: join(homedir(), 'Downloads'),
    PORTABLE_MODE: 'no',
    AI_API_KEY: '',
    AI_MODEL: 'gpt-3.5-turbo',
    AI_BASE_URL: 'https://api.openai.com/v1',
    EXCEL_USERS_PATH: '',
  };

  if (!existsSync(path)) return defaults;

  const raw = readFileSync(path, 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim() as keyof Config;
    let val = trimmed.slice(eq + 1).trim();
    val = val.replace(/^["']|["']$/g, '');
    if (key in defaults) (defaults as unknown as Record<string, string>)[key] = val;  }

  if (!existsSync(defaults.INVENTARIO_RAIZ)) {
    defaults.INVENTARIO_RAIZ = resolveInventoryRoot(root);
    saveConfig('INVENTARIO_RAIZ', defaults.INVENTARIO_RAIZ, path);
  }

  return defaults;
}

export function saveConfig(key: keyof Config, value: string, configPath?: string): void {
  const root = detectProjectRoot();
  const path = configPath || join(root, 'config.cfg');

  if (!existsSync(path)) {
    writeFileSync(path, `${key}="${value}"\n`, 'utf-8');
    return;
  }

  let raw = readFileSync(path, 'utf-8');
  const regex = new RegExp(`^${key}=.*`, 'm');
  const line = `${key}="${value}"`;
  if (regex.test(raw)) {
    raw = raw.replace(regex, line);
  } else {
    raw += `${line}\n`;
  }
  writeFileSync(path, raw, 'utf-8');
}

export { detectProjectRoot as getProjectRoot };
