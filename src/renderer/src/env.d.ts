interface Window {
  api: {
    startMonitoring: (hours: number, minutes: number) => void;
    cancelShutdown: () => void;
    restartTimer: () => void;
    shutdownNow: () => void;
    onUpdateStatus: (callback: (data: { status: string; remaining: number; progress: number; idleSeconds: number }) => void) => void;
    onStartCountdown: (callback: () => void) => void;
  };
}
