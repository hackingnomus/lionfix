import { program } from 'commander';
import React from 'react';
import { render } from 'ink';
import { App } from './components/App.js';
import { loadConfig, saveConfig } from './config/index.js';
import { join, basename, extname } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, mkdirSync, renameSync, readFileSync, writeFileSync, readdirSync, statSync, copyFileSync, unlinkSync } from 'node:fs';
import { classifyFile, getPendingFiles, classifyByExtension, resolveCollision, calculateFileHash, findInventoryDuplicates } from './core/organizer.js';
import { createBackup, listBackups, restoreBackup } from './core/backup.js';
import { checkFileIntegrity, parseHashDB, serializeHashDB } from './core/integrity.js';
import { logActivity, readLog, parseLog } from './core/logger.js';
import { generateXLSX, generatePDF, generateTXTReport } from './core/export.js';
import { hashPassword, sanitizeUsername, saveUser, getCurrentMachineId, loadUsers, userExists } from './core/auth.js';
import { getDashboard } from './core/state.js';
import { listTrash, emptyTrash, moveToTrash, TrashEntry } from './core/trash.js';
import { isCronAvailable, listCronTasks, installCronTask, removeAllLionFixTasks } from './core/scheduler.js';
import { verifyDownload, verifyDownloadDir } from './core/download-verify.js';
import { runDiagnostics } from './core/diagnostics.js';
import { importUsersFromExcel, readSystemUsers } from './core/users-excel.js';
import { getWSLDistros, getWSLDistroInfo, isWSLAvailable, detectWSLPackageManager, listWSLPackages, checkWSLNetwork, execInWSL } from './core/wsl.js';
import { loadChatbotConfig, saveChatbotConfig, isChatbotConfigured, askChatbot, generateReportWithAI, getReportData } from './core/chatbot.js';

program
  .name('lionfix')
  .description('LionFix - Gestión de Inventario para Talleres')
  .version('5.0.0');

program
  .command('tui', { isDefault: true })
  .description('Iniciar interfaz de terminal interactiva')
  .action(() => {
    render(React.createElement(App, { exportMode: false, renderMode: false }));
  });

program
  .command('init')
  .description('Inicializar estructura del inventario')
  .argument('[usuario]', 'Nombre del técnico')
  .argument('[password]', 'Contraseña del técnico')
  .action(async (usuario?: string, password?: string) => {
    const cfg = loadConfig();
    const root = cfg.INVENTARIO_RAIZ;

    const dirs = [
      root,
      join(root, 'por_clasificar'),
      join(root, 'ISOs', 'Windows'),
      join(root, 'ISOs', 'Linux', 'Ubuntu'),
      join(root, 'ISOs', 'Linux', 'Mint'),
      join(root, 'ISOs', 'Linux', 'Debian'),
      join(root, 'ISOs', 'Linux', 'Fedora'),
      join(root, 'ISOs', 'Linux', 'Otros'),
      join(root, 'ISOs', 'Herramientas', 'HirensBootCD'),
      join(root, 'ISOs', 'Herramientas', 'Clonezilla'),
      join(root, 'ISOs', 'Herramientas', 'UltimateBootCD'),
      join(root, 'ISOs', 'Otros'),
      join(root, 'Herramientas', 'Diagnostico_Disco'),
      join(root, 'Herramientas', 'Recuperacion_Datos'),
      join(root, 'Herramientas', 'RAM'),
      join(root, 'Herramientas', 'Sistema'),
      join(root, 'Herramientas', 'Otros'),
      join(root, 'Drivers', 'Red', 'Realtek'),
      join(root, 'Drivers', 'Red', 'Intel'),
      join(root, 'Drivers', 'Red', 'Generico'),
      join(root, 'Drivers', 'Audio', 'Generico'),
      join(root, 'Drivers', 'Video', 'NVIDIA'),
      join(root, 'Drivers', 'Video', 'AMD'),
      join(root, 'Drivers', 'Video', 'Generico'),
      join(root, 'Drivers', 'Chipset', 'Generico'),
      join(root, 'Drivers', 'Otros', 'Generico'),
      join(root, 'Documentos'),
      join(root, 'Otros'),
      join(root, 'backups'),
      join(root, 'usuarios'),
    ];

    for (const d of dirs) {
      mkdirSync(d, { recursive: true });
      console.log(`  ✓ ${d}`);
    }

    writeFileSync(join(root, '.machine_id'), getCurrentMachineId(), 'utf-8');

    if (usuario) {
      const safe = sanitizeUsername(usuario);
      const pass = password || safe;
      saveUser(root, safe, hashPassword(pass));
      console.log(`\n  Usuario creado: ${safe}`);
      const cfg2 = loadConfig();
      saveConfig('TECNICO', safe);
    }

    console.log(`\n✓ Inventario inicializado en: ${root}`);
  });

