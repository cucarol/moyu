// moyu next: the agent asks for its next frame over HTTP and waits for it inside its own
// turn, instead of being woken for every frame. A Waiter stands in the seat's subs like a
// socket. While a request waits, and for HOLD_MS after each frame it hands over (the agent
// is acting on it), it is the only one the seat is told through: a listener's socket gets
// nothing, so the agent isn't woken again for what it handles in this turn. A frame that
// comes between two requests stays owed and goes out with the next one. Once the agent
// stops asking, onIdle sends what is still owed the usual way.
export class Waiter {
  static HOLD_MS = Number(process.env.MOYU_HOLD_MS ?? 60 * 1000);
  // what a waiting request gets when the seat is let go (the talk after a game is over)
  static CLOSED = Symbol('closed');

  constructor(seat, onIdle) {
    this.seat = seat;
    this.waiter = true;
    this.onIdle = onIdle;
    this.pending = null; // the waiting request's resolve
    this.holdUntil = 0;
  }

  get active() {
    return Boolean(this.pending) || Date.now() < this.holdUntil;
  }

  hold() {
    this.holdUntil = Date.now() + Waiter.HOLD_MS;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => !this.active && this.onIdle(), Waiter.HOLD_MS + 10);
    this.idleTimer.unref?.();
  }

  // The agent is done asking (the game is over): let the listener have the seat again.
  release() {
    this.holdUntil = 0;
  }

  // The frame, or null when nothing came in ms. A request whose caller hung up (signal)
  // gives up its place, so no frame is handed to it and lost.
  wait(ms, signal) {
    this.answer(null); // a newer request replaces an older one
    return new Promise((resolve) => {
      this.pending = resolve;
      this.timer = setTimeout(() => this.answer(null), ms);
      this.timer.unref?.();
      signal?.addEventListener('abort', () => {
        if (this.pending !== resolve) return;
        this.pending = null;
        clearTimeout(this.timer);
        resolve(null);
      });
    });
  }

  answer(value) {
    const resolve = this.pending;
    if (!resolve) return false;
    this.pending = null;
    clearTimeout(this.timer);
    this.hold();
    resolve(value);
    return true;
  }

  // As a socket's send: false between requests, so the frame stays owed.
  send(text) {
    return this.answer(text);
  }

  close() {
    this.answer(Waiter.CLOSED);
  }
}
