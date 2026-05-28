import React, { useState, useEffect, useRef } from 'react';

const api = (window as unknown as { api: Window['api'] }).api;

function playTick(urgent: boolean): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.value = urgent ? 1000 : 600;

    gain.gain.setValueAtTime(urgent ? 0.5 : 0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (urgent ? 0.18 : 0.1));

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);

    osc.onended = () => ctx.close();
  } catch {
    // AudioContext not available — silently skip
  }
}

export default function CountdownWindow(): React.JSX.Element {
  const [seconds, setSeconds] = useState(10);
  const [pulse, setPulse] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const tick = (s: number): void => {
    playTick(s <= 3);
    setPulse(true);
    setTimeout(() => setPulse(false), 300);
  };

  const startCountdown = (): void => {
    setSeconds(10);
    if (intervalRef.current) clearInterval(intervalRef.current);
    tick(10);

    intervalRef.current = setInterval(() => {
      setSeconds((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(intervalRef.current!);
          api.shutdownNow();
          return 0;
        }
        tick(next);
        return next;
      });
    }, 1000);
  };

  useEffect(() => {
    startCountdown();
    api.onStartCountdown(startCountdown);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const urgent = seconds <= 3;

  return (
    <div className="container countdown-container">
      <span className="countdown-warning">⚠ Shutting Down</span>

      <div className={`countdown-number ${urgent ? 'urgent' : ''} ${pulse ? 'pulse' : ''}`}>
        {seconds}
      </div>

      <p className="countdown-label">seconds remaining</p>
      <p className="countdown-message">
        No mouse activity detected.<br />Windows will shut down automatically.
      </p>

      <div className="countdown-buttons">
        <button
          className="btn-cancel"
          onClick={() => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            api.cancelShutdown();
          }}
        >
          ✕ Cancel Shutdown
        </button>
        <button
          className="btn-restart"
          onClick={() => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            api.restartTimer();
          }}
        >
          ↺ Restart Idle Timer
        </button>
      </div>
    </div>
  );
}
