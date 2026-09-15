import { contextBridge, ipcRenderer } from 'electron';

// Explicit allowlist — renderer never gets raw ipcRenderer or secrets.
const CHANNELS = [
  'session:start', 'session:pause', 'session:resume', 'session:end',
  'audio:list-devices', 'audio:start', 'audio:stop',
  'screen:start', 'screen:stop', 'screen:capture',
  'ai:ask', 'settings:get', 'settings:set',
  'tray:set-state', 'auth:login', 'auth:logout',
  'overlay:set-options', 'overlay:collapse',
] as const;

export type AllowedChannel = (typeof CHANNELS)[number];

const api = {
  invoke: (channel: AllowedChannel, ...args: unknown[]) => {
    if (!CHANNELS.includes(channel)) throw new Error(`Blocked IPC channel: ${String(channel)}`);
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel: AllowedChannel, cb: (...args: unknown[]) => void) => {
    if (!CHANNELS.includes(channel)) throw new Error(`Blocked IPC channel: ${String(channel)}`);
    const listener = (_e: unknown, ...a: unknown[]) => cb(...a);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld('aiAssistant', api);
declare global { interface Window { aiAssistant: typeof api; } }
