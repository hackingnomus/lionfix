import React, { useState, useCallback } from 'react';
import { Box, Text, useInput, Newline } from 'ink';
import type { Config } from '../config/index.js';
import { readLog, parseLog, LogEntry, logActivity } from '../core/logger.js';
import { generateXLSX, generatePDF, generateTXTReport } from '../core/export.js';
import { join } from 'node:path';

interface Props { config: Config; onBack: () => void; }

export function ReportsView({ config, onBack }: Props) {
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');
  
  // States for manual log
  const [manualMode, setManualMode] = useState(false);
  const [logStep, setLogStep] = useState<'operacion' | 'archivo'>('operacion');
  const [operacion, setOperacion] = useState('');
  const [archivo, setArchivo] = useState('');

  const generate = useCallback(async (tipo: string) => {
    setGenerating(true);
    setMessage('');
    const root = config.INVENTARIO_RAIZ;
    const csv = readLog(root);
    const entries = parseLog(csv);
    const output = join(root, `informe_${Date.now()}.${tipo}`);
    const title = `LionFix - Informe de Actividades (${new Date().toLocaleDateString()})`;

    try {
      if (tipo === 'xlsx') await generateXLSX(entries, output);
      else if (tipo === 'pdf') await generatePDF(title, entries, output);
      else generateTXTReport(title, entries, output);
      logActivity(root, config.TECNICO, `exportar_${tipo}`, output, '*', 'OK');
      setMessage(`✓ Exportado: ${output}`);
    } catch (e) {
      setMessage(`✗ Error: ${(e as Error).message}`);
    }
    setGenerating(false);
  }, [config]);

  useInput((input, key) => {
    if (key.escape) {
      if (manualMode) {
        setManualMode(false);
        setOperacion('');
        setArchivo('');
        return;
      }
      onBack();
      return;
    }

    if (manualMode) {
      if (logStep === 'operacion') {
        if (key.return) {
          if (operacion.trim()) setLogStep('archivo');
          return;
        }
        if (key.backspace || key.delete) setOperacion(operacion.slice(0, -1));
        else if (input.length === 1) setOperacion(operacion + input);
      } else if (logStep === 'archivo') {
        if (key.return) {
          if (archivo.trim()) {
            logActivity(config.INVENTARIO_RAIZ, config.TECNICO, operacion.trim(), archivo.trim(), '*', 'OK');
            setMessage('✓ Actividad registrada manualmente.');
            setManualMode(false);
            setOperacion('');
            setArchivo('');
          }
          return;
        }
        if (key.backspace || key.delete) setArchivo(archivo.slice(0, -1));
        else if (input.length === 1) setArchivo(archivo + input);
      }
      return;
    }

    if (!generating) {
      if (input === 't') generate('txt');
      if (input === 'x') generate('xlsx');
      if (input === 'p') generate('pdf');
      if (input === 'r') {
        setManualMode(true);
        setLogStep('operacion');
        setMessage('');
        setOperacion('');
        setArchivo('');
      }
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="yellow">Informes y Exportación</Text>
      <Newline />
      {generating ? (
        <Text>Generando informe...</Text>
      ) : manualMode ? (
        <Box flexDirection="column">
          <Text dimColor>Registrar Actividad Manual</Text>
          <Newline />
          {logStep === 'operacion' ? (
            <Box>
              <Text>Operación (ej. limpieza_física): </Text>
              <Text color="cyan">{operacion}_</Text>
            </Box>
          ) : (
            <Box>
              <Text>Archivo / Detalle (ej. PC-01-Mantenimiento): </Text>
              <Text color="cyan">{archivo}_</Text>
            </Box>
          )}
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box><Text color="green">[T]</Text><Text> Exportar a TXT</Text></Box>
          <Box><Text color="green">[X]</Text><Text> Exportar a Excel</Text></Box>
          <Box><Text color="green">[P]</Text><Text> Exportar a PDF</Text></Box>
          <Box><Text color="green">[R]</Text><Text> Registrar actividad manualmente</Text></Box>
        </Box>
      )}
      <Newline />
      {message && <Text>{message}</Text>}
      <Text dimColor>
        {manualMode 
          ? '[Enter] Continuar  [Esc] Cancelar' 
          : '[T] TXT  [X] Excel  [P] PDF  [R] Registrar Manual  [Esc] Volver'}
      </Text>
    </Box>
  );
}
