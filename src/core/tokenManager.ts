/**
 * Token / session management helpers.
 *
 * Centralises reading/writing the persisted session so that every
 * caller (auth, wallet, session health check) uses the same shape.
 */

import type { Web3AuthUserInfo } from "./types";

export const SESSION_KEY = "web3auth:session";

export interface StoredSession {
    userInfo?: Web3AuthUserInfo;
    token: string;
    refreshToken?: string;
    address: string;
}

/**
 * Read the persisted session from localStorage.
 */
export function getStoredSession(): StoredSession | null {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw) as StoredSession;
        if (!session?.token || !session?.address) return null;
        return session;
    } catch {
        return null;
    }
}

/**
 * Persist the session to localStorage.
 */
export function setStoredSession(session: StoredSession): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * Clear the persisted session.
 */
export function clearStoredSession(): void {
    localStorage.removeItem(SESSION_KEY);
}
