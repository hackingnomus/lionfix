import React, { useState } from 'react';
import { Box, Text, useInput, Newline } from 'ink';
import type { Config } from '../config/index.js';
import { saveConfig } from '../config/index.js';
import { logMovementToExcel } from '../core/users-excel.js';

interface Props { config: Config; onBack: () => void; }

type ConfigKey = keyof Config;
const configKeys: ConfigKey[] = [
  'INVENTARIO_RAIZ',
  'TECNICO',
  'USAR_DOBLE_HASH',
  'UMBRAL_DISCO_GB',
  'DOWNLOADS_DIR',
  'PORTABLE_MODE',
  'EXCEL_USERS_PATH',
  'AI_API_KEY',
  'AI_MODEL',
  'AI_BASE_URL',
];

export function ConfigView({ config, onBack }: Props) {
  const [cursor, setCursor] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [localConfig, setLocalConfig] = useState<Config>(config);
  const [message, setMessage] = useState('');

  useInput((input, key) => {
    if (key.escape) {
      if (editing) { setEditing(false); return; }
      onBack(); return;
    }

    if (editing) {
      if (key.return) {
        const prop = configKeys[cursor];
        saveConfig(prop, editValue);
        setLocalConfig({ ...localConfig, [prop]: editValue });
        logMovementToExcel(localConfig.INVENTARIO_RAIZ, localConfig.TECNICO, 'config_cambiar', `${prop}=${editValue}`, 'ConfigView').catch(() => {});
        setMessage(`Guardado: ${prop}`);
        setEditing(false);
        return;
      }
      if (key.backspace || key.delete) setEditValue(editValue.slice(0, -1));
      else if (input.length === 1) setEditValue(editValue + input);
      return;
    }

    if (key.upArrow) setCursor(Math.max(0, cursor - 1));
    if (key.downArrow) setCursor(Math.min(configKeys.length - 1, cursor + 1));
    if (key.return) {
      setEditValue(localConfig[configKeys[cursor]] || '');
      setEditing(true);
      setMessage('');
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="yellow">Configuración del Sistema</Text>
      <Newline />
      {configKeys.map((k, i) => (
        <Box key={k}>
          <Text color={i === cursor ? 'green' : 'white'}>{i === cursor ? '▸' : ' '}</Text>
          <Text bold={i === cursor} color="cyan">{k.padEnd(20)}</Text>
          {editing && i === cursor ? (
            <Text> {editValue}_</Text>
          ) : (
            <Text> {localConfig[k]}</Text>
          )}
        </Box>
      ))}
      <Newline />
      {message && <Text color="green">{message}</Text>}
      <Text dimColor>
        {editing ? '[Enter] Guardar  [Esc] Cancelar' : '[↑↓] Navegar  [Enter] Editar  [Esc] Volver'}
      </Text>
    </Box>
  );
}
