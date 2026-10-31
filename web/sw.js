// moyu's service worker. The server stops when nobody uses it; a table or room page
// reloaded then would get the browser's error page. This answers such a reload with a
// small "asleep" page that reloads itself once an agent's command starts the server.
// It caches nothing and touches no other request.
const WORDS = {
  en: ['The table is asleep', 'Ask your agent to continue, and this page comes back by itself.'],
  'zh-CN': ['牌桌睡着了', '让你的 agent 继续，这个页面会自己回来。'],
  'zh-TW': ['牌桌睡著了', '請你的 agent 繼續，這個頁面會自己回來。'],
};

function words(url) {
  const tags = [new URL(url).searchParams.get('lang'), ...(self.navigator.languages ?? [])].filter(Boolean).map((t) => t.toLowerCase());
  for (const t of tags) {
    if (t.startsWith('zh')) return WORDS[/hant|tw|hk|mo/.test(t) ? 'zh-TW' : 'zh-CN'];
    if (t.startsWith('en')) return WORDS.en;
  }
  return WORDS.en;
}

function asleep(url) {
  const [title, line] = words(url);
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>moyu</title>
<style>html{background:#0b0f0e;color:#e8e2cf;font:16px/1.6 system-ui,sans-serif}body{display:grid;place-items:center;min-height:100vh;margin:0;padding:0 16px;text-align:center}h1{font-size:22px;margin:0 0 8px}p{margin:0;opacity:.75}</style>
<h1>${title}</h1><p>${line}</p>
<script>setInterval(() => fetch('/api/health', { cache: 'no-store' }).then((r) => r.ok && location.reload(), () => {}), 3000);</script>`;
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(asleep(e.request.url), { headers: { 'content-type': 'text/html; charset=utf-8' } })));
});
