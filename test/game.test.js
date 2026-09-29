import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vec2 } from 'planck';
import { Match } from '../shared/game.js';
import { Bot } from '../shared/ai.js';
import { PPM, ARENA, MATCH, CAR } from '../shared/config.js';

function run(match, ticks, inputs = () => [{}, {}]) {
  const events = [];
  for (let i = 0; i < ticks; i++) {
    const [a, b] = inputs(match, i);
    match.setInput(0, a);
    match.setInput(1, b);
    match.step();
    events.push(...match.drainEvents());
  }
  return events;
}

test('la cuenta atrás mantiene los coches quietos y luego empieza el juego', () => {
  const match = new Match();
  run(match, 60, () => [{ h: 1, boost: true }, { h: -1 }]);
  assert.equal(match.phase, 'countdown');
  assert.equal(Math.round(match.snapshot().cars[0].x), 150);
  run(match, MATCH.countdown * 60 + 5);
  assert.equal(match.phase, 'play');
});

test('acelerar mueve el coche y el salto lo despega del suelo', () => {
  const match = new Match();
  run(match, MATCH.countdown * 60 + 2);
  const x0 = match.snapshot().cars[0].x;
  run(match, 40, () => [{ h: 1 }, {}]);
  assert.ok(match.snapshot().cars[0].x > x0 + 20, 'el coche avanza');
  const events = run(match, 12, (_, i) => [{ jump: i < 3 }, {}]);
  assert.ok(events.some((e) => e.type === 'jump' && e.slot === 0));
  assert.ok(match.snapshot().cars[0].y < ARENA.floorY - 25, 'el coche está en el aire');
});

test('meter la pelota en la portería suma un gol y reinicia el saque', () => {
  const match = new Match();
  run(match, MATCH.countdown * 60 + 2);
  match.ball.setTransform(Vec2((ARENA.rightWallX + 30) / PPM, (ARENA.floorY - 30) / PPM), 0);
  const events = run(match, 2);
  assert.ok(events.some((e) => e.type === 'goal' && e.scorer === 0));
  assert.deepEqual(match.score, [1, 0]);
  assert.equal(match.phase, 'goal');
  run(match, MATCH.goalPause * 60 + 2);
  assert.equal(match.phase, 'countdown');
});

test('el partido termina al acabarse el tiempo', () => {
  const match = new Match({ duration: 2 });
  run(match, MATCH.countdown * 60 + 2);
  match.score = [1, 0];
  run(match, 2 * 60 + 5 + MATCH.endPause * 60);
  assert.equal(match.phase, 'ended');
  assert.equal(match.winner, 0);
  assert.ok(match.finished);
});

test('con empate al final hay prórroga con gol de oro', () => {
  const match = new Match({ duration: 1 });
  run(match, MATCH.countdown * 60 + 70);
  assert.equal(match.phase, 'play');
  assert.equal(match.overtime, true);
  match.ball.setTransform(Vec2((ARENA.leftWallX - 30) / PPM, (ARENA.floorY - 30) / PPM), 0);
  run(match, MATCH.goalPause * 60 + 5);
  assert.equal(match.phase, 'ended');
  assert.equal(match.winner, 1);
});

test('IA contra IA: la simulación es estable y hay goles', () => {
  const match = new Match({ duration: 90 });
  const bots = [new Bot(0), new Bot(1)];
  let goals = 0;
  for (let i = 0; i < 60 * 150 && match.phase !== 'ended'; i++) {
    bots.forEach((b) => match.setInput(b.slot, b.update(match)));
    match.step();
    goals += match.drainEvents().filter((e) => e.type === 'goal').length;
    const s = match.snapshot();
    for (const c of s.cars) {
      assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y));
      assert.ok(c.x > 0 && c.x < 1024 && c.y > 0 && c.y < 384, `coche fuera del campo: ${c.x},${c.y}`);
    }
  }
  assert.ok(goals > 0);
});

test('el turbo es infinito por defecto y se gasta si se desactiva', () => {
  const infinite = new Match();
  const limited = new Match({ infiniteBoost: false });
  for (const match of [infinite, limited]) run(match, MATCH.countdown * 60 + 2);
  run(infinite, 120, () => [{ boost: true }, {}]);
  run(limited, 120, () => [{ boost: true }, {}]);
  assert.equal(infinite.snapshot().cars[0].bo, 100);
  assert.equal(infinite.snapshot().infiniteBoost, true);
  assert.equal(limited.snapshot().cars[0].bo, 0);
  assert.equal(limited.snapshot().infiniteBoost, false);
});

function readyMatch() {
  const match = new Match({ duration: 999 });
  run(match, MATCH.countdown * 60 + 2);
  match.cars[1].body.setTransform(Vec2(900 / PPM, 330 / PPM), 0); // rival apartado
  return match;
}

test('un salto debajo de la pelota la levanta alto (para aéreas)', () => {
  const match = readyMatch();
  const cx = match.cars[0].body.getPosition().x * PPM;
  match.ball.setTransform(Vec2((cx + 8) / PPM, 200 / PPM), 0);
  let top = 999;
  for (let i = 0; i < 200; i++) {
    const by = match.ball.getPosition().y * PPM;
    match.setInput(0, { jump: by > 290 && i < 100 });
    match.step();
    match.drainEvents();
    if (i > 40) top = Math.min(top, match.ball.getPosition().y * PPM);
  }
  assert.ok(ARENA.floorY - top > 220, `la pelota solo subió ${Math.round(ARENA.floorY - top)} px`);
});

test('con el morro arriba y turbo el coche puede volar alto', () => {
  const match = readyMatch();
  let top = 999;
  for (let i = 0; i < 200; i++) {
    const c = match.cars[0];
    const a = c.body.getAngle();
    const air = !c.grounded;
    match.setInput(0, { jump: i < 4 || (i >= 12 && i < 15), h: air && a > -1.2 ? -1 : air && a < -1.6 ? 1 : 0, boost: i > 8 });
    match.step();
    match.drainEvents();
    top = Math.min(top, c.body.getPosition().y * PPM);
  }
  assert.ok(ARENA.floorY - top > 200, `el coche solo subió ${Math.round(ARENA.floorY - top)} px`);
});

test('la hitbox apoya las ruedas en el suelo sin hundirse', () => {
  const match = readyMatch();
  run(match, 30);
  const car = match.snapshot().cars[0];
  const bottom = car.y + Math.max(...CAR.shape.map(([, y]) => y));
  assert.ok(Math.abs(bottom - ARENA.floorY) < 1.5, `borde inferior a ${bottom} (suelo ${ARENA.floorY})`);
  assert.equal(car.g, 1);
});
