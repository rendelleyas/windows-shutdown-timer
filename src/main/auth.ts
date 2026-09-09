import crypto from 'crypto';
import { loadStore, saveStore, type StoreData } from './store';

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

export interface AuthResult {
  ok: boolean;
  error?: string;
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

export function verify(password: string): boolean {
  const account = loadStore().account;
  if (!account) return false;

  const expected = Buffer.from(account.hash, 'hex');
  const actual = derive(password, account.salt);

  // Length guard first — timingSafeEqual throws on mismatched buffer lengths.
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
