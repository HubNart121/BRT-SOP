/**
 * Accounts sign in with Google only and must be Gmail addresses.
 * The server makes one exception: BOOTSTRAP_ADMIN_EMAIL (the first administrator).
 */
const GMAIL_RE = /^[^\s@]+@gmail\.com$/i;

export const isGmail = (email: string): boolean => GMAIL_RE.test(email.trim());
