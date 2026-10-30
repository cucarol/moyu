// The one session on every screen in the film, on the film's clock (seconds), so a screen
// left in one part and picked up in the next shows the same picture. The day's work is one
// pipeline, a job per wait: at noon you ask for the tests (they run through the machine room
// and pass in its green wave), at dusk for the build (the raft's lanterns), and on the raft,
// the laptop floated over to you, for the deploy (the stars). Each part sets the session from
// its own time: session.at(part, t).
//
// PARTS: each part in film order, how long it runs (s), where it starts (filled in), its clock
// on the taskbar. The game parts' lengths are their director scripts' (b-machine.js and on).
// Screens cut from one to the next share a clock, so the taskbar never jumps at a cut. The
// machine room's last half second plays on in the film over dusk's start, shrinking into the
// window there (pv/cut/join.py), so its dur here is its render's less that.
export const PARTS = { noon: { dur: 11.0, clock: '13:42' }, machine: { dur: 18.6, clock: '13:42' }, dusk: { dur: 6.25, clock: '18:06' }, raft: { dur: 20.6, clock: '18:06' }, yacht: { dur: 25.2, clock: '18:06' } };
let at = 0;
for (const p of Object.values(PARTS)) (p.at = at), (at += p.dur);
export const film = (part, t) => PARTS[part].at + t;

// what you ask, by the part it's asked in (its own seconds): typed over type, sent, answered,
// its card up
export const ASKS = {
  noon: { text: ['跑一下测试', 'run the tests'], type: [2.1, 3.2], send: 3.45, reply: ['好，开始跑。', 'Running them now.'], card: 4.3, job: 'test' },
  dusk: { text: ['打个包', 'build it'], type: [1.3, 1.75], send: 1.9, reply: ['好，开始打包。', 'Building now.'], card: 2.5, job: 'build' },
  raft: { text: ['部署上线', 'ship it'], type: [18.3, 18.9], send: 19.05, reply: ['好，开始部署。', 'Deploying now.'], card: 19.7, job: 'deploy' },
};
// each job: its card, when it's done (a part and its seconds: the beat its world lights up on)
const JOBS = {
  test: { cmd: 'npm test', label: ['跑测试中', 'Running'], total: 1204, done: ['machine', 16.8], doneText: ['1204 个全部通过', 'all 1204 passed'], said: ['全部通过。', 'All green.'] },
  build: { cmd: 'npm run build', label: ['打包中', 'Building'], total: 846, done: ['raft', 12.5], doneText: ['打包完成', 'built'], said: ['打好了。', 'Built.'] },
  deploy: { cmd: 'npm run deploy', label: ['部署中', 'Deploying'], total: 12, done: ['yacht', 15.0], doneText: ['已上线', 'live'], said: ['上线了。', "It's live."] },
};

export function createSession(ui, L) {
  const l = ([zh, en]) => L(zh, en);
  const st = ui.state;
  // the job's start and end on the film's clock, and how far it gets by the end of the part it's asked in
  const runs = {};
  for (const [part, a] of Object.entries(ASKS)) {
    const j = JOBS[a.job];
    const start = film(part, a.card);
    runs[a.job] = { start, end: film(...j.done), deskEnd: PARTS[part].at + PARTS[part].dur, rate: Math.max(0.6, j.total * 0.016) };
    st.jobs[a.job] = { cmd: j.cmd, label: l(j.label), total: j.total, passed: 0, elapsed: 0, done: false, doneText: l(j.doneText) };
  }
  // the chat as it stands at the start of the film (long enough that at every cut each screen's
  // list hangs from its input box), and everything said after, on the film's clock
  st.items = [
    { kind: 'user', text: L('看下登录为什么老掉线', 'Why does login keep dropping?'), at: -99 },
    { kind: 'say', text: L('session 过期没续上。', 'The session never renews.'), at: -99 },
    { kind: 'user', text: L('把登录模块重构一下', 'Refactor the login module'), at: -99 },
    { kind: 'say', text: L('改好了，动了两个文件。', 'Done, two files changed.'), at: -99 },
    { kind: 'edit', file: 'src/auth/session.ts', add: 42, del: 17, at: -99 },
    { kind: 'edit', file: 'src/auth/login.ts', add: 18, del: 9, at: -99 },
    { kind: 'gap', at: -99 },
  ];
  for (const [part, a] of Object.entries(ASKS)) {
    st.items.push(
      { kind: 'user', text: l(a.text), at: film(part, a.send) },
      { kind: 'say', text: l(a.reply), at: film(part, a.send + 0.45) },
      { kind: 'job', job: a.job, at: film(part, a.card) },
    );
    st.items.push({ kind: 'say', text: l(JOBS[a.job].said), at: runs[a.job].end + 0.5 }, { kind: 'gap', at: runs[a.job].end + 0.5 });
  }
  st.items.sort((a, b) => a.at - b.at);

  return {
    // set the screen for this part at its own second t; returns the film's time, for ui.draw
    at(part, t) {
      const T = film(part, t);
      st.clock = PARTS[part].clock;
      // the jobs: a slow crawl while you watch, then steadily on to done as its world lights up
      for (const [name, r] of Object.entries(runs)) {
        const J = st.jobs[name];
        const desk = Math.floor(Math.max(0, Math.min(T, r.deskEnd) - r.start) * r.rate);
        const k = Math.min(1, Math.max(0, (T - r.deskEnd) / (r.end - 0.2 - r.deskEnd)));
        J.passed = T < r.start ? 0 : Math.round(desk + (J.total - desk) * k);
        J.done = T >= r.end;
        // its clock runs a few times the film's, so the waits read as minutes
        J.elapsed = Math.max(0, Math.min(T, r.end) - r.start) * 6;
      }
      // the input box: in the part with an ask, typed a key at a time, the caret blinking until Enter
      const a = ASKS[part];
      st.input = '';
      st.caret = false;
      st.sent = false;
      if (a) {
        const chars = [...l(a.text)];
        const n = Math.floor(((t - a.type[0]) / (a.type[1] - a.type[0])) * chars.length) + 1;
        st.input = t >= a.type[0] && t < a.send ? chars.slice(0, Math.min(n, chars.length)).join('') : '';
        st.caret = t >= a.type[0] - 0.7 && t < a.send;
        st.sent = t >= a.send && t < a.send + 0.15;
      }
      return T;
    },
  };
}
