import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { logActivity, readLog, parseLog } from './logger.js';
import { getDashboard } from './state.js';
import { readSystemUsers } from './users-excel.js';
import { getWSLDistros, getWSLDistroInfo, isWSLAvailable } from './wsl.js';
import { formatError } from './errors.js';

export interface ChatbotConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatbotResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}

const DEFAULT_CONFIG: ChatbotConfig = {
  apiKey: '',
  model: 'gpt-3.5-turbo',
  baseUrl: 'https://api.openai.com/v1',
  maxTokens: 2048,
  temperature: 0.7,
  systemPrompt: `Eres un asistente técnico especializado en LionFix, un sistema de gestión de inventario para talleres de reparación de equipos. Puedes analizar datos del inventario, actividades de técnicos, y generar reportes. Responde en español de forma clara y útil.

Tus capacidades:
- Analizar el inventario (ISOs, herramientas, drivers, documentos)
- Revisar actividades y logs de técnicos
- Generar reportes de estado del sistema
- Ayudar con la organización de archivos
- Interpretar métricas y estadísticas del taller`,
};

export function loadChatbotConfig(configDir: string): ChatbotConfig {
  const path = join(configDir, '.chatbot.json');
  if (!existsSync(path)) return { ...DEFAULT_CONFIG };
  try {
    const raw = readFileSync(path, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveChatbotConfig(configDir: string, cfg: Partial<ChatbotConfig>): ChatbotConfig {
  const path = join(configDir, '.chatbot.json');
  mkdirSync(dirname(path), { recursive: true });
  const existing = loadChatbotConfig(configDir);
  const merged = { ...existing, ...cfg };
  writeFileSync(path, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

export function isChatbotConfigured(configDir: string): boolean {
  const cfg = loadChatbotConfig(configDir);
  return cfg.apiKey.length > 0;
}

export function getSystemContext(inventarioRaiz: string): string {
  const parts: string[] = ['--- CONTEXTO DEL SISTEMA ---'];

  try {
    const dbPath = join(inventarioRaiz, '.usuarios.db');
    if (existsSync(dbPath)) {
      const users = readFileSync(dbPath, 'utf-8').trim().split('\n').filter(Boolean);
      parts.push(`Usuarios del sistema (${users.length}): ${users.map(u => u.split(':')[0]).join(', ')}`);
    }
  } catch { }

  try {
    const systemUsers = readSystemUsers();
    if (systemUsers.length > 0) {
      parts.push(`Usuarios del SO (${systemUsers.length}): ${systemUsers.map(u => u.username).join(', ')}`);
    }
  } catch { }

  try {
    const logs = parseLog(readLog(inventarioRaiz));
    const recent = logs.slice(-20);
    if (recent.length > 0) {
      parts.push(`Últimas ${recent.length} actividades registradas:`);
      for (const entry of recent.slice(-5)) {
        parts.push(`  [${entry.FECHA}] ${entry.TECNICO}: ${entry.OPERACION} - ${entry.ARCHIVO} (${entry.RESULTADO})`);
      }
    }
  } catch { }

  try {
    if (isWSLAvailable()) {
      const distros = getWSLDistros();
      if (distros.length > 0) {
        parts.push(`Distros WSL detectadas (${distros.length}): ${distros.map(d => d.name).join(', ')}`);
      } else {
        parts.push('WSL disponible sin distros instaladas');
      }
    }
  } catch { }

  return parts.join('\n');
}

export async function getReportData(inventarioRaiz: string): Promise<string> {
  const parts: string[] = [];

  try {
    const dashboard = await getDashboard(inventarioRaiz);
    parts.push('=== REPORTE DEL SISTEMA LIONFIX ===');
    parts.push(`Total archivos: ${dashboard.total_inventario}`);
    parts.push(`Pendientes: ${dashboard.pendientes}`);
    parts.push(`Categorías:`);
    parts.push(`  ISOs: ${dashboard.archivos_por_categoria.isos}`);
    parts.push(`  Herramientas: ${dashboard.archivos_por_categoria.herramientas}`);
    parts.push(`  Drivers: ${dashboard.archivos_por_categoria.drivers}`);
    parts.push(`  Documentos: ${dashboard.archivos_por_categoria.documentos}`);
    parts.push(`  Otros: ${dashboard.archivos_por_categoria.otros}`);
    parts.push(`Espacio libre: ${dashboard.espacio_libre}`);
    parts.push(`Espacio usado: ${dashboard.espacio_usado}`);
    parts.push(`Total actividades: ${dashboard.total_actividades}`);
    parts.push(`Total usuarios: ${dashboard.total_usuarios}`);
    parts.push(`USBs detectados: ${dashboard.usb_detectados}`);
    parts.push(`Último backup: ${dashboard.ultimo_backup || 'Nunca'}`);
    parts.push(`Antigüedad backup: ${dashboard.backup_age_dias !== null ? `${dashboard.backup_age_dias} días` : 'N/A'}`);
    parts.push(`Items en papelera: ${dashboard.trash_count}`);

    if (dashboard.top5_mas_grandes.length > 0) {
      parts.push('\nTop 5 archivos más grandes:');
      for (const f of dashboard.top5_mas_grandes) {
        parts.push(`  ${f.name} (${f.size})`);
      }
    }
  } catch (e) {
    parts.push(`Error obteniendo dashboard: ${formatError(e)}`);
  }

  return parts.join('\n');
}

export async function askChatbot(
  configDir: string,
  inventarioRaiz: string,
  userMessage: string,
  history: ChatMessage[] = [],
): Promise<ChatbotResponse> {
  const cfg = loadChatbotConfig(configDir);
  if (!cfg.apiKey) {
    return { content: 'Error: API key no configurada. Ve a Configuración > Asistente IA.' };
  }

  const systemContext = getSystemContext(inventarioRaiz);
  const fullSystemPrompt = `${cfg.systemPrompt}\n\n${systemContext}`;

  const messages: ChatMessage[] = [
    { role: 'system', content: fullSystemPrompt },
    ...history.slice(-10),
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        max_tokens: cfg.maxTokens,
        temperature: cfg.temperature,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { content: `Error API (${response.status}): ${errText}` };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || 'Sin respuesta';
    const usage = data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
    } : undefined;

    return { content, usage };
  } catch (e) {
    return { content: `Error de conexión: ${formatError(e)}` };
  }
}

export async function generateReportWithAI(
  configDir: string,
  inventarioRaiz: string,
  reportType: string,
): Promise<string> {
  const reportData = await getReportData(inventarioRaiz);

  const prompts: Record<string, string> = {
    general: `Basado en estos datos del inventario, genera un reporte ejecutivo:\n\n${reportData}`,
    storage: `Analiza el uso de almacenamiento y sugiere mejoras:\n\n${reportData}`,
    activity: `Resume la actividad de los técnicos y da recomendaciones:\n\n${reportData}`,
    inventory: `Analiza el inventario y sugiere reorganizaciones:\n\n${reportData}`,
  };

  const prompt = prompts[reportType] || prompts.general;
  const result = await askChatbot(configDir, inventarioRaiz, prompt);
  return result.content;
}