program
  .command('organize')
  .description('Clasificar archivos pendientes en por_clasificar/')
  .option('-s, --simple', 'Usar clasificación simple solo por extensión')
  .option('-d, --desde-downloads', 'Importar archivos desde Downloads primero')
  .action(async (options) => {
    const cfg = loadConfig();
    const root = cfg.INVENTARIO_RAIZ;
    const porClasificar = join(root, 'por_clasificar');

    if (options.desdeDownloads) {
      const downloadsDir = cfg.DOWNLOADS_DIR || join(homedir(), 'Downloads');
      if (!existsSync(downloadsDir)) {
        console.log(`✗ Directorio de descargas no existe: ${downloadsDir}`);
      } else {
        const exts = /\.(iso|img|exe|msi|zip|rar|7z|pdf|doc|docx|txt|sh|bat)$/i;
        const files = readdirSync(downloadsDir).filter(f => exts.test(f));
        if (files.length === 0) {
          console.log('No se encontraron archivos para importar en Downloads.');
        } else {
          mkdirSync(porClasificar, { recursive: true });
          let copied = 0;
          for (const f of files) {
            const src = join(downloadsDir, f);
            const dest = join(porClasificar, f);
            if (!existsSync(dest)) {
              try {
                copyFileSync(src, dest);
                logActivity(root, cfg.TECNICO, 'importar_downloads', dest, '*', 'OK');
                copied++;
              } catch { }
            }
          }
          console.log(`✓ Importados ${copied} archivos desde Downloads.`);
        }
      }
    }

    if (!existsSync(porClasificar)) {
      mkdirSync(porClasificar, { recursive: true });
      console.log('Creado directorio por_clasificar/. No hay archivos pendientes.');
      return;
    }

    const files = getPendingFiles(porClasificar);
    if (files.length === 0) {
      console.log('No hay archivos pendientes en por_clasificar/.');
      return;
    }

    let ok = 0;
    let err = 0;
    let dup = 0;
    let colisiones = 0;
    for (const f of files) {
      const src = join(porClasificar, f);
      const ext = extname(f).slice(1);
      const category = options.simple ? classifyByExtension(ext) : classifyFile(f, ext);
      const destDir = join(root, category);
      mkdirSync(destDir, { recursive: true });
      let dest = join(destDir, f);
      try {
        
        const srcHash = await calculateFileHash(src);
        const existingDuplicates = await findInventoryDuplicates(root, srcHash, f);
        if (existingDuplicates.length > 0) {
          console.log(`  ℹ ${f} → duplicado (hash coincide con ${basename(existingDuplicates[0])})`);
          try { unlinkSync(src); } catch { }
          logActivity(root, cfg.TECNICO, 'organizar', f, '*', 'DUPLICADO');
          dup++;
          continue;
        }

        if (existsSync(dest)) {
          const newName = resolveCollision(destDir, f);
          dest = join(destDir, newName);
          colisiones++;
          console.log(`  ~ ${f} → ${category}/ (colisión, renombrado a ${newName})`);
        }
        renameSync(src, dest);
        logActivity(root, cfg.TECNICO, 'organizar', dest, '*', 'OK');
        console.log(`  ✓ ${f} → ${category}/`);
        ok++;
      } catch (e) {
        console.log(`  ✗ ${f} → error: ${(e as Error).message}`);
        err++;
      }
    }
    console.log(`\nClasificados: ${ok}  Duplicados: ${dup}  Colisiones: ${colisiones}  Errores: ${err}`);
  });

