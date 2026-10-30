// Your moves, in the scene: a small tag pinned over each thing that does one right now
// (the shoe, the bell, your tokens, the cup), its key in a box. Clicking the thing, its
// tag or the key all do the same. A game hands show() what is open on each settle.
//
// item: { id, key?, label, at: () => ({ x, y }) on screen, cls?, dy? (pixels up from at),
// under? (hangs below at instead, with cls 'under'), avoid? () => screen rects it slides
// left off, like Yacht's dice tray }; one without a key is a note pinned there, not a move

export function sceneActs(stage, act) {
  const box = document.createElement('div');
  box.className = 'acts';
  document.querySelector('.hud').append(box);
  let items = [];
  const tags = new Map();

  // a tag hangs above its point and never drops into the chat and emoji row at the bottom;
  // one that would run under a panel the game keeps on screen (.keep-clear, like Yacht's
  // score card) slides left off it
  const bar = document.querySelector('.bar');
  stage.onFrame(() => {
    if (!items.length) return;
    const floor = (bar?.getBoundingClientRect().top ?? innerHeight) - 8;
    const panels = [...document.querySelectorAll('.keep-clear')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect());
    for (const it of items) {
      const tag = tags.get(it.id);
      const p = it.at();
      let x = p.x;
      tag.style.left = `${x}px`;
      tag.style.top = it.under ? `${Math.min(p.y + (it.dy ?? 0), floor - tag.offsetHeight)}px` : `${Math.min(p.y - (it.dy ?? 0), floor)}px`;
      const clear = it.avoid ? [...panels, ...it.avoid()] : panels;
      if (!clear.length) continue;
      const r = tag.getBoundingClientRect();
      for (const c of clear)
        if (r.right - (p.x - x) > c.left - 6 && r.left - (p.x - x) < c.right && r.bottom > c.top && r.top < c.bottom) x -= r.right - (p.x - x) - c.left + 6;
      // and never off the window's left edge
      x += Math.max(0, 4 - (r.left - (p.x - x)));
      tag.style.left = `${x}px`;
    }
  });

  const typing = () => document.activeElement?.matches('input, textarea');
  const keys = new AbortController();
  window.addEventListener(
    'keydown',
    (e) => {
      if (!items.length || typing() || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const it = items.find((x) => x.key && x.key.toLowerCase() === e.key.toLowerCase());
      if (!it) return;
      e.preventDefault();
      act(it.id);
    },
    { signal: keys.signal },
  );
  stage.onDispose(() => keys.abort());

  function show(list) {
    items = list;
    tags.clear();
    box.replaceChildren();
    for (const it of list) {
      const b = document.createElement(it.key ? 'button' : 'div');
      b.className = `act-tag ${it.key ? '' : 'note '}${it.cls ?? it.id}`;
      if (it.key) {
        const k = document.createElement('span');
        k.className = 'key';
        k.textContent = it.key;
        b.append(k);
      }
      b.append(it.label);
      if (it.key) b.onclick = () => act(it.id);
      tags.set(it.id, b);
      box.append(b);
    }
  }
  return { show, hide: () => show([]) };
}
