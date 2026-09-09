import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export interface Account {
  username: string;
  /** Hex-encoded random salt used to derive `hash`. */
  salt: string;
  /** Hex-encoded scrypt derivation of the password. */
  hash: string;
}

export interface TimerSettings {
  hours: number;
  minutes: number;
}

export interface StoreData {
  account: Account | null;
  timer: TimerSettings;
}

const DEFAULT_STORE: StoreData = {
  account: null,
  timer: { hours: 0, minutes: 5 },
};

function storePath(): string {
  return path.join(app.getPath('userData'), 'account.json');
}

/**
 * Reads the persisted store. A missing, unreadable or malformed file is treated
 * as "no account yet" rather than an error — the app must still be able to boot
 * into the registration screen.
 */
export function loadStore(): StoreData {
  try {
    const raw = fs.readFileSync(storePath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoreData>;

    return {
      account: parsed.account ?? null,
      timer: {
        hours: parsed.timer?.hours ?? DEFAULT_STORE.timer.hours,
        minutes: parsed.timer?.minutes ?? DEFAULT_STORE.timer.minutes,
      },
    };
  } catch {
    return { ...DEFAULT_STORE, timer: { ...DEFAULT_STORE.timer } };
  }
}

export function saveStore(data: StoreData): void {
  try {
    fs.mkdirSync(path.dirname(storePath()), { recursive: true });
    fs.writeFileSync(storePath(), JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist store:', err);
  }
}
