import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vec2 } from 'planck';
import { Match } from '../shared/game.js';
import { CAR_TYPES } from '../shared/config.js';
import { Bot } from '../shared/ai.js';
import { PPM, ARENA, MATCH, CAR, BALL, GAME_SPEED } from '../shared/config.js';

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
  assert.equal(Math.round(match.snapshot().cars[0].x), CAR.spawnX);
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
  match.ball.setTransform(Vec2((ARENA.rightWallX + BALL.radius + 8) / PPM, (ARENA.floorY - BALL.radius - 4) / PPM), 0);
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
  match.ball.setTransform(Vec2((ARENA.leftWallX - BALL.radius - 8) / PPM, (ARENA.floorY - BALL.radius - 4) / PPM), 0);
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

test('un choque a toda velocidad levanta la pelota del suelo', () => {
  const match = readyMatch();
  match.ball.setTransform(Vec2(520 / PPM, (ARENA.floorY - BALL.radius) / PPM), 0);
  let top = 999;
  for (let i = 0; i < 440; i++) {
    match.setInput(0, { h: 1, boost: true });
    match.step();
    match.drainEvents();
    if (match.ball) top = Math.min(top, match.ball.getPosition().y * PPM);
  }
  const h = ARENA.floorY - BALL.radius - top;
  assert.ok(h > 120, `la pelota solo subió ${Math.round(h)} px`);
});

test('la pelota no rebota demasiado contra el suelo', () => {
  const match = readyMatch();
  match.cars[0].body.setTransform(Vec2(200 / PPM, 330 / PPM), 0);
  match.ball.setTransform(Vec2(512 / PPM, (ARENA.floorY - BALL.radius - 200) / PPM), 0);
  const apex = [];
  let prevVy = 0;
  for (let i = 0; i < 60 * 12; i++) {
    match.step();
    const vy = match.ball.getLinearVelocity().y;
    if (prevVy < 0 && vy >= 0) apex.push(ARENA.floorY - BALL.radius - match.ball.getPosition().y * PPM);
    prevVy = vy;
  }
  assert.ok(apex[0] < 60, `desde 200 px rebotó hasta ${Math.round(apex[0])} px`);
});

test('la pelota se queda quieta encima del coche (air dribble)', () => {
  const match = readyMatch();
  const c = match.cars[0].body.getPosition();
  match.ball.setTransform(Vec2(c.x, (c.y * PPM - 14 - BALL.radius - 2) / PPM), 0);
  let maxGap = 0;
  for (let i = 0; i < 120; i++) {
    match.step();
    match.drainEvents();
    const gap = (match.cars[0].body.getPosition().y * PPM - 14) - (match.ball.getPosition().y * PPM + BALL.radius);
    maxGap = Math.max(maxGap, gap);
  }
  assert.ok(maxGap < 5, `la pelota botó ${Math.round(maxGap)} px sobre el techo`);
});

test('en cámara lenta todo va más despacio que a velocidad normal', () => {
  assert.ok(GAME_SPEED < 0.8, 'el juego debe ir a cámara lenta');
  const match = readyMatch();
  const x0 = match.cars[0].body.getPosition().x * PPM;
  run(match, 60, () => [{ h: 1, boost: true }, {}]); // 1 segundo real a tope con turbo
  const moved = match.cars[0].body.getPosition().x * PPM - x0;
  assert.ok(moved < 260, `en 1 s recorrió ${Math.round(moved)} px`);
});

