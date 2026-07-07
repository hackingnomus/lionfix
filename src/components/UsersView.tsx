import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, Newline } from 'ink';
import type { Config } from '../config/index.js';
import { loadUsers, saveUser, sanitizeUsername, hashPassword, userExists } from '../core/auth.js';
import { logActivity } from '../core/logger.js';
import { importUsersFromExcel, readSystemUsers, findExcelFiles, logMovementToExcel, logUserRegistrationToExcel } from '../core/users-excel.js';
import { join, basename } from 'node:path';
import { existsSync } from 'node:fs';

interface Props { config: Config; onBack: () => void; }

type Mode = 'list' | 'creating' | 'import_excel' | 'show_system';

export function UsersView({ config, onBack }: Props) {
  const [users, setUsers] = useState<{ username: string }[]>([]);
  const [mode, setMode] = useState<Mode>('list');
  const [createStep, setCreateStep] = useState<'username' | 'password'>('username');
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');
  const [message, setMessage] = useState('');
  const [excelFiles, setExcelFiles] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [systemUsers, setSystemUsers] = useState<{ username: string; fullName?: string }[]>([]);

  const refresh = useCallback(() => {
    setUsers(loadUsers(config.INVENTARIO_RAIZ));
  }, [config.INVENTARIO_RAIZ]);

  useEffect(() => { refresh(); }, []);

  const handleImport = useCallback(async (idx: number) => {
    if (idx < 0 || idx >= excelFiles.length) return;
    setImporting(true);
    setMessage('');
    const file = excelFiles[idx];
    try {
      const result = await importUsersFromExcel(config.INVENTARIO_RAIZ, file, config.TECNICO, false);
      const parts: string[] = [];
      parts.push(`Importados: ${result.imported}`);
      parts.push(`Omitidos: ${result.skipped}`);
      if (result.errors.length > 0) parts.push(`Errores: ${result.errors.length}`);
      if (result.users.length > 0) parts.push(`Usuarios: ${result.users.join(', ')}`);
      setMessage(`✓ ${parts.join(' | ')}`);
      logMovementToExcel(config.INVENTARIO_RAIZ, config.TECNICO, 'importar_usuarios_excel', `${result.imported} importados, ${result.skipped} omitidos, archivo: ${file}`, 'UsersView').catch(() => {});
      refresh();
    } catch (e) {
      setMessage(`✗ Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setImporting(false);
    setMode('list');
  }, [excelFiles, config, refresh]);

  const showExcelImport = useCallback(() => {
    const root = config.INVENTARIO_RAIZ;
    const excelDir = join(root, '..');
    const files = findExcelFiles(excelDir);
    setExcelFiles(files);
    setMode('import_excel');
    setMessage('');
  }, [config.INVENTARIO_RAIZ]);

  const showSystem = useCallback(() => {
    const users = readSystemUsers();
    setSystemUsers(users);
    setMode('show_system');
  }, []);

  useInput((input, key) => {
    if (key.escape) {
      if (mode === 'creating' && createStep === 'username') { setMode('list'); return; }
      if (mode === 'creating' && createStep === 'password') {
        setCreateStep('username');
        setNewUser('');
        setNewPass('');
        return;
      }
      if (mode === 'import_excel' || mode === 'show_system') { setMode('list'); return; }
      onBack(); return;
    }

    if (mode === 'list') {
      if (input === 'c') {
        setMode('creating');
        setCreateStep('username');
        setNewUser('');
        setNewPass('');
        setMessage('');
      } else if (input === 'i') {
        showExcelImport();
      } else if (input === 's') {
        showSystem();
      }
      return;
    }

    if (mode === 'creating') {
      if (createStep === 'username') {
        if (key.return) {
          const safe = sanitizeUsername(newUser);
          if (userExists(config.INVENTARIO_RAIZ, safe)) {
            setMessage('El usuario ya existe');
          } else if (safe.length > 0) {
            setNewUser(safe);
            setCreateStep('password');
            setMessage('');
          }
          return;
        }
        if (key.backspace || key.delete) setNewUser(newUser.slice(0, -1));
        else if (input.length === 1) setNewUser(newUser + input);
      } else if (createStep === 'password') {
        if (key.return) {
          if (newPass.length > 0) {
            saveUser(config.INVENTARIO_RAIZ, newUser, hashPassword(newPass));
            logActivity(config.INVENTARIO_RAIZ, config.TECNICO, 'crear_usuario', newUser, '*', 'OK');
            logMovementToExcel(config.INVENTARIO_RAIZ, config.TECNICO, 'crear_usuario', `Usuario: ${newUser}`, 'UsersView').catch(() => {});
            logUserRegistrationToExcel(config.INVENTARIO_RAIZ, newUser).catch(() => {});
            setMessage(`Usuario ${newUser} creado.`);
            setMode('list');
            refresh();
          }
          return;
        }
        if (key.backspace || key.delete) setNewPass(newPass.slice(0, -1));
        else if (input.length === 1) setNewPass(newPass + input);
      }
      return;
    }

    if (mode === 'import_excel') {
      const idx = parseInt(input, 10) - 1;
      if (!isNaN(idx) && !importing) {
        handleImport(idx);
      }
      return;
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="yellow">Administrar Usuarios</Text>
      <Newline />
      {mode === 'list' && (
        <Box flexDirection="column">
          <Text>Usuarios registrados ({users.length}):</Text>
          {users.map((u, i) => (
            <Box key={i}><Text>  • {u.username}</Text></Box>
          ))}
          <Newline />
          <Box><Text color="green">[C]</Text><Text> Crear nuevo usuario</Text></Box>
          <Box><Text color="green">[I]</Text><Text> Importar desde Excel</Text></Box>
          <Box><Text color="green">[S]</Text><Text> Usuarios del sistema operativo</Text></Box>
        </Box>
      )}
      {mode === 'creating' && (
        <Box flexDirection="column">
          <Text dimColor>Creando nuevo usuario...</Text>
          <Newline />
          {createStep === 'username' ? (
            <Box><Text>Nombre de usuario: </Text><Text color="cyan">{newUser}_</Text></Box>
          ) : (
            <Box><Text>Contraseña para {newUser}: </Text><Text color="cyan">{'*'.repeat(newPass.length)}_</Text></Box>
          )}
        </Box>
      )}
      {mode === 'import_excel' && (
        <Box flexDirection="column">
          <Text dimColor>Importar usuarios desde Excel</Text>
          <Newline />
          {excelFiles.length === 0 ? (
            <Text color="yellow">No se encontraron archivos .xlsx en el directorio del proyecto.</Text>
          ) : (
            <>
              <Text>Selecciona archivo:</Text>
              {excelFiles.map((f, i) => (
                <Box key={i}>
                  <Text color="cyan">[{i + 1}]</Text>
                  <Text> {basename(f)}</Text>
                </Box>
              ))}
            </>
          )}
          {importing && <Text color="yellow">Importando...</Text>}
        </Box>
      )}
      {mode === 'show_system' && (
        <Box flexDirection="column">
          <Text dimColor>Usuarios del Sistema Operativo ({systemUsers.length})</Text>
          <Newline />
          {systemUsers.length === 0 ? (
            <Text color="yellow">No se pudieron detectar usuarios del sistema.</Text>
          ) : (
            systemUsers.map((u, i) => (
              <Box key={i}><Text>  • {u.username}{u.fullName ? ` (${u.fullName})` : ''}</Text></Box>
            ))
          )}
          <Newline />
          <Text dimColor>Usa [C] para crear un usuario manualmente si deseas agregarlo.</Text>
        </Box>
      )}
      {message && (
        <>
          <Newline />
          <Text color={message.startsWith('✓') ? 'green' : 'red'}>{message}</Text>
        </>
      )}
      <Newline />
      <Text dimColor>
        {mode === 'list' && '[C] Crear  [I] Importar Excel  [S] Usuarios SO  [Esc] Volver'}
        {mode === 'creating' && '[Enter] Continuar  [Esc] Volver'}
        {mode === 'import_excel' && '[1-9] Seleccionar archivo  [Esc] Volver'}
        {mode === 'show_system' && '[Esc] Volver'}
      </Text>
    </Box>
  );
}
