export function readIntakeToken(key: string): string | null {
  try { return window.sessionStorage.getItem(key); } catch { return null; }
}

export function rememberIntakeToken(key: string, token: string | null): void {
  try {
    if (token) window.sessionStorage.setItem(key, token);
    else window.sessionStorage.removeItem(key);
  } catch { /* The current in-memory session still works in restricted browsers. */ }
}