test('con el morro arriba y turbo el coche puede volar alto', () => {
  const match = readyMatch();
  let top = 999;
  // los tiempos se cuentan en ticks de física: con cámara lenta hacen falta más fotogramas
  const S = 1 / GAME_SPEED;
  for (let i = 0; i < 200 * S; i++) {
    const c = match.cars[0];
    const a = c.body.getAngle();
    const air = !c.grounded;
    match.setInput(0, { jump: i < 4 * S || (i >= 12 * S && i < 15 * S), h: air && a > -1.2 ? -1 : air && a < -1.6 ? 1 : 0, boost: i > 8 * S });
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

test('el coche puede saltar aunque esté del revés en el suelo', () => {
  const match = readyMatch();
  const car = match.cars[0];
  car.body.setTransform(Vec2(300 / PPM, (ARENA.floorY - 15) / PPM), Math.PI); // ruedas hacia arriba
  run(match, 40); // que se asiente
  assert.equal(car.grounded, false, 'del revés las ruedas no tocan el suelo');
  const y0 = car.body.getPosition().y * PPM;
  const events = run(match, 40, (_, i) => [{ jump: i < 3 }, {}]);
  assert.ok(events.some((e) => e.type === 'jump' && e.slot === 0), 'debe saltar');
  assert.ok(car.body.getPosition().y * PPM < y0 - 20, 'debe despegarse del suelo');
  assert.equal(car.usedSecondJump, false, 'no gasta el doble salto');
});

test('el doble salto no caduca aunque pases mucho tiempo en el aire', () => {
  const match = readyMatch();
  const car = match.cars[0];
  run(match, 6, (_, i) => [{ jump: i < 3 }, {}]); // primer salto
  // lo mantenemos en el aire varios segundos (sin tocar nada)
  for (let i = 0; i < 60 * 4; i++) {
    car.body.setTransform(Vec2(400 / PPM, 150 / PPM), 0);
    car.body.setLinearVelocity(Vec2(0, 0));
    match.step();
    match.drainEvents();
  }
  assert.equal(car.grounded, false);
  const events = run(match, 10, (_, i) => [{ jump: i < 2 }, {}]); // espera el margen para la dirección
  assert.ok(events.some((e) => e.type === 'jump2' && e.slot === 0), 'el doble salto sigue disponible');
});

test('en el aire el giro es directo: gira mientras mantienes y se para al soltar', () => {
  const match = readyMatch();
  const car = match.cars[0];
  const hold = (h, ticks) => {
    for (let i = 0; i < ticks; i++) {
      car.body.setTransform(Vec2(400 / PPM, 150 / PPM), car.body.getAngle());
      car.body.setLinearVelocity(Vec2(0, 0));
      match.setInput(0, { h });
      match.step();
      match.drainEvents();
    }
    return car.body.getAngularVelocity();
  };
  const max = CAR_TYPES[1].airRot;
  assert.ok(Math.abs(hold(-1, 30) + max) < max * 0.03, 'gira a la izquierda a tope');
  assert.ok(Math.abs(hold(1, 1) - max) < max * 0.03, 'al pulsar derecha gira a la derecha al momento');
  assert.ok(Math.abs(hold(0, 1)) < 0.01, 'al soltar deja de girar en seco');
});

function airborne(match, x = 400, y = 150, angle = 0) {
  const car = match.cars[0];
  car.body.setTransform(Vec2(x / PPM, y / PPM), angle);
  car.body.setLinearVelocity(Vec2(0, 0));
  car.body.setAngularVelocity(0);
  car.usedSecondJump = false;
  run(match, 2);
  return car;
}

test('pulsar la dirección justo después del salto sigue haciendo voltereta', () => {
  const match = readyMatch();
  airborne(match);
  // salto en el fotograma 0, dirección 3 fotogramas después
  const events = run(match, 10, (_, i) => [{ jump: i < 2, h: i >= 3 ? 1 : 0 }, {}]);
  assert.ok(events.some((e) => e.type === 'flip'), 'debe ser voltereta');
  assert.ok(!events.some((e) => e.type === 'jump2'), 'no debe ser doble salto recto');
});

test('pulsar el segundo salto muy rápido hace doble salto, no otro salto desde el suelo', () => {
  const match = readyMatch();
  const events = run(match, 12, (_, i) => [{ jump: i < 2 || (i >= 4 && i < 6), h: i >= 4 ? 1 : 0 }, {}]);
  assert.equal(events.filter((e) => e.type === 'jump').length, 1, 'un solo salto desde el suelo');
  assert.ok(events.some((e) => e.type === 'flip'), 'el segundo es la voltereta');
});

test('la voltereta sale igual de fuerte aunque el coche esté cayendo', () => {
  const match = readyMatch();
  const car = airborne(match);
  car.body.setLinearVelocity(Vec2(0, 8)); // cayendo rápido
  run(match, 3, (_, i) => [{ jump: i < 2, h: 1 }, {}]);
  assert.ok(car.body.getLinearVelocity().y < 0.5, 'la caída se anula al hacer la voltereta');
});

test('apoyar las dos ruedas en la pared recarga el doble salto', () => {
  const match = readyMatch();
  // coche pegado a la pared izquierda con las ruedas contra ella, a media altura
  const car = airborne(match, ARENA.leftWallX + 14, 150, Math.PI / 2);
  car.usedSecondJump = true;
  run(match, 3);
  assert.equal(car.usedSecondJump, false, 'con las dos ruedas en la pared se recarga');
});

test('una voltereta con la pelota encima la lanza (musty / flick)', () => {
  const match = readyMatch();
  const car = airborne(match, 400, 200, 0);
  // pelota apoyada sobre el morro/techo
  match.ball.setTransform(Vec2(412 / PPM, (200 - 14 - BALL.radius - 1) / PPM), 0);
  match.ball.setLinearVelocity(Vec2(0, 0));
  run(match, 1);
  const v0 = { ...match.ball.getLinearVelocity() }; // copia: planck reutiliza el objeto
  run(match, 20, (_, i) => [{ jump: i < 2, h: -1 }, {}]); // voltereta hacia atrás
  const v1 = { ...match.ball.getLinearVelocity() };
  const gained = Math.hypot(v1.x - v0.x, v1.y - v0.y);
  assert.ok(gained > 4, `la pelota solo ganó ${gained.toFixed(1)} m/s`);
});
