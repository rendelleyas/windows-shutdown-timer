import React, { useState } from 'react';

const api = (window as unknown as { api: Window['api'] }).api;

const MIN_PASSWORD_LENGTH = 8;

interface Props {
  /** Called once the account has been created in the main process. */
  onRegistered: () => void;
}

export default function RegisterScreen({ onRegistered }: Props): React.JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');

    if (!username.trim()) return setError('Username is required.');
    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (password !== confirm) return setError('Passwords do not match.');

    setBusy(true);
    const result = await api.register(username, password);
    setBusy(false);

    if (result.ok) onRegistered();
    else setError(result.error ?? 'Registration failed.');
  };

  return (
    <div className="app-root">
      <form className="auth-panel" onSubmit={handleSubmit}>
        <h1>Register Account</h1>
        <p className="auth-intro">
          The shutdown timer stays disabled until an account is registered. This account is
          required for every timer change afterwards.
        </p>

        <div className="divider" />

        <div className="form-row stacked">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="form-row stacked">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="form-row stacked">
          <label htmlFor="confirm">Confirm password</label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        {error && <p className="auth-error">{error}</p>}

        <button className="btn-update" type="submit" disabled={busy}>
          {busy ? 'Registering…' : 'Create Account'}
        </button>
      </form>
    </div>
  );
}
