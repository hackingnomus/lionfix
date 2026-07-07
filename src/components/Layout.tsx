import React, { useState, useCallback } from 'react';
import { Box, Text, useInput, Newline } from 'ink';
import type { Config } from '../config/index.js';
import { Dashboard } from './Dashboard.js';
import { OrganizerView } from './OrganizerView.js';
import { VerifierView } from './VerifierView.js';
import { TrashView } from './TrashView.js';
import { BackupView } from './BackupView.js';
import { USBView } from './USBView.js';
import { ReportsView } from './ReportsView.js';
import { SchedulerView } from './SchedulerView.js';
import { UsersView } from './UsersView.js';
import { DownloadVerifyView } from './DownloadVerifyView.js';
import { QuickAssistantView } from './QuickAssistantView.js';
import { DiagnosticsView } from './DiagnosticsView.js';
import { ConfigView } from './ConfigView.js';
import { LogView } from './LogView.js';
import { WSLView } from './WSLView.js';
import { ChatView } from './ChatView.js';
import { HelpView } from './HelpView.js';
import { getDashboard, Dashboard as DashboardData } from '../core/state.js';
import { View, MenuBar, CATEGORIES } from './Menu.js';
import { logMovementToExcel } from '../core/users-excel.js';

interface LayoutProps {
  config: Config;
  currentUser: string;
  onLogout: () => void;
}

