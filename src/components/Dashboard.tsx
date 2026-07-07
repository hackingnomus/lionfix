import React from 'react';
import { Box, Text, Newline } from 'ink';
import { isChatbotConfigured } from '../core/chatbot.js';

interface DashboardProps {
  inventoryStats: {
    total: number;
    isos: number;
    herramientas: number;
    drivers: number;
    documentos: number;
    otros: number;
  };
  pendingCount: number;
  usedSpace: string;
  freeSpace: string;
  lastBackup: string | null;
  totalActivities: number;
  totalUsers: number;
  usbDetected: number;
  currentUser: string;
  inventoryRoot: string;
  backupAgeDays: number | null;
  trashCount: number;
}

export function Dashboard({
  inventoryStats,
  pendingCount,
  freeSpace,
  backupAgeDays,
  trashCount,
  totalActivities,
  currentUser,
  inventoryRoot,
}: DashboardProps) {
  const hasAlerts = pendingCount > 0 || trashCount > 0 || (backupAgeDays !== null && backupAgeDays > 7);
  const aiConfigured = isChatbotConfigured(inventoryRoot);

  return (
    <Box flexDirection="column" paddingX={2}>
      <Box marginBottom={1}>
        <Text dimColor>   📊 </Text>
        <Text bold>ESTADO DEL TALLER</Text>
        <Text dimColor> {'─'.repeat(40)}</Text>
      </Box>

      <Box flexDirection="column" paddingLeft={4} marginBottom={1}>
        <Text>👨‍🔧 Técnico        : <Text color="green" bold>{currentUser}</Text></Text>
        <Text>📁 Archivos       : <Text color="cyan" bold>{inventoryStats.total}</Text></Text>
        <Text>🌍 Espacio libre  : <Text color="cyan" bold>{freeSpace}</Text></Text>
        <Text>🤖 Asistente IA   : <Text color={aiConfigured ? 'green' : 'yellow'} bold>{aiConfigured ? 'Configurado' : 'No configurado'}</Text></Text>
      </Box>

      {hasAlerts && (
        <Box flexDirection="column" paddingLeft={4} marginBottom={1}>
          <Text color="yellow" bold>⚠ Alertas activas:</Text>
          {pendingCount > 0 && <Text color="yellow">  • {pendingCount} archivo(s) pendiente(s) de clasificar</Text>}
          {trashCount > 0 && <Text color="yellow">  • {trashCount} elemento(s) en la papelera</Text>}
          {backupAgeDays !== null && backupAgeDays > 7 && <Text color="yellow">  • Último backup hace {backupAgeDays} días</Text>}
        </Box>
      )}
    </Box>
  );
}
