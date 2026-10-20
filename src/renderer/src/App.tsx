import React, { useState, useEffect } from 'react';
import RegisterScreen from './RegisterScreen';
import CredentialPrompt, { type ConfirmFailure } from './CredentialPrompt';

type Status = 'inactive' | 'monitoring' | 'countdown';

const api = (window as unknown as { api: Window['api'] }).api;

const RADIUS = 240;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ringColor(progress: number): string {
  if (progress >= 0.8) return '#f87171';
  if (progress >= 0.5) return '#fbbf24';
  return '#4ade80';
}

function formatIdle(seconds: number): string {
  if (seconds < 60) return `${seconds}s idle`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s idle` : `${m}m idle`;
}

export default function App(): React.JSX.Element {
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(5);
  const [status, setStatus] = useState<Status>('inactive');
  const [progress, setProgress] = useState(0);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [saved, setSaved] = useState(false);
  // null = still resolving; gates the whole UI on the main process's answer
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptLockedUntil, setPromptLockedUntil] = useState(0);

  useEffect(() => {
    api.onUpdateStatus(({ status: s, progress: p, idleSeconds: i }) => {
      setStatus(s as Status);
      setProgress(p ?? 0);
      setIdleSeconds(i ?? 0);
    });
  }, []);

  useEffect(() => {
    void (async () => {
      const { registered: isRegistered } = await api.getAuthStatus();
      if (isRegistered) await loadTimer();
      setRegistered(isRegistered);
    })();
  }, []);

  const loadTimer = async (): Promise<void> => {
    const timer = await api.getTimer();
    setHours(timer.hours);
    setMinutes(timer.minutes);
  };

  const handleRegistered = async (): Promise<void> => {
    await loadTimer();
    setRegistered(true);
  };

  // Ask main for any active lockout first, so the prompt opens already locked.
  const openPrompt = async (): Promise<void> => {
    const { lockedUntil } = await api.getAuthStatus();
    setPromptLockedUntil(lockedUntil);
    setPromptOpen(true);
  };

  /** Returns a failure to show in the prompt, or null once applied. */
  const handleConfirmUpdate = async (password: string): Promise<ConfirmFailure | null> => {
    const result = await api.updateTimer(password, hours, minutes);
    if (!result.ok) {
      return { error: result.error ?? 'Update failed.', lockedUntil: result.lockedUntil };
    }

    setPromptOpen(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    return null;
  };

  if (registered === null) return <div className="app-root" />;
  if (!registered) return <RegisterScreen onRegistered={() => void handleRegistered()} />;

  const dashOffset = CIRCUMFERENCE * (1 - progress);
  const color = ringColor(progress);
  const noMovement = idleSeconds >= 5 && status === 'monitoring';

  return (
    <div className="app-root">
      {/* Full-window ring — purely decorative progress arc */}
      <svg className="ring-svg" viewBox="0 0 540 540" preserveAspectRatio="xMidYMid meet">
        {/* Track */}
        <circle cx="270" cy="270" r={RADIUS} fill="none" stroke="#1e2d4a" strokeWidth="16" />
        {/* Progress arc */}
        <circle
          cx="270" cy="270" r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 270 270)"
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.4s ease' }}
        />
      </svg>

      {/* All content lives inside the ring */}
      <div className="ring-content">
        <h1>Mouse Inactivity<br />Shutdown Timer</h1>

        <div className={`monitoring-badge ${status}`}>
          <span className="dot" />
          {status === 'countdown'
            ? 'Countdown in progress'
            : status === 'monitoring'
            ? 'Monitoring input'
            : 'Inactive'}
        </div>

        <div className="idle-status">
          {noMovement ? (
            <>
              <span className="idle-label">No movement detected</span>
              <span className="idle-time">{formatIdle(idleSeconds)}</span>
            </>
          ) : (
            <span className="active-label">Mouse &amp; keyboard active</span>
          )}
        </div>

        <div className="divider" />

        <p className="hint">Shut down after idle for:</p>

        <div className="form-row">
          <label htmlFor="hours">Hours</label>
          <input
            id="hours"
            type="number"
            min={0}
            max={23}
            value={hours}
            onChange={(e) => setHours(Math.max(0, parseInt(e.target.value) || 0))}
          />
        </div>

        <div className="form-row">
          <label htmlFor="minutes">Minutes</label>
          <input
            id="minutes"
            type="number"
            min={0}
            max={59}
            value={minutes}
            onChange={(e) => setMinutes(Math.max(0, parseInt(e.target.value) || 0))}
          />
        </div>

        <button
          className="btn-update"
          onClick={() => void openPrompt()}
          disabled={hours === 0 && minutes === 0}
        >
          {saved ? '✓ Applied' : 'Update Timer'}
        </button>
      </div>

      {promptOpen && (
        <CredentialPrompt
          title="Confirm Timer Change"
          onConfirm={handleConfirmUpdate}
          onCancel={() => setPromptOpen(false)}
          initialLockedUntil={promptLockedUntil}
        />
      )}
    </div>
  );
}
