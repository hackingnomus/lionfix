import React, { useState, useCallback } from 'react';
import { Box, Text, useInput, Newline } from 'ink';
import type { Config } from '../config/index.js';
import { classifyFile, getPendingFiles, resolveCollision, calculateFileHash, findInventoryDuplicates } from '../core/organizer.js';
import { join, extname } from 'node:path';
import { existsSync, mkdirSync, renameSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { checkFileIntegrity, parseHashDB, serializeHashDB } from '../core/integrity.js';
import { logActivity, readLog, parseLog } from '../core/logger.js';
import { generateXLSX } from '../core/export.js';
import { createBackup, listBackups } from '../core/backup.js';

interface Props { config: Config; onBack: () => void; }

type Step = 'menu' | 'running' | 'done';

export function QuickAssistantView({ config, onBack }: Props) {
  const [step, setStep] = useState<Step>('menu');
  const [mode, setMode] = useState<'organize-verify' | 'export' | 'backup'>('organize-verify');
  const [log, setLog] = useState<string[]>([]);

  const runOrganizeVerify = useCallback(async () => {
    setStep('running');
    const root = config.INVENTARIO_RAIZ;
    const lines: string[] = [];

    // 1. Organize
    const porClasificar = join(root, 'por_clasificar');
    if (existsSync(porClasificar)) {
      const files = getPendingFiles(porClasificar);
      if (files.length > 0) {
        lines.push(`Organizando ${files.length} archivos...`);
        let ok = 0, dup = 0, col = 0;
        for (const f of files) {
          const src = join(porClasificar, f);
          const ext = extname(f).slice(1);
          const category = classifyFile(f, ext);
          const destDir = join(root, category);
          mkdirSync(destDir, { recursive: true });
          let dest = join(destDir, f);
          try {
            const srcHash = await calculateFileHash(src);
            const existingDuplicates = await findInventoryDuplicates(root, srcHash, f);
            if (existingDuplicates.length > 0) {
              try { unlinkSync(src); } catch { }
              dup++;
              continue;
            }
            if (existsSync(dest)) {
              dest = join(destDir, resolveCollision(destDir, f));
              col++;
            }
            renameSync(src, dest);
            ok++;
          } catch { }
        }
        logActivity(root, config.TECNICO, 'organizar', `${ok} clasificados, ${dup} duplicados, ${col} colisiones`, '*', `OK:${ok}_DUP:${dup}_COL:${col}`);
        lines.push(`  ✓ ${ok} clasificados  Dup:${dup}  Col:${col}`);
      } else {
        lines.push('  Sin archivos pendientes');
      }
    }

    // 2. Verify
    lines.push('Verificando integridad SHA-256...');
    const hashDbPath = join(root, '.hashes.sha256');
    const prevHashDb = existsSync(hashDbPath) ? readFileSync(hashDbPath, 'utf-8') : '';
    const cache = parseHashDB(prevHashDb);
    const newCache = new Map<string, { hash: string; mtime: number; size: number }>();
    let ok = 0, corrupto = 0, nuevo = 0;

    async function walk(dir: string, prefix: string) {
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith('.') || entry === 'backups') continue;
        const full = join(dir, entry);
        const rel = prefix ? `${prefix}/${entry}` : entry;
        if (statSync(full).isDirectory()) { await walk(full, rel); continue; }
        const result = await checkFileIntegrity(full, rel, cache.get(rel));
        if (result.status === 'OK') ok++;
        else if (result.status === 'CORRUPTO') corrupto++;
        else nuevo++;
        newCache.set(rel, { hash: result.hash, mtime: result.mtime, size: result.size });
      }
    }
    await walk(root, '');
    writeFileSync(hashDbPath, serializeHashDB(newCache), 'utf-8');
    lines.push(`  ✓ OK:${ok}  CORRUPTO:${corrupto}  NUEVO:${nuevo}`);

    // 3. Export report
    lines.push('Generando informe...');
    const entries = parseLog(readLog(root));
    const reportPath = join(root, `informe_rapido_${Date.now()}.xlsx`);
    try { await generateXLSX(entries, reportPath); lines.push(`  ✓ ${reportPath}`); }
    catch { lines.push('  ✗ Error generando XLSX'); }

    setLog(lines);
    setStep('done');
  }, [config]);

  const runExport = useCallback(async () => {
    setStep('running');
    const root = config.INVENTARIO_RAIZ;
    const lines: string[] = [];
    const entries = parseLog(readLog(root));
    const reportPath = join(root, `informe_rapido_${Date.now()}.xlsx`);
    try {
      await generateXLSX(entries, reportPath);
      lines.push(`✓ Exportado: ${reportPath}`);
    } catch { lines.push('✗ Error exportando'); }
    setLog(lines);
    setStep('done');
  }, [config]);

  const runBackup = useCallback(async () => {
    setStep('running');
    const root = config.INVENTARIO_RAIZ;
    const lines: string[] = [];
    try {
      const result = await createBackup(root, config.TECNICO);
      lines.push(`✓ Backup: ${result.path} (${result.size})`);
    } catch { lines.push('✗ Error creando backup'); }
    setLog(lines);
    setStep('done');
  }, [config]);

  const start = useCallback((m: 'organize-verify' | 'export' | 'backup') => {
    setMode(m);
    if (m === 'organize-verify') runOrganizeVerify();
    else if (m === 'export') runExport();
    else runBackup();
  }, [runOrganizeVerify, runExport, runBackup]);

  useInput((input, key) => {
    if (key.escape) { if (step === 'done') setStep('menu'); else onBack(); return; }
    if (step === 'menu') {
      if (input === 'o') start('organize-verify');
      if (input === 'e') start('export');
      if (input === 'b') start('backup');
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="yellow">Asistente Rápido</Text>
      <Newline />
      {step === 'menu' && (
        <Box flexDirection="column">
          <Text>Flujos predefinidos:</Text>
          <Newline />
          <Box><Text color="green">[O]</Text><Text> Organizar + Verificar + Informe</Text></Box>
          <Box><Text color="green">[E]</Text><Text> Exportar actividades a Excel</Text></Box>
          <Box><Text color="green">[B]</Text><Text> Crear backup ahora</Text></Box>
        </Box>
      )}
      {step === 'running' && <Text>Procesando...</Text>}
      {step === 'done' && (
        <Box flexDirection="column">
          {log.map((l, i) => <Text key={i}>{l}</Text>)}
          <Newline />
          <Text dimColor>[Esc] Volver al menú</Text>
        </Box>
      )}
      <Newline />
      <Text dimColor>[O] Organizar+Verificar  [E] Exportar  [B] Backup  [Esc] Volver</Text>
    </Box>
  );
}