program
  .command('verify')
  .description('Verificar integridad SHA-256 del inventario')
  .option('-f, --full', 'Forzar verificación completa (ignorar caché)')
  .option('-y, --yes', 'No preguntar, solo reportar')
  .action(async (options) => {
    const cfg = loadConfig();
    const root = cfg.INVENTARIO_RAIZ;
    const hashDbPath = join(root, '.hashes.sha256');
    const tecnico = cfg.TECNICO;

    const prevHashDb = existsSync(hashDbPath) ? readFileSync(hashDbPath, 'utf-8') : '';
    const cache = parseHashDB(prevHashDb);
    const newCache = new Map<string, { hash: string; mtime: number; size: number }>();

    let ok = 0;
    let corrupto = 0;
    let nuevo = 0;
    const corruptFiles: { full: string; rel: string; hash: string }[] = [];

    async function walk(dir: string, prefix: string) {
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith('.') || entry === 'backups') continue;
        const full = join(dir, entry);
        const rel = prefix ? `${prefix}/${entry}` : entry;
        if (statSync(full).isDirectory()) {
          await walk(full, rel);
        } else {
          const cached = options.full ? undefined : cache.get(rel);
          const result = await checkFileIntegrity(full, rel, cached);
          if (result.status === 'OK') ok++;
          else if (result.status === 'CORRUPTO') {
            corrupto++;
            corruptFiles.push({ full, rel, hash: result.hash });
          } else nuevo++;
          newCache.set(rel, { hash: result.hash, mtime: result.mtime, size: result.size });
        }
      }
    }

    console.log('Verificando integridad SHA-256...');
    console.log(`Directorio: ${root}\n`);

    await walk(root, '');

    writeFileSync(hashDbPath, serializeHashDB(newCache), 'utf-8');

    console.log(`\nResultados:`);
    console.log(`  ✓ OK:       ${ok}`);
    console.log(`  ✗ CORRUPTO: ${corrupto}`);
    console.log(`  ○ NUEVO:    ${nuevo}`);
    console.log(`  Total:      ${ok + corrupto + nuevo}`);

    if (corrupto > 0 && !options.yes && process.stdin.isTTY) {
      console.log('\n⚠ Se detectaron archivos corruptos.');
      for (const cf of corruptFiles) {
        console.log(`  • ${cf.rel}`);
      }
      console.log('\nOpciones:');
      console.log('  [T] Mover TODOS a la papelera');
      console.log('  [S] Saltar y mantenerlos en el registro');
      console.log('  [I] Ignorar (no hacer nada)');
      const readline = await import('node:readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => {
        rl.question('Elige una opción (T/S/I): ', resolve);
      });
      const opc = answer.trim().toLowerCase();
      rl.close();
      console.log(opc);

      if (opc === 't') {
        for (const cf of corruptFiles) {
          const trashPath = moveToTrash(cf.full, root, tecnico);
          if (trashPath) {
            logActivity(root, tecnico, 'mover_papelera', cf.rel, '*', 'CORRUPTO_HASH');
            console.log(`  → ${cf.rel} enviado a papelera`);
          }
        }
        for (const cf of corruptFiles) {
          newCache.delete(cf.rel);
        }
      } else if (opc === 's') {
        console.log('  Corruptos mantenidos en el registro con hash actual.');
      } else {
        console.log('  Corruptos ignorados.');
      }

      writeFileSync(hashDbPath, serializeHashDB(newCache), 'utf-8');
    } else if (corrupto > 0) {
      console.log('\n⚠ Se detectaron archivos corruptos.');
      if (!options.yes) process.exit(1);
    }
  });

program
  .command('backup')
  .description('Gestión de backups')
  .argument('[accion]', 'crear, listar, restaurar')
  .argument('[archivo]', 'Nombre del backup a restaurar (para accion=restaurar)')
  .action(async (accion?: string, archivo?: string) => {
    const cfg = loadConfig();
    const root = cfg.INVENTARIO_RAIZ;
    const tecnico = cfg.TECNICO;

    if (!accion || accion === 'crear') {
      console.log('Creando backup...');
      const result = await createBackup(root, tecnico);
      console.log(`✓ Backup creado: ${result.path}`);
      console.log(`  Tamaño: ${result.size}`);
      return;
    }

    if (accion === 'listar') {
      const backups = listBackups(root);
      if (backups.length === 0) {
        console.log('No hay backups disponibles.');
        return;
      }
      console.log('Backups disponibles:\n');
      backups.forEach((b, i) => {
        const name = basename(b);
        const size = existsSync(b) ? statSync(b).size : 0;
        const sizeStr = size > 1048576
          ? `${(size / 1048576).toFixed(1)} MB`
          : `${(size / 1024).toFixed(1)} KB`;
        console.log(`  ${i + 1}. ${name} (${sizeStr})`);
      });
      return;
    }

    if (accion === 'restaurar') {
      const backups = listBackups(root);
      if (backups.length === 0) {
        console.log('No hay backups para restaurar.');
        return;
      }
      const target = archivo
        ? backups.find(b => basename(b).includes(archivo))
        : backups[0];
      if (!target) {
        console.log(`No se encontró backup: ${archivo}`);
        return;
      }
      console.log(`Restaurando: ${basename(target)}...`);
      await restoreBackup(target, root, tecnico);
      console.log('✓ Backup restaurado correctamente.');
      return;
    }

    console.log('Uso: lionfix backup [crear|listar|restaurar] [archivo]');
  });

