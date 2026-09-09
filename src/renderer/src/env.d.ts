interface AuthStatus {
  registered: boolean;
  username?: string;
}

interface ActionResult {
  ok: boolean;
  error?: string;
}

interface TimerSettings {
  hours: number;
  minutes: number;
}

interface Window {
  api: {
    getAuthStatus: () => Promise<AuthStatus>;
    register: (username: string, password: string) => Promise<ActionResult>;
    getTimer: () => Promise<TimerSettings>;
    updateTimer: (password: string, hours: number, minutes: number) => Promise<ActionResult>;
    cancelShutdown: () => void;
    restartTimer: () => void;
    shutdownNow: () => void;
    onUpdateStatus: (callback: (data: { status: string; remaining: number; progress: number; idleSeconds: number }) => void) => void;
    onStartCountdown: (callback: () => void) => void;
  };
}
