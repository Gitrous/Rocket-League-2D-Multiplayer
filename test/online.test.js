import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createServer } from '../server/index.js';

let srv;
before(async () => { srv = await createServer({ port: 0, matchDuration: 1 }); });
after(() => new Promise((r) => { for (const c of srv.wss.clients) c.terminate(); srv.server.close(r); }));

function client() {
  const ws = new WebSocket(`ws://localhost:${srv.port}/ws`);
  const queue = [];
  const waiters = [];
  ws.on('message', (d) => {
    const msg = JSON.parse(d.toString());
    const w = waiters.findIndex((x) => x.pred(msg));
    if (w >= 0) waiters.splice(w, 1)[0].resolve(msg);
    else queue.push(msg);
  });
  return {
    ws,
    open: () => new Promise((r) => ws.once('open', r)),
    send: (m) => ws.send(JSON.stringify(m)),
    clear: () => { queue.length = 0; },
    next(pred, ms = 8000) {
      const i = queue.findIndex(pred);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout esperando mensaje')), ms);
        waiters.push({ pred, resolve: (m) => { clearTimeout(t); resolve(m); } });
      });
    },
  };
}

test('sirve el juego y la librería de físicas', async () => {
  const base = `http://localhost:${srv.port}`;
  for (const p of ['/', '/main.js', '/shared/game.js', '/vendor/planck.mjs']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200, p);
  }
  assert.equal((await fetch(`${base}/shared/../server/rooms.js`)).status, 404);
});

test('la sala usa la opción de turbo de quien la crea', async () => {
  const a = client();
  const b = client();
  await Promise.all([a.open(), b.open()]);
  a.send({ t: 'create', name: 'A', infiniteBoost: false });
  const lobby = await a.next((m) => m.t === 'room');
  assert.equal(lobby.infiniteBoost, false);
  b.send({ t: 'join', code: lobby.code, name: 'B', infiniteBoost: true });
  const g = await b.next((m) => m.t === 'room' && m.phase === 'garage');
  assert.equal(g.infiniteBoost, false);
  a.send({ t: 'ready', ready: true });
  b.send({ t: 'ready', ready: true });
  const start = await b.next((m) => m.t === 'start');
  assert.equal(start.infiniteBoost, false);
  const st = await b.next((m) => m.t === 'state');
  assert.equal(st.s.infiniteBoost, false);
  assert.equal(st.s.cars[0].bo, 33);
  a.ws.close();
  b.ws.close();
});

test('unirse a una sala que no existe da error', async () => {
  const c = client();
  await c.open();
  c.send({ t: 'join', code: 'ZZZZ', name: 'x' });
  const m = await c.next((x) => x.t === 'error');
  assert.equal(m.code, 'not_found');
  c.ws.close();
});

test('flujo completo: crear, unirse, garaje, listos, partida y revancha', async () => {
  const a = client();
  const b = client();
  await Promise.all([a.open(), b.open()]);

  a.send({ t: 'create', name: 'Ana', loadout: { color: 3, body: 1, wheels: 2, trail: 1, type: 0 } });
  const lobby = await a.next((m) => m.t === 'room' && m.phase === 'lobby');
  assert.match(lobby.code, /^[A-Z0-9]{4}$/);
  assert.equal(lobby.you, 0);

  b.send({ t: 'join', code: lobby.code.toLowerCase(), name: 'Beto' });
  const gb = await b.next((m) => m.t === 'room' && m.phase === 'garage');
  const ga = await a.next((m) => m.t === 'room' && m.phase === 'garage');
  assert.equal(gb.you, 1);
  assert.deepEqual(ga.players.map((p) => p.name), ['Ana', 'Beto']);
  assert.equal(ga.players[0].loadout.color, 3);

  // un tercero no puede entrar
  const c = client();
  await c.open();
  c.send({ t: 'join', code: lobby.code, name: 'Carla' });
  assert.equal((await c.next((m) => m.t === 'error')).code, 'full');
  c.ws.close();

  // cambiar coche en el garaje se ve en el otro lado
  b.send({ t: 'loadout', loadout: { color: 5, body: 2, wheels: 1, trail: 4, type: 2 } });
  const seen = await a.next((m) => m.t === 'room' && m.players[1]?.loadout.color === 5);
  assert.equal(seen.players[1].loadout.body, 2);

  // un solo "listo" no empieza la partida
  a.send({ t: 'ready', ready: true });
  await b.next((m) => m.t === 'room' && m.players[0].ready === true);
  b.send({ t: 'ready', ready: true });

  const [sa, sb] = await Promise.all([a.next((m) => m.t === 'start'), b.next((m) => m.t === 'start')]);
  assert.equal(sa.you, 0);
  assert.equal(sb.you, 1);
  assert.equal(sa.loadouts[1].color, 5);

  // el servidor manda el estado y aplica los controles de cada uno
  const first = await a.next((m) => m.t === 'state');
  assert.equal(first.s.phase, 'countdown');
  b.send({ t: 'input', i: { h: -1, boost: true } });
  const playing = await b.next((m) => m.t === 'state' && m.s.phase === 'play' && m.s.cars[1].x < 860);
  assert.ok(playing.s.cars[1].b === 1);

  // el partido dura 1 s en el test; con ventaja en el marcador termina y el servidor lo anuncia
  const room = srv.rooms.rooms.get(lobby.code);
  room.match.score = [2, 0];
  const endA = await a.next((m) => m.t === 'ended', 10000);
  assert.equal(endA.winner, 0);
  await b.next((m) => m.t === 'ended');

  // revancha: los dos vuelven al garaje sin estar listos
  a.clear();
  b.send({ t: 'rematch' });
  const back = await a.next((m) => m.t === 'room' && m.phase === 'garage');
  assert.deepEqual(back.players.map((p) => p.ready), [false, false]);

  // si uno se va, el otro vuelve a la sala de espera
  b.ws.close();
  await a.next((m) => m.t === 'opponent_left');
  const alone = await a.next((m) => m.t === 'room' && m.phase === 'lobby');
  assert.equal(alone.players[1], null);
  a.ws.close();
});