program
  .command('verify-download')
  .description('Verificar que un archivo de descarga esté completo')
  .argument('<archivo>', 'Ruta al archivo a verificar')
  .option('--dir', 'Escáner todo un directorio')
  .action((archivo: string, options) => {
    if (options.dir) {
      const results = verifyDownloadDir(archivo);
      if (results.length === 0) { console.log('No hay archivos en el directorio.'); return; }
      let ok = 0, fail = 0;
      for (const r of results) {
        if (r.ok) { console.log(`  ✓ ${r.file}`); ok++; }
        else { console.log(`  ✗ ${r.file} — ${r.reason}`); fail++; }
      }
      console.log(`\nVálidos: ${ok}  Inválidos: ${fail}`);
    } else {
      const result = verifyDownload(archivo);
      if (result.ok) console.log(`✓ ${archivo} — archivo válido`);
      else console.log(`✗ ${archivo} — ${result.reason}`);
    }
  });

program
  .command('quick')
  .description('Asistente rápido: ejecuta múltiples operaciones')
  .argument('[flujo]', 'organize-verify, export, backup')
  .action(async (flujo?: string) => {
    const cfg = loadConfig();
    const root = cfg.INVENTARIO_RAIZ;
    const t = cfg.TECNICO;
    const f = flujo || 'organize-verify';

    if (f === 'organize-verify') {
      
      const porClasificar = join(root, 'por_clasificar');
      if (existsSync(porClasificar)) {
        const files = getPendingFiles(porClasificar);
        if (files.length > 0) {
          console.log(`\n📦 Organizando ${files.length} archivos...`);
          let ok = 0, dup = 0, col = 0;
          for (const file of files) {
            const src = join(porClasificar, file);
            const ext = extname(file).slice(1);
            const category = classifyFile(file, ext);
            const destDir = join(root, category);
            mkdirSync(destDir, { recursive: true });
            let dest = join(destDir, file);
            try {
              const srcHash = await calculateFileHash(src);
              const existingDuplicates = await findInventoryDuplicates(root, srcHash, file);
              if (existingDuplicates.length > 0) {
                try { unlinkSync(src); } catch { }
                logActivity(root, t, 'organizar', file, '*', 'DUPLICADO');
                dup++;
                continue;
              }
              if (existsSync(dest)) {
                dest = join(destDir, resolveCollision(destDir, file));
                col++;
              }
              renameSync(src, dest); logActivity(root, t, 'organizar', dest, '*', 'OK'); ok++;
            } catch {}
          }
          console.log(`  ✓ ${ok} clasificados  Dup:${dup}  Col:${col}`);
        } else console.log('  Sin archivos pendientes');
      }

      
      console.log('🔍 Verificando integridad...');
      const hashDbPath = join(root, '.hashes.sha256');
      const prevHashDb = existsSync(hashDbPath) ? readFileSync(hashDbPath, 'utf-8') : '';
      const cache = parseHashDB(prevHashDb);
      const newCache = new Map<string, { hash: string; mtime: number; size: number }>();
      let ok = 0, corrupto = 0, nuevo = 0;
      async function walk(dir: string, prefix: string) {
        for (const entry of readdirSync(dir)) {
          if (entry.startsWith('.') || entry === 'backups') continue;
          const full = join(dir, entry);
          const rel = prefix ? `${prefix}/${entry}` : entry;
          if (statSync(full).isDirectory()) { await walk(full, rel); continue; }
          const result = await checkFileIntegrity(full, rel, cache.get(rel));
          if (result.status === 'OK') ok++; else if (result.status === 'CORRUPTO') corrupto++; else nuevo++;
          newCache.set(rel, { hash: result.hash, mtime: result.mtime, size: result.size });
        }
      }
      await walk(root, '');
      writeFileSync(hashDbPath, serializeHashDB(newCache), 'utf-8');
      console.log(`  ✓ OK:${ok}  CORRUPTO:${corrupto}  NUEVO:${nuevo}`);

      
      console.log('📄 Generando informe Excel...');
      const entries = parseLog(readLog(root));
      const reportPath = join(root, `informe_rapido_${Date.now()}.xlsx`);
      try { await (await import('./core/export.js')).generateXLSX(entries, reportPath); console.log(`  ✓ ${reportPath}`); }
      catch { console.log('  ✗ Error generando informe'); }
    } else if (f === 'export') {
      const entries = parseLog(readLog(root));
      const reportPath = join(root, `informe_rapido_${Date.now()}.xlsx`);
      console.log('Exportando actividades...');
      try { await (await import('./core/export.js')).generateXLSX(entries, reportPath); console.log(`✓ ${reportPath}`); }
      catch { console.log('✗ Error exportando'); }
    } else if (f === 'backup') {
      console.log('Creando backup...');
      try { const r = await createBackup(root, t); console.log(`✓ ${r.path} (${r.size})`); }
      catch { console.log('✗ Error creando backup'); }
    }
  });

