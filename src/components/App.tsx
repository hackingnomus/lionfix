import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput, useApp, Newline } from 'ink';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config/index.js';
import { loadConfig, saveConfig } from '../config/index.js';
import { getCurrentMachineId } from '../core/auth.js';
import { logLoginToExcel } from '../core/users-excel.js';
import { Login } from './Login.js';
import { Layout } from './Layout.js';
import { SetupWizard } from './SetupWizard.js';
import { Dashboard } from './Dashboard.js';

interface AppProps {
  exportMode: boolean;
  renderMode: boolean;
  exportType?: string;
}

export function App({ exportMode, renderMode, exportType }: AppProps) {
  const { exit } = useApp();
  const [config, setConfig] = useState<Config>(() => loadConfig());
  const [currentView, setCurrentView] = useState<string>('login');
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [machineIdSet, setMachineIdSet] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    const machineFile = join(config.INVENTARIO_RAIZ, '.machine_id');
    if (!existsSync(machineFile)) {
      writeFileSync(machineFile, getCurrentMachineId(), 'utf-8');
    }
    setMachineIdSet(true);
  }, [currentUser]);

  const handleLogin = useCallback((username: string) => {
    setCurrentUser(username);
    setCurrentView('menu');
    saveConfig('TECNICO', username);
    setConfig(prev => ({ ...prev, TECNICO: username }));
    logLoginToExcel(config.INVENTARIO_RAIZ, username).catch(() => {});
  }, [config.INVENTARIO_RAIZ]);

  const handleViewChange = useCallback((view: string) => {
    setCurrentView(view);
  }, []);

  if (!config) {
    return <Text>Loading...</Text>;
  }

  if (exportMode) {
    return <ExportComponent config={config} exportType={exportType} />;
  }

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {currentView === 'setup' && (
        <SetupWizard
          config={config}
          onComplete={(updated) => {
            setConfig(updated);
            setCurrentView('login');
          }}
        />
      )}
      {currentView === 'login' && (
        <Login
          config={config}
          onLogin={handleLogin}
          onSetup={() => setCurrentView('setup')}
        />
      )}
      {currentView === 'menu' && currentUser && (
        <Layout
          config={config}
          currentUser={currentUser}
          onLogout={() => {
            setCurrentUser(null);
            setCurrentView('login');
          }}
        />
      )}
    </Box>
  );
}

function ExportComponent({ config, exportType }: { config: Config; exportType?: string }) {
  return <Text>Exportando: {exportType} - {config.INVENTARIO_RAIZ}</Text>;
}