export function Layout({ config, currentUser, onLogout }: LayoutProps) {
  const [view, setView] = useState<View>('dashboard');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategoryIndex, setActiveCategoryIndex] = useState<number | null>(null);

  React.useEffect(() => {
    if (view === 'dashboard') {
      setLoading(true);
      getDashboard(config.INVENTARIO_RAIZ).then(data => {
        setDashboardData(data);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [view, config.INVENTARIO_RAIZ]);

  const navigate = useCallback((v: View) => {
    if (v === 'quit') { onLogout(); return; }
    setView(v);
    logMovementToExcel(config.INVENTARIO_RAIZ, currentUser, 'navegar', `Vista: ${v}`, 'Layout').catch(() => {});
  }, [onLogout, config.INVENTARIO_RAIZ, currentUser]);

  useInput((input, key) => {
    if (key.escape) {
      if (view !== 'dashboard') { setView('dashboard'); return; }
      if (activeCategoryIndex !== null) { setActiveCategoryIndex(null); return; }
      onLogout();
      return;
    }
    if (key.return || key.tab) return;
    
    if (view === 'dashboard') {
      if (activeCategoryIndex === null) {
        if (input === '1') setActiveCategoryIndex(0);
        else if (input === '2') setActiveCategoryIndex(1);
        else if (input === '3') setActiveCategoryIndex(2);
        else if (input === '4') setActiveCategoryIndex(3);
        else if (input === '5') setActiveCategoryIndex(4);
        else if (input === '?') navigate('help');
        else if (input === '0') onLogout();
      } else {
        const cat = CATEGORIES[activeCategoryIndex];
        const item = cat.items.find(m => m.key === input);
        if (item) navigate(item.id);
      }
    }
  });

  const back = useCallback(() => setView('dashboard'), []);

  switch (view) {
    case 'dashboard':
      return (
        <Box flexDirection="column">
          <Header currentUser={currentUser} />
          {loading ? <Box paddingX={2}><Text>Cargando...</Text></Box> : dashboardData ? (
            <Dashboard
              inventoryStats={{
                total: dashboardData.total_inventario,
                isos: dashboardData.archivos_por_categoria?.isos || 0,
                herramientas: dashboardData.archivos_por_categoria?.herramientas || 0,
                drivers: dashboardData.archivos_por_categoria?.drivers || 0,
                documentos: dashboardData.archivos_por_categoria?.documentos || 0,
                otros: dashboardData.archivos_por_categoria?.otros || 0,
              }}
              pendingCount={dashboardData.pendientes}
              usedSpace={dashboardData.espacio_usado}
              freeSpace={dashboardData.espacio_libre}
              lastBackup={dashboardData.ultimo_backup}
              totalActivities={dashboardData.total_actividades}
              totalUsers={dashboardData.total_usuarios}
              usbDetected={dashboardData.usb_detectados}
              currentUser={currentUser}
              inventoryRoot={config.INVENTARIO_RAIZ}
              backupAgeDays={dashboardData.backup_age_dias}
              trashCount={dashboardData.trash_count || 0}
            />
          ) : null}
          <MenuBar activeCategoryIndex={activeCategoryIndex} />
        </Box>
      );
    case 'organizer': return <Wrapper currentUser={currentUser}><OrganizerView config={config} onBack={back} /></Wrapper>;
    case 'verifier': return <Wrapper currentUser={currentUser}><VerifierView config={config} onBack={back} /></Wrapper>;
    case 'trash': return <Wrapper currentUser={currentUser}><TrashView config={config} onBack={back} /></Wrapper>;
    case 'backup': return <Wrapper currentUser={currentUser}><BackupView config={config} onBack={back} /></Wrapper>;
    case 'usb': return <Wrapper currentUser={currentUser}><USBView config={config} onBack={back} /></Wrapper>;
    case 'reports': return <Wrapper currentUser={currentUser}><ReportsView config={config} onBack={back} /></Wrapper>;
    case 'scheduler': return <Wrapper currentUser={currentUser}><SchedulerView config={config} onBack={back} /></Wrapper>;
    case 'users': return <Wrapper currentUser={currentUser}><UsersView config={config} onBack={back} /></Wrapper>;
    case 'downloadverify': return <Wrapper currentUser={currentUser}><DownloadVerifyView config={config} onBack={back} /></Wrapper>;
    case 'quick': return <Wrapper currentUser={currentUser}><QuickAssistantView config={config} onBack={back} /></Wrapper>;
    case 'help': return <Wrapper currentUser={currentUser}><HelpView config={config} onBack={back} /></Wrapper>;
    case 'config': return <Wrapper currentUser={currentUser}><ConfigView config={config} onBack={back} /></Wrapper>;
    case 'diagnostics': return <Wrapper currentUser={currentUser}><DiagnosticsView config={config} onBack={back} /></Wrapper>;
    case 'logs': return <Wrapper currentUser={currentUser}><LogView config={config} onBack={back} /></Wrapper>;
    case 'myhistory': return <Wrapper currentUser={currentUser}><LogView config={config} onBack={back} username={currentUser} /></Wrapper>;
    case 'wsl': return <Wrapper currentUser={currentUser}><WSLView config={config} onBack={back} /></Wrapper>;
    case 'chat': return <Wrapper currentUser={currentUser}><ChatView config={config} onBack={back} /></Wrapper>;
    default: return <Text>Vista no encontrada</Text>;
  }
}

function Wrapper({ children, currentUser }: { children: React.ReactNode, currentUser: string }) {
  return (
    <Box flexDirection="column">
      <Header currentUser={currentUser} />
      {children}
    </Box>
  );
}

const ASCII_LOGO = `
                       .  .                                                     
         .....................,;'...                                             
      ..............,;cloolllccxWx....                                          
     ........,ccccc:,',.....',',Xc .........                                    
    ........l,  ........':cllo,:0..............                                 
   .......... .;cooc'...,:cllo.lc ...,;...........                              
  ... .',;clodxdl;,ll;. ..;clc o..'xXx. ..o;........                           
.....   ..',:cc;:oddOKK0Oxlc.;'.; 'NNO  ..o0l ........                         
    .,cl;..kc'.;oOOOddlcdOK0xl,.. ,NXX0lcoOx: .........                        
  ..''.....,:..:kOOKKOdodO00l;cc.  lK00OOko:. .........                        
   ';cll:'  ....,:oxkkooxO0KX0,:k  ;Kkdc,..  ...........                       
 .lolc,. ..cl.  .::ooccccodddx:oc .0lkk,    .............                      
.:.   ..;lxx.'. . ,':lxl  k,.,ll  ocxO;  . .............                       
. .  ,:''xk,;x      :dx.  .      ,;cx: . : .............                       
 .. .:. :xo dx..    ;ok...'.  .  ''l: . :, .............                       
. '. ..  :l, ld;''   .,dd.;o,:o  ..;;   cl ..............                      
  .;.    .:; ,lo;';.   .dOxOXX0   ..  ,xo  ..............                      
   ':.    .'. ,::'..     'ldkc.     ;dk;  ..............                        
    .;:'.      .';'             .;okx:   ..............                         
      .:c:,'.     ..       .':ldxdl'   ...............                          
        ..,:clc::;;,,,''';:;;,''.    ...............                            
     ....    ...'',,,''.... ..........''.........                               
                                                                                
     ██╗     ██╗ ██████╗ ███╗   ██╗███████╗██╗██╗  ██╗                         
     ██║     ██║██╔═══██╗████╗  ██║██╔════╝██║╚██╗██╔╝                         
     ██║     ██║██║   ██║██╔██╗ ██║█████╗  ██║ ╚███╔╝                          
     ██║     ██║██║   ██║██║╚██╗██║██╔══╝  ██║ ██╔██╗                          
     ███████╗██║╚██████╔╝██║ ╚████║██║     ██║██╔╝ ██╗                         
     ╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝     ╚═╝╚═╝  ╚═╝                         
`;

function Header({ currentUser }: { currentUser: string }) {
  return (
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      <Text bold color="cyan">{ASCII_LOGO}</Text>
      <Box width="100%" paddingX={2} marginTop={1}>
        <Box borderStyle="double" width="100%" flexDirection="column" borderColor="gray" paddingX={2}>
          <Box justifyContent="center" marginBottom={1}>
            <Text bold color="yellow">L I O N F I X  —  ARQUITECTURA HEXAGONAL  ||</Text>
          </Box>
          <Box justifyContent="center">
            <Text dimColor>|  </Text>
            <Text color="blue">👤 Usuario: </Text><Text color="green" bold>{currentUser || 'sin usuario'}     </Text>
            <Text dimColor>|  </Text>
            <Text color="green">📱 Entorno: </Text><Text color="white" bold>Windows</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
