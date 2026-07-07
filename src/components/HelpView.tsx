import React, { useState } from 'react';
import { Box, Text, useInput, Newline } from 'ink';
import type { Config } from '../config/index.js';

interface Props {
  config: Config;
  onBack: () => void;
}

export function HelpView({ config, onBack }: Props) {
  const [page, setPage] = useState(1);
  const totalPages = 4;

  useInput((input, key) => {
    if (key.escape || input === '0') {
      onBack();
      return;
    }
    if (key.rightArrow || input === 'd') {
      setPage(Math.min(totalPages, page + 1));
    }
    if (key.leftArrow || input === 'a') {
      setPage(Math.max(1, page - 1));
    }
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold color="yellow">📖 GUÍA GENERAL DE USUARIO - Ayuda Contextual</Text>
      <Newline />
      
      {page === 1 && (
        <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
          <Text bold color="white">Página 1: Gestión de Inventario</Text>
          <Newline />
          <Text dimColor>El sistema LionFix se encarga de administrar de forma segura los archivos locales.</Text>
          <Text color="cyan">▸ Organizador de Archivos:</Text>
          <Text>  Clasifica los archivos de 'por_clasificar' según su extensión (ISOs, Drivers, etc.).</Text>
          <Text color="cyan">▸ Verificador de Integridad:</Text>
          <Text>  Usa hashes SHA-256 para asegurarse de que los archivos no estén corruptos.</Text>
          <Text color="cyan">▸ Escáner USB:</Text>
          <Text>  Detecta discos externos y automatiza copias hacia el inventario.</Text>
        </Box>
      )}

      {page === 2 && (
        <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
          <Text bold color="white">Página 2: Reportes y Usuarios</Text>
          <Newline />
          <Text color="cyan">▸ Exportar a TXT/Excel/PDF:</Text>
          <Text>  Genera reportes de actividades de los técnicos.</Text>
          <Text color="cyan">▸ Backup y Restauración:</Text>
          <Text>  Guarda copias de seguridad del directorio de inventario.</Text>
          <Text color="cyan">▸ Administrar Usuarios:</Text>
          <Text>  Crea usuarios manualmente, importa desde Excel o visualiza usuarios del SO.</Text>
          <Text color="cyan">▸ Importar desde Excel:</Text>
          <Text>  Lee archivos .xlsx con columnas 'usuario' y 'password' para crear usuarios en masa.</Text>
        </Box>
      )}

      {page === 3 && (
        <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
          <Text bold color="white">Página 3: Herramientas WSL2</Text>
          <Newline />
          <Text dimColor>Windows Subsystem for Linux (WSL) permite interactuar con distribuciones de Linux desde Windows.</Text>
          <Text color="cyan">▸ Detección de Distribuciones:</Text>
          <Text>  El sistema verifica qué distribuciones de Linux existen vía wsl.exe.</Text>
          <Text color="cyan">▸ Gestión de Paquetes:</Text>
          <Text>  Lista, actualiza e instala paquetes en distros WSL (apt, dnf, yum, pacman).</Text>
          <Text color="cyan">▸ Diagnóstico de Red:</Text>
          <Text>  Verifica conectividad (ping, DNS, internet) desde la distro WSL.</Text>
          <Text color="cyan">▸ Información del Sistema:</Text>
          <Text>  Muestra OS, kernel, uptime y espacio disponible de cada distro.</Text>
        </Box>
      )}

      {page === 4 && (
        <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
          <Text bold color="white">Página 4: Asistente IA 🤖</Text>
          <Newline />
          <Text color="cyan">▸ Chatbot Inteligente:</Text>
          <Text>  Conversa con una IA sobre el estado del sistema, inventario y actividades.</Text>
          <Text color="cyan">▸ Reportes con IA:</Text>
          <Text>  Genera reportes ejecutivos, análisis de almacenamiento y actividad de técnicos.</Text>
          <Text color="cyan">▸ Configuración:</Text>
          <Text>  Necesitas una API Key de OpenAI (o compatible) configurada en:</Text>
          <Text>{'  Mantenimiento > Configuración > AI_API_KEY o menú Asistente IA > [S] Configurar.'}</Text>
          <Text color="cyan">▸ Modelos soportados:</Text>
          <Text>  Cualquier API compatible con OpenAI (OpenAI, Azure, Ollama, vLLM, etc.).</Text>
        </Box>
      )}

      <Newline />
      <Box justifyContent="space-between" width={50}>
        <Text dimColor>Página {page} de {totalPages}</Text>
        <Text dimColor>[←] Anterior  [→] Siguiente  [Esc] Volver</Text>
      </Box>
    </Box>
  );
}
