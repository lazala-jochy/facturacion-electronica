import type { AuthSession } from "../types/session";

const SAVED_ACCOUNTS_KEY = "fe_rd_saved_accounts_v1";

export type SavedAccount = {
  user: AuthSession["user"];
  company: AuthSession["company"];
  token: string;
  refresh_token: string;
};

export const readSavedAccounts = (): SavedAccount[] => {
  try {
    const raw = localStorage.getItem(SAVED_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedAccount[]) : [];
  } catch {
    return [];
  }
};

const writeSavedAccounts = (accounts: SavedAccount[]): void => {
  localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
};

/**
 * Guarda/actualiza una cuenta (la mas reciente va primero), deduplicada por user.id. Sin
 * refresh_token no hay forma de reactivar la cuenta sin contraseña, asi que no vale la pena
 * guardarla (pasa con sesiones viejas, de antes de que existiera el refresh token).
 */
export const upsertSavedAccount = (session: AuthSession): void => {
  if (!session.refresh_token) return;
  const accounts = readSavedAccounts().filter((a) => a.user.id !== session.user.id);
  accounts.unshift({
    user: session.user,
    company: session.company,
    token: session.token,
    refresh_token: session.refresh_token,
  });
  writeSavedAccounts(accounts);
};

export const removeSavedAccount = (userId: number): SavedAccount[] => {
  const next = readSavedAccounts().filter((a) => a.user.id !== userId);
  writeSavedAccounts(next);
  return next;
};
