// Live mode (?live=1 on a table or room page): the page shown on a livestream, where the
// viewers play the human seat by danmaku. The 3D table fills the page, with a quiet HUD
// over it that shows each move's command and everything the game knows; the page's own
// chat, input and emoji row go, since the stream frame around it carries the chat. On
// the stream it is an iframe of 1600x900 in a 1080p frame. It is the stream's own page,
// not a setting of the game: only a URL with ?live=1 is live, and nothing remembers it,
// so the page people play on never turns live. Only roulette has a live HUD, so on the
// raft (21, Yacht) even a live page stays as it is (style.css).
export const live = new URLSearchParams(location.search).get('live') === '1';

// Stream type: read on a phone from a 1080p stream, where the page is 900 pixels high,
// so sized by the window's height rather than the desktop's rules, in half grids of the
// pixel font: at 900, --live-s 24px for the status chip, --live-t 30px for the legend
// and the agent's slot numbers, --live-cmd 36px for the viewers' numbers and the shots.
// A bigger window scales them up, a smaller one down.
function fitLive() {
  const dpr = window.devicePixelRatio || 1;
  const grids = (n) => Math.max(1, Math.floor(((innerHeight * dpr) / 900) * n * 2 + 0.01) / 2); // never over the window's share
  const root = document.documentElement.style;
  root.setProperty('--live-s', `${(12 * grids(2)) / dpr}px`);
  root.setProperty('--live-t', `${(12 * grids(2.5)) / dpr}px`);
  root.setProperty('--live-cmd', `${(12 * grids(3)) / dpr}px`);
}
// The streamer's corner, top right: 暂停 and 重置 for the stream, and ⚙. The page only asks;
// the stream frame around it (an iframe's parent) runs the stream and says back whether
// it is paused. Without such a frame only ⚙ shows. 重置 asks for a second click.
function corner() {
  const box = document.createElement('div');
  box.className = 'live-corner';
  const button = (text, title, onclick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pixbtn';
    b.textContent = text;
    b.title = title;
    b.onclick = onclick;
    box.append(b);
    return b;
  };
  if (parent !== window) {
    const ask = (action) => parent.postMessage({ moyu: 'control', action }, '*');
    let paused = false;
    const pause = button('暂停', '暂停：投票停表，下一局先不开', () => ask(paused ? 'resume' : 'pause'));
    let armed = null;
    const reset = button('重置', '重置：这局不算，同一个座位重新开一局', () => {
      if (!armed) {
        reset.textContent = '再点一下重置';
        armed = setTimeout(() => ((armed = null), (reset.textContent = '重置')), 3000);
        return;
      }
      clearTimeout(armed);
      armed = null;
      reset.textContent = '重置';
      ask('reset');
    });
    addEventListener('message', (e) => {
      if (e.source !== parent || e.data?.moyu !== 'paused') return;
      paused = !!e.data.paused;
      pause.textContent = paused ? '继续' : '暂停';
      box.classList.toggle('paused', paused);
    });
  }
  button('⚙', '设置', () => document.querySelector('#open-settings')?.click());
  document.body.append(box);
}

if (live) {
  document.documentElement.classList.add('live');
  fitLive();
  window.addEventListener('resize', fitLive);
  corner();
}
