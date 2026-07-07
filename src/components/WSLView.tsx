import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, Newline } from 'ink';
import type { Config } from '../config/index.js';
import {
  getWSLDistros, getWSLDistroInfo, isWSLAvailable,
  detectWSLPackageManager, listWSLPackages,
  updateWSLPackages,
  checkWSLNetwork, checkWSLToolsAll, checkWSLPathExists,
  autoRepairDistro, getWSLDistroLocation,
  WSLDistro, WSLDistroInfo, WSLPackage, AutoRepairReport,
} from '../core/wsl.js';
import { logMovementToExcel } from '../core/users-excel.js';
import {
  wslFileStates, wslReadyISOs, wslDiagnosticTools,
  wslDriversByDevice, wslIntegrityCheck, wslCategoryStates,
  wslTechQuickSummary, wslCleanupTemp, wslFindDuplicates,
  wslInventoryTree, wslInstallInventoryTools, wslSymlinkInventory,
  getWSLInventoryPath,
  WSLInventoryResult,
} from '../core/wsl-inventory.js';

interface Props { config: Config; onBack: () => void; }

type Step =
  | 'list' | 'distro_detail'
  | 'packages' | 'updating' | 'network' | 'inventory_result' | 'repairing';

export function WSLView({ config, onBack }: Props) {
  const [distros, setDistros] = useState<WSLDistro[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('list');
  const [selectedDistro, setSelectedDistro] = useState('');
  const [distroInfo, setDistroInfo] = useState<WSLDistroInfo | null>(null);
  const [packages, setPackages] = useState<WSLPackage[]>([]);
  const [pm, setPm] = useState<string | null>(null);
  const [output, setOutput] = useState<string[]>([]);
  const [networkResult, setNetworkResult] = useState<{ ping: boolean; dns: boolean; internet: boolean } | null>(null);
  const [inventoryResult, setInventoryResult] = useState<WSLInventoryResult | null>(null);
  const [toolsStatus, setToolsStatus] = useState<Record<string, boolean> | null>(null);
  const [invPathExists, setInvPathExists] = useState<boolean | null>(null);
  const [autoRepair, setAutoRepair] = useState<AutoRepairReport | null>(null);
  const [distroLocation, setDistroLocation] = useState('');

  useEffect(() => {
    setDistros(getWSLDistros());
    setLoading(false);
  }, []);

  const doAutoRepair = useCallback((name: string) => {
    setStep('repairing');
    setAutoRepair(null);
    const wslPath = getWSLInventoryPath(config.INVENTARIO_RAIZ);
    const report = autoRepairDistro(name, config.INVENTARIO_RAIZ, wslPath);
    setAutoRepair(report);
    setDistroInfo(getWSLDistroInfo(name));
    setPm(detectWSLPackageManager(name, true));
    setToolsStatus(checkWSLToolsAll(name));
    setInvPathExists(checkWSLPathExists(name, wslPath));
    setDistroLocation(getWSLDistroLocation(name));
    logMovementToExcel(config.INVENTARIO_RAIZ, config.TECNICO, 'wsl_auto_reparar', `${name}: ${report.success ? 'OK' : 'errores'}`, 'WSLView').catch(() => {});
  }, [config]);

  const showDistro = useCallback((name: string) => {
    setSelectedDistro(name);
    doAutoRepair(name);
  }, [doAutoRepair]);

  const showPackages = useCallback(() => {
    if (!selectedDistro || !pm) return;
    setStep('packages');
    const pkgs = listWSLPackages(selectedDistro, pm);
    setPackages(pkgs);
    logMovementToExcel(config.INVENTARIO_RAIZ, config.TECNICO, 'wsl_listar_paquetes', `${selectedDistro} (${pkgs.length} paquetes)`, 'WSLView').catch(() => {});
  }, [selectedDistro, pm, config]);

  const doUpdate = useCallback(() => {
    if (!selectedDistro || !pm) return;
    setStep('updating');
    setOutput([]);
    logMovementToExcel(config.INVENTARIO_RAIZ, config.TECNICO, 'wsl_actualizar_paquetes', selectedDistro, 'WSLView').catch(() => {});
    try {
      const result = updateWSLPackages(selectedDistro, pm);
      setOutput(result.split('\n').filter(l => l.trim()));
    } catch (e) {
      setOutput([`Error: ${e instanceof Error ? e.message : String(e)}`]);
    }
  }, [selectedDistro, pm, config]);

  const doNetworkCheck = useCallback(() => {
    if (!selectedDistro) return;
    setStep('network');
    setNetworkResult(null);
    logMovementToExcel(config.INVENTARIO_RAIZ, config.TECNICO, 'wsl_verificar_red', selectedDistro, 'WSLView').catch(() => {});
    const result = checkWSLNetwork(selectedDistro);
    setNetworkResult(result);
  }, [selectedDistro, config]);

  const runInventoryAction = useCallback((action: string) => {
    if (!selectedDistro) return;
    setStep('inventory_result');
    setInventoryResult(null);
    logMovementToExcel(config.INVENTARIO_RAIZ, config.TECNICO, `wsl_inventario_${action}`, `${selectedDistro}: ${action}`, 'WSLView').catch(() => {});
    let result: WSLInventoryResult;

    try {
      switch (action) {
        case 'states':
          result = wslFileStates(selectedDistro, config.INVENTARIO_RAIZ);
          break;
        case 'isos':
          result = wslReadyISOs(selectedDistro, config.INVENTARIO_RAIZ);
          break;
        case 'tools':
          result = wslDiagnosticTools(selectedDistro, config.INVENTARIO_RAIZ);
          break;
        case 'drivers':
          result = wslDriversByDevice(selectedDistro, config.INVENTARIO_RAIZ);
          break;
        case 'integrity':
          result = wslIntegrityCheck(selectedDistro, config.INVENTARIO_RAIZ);
          break;
        case 'categories':
          result = wslCategoryStates(selectedDistro, config.INVENTARIO_RAIZ);
          break;
        case 'summary':
          result = wslTechQuickSummary(selectedDistro, config.INVENTARIO_RAIZ);
          break;
        case 'cleanup':
          result = wslCleanupTemp(selectedDistro, config.INVENTARIO_RAIZ);
          break;
        case 'duplicates':
          result = wslFindDuplicates(selectedDistro, config.INVENTARIO_RAIZ);
          break;
        case 'tree':
          result = wslInventoryTree(selectedDistro, config.INVENTARIO_RAIZ);
          break;
        case 'install_tools':
          result = wslInstallInventoryTools(selectedDistro, pm);
          break;
        case 'symlink':
          result = wslSymlinkInventory(selectedDistro, config.INVENTARIO_RAIZ);
          break;
        default:
          result = { success: false, output: 'Acción desconocida', command: action };
      }
    } catch (e) {
      result = { success: false, output: `Error: ${e instanceof Error ? e.message : String(e)}`, command: action };
    }

    setInventoryResult(result);
  }, [selectedDistro, pm, config.INVENTARIO_RAIZ]);

  useInput((input, key) => {
    if (key.escape) {
      if (step === 'repairing') { setStep('list'); return; }
      if (step === 'packages' || step === 'updating' || step === 'network' || step === 'inventory_result') {
        setStep('distro_detail');
        return;
      }
      if (step === 'distro_detail') { setStep('list'); return; }
      onBack(); return;
    }

    if (step === 'repairing' && (key.return || key.tab)) {
      setStep('distro_detail');
      return;
    }

    if (step === 'list') {
      const idx = parseInt(input, 10) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < distros.length) {
        showDistro(distros[idx].name);
      }
      return;
    }

    if (step === 'distro_detail') {
      if (input === 'p' || input === 'P') showPackages();
      if (input === 'u' || input === 'U') doUpdate();
      if (input === 'n' || input === 'N') doNetworkCheck();
      if (input === 'r' || input === 'R') { doAutoRepair(selectedDistro); return; }
      if (input === '1') runInventoryAction('summary');
      if (input === '2') runInventoryAction('states');
      if (input === '3') runInventoryAction('categories');
      if (input === '4') runInventoryAction('integrity');
      if (input === '5') runInventoryAction('isos');
      if (input === '6') runInventoryAction('tools');
      if (input === '7') runInventoryAction('drivers');
      if (input === 'c' || input === 'C') runInventoryAction('cleanup');
      if (input === 'd' || input === 'D') runInventoryAction('duplicates');
      if (input === 't' || input === 'T') runInventoryAction('tree');
      if (input === 'i' || input === 'I') runInventoryAction('install_tools');
      if (input === 's' || input === 'S') runInventoryAction('symlink');
      return;
    }
  });

  
  if (loading) return <Text>Buscando distribuciones WSL2...</Text>;
  if (!isWSLAvailable()) return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold color="yellow">Herramientas Windows (WSL)</Text>
      <Newline />
      <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={2} paddingY={1}>
        <Text color="red">WSL no esta disponible en este sistema.</Text>
        <Newline />
        <Text dimColor>Puede deberse a que:</Text>
        <Text dimColor>  El sistema se ejecuta en Linux nativo (no WSL)</Text>
        <Text dimColor>  WSL no esta instalado en este equipo Windows</Text>
        <Text dimColor>  wsl.exe no esta en el PATH del sistema</Text>
      </Box>
      <Newline />
      <Text dimColor>[Esc] Volver a categorias</Text>
    </Box>
  );
  if (distros.length === 0) return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold color="yellow">Herramientas Windows (WSL)</Text>
      <Newline />
      <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1}>
        <Text color="yellow">WSL detectado pero sin distribuciones instaladas.</Text>
        <Newline />
        <Text dimColor>Instala una distribucion desde Microsoft Store o con:</Text>
        <Text color="green">  wsl --install -d Ubuntu</Text>
      </Box>
      <Newline />
      <Text dimColor>[Esc] Volver a categorias</Text>
    </Box>
  );

  // ─── PACKAGES ────────────────────────────────────────
  if (step === 'packages') return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold color="yellow">Paquetes instalados en {selectedDistro}</Text>
      <Newline />
      <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} paddingY={1}>
        <Text dimColor>Gestor de paquetes: {pm || 'desconocido'}</Text>
        <Newline />
        <Text dimColor>Total: {packages.length} paquetes</Text>
        <Box flexDirection="column" marginTop={1} minHeight={10}>
          {packages.length === 0 && <Text color="yellow">(sin paquetes o error al listar)</Text>}
          {packages.slice(0, 50).map((pkg, i) => (
            <Box key={i}><Text color="cyan">  - {pkg.name}</Text><Text dimColor> ({pkg.version})</Text></Box>
          ))}
          {packages.length > 50 && <Text dimColor>... y {packages.length - 50} mas</Text>}
        </Box>
      </Box>
      <Newline />
      <Text dimColor>[Esc] Volver a detalles de distro</Text>
    </Box>
  );

  // ─── UPDATING ────────────────────────────────────────
  if (step === 'updating') return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold color="yellow">Actualizando paquetes en {selectedDistro}</Text>
      <Newline />
      <Box flexDirection="column" borderStyle="single" borderColor="green" paddingX={1} paddingY={1}>
        {output.length === 0 ? <Text color="yellow">Ejecutando actualizacion...</Text> : (
          output.slice(-20).map((line, i) => <Text key={i} wrap="wrap" dimColor>{line}</Text>)
        )}
      </Box>
      <Newline />
      <Text dimColor>[Esc] Volver</Text>
    </Box>
  );

  
  if (step === 'network') return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold color="yellow">Diagnostico de red en {selectedDistro}</Text>
      <Newline />
      <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
        {networkResult ? (
          <>
            <Box><Text color={networkResult.ping ? 'green' : 'red'}>{networkResult.ping ? 'V' : 'X'}</Text><Text> Ping a 8.8.8.8: {networkResult.ping ? 'OK' : 'Fall&oacute;'}</Text></Box>
            <Box><Text color={networkResult.dns ? 'green' : 'red'}>{networkResult.dns ? 'V' : 'X'}</Text><Text> Resolucion DNS: {networkResult.dns ? 'OK' : 'Fall&oacute;'}</Text></Box>
            <Box><Text color={networkResult.internet ? 'green' : 'red'}>{networkResult.internet ? 'V' : 'X'}</Text><Text> Acceso a internet: {networkResult.internet ? 'OK' : 'Fall&oacute;'}</Text></Box>
          </>
        ) : (
          <Text color="yellow">Ejecutando diagnostico...</Text>
        )}
      </Box>
      <Newline />
      <Text dimColor>[Esc] Volver a detalles de distro</Text>
    </Box>
  );

  // ─── AUTO REPAIR ─────────────────────────────────────
  if (step === 'repairing') return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold color="yellow">Auto-reparación - {selectedDistro}</Text>
      <Newline />
      <Box flexDirection="column" borderStyle="single" borderColor={autoRepair?.success ? 'green' : autoRepair ? 'red' : 'yellow'} paddingX={2} paddingY={1}>
        {autoRepair ? (
          <>
            <Text bold color={autoRepair.success ? 'green' : 'red'}>
              {autoRepair.success ? '✓ REPARACIÓN COMPLETADA' : '✗ REPARACIÓN CON ERRORES'}
            </Text>
            <Newline />
            <Text wrap="wrap">{autoRepair.output}</Text>
            <Newline />
            <Text dimColor>── Resumen ──</Text>
            <Text color={autoRepair.distroStarted ? 'green' : 'dimColor'}>  {autoRepair.distroStarted ? '✓' : '○'} Distro iniciada</Text>
            <Text color={autoRepair.toolsInstalled.length > 0 ? 'green' : 'dimColor'}>  {autoRepair.toolsInstalled.length > 0 ? '✓' : '○'} Herramientas instaladas: {autoRepair.toolsInstalled.length}</Text>
            <Text color={autoRepair.pathCreated ? 'green' : 'dimColor'}>  {autoRepair.pathCreated ? '✓' : '○'} Ruta inventario creada</Text>
            {autoRepair.errors.length > 0 && (
              <Box flexDirection="column">
                <Text color="red">  ✗ Errores: {autoRepair.errors.length}</Text>
                {autoRepair.errors.map((e, i) => <Text key={i} color="red" dimColor>    • {e}</Text>)}
              </Box>
            )}
          </>
        ) : (
          <Text color="yellow">Reparando distribución...</Text>
        )}
      </Box>
      <Newline />
      <Text dimColor>[Enter] Continuar a herramientas  [Esc] Volver</Text>
    </Box>
  );

  // ─── INVENTORY RESULT ────────────────────────────────
  if (step === 'inventory_result') return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold color="yellow">Herramientas de Inventario - {selectedDistro}</Text>
      <Newline />
      <Box flexDirection="column" borderStyle="single" borderColor={inventoryResult?.success ? 'green' : inventoryResult ? 'red' : 'yellow'} paddingX={1} paddingY={1}>
        {inventoryResult ? (
          <>
            <Text bold color={inventoryResult.success ? 'green' : 'red'}>
              {inventoryResult.success ? 'V' : 'X'} {inventoryResult.command}
            </Text>
            <Newline />
            <Text wrap="wrap">{inventoryResult.output}</Text>
          </>
        ) : (
          <Text color="yellow">Ejecutando...</Text>
        )}
      </Box>
      <Newline />
      <Text dimColor>[Esc] Volver a herramientas de distro</Text>
    </Box>
  );

  // ─── DISTRO DETAIL ───────────────────────────────────
  if (step === 'distro_detail' && selectedDistro && distroInfo) return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold color="yellow">{selectedDistro}</Text>
      <Newline />
      <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
        <Box><Text dimColor>SO:</Text><Text color="white"> {distroInfo.os || 'desconocido'}</Text></Box>
        <Box><Text dimColor>Kernel:</Text><Text color="white"> {distroInfo.kernel || 'desconocido'}</Text></Box>
        <Box><Text dimColor>Espacio libre:</Text><Text color="white"> {distroInfo.diskFree || 'desconocido'}</Text></Box>
        <Box><Text dimColor>Uptime:</Text><Text color="white"> {distroInfo.uptime || 'desconocido'}</Text></Box>
        <Box><Text dimColor>Gestor paquetes:</Text><Text color={pm ? 'green' : 'red'}> {pm || 'no detectado'}</Text></Box>
        {distroLocation && (
          <Box><Text dimColor>Ubicación disco:</Text><Text color="white" dimColor> {distroLocation}</Text></Box>
        )}
      </Box>
      <Newline />
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={2} paddingY={1}>
        <Text bold>Herramientas del sistema:</Text>
        <Box><Text color="green">[P] </Text><Text>Listar paquetes instalados ({packages.length})</Text></Box>
        <Box><Text color="green">[U] </Text><Text>Actualizar paquetes (apt upgrade / dnf update)</Text></Box>
        <Box><Text color="green">[N] </Text><Text>Diagnostico de red</Text></Box>
      </Box>
      <Newline />
      <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
        <Text bold>Estado de herramientas y ruta:</Text>
        <Box>
          <Text color={invPathExists === true ? 'green' : 'red'}>
            {invPathExists === true ? 'V' : 'X'}
          </Text>
          <Text> Ruta inventario en WSL: {getWSLInventoryPath(config.INVENTARIO_RAIZ)}</Text>
        </Box>
        <Box>
          <Text>Herramientas críticas: </Text>
          {toolsStatus ? (
            <>
              {(['find', 'sha256sum', 'wc', 'grep'] as const).map(t => (
                <Text key={t} color={toolsStatus[t] ? 'green' : 'red'}>
                  {' '}{toolsStatus[t] ? 'V' : 'X'}{t}
                </Text>
              ))}
            </>
          ) : (
            <Text color="yellow"> (verificando...)</Text>
          )}
        </Box>
      </Box>
      <Newline />
      <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={2} paddingY={1}>
        <Text bold color="yellow">GESTION DE ESTADOS - INVENTARIO TALLER:</Text>
        <Box><Text color="green">[1] </Text><Text>Resumen rapido del taller</Text></Box>
        <Box><Text color="green">[2] </Text><Text>Estado de archivos (verificados, pendientes, corruptos)</Text></Box>
        <Box><Text color="green">[3] </Text><Text>Estado por categoria (ISOs, Tools, Drivers)</Text></Box>
        <Box><Text color="green">[4] </Text><Text>Verificar integridad (hashes SHA-256)</Text></Box>
        <Box><Text color="green">[5] </Text><Text>ISOS listos para reparacion</Text></Box>
        <Box><Text color="green">[6] </Text><Text>Herramientas de diagnostico disponibles</Text></Box>
        <Box><Text color="green">[7] </Text><Text>Drivers por dispositivo</Text></Box>
        <Box><Text color="green">[C] </Text><Text>Limpiar archivos temporales</Text></Box>
        <Box><Text color="green">[D] </Text><Text>Buscar duplicados (SHA256)</Text></Box>
        <Box><Text color="green">[T] </Text><Text>Arbol del inventario</Text></Box>
        <Box><Text color="green">[I] </Text><Text>Instalar herramientas Linux (tree, findutils)</Text></Box>
        <Box><Text color="green">[S] </Text><Text>Crear acceso directo en WSL al inventario</Text></Box>
      </Box>
      <Newline />
      <Text dimColor>[P] Paquetes  [U] Actualizar  [N] Red  [R] Re-parar  |  [1-7] Inventario  [C] Limpiar  [D] Dup  [T] Arbol  [I] Instalar  [S] Symlink  [Esc] Volver</Text>
    </Box>
  );

  // ─── LIST ────────────────────────────────────────────
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold color="yellow">Herramientas Windows (WSL)</Text>
      <Newline />
      <Box flexDirection="column" borderStyle="single" borderColor="green" paddingX={2} paddingY={1}>
        <Text color="green" bold>WSL detectado - {distros.length} distribucion(es) instalada(s)</Text>
        <Newline />
        <Text dimColor>Selecciona una distribucion para ver sus herramientas:</Text>
        <Box flexDirection="column" marginTop={1}>
          {distros.map((d, i) => (
            <Box key={i}>
              <Text color="cyan">[{i + 1}]</Text>
              <Text> {d.name}</Text>
              {d.isDefault && <Text color="green" bold> (Predeterminada)</Text>}
              {d.state && <Text color="gray"> [{d.state}]</Text>}
              {d.version && <Text color="gray"> WSL{d.version}</Text>}
            </Box>
          ))}
        </Box>
      </Box>
      <Newline />
      <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={2} paddingY={1}>
        <Text bold color="yellow">Herramientas para el tecnico en reparacion:</Text>
        <Newline />
        <Text dimColor>SISTEMA: Paquetes, red, actualizacion, informacion de la distro</Text>
        <Text dimColor>INVENTARIO: Estados de archivos, ISOs listos, herramientas de</Text>
        <Text dimColor>           diagnostico, drivers por dispositivo, integridad,</Text>
        <Text dimColor>           limpieza, deteccion de duplicados</Text>
      </Box>
      <Newline />
      <Text dimColor>[1-{distros.length}] Seleccionar distro  [Esc] Volver a categorias</Text>
    </Box>
  );
}
