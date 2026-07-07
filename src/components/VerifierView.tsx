import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, Newline } from 'ink';
import type { Config } from '../config/index.js';
import { checkFileIntegrity, parseHashDB, serializeHashDB, readFileStat } from '../core/integrity.js';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { moveToTrash } from '../core/trash.js';
import { logActivity } from '../core/logger.js';

interface Props { config: Config; onBack: () => void; }

interface CorruptFile {
  full: string;
  rel: string;
}

export function VerifierView({ config, onBack }: Props) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{ ok: number; corrupto: number; nuevo: number; total: number } | null>(null);
  const [lastFile, setLastFile] = useState('');
  const [corruptFiles, setCorruptFiles] = useState<CorruptFile[]>([]);
  const [corruptAction, setCorruptAction] = useState<'none' | 'prompt' | 'done'>('none');

  const startVerify = useCallback(async (full: boolean) => {
    setRunning(true);
    setResults(null);
    setCorruptFiles([]);
    setCorruptAction('none');
    const root = config.INVENTARIO_RAIZ;
    const hashDbPath = join(root, '.hashes.sha256');
    const prevHashDb = existsSync(hashDbPath) ? readFileSync(hashDbPath, 'utf-8') : '';
    const cache = parseHashDB(prevHashDb);
    const newCache = new Map<string, { hash: string; mtime: number; size: number }>();
    let ok = 0; let corrupto = 0; let nuevo = 0;
    const corruptList: CorruptFile[] = [];

    async function walk(dir: string, prefix: string) {
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith('.') || entry === 'backups') continue;
        const fullPath = join(dir, entry);
        const rel = prefix ? `${prefix}/${entry}` : entry;
        if (statSync(fullPath).isDirectory()) {
          await walk(fullPath, rel);
        } else {
          setLastFile(rel);
          const cachedEntry = full ? undefined : cache.get(rel);
          const result = await checkFileIntegrity(fullPath, rel, cachedEntry);
          if (result.status === 'OK') ok++;
          else if (result.status === 'CORRUPTO') { corrupto++; corruptList.push({ full: fullPath, rel }); }
          else nuevo++;
          newCache.set(rel, { hash: result.hash, mtime: result.mtime, size: result.size });
        }
      }
    }

    await walk(root, '');
    writeFileSync(hashDbPath, serializeHashDB(newCache), 'utf-8');
    setResults({ ok, corrupto, nuevo, total: ok + corrupto + nuevo });
    setCorruptFiles(corruptList);
    setCorruptAction(corruptList.length > 0 ? 'prompt' : 'none');
    setRunning(false);
  }, [config.INVENTARIO_RAIZ]);

  const handleCorruptAction = useCallback((action: 't' | 's' | 'i') => {
    const root = config.INVENTARIO_RAIZ;
    const hashDbPath = join(root, '.hashes.sha256');
    const prevHashDb = existsSync(hashDbPath) ? readFileSync(hashDbPath, 'utf-8') : '';
    const cache = parseHashDB(prevHashDb);

    if (action === 't') {
      for (const cf of corruptFiles) {
        const trashPath = moveToTrash(cf.full, root, config.TECNICO);
        if (trashPath) {
          cache.delete(cf.rel);
        }
      }
      logActivity(root, config.TECNICO, 'mover_papelera', `${corruptFiles.length} archivos corruptos`, '*', 'CORRUPTO_HASH');
      writeFileSync(hashDbPath, serializeHashDB(cache), 'utf-8');
    }
    
    setCorruptAction('done');
  }, [config, corruptFiles]);

  useInput((input, key) => {
    if (key.escape) {
      if (corruptAction === 'prompt') { setCorruptAction('done'); return; }
      onBack(); return;
    }
    if (corruptAction === 'prompt') {
      if (input === 't') { handleCorruptAction('t'); return; }
      if (input === 's') { handleCorruptAction('s'); return; }
      if (input === 'i') { handleCorruptAction('i'); return; }
      return;
    }
    if (input === 'v' && !running) startVerify(false);
    if (input === 'f' && !running) startVerify(true);
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="yellow">Verificador de Integridad SHA-256</Text>
      <Newline />
      {running ? (
        <Box flexDirection="column">
          <Text>Verificando...</Text>
          <Text dimColor>{lastFile}</Text>
        </Box>
      ) : results ? (
        <Box flexDirection="column">
          <Text bold>Resultados:</Text>
          <Text color="green">  OK:       {results.ok}</Text>
          <Text color={results.corrupto > 0 ? 'red' : 'green'}>  CORRUPTO: {results.corrupto}</Text>
          <Text color="yellow">  NUEVO:    {results.nuevo}</Text>
          <Text>  Total:    {results.total}</Text>

          {corruptAction === 'prompt' && (
            <Box flexDirection="column" marginTop={1}>
              <Newline />
              <Text color="red">⚠ Archivos corruptos detectados:</Text>
              {corruptFiles.map((cf, i) => (
                <Text key={i} dimColor>  {cf.rel}</Text>
              ))}
              <Newline />
              <Text bold>Opciones:</Text>
              <Box><Text color="green">[T]</Text><Text> Mover TODOS a la papelera</Text></Box>
              <Box><Text color="green">[S]</Text><Text> Saltar (mantener en registro)</Text></Box>
              <Box><Text color="green">[I]</Text><Text> Ignorar</Text></Box>
            </Box>
          )}

          {corruptAction === 'done' && results.corrupto > 0 && (
            <Text color="yellow">✓ Corruptos procesados.</Text>
          )}
        </Box>
      ) : (
        <Text>Presiona [V] para verificar o [F] para verificación completa.</Text>
      )}
      <Newline />
      <Text dimColor>{corruptAction === 'prompt' ? '[T] Papelera  [S] Saltar  [I] Ignorar' : '[V] Verificar  [F] Forzar completo  [Esc] Volver'}</Text>
    </Box>
  );
}
