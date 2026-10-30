// A small WebSocket server (RFC 6455) on node:http, so moyu needs no npm install.
// It covers what moyu uses: text frames out, close codes, ping/pong. Frames the
// client sends are read for close and ping only; moyu takes moves over HTTP.
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

function frame(opcode, payload) {
  const n = payload.length;
  const head = n < 126 ? Buffer.alloc(2) : n < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
  head[0] = 0x80 | opcode;
  if (n < 126) head[1] = n;
  else if (n < 65536) {
    head[1] = 126;
    head.writeUInt16BE(n, 2);
  } else {
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(n), 2);
  }
  return Buffer.concat([head, payload]);
}

class Socket extends EventEmitter {
  OPEN = OPEN;
  readyState = OPEN;
  #socket;
  #buf = Buffer.alloc(0);

  constructor(socket) {
    super();
    this.#socket = socket;
    socket.setNoDelay(true);
    socket.on('data', (chunk) => this.#read(chunk));
    socket.on('error', () => socket.destroy());
    socket.on('close', () => {
      this.readyState = CLOSED;
      this.emit('close');
    });
  }

  send(text) {
    if (this.readyState === OPEN) this.#socket.write(frame(0x1, Buffer.from(String(text))));
  }

  close(code = 1000, reason = '') {
    if (this.readyState !== OPEN) return;
    this.readyState = CLOSING;
    const body = Buffer.alloc(2 + Buffer.byteLength(reason));
    body.writeUInt16BE(code, 0);
    body.write(reason, 2);
    this.#socket.end(frame(0x8, body));
    // A client that never answers the close is dropped.
    setTimeout(() => this.#socket.destroy(), 2000).unref();
  }

  #read(chunk) {
    this.#buf = Buffer.concat([this.#buf, chunk]);
    for (;;) {
      const b = this.#buf;
      if (b.length < 2) return;
      const opcode = b[0] & 0x0f;
      const masked = b[1] & 0x80;
      let n = b[1] & 0x7f;
      let at = 2;
      if (n === 126) {
        if (b.length < 4) return;
        n = b.readUInt16BE(2);
        at = 4;
      } else if (n === 127) {
        if (b.length < 10) return;
        n = Number(b.readBigUInt64BE(2));
        at = 10;
      }
      const mask = masked ? b.subarray(at, at + 4) : null;
      if (masked) at += 4;
      if (b.length < at + n) return;
      const payload = Buffer.from(b.subarray(at, at + n));
      if (mask) for (let i = 0; i < n; i++) payload[i] ^= mask[i & 3];
      this.#buf = b.subarray(at + n);

      if (opcode === 0x8) {
        // Their close: answer it with the same code, then hang up.
        if (this.readyState === OPEN) {
          this.readyState = CLOSING;
          this.#socket.end(frame(0x8, payload.subarray(0, 2)));
        } else this.#socket.end();
        return;
      }
      if (opcode === 0x9 && this.readyState === OPEN) this.#socket.write(frame(0xa, payload));
    }
  }
}

// Same shape as the ws package's server: 'connection' gets (socket, req).
export class WebSocketServer extends EventEmitter {
  constructor({ server, path }) {
    super();
    server.on('upgrade', (req, socket) => {
      const key = req.headers['sec-websocket-key'];
      const ok = new URL(req.url, 'http://x').pathname === path && key && /websocket/i.test(req.headers.upgrade ?? '');
      if (!ok) {
        socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
        return;
      }
      const accept = createHash('sha1').update(key + GUID).digest('base64');
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
      this.emit('connection', new Socket(socket), req);
    });
  }
}
