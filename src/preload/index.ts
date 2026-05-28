import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  startMonitoring: (hours: number, minutes: number) =>
    ipcRenderer.send('start-monitoring', { hours, minutes }),
  cancelShutdown: () => ipcRenderer.send('countdown-cancel'),
  restartTimer: () => ipcRenderer.send('countdown-restart'),
  shutdownNow: () => ipcRenderer.send('shutdown-now'),
  onUpdateStatus: (callback: (data: { status: string; remaining: number }) => void) =>
    ipcRenderer.on('update-status', (_e, data) => callback(data)),
  onStartCountdown: (callback: () => void) =>
    ipcRenderer.on('start-countdown', () => callback()),
});