program
  .command('export')
  .description('Exportar actividades')
  .argument('<tipo>', 'txt, xlsx, o pdf')
  .option('-o, --output <path>', 'Ruta de salida')
  .option('-u, --usuario <user>', 'Filtrar por usuario')
  .option('--desde <fecha>', 'Fecha inicial (YYYY-MM-DD)')
  .option('--hasta <fecha>', 'Fecha final (YYYY-MM-DD)')
  .action(async (tipo, options) => {
    const cfg = loadConfig();
    const root = cfg.INVENTARIO_RAIZ;
    const csv = readLog(root);
    let entries = parseLog(csv);

    if (options.usuario) {
      entries = entries.filter(e => e.TECNICO.toLowerCase() === options.usuario.toLowerCase());
    }
    if (options.desde) {
      entries = entries.filter(e => e.FECHA >= options.desde);
    }
    if (options.hasta) {
      entries = entries.filter(e => e.FECHA <= options.hasta);
    }

    const output = options.output || join(root, `informe_${Date.now()}.${tipo}`);

    console.log(`Exportando ${entries.length} actividades a ${tipo}...`);

    const title = `LionFix - Informe de Actividades (${new Date().toLocaleDateString()})`;

    try {
      if (tipo === 'xlsx') {
        await generateXLSX(entries, output);
      } else if (tipo === 'pdf') {
        await generatePDF(title, entries, output);
      } else {
        generateTXTReport(title, entries, output);
      }
      logActivity(root, cfg.TECNICO, `exportar_${tipo}`, output, '*', 'OK');
      console.log(`✓ Exportado: ${output}`);
    } catch (e) {
      console.error(`Error exportando: ${(e as Error).message}`);
      logActivity(root, cfg.TECNICO, `exportar_${tipo}`, output, '*', 'ERROR');
      process.exit(1);
    }
  });

program
  .command('state')
  .description('Mostrar estado del inventario en JSON')
  .action(async () => {
    const cfg = loadConfig();
    const data = await getDashboard(cfg.INVENTARIO_RAIZ);
    console.log(JSON.stringify(data, null, 2));
  });

program
  .command('trash')
  .description('Gestión de papelera')
  .argument('[accion]', 'listar, vaciar')
  .action((accion?: string) => {
    const cfg = loadConfig();
    const root = cfg.INVENTARIO_RAIZ;

    if (!accion || accion === 'listar') {
      const items = listTrash(root);
      if (items.length === 0) {
        console.log('Papelera vacía.');
        return;
      }
      console.log('Elementos en la papelera:\n');
      items.forEach((item: TrashEntry, i: number) => {
        console.log(`  ${i + 1}. ${item.nombre_original}`);
        console.log(`     Original: ${item.ruta_original}`);
        console.log(`     Fecha:    ${item.fecha}`);
        console.log(`     Técnico:  ${item.tecnico}\n`);
      });
      return;
    }

    if (accion === 'vaciar') {
      const count = emptyTrash(root);
      console.log(`✓ Papelera vaciada: ${count} elementos eliminados.`);
      return;
    }

    console.log('Uso: lionfix trash [listar|vaciar]');
  });

