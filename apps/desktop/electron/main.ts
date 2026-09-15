import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, session, screen, safeStorage } from 'electron';
import path from 'node:path';

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
type TrayState = 'ready' | 'listening' | 'processing' | 'paused' | 'error' | 'offline';
let trayState: TrayState = 'ready';
let pinned = true;
let clickThrough = false;
/** Expanded bounds, restored when leaving the 48×48 orb. */
let savedBounds: Electron.Rectangle | null = null;

const OVERLAY_WIDTH = 480;
const OVERLAY_HEIGHT = 600;

function overlayDefaults(display: Electron.Display): { x: number; y: number; width: number; height: number } {
  const { x, y, width, height } = display.workArea;
  return { x: x + width - OVERLAY_WIDTH - 16, y: y + height - OVERLAY_HEIGHT - 16, width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT };
}

// API keys live in main only, encrypted with safeStorage. Never sent to renderer.
const keyStore = new Map<string, string>();
export function setApiKey(provider: string, key: string): void {
  const payload = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key).toString('base64') : Buffer.from(key).toString('base64');
  keyStore.set(provider, payload);
}
export function getApiKey(provider: string): string | null {
  const v = keyStore.get(provider);
  if (!v) return null;
  try {
    const buf = Buffer.from(v, 'base64');
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString();
  } catch { return null; }
}

function createWindow(): void {
  const defaults = overlayDefaults(screen.getPrimaryDisplay());
  win = new BrowserWindow({
    ...defaults,
    minWidth: 360,
    minHeight: 400,
    frame: false,                    // No OS chrome (spec §6.1)
    transparent: true,               // Enables transparency
    backgroundColor: '#00000000',    // Fully transparent
    alwaysOnTop: true,
    skipTaskbar: true,               // Hidden from taskbar
    resizable: true,
    hasShadow: false,
    title: 'AI Interview Assistant',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // Highest always-on-top level so the overlay floats above full-screen apps.
  win.setAlwaysOnTop(true, 'screen-saver');
  try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch { /* linux */ }
  // Exclude overlay from screen capture where supported.
  try { (win as unknown as { setContentProtection: (b: boolean) => void }).setContentProtection(true); } catch { /* not critical */ }
  applyClickThrough();

  if (process.env.VITE_DEV_SERVER_URL) void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else void win.loadFile(path.join(__dirname, '../../dist/index.html')); // electron/dist -> desktop dist

  win.on('close', (e) => {
    if (process.platform === 'win32' || process.platform === 'linux') {
      e.preventDefault(); // minimize to tray, keep alive
      win?.hide();
    }
  });
}

/** Remember expanded bounds before collapsing to the 48×48 orb; restore on expand. */
function setCollapsed(collapsed: boolean): void {
  if (!win) return;
  if (collapsed) {
    const b = win.getBounds();
    savedBounds = b;
    win.setMinimumSize(48, 48);
    win.setBounds({ x: b.x + Math.max(0, b.width - 48), y: b.y, width: 48, height: 48 });
  } else {
    const restore = savedBounds ?? { ...overlayDefaults(screen.getPrimaryDisplay()) };
    win.setMinimumSize(360, 400);
    win.setBounds(restore);
    savedBounds = null;
  }
}

function applyClickThrough(): void {
  if (!win) return;
  // forward: true keeps JS events flowing to the renderer while ignoring OS clicks.
  win.setIgnoreMouseEvents(clickThrough, { forward: true });
}

/** Keep the overlay inside the nearest display's work area (multi-monitor + display changes). */
function positionOverlay(): void {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const display = screen.getDisplayNearestPoint({ x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) });
  const wa = display.workArea;
  const maxX = wa.x + wa.width - b.width;
  const maxY = wa.y + wa.height - b.height;
  const nx = Math.min(Math.max(wa.x, b.x), Math.max(wa.x, maxX));
  const ny = Math.min(Math.max(wa.y, b.y), Math.max(wa.y, maxY));
  if (nx !== b.x || ny !== b.y) win.setPosition(nx, ny, false);
}

function stateLabel(s: TrayState): string {
  return { ready: 'Ready', listening: 'Listening', processing: 'Processing', paused: 'Paused', error: 'Error', offline: 'Offline' }[s];
}

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: 'AI Interview Assistant', enabled: false },
    { label: `Status: ${stateLabel(trayState)}`, enabled: false },
    { type: 'separator' },
    { label: 'Start Session', click: () => win?.webContents.send('session:start') },
    { label: 'Pause Assistant', click: () => win?.webContents.send('session:pause') },
    { label: 'Resume Assistant', click: () => win?.webContents.send('session:resume') },
    { label: 'Show Overlay', click: () => { win?.show(); } },
    { label: 'Toggle Click-Through', click: () => { clickThrough = !clickThrough; applyClickThrough(); } },
    { label: 'Audio Devices', click: () => win?.webContents.send('audio:list-devices') },
    { label: 'Screen Capture', click: () => win?.webContents.send('screen:capture') },
    { label: 'AI Provider', click: () => win?.webContents.send('settings:get') },
    { label: 'Settings', click: () => { win?.show(); } },
    { label: 'Session History', click: () => { win?.show(); } },
    { label: 'Diagnostics', click: () => { win?.show(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit(); } },
  ]);
}

