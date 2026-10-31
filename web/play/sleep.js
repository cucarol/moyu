// The server stops when nobody uses it, and a page can't start it again: only the
// agent's next command does. So a page says the table is asleep and waits for it.
export const serverUp = () => fetch('/api/health', { cache: 'no-store' }).then((r) => r.ok, () => false);

// A reload while it is stopped would get the browser's error page; the worker answers
// with an "asleep" page instead, which reloads itself once the server is back.
navigator.serviceWorker?.register('/sw.js').catch(() => {});
