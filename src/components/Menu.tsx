import React from 'react';
import { Box, Text } from 'ink';

export type View = 'dashboard' | 'organizer' | 'verifier' | 'trash' | 'backup' | 'usb' | 'reports' | 'scheduler' | 'users' | 'downloadverify' | 'quick' | 'config' | 'diagnostics' | 'logs' | 'myhistory' | 'wsl' | 'help' | 'chat' | 'quit';

interface MenuItem {
  id: View;
  label: string;
  key: string;
}

interface MenuCategory {
  title: string;
  icon: string;
  items: MenuItem[];
}

export const MENU_ITEMS: MenuItem[] = [
  { id: 'organizer', label: 'Gestión de Inventario', key: '1' },
  { id: 'reports', label: 'Informes y Registros CSV', key: '2' },
  { id: 'config', label: 'Mantenimiento del Sistema', key: '3' },
  { id: 'wsl', label: 'Herramientas Windows (WSL)', key: '4' },
  { id: 'chat', label: 'Asistente IA', key: '5' },
  { id: 'help', label: 'Ayuda Contextual', key: '?' },
  { id: 'quit', label: 'Salir', key: '0' },
];

export const CATEGORIES: MenuCategory[] = [
  {
    title: 'Gestión de Inventario',
    icon: '📂',
    items: [
      { id: 'organizer', label: 'Organizador de Archivos', key: '1' },
      { id: 'usb', label: 'Escáner USB', key: '2' },
      { id: 'verifier', label: 'Verificador de Integridad', key: '3' },
      { id: 'downloadverify', label: 'Verificar Descarga', key: '4' },
      { id: 'trash', label: 'Papelera de Reciclaje', key: '5' },
    ],
  },
  {
    title: 'Informes y Registros CSV',
    icon: '📊',
    items: [
      { id: 'reports', label: 'Informes y Exportación', key: '1' },
      { id: 'logs', label: 'Registro Global', key: '2' },
      { id: 'myhistory', label: 'Mi Historial', key: '3' },
      { id: 'users', label: 'Administrar Usuarios', key: '4' },
    ],
  },
  {
    title: 'Mantenimiento del Sistema',
    icon: '⚙️',
    items: [
      { id: 'backup', label: 'Backup / Restaurar', key: '1' },
      { id: 'scheduler', label: 'Programar Tareas', key: '2' },
      { id: 'diagnostics', label: 'Diagnóstico del Sistema', key: '3' },
      { id: 'config', label: 'Configuración', key: '4' },
    ],
  },
  {
    title: 'Herramientas Windows (WSL)',
    icon: '🚀',
    items: [
      { id: 'wsl', label: 'Módulo de Herramientas WSL', key: '1' },
      { id: 'quick', label: 'Asistente Rápido', key: '2' },
    ],
  },
  {
    title: 'Asistente IA',
    icon: '🤖',
    items: [
      { id: 'chat', label: 'Chatbot Inteligente', key: '1' },
      { id: 'reports', label: 'Reportes con IA', key: '2' },
    ],
  },
];

export function MenuBar({ activeCategoryIndex }: { activeCategoryIndex: number | null }) {
  if (activeCategoryIndex === null) {
    return (
      <Box flexDirection="column" paddingX={2}>
        <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
          <Text>[<Text color="green" bold>1</Text>] 📂  Gestión de Inventario</Text>
          <Text>[<Text color="green" bold>2</Text>] 📊  Informes y Registros CSV</Text>
          <Text>[<Text color="green" bold>3</Text>] ⚙️  Mantenimiento del Sistema</Text>
          <Text>[<Text color="green" bold>4</Text>] 🚀  Herramientas Windows (WSL)</Text>
          <Text>[<Text color="green" bold>5</Text>] 🤖  Asistente IA</Text>
          <Text>[<Text color="green" bold>?</Text>] 📖  Ayuda Contextual</Text>
          <Text>[<Text color="green" bold>0</Text>] 🚪  Salir</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="green">► Seleccione una categoría: <Text dimColor>_</Text></Text>
        </Box>
      </Box>
    );
  }

  const category = CATEGORIES[activeCategoryIndex];
  return (
    <Box flexDirection="column" paddingX={2}>
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
        <Box marginBottom={1}>
          <Text dimColor>Categoría: </Text>
          <Text bold color="cyan">{category.icon} {category.title}</Text>
        </Box>
        {category.items.map(item => (
          <Box key={item.key}>
            <Text>
              <Text>[<Text color="green" bold>{item.key}</Text>] </Text>
              <Text>{item.label}</Text>
            </Text>
          </Box>
        ))}
        <Box marginTop={1}>
          <Text>[<Text color="green" bold>Esc</Text>] 🔙  Volver a categorías</Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text color="green">► Seleccione una opción: <Text dimColor>_</Text></Text>
      </Box>
    </Box>
  );
}
