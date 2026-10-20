import React, { useEffect, useState } from 'react';

export interface ConfirmFailure {
  error: string;
  /** Epoch ms the lockout ends, when the failure was a lockout. */
  lockedUntil?: number;
}

interface Props {
  title: string;
  /** Resolves to a failure to display, or null on success. */
  onConfirm: (password: string) => Promise<ConfirmFailure | null>;
  onCancel: () => void;
  /** Lockout already in effect when the prompt opens (epoch ms, 0 = none). */
  initialLockedUntil?: number;
}

function formatWait(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Modal password gate. Owns only the credential entry — the caller decides what
 * the verified password authorizes. The lockout shown here is display-only; the
 * main process enforces it.
 */
export default function CredentialPrompt({
  title,
  onConfirm,
  onCancel,
  initialLockedUntil = 0,
}: Props): React.JSX.Element {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(initialLockedUntil);
  const [now, setNow] = useState(Date.now());

  const lockRemainingMs = lockedUntil - now;
  const locked = lockRemainingMs > 0;

  // Tick once a second while locked; unlock the form when the wait runs out.
  useEffect(() => {
    if (!lockedUntil) return;

    const id = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= lockedUntil) {
        setLockedUntil(0);
        setError('');
      }
    }, 1000);

    return () => clearInterval(id);
  }, [lockedUntil]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (locked) return;

    setError('');
    setBusy(true);

    const failure = await onConfirm(password);

    setBusy(false);
    if (failure) {
      setError(failure.error);
      setPassword('');
      if (failure.lockedUntil) {
        setNow(Date.now());
        setLockedUntil(failure.lockedUntil);
      }
    }
  };

  return (
    <div className="modal-backdrop">
      <form className="modal-panel" onSubmit={handleSubmit}>
        <h2>{title}</h2>
        <p className="modal-hint">Enter your account password to confirm.</p>

        <div className="form-row stacked">
          <label htmlFor="confirm-password">Password</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            disabled={locked}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {locked ? (
          <p className="auth-error">
            Too many failed attempts. Try again in {formatWait(lockRemainingMs)}.
          </p>
        ) : (
          error && <p className="auth-error">{error}</p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-update" disabled={busy || locked || !password}>
            {busy ? 'Verifying…' : 'Confirm'}
          </button>
        </div>
      </form>
    </div>
  );
}
