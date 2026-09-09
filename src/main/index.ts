import { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage } from 'electron';
import path from 'path';
import { exec } from 'child_process';
import { uIOhook } from 'uiohook-napi';
import { hasAccount, getUsername, register, verify } from './auth';
import { loadStore, saveStore } from './store';

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let countdownWindow: BrowserWindow | null = null;

let pollInterval: NodeJS.Timeout | null = null;
let lastMousePos = { x: 0, y: 0 };
let idleThresholdMs = 0;
let isMonitoring = false;
let isCountingDown = false;

// Lifted to module scope so keyboard handler can reset it alongside the mouse poll
let idleStart = Date.now();

app.setAppUserModelId('com.netlinkvoice.shutdown-timer');
app.disableHardwareAcceleration();

const isDev = !app.isPackaged;

function resetIdle(): void {
  idleStart = Date.now();
}

function handleInput(): void {
  if (!isMonitoring) return;

  if (isCountingDown) {
    cancelShutdown();
    return;
  }

  resetIdle();
  sendStatus('monitoring', 0, 0, 0);
  tray?.setToolTip('Monitoring — input detected');
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 540,
    height: 570,
    resizable: false,
    maximizable: false,
    title: 'Shutdown Timer',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow?.hide();
  });
}

function createCountdownWindow(): void {
  countdownWindow = new BrowserWindow({
    width: 420,
    height: 380,
    resizable: false,
    maximizable: false,
    alwaysOnTop: true,
    title: 'System Shutdown',
    center: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    countdownWindow.loadURL('http://localhost:5173/countdown.html');
  } else {
    countdownWindow.loadFile(path.join(__dirname, '../renderer/countdown.html'));
  }

  countdownWindow.setMenuBarVisibility(false);

  // X button on countdown window = same as Cancel
  countdownWindow.on('close', () => {
    if (isCountingDown) {
      isCountingDown = false;
      const hours = Math.floor(idleThresholdMs / 3600000);
      const minutes = Math.floor((idleThresholdMs % 3600000) / 60000);
      startMonitoring(hours, minutes);
    }
  });

  countdownWindow.on('closed', () => {
    countdownWindow = null;
  });
}

function setupTray(): void {
  const iconPath = path.join(__dirname, '../../resources/tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip(
    hasAccount() ? 'Shutdown Timer — Inactive' : 'Shutdown Timer — Not registered'
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open Settings',
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          stopMonitoring();
          app.exit(0);
        },
      },
    ])
  );

  tray.on('click', () => {
    mainWindow?.isVisible() ? mainWindow?.hide() : mainWindow?.show();
  });
}

function startMonitoring(hours: number, minutes: number): void {
  // Hard gate: an unregistered app never arms, never counts down, never shuts down.
  if (!hasAccount()) {
    console.warn('startMonitoring blocked: no account registered');
    stopMonitoring();
    return;
  }

  stopMonitoring();

  idleThresholdMs = (hours * 60 + minutes) * 60 * 1000;
  if (idleThresholdMs <= 0) return;

  isMonitoring = true;
  isCountingDown = false;
  lastMousePos = screen.getCursorScreenPoint();
  resetIdle();

  pollInterval = setInterval(() => {
    const pos = screen.getCursorScreenPoint();
    const mouseMoved = pos.x !== lastMousePos.x || pos.y !== lastMousePos.y;

    if (mouseMoved) {
      lastMousePos = pos;
      handleInput();
      return;
    }

    if (isCountingDown) return;

    const idleMs = Date.now() - idleStart;
    const remainingMs = idleThresholdMs - idleMs;
    const progress = Math.min(idleMs / idleThresholdMs, 1);
    const idleSeconds = Math.floor(idleMs / 1000);

    if (remainingMs <= 0) {
      triggerCountdown();
    } else {
      const remainingMin = Math.ceil(remainingMs / 60000);
      sendStatus('monitoring', remainingMin, progress, idleSeconds);
      tray?.setToolTip(`Monitoring — idle for ${Math.floor(idleMs / 60000)}m`);
    }
  }, 500);
}

function stopMonitoring(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  isMonitoring = false;
  isCountingDown = false;
  sendStatus('inactive', 0);
  tray?.setToolTip(
    hasAccount() ? 'Shutdown Timer — Inactive' : 'Shutdown Timer — Not registered'
  );
}

