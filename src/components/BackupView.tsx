import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, Newline } from 'ink';
import type { Config } from '../config/index.js';
import { createBackup, listBackups, restoreBackup } from '../core/backup.js';
import { basename, join } from 'node:path';
import { existsSync, statSync } from 'node:fs';

interface Props { config: Config; onBack: () => void; }

export function BackupView({ config, onBack }: Props) {
  const [view, setView] = useState<'menu' | 'list' | 'creating'>('menu');
  const [backups, setBackups] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const refreshList = useCallback(() => {
    setBackups(listBackups(config.INVENTARIO_RAIZ));
  }, [config.INVENTARIO_RAIZ]);

  useEffect(() => { if (view === 'list') refreshList(); }, [view]);

  useInput(async (input, key) => {
    if (key.escape) {
      if (view === 'list') setView('menu');
      else onBack();
      return;
    }
    if (key.upArrow) { setCursor(Math.max(0, cursor - 1)); return; }
    if (key.downArrow) { setCursor(Math.min(backups.length - 1, cursor + 1)); return; }

    if (view === 'menu') {
      if (input === 'c') {
        setView('creating');
        setLoading(true);
        setMessage('');
        try {
          const result = await createBackup(config.INVENTARIO_RAIZ, config.TECNICO);
          setMessage(`✓ Backup creado: ${basename(result.path)} (${result.size})`);
        } catch (e) { setMessage(`✗ Error: ${(e as Error).message}`); }
        setLoading(false);
        setView('menu');
      }
      if (input === 'r') {
        refreshList();
        setView('list');
        setCursor(0);
      }
      return;
    }

    if (view === 'list' && key.return && backups.length > 0) {
      const selected = backups[cursor];
      try {
        await restoreBackup(selected, config.INVENTARIO_RAIZ, config.TECNICO);
        setMessage(`✓ Restaurado: ${basename(selected)}`);
      } catch (e) { setMessage(`✗ Error: ${(e as Error).message}`); }
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="yellow">Backup / Restaurar</Text>
      <Newline />
      {view === 'menu' && (
        <Box flexDirection="column">
          {loading && <Text>Creando backup...</Text>}
          {message && <Text>{message}</Text>}
          <Newline />
          <Box><Text color="green">[C]</Text><Text> Crear backup</Text></Box>
          <Box><Text color="green">[R]</Text><Text> Restaurar backup</Text></Box>
        </Box>
      )}
      {view === 'list' && (
        <Box flexDirection="column">
          {backups.length === 0 ? (
            <Text>No hay backups disponibles.</Text>
          ) : (
            backups.map((b, i) => {
              const size = existsSync(b) ? statSync(b).size : 0;
              const sizeStr = size > 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${(size / 1024).toFixed(1)} KB`;
              return (
                <Box key={i}>
                  <Text color={i === cursor ? 'green' : 'white'}>{i === cursor ? '▸' : ' '}</Text>
                  <Text>{basename(b)}</Text>
                  <Text dimColor> ({sizeStr})</Text>
                </Box>
              );
            })
          )}
          {message && <Text>{message}</Text>}
        </Box>
      )}
      <Newline />
      <Text dimColor>[C] Crear  [R] Restaurar  [Enter] Seleccionar  [Esc] Volver</Text>
    </Box>
  );
}
