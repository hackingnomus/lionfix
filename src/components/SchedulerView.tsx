import React, { useState } from 'react';
import { Box, Text, useInput, Newline } from 'ink';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config/index.js';
import { isCronAvailable, listCronTasks, installCronTask, removeAllLionFixTasks, removeCronTask } from '../core/scheduler.js';

interface Props { config: Config; onBack: () => void; }

export function SchedulerView({ config, onBack }: Props) {
  const [message, setMessage] = useState('');

  const available = isCronAvailable();
  const isWin = process.platform === 'win32';
  const binPath = join(process.cwd(), 'bin', 'lionfix.js');
  const runner = existsSync(binPath) ? `node "${binPath}"` : `npx tsx "${join(process.cwd(), 'src/index.ts')}"`;

  const installTask = (schedule: string, task: string, label: string, id: string) => {
    const cmd = `cd "${process.cwd()}" && ${runner} ${task}`;
    installCronTask(schedule, cmd, id);
    setMessage(`✓ ${label} instalada`);
  };

  useInput((input, key) => {
    if (key.escape) { onBack(); return; }
    if (!available) return;

    if (input === 'l') {
      const tasks = listCronTasks();
      if (tasks.length === 0) setMessage('No hay tareas LionFix programadas.');
      else setMessage(tasks.join('\n'));
      return;
    }
    if (input === 'b') installTask('0 2 * * 0', 'backup', 'Backup semanal (dom 2:00)', 'LionFix_backup');
    else if (input === 'v') installTask('0 3 * * 1', 'verify', 'Verificación semanal (lun 3:00)', 'LionFix_verify');
    else if (input === 'p') installTask('0 0 1 * *', 'trash-empty', 'Limpieza papelera mensual (día 1)', 'LionFix_trash_empty');
    else if (input === 'i') installTask('0 5 * * 0', 'export txt', 'Informe semanal TXT (dom 5:00)', 'LionFix_informe_semanal');
    else if (input === 'm') installTask('0 0 1 * *', 'export pdf', 'Informe mensual PDF (día 1)', 'LionFix_informe_mensual');
    else if (input === 'd') {
      removeAllLionFixTasks();
      setMessage('✓ Todas las tareas LionFix eliminadas');
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="yellow">Programar Tareas</Text>
      <Newline />
      {!available ? (
        <Text color="red">⚠ {isWin ? 'Task Scheduler (schtasks)' : 'crontab'} no está disponible en este sistema.</Text>
      ) : (
        <Box flexDirection="column">
          <Box><Text color="green">[L]</Text><Text> Listar tareas programadas</Text></Box>
          <Box><Text color="green">[B]</Text><Text> Programar backup semanal (dom 2:00)</Text></Box>
          <Box><Text color="green">[V]</Text><Text> Programar verificación semanal (lun 3:00)</Text></Box>
          <Box><Text color="green">[P]</Text><Text> Programar limpieza de papelera mensual (día 1)</Text></Box>
          <Box><Text color="green">[I]</Text><Text> Programar informe semanal TXT (dom 5:00)</Text></Box>
          <Box><Text color="green">[M]</Text><Text> Programar informe mensual PDF (día 1)</Text></Box>
          <Box><Text color="red">[D]</Text><Text> Eliminar todas las tareas</Text></Box>
        </Box>
      )}
      <Newline />
      {message && <Text>{message}</Text>}
      <Text dimColor>[L] Listar  [B/V/P/I/M] Instalar  [D] Limpiar  [Esc] Volver</Text>
    </Box>
  );
}