function triggerCountdown(): void {
  if (isCountingDown) return;
  isCountingDown = true;

  sendStatus('countdown', 0);
  tray?.setToolTip('Shutdown Timer — Counting down!');

  if (!countdownWindow) {
    createCountdownWindow();
    countdownWindow!.webContents.once('did-finish-load', () => {
      countdownWindow?.webContents.send('start-countdown');
    });
  } else {
    countdownWindow.show();
    countdownWindow.focus();
    countdownWindow.webContents.send('start-countdown');
  }
}

function cancelShutdown(): void {
  isCountingDown = false;
  countdownWindow?.destroy();
  countdownWindow = null;

  if (isMonitoring) {
    const hours = Math.floor(idleThresholdMs / 3600000);
    const minutes = Math.floor((idleThresholdMs % 3600000) / 60000);
    startMonitoring(hours, minutes);
  } else {
    sendStatus('inactive', 0);
  }
}

function restartTimer(): void {
  isCountingDown = false;
  countdownWindow?.destroy();
  countdownWindow = null;

  const hours = Math.floor(idleThresholdMs / 3600000);
  const minutes = Math.floor((idleThresholdMs % 3600000) / 60000);
  startMonitoring(hours, minutes);
}

function sendStatus(status: string, remaining: number, progress = 0, idleSeconds = 0): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status, remaining, progress, idleSeconds });
  }
}

ipcMain.handle('auth:status', () => ({
  registered: hasAccount(),
  username: getUsername(),
}));

ipcMain.handle(
  'auth:register',
  (_e, { username, password }: { username: string; password: string }) => {
    const result = register(username, password);
    if (result.ok) {
      const { timer } = loadStore();
      startMonitoring(timer.hours, timer.minutes);
    }
    return result;
  }
);

ipcMain.handle('timer:get', () => loadStore().timer);

ipcMain.handle(
  'timer:update',
  (_e, { password, hours, minutes }: { password: string; hours: number; minutes: number }) => {
    if (!hasAccount()) return { ok: false, error: 'No account registered.' };
    // Verify before mutating anything, so a bad password leaves the armed timer untouched.
    if (!verify(password)) return { ok: false, error: 'Incorrect password.' };
    if (hours === 0 && minutes === 0) return { ok: false, error: 'Timer must be greater than zero.' };

    const store = loadStore();
    saveStore({ ...store, timer: { hours, minutes } });
    startMonitoring(hours, minutes);

    return { ok: true };
  }
);

ipcMain.on('countdown-cancel', () => cancelShutdown());

ipcMain.on('countdown-restart', () => restartTimer());

ipcMain.on('shutdown-now', () => {
  // Defence in depth: the renderer should never reach here unregistered, but the
  // actual shutdown must not be reachable on a renderer's word alone.
  if (!hasAccount()) {
    console.warn('shutdown-now blocked: no account registered');
    return;
  }

  exec('shutdown /s /t 0', (err) => {
    if (err) console.error('Shutdown failed:', err);
  });
});

function registerStartupTask(): void {
  if (!app.isPackaged) return;

  const taskName = 'WindowsShutdownTimer';
  const exePath = process.execPath;

  exec(`schtasks /query /tn "${taskName}"`, (err) => {
    if (!err) return; // already registered

    // Wrap exe path in escaped quotes to handle spaces in install path
    const cmd = `schtasks /create /tn "${taskName}" /tr "\\"${exePath}\\"" /sc onlogon /f`;
    exec(cmd, (createErr) => {
      if (createErr) console.error('Startup task registration failed:', createErr);
    });
  });
}

app.whenReady().then(() => {
  registerStartupTask();
  createMainWindow();
  setupTray();

  // Global keyboard hook — any keydown resets the idle timer
  uIOhook.on('keydown', handleInput);
  try {
    uIOhook.start();
  } catch (err) {
    console.error('uiohook failed to start (keyboard detection disabled):', err);
  }

  mainWindow!.webContents.once('did-finish-load', () => {
    // Arm from the persisted threshold only once an account exists; otherwise stay
    // inactive and let the renderer show the registration screen.
    if (hasAccount()) {
      const { timer } = loadStore();
      startMonitoring(timer.hours, timer.minutes);
    } else {
      sendStatus('inactive', 0);
    }
  });
});

app.on('before-quit', () => {
  try { uIOhook.stop(); } catch { /* ignore */ }
});

app.on('window-all-closed', () => {
  // Intentionally do nothing; app.quit() is only called from the tray Quit menu item
});
