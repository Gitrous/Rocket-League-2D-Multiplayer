// Flujo del juego: carga → menú → (1P / 2P / Online) → garaje → partida → resultado.
import {
  DT, TICK_RATE, COLORS, COLOR_NAMES, BODIES, WHEELS, TRAILS, CAR_TYPES,
  defaultLoadout, sanitizeLoadout, sanitizeName,
} from '/shared/config.js';
import { Keyboard, sameInput } from './input.js';
import { Sfx } from './audio.js';
import { Net } from './net.js';

const $ = (sel) => document.querySelector(sel);
const canvas = $('#game');
const keyboard = new Keyboard();
const sfx = new Sfx();
const net = new Net();

let Match; let Bot; let Renderer; let drawCar;
let renderer;

// ---------- estado general ----------
const app = {
  mode: null,            // '1p' | '2p' | 'online'
  loadouts: [defaultLoadout(0), defaultLoadout(1)],
  names: ['Tú', 'IA'],
  ready: [false, false],
  you: 0,                // en online: mi hueco (0 azul, 1 naranja)
  room: null,            // último estado de sala recibido
  running: null,         // partida en curso: { kind: 'local'|'online', ... }
};

// ---------- utilidades de UI ----------

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${id}`));
  const inGame = id === null;
  $('#exit-btn').hidden = !inGame;
  keyboard.setEnabled(inGame);
}

let toastTimer;
function toast(text, ms = 2600) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento: no pasa nada */ }
  },
};

function savedLoadout() { return sanitizeLoadout(store.get('loadout', null), 0); }
function savedName() { return sanitizeName(store.get('name', ''), ''); }
function infiniteBoost() { return $('#opt-infinite-boost').checked; }

// ---------- carga ----------

async function boot() {
  const fill = $('#load-fill');
  const text = $('#load-text');
  const steps = [
    ['Motor de físicas…', async () => { ({ Match } = await import('/shared/game.js')); }],
    ['Inteligencia artificial…', async () => { ({ Bot } = await import('/shared/ai.js')); }],
    ['Estadio y coches…', async () => {
      ({ Renderer, drawCar } = await import('./render.js'));
      renderer = new Renderer(canvas);
    }],
    ['Calentando motores…', () => new Promise((r) => setTimeout(r, 350))],
  ];
  try {
    for (let i = 0; i < steps.length; i++) {
      text.textContent = steps[i][0];
      await steps[i][1]();
      fill.style.width = `${((i + 1) / steps.length) * 100}%`;
    }
  } catch (err) {
    console.error(err);
    text.textContent = 'Error al cargar el juego. Recarga la página.';
    return;
  }
  $('#online-name').value = savedName();
  $('#opt-infinite-boost').checked = store.get('infiniteBoost', true) !== false;
  $('#opt-infinite-boost').addEventListener('change', (e) => store.set('infiniteBoost', e.target.checked));
  renderer.draw(null, { loadouts: app.loadouts }, 0);
  show('menu');
}

// ---------- garaje ----------

const OPTIONS = [
  { key: 'body', label: 'Carrocería', names: BODIES },
  { key: 'color', label: 'Color', names: COLOR_NAMES },
  { key: 'wheels', label: 'Ruedas', names: WHEELS },
  { key: 'trail', label: 'Estela turbo', names: TRAILS },
  { key: 'type', label: 'Manejo', names: CAR_TYPES.map((t) => t.name) },
];

// panels: [{ slot, title, editable, readyButton }]
let garagePanels = [];
let previewTime = 0;

function openGarage(panels, subtitle) {
  garagePanels = panels;
  $('#garage-sub').textContent = subtitle;
  const root = $('#garage-panels');
  root.innerHTML = '';
  for (const p of panels) {
    const el = document.createElement('div');
    el.className = `garage-panel team-${p.slot}`;
    el.dataset.slot = p.slot;
    el.innerHTML = `
      <h3><span class="pname"></span><span class="tag"></span></h3>
      <canvas width="320" height="120"></canvas>
      <div class="opts">${OPTIONS.map((o) => `
        <div class="opt" data-key="${o.key}">
          <span class="label">${o.label}</span>
          <button class="btn small" data-dir="-1" aria-label="Anterior">◀</button>
          <span class="value"></span>
          <button class="btn small" data-dir="1" aria-label="Siguiente">▶</button>
        </div>`).join('')}
      </div>
      ${p.readyButton ? '<button class="btn accent ready-btn">¡Listo!</button>' : ''}`;
    el.querySelectorAll('.opt button').forEach((b) => b.addEventListener('click', () => {
      sfx.unlock();
      const key = b.closest('.opt').dataset.key;
      changeLoadout(p.slot, key, Number(b.dataset.dir));
    }));
    el.querySelector('.ready-btn')?.addEventListener('click', () => { sfx.unlock(); toggleReady(p.slot); });
    root.appendChild(el);
  }
  show('garage');
  refreshGarage();
}

function changeLoadout(slot, key, dir) {
  if (app.ready[slot]) return;
  const opt = OPTIONS.find((o) => o.key === key);
  const l = { ...app.loadouts[slot] };
  l[key] = (l[key] + dir + opt.names.length) % opt.names.length;
  app.loadouts[slot] = l;
  if (slot === 0 && app.mode !== 'online') store.set('loadout', l);
  if (app.mode === 'online') {
    store.set('loadout', l);
    net.send({ t: 'loadout', loadout: l });
  }
  sfx.beep();
  refreshGarage();
}

function toggleReady(slot) {
  if (app.mode === 'online') {
    net.send({ t: 'ready', ready: !app.ready[slot] });
    return;
  }
  app.ready[slot] = !app.ready[slot];
  refreshGarage();
  if (app.ready.every(Boolean)) startLocalMatch();
}

function refreshGarage() {
  for (const p of garagePanels) {
    const el = document.querySelector(`.garage-panel[data-slot="${p.slot}"]`);
    if (!el) continue;
    const l = app.loadouts[p.slot];
    const ready = app.ready[p.slot];
    el.querySelector('.pname').textContent = p.title();
    const tag = el.querySelector('.tag');
    tag.textContent = ready ? 'LISTO' : 'Eligiendo…';
    tag.classList.toggle('ok', ready);
    el.classList.toggle('locked', !p.editable || ready);
    for (const o of OPTIONS) el.querySelector(`.opt[data-key="${o.key}"] .value`).textContent = o.names[l[o.key]];
    const btn = el.querySelector('.ready-btn');
    if (btn) {
      btn.textContent = ready ? 'Cancelar' : '¡Listo!';
      btn.classList.toggle('accent', !ready);
    }
  }
  let status = '';
  if (app.mode === 'online') {
    const other = 1 - app.you;
    if (app.ready[app.you] && !app.ready[other]) status = 'Esperando a que tu rival esté listo…';
    else if (!app.ready[app.you] && app.ready[other]) status = 'Tu rival ya está listo. ¡Pulsa «¡Listo!»!';
    else if (app.ready.every(Boolean)) status = '¡Empieza el partido!';
    else status = 'Elegid vuestros coches. La partida empieza cuando los dos pulséis «¡Listo!».';
  } else if (app.mode === '2p') {
    status = 'Cada jugador pulsa «¡Listo!» para empezar.';
  }
  $('#garage-status').textContent = status;
}

function drawGaragePreviews(dt) {
  previewTime += dt;
  for (const p of garagePanels) {
    const c = document.querySelector(`.garage-panel[data-slot="${p.slot}"] canvas`);
    if (!c) continue;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = '#ffffff14';
    g.fillRect(0, 96, c.width, 24);
    g.fillStyle = '#00000055';
    g.beginPath(); g.ellipse(160, 98, 80, 6, 0, 0, Math.PI * 2); g.fill();
    drawCar(g, {
      x: 160, y: 70, a: 0, f: p.slot === 0 ? 1 : -1,
      wheelAngle: previewTime * 3, loadout: app.loadouts[p.slot], team: p.slot, scale: 2.4,
    });
  }
}

// ---------- modos locales ----------

function openLocal(mode) {
  app.mode = mode;
  app.ready = [false, false];
  app.loadouts[0] = savedLoadout();
  if (mode === '1p') {
    app.names = [savedName() || 'Jugador', 'IA'];
    app.loadouts[1] = randomLoadout(1);
    app.ready[1] = true;
    openGarage([
      { slot: 0, title: () => `${app.names[0]} (tú)`, editable: true, readyButton: true },
      { slot: 1, title: () => 'IA (rival)', editable: false, readyButton: false },
    ], `1 jugador · contra la IA · turbo ${infiniteBoost() ? 'infinito' : 'limitado'}`);
  } else {
    app.names = ['Jugador 1', 'Jugador 2'];
    app.loadouts[1] = sanitizeLoadout(store.get('loadout2', null), 1);
    openGarage([
      { slot: 0, title: () => 'Jugador 1 · A/D W Espacio', editable: true, readyButton: true },
      { slot: 1, title: () => 'Jugador 2 · ←/→ ↑ Enter', editable: true, readyButton: true },
    ], `2 jugadores · mismo teclado · turbo ${infiniteBoost() ? 'infinito' : 'limitado'}`);
  }
}

function randomLoadout(slot) {
  const r = (n) => Math.floor(Math.random() * n);
  let color = r(COLORS.length);
  if (color === app.loadouts[0].color) color = (color + 1) % COLORS.length;
  return sanitizeLoadout({ color, body: r(BODIES.length), wheels: r(WHEELS.length), trail: r(TRAILS.length), type: r(CAR_TYPES.length) }, slot);
}

function startLocalMatch() {
  if (app.mode === '2p') store.set('loadout2', app.loadouts[1]);
  const match = new Match({ loadouts: app.loadouts, names: app.names, infiniteBoost: infiniteBoost() });
  app.running = {
    kind: 'local',
    match,
    bot: app.mode === '1p' ? new Bot(1) : null,
    acc: 0,
    info: { loadouts: match.loadouts, names: app.mode === '2p' ? null : app.names, you: app.mode === '1p' ? 0 : -1 },
  };
  renderer.reset();
  show(null);
}

function stepLocal(dt) {
  const run = app.running;
  const { match } = run;
  run.acc += Math.min(dt, 0.25);
  while (run.acc >= DT) {
    run.acc -= DT;
    if (app.mode === '1p') {
      match.setInput(0, keyboard.read('both'));
      match.setInput(1, run.bot.update(match));
    } else {
      match.setInput(0, keyboard.read('p1'));
      match.setInput(1, keyboard.read('p2'));
    }
    match.step();
    const state = match.snapshot();
    for (const e of match.drainEvents()) handleEvent(e, state);
    run.state = state;
    if (match.finished) {
      finishMatch(match.winner, match.score);
      return;
    }
  }
  if (run.state) renderer.draw(run.state, run.info, dt);
  updateBoostSounds(run.state);
}

// ---------- efectos ----------

let lastCountdown = null;
function handleEvent(e, state) {
  renderer.onEvent(e, state);
  switch (e.type) {
    case 'jump': case 'jump2': sfx.jump(); break;
    case 'flip': sfx.flip(); break;
    case 'hit': sfx.hit(e.power); break;
    case 'goal': sfx.goal(); break;
    case 'go': sfx.beep(true); break;
    case 'kickoff': lastCountdown = null; break;
    case 'end': sfx.end(); break;
    default: break;
  }
}

function updateBoostSounds(state) {
  if (!state) return;
  if (state.phase === 'countdown') {
    const n = Math.ceil(state.phaseTime);
    if (n !== lastCountdown && n > 0 && n <= 3) sfx.beep(false);
    lastCountdown = n;
  }
  state.cars.forEach((c, i) => sfx.setBoosting(i, !!c.b));
}

function finishMatch(winner, score) {
  sfx.stopAll();
  const run = app.running;
  app.running = null;
  keyboard.setEnabled(false);
  const names = app.mode === '2p' ? ['Jugador 1', 'Jugador 2'] : app.names;
  let title;
  if (winner < 0) title = '¡Empate!';
  else if (app.mode === '2p') title = `¡Gana ${names[winner]}!`;
  else title = winner === (app.mode === 'online' ? app.you : 0) ? '¡Has ganado!' : 'Has perdido…';
  $('#result-title').textContent = title;
  $('#result-score').innerHTML = `<span class="b">${score[0]}</span> - <span class="o">${score[1]}</span>`;
  $('#result-status').textContent = app.mode === 'online' ? 'Pulsa «Revancha» para volver los dos al garaje.' : '';
  show('result');
  // se sigue viendo el estadio detrás del resultado
  if (run?.state) renderer.draw(run.state, run.info, 0);
}

// ---------- online ----------

function onlineError(text) {
  $('#online-error').textContent = text;
}

async function ensureConnected() {
  try {
    await net.connect();
    return true;
  } catch {
    onlineError('No se puede conectar con el servidor. ¿Está en marcha?');
    return false;
  }
}

function onlineName() {
  const name = sanitizeName($('#online-name').value, '');
  store.set('name', name);
  return name || 'Jugador';
}

async function createRoom() {
  onlineError('');
  if (!(await ensureConnected())) return;
  app.mode = 'online';
  net.send({ t: 'create', name: onlineName(), loadout: savedLoadout(), infiniteBoost: infiniteBoost() });
}

async function joinRoom() {
  onlineError('');
  const code = $('#join-code').value.trim().toUpperCase();
  if (code.length !== 4) return onlineError('El código tiene 4 caracteres.');
  if (!(await ensureConnected())) return undefined;
  app.mode = 'online';
  net.send({ t: 'join', code, name: onlineName(), loadout: savedLoadout() });
  return undefined;
}

function leaveRoom() {
  net.send({ t: 'leave' });
  app.room = null;
  app.running = null;
  sfx.stopAll();
}

net.on('error', (msg) => {
  onlineError(msg.msg || 'Error');
  toast(msg.msg || 'Error');
});

net.on('room', (room) => {
  app.room = room;
  app.you = room.you;
  room.players.forEach((p, i) => {
    if (!p) return;
    app.names[i] = p.name;
    app.ready[i] = p.ready;
    // mi propio coche lo mantengo como lo tengo en pantalla salvo al entrar
    if (i !== app.you || !garagePanels.length) app.loadouts[i] = p.loadout;
  });

  if (room.phase === 'lobby') {
    $('#lobby-code').textContent = room.code;
    garagePanels = [];
    if (!app.running) show('lobby');
    return;
  }
  if (room.phase === 'garage') {
    const onGarage = $('#screen-garage').classList.contains('active') && garagePanels.length === 2;
    if (!onGarage) {
      const mine = sanitizeLoadout(store.get('loadout', null), app.you);
      app.loadouts[app.you] = mine;
      if (app.you === 1 && mine.color === room.players[0]?.loadout.color) {
        // colores distintos para no confundirse
        mine.color = (mine.color + 1) % COLORS.length;
      }
      if (JSON.stringify(mine) !== JSON.stringify(room.players[app.you].loadout)) net.send({ t: 'loadout', loadout: mine });
      const panels = [0, 1].map((slot) => ({
        slot,
        title: () => `${app.names[slot]}${slot === app.you ? ' (tú)' : ''}`,
        editable: slot === app.you,
        readyButton: slot === app.you,
      }));
      openGarage(panels, `Sala ${room.code} · online · turbo ${room.infiniteBoost ? 'infinito' : 'limitado'}`);
    } else {
      refreshGarage();
    }
  }
});

net.on('start', (msg) => {
  app.you = msg.you;
  app.loadouts = msg.loadouts.map((l, i) => sanitizeLoadout(l, i));
  app.names = msg.names;
  app.running = {
    kind: 'online',
    buffer: [],
    events: [],
    offset: null,
    lastInput: null,
    lastSend: 0,
    info: { loadouts: app.loadouts, names: app.names, you: app.you },
    state: null,
  };
  garagePanels = [];
  renderer.reset();
  show(null);
});

net.on('state', (msg) => {
  const run = app.running;
  if (!run || run.kind !== 'online') return;
  const s = msg.s;
  const now = performance.now();
  // reloj del servidor estimado en ticks
  const sample = s.tick - now / (1000 / TICK_RATE);
  if (run.offset === null || sample > run.offset) run.offset = sample;
  else run.offset += (sample - run.offset) * 0.02;
  run.buffer.push(s);
  if (run.buffer.length > 60) run.buffer.shift();
  for (const e of msg.e) run.events.push({ tick: s.tick, e });
});

net.on('ended', (msg) => {
  if (!app.running || app.running.kind !== 'online') return;
  // deja que se vean los últimos instantes
  setTimeout(() => finishMatch(msg.winner, msg.score), 150);
});

net.on('opponent_left', (msg) => {
  toast(msg.duringMatch ? 'Tu rival se ha desconectado. Esperando a otro jugador…' : 'Tu rival ha salido de la sala.');
  app.running = null;
  sfx.stopAll();
  app.ready = [false, false];
});

net.on('disconnect', () => {
  if (app.mode !== 'online') return;
  app.running = null;
  sfx.stopAll();
  toast('Se ha perdido la conexión con el servidor.');
  show('online');
});

const INTERP_TICKS = 5; // ~83 ms de margen para que el movimiento sea suave

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function interpolate(a, b, t) {
  if (!b || a === b) return a;
  const teleport = (p, q) => Math.hypot(q.x - p.x, q.y - p.y) > 120;
  return {
    ...b,
    cars: b.cars.map((cb, i) => {
      const ca = a.cars[i];
      if (teleport(ca, cb)) return cb;
      return { ...cb, x: lerp(ca.x, cb.x, t), y: lerp(ca.y, cb.y, t), a: lerpAngle(ca.a, cb.a, t) };
    }),
    ball: a.ball && b.ball && !teleport(a.ball, b.ball)
      ? { ...b.ball, x: lerp(a.ball.x, b.ball.x, t), y: lerp(a.ball.y, b.ball.y, t), a: lerpAngle(a.ball.a, b.ball.a, t) }
      : b.ball,
    timer: lerp(a.timer, b.timer, t),
    phaseTime: lerp(a.phaseTime, b.phaseTime, t),
  };
}

function stepOnline(dt) {
  const run = app.running;
  const now = performance.now();

  // enviar controles cuando cambian (y cada 200 ms por si acaso)
  const input = keyboard.read('both');
  if (!sameInput(input, run.lastInput) || now - run.lastSend > 200) {
    net.send({ t: 'input', i: input });
    run.lastInput = input;
    run.lastSend = now;
  }

  if (!run.buffer.length) {
    renderer.draw(null, run.info, dt);
    return;
  }
  const renderTick = now / (1000 / TICK_RATE) + run.offset - INTERP_TICKS;
  const buf = run.buffer;
  while (buf.length > 2 && buf[1].tick <= renderTick) buf.shift();
  let state;
  if (buf.length >= 2 && buf[0].tick <= renderTick) {
    const t = Math.min(1, (renderTick - buf[0].tick) / (buf[1].tick - buf[0].tick));
    state = interpolate(buf[0], buf[1], t);
  } else {
    state = buf[0];
  }

  // eventos (sonidos, explosión de gol) sincronizados con lo que se ve
  while (run.events.length && run.events[0].tick <= renderTick + 1) handleEvent(run.events.shift().e, state);

  run.state = state;
  renderer.draw(state, run.info, dt);
  updateBoostSounds(state);

  // latencia
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff80';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`ping ${net.ping} ms`, 1016, 376);
}

// ---------- bucle principal ----------

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (app.running?.kind === 'local') stepLocal(dt);
  else if (app.running?.kind === 'online') stepOnline(dt);
  if (garagePanels.length && $('#screen-garage').classList.contains('active')) drawGaragePreviews(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- botones ----------

const actions = {
  'mode-1p': () => openLocal('1p'),
  'mode-2p': () => openLocal('2p'),
  'mode-online': () => { onlineError(''); show('online'); },
  'back-menu': () => show('menu'),
  'create-room': createRoom,
  'join-room': joinRoom,
  'copy-code': async () => {
    try {
      await navigator.clipboard.writeText($('#lobby-code').textContent);
      toast('Código copiado');
    } catch {
      toast('No se pudo copiar; apúntalo a mano.');
    }
  },
  'leave-room': () => { leaveRoom(); show('online'); },
  'garage-back': () => {
    if (app.mode === 'online') { leaveRoom(); show('online'); } else show('menu');
    garagePanels = [];
  },
  rematch: () => {
    if (app.mode === 'online') {
      if (!app.room) { show('online'); return; }
      net.send({ t: 'rematch' });
    } else {
      openLocal(app.mode);
    }
  },
  'to-menu': () => {
    if (app.mode === 'online') leaveRoom();
    show('menu');
  },
  'exit-match': () => {
    sfx.stopAll();
    if (app.mode === 'online') { leaveRoom(); show('online'); } else { app.running = null; show('menu'); }
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  sfx.unlock();
  actions[el.dataset.action]?.();
});

$('#join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
$('#join-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && app.running) actions['exit-match']();
});

boot();
