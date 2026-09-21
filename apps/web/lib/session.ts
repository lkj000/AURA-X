/**
 * THE SIGNED-IN ARTIST, READ FROM ONE PLACE.
 *
 * ── WHAT WAS WRONG ─────────────────────────────────────────────────────────────────────────────────
 *
 * Onboarding already stored the token: `localStorage.setItem("aura_token", token)` on the last step.
 * Nothing read it. Marketplace and Earnings each kept their own `useState("")` and asked the user to
 * supply a credential by hand, under the label:
 *
 *     Your JWT (from POST /api/auth/login)
 *
 * So a person who had just registered, been issued a token, and had it saved to their browser was then
 * asked to obtain one from an HTTP endpoint and paste it into a text box. The session existed; the
 * pages simply did not look for it.
 *
 * That is worse than an inconvenience. It teaches people to paste bearer tokens into input fields,
 * which is the exact habit every credential-phishing page relies on. And a token pasted into a form is
 * a token in browser history, in screenshots, and in whatever support channel it gets sent to.
 *
 * ── WHAT THIS IS NOT ───────────────────────────────────────────────────────────────────────────────
 *
 * Not a fix for token STORAGE. `localStorage` is readable by any script on the origin, so an XSS
 * becomes a stolen session. A cookie with `HttpOnly` and `SameSite` would be better, and that is a
 * server change — the API issues bearer tokens and every route expects `Authorization: Bearer`.
 * Changing that is a separate piece of work, and pretending otherwise by moving the same value into a
 * helper would be the false-comfort version of a fix.
 *
 * What this does is make the app read the session it already has, and stop asking people to handle
 * credentials manually. The storage question is recorded, not solved.
 */

const TOKEN_KEY = "aura_token";
const ARTIST_KEY = "aura_artist_id";

export interface ArtistSession {
  token: string;
  artistId: string | null;
}

/**
 * The current session, or null.
 *
 * Guarded for server rendering: these pages are Next.js client components, but a client component
 * still executes once on the server during SSR, where `localStorage` is undefined. Reading it there
 * throws and blanks the page — a failure that looks like a routing bug and is not.
 */
export function getSession(): ArtistSession | null {
  if (typeof window === "undefined") return null;
  try {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    return { token, artistId: window.localStorage.getItem(ARTIST_KEY) };
  } catch {
    // Storage can be disabled or blocked entirely. Treated as signed out rather than crashing:
    // "you are not signed in" is recoverable, a blank page is not.
    return null;
  }
}

export function getToken(): string | null {
  return getSession()?.token ?? null;
}

/** Written by onboarding on completion. Here so the key is defined once rather than typed twice. */
export function setSession(token: string, artistId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(ARTIST_KEY, artistId);
  } catch {
    /* storage unavailable — the caller keeps the token in memory for this page's lifetime */
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(ARTIST_KEY);
  } catch {
    /* nothing to do */
  }
}
