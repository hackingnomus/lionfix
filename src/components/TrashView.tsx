import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, Newline } from 'ink';
import type { Config } from '../config/index.js';
import { listTrash, emptyTrash, restoreFromTrash, TrashEntry } from '../core/trash.js';
import { logActivity } from '../core/logger.js';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

interface Props { config: Config; onBack: () => void; }

export function TrashView({ config, onBack }: Props) {
  const [items, setItems] = useState<TrashEntry[]>([]);
  const [cursor, setCursor] = useState(0);
  const [message, setMessage] = useState('');

  const refresh = useCallback(() => {
    setItems(listTrash(config.INVENTARIO_RAIZ));
  }, [config.INVENTARIO_RAIZ]);

  useEffect(() => { refresh(); }, []);

  useInput((input, key) => {
    if (key.escape) { onBack(); return; }
    if (key.upArrow) { setCursor(Math.max(0, cursor - 1)); return; }
    if (key.downArrow) { setCursor(Math.min(items.length - 1, cursor + 1)); return; }
    if (key.return && items.length > 0) {
      const trashFileName = `${items[cursor].nombre_original}`;
      const trashFiles = readdirSync(join(config.INVENTARIO_RAIZ, '.papelera', 'archivos'));
      const match = trashFiles.find((f: string) => f.endsWith(`_${items[cursor].nombre_original}`));
      if (match && restoreFromTrash(match, config.INVENTARIO_RAIZ, config.TECNICO)) {
        logActivity(config.INVENTARIO_RAIZ, config.TECNICO, 'restaurar', items[cursor].ruta_original, '*', 'OK');
        setMessage(`✓ Restaurado: ${items[cursor].nombre_original}`);
        refresh();
        setCursor(0);
      } else {
        setMessage('✗ Error al restaurar');
      }
      return;
    }
    if (input === 'v' && items.length > 0) {
      const count = emptyTrash(config.INVENTARIO_RAIZ);
      setMessage(`✓ Papelera vaciada: ${count} elementos`);
      refresh();
      setCursor(0);
      return;
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="yellow">Papelera de Reciclaje</Text>
      <Newline />
      {items.length === 0 ? (
        <Text>Papelera vacía.</Text>
      ) : (
        items.map((item, i) => (
          <Box key={i} flexDirection="column">
            <Box>
              <Text color={i === cursor ? 'green' : 'white'}>{i === cursor ? '▸' : ' '}</Text>
              <Text color={i === cursor ? 'green' : 'white'}>{item.nombre_original}</Text>
              <Text dimColor> ({item.fecha})</Text>
            </Box>
            <Text dimColor>   Original: {item.ruta_original}</Text>
          </Box>
        ))
      )}
      <Newline />
      {message && <Text>{message}</Text>}
      <Text dimColor>[Enter] Restaurar  [V] Vaciar papelera  [Esc] Volver</Text>
    </Box>
  );
}
