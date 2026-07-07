import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, Newline } from 'ink';
import type { Config } from '../config/index.js';
import { runDiagnostics, DiagnosticResult } from '../core/diagnostics.js';

interface Props { config: Config; onBack: () => void; }

export function DiagnosticsView({ config, onBack }: Props) {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    setTimeout(() => {
      try {
        const res = runDiagnostics(config.INVENTARIO_RAIZ);
        setResults(res);
      } catch (e) {
        setResults([{ check: 'Error', status: 'error', message: `Diagnóstico falló: ${e instanceof Error ? e.message : String(e)}` }]);
      }
      setRunning(false);
    }, 100);
  }, [config.INVENTARIO_RAIZ]);

  useInput((input, key) => {
    if (key.escape || key.return) {
      if (!running) onBack();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="yellow">Autodiagnóstico del Sistema</Text>
      <Newline />
      {running ? (
        <Text>Ejecutando pruebas...</Text>
      ) : (
        <Box flexDirection="column">
          {results.map((res, i) => (
            <Box key={i}>
              <Text color={res.status === 'ok' ? 'green' : res.status === 'warn' ? 'yellow' : 'red'}>
                {res.status === 'ok' ? '✓' : res.status === 'warn' ? '⚠' : '✗'} 
              </Text>
              <Text> {res.check.padEnd(20)} </Text>
              <Text dimColor>{res.message}</Text>
            </Box>
          ))}
        </Box>
      )}
      <Newline />
      <Text dimColor>[Enter/Esc] Volver</Text>
    </Box>
  );
}