program
  .command('usb')
  .description('Escáner USB / Copiar archivos')
  .argument('[accion]', 'scan (default) o copy')
  .action(async (accion?: string) => {
    const { detectPlatform, detectUSBDrives, scanUSBDrive, copyFromUSB } = await import('./core/usb.js');
    const cfg = loadConfig();
    const plat = detectPlatform();
    console.log(`Plataforma detectada: ${plat}\n`);

    const drives = detectUSBDrives(plat);
    if (drives.length === 0) {
      console.log('No se detectaron unidades USB.');
      return;
    }

    const action = accion || 'scan';

    if (action === 'copy') {
      const destDir = join(cfg.INVENTARIO_RAIZ, 'por_clasificar');
      for (const drv of drives) {
        console.log(`Copiando desde: ${drv}`);
        const result = copyFromUSB(drv, destDir);
        console.log(`  Copiados: ${result.copied}  Saltados: ${result.skipped}\n`);
        if (result.copied > 0) {
          logActivity(cfg.INVENTARIO_RAIZ, cfg.TECNICO, 'usb_copy', drv, '*', `OK:${result.copied}`);
        }
      }
      return;
    }

    for (const drv of drives) {
      const info = await scanUSBDrive(drv);
      console.log(`  ${drv}`);
      console.log(`    ISOs:         ${info.isos}`);
      console.log(`    Herramientas: ${info.tools}`);
      console.log(`    Drivers:      ${info.drivers}`);
      console.log(`    Total:        ${info.total}\n`);
    }
  });

program
  .command('user')
  .description('Administrar usuarios')
  .argument('<accion>', 'crear, listar, cambiar-pass')
  .argument('[usuario]', 'Nombre del usuario')
  .argument('[password]', 'Contraseña')
  .action((accion: string, usuario?: string, password?: string) => {
    const cfg = loadConfig();
    const root = cfg.INVENTARIO_RAIZ;

    if (accion === 'listar') {
      const users = loadUsers(root);
      if (users.length === 0) {
        console.log('No hay usuarios registrados.');
        return;
      }
      console.log('Usuarios:\n');
      users.forEach((u: { username: string }) => console.log(`  • ${u.username}`));
      return;
    }

    if (accion === 'crear') {
      if (!usuario) { console.log('Uso: lionfix user crear <usuario> [password]'); return; }
      const safe = sanitizeUsername(usuario);
      if (userExists(root, safe)) { console.log(`El usuario '${safe}' ya existe.`); return; }
      const pass = password || safe;
      saveUser(root, safe, hashPassword(pass));
      console.log(`✓ Usuario '${safe}' creado.`);
      return;
    }

    if (accion === 'cambiar-pass') {
      if (!usuario || !password) { console.log('Uso: lionfix user cambiar-pass <usuario> <password>'); return; }
      const safe = sanitizeUsername(usuario);
      if (!userExists(root, safe)) { console.log(`El usuario '${safe}' no existe.`); return; }
      saveUser(root, safe, hashPassword(password));
      console.log(`✓ Contraseña actualizada para '${safe}'.`);
      return;
    }

    console.log('Uso: lionfix user [crear|listar|cambiar-pass] [usuario] [password]');
  });

program
  .command('scheduler')
  .description('Gestionar tareas programadas (cron)')
  .argument('[accion]', 'listar, instalar, limpiar')
  .option('--tarea <tarea>', 'Tipo de tarea: backup, verify')
  .option('--schedule <expr>', 'Expresión cron')
  .action((accion?: string, options?: Record<string, string>) => {
    const cfg = loadConfig();
    const root = cfg.INVENTARIO_RAIZ;

    if (!isCronAvailable()) {
      const label = process.platform === 'win32' ? 'Task Scheduler (schtasks)' : 'crontab';
      console.log(`⚠ ${label} no está disponible en este sistema.`);
      return;
    }

    if (!accion || accion === 'listar') {
      const tasks = listCronTasks();
      if (tasks.length === 0) {
        console.log('No hay tareas LionFix programadas.');
        return;
      }
      console.log('Tareas programadas:\n');
      tasks.forEach((t: string) => console.log(`  ${t}`));
      return;
    }

    if (accion === 'instalar') {
      const allowedTareas = ['backup', 'verify', 'export', 'organize', 'trash-empty'];
      const tarea = (options?.tarea && allowedTareas.includes(options.tarea)) ? options.tarea : 'backup';
      const schedule = options?.schedule || '0 2 * * 0';
      const binPath = join(process.cwd(), 'bin', 'lionfix.js');
      const runner = existsSync(binPath) ? `node ${binPath}` : `npx tsx ${join(process.cwd(), 'src/index.ts')}`;
      const cmd = `cd ${process.cwd()} && ${runner} ${tarea}`;
      installCronTask(schedule, cmd, `LionFix_${tarea}`);
      console.log(`✓ Tarea '${tarea}' instalada con schedule: ${schedule}`);
      return;
    }

    if (accion === 'limpiar') {
      removeAllLionFixTasks();
      console.log('✓ Todas las tareas LionFix eliminadas.');
      return;
    }

    console.log('Uso: lionfix scheduler [listar|instalar|limpiar] [--tarea backup|verify] [--schedule "cron"]');
  });

