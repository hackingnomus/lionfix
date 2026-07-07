import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, Newline } from 'ink';
import type { Config } from '../config/index.js';
import { detectPlatform, detectUSBDrives, scanUSBDrive, copyFromUSB } from '../core/usb.js';
import { logActivity } from '../core/logger.js';
import { join } from 'node:path';

interface Props { config: Config; onBack: () => void; }

interface DriveInfo { path: string; isos: number; tools: number; drivers: number; total: number; }

export function USBView({ config, onBack }: Props) {
  const [scanning, setScanning] = useState(false);
  const [copying, setCopying] = useState(false);
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [cursor, setCursor] = useState(0);
  const [message, setMessage] = useState('');

  const startScan = useCallback(async () => {
    setScanning(true);
    setMessage('');
    try {
      const plat = detectPlatform();
      const paths = detectUSBDrives(plat);
      const results: DriveInfo[] = [];
      for (const p of paths) {
        const info = await scanUSBDrive(p);
        results.push({ path: p, ...info });
      }
      setDrives(results);
      setCursor(0);
    } catch (e) {
      setMessage(`Error escaneando USB: ${e instanceof Error ? e.message : String(e)}`);
    }
    setScanning(false);
  }, []);

  const handleCopy = useCallback(() => {
    if (drives.length === 0 || copying) return;
    setCopying(true);
    setMessage('Copiando archivos...');
    setTimeout(() => {
      try {
        const drive = drives[cursor].path;
        const dest = join(config.INVENTARIO_RAIZ, 'por_clasificar');
        const { copied, skipped } = copyFromUSB(drive, dest);
        if (copied > 0) {
          logActivity(config.INVENTARIO_RAIZ, config.TECNICO, 'importar_usb', drive, '*', 'OK');
        }
        setMessage(`✓ Copia completada. Copiados: ${copied}, Omitidos: ${skipped}`);
      } catch (e) {
        setMessage(`Error copiando: ${e instanceof Error ? e.message : String(e)}`);
      }
      setCopying(false);
    }, 100);
  }, [drives, cursor, copying, config]);

  useInput((input, key) => {
    if (key.escape) {
      if (!copying && !scanning) onBack();
      return;
    }
    if (scanning || copying) return;
    
    if (input === 's') startScan();
    if (input === 'c') handleCopy();
    if (key.upArrow) setCursor(Math.max(0, cursor - 1));
    if (key.downArrow) setCursor(Math.min(drives.length - 1, cursor + 1));
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="yellow">Escáner USB</Text>
      <Newline />
      {scanning ? (
        <Text>Escaneando unidades USB...</Text>
      ) : copying ? (
        <Text color="cyan">{message}</Text>
      ) : drives.length === 0 ? (
        <Box flexDirection="column">
          <Text>No se han escaneado unidades.</Text>
          <Newline />
          {message && <Text color="green">{message}</Text>}
          <Text color="green">[S] Escanear ahora</Text>
        </Box>
      ) : (
        drives.map((d, i) => (
          <Box key={i} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={i === cursor ? 'green' : 'white'}>{i === cursor ? '▸ ' : '  '}</Text>
              <Text bold color={i === cursor ? 'cyan' : 'white'}>{d.path}</Text>
            </Box>
            <Text dimColor>    ISOs:         {d.isos}</Text>
            <Text dimColor>    Herramientas: {d.tools}</Text>
            <Text dimColor>    Drivers:      {d.drivers}</Text>
            <Text dimColor>    Total:        {d.total}</Text>
          </Box>
        ))
      )}
      <Newline />
      {!scanning && !copying && drives.length > 0 && message && (
        <Text color="green">{message}</Text>
      )}
      <Text dimColor>
        {scanning || copying 
          ? 'Por favor espera...' 
          : drives.length > 0 
            ? '[↑↓] Seleccionar  [C] Copiar  [S] Rescanear  [Esc] Volver' 
            : '[S] Escanear  [Esc] Volver'}
      </Text>
    </Box>
  );
}
