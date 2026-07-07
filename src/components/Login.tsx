import React, { useState, useCallback } from 'react';
import { Box, Text, useInput, Newline } from 'ink';
import type { Config } from '../config/index.js';
import { userExists, getUserHash, verifyPassword, sanitizeUsername, loadUsers, isLoginBlocked, recordLoginAttempt, resetLoginAttempts, ensureUserDir } from '../core/auth.js';
import { logMovementToExcel, logUserRegistrationToExcel } from '../core/users-excel.js';

interface LoginProps {
  config: Config;
  onLogin: (username: string) => void;
  onSetup: () => void;
}

export function Login({ config, onLogin, onSetup }: LoginProps) {
  const [step, setStep] = useState<'select_user' | 'password'>('select_user');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);

  const users = loadUsers(config.INVENTARIO_RAIZ);

  useInput((input, key) => {
    if (key.escape) { process.exit(0); return; }
    if (blocked) return;

    // No hay usuarios — Enter va a configuración
    if (users.length === 0) {
      if (key.return || key.tab) {
        onSetup();
      }
      return;
    }

    if (step === 'select_user') {
      if (key.return || key.tab) {
        const safe = sanitizeUsername(username.trim());
        if (!safe) return;
        if (isLoginBlocked(config.INVENTARIO_RAIZ, safe)) {
          setBlocked(true);
          setError('Usuario bloqueado por demasiados intentos. Espera 5 minutos.');
          return;
        }
        if (userExists(config.INVENTARIO_RAIZ, safe)) {
          setStep('password');
        } else {
          ensureUserDir(config.INVENTARIO_RAIZ, safe);
          resetLoginAttempts(config.INVENTARIO_RAIZ, safe);
          logMovementToExcel(config.INVENTARIO_RAIZ, safe, 'login_auto_registro', 'Usuario nuevo auto-registrado', 'Login').catch(() => {});
          logUserRegistrationToExcel(config.INVENTARIO_RAIZ, safe).catch(() => {});
          onLogin(safe);
        }
        return;
      }
      if (key.backspace || key.delete) {
        setUsername(username.slice(0, -1));
        return;
      }
      if (input.length === 1 && /^[a-zA-Z0-9_.-]$/.test(input)) {
        setUsername(username + input);
      }
      return;
    }

    if (step === 'password') {
      if (key.return) {
        const safe = sanitizeUsername(username.trim());
        const hash = getUserHash(config.INVENTARIO_RAIZ, safe);
        if (hash && verifyPassword(password, hash)) {
          ensureUserDir(config.INVENTARIO_RAIZ, safe);
          resetLoginAttempts(config.INVENTARIO_RAIZ, safe);
          logMovementToExcel(config.INVENTARIO_RAIZ, safe, 'login_exitoso', 'Inicio de sesión correcto', 'Login').catch(() => {});
          onLogin(safe);
        } else {
          recordLoginAttempt(config.INVENTARIO_RAIZ, safe);
          logMovementToExcel(config.INVENTARIO_RAIZ, safe, 'login_fallido', 'Contraseña incorrecta', 'Login').catch(() => {});
          if (isLoginBlocked(config.INVENTARIO_RAIZ, safe)) {
            setBlocked(true);
            setError('Usuario bloqueado por demasiados intentos. Espera 5 minutos.');
          } else {
            setError('Contraseña incorrecta');
            setPassword('');
          }
        }
        return;
      }
      if (key.backspace || key.delete) {
        setPassword(password.slice(0, -1));
        return;
      }
      if (input.length === 1) {
        setPassword(password + input);
      }
    }
  });

  if (users.length === 0) {
    return (
      <Box flexDirection="column" alignItems="center" paddingY={2}>
        <Box borderStyle="round" borderColor="yellow" paddingX={4} paddingY={1} flexDirection="column" alignItems="center">
          <Text bold color="yellow">🦁 L I O N F I X   v5</Text>
          <Text dimColor>SISTEMA DE GESTIÓN DE INVENTARIO</Text>
        </Box>
        <Newline />
        <Box borderStyle="single" borderColor="gray" paddingX={2} paddingY={1} flexDirection="column" alignItems="center">
          <Text>No hay usuarios configurados en el sistema.</Text>
          <Newline />
          <Text><Text color="green" bold>[Enter]</Text> Iniciar asistente de configuración</Text>
          <Text><Text color="red" bold>[Esc]</Text>   Salir del sistema</Text>
        </Box>
      </Box>
    );
  }

  if (blocked) {
    return (
      <Box flexDirection="column" alignItems="center" paddingY={2}>
        <Box borderStyle="round" borderColor="red" paddingX={4} paddingY={1} flexDirection="column" alignItems="center">
          <Text bold color="red">ACCESO BLOQUEADO</Text>
        </Box>
        <Newline />
        <Box borderStyle="single" borderColor="gray" paddingX={2} paddingY={1} flexDirection="column" alignItems="center">
          <Text color="red">⚠ Demasiados intentos fallidos.</Text>
          <Text dimColor>Por seguridad, espera 5 minutos antes de reintentar.</Text>
          <Newline />
          <Text><Text color="red" bold>[Esc]</Text> Salir</Text>
        </Box>
      </Box>
    );
  }

    return (
      <Box flexDirection="column" alignItems="center" paddingY={2}>
        <Box borderStyle="round" borderColor="cyan" paddingX={4} paddingY={1} flexDirection="column" alignItems="center">
          <Text bold color="yellow">🦁 L I O N F I X   v5</Text>
          <Text dimColor>SISTEMA DE GESTIÓN DE INVENTARIO</Text>
        </Box>
        <Newline />
        
        <Box flexDirection="row" width={60} justifyContent="space-between">
          {/* Panel Izquierdo: Lista de Usuarios */}
          {users.length > 0 && (
            <Box flexDirection="column" width="45%" borderStyle="single" borderColor="gray" paddingX={2} paddingY={1}>
              <Text dimColor>■ USUARIOS AUTORIZADOS</Text>
              <Box flexDirection="column" marginTop={1}>
                {users.map((u, i) => (
                  <Text key={i} color="cyan">  ▸ {u.username}</Text>
                ))}
              </Box>
            </Box>
          )}

          {/* Panel Derecho: Autenticación */}
          <Box flexDirection="column" width="50%" borderStyle="single" borderColor="blue" paddingX={2} paddingY={1}>
            {step === 'select_user' && (
              <Box flexDirection="column">
                <Text bold color="white">INGRESE SU USUARIO:</Text>
                <Box marginTop={1}>
                  <Text color="green" bold>➜  </Text>
                  <Text color="white" bold>{username}</Text>
                  <Text color="gray">_</Text>
                </Box>
                <Box marginTop={1} minHeight={2}>
                  {error ? <Text color="red">⚠ {error}</Text> : <Text dimColor>[Enter] para continuar</Text>}
                </Box>
              </Box>
            )}
            {step === 'password' && (
              <Box flexDirection="column">
                <Text bold color="white">CLAVE PARA <Text color="cyan">{username}</Text>:</Text>
                <Box marginTop={1}>
                  <Text color="red" bold>🔒 </Text>
                  <Text color="white" bold>{'*'.repeat(password.length)}</Text>
                  <Text color="gray">_</Text>
                </Box>
                <Box marginTop={1} minHeight={2}>
                  {error ? <Text color="red">⚠ {error}</Text> : <Text dimColor>[Enter] para acceder</Text>}
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    );
}
