import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, Newline } from 'ink';
import type { Config } from '../config/index.js';
import { getPendingFiles, classifyFile, resolveCollision, calculateFileHash, findInventoryDuplicates } from '../core/organizer.js';
import { join, extname } from 'node:path';
import { existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { logActivity } from '../core/logger.js';

interface Props { config: Config; onBack: () => void; }

export function OrganizerView({ config, onBack }: Props) {
  const [files, setFiles] = useState<{ name: string; category: string; dup?: boolean }[]>([]);
  const [status, setStatus] = useState<string>('');
  const [cursor, setCursor] = useState(0);

  const refresh = useCallback(() => {
    const porClasificar = join(config.INVENTARIO_RAIZ, 'por_clasificar');
    const raw = getPendingFiles(porClasificar);
    setFiles(raw.map(f => {
      const ext = extname(f).slice(1);
      return { name: f, category: classifyFile(f, ext) };
    }));
  }, [config.INVENTARIO_RAIZ]);

  useEffect(() => { refresh(); }, []);

  useInput(async (input, key) => {
    if (key.escape) { onBack(); return; }
    if (key.upArrow) { setCursor(Math.max(0, cursor - 1)); return; }
    if (key.downArrow) { setCursor(Math.min(files.length - 1, cursor + 1)); return; }
    if (key.return && files.length > 0) {
      const f = files[cursor];
      const src = join(config.INVENTARIO_RAIZ, 'por_clasificar', f.name);
      const destDir = join(config.INVENTARIO_RAIZ, f.category);
      mkdirSync(destDir, { recursive: true });
      let dest = join(destDir, f.name);
      try {
        // Duplicate detection
        const srcHash = await calculateFileHash(src);
        const existingDuplicates = await findInventoryDuplicates(config.INVENTARIO_RAIZ, srcHash, f.name);
        if (existingDuplicates.length > 0) {
          try { unlinkSync(src); } catch { }
          logActivity(config.INVENTARIO_RAIZ, config.TECNICO, 'organizar', f.name, '*', 'DUPLICADO');
          setStatus(`ℹ ${f.name} → duplicado (eliminado)`);
          refresh();
          setCursor(0);
          return;
        }
        if (existsSync(dest)) {
          const newName = resolveCollision(destDir, f.name);
          dest = join(destDir, newName);
          setStatus(`~ ${f.name} → ${f.category}/ (colisión, renombrado a ${newName})`);
        }
        renameSync(src, dest);
        logActivity(config.INVENTARIO_RAIZ, config.TECNICO, 'organizar', dest, '*', 'OK');
        setStatus(`✓ ${f.name} → ${f.category}/`);
        refresh();
        setCursor(0);
      } catch (e) {
        setStatus(`✗ ${(e as Error).message}`);
      }
      return;
    }
    if (input === 'a') {
      const porClasificar = join(config.INVENTARIO_RAIZ, 'por_clasificar');
      let ok = 0; let err = 0; let dup = 0; let col = 0;
      for (const f of files) {
        const src = join(porClasificar, f.name);
        const destDir = join(config.INVENTARIO_RAIZ, f.category);
        mkdirSync(destDir, { recursive: true });
        let dest = join(destDir, f.name);
        try {
          const srcHash = await calculateFileHash(src);
          const existingDuplicates = await findInventoryDuplicates(config.INVENTARIO_RAIZ, srcHash, f.name);
          if (existingDuplicates.length > 0) {
            try { unlinkSync(src); } catch { }
            dup++;
            continue;
          }
          if (existsSync(dest)) {
            dest = join(destDir, resolveCollision(destDir, f.name));
            col++;
          }
          renameSync(src, dest);
          ok++;
        } catch { err++; }
      }
      logActivity(config.INVENTARIO_RAIZ, config.TECNICO, 'organizar', `${ok} clasificados, ${dup} duplicados, ${col} colisiones`, '*', `OK:${ok}_DUP:${dup}_COL:${col}`);
      setStatus(`OK: ${ok}  Duplicados: ${dup}  Colisiones: ${col}  Errores: ${err}`);
      refresh();
      setCursor(0);
      return;
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="yellow">Organizador de Archivos</Text>
      <Text dimColor>{config.INVENTARIO_RAIZ}/por_clasificar/</Text>
      <Newline />
      {files.length === 0 ? (
        <Text>No hay archivos pendientes.</Text>
      ) : (
        files.map((f, i) => (
          <Box key={f.name}>
            <Text color={i === cursor ? 'green' : 'white'}>{i === cursor ? '▸' : ' '} </Text>
            <Text color={i === cursor ? 'green' : 'white'}>{f.name}</Text>
            <Text dimColor> → {f.category}/</Text>
          </Box>
        ))
      )}
      <Newline />
      {status && <Text>{status}</Text>}
      <Text dimColor>[Enter] Clasificar  [A] Clasificar todos  [Esc] Volver</Text>
    </Box>
  );
}
