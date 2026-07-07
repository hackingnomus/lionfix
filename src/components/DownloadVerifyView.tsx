import React, { useState } from 'react';
import { Box, Text, useInput, Newline } from 'ink';
import type { Config } from '../config/index.js';
import { verifyDownload } from '../core/download-verify.js';

interface Props { config: Config; onBack: () => void; }

export function DownloadVerifyView({ config, onBack }: Props) {
  const [filePath, setFilePath] = useState('');
  const [result, setResult] = useState<{ ok: boolean; reason?: string } | null>(null);

  useInput((input, key) => {
    if (key.escape) { onBack(); return; }
    if (key.return && filePath) {
      const r = verifyDownload(filePath);
      setResult(r);
      return;
    }
    if (input === 'b' && !filePath) { setFilePath(''); setResult(null); return; }
    if (input.length === 1 && !key.return && !key.escape) {
      setFilePath(prev => prev + input);
      setResult(null); 
    }
    if (key.backspace || key.delete) {
      setFilePath(prev => prev.slice(0, -1));
      setResult(null); 
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="yellow">Verificar Descarga</Text>
      <Newline />
      <Text>Ruta del archivo:</Text>
      <Text color="cyan">[{filePath || 'escribe la ruta...'}]</Text>
      <Newline />
      {result && (
        <Box flexDirection="column">
          {result.ok ? (
            <Text color="green">✓ Archivo válido</Text>
          ) : (
            <Text color="red">✗ {result.reason}</Text>
          )}
        </Box>
      )}
      <Newline />
      <Text dimColor>[Enter] Verificar  [B] Borrar  [Esc] Volver</Text>
    </Box>
  );
}
