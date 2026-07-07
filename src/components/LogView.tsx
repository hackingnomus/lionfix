import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, Newline } from 'ink';
import type { Config } from '../config/index.js';
import { readLog, readUserLog, parseLog, LogEntry } from '../core/logger.js';

interface Props {
  config: Config;
  onBack: () => void;
  username?: string; 
}

const PAGE_SIZE = 15;

export function LogView({ config, onBack, username }: Props) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const raw = username ? readUserLog(config.INVENTARIO_RAIZ, username) : readLog(config.INVENTARIO_RAIZ);
    const parsed = parseLog(raw);
    setEntries(parsed.reverse()); 
  }, [config.INVENTARIO_RAIZ, username]);

  const filtered = useMemo(() => {
    if (!search) return entries;
    const lower = search.toLowerCase();
    return entries.filter(e => 
      e.OPERACION.toLowerCase().includes(lower) ||
      e.ARCHIVO.toLowerCase().includes(lower) ||
      e.TECNICO.toLowerCase().includes(lower) ||
      e.RESULTADO.toLowerCase().includes(lower)
    );
  }, [entries, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const currentItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useInput((input, key) => {
    if (key.escape) {
      if (isSearching) {
        setIsSearching(false);
        setSearch('');
        setPage(0);
        return;
      }
      onBack();
      return;
    }

    if (isSearching) {
      if (key.return) {
        setIsSearching(false);
        setPage(0);
        return;
      }
      if (key.backspace || key.delete) setSearch(search.slice(0, -1));
      else if (input.length === 1) setSearch(search + input);
      return;
    }

    if (key.upArrow || input === 'k') setPage(Math.max(0, page - 1));
    if (key.downArrow || input === 'j') setPage(Math.min(totalPages - 1, page + 1));
    if (input === 's') setIsSearching(true);
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="yellow">
        {username ? `Historial de Usuario: ${username}` : 'Registro Global de Actividades'}
      </Text>
      <Newline />
      
      {isSearching ? (
        <Box>
          <Text>Buscar: </Text>
          <Text color="cyan">{search}_</Text>
        </Box>
      ) : search ? (
        <Text color="cyan">Filtro activo: "{search}" (Presiona 'S' para cambiar, Esc para borrar)</Text>
      ) : (
        <Text dimColor>Presiona 'S' para buscar</Text>
      )}
      
      <Newline />
      <Box>
        <Text bold dimColor>{'FECHA'.padEnd(20)} {'TECNICO'.padEnd(12)} {'OPERACION'.padEnd(15)} {'ARCHIVO'.padEnd(30)} {'RES'}</Text>
      </Box>
      
      {currentItems.length === 0 ? (
        <Text>No hay registros.</Text>
      ) : (
        currentItems.map((e, i) => {
          const arch = e.ARCHIVO.length > 28 ? '...' + e.ARCHIVO.slice(-25) : e.ARCHIVO;
          return (
            <Box key={i}>
              <Text>{e.FECHA.padEnd(20)} </Text>
              <Text color="cyan">{e.TECNICO.substring(0, 10).padEnd(12)} </Text>
              <Text color="magenta">{e.OPERACION.substring(0, 13).padEnd(15)} </Text>
              <Text>{arch.padEnd(30)} </Text>
              <Text color={e.RESULTADO === 'OK' ? 'green' : 'red'}>{e.RESULTADO}</Text>
            </Box>
          );
        })
      )}

      <Newline />
      <Box justifyContent="space-between">
        <Text dimColor>Página {page + 1} de {totalPages} ({filtered.length} registros)</Text>
        <Text dimColor>{isSearching ? '[Enter] Aplicar' : '[↑↓] Navegar  [S] Buscar  [Esc] Volver'}</Text>
      </Box>
    </Box>
  );
}
