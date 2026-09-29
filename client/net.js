// Conexión WebSocket con el servidor de salas.
export function serverUrl() {
  const custom = new URLSearchParams(location.search).get('server');
  if (custom) return custom;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.ping = 0;
    this._pingTimer = null;
  }

  on(type, fn) {
    this.handlers.set(type, fn);
  }

  get connected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  connect() {
    if (this.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(serverUrl());
      this.ws = ws;
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('timeout'));
      }, 6000);
      ws.onopen = () => {
        clearTimeout(timeout);
        this._startPing();
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('No se pudo conectar'));
      };
      ws.onclose = () => {
        clearInterval(this._pingTimer);
        if (this.ws === ws) {
          this.ws = null;
          this.handlers.get('disconnect')?.();
        }
      };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.t === 'pong') {
          this.ping = Math.round(performance.now() - msg.id);
          return;
        }
        this.handlers.get(msg.t)?.(msg);
      };
    });
  }

  _startPing() {
    clearInterval(this._pingTimer);
    this._pingTimer = setInterval(() => this.send({ t: 'ping', id: performance.now() }), 2000);
  }

  send(msg) {
    if (this.connected) this.ws.send(JSON.stringify(msg));
  }

  close() {
    const ws = this.ws;
    this.ws = null;
    clearInterval(this._pingTimer);
    if (ws) ws.close();
  }
}
