import React, { useState } from 'react';

interface Props {
  title: string;
  /** Resolves to an error message to display, or null on success. */
  onConfirm: (password: string) => Promise<string | null>;
  onCancel: () => void;
}

/**
 * Modal password gate. Owns only the credential entry — the caller decides what
 * the verified password authorizes.
 */
export default function CredentialPrompt({
  title,
  onConfirm,
  onCancel,
}: Props): React.JSX.Element {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');
    setBusy(true);

    const message = await onConfirm(password);

    setBusy(false);
    if (message) {
      setError(message);
      setPassword('');
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="auth-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-update" disabled={busy || !password}>
            {busy ? 'Verifying…' : 'Confirm'}
          </button>
        </div>
      </form>
    </div>
  );
}