function setTrayState(s: TrayState): void {
  trayState = s;
  tray?.setContextMenu(buildMenu());
  tray?.setToolTip(`AI Interview Assistant — ${stateLabel(s)}`);
}

function createTray(): void {
  const icon = nativeImage.createEmpty(); // packaged builds replace with build/icon.ico per state
  tray = new Tray(icon);
  tray.setContextMenu(buildMenu());
  tray.setToolTip('AI Interview Assistant — Ready');
  tray.on('click', () => win?.show());
}

function registerIpc(): void {
  const ok = (v: unknown) => ({ ok: true, value: v });
  ipcMain.handle('tray:set-state', (_e, s: TrayState) => { setTrayState(s); return ok(s); });
  ipcMain.handle('settings:get', () => ok({ autoLaunch: app.getLoginItemSettings().openAtLogin }));
  ipcMain.handle('settings:set', (_e, s: { autoLaunch?: boolean }) => {
    if (typeof s?.autoLaunch === 'boolean') app.setLoginItemSettings({ openAtLogin: s.autoLaunch });
    return ok(true);
  });
  // Overlay window controls driven from the renderer UI (footer/header).
  ipcMain.handle('overlay:set-options', (_e, opts: { clickThrough?: boolean; pinned?: boolean; collapsed?: boolean }) => {
    if (typeof opts?.pinned === 'boolean') {
      pinned = opts.pinned;
      win?.setAlwaysOnTop(pinned, 'screen-saver');
    }
    if (typeof opts?.clickThrough === 'boolean') {
      clickThrough = opts.clickThrough;
      applyClickThrough();
    }
    if (typeof opts?.collapsed === 'boolean') setCollapsed(opts.collapsed);
    return ok({ pinned, clickThrough });
  });
  ipcMain.handle('overlay:collapse', (_e, collapsed: boolean) => { setCollapsed(collapsed); return ok(true); });
  ipcMain.handle('audio:list-devices', () => ok([])); // renderer enumerates via mediaDevices; main keeps allowlist only
  ipcMain.handle('audio:start', () => ok(true));
  ipcMain.handle('audio:stop', () => ok(true));
  ipcMain.handle('screen:start', () => ok(true));
  ipcMain.handle('screen:stop', () => ok(true));
  ipcMain.handle('screen:capture', () => ok({ capturedAt: new Date().toISOString() }));
  ipcMain.handle('session:start', () => { setTrayState('listening'); return ok(true); });
  ipcMain.handle('session:pause', () => { setTrayState('paused'); return ok(true); });
  ipcMain.handle('session:resume', () => { setTrayState('listening'); return ok(true); });
  ipcMain.handle('session:end', () => { setTrayState('ready'); return ok(true); });
  ipcMain.handle('ai:ask', async (_e, payload: unknown) => {
    // Main-process AI call would attach stored keys here; renderer never sees them.
    void getApiKey;
    void payload;
    return ok({ routed: true });
  });
  ipcMain.handle('auth:login', () => ok(true));
  ipcMain.handle('auth:logout', () => ok(true));
}

async function init(): Promise<void> {
  await app.whenReady();
  // Screen capture handler (main process): explicit user picker on Windows.
  session.defaultSession.setDisplayMediaRequestHandler((_req, callback) => {
    callback({ video: undefined });
  }, { useSystemPicker: true });
  registerIpc();
  createWindow();
  createTray();
  // Display / power resilience: keep the overlay visible and on-screen.
  screen.on('display-metrics-changed', () => positionOverlay());
  screen.on('display-added', () => positionOverlay());
  screen.on('display-removed', () => positionOverlay());
  app.on('window-all-closed', () => { /* keep tray alive: do not quit */ });
}

void init();