program
  .command('diagnose')
  .description('Ejecutar autodiagnóstico del sistema')
  .action(() => {
    const cfg = loadConfig();
    const results = runDiagnostics(cfg.INVENTARIO_RAIZ);

    console.log('Autodiagnóstico del sistema LionFix\n');
    let ok = 0, warn = 0, err = 0;
    for (const r of results) {
      const icon = r.status === 'ok' ? '✓' : r.status === 'warn' ? '⚠' : '✗';
      const color = r.status === 'ok' ? '' : r.status === 'warn' ? 'yellow' : 'red';
      console.log(`  ${icon} [${r.status.toUpperCase()}] ${r.check}: ${r.message}`);
      if (r.status === 'ok') ok++;
      else if (r.status === 'warn') warn++;
      else err++;
    }
    console.log(`\nResultados: ${ok} OK, ${warn} advertencias, ${err} errores`);
    if (err > 0) process.exit(1);
  });

program
  .command('chat')
  .description('Asistente IA por línea de comandos')
  .argument('<mensaje>', 'Consulta para el asistente')
  .option('-r, --report', 'Generar reporte del sistema con IA')
  .action(async (mensaje: string, options) => {
    const cfg = loadConfig();
    if (!isChatbotConfigured(cfg.INVENTARIO_RAIZ)) {
      console.log('⚠ API Key no configurada. Usa: lionfix chat-config');
      process.exit(1);
    }

    if (options.report) {
      const result = await generateReportWithAI(cfg.INVENTARIO_RAIZ, cfg.INVENTARIO_RAIZ, mensaje);
      console.log(result);
    } else {
      const result = await askChatbot(cfg.INVENTARIO_RAIZ, cfg.INVENTARIO_RAIZ, mensaje);
      console.log(`\n${result.content}\n`);
    }
  });

program
  .command('chat-config')
  .description('Configurar el asistente IA')
  .option('--api-key <key>', 'API Key del proveedor')
  .option('--model <modelo>', 'Modelo IA (ej: gpt-3.5-turbo, claude-3, gemini-pro)')
  .option('--base-url <url>', 'URL base de la API')
  .option('--show', 'Mostrar configuración actual')
  .action((options) => {
    const cfg = loadConfig();
    if (options.show) {
      const chatCfg = loadChatbotConfig(cfg.INVENTARIO_RAIZ);
      console.log('Configuración del Asistente IA:');
      console.log(`  API Key: ${chatCfg.apiKey ? '********' + chatCfg.apiKey.slice(-4) : '(no configurada)'}`);
      console.log(`  Modelo: ${chatCfg.model}`);
      console.log(`  Base URL: ${chatCfg.baseUrl}`);
      return;
    }
    if (options.apiKey) {
      saveChatbotConfig(cfg.INVENTARIO_RAIZ, { apiKey: options.apiKey });
      console.log('✓ API Key configurada');
    }
    if (options.model) {
      saveChatbotConfig(cfg.INVENTARIO_RAIZ, { model: options.model });
      console.log(`✓ Modelo configurado: ${options.model}`);
    }
    if (options.baseUrl) {
      saveChatbotConfig(cfg.INVENTARIO_RAIZ, { baseUrl: options.baseUrl });
      console.log(`✓ Base URL configurada: ${options.baseUrl}`);
    }
  });

