// Dibujo del juego en canvas: estadio, coches, pelota, partículas y marcador. Todo con formas vectoriales propias.
import { WIDTH, HEIGHT, ARENA, BALL, CAR, COLORS } from '/shared/config.js';
import { arenaOutline } from '/shared/game.js';

export const TEAM_COLORS = ['#2f7bff', '#ff8a1f'];
const TEAM_LIGHT = ['#8fb8ff', '#ffc38a'];

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; } else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- coche ----------

const BODY_PATHS = [
  // Bólido: bajo y alargado
  (c) => {
    c.moveTo(-32, 6); c.lineTo(-32, -2); c.lineTo(-26, -6); c.lineTo(-10, -8); c.lineTo(-2, -15);
    c.lineTo(12, -15); c.lineTo(20, -7); c.lineTo(31, -4); c.lineTo(33, 2); c.lineTo(32, 6); c.closePath();
  },
  // Todoterreno: cabina alta y cuadrada
  (c) => {
    c.moveTo(-32, 7); c.lineTo(-32, -6); c.lineTo(-24, -8); c.lineTo(-20, -18); c.lineTo(10, -18);
    c.lineTo(16, -8); c.lineTo(31, -7); c.lineTo(33, 0); c.lineTo(32, 7); c.closePath();
  },
  // Cuña: morro afilado
  (c) => {
    c.moveTo(-32, 6); c.lineTo(-32, -10); c.lineTo(-22, -13); c.lineTo(-6, -13); c.lineTo(34, 1);
    c.lineTo(32, 6); c.closePath();
  },
];

const WINDOW_PATHS = [
  (c) => { c.moveTo(-7, -8); c.lineTo(-1, -13); c.lineTo(11, -13); c.lineTo(17, -7); c.closePath(); },
  (c) => { c.moveTo(-18, -9); c.lineTo(-16, -16); c.lineTo(8, -16); c.lineTo(13, -9); c.closePath(); },
  (c) => { c.moveTo(-16, -11); c.lineTo(-6, -11); c.lineTo(12, -5); c.lineTo(-16, -5); c.closePath(); },
];

function drawWheel(ctx, x, y, angle, style, color) {
  const r = CAR.wheelRadius;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#15161c';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  if (style === 0) {
    ctx.fillStyle = '#b9bfd0';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#15161c';
    ctx.fillRect(-1, -r * 0.5, 2, r);
  } else if (style === 1) {
    ctx.strokeStyle = '#e8ebf5';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75); ctx.stroke();
    }
  } else {
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = shade(color, 0.4);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = shade(color, 0.6);
    ctx.fillRect(-1, -r * 0.6, 2, 3);
  }
  ctx.restore();
}

/**
 * Dibuja un coche centrado en (x, y). facing: 1 mira a la derecha, -1 a la izquierda.
 */
export function drawCar(ctx, { x, y, a = 0, f = 1, wheelAngle = 0, loadout, team = -1, scale = 1 }) {
  const color = COLORS[loadout.color] || COLORS[0];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.scale(f * scale, scale);

  // brillo del equipo bajo el coche
  if (team >= 0) {
    ctx.fillStyle = TEAM_COLORS[team] + '55';
    ctx.fillRect(-30, 6, 60, 4);
  }

  const bodyPath = BODY_PATHS[loadout.body] || BODY_PATHS[0];
  const grad = ctx.createLinearGradient(0, -18, 0, 8);
  grad.addColorStop(0, shade(color, 0.35));
  grad.addColorStop(0.55, color);
  grad.addColorStop(1, shade(color, -0.35));
  ctx.beginPath(); bodyPath(ctx);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = shade(color, -0.55);
  ctx.stroke();

  ctx.beginPath(); (WINDOW_PATHS[loadout.body] || WINDOW_PATHS[0])(ctx);
  ctx.fillStyle = '#1a2340';
  ctx.fill();
  ctx.fillStyle = '#ffffff30';
  ctx.fillRect(-2, -12, 4, 5);

  // faro y piloto
  ctx.fillStyle = '#fff6c2';
  ctx.fillRect(29, -3, 3, 3);
  ctx.fillStyle = '#ff3048';
  ctx.fillRect(-32, -3, 2, 3);

  // franja del equipo
  if (team >= 0) {
    ctx.fillStyle = TEAM_COLORS[team];
    ctx.fillRect(-24, 1, 40, 2);
  }

  drawWheel(ctx, -CAR.wheelOffsetX, CAR.wheelOffsetY, wheelAngle, loadout.wheels, color);
  drawWheel(ctx, CAR.wheelOffsetX, CAR.wheelOffsetY, wheelAngle, loadout.wheels, color);
  ctx.restore();
}

