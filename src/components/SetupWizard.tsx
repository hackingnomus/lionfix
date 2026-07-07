import React, { useState } from 'react';
import { Box, Text, useInput, Newline } from 'ink';
import type { Config } from '../config/index.js';
import { saveConfig, loadConfig } from '../config/index.js';
import { saveUserAndCreateDir, sanitizeUsername, hashPassword } from '../core/auth.js';
import { logUserRegistrationToExcel } from '../core/users-excel.js';
import { mkdirSync } from 'node:fs';

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

interface SetupWizardProps {
  config: Config;
  onComplete: (config: Config) => void;
}

export function SetupWizard({ config, onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<'inicio' | 'tecnico' | 'pass' | 'confirm' | 'done'>('inicio');
  const [tecnico, setTecnico] = useState(config.TECNICO || process.env.USER || 'tecnico');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [error, setError] = useState('');

  useInput((input, key) => {
    if (key.escape) {
      process.exit(0);
      return;
    }

    if (step === 'inicio' && key.return) {
      setStep('tecnico');
      return;
    }

    if (step === 'tecnico') {
      if (key.return) {
        const safe = sanitizeUsername(tecnico.trim());
        if (safe.length > 0) {
          setTecnico(safe);
          setStep('pass');
          setError('');
        } else {
          setError('El usuario no puede estar vacío');
        }
        return;
      }
      if (key.backspace || key.delete) setTecnico(tecnico.slice(0, -1));
      else if (input.length === 1) setTecnico(tecnico + input);
    } else if (step === 'pass') {
      if (key.return) {
        if (password.length > 0) {
          setStep('confirm');
          setError('');
        } else {
          setError('La contraseña no puede estar vacía');
        }
        return;
      }
      if (key.backspace || key.delete) setPassword(password.slice(0, -1));
      else if (input.length === 1) setPassword(password + input);
    } else if (step === 'confirm') {
      if (key.return) {
        if (password === confirmPass) {
          try {
            mkdirSync(config.INVENTARIO_RAIZ, { recursive: true });
            saveUserAndCreateDir(config.INVENTARIO_RAIZ, tecnico, hashPassword(password));
            saveConfig('TECNICO', tecnico);
            logUserRegistrationToExcel(config.INVENTARIO_RAIZ, tecnico).catch(() => {});
            setStep('done');
          } catch (e: unknown) {
            setError(`Error guardando: ${e instanceof Error ? e.message : String(e)}`);
          }
        } else {
          setError('Las contraseñas no coinciden. Intenta de nuevo.');
          setPassword('');
          setConfirmPass('');
          setStep('pass');
        }
        return;
      }
      if (key.backspace || key.delete) setConfirmPass(confirmPass.slice(0, -1));
      else if (input.length === 1) setConfirmPass(confirmPass + input);
    }
  });

  if (step === 'inicio') {
    return (
      <Box flexDirection="column" alignItems="center" paddingY={1}>
        <Text bold color="yellow">{ASCII_LOGO}</Text>
        <Text dimColor>v5.0.0 - Gestión de Inventario</Text>
        <Newline />
        <Text>Antes de comenzar, necesito configurar el primer usuario técnico.</Text>
        <Text dimColor>El inventario se guardará en: {config.INVENTARIO_RAIZ}</Text>
        <Newline />
        <Box width="100%" justifyContent="center" marginTop={1}>
          <Box marginRight={2}><Text color="green">[Enter]</Text><Text> Continuar</Text></Box>
          <Box><Text color="red">[Esc]</Text><Text> Salir</Text></Box>
        </Box>
      </Box>
    );
  }

  if (step === 'done') {
    const updated = loadConfig();
    onComplete(updated);
    return (
      <Box flexDirection="column" alignItems="center" paddingY={1}>
        <Text bold color="yellow">{ASCII_LOGO}</Text>
        <Newline />
        <Text color="green">✓ Configuración completada correctamente.</Text>
        <Text dimColor>Iniciando sistema...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      <Text bold color="yellow">{ASCII_LOGO}</Text>
      <Text dimColor>Configuración del Primer Usuario</Text>
      <Newline />
      {step === 'tecnico' && (
        <Box flexDirection="column" alignItems="center">
          <Text>Ingresa el nombre del técnico principal (sin espacios):</Text>
          <Text color="cyan">[{tecnico}_]</Text>
        </Box>
      )}
      {step === 'pass' && (
        <Box flexDirection="column" alignItems="center">
          <Text>Ingresa una contraseña para {tecnico}:</Text>
          <Text color="cyan">[{'*'.repeat(password.length)}_]</Text>
        </Box>
      )}
      {step === 'confirm' && (
        <Box flexDirection="column" alignItems="center">
          <Text>Confirma la contraseña:</Text>
          <Text color="cyan">[{'*'.repeat(confirmPass.length)}_]</Text>
        </Box>
      )}
      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}
      <Newline />
      <Text dimColor>[Enter] Siguiente  [Esc] Salir</Text>
    </Box>
  );
}