program
  .command('import-users')
  .description('Importar usuarios desde archivo Excel')
  .argument('<archivo>', 'Ruta al archivo Excel (.xlsx)')
  .option('--set-tecnico', 'Establecer el primer usuario importado como TECNICO activo')
  .action(async (archivo: string, options) => {
    const cfg = loadConfig();
    console.log(`Importando usuarios desde: ${archivo}`);
    const result = await importUsersFromExcel(cfg.INVENTARIO_RAIZ, archivo, cfg.TECNICO, !!options.setTecnico);
    console.log(`  Importados: ${result.imported}`);
    console.log(`  Omitidos: ${result.skipped}`);
    console.log(`  Ruta guardada en config: EXCEL_USERS_PATH=${archivo}`);
    if (result.users.length > 0) {
      console.log(`  Usuarios: ${result.users.join(', ')}`);
    }
    if (result.errors.length > 0) {
      console.log('  Errores:');
      result.errors.forEach(e => console.log(`    ✗ ${e}`));
    }
  });

program
  .command('system-users')
  .description('Listar usuarios del sistema operativo')
  .action(() => {
    const users = readSystemUsers();
    if (users.length === 0) {
      console.log('No se pudieron detectar usuarios del sistema.');
      return;
    }
    console.log('Usuarios del sistema operativo:');
    users.forEach(u => console.log(`  • ${u.username}${u.fullName ? ` (${u.fullName})` : ''}`));
  });

program
  .command('wsl-tools')
  .description('Herramientas WSL2')
  .argument('[comando]', 'info, packages, network, update')
  .argument('[distro]', 'Nombre de la distro (opcional, usa predeterminada si se omite)')
  .action((comando?: string, distro?: string) => {
    if (!isWSLAvailable()) {
      console.log('⚠ WSL no está disponible en este sistema.');
      return;
    }

    const distros = getWSLDistros();
    if (distros.length === 0) {
      console.log('No hay distribuciones WSL instaladas.');
      return;
    }

    const target = distro
      ? distros.find(d => d.name.toLowerCase().includes(distro.toLowerCase()))
      : distros.find(d => d.isDefault) || distros[0];

    if (!target) {
      console.log(`Distro '${distro}' no encontrada.`);
      console.log('Disponibles:');
      distros.forEach(d => console.log(`  • ${d.name}`));
      return;
    }

    if (!comando || comando === 'info') {
      const info = getWSLDistroInfo(target.name);
      console.log(`Distro: ${target.name}`);
      console.log(`  SO: ${info.os || 'desconocido'}`);
      console.log(`  Kernel: ${info.kernel || 'desconocido'}`);
      console.log(`  Espacio libre: ${info.diskFree || 'desconocido'}`);
      console.log(`  Uptime: ${info.uptime || 'desconocido'}`);
      const pm = detectWSLPackageManager(target.name);
      console.log(`  Gestor paquetes: ${pm || 'no detectado'}`);
    } else if (comando === 'packages') {
      const pm = detectWSLPackageManager(target.name);
      if (!pm) { console.log('No se pudo detectar el gestor de paquetes.'); return; }
      const pkgs = listWSLPackages(target.name, pm);
      console.log(`Paquetes instalados en ${target.name} (${pkgs.length}):`);
      pkgs.slice(0, 30).forEach(p => console.log(`  • ${p.name} ${p.version}`));
      if (pkgs.length > 30) console.log(`  ... y ${pkgs.length - 30} más`);
    } else if (comando === 'network') {
      const result = checkWSLNetwork(target.name);
      console.log(`Diagnóstico de red en ${target.name}:`);
      console.log(`  Ping: ${result.ping ? '✓ OK' : '✗ Falló'}`);
      console.log(`  DNS: ${result.dns ? '✓ OK' : '✗ Falló'}`);
      console.log(`  Internet: ${result.internet ? '✓ OK' : '✗ Falló'}`);
    } else if (comando === 'update') {
      const pm = detectWSLPackageManager(target.name);
      if (!pm) { console.log('No se pudo detectar el gestor de paquetes.'); return; }
      console.log(`Actualizando paquetes en ${target.name}...`);
      const output = execInWSL(target.name,
        pm === 'apt' ? 'sudo -n apt update && sudo -n apt upgrade -y' :
        pm === 'dnf' ? 'dnf update -y' :
        pm === 'yum' ? 'yum update -y' :
        'sudo -n apt update && sudo -n apt upgrade -y'
      );
      console.log(output);
    }
  });

program.exitOverride();

try {
  program.parse(process.argv);
} catch (e: unknown) {
  const err = e as { code?: string; message?: string };
  if (err.code === 'commander.helpDisplayed' || err.code === 'commander.versionDisplayed') {
    
  } else {
    console.error(err.message || String(e));
    process.exit(1);
  }
}

