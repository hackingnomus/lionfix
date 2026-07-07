import React, { useState, useCallback } from 'react';
import { Box, Text, useInput, Newline } from 'ink';
import type { Config } from '../config/index.js';
import { loadChatbotConfig, isChatbotConfigured, askChatbot, generateReportWithAI, getReportData, ChatMessage, saveChatbotConfig } from '../core/chatbot.js';
import { logMovementToExcel } from '../core/users-excel.js';

interface Props { config: Config; onBack: () => void; }

type ChatStep = 'menu' | 'chat' | 'config' | 'report_select' | 'report_result';

export function ChatView({ config, onBack }: Props) {
  const [step, setStep] = useState<ChatStep>('menu');
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [configMode, setConfigMode] = useState<'apiKey' | 'model' | 'baseUrl'>('apiKey');
  const [configInput, setConfigInput] = useState('');
  const [configMessage, setConfigMessage] = useState('');
  const [reportType, setReportType] = useState<'general' | 'storage' | 'activity' | 'inventory'>('general');
  const [reportResult, setReportResult] = useState('');
  const [dashboardData, setDashboardData] = useState<string>('');

  const configured = isChatbotConfigured(config.INVENTARIO_RAIZ);
  const chatCfg = loadChatbotConfig(config.INVENTARIO_RAIZ);

  const sendMessage = useCallback(async (msg: string) => {
    if (!msg.trim() || loading) return;
    setLoading(true);
    const userMsg = { role: 'user', content: msg };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    logMovementToExcel(config.INVENTARIO_RAIZ, config.TECNICO, 'chat_enviar_mensaje', msg.slice(0, 100), 'ChatView').catch(() => {});

    try {
      const result = await askChatbot(
        config.INVENTARIO_RAIZ,
        config.INVENTARIO_RAIZ,
        msg,
        messages.map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })),
      );
      setMessages(prev => [...prev, { role: 'assistant', content: result.content }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e instanceof Error ? e.message : String(e)}` }]);
    }
    setLoading(false);
  }, [config.INVENTARIO_RAIZ, messages, loading]);

  useInput((ch, key) => {
    if (key.escape) {
      if (step === 'chat') { setStep('menu'); setMessages([]); return; }
      if (step === 'config') { setStep('menu'); return; }
      if (step === 'report_select') { setStep('menu'); return; }
      if (step === 'report_result') { setStep('report_select'); return; }
      onBack(); return;
    }

    if (step === 'menu') {
      if (ch === 'c') {
        if (configured) { setStep('chat'); }
        return;
      }
      if (ch === 'r') { setStep('report_select'); return; }
      if (ch === 's') {
        setConfigMode('apiKey');
        setConfigInput(chatCfg.apiKey);
        setConfigMessage('');
        setStep('config');
        return;
      }
      if (ch === 'd') {
        getReportData(config.INVENTARIO_RAIZ).then(d => setDashboardData(d)).catch(() => {});
        return;
      }
      return;
    }

    if (step === 'report_select') {
      if (ch === '1' || ch === '2' || ch === '3' || ch === '4') {
        const types: Record<string, 'general' | 'storage' | 'activity' | 'inventory'> = {
          '1': 'general', '2': 'storage', '3': 'activity', '4': 'inventory',
        };
        const selected = types[ch];
        setReportType(selected);
        setStep('report_result');
        setLoading(true);
        logMovementToExcel(config.INVENTARIO_RAIZ, config.TECNICO, 'chat_generar_reporte', `Tipo: ${selected}`, 'ChatView').catch(() => {});
        generateReportWithAI(config.INVENTARIO_RAIZ, config.INVENTARIO_RAIZ, selected).then(result => {
          setReportResult(result);
          setLoading(false);
        }).catch((e) => {
          setReportResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
          setLoading(false);
        });
      }
      return;
    }

    if (step === 'chat') {
      if (key.return && input.trim()) {
        sendMessage(input.trim());
        return;
      }
      if (key.backspace || key.delete) { setInput(input.slice(0, -1)); return; }
      if (ch && ch.length === 1) { setInput(input + ch); }
      return;
    }

    if (step === 'config') {
      if (key.return) {
        const masked = configMode === 'apiKey' ? `***${configInput.slice(-4)}` : configInput;
        if (configMode === 'apiKey') { saveChatbotConfig(config.INVENTARIO_RAIZ, { apiKey: configInput }); }
        else if (configMode === 'model') { saveChatbotConfig(config.INVENTARIO_RAIZ, { model: configInput }); }
        else if (configMode === 'baseUrl') { saveChatbotConfig(config.INVENTARIO_RAIZ, { baseUrl: configInput }); }
        logMovementToExcel(config.INVENTARIO_RAIZ, config.TECNICO, 'chat_configurar', `${configMode}: ${masked}`, 'ChatView').catch(() => {});
        setConfigMessage('✓ Configuración guardada');
        return;
      }
      if (key.backspace || key.delete) { setConfigInput(configInput.slice(0, -1)); return; }
      if (ch && ch.length === 1) { setConfigInput(configInput + ch); }
      return;
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="yellow">🤖 Asistente IA - Chatbot Inteligente</Text>
      <Newline />

      {step === 'menu' && (
        <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
          <Text bold color="white">Menú del Asistente IA</Text>
          <Newline />
          <Box>
            <Text color="green">[C] </Text>
            <Text>{configured ? 'Iniciar conversación' : 'Configurar API Key primero (opción S)'}</Text>
          </Box>
          <Box><Text color="green">[R] </Text><Text>Generar reporte con IA</Text></Box>
          <Box><Text color="green">[S] </Text><Text>Configurar asistente (API Key, modelo, URL)</Text></Box>
          <Box><Text color="green">[D] </Text><Text>Ver datos del dashboard (contexto local)</Text></Box>
          <Newline />
          {configured && (
            <Box>
              <Text dimColor>Modelo: </Text><Text color="cyan">{chatCfg.model}</Text>
              <Text>  </Text>
              <Text dimColor>API:</Text><Text color="cyan"> {chatCfg.baseUrl}</Text>
            </Box>
          )}
          {!configured && (
            <Text color="red">⚠ API Key no configurada. Usa [S] para configurar.</Text>
          )}
        </Box>
      )}

      {step === 'chat' && (
        <Box flexDirection="column" borderStyle="single" borderColor="green" paddingX={1} paddingY={1} minHeight={10}>
          <Box flexDirection="column" marginBottom={1}>
            {messages.length === 0 && <Text dimColor>Escribe tu consulta sobre el sistema...</Text>}
            {messages.map((m, i) => (
              <Box key={i} flexDirection="column">
                <Text color={m.role === 'user' ? 'green' : 'cyan'} bold>
                  {m.role === 'user' ? '👤 Tú:' : '🤖 AI:'}
                </Text>
                <Text dimColor wrap="wrap">{m.content}</Text>
                <Newline />
              </Box>
            ))}
            {loading && <Text color="yellow">⏳ Pensando...</Text>}
          </Box>
          <Box>
            <Text color="green" bold>➜ </Text>
            <Text>{input}</Text>
            <Text color="gray">_</Text>
          </Box>
        </Box>
      )}

      {step === 'report_select' && (
        <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={2} paddingY={1}>
          <Text bold>Selecciona tipo de reporte:</Text>
          <Newline />
          <Box><Text color="green">[1]</Text><Text> Reporte general del sistema</Text></Box>
          <Box><Text color="green">[2]</Text><Text> Análisis de almacenamiento</Text></Box>
          <Box><Text color="green">[3]</Text><Text> Reporte de actividad de técnicos</Text></Box>
          <Box><Text color="green">[4]</Text><Text> Análisis del inventario</Text></Box>
        </Box>
      )}

      {step === 'report_result' && (
        <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={1} paddingY={1}>
          <Text bold color="white">Reporte: {reportType}</Text>
          <Newline />
          {loading ? (
            <Text color="yellow">⏳ Generando reporte con IA...</Text>
          ) : (
            <Text wrap="wrap">{reportResult}</Text>
          )}
        </Box>
      )}

      {step === 'config' && (
        <Box flexDirection="column" borderStyle="single" borderColor="blue" paddingX={2} paddingY={1}>
          <Text bold color="white">Configurar Asistente IA</Text>
          <Newline />
          <Box>
            <Text>Editando: </Text>
            <Text color="cyan" bold>
              {configMode === 'apiKey' ? 'API Key' : configMode === 'model' ? 'Modelo' : 'Base URL'}
            </Text>
          </Box>
          <Box>
            <Text color="green">➜ </Text>
            <Text>{configInput}</Text>
            <Text color="gray">_</Text>
          </Box>
          <Newline />
          {configMessage && <Text color="green">{configMessage}</Text>}
          <Text dimColor>[Enter] Guardar y volver  [Esc] Cancelar</Text>
        </Box>
      )}

      {dashboardData && step === 'menu' && (
        <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} paddingY={1}>
          <Text bold color="white">Datos del sistema:</Text>
          <Newline />
          <Text wrap="wrap">{dashboardData}</Text>
        </Box>
      )}

      <Newline />
      <Text dimColor>
        {step === 'menu' && '[C] Chat  [R] Reportes  [S] Configurar  [D] Dashboard  [Esc] Volver'}
        {step === 'chat' && '[Enter] Enviar  [Esc] Salir del chat'}
        {step === 'report_select' && '[1-4] Elegir reporte  [Esc] Volver'}
        {step === 'report_result' && '[Esc] Volver a tipos de reporte'}
        {step === 'config' && '[Enter] Guardar  [Esc] Cancelar'}
      </Text>
    </Box>
  );
}
