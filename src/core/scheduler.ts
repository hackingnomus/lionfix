import { execSync, spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function createSecureTempFile(content: string): string {
  const tmpDir = mkdtempSync(join(tmpdir(), 'lionfix_cron_'));
  const tmpFile = join(tmpDir, 'crontab');
  writeFileSync(tmpFile, content, { mode: 0o600, encoding: 'utf-8' });
  return tmpFile;
}

function cleanupTempFile(tmpFile: string): void {
  try { unlinkSync(tmpFile); } catch { }
  try { unlinkSync(join(tmpFile, '..')); } catch { }
}

function cronToSchtasks(schedule: string): string[] {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return [];
  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;
  const minuteStr = minute.padStart(2, '0');
  const hourStr = hour.padStart(2, '0');
  const time = `${hourStr}:${minuteStr}`;
  if (dayOfWeek !== '*' && dayOfWeek !== '0') {
    const d = parseInt(dayOfWeek, 10);
    const day = DAYS[d] || 'SUN';
    return ['/sc', 'weekly', '/d', day, '/st', time];
  }
  if (dayOfMonth !== '*' && dayOfMonth !== '0') {
    return ['/sc', 'monthly', '/d', dayOfMonth, '/st', time];
  }
  return ['/sc', 'daily', '/st', time];
}

const TASKS_DIR = join(process.cwd(), '.lionfix-tasks');

function taskBatPath(taskName: string): string {
  return join(TASKS_DIR, `${taskName}.bat`);
}

function taskBatFile(taskName: string, command: string): string {
  if (!existsSync(TASKS_DIR)) { try { mkdirSync(TASKS_DIR, { recursive: true }); } catch { } }
  const batFile = taskBatPath(taskName);
  writeFileSync(batFile, `@echo off\r\n${command}\r\n`, { encoding: 'utf-8' });
  return batFile;
}

function schtasksExec(args: string[]): string {
  const result = spawnSync('schtasks.exe', args, { timeout: 15000, encoding: 'utf-8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== null) {
    throw new Error((result.stderr || '').trim() || `schtasks exit code ${result.status}`);
  }
  return (result.stdout || '').trim();
}

function isWindowsSchedulerAvailable(): boolean {
  try {
    schtasksExec(['/?']);
    return true;
  } catch {
    return false;
  }
}

function checkSchedulerOrThrow(): void {
  if (process.platform === 'win32') {
    if (!isWindowsSchedulerAvailable()) {
      throw new Error('Task Scheduler (schtasks) no está disponible en este sistema');
    }
    return;
  }
  if (!isCronAvailable()) {
    throw new Error('crontab no está disponible en este sistema');
  }
}

function applyCron(content: string): void {
  const tmpFile = createSecureTempFile(content);
  try {
    execSync(`crontab "${tmpFile}"`);
  } finally {
    cleanupTempFile(tmpFile);
  }
}

function getCronContent(): string {
  return execSync('crontab -l 2>/dev/null || true', { encoding: 'utf-8' });
}

function installCronOnUnix(schedule: string, command: string, identifier: string): void {
  const cronLine = `${schedule} ${command} # LionFix`;
  const existing = getCronContent();
  const filtered = existing.split('\n').filter(l => !l.includes(identifier)).join('\n');
  const newCron = filtered.trim() + '\n' + cronLine + '\n';
  applyCron(newCron);
}

function installTaskOnWindows(schedule: string, command: string, identifier: string): void {
  try { schtasksExec(['/delete', '/tn', identifier, '/f']); } catch { }
  const schParams = cronToSchtasks(schedule);
  if (schParams.length === 0) throw new Error(`No se pudo convertir la expresión cron: ${schedule}`);
  const batFile = taskBatFile(identifier, command);
  const args = ['/create', '/tn', identifier, '/tr', batFile, ...schParams, '/f'];
  schtasksExec(args);
}

function removeTaskOnWindows(identifier: string): void {
  try { schtasksExec(['/delete', '/tn', identifier, '/f']); } catch { }
  try { unlinkSync(taskBatPath(identifier)); } catch { }
}

function removeAllTasksOnWindows(): void {
  try {
    const out = schtasksExec(['/query', '/fo', 'CSV', '/nh']);
    const lines = out.split('\n').filter(l => l.includes('LionFix_'));
    for (const line of lines) {
      const taskName = line.split(',')[0]?.replace(/"/g, '').trim();
      if (taskName) {
        try { schtasksExec(['/delete', '/tn', taskName, '/f']); } catch { }
      }
    }
  } catch { }
}

function listTasksOnWindows(): string[] {
  try {
    const out = schtasksExec(['/query', '/fo', 'CSV', '/nh']);
    return out.split('\n')
      .filter(l => l.includes('LionFix_'))
      .map(l => {
        const cols = l.split(',');
        const name = cols[0]?.replace(/"/g, '').trim() || '';
        const schedule = cols[1]?.replace(/"/g, '').trim() || '';
        const status = cols[2]?.replace(/"/g, '').trim() || '';
        const nextRun = cols[3]?.replace(/"/g, '').trim() || '';
        return `${name} | ${schedule} | ${status} | Próxima: ${nextRun}`;
      });
  } catch {
    return [];
  }
}

export function installCronTask(schedule: string, command: string, identifier: string): void {
  checkSchedulerOrThrow();
  if (process.platform === 'win32') {
    installTaskOnWindows(schedule, command, identifier);
  } else {
    installCronOnUnix(schedule, command, identifier);
  }
}

export function removeCronTask(identifier: string): void {
  checkSchedulerOrThrow();
  if (process.platform === 'win32') {
    removeTaskOnWindows(identifier);
  } else {
    const existing = getCronContent();
    const filtered = existing.split('\n').filter(l => !l.includes(identifier)).join('\n');
    applyCron(filtered);
  }
}

export function removeAllLionFixTasks(): void {
  checkSchedulerOrThrow();
  if (process.platform === 'win32') {
    removeAllTasksOnWindows();
  } else {
    const existing = getCronContent();
    const filtered = existing.split('\n').filter(l => !l.includes('# LionFix')).join('\n');
    applyCron(filtered);
  }
}

export function listCronTasks(): string[] {
  checkSchedulerOrThrow();
  if (process.platform === 'win32') {
    return listTasksOnWindows();
  }
  const existing = getCronContent();
  return existing.split('\n').filter(l => l.includes('# LionFix'));
}

export function isCronAvailable(): boolean {
  if (process.platform === 'win32') {
    return isWindowsSchedulerAvailable();
  }
  try {
    execSync('command -v crontab', { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}
