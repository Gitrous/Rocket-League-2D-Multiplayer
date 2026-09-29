// Gestión de salas online: crear, unirse, garaje, "listo" y partida con servidor autoritativo.
import { Match } from '../shared/game.js';
import {
  TICK_RATE, SNAPSHOT_EVERY, defaultLoadout, sanitizeLoadout, sanitizeName, sanitizeInput,
} from '../shared/config.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I para evitar confusiones
const CODE_LENGTH = 4;

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

export class RoomManager {
  constructor({ tickRate = TICK_RATE, matchDuration } = {}) {
    this.rooms = new Map();
    this.tickRate = tickRate;
    this.matchDuration = matchDuration;
  }

  newCode() {
    for (let tries = 0; tries < 1000; tries++) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('No quedan códigos de sala libres');
  }

  // Punto de entrada para cada mensaje de un cliente.
  handle(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;

    switch (msg.t) {
      case 'create': return this.create(ws, msg);
      case 'join': return this.join(ws, msg);
      case 'loadout': return this.setLoadout(ws, msg);
      case 'ready': return this.setReady(ws, msg);
      case 'input': return this.setInput(ws, msg);
      case 'rematch': return this.rematch(ws);
      case 'leave': return this.leave(ws);
      case 'ping': return send(ws, { t: 'pong', id: msg.id });
      default: return undefined;
    }
  }

  create(ws, msg) {
    this.leave(ws);
    const code = this.newCode();
    const room = {
      code,
      phase: 'lobby', // lobby → garage → playing → ended → garage ...
      players: [null, null],
      match: null,
      loop: null,
    };
    this.rooms.set(code, room);
    this._seat(room, 0, ws, msg.name, msg.loadout);
    this.broadcastRoom(room);
  }

  join(ws, msg) {
    const code = String(msg.code || '').toUpperCase().trim();
    const room = this.rooms.get(code);
    if (!room) return send(ws, { t: 'error', code: 'not_found', msg: 'No existe ninguna sala con ese código.' });
    if (ws.room === room) return undefined;
    const free = room.players.findIndex((p) => p === null);
    if (free < 0 || room.phase === 'playing') return send(ws, { t: 'error', code: 'full', msg: 'La sala está llena.' });
    this.leave(ws);
    this._seat(room, free, ws, msg.name, msg.loadout);
    if (room.players.every(Boolean)) {
      room.phase = 'garage';
      for (const p of room.players) p.ready = false;
    }
    this.broadcastRoom(room);
  }

  _seat(room, slot, ws, name, loadout) {
    room.players[slot] = {
      ws,
      name: sanitizeName(name, slot === 0 ? 'Jugador 1' : 'Jugador 2'),
      loadout: loadout ? sanitizeLoadout(loadout, slot) : defaultLoadout(slot),
      ready: false,
      input: sanitizeInput(null),
    };
    ws.room = room;
    ws.slot = slot;
  }

  setLoadout(ws, msg) {
    const room = ws.room;
    if (!room || (room.phase !== 'garage' && room.phase !== 'lobby')) return;
    const p = room.players[ws.slot];
    if (!p || p.ready) return;
    p.loadout = sanitizeLoadout(msg.loadout, ws.slot);
    this.broadcastRoom(room);
  }

  setReady(ws, msg) {
    const room = ws.room;
    if (!room || room.phase !== 'garage') return;
    const p = room.players[ws.slot];
    if (!p) return;
    p.ready = !!msg.ready;
    this.broadcastRoom(room);
    if (room.players.every((pl) => pl && pl.ready)) this.startMatch(room);
  }

  setInput(ws, msg) {
    const room = ws.room;
    if (!room || room.phase !== 'playing') return;
    const p = room.players[ws.slot];
    if (p) p.input = sanitizeInput(msg.i);
  }

  rematch(ws) {
    const room = ws.room;
    if (!room || room.phase !== 'ended') return;
    room.phase = 'garage';
    for (const p of room.players) if (p) p.ready = false;
    this.broadcastRoom(room);
  }

  startMatch(room) {
    room.phase = 'playing';
    room.match = new Match({
      loadouts: room.players.map((p) => p.loadout),
      names: room.players.map((p) => p.name),
      duration: this.matchDuration,
    });
    for (const p of room.players) p.input = sanitizeInput(null);
    room.players.forEach((p, slot) => send(p.ws, {
      t: 'start',
      you: slot,
      loadouts: room.players.map((pl) => pl.loadout),
      names: room.players.map((pl) => pl.name),
      tickRate: this.tickRate,
    }));

    let pending = [];
    room.loop = setInterval(() => {
      const match = room.match;
      if (!match) return;
      room.players.forEach((p, slot) => p && match.setInput(slot, p.input));
      match.step();
      pending.push(...match.drainEvents());
      if (match.tick % SNAPSHOT_EVERY === 0 || match.finished) {
        const msg = JSON.stringify({ t: 'state', s: match.snapshot(), e: pending });
        pending = [];
        for (const p of room.players) if (p && p.ws.readyState === 1) p.ws.send(msg);
      }
      if (match.finished) this.endMatch(room);
    }, 1000 / this.tickRate);
  }

  endMatch(room) {
    this._stopLoop(room);
    room.phase = 'ended';
    const match = room.match;
    room.match = null;
    for (const p of room.players) if (p) p.ready = false;
    for (const p of room.players) send(p?.ws, { t: 'ended', winner: match.winner, score: match.score });
    this.broadcastRoom(room);
  }

  _stopLoop(room) {
    if (room.loop) clearInterval(room.loop);
    room.loop = null;
  }

  leave(ws) {
    const room = ws.room;
    if (!room) return;
    ws.room = null;
    const slot = room.players.findIndex((p) => p && p.ws === ws);
    if (slot >= 0) room.players[slot] = null;

    const remaining = room.players.find(Boolean);
    if (!remaining) {
      this._stopLoop(room);
      this.rooms.delete(room.code);
      return;
    }
    // el que se queda pasa a ser el anfitrión y espera a otro rival
    const wasPlaying = room.phase === 'playing';
    this._stopLoop(room);
    room.match = null;
    room.players = [remaining, null];
    remaining.ws.slot = 0;
    remaining.ready = false;
    room.phase = 'lobby';
    send(remaining.ws, { t: 'opponent_left', duringMatch: wasPlaying });
    this.broadcastRoom(room);
  }

  roomState(room) {
    return {
      t: 'room',
      code: room.code,
      phase: room.phase,
      players: room.players.map((p) => (p ? { name: p.name, loadout: p.loadout, ready: p.ready } : null)),
    };
  }

  broadcastRoom(room) {
    const state = this.roomState(room);
    for (const p of room.players) if (p) send(p.ws, { ...state, you: p.ws.slot });
  }

  shutdown() {
    for (const room of this.rooms.values()) this._stopLoop(room);
    this.rooms.clear();
  }
}
