# LionFix v5

Sistema de gestión de inventario para talleres técnicos.
Terminal UI (React + Ink) con CLI.
<img width="640" height="640" alt="log" src="https://github.com/user-attachments/assets/2f5d5343-1883-42b8-8d92-29d763fd503c" />


## Stack

- **Runtime:** Node.js 20+ con TypeScript 5.5+
- **UI:** React 19 + Ink 7 (terminal UI)
- **CLI:** Commander
- **Exportación:** exceljs, pdfkit
- **Backups:** archiver (tar.gz)
- **Seguridad:** scrypt con salt + timingSafeEqual

## Instalación

```bash
# Producción (global)
npm install -g .
lionfix tui

# Desarrollo
npm install
npm run dev          # TUI interactiva
npm run dev -- state # JSON estado
```

## Estructura del proyecto

```
lionfix-v5/
├── bin/lionfix.js         ← Punto de entrada producción
├── src/
│   ├── index.ts           ← CLI principal (Comander)
│   ├── config/index.ts    ← Config.cfg loader/saver
│   ├── core/              ← Lógica de negocio
│   │   ├── auth.ts        ← Autenticación (scrypt, machine-id, rate-limit)
│   │   ├── backup.ts      ← Backup/restore tar.gz
│   │   ├── chatbot.ts     ← Asistente IA (OpenAI-compatible)
│   │   ├── changes.ts     ← Log de cambios
│   │   ├── diagnostics.ts ← Autodiagnóstico del sistema
│   │   ├── download-verify.ts ← Verificador de descargas
│   │   ├── errors.ts      ← Manejo de errores con retry
│   │   ├── export.ts      ← Exportar a XLSX/PDF/TXT
│   │   ├── integrity.ts   ← SHA-256 hash cache
│   │   ├── logger.ts      ← CSV activity log
│   │   ├── organizer.ts   ← Clasificador de archivos
│   │   ├── scheduler.ts   ← Gestión de tareas cron
│   │   ├── state.ts       ← Dashboard + conteos
│   │   ├── trash.ts       ← Papelera de reciclaje
│   │   ├── usb.ts         ← Detección/copia USB
│   │   ├── users-excel.ts ← Importar/exportar usuarios
│   │   ├── wsl.ts         ← Interacción con WSL2
│   │   └── wsl-inventory.ts ← Inventario desde WSL
│   ├── components/        ← 22 componentes TUI (Ink/React)
│   └── utils/format.ts    ← Utilidades compartidas
├── config.cfg             ← Configuración del sistema
├── inventario/            ← Datos del inventario
│   ├── .usuarios.db       ← Usuarios (hash scrypt)
│   ├── .hashes.sha256     ← Caché de hashes SHA-256
│   ├── actividades.csv    ← Log central de actividades
│   ├── backups/           ← Backups tar.gz
│   ├── usuarios/          ← Logs por usuario
│   └── por_clasificar/    ← Archivos pendientes
├── package.json
└── tsconfig.json
```

## Comandos CLI

| Comando | Descripción |
|---|---|
| `lionfix tui` | Interfaz interactiva (por defecto) |
| `lionfix init [user] [pass]` | Inicializar estructura del inventario |
| `lionfix organize` | Clasificar archivos pendientes |
| `lionfix verify` | Verificar integridad SHA-256 |
| `lionfix backup [crear\|listar\|restaurar]` | Gestión de backups |
| `lionfix export <txt\|xlsx\|pdf>` | Exportar actividades |
| `lionfix state` | Dashboard JSON |
| `lionfix trash [listar\|vaciar]` | Papelera |
| `lionfix usb [scan\|copy]` | Escáner USB |
| `lionfix user <crear\|listar\|cambiar-pass>` | Gestión de usuarios |
| `lionfix scheduler [listar\|instalar\|limpiar]` | Tareas cron |
| `lionfix diagnose` | Autodiagnóstico |
| `lionfix quick [flujo]` | Asistente rápido |
| `lionfix chat <mensaje>` | Asistente IA |
| `lionfix chat-config` | Configurar asistente IA |
| `lionfix import-users <archivo>` | Importar usuarios desde Excel |
| `lionfix system-users` | Usuarios del sistema operativo |
| `lionfix wsl-tools [comando]` | Herramientas WSL2 |

## Detección de plataforma

El sistema detecta automáticamente el entorno:

| Plataforma | Detección | Disco | USB | Cron |
|---|---|---|---|---|
| **Linux nativo** | `process.platform === 'linux'` + `/proc/version` sin "microsoft" | `df -B1` | `/media/$USER` | `crontab` |
| **WSL2** | `/proc/version` contiene "microsoft" | `df -B1` | PowerShell | `crontab` (en WSL) |
| **Windows** | `process.platform === 'win32'` | `wmic` | `wmic drivetype=2` | No disponible |
| **macOS** | `process.platform === 'darwin'` | `df -B1` | No implementado | No disponible |

## Cross-platform

- `npm install` → `postinstall` fija permisos de ejecución en Linux automáticamente
- Todos los paths usan `path.join()` (compatible Windows/Linux)
- Las rutas Windows (`C:\Users\...`) se convierten a `/mnt/c/...` en WSL
- Los comandos de plataforma no disponible fallan silenciosamente (try/catch)
- La config `config.cfg` se autogenera si no existe

## Seguridad

- **Contraseñas:** scrypt con salt aleatorio de 16 bytes
- **Machine ID:** Bind a `/etc/machine-id` o `hostname()` para evitar clonación
- **Rate limiting:** 3 intentos de login, bloqueo de 5 minutos
- **Timing attack:** `timingSafeEqual` en verificación de contraseñas
- **Cron:** Archivos temporales seguros con `mkdtempSync` y permisos `0o600`
- **Scheduler:** Validación whitelist de tareas (evita shell injection)
- **API Keys:** Solo se muestran los últimos 4 caracteres en pantalla

## Licencia

MIT