// ---------- partículas ----------

function trailColor(trail, t) {
  switch (trail) {
    case 1: return Math.random() < 0.5 ? '#6ad7ff' : '#b36bff';
    case 2: return `hsl(${(t * 400 + Math.random() * 40) % 360}, 95%, 60%)`;
    case 3: return Math.random() < 0.5 ? '#d8d8e0' : '#9a9aa8';
    case 4: return Math.random() < 0.5 ? '#7dff5a' : '#d4ff3a';
    default: return Math.random() < 0.5 ? '#ffb43a' : '#ff5a1f';
  }
}

// ---------- renderer ----------

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.wheelAngles = [0, 0];
    this.shake = 0;
    this.time = 0;
    this.excite = 0;
    this.background = this._buildBackground();
    this.crowd = this._buildCrowd();
    this.flash = null; // { text, color, t }
    this.showHitboxes = false;
  }

  reset() {
    this.particles = [];
    this.shake = 0;
    this.flash = null;
  }

  _buildBackground() {
    const c = document.createElement('canvas');
    c.width = WIDTH; c.height = HEIGHT;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, '#0c1233');
    sky.addColorStop(1, '#1b2150');
    g.fillStyle = sky;
    g.fillRect(0, 0, WIDTH, HEIGHT);

    // focos del estadio
    for (const lx of [180, 512, 844]) {
      const lg = g.createRadialGradient(lx, 0, 5, lx, 0, 260);
      lg.addColorStop(0, '#ffffff30');
      lg.addColorStop(1, '#ffffff00');
      g.fillStyle = lg;
      g.fillRect(lx - 260, 0, 520, 300);
    }

    // interior del campo
    const outline = arenaOutline();
    g.beginPath();
    outline.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    const field = g.createLinearGradient(0, ARENA.ceilingY, 0, ARENA.floorY);
    field.addColorStop(0, '#1a2656cc');
    field.addColorStop(1, '#233a6bcc');
    g.fillStyle = field;
    g.fill();

    // mitad de campo y círculo central
    g.strokeStyle = '#ffffff22';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(WIDTH / 2, ARENA.ceilingY + 4); g.lineTo(WIDTH / 2, ARENA.floorY); g.stroke();
    g.beginPath(); g.arc(WIDTH / 2, 190, 56, 0, Math.PI * 2); g.stroke();

    // tinte de cada mitad
    g.fillStyle = '#2f7bff10';
    g.fillRect(ARENA.leftWallX, ARENA.ceilingY, WIDTH / 2 - ARENA.leftWallX, ARENA.floorY - ARENA.ceilingY);
    g.fillStyle = '#ff8a1f10';
    g.fillRect(WIDTH / 2, ARENA.ceilingY, ARENA.rightWallX - WIDTH / 2, ARENA.floorY - ARENA.ceilingY);

    // porterías (red)
    const goals = [
      [ARENA.goalBackLeft, ARENA.leftWallX, 0],
      [ARENA.rightWallX, ARENA.goalBackRight, 1],
    ];
    for (const [x0, x1, team] of goals) {
      g.fillStyle = TEAM_COLORS[team] + '33';
      g.fillRect(x0, ARENA.goalTopY, x1 - x0, ARENA.floorY - ARENA.goalTopY);
      g.strokeStyle = TEAM_LIGHT[team] + '66';
      g.lineWidth = 1;
      for (let x = x0; x <= x1; x += 8) { g.beginPath(); g.moveTo(x, ARENA.goalTopY); g.lineTo(x, ARENA.floorY); g.stroke(); }
      for (let y = ARENA.goalTopY; y <= ARENA.floorY; y += 8) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
    }

    // suelo (césped con franjas)
    for (let x = 0, i = 0; x < WIDTH; x += 64, i++) {
      g.fillStyle = i % 2 ? '#2f8f46' : '#34a04e';
      g.fillRect(x, ARENA.floorY, 64, HEIGHT - ARENA.floorY);
    }
    g.fillStyle = '#00000040';
    g.fillRect(0, ARENA.floorY + 14, WIDTH, HEIGHT);

    // borde del estadio
    g.beginPath();
    outline.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.strokeStyle = '#cfd7ff';
    g.lineWidth = 3;
    g.stroke();
    // postes
    for (const [x, team] of [[ARENA.leftWallX, 0], [ARENA.rightWallX, 1]]) {
      g.fillStyle = TEAM_COLORS[team];
      g.fillRect(x - 3, ARENA.goalTopY - 3, 6, ARENA.floorY - ARENA.goalTopY + 3);
    }
    return c;
  }

  _buildCrowd() {
    const rnd = mulberry32(7);
    const people = [];
    // gradas por encima de las porterías (fuera del campo)
    for (const [x0, x1] of [[0, ARENA.leftWallX - 4], [ARENA.rightWallX + 4, WIDTH]]) {
      for (let y = 40; y < ARENA.goalTopY - 12; y += 11) {
        for (let x = x0 + 5; x < x1; x += 9) {
          if (rnd() < 0.15) continue;
          people.push({ x: x + rnd() * 3, y, c: `hsl(${rnd() * 360 | 0},60%,${45 + rnd() * 25 | 0}%)`, p: rnd() * 6 });
        }
      }
    }
    return people;
  }

  // ---------- efectos a partir de eventos ----------

  onEvent(e, state) {
    if (e.type === 'goal') {
      this.shake = 14;
      this.excite = 1;
      const color = TEAM_COLORS[e.scorer];
      for (let i = 0; i < 140; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 60 + Math.random() * 420;
        this.particles.push({
          x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80,
          life: 0.6 + Math.random() * 0.9, max: 1.5, size: 2 + Math.random() * 5,
          color: Math.random() < 0.6 ? color : '#ffffff', g: 260,
        });
      }
      this.flash = { text: '¡GOOOL!', color, t: 2.2 };
    } else if (e.type === 'hit') {
      this.excite = Math.min(1, this.excite + 0.15 * (e.power || 0.5));
      if (state?.ball && (e.power || 0) > 0.5) {
        this.shake = Math.max(this.shake, 3);
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * Math.PI * 2;
          this.particles.push({ x: state.ball.x, y: state.ball.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 0.25, max: 0.25, size: 2, color: '#ffffff', g: 0 });
        }
      }
    } else if (e.type === 'go') {
      this.flash = { text: '¡YA!', color: '#ffffff', t: 0.7 };
    } else if (e.type === 'overtime') {
      this.flash = { text: 'PRÓRROGA · GOL DE ORO', color: '#ffcf3a', t: 2.5 };
    }
  }

  _emitBoost(car, loadout) {
    const cos = Math.cos(car.a);
    const sin = Math.sin(car.a);
    const lx = -34 * car.f;
    const ly = 1;
    const x = car.x + lx * cos - ly * sin;
    const y = car.y + lx * sin + ly * cos;
    for (let i = 0; i < 3; i++) {
      const spread = (Math.random() - 0.5) * 0.5;
      const dx = -car.f * cos;
      const dy = -car.f * sin;
      const s = 120 + Math.random() * 120;
      this.particles.push({
        x, y,
        vx: (dx + spread * -dy) * s + car.vx * 0.3,
        vy: (dy + spread * dx) * s + car.vy * 0.3,
        life: 0.25 + Math.random() * 0.25, max: 0.5, size: 3 + Math.random() * 3,
        color: trailColor(loadout.trail, this.time), g: loadout.trail === 3 ? -40 : 0,
      });
    }
  }

  // ---------- frame ----------

  /**
   * @param {object} state  estado (snapshot) a dibujar
   * @param {object} info   { loadouts, names, you }
   * @param {number} dt     segundos desde el último frame
   */
  draw(state, info, dt) {
    const ctx = this.ctx;
    this.time += dt;
    this.excite = Math.max(0, this.excite - dt * 0.25);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 40);

    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    ctx.drawImage(this.background, 0, 0);
    this._drawCrowd(ctx);

    if (!state) { ctx.restore(); return; }

    // coches
    state.cars.forEach((car, i) => {
      const fwdSpeed = car.vx * Math.cos(car.a) + car.vy * Math.sin(car.a);
      if (car.g) this.wheelAngles[i] += (fwdSpeed * dt) / CAR.wheelRadius;
      if (car.b) this._emitBoost(car, info.loadouts[i]);
    });

    this._updateParticles(dt);
    this._drawParticles(ctx);

    // sombra de la pelota
    if (state.ball) {
      const h = ARENA.floorY - state.ball.y;
      const s = Math.max(0.2, 1 - h / 300);
      ctx.fillStyle = `rgba(0,0,0,${0.35 * s})`;
      ctx.beginPath(); ctx.ellipse(state.ball.x, ARENA.floorY + 2, BALL.radius * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
    }

    state.cars.forEach((car, i) => {
      drawCar(ctx, { ...car, wheelAngle: this.wheelAngles[i] * car.f, loadout: info.loadouts[i], team: i });
    });

    if (state.ball) this._drawBall(ctx, state.ball);
    if (this.showHitboxes) this._drawHitboxes(ctx, state);

    // marcadores sobre los coches (nombre)
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    state.cars.forEach((car, i) => {
      const name = info.names?.[i];
      if (!name) return;
      const label = info.you === i ? `${name} (tú)` : name;
      ctx.fillStyle = '#000000a0';
      const w = ctx.measureText(label).width + 10;
      ctx.fillRect(car.x - w / 2, car.y - 38, w, 15);
      ctx.fillStyle = TEAM_LIGHT[i];
      ctx.fillText(label, car.x, car.y - 27);
    });

    ctx.restore();
    this._drawHud(ctx, state, info, dt);
  }

  // Contorno físico real (lo que choca), para ajustar y aprender a golpear la pelota.
  _drawHitboxes(ctx, state) {
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#39ff88';
    ctx.fillStyle = '#39ff8822';
    for (const car of state.cars) {
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.a);
      ctx.beginPath();
      CAR.shape.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    if (state.ball) {
      ctx.beginPath();
      ctx.arc(state.ball.x, state.ball.y, BALL.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawCrowd(ctx) {
    const jump = this.excite;
    for (const p of this.crowd) {
      const bob = Math.max(0, Math.sin(this.time * (6 + jump * 8) + p.p)) * (1 + jump * 5);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x, p.y - bob, 5, 7);
      ctx.beginPath(); ctx.arc(p.x + 2.5, p.y - 3 - bob, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  _drawBall(ctx, b) {
    const r = BALL.radius;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.a);
    const g = ctx.createRadialGradient(-5, -5, 2, 0, 0, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#c9cfe0');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2f45';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38);
    }
    ctx.closePath(); ctx.fill();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.88, Math.sin(a) * r * 0.88, r * 0.25, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.stroke();
  }

  _updateParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += (p.g || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
  }

  _drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.5));
      ctx.fillStyle = p.color;
      const s = p.size * (0.4 + 0.6 * (p.life / p.max));
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  _drawHud(ctx, state, info, dt) {
    // marcador
    const cx = WIDTH / 2;
    ctx.fillStyle = '#0a0d1fdd';
    ctx.beginPath(); ctx.roundRect(cx - 110, 2, 220, 30, 8); ctx.fill();
    ctx.fillStyle = TEAM_COLORS[0];
    ctx.beginPath(); ctx.roundRect(cx - 108, 4, 52, 26, 6); ctx.fill();
    ctx.fillStyle = TEAM_COLORS[1];
    ctx.beginPath(); ctx.roundRect(cx + 56, 4, 52, 26, 6); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '900 20px system-ui, sans-serif';
    ctx.fillText(state.score[0], cx - 82, 25);
    ctx.fillText(state.score[1], cx + 82, 25);
    const t = Math.ceil(state.timer);
    const time = state.overtime ? '+ORO' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    ctx.font = '800 18px system-ui, sans-serif';
    ctx.fillStyle = state.overtime ? '#ffcf3a' : '#ffffff';
    ctx.fillText(time, cx, 24);

    // turbo
    state.cars.forEach((car, i) => {
      const x = i === 0 ? 76 : WIDTH - 76 - 140;
      const y = HEIGHT - 20;
      ctx.fillStyle = '#00000080';
      ctx.beginPath(); ctx.roundRect(x, y, 140, 12, 6); ctx.fill();
      ctx.fillStyle = TEAM_COLORS[i];
      ctx.beginPath(); ctx.roundRect(x + 2, y + 2, 136 * (state.infiniteBoost ? 1 : car.bo / 100), 8, 4); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.fillText(state.infiniteBoost ? 'TURBO ∞' : `TURBO ${car.bo}`, i === 0 ? x : x + 140, y - 3);
    });

    // cuenta atrás
    ctx.textAlign = 'center';
    if (state.phase === 'countdown') {
      const n = Math.max(1, Math.ceil(state.phaseTime));
      ctx.font = '900 90px system-ui, sans-serif';
      ctx.fillStyle = '#00000080';
      ctx.fillText(n, cx + 3, 213);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(n, cx, 210);
    }

    if (this.flash) {
      this.flash.t -= dt;
      const f = this.flash;
      if (f.t <= 0) this.flash = null;
      else {
        const s = 1 + Math.max(0, f.t - (f.text.length > 8 ? 2.3 : 1.9)) * 2;
        ctx.save();
        ctx.translate(cx, 180);
        ctx.scale(s, s);
        ctx.font = `900 ${f.text.length > 10 ? 36 : 70}px system-ui, sans-serif`;
        ctx.globalAlpha = Math.min(1, f.t * 2);
        ctx.fillStyle = '#000000a0';
        ctx.fillText(f.text, 4, 4);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, 0, 0);
        ctx.restore();
      }
    }
  }
}
