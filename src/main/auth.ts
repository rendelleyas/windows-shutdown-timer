import crypto from 'crypto';
import { loadStore, saveStore, type Account, type StoreData } from './store';

/**
 * Single local account guarding the shutdown capability.
 *
 * The credential lives in a plain JSON file under `userData`, so this is a gate
 * on the UI and the IPC surface — not a defense against someone with disk
 * access, who can simply delete the file and re-register. Moving the check
 * server-side is the only way to make it tamper-proof.
 */

const SALT_BYTES = 16;
const KEY_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 8;

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 10 * 60 * 1000;

export interface AuthResult {
  ok: boolean;
  error?: string;
  /** Epoch ms the lockout ends; present only while password entry is locked. */
  lockedUntil?: number;
}

function derive(password: string, salt: string): Buffer {
  return crypto.scryptSync(password, salt, KEY_LENGTH);
}

export function hasAccount(): boolean {
  return loadStore().account !== null;
}

export function getUsername(): string | undefined {
  return loadStore().account?.username;
}

export function register(username: string, password: string): AuthResult {
  const store = loadStore();

  if (store.account) return { ok: false, error: 'An account is already registered.' };

  const trimmed = username.trim();
  if (!trimmed) return { ok: false, error: 'Username is required.' };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const next: StoreData = {
    ...store,
    account: { username: trimmed, salt, hash: derive(password, salt).toString('hex') },
  };
  saveStore(next);

  return { ok: true };
}

function matches(password: string, account: Account): boolean {
  const expected = Buffer.from(account.hash, 'hex');
  const actual = derive(password, account.salt);

  // Length guard first — timingSafeEqual throws on mismatched buffer lengths.
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

/**
 * Returns the active lockout end (epoch ms), or 0 when unlocked.
 *
 * Clamped to LOCKOUT_MS from now so rolling the system clock back can't stretch
 * a lockout indefinitely. Rolling it forward does skip the wait — same
 * disk-access caveat as the credential file itself.
 */
export function getLockedUntil(store: StoreData = loadStore()): number {
  const now = Date.now();
  const { lockedUntil } = store.lockout;
  return lockedUntil > now ? Math.min(lockedUntil, now + LOCKOUT_MS) : 0;
}

/**
 * Checks the password with a consecutive-failure limit: MAX_FAILED_ATTEMPTS wrong
 * passwords in a row lock all attempts for LOCKOUT_MS. While locked the password
 * isn't even evaluated, so a correct guess can't be confirmed during the lockout.
 */
export function verify(password: string): AuthResult {
  const store = loadStore();
  if (!store.account) return { ok: false, error: 'No account registered.' };

  const lockedUntil = getLockedUntil(store);
  if (lockedUntil) return { ok: false, error: 'Too many failed attempts.', lockedUntil };

  if (matches(password, store.account)) {
    if (store.lockout.failedAttempts > 0 || store.lockout.lockedUntil > 0) {
      saveStore({ ...store, lockout: { failedAttempts: 0, lockedUntil: 0 } });
    }
    return { ok: true };
  }

  const failedAttempts = store.lockout.failedAttempts + 1;

  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    // Counter restarts so the user gets a fresh set of attempts after the wait.
    const until = Date.now() + LOCKOUT_MS;
    saveStore({ ...store, lockout: { failedAttempts: 0, lockedUntil: until } });
    return { ok: false, error: 'Too many failed attempts.', lockedUntil: until };
  }

  saveStore({ ...store, lockout: { failedAttempts, lockedUntil: 0 } });
  const remaining = MAX_FAILED_ATTEMPTS - failedAttempts;
  return {
    ok: false,
    error: `Incorrect password. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`,
  };
}
