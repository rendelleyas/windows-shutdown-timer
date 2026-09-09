import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // Account — registration and status
  getAuthStatus: () => ipcRenderer.invoke('auth:status'),
  register: (username: string, password: string) =>
    ipcRenderer.invoke('auth:register', { username, password }),

  // Timer — reads are open, every write requires the account password
  getTimer: () => ipcRenderer.invoke('timer:get'),
  updateTimer: (password: string, hours: number, minutes: number) =>
    ipcRenderer.invoke('timer:update', { password, hours, minutes }),

  cancelShutdown: () => ipcRenderer.send('countdown-cancel'),
  restartTimer: () => ipcRenderer.send('countdown-restart'),
  shutdownNow: () => ipcRenderer.send('shutdown-now'),
  onUpdateStatus: (callback: (data: { status: string; remaining: number }) => void) =>
    ipcRenderer.on('update-status', (_e, data) => callback(data)),
  onStartCountdown: (callback: () => void) =>
    ipcRenderer.on('start-countdown', () => callback()),
});
