// Simulación de una partida. Se ejecuta igual en el servidor (online) y en el navegador (1 y 2 jugadores locales).
import { World, Vec2, Chain, Circle, Polygon } from 'planck';
import {
  PPM, DT, WIDTH, ARENA, MATCH, BALL, CAR, CAR_TYPES,
  sanitizeLoadout, sanitizeInput, EMPTY_INPUT,
} from './config.js';

const m = (px) => px / PPM;
const px = (meters) => meters * PPM;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const round2 = (v) => Math.round(v * 100) / 100;

export function normalizeAngle(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

function arcPoints(cx, cy, r, from, to, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = from + ((to - from) * i) / steps;
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return pts;
}

// Contorno del estadio en píxeles, en sentido horario empezando por la portería izquierda.
export function arenaOutline() {
  const A = ARENA;
  const r = A.cornerRadius;
  const pts = [
    [A.goalBackLeft, A.floorY],
    [A.goalBackLeft, A.goalTopY],
    [A.leftWallX, A.goalTopY],
    ...arcPoints(A.leftWallX + r, A.ceilingY + r, r, Math.PI, Math.PI * 1.5, 10),
    ...arcPoints(A.rightWallX - r, A.ceilingY + r, r, Math.PI * 1.5, Math.PI * 2, 10),
    [A.rightWallX, A.goalTopY],
    [A.goalBackRight, A.goalTopY],
    [A.goalBackRight, A.floorY],
  ];
  return pts;
}

export class Match {
  /**
   * @param {{loadouts:[object,object], names?:[string,string], duration?:number}} opts
   */
  constructor(opts = {}) {
    this.loadouts = [sanitizeLoadout(opts.loadouts?.[0], 0), sanitizeLoadout(opts.loadouts?.[1], 1)];
    this.names = opts.names || ['Azul', 'Naranja'];
    this.duration = opts.duration ?? MATCH.duration;
    this.infiniteBoost = opts.infiniteBoost !== false; // turbo infinito salvo que se desactive

    this.world = new World({ gravity: Vec2(0, 20) });
    this.tick = 0;
    this.events = [];
    this.score = [0, 0];
    this.timer = this.duration;
    this.overtime = false;
    this.winner = -1;
    this.inputs = [{ ...EMPTY_INPUT }, { ...EMPTY_INPUT }];

    this._buildArena();
    this.cars = [0, 1].map((slot) => this._createCar(slot));
    this.ball = null;
    this._lastHitTick = [-99, -99];
    this._pendingHits = [];

    this.world.on('begin-contact', (c) => this._onContact(c));
    this._startKickoff();
  }

  // ---------- construcción ----------

  _buildArena() {
    const ground = this.world.createBody({ type: 'static' });
    const pts = arenaOutline().map(([x, y]) => Vec2(m(x), m(y)));
    ground.createFixture(Chain(pts, true), { friction: 0.25, restitution: 0.1 });
    ground.setUserData({ kind: 'arena' });
    this.arena = ground;
  }

  _createCar(slot) {
    const type = CAR_TYPES[this.loadouts[slot].type];
    const body = this.world.createBody({ type: 'dynamic', bullet: true, allowSleep: false });
    body.createFixture(Polygon(CAR.shape.map(([x, y]) => Vec2(m(x), m(y)))), {
      density: type.density,
      friction: CAR.friction,
      restitution: CAR.restitution,
    });
    body.setLinearDamping(CAR.linearDamping);
    body.setAngularDamping(CAR.angularDamping);
    body.setUserData({ kind: 'car', slot });
    return {
      slot,
      type,
      body,
      facing: slot === 0 ? 1 : -1,
      grounded: false,
      boost: this.infiniteBoost ? 100 : MATCH.startBoost,
      boosting: false,
      prevJump: false,
      airTime: 0,
      usedSecondJump: false,
      flipTime: 0,
    };
  }

  _spawnBall() {
    if (this.ball) this.world.destroyBody(this.ball);
    const b = this.world.createBody({ type: 'dynamic', bullet: true, allowSleep: false, position: Vec2(m(WIDTH / 2), m(150)) });
    b.createFixture(Circle(m(BALL.radius)), {
      density: BALL.density,
      friction: BALL.friction,
      restitution: BALL.restitution,
    });
    b.setLinearDamping(BALL.linearDamping);
    b.setAngularDamping(BALL.angularDamping);
    b.setGravityScale(BALL.gravityScale);
    b.setUserData({ kind: 'ball' });
    this.ball = b;
  }

  _resetCars() {
    for (const car of this.cars) {
      const x = car.slot === 0 ? CAR.spawnX : WIDTH - CAR.spawnX;
      car.body.setTransform(Vec2(m(x), m(ARENA.floorY - CAR.spawnHeight)), 0);
      car.body.setLinearVelocity(Vec2(0, 0));
      car.body.setAngularVelocity(0);
      car.facing = car.slot === 0 ? 1 : -1;
      car.boost = this.infiniteBoost ? 100 : MATCH.startBoost;
      car.usedSecondJump = false;
      car.flipTime = 0;
      car.airTime = 0;
    }
  }

  _startKickoff() {
    this._resetCars();
    this._spawnBall();
    this.phase = 'countdown';
    this.phaseTime = MATCH.countdown;
    this.events.push({ type: 'kickoff' });
  }

  // ---------- API pública ----------

  setInput(slot, input) {
    this.inputs[slot] = sanitizeInput(input);
  }

  /** Avanza un tick fijo (1/60 s). */
  step() {
    this.tick++;
    switch (this.phase) {
      case 'countdown':
        this.phaseTime -= DT;
        this._freezeForKickoff();
        if (this.phaseTime <= 0) {
          this.phase = 'play';
          this.events.push({ type: 'go' });
        }
        break;
      case 'play':
        this.timer = Math.max(0, this.timer - (this.overtime ? 0 : DT));
        if (this.timer <= 0 && !this.overtime) {
          if (this.score[0] !== this.score[1]) {
            this._endMatch();
            break;
          }
          this.overtime = true;
          this.events.push({ type: 'overtime' });
        }
        break;
      case 'goal':
        this.phaseTime -= DT;
        if (this.phaseTime <= 0) {
          if (this.winner >= 0 || (this.timer <= 0 && this.score[0] !== this.score[1])) this._endMatch();
          else this._startKickoff();
        }
        break;
      case 'ended':
        this.phaseTime = Math.max(0, this.phaseTime - DT);
        break;
    }

    if (this.phase !== 'countdown') {
      for (const car of this.cars) this._driveCar(car, this.phase === 'ended' ? EMPTY_INPUT : this.inputs[car.slot]);
    } else {
      for (const car of this.cars) car.prevJump = this.inputs[car.slot].jump;
    }

    this.world.step(DT, 8, 3);
    this._applyHits();

    if (this.ball) this._clampBall();
    if (this.phase === 'play') this._checkGoal();
  }

  get finished() {
    return this.phase === 'ended' && this.phaseTime <= 0;
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  snapshot() {
    return {
      tick: this.tick,
      phase: this.phase,
      phaseTime: round2(this.phaseTime),
      timer: round2(this.timer),
      overtime: this.overtime,
      score: [...this.score],
      winner: this.winner,
      infiniteBoost: this.infiniteBoost,
      cars: this.cars.map((c) => {
        const p = c.body.getPosition();
        const v = c.body.getLinearVelocity();
        return {
          x: round2(px(p.x)), y: round2(px(p.y)), a: round2(c.body.getAngle() * 100) / 100,
          vx: round2(px(v.x)), vy: round2(px(v.y)),
          f: c.facing, g: c.grounded ? 1 : 0, b: c.boosting ? 1 : 0, bo: Math.round(c.boost),
        };
      }),
      ball: this.ball
        ? (() => {
          const p = this.ball.getPosition();
          const v = this.ball.getLinearVelocity();
          return { x: round2(px(p.x)), y: round2(px(p.y)), a: round2(this.ball.getAngle()), vx: round2(px(v.x)), vy: round2(px(v.y)) };
        })()
        : null,
    };
  }

  destroy() {
    this.world = null;
  }

  // ---------- lógica interna ----------

  _freezeForKickoff() {
    this._resetCarsKeepFacing();
    if (this.ball) {
      this.ball.setTransform(Vec2(m(WIDTH / 2), m(150)), 0);
      this.ball.setLinearVelocity(Vec2(0, 0));
      this.ball.setAngularVelocity(0);
    }
  }

  _resetCarsKeepFacing() {
    for (const car of this.cars) {
      const x = car.slot === 0 ? CAR.spawnX : WIDTH - CAR.spawnX;
      car.body.setTransform(Vec2(m(x), m(ARENA.floorY - CAR.spawnHeight)), 0);
      car.body.setLinearVelocity(Vec2(0, 0));
      car.body.setAngularVelocity(0);
      car.grounded = true;
      car.boosting = false;
    }
  }

  _isGrounded(car) {
    const b = car.body;
    const down = b.getWorldVector(Vec2(0, 1));
    let hit = false;
    for (const sx of [-CAR.wheelOffsetX, CAR.wheelOffsetX]) {
      const from = b.getWorldPoint(Vec2(m(sx), m(CAR.wheelOffsetY)));
      const to = Vec2(from.x + down.x * m(CAR.groundRay), from.y + down.y * m(CAR.groundRay));
      this.world.rayCast(from, to, (fixture, point, normal, fraction) => {
        const body = fixture.getBody();
        if (body === b) return -1;
        const kind = body.getUserData()?.kind;
        if (kind === 'ball') return -1;
        hit = true;
        return fraction;
      });
      if (hit) return true;
    }
    return false;
  }

  _driveCar(car, input) {
    const b = car.body;
    const mass = b.getMass();
    const fwd = b.getWorldVector(Vec2(1, 0));
    const up = b.getWorldVector(Vec2(0, -1));
    const v = b.getLinearVelocity();
    const vf = v.x * fwd.x + v.y * fwd.y; // velocidad a lo largo del coche
    const t = car.type;
    const jumpPressed = input.jump && !car.prevJump;
    car.prevJump = input.jump;

    car.grounded = this._isGrounded(car);
    if (car.flipTime > 0) car.flipTime -= DT;

    if (car.grounded) {
      car.airTime = 0;
      car.usedSecondJump = false;

      if (Math.abs(vf) > 0.8) car.facing = sign(vf);
      else if (input.h !== 0) car.facing = input.h;

      // acelerar
      if (input.h !== 0) {
        const reversing = sign(vf) !== 0 && sign(vf) !== input.h;
        const accel = reversing ? t.accel * 1.7 : t.accel;
        if (input.h * vf < t.maxSpeed) b.applyForceToCenter(Vec2(fwd.x * input.h * accel * mass, fwd.y * input.h * accel * mass), true);
      } else if (!input.boost && Math.abs(vf) > 0.05) {
        const d = -sign(vf) * CAR.coastDecel * mass;
        b.applyForceToCenter(Vec2(fwd.x * d, fwd.y * d), true);
      }
      // frenar
      if (input.brake && Math.abs(vf) > 0.1) {
        const d = -sign(vf) * CAR.brakeDecel * mass;
        b.applyForceToCenter(Vec2(fwd.x * d, fwd.y * d), true);
      }
      // pegarse a la superficie (paredes curvas y techo)
      b.applyForceToCenter(Vec2(-up.x * CAR.stickAccel * mass, -up.y * CAR.stickAccel * mass), true);
      // saltar
      if (jumpPressed) {
        b.applyLinearImpulse(Vec2(up.x * t.jump * mass, up.y * t.jump * mass), b.getWorldCenter(), true);
        car.airTime = 0.0001;
        this.events.push({ type: 'jump', slot: car.slot });
      }
    } else {
      car.airTime += DT;
      // girar en el aire
      if (car.flipTime <= 0) {
        const target = input.h * t.airRot;
        const w = b.getAngularVelocity();
        if (input.h !== 0) b.setAngularVelocity(w + (target - w) * 0.18);
      }
      // doble salto / voltereta
      if (jumpPressed && !car.usedSecondJump && car.airTime < CAR.secondJumpWindow) {
        car.usedSecondJump = true;
        if (input.h !== 0) {
          b.applyLinearImpulse(Vec2(input.h * CAR.flipImpulse * mass, -2.5 * mass), b.getWorldCenter(), true);
          b.setAngularVelocity(input.h * CAR.flipSpin);
          car.flipTime = 0.45;
          this.events.push({ type: 'flip', slot: car.slot });
        } else {
          const vv = b.getLinearVelocity();
          b.setLinearVelocity(Vec2(vv.x, Math.min(vv.y, 0)));
          b.applyLinearImpulse(Vec2(up.x * CAR.secondJump * mass, up.y * CAR.secondJump * mass), b.getWorldCenter(), true);
          this.events.push({ type: 'jump2', slot: car.slot });
        }
      }
    }

    // turbo (en suelo y aire), en la dirección hacia la que mira el morro
    car.boosting = false;
    if (input.boost && car.boost > 0) {
      const dir = car.facing;
      const along = vf * dir;
      const maxS = car.grounded ? CAR.boostMaxSpeed : CAR.airBoostMaxSpeed;
      if (along < maxS) {
        const f = t.boostAccel * mass * dir;
        b.applyForceToCenter(Vec2(fwd.x * f, fwd.y * f), true);
      }
      if (!this.infiniteBoost) car.boost = Math.max(0, car.boost - CAR.boostDrain * DT);
      car.boosting = true;
    } else {
      car.boost = Math.min(100, car.boost + CAR.boostRegen * DT);
    }
  }

  _clampBall() {
    const v = this.ball.getLinearVelocity();
    const s = Math.hypot(v.x, v.y);
    if (s > BALL.maxSpeed) this.ball.setLinearVelocity(Vec2((v.x / s) * BALL.maxSpeed, (v.y / s) * BALL.maxSpeed));
  }

  _checkGoal() {
    const p = this.ball.getPosition();
    const x = px(p.x);
    const y = px(p.y);
    let scorer = -1;
    if (x < ARENA.leftWallX - BALL.radius && y > ARENA.goalTopY) scorer = 1;       // portería izquierda: defiende el azul
    else if (x > ARENA.rightWallX + BALL.radius && y > ARENA.goalTopY) scorer = 0; // portería derecha: defiende el naranja
    if (scorer < 0) return;

    this.score[scorer]++;
    this.events.push({ type: 'goal', scorer, x: Math.round(x), y: Math.round(y), score: [...this.score] });
    this._explode(p);
    this.world.destroyBody(this.ball);
    this.ball = null;
    this.phase = 'goal';
    this.phaseTime = MATCH.goalPause;
    if (this.overtime) this.winner = scorer;
  }

  _explode(center) {
    for (const car of this.cars) {
      const p = car.body.getPosition();
      const dx = p.x - center.x;
      const dy = p.y - center.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const power = clamp(14 - d * 0.9, 0, 14) * car.body.getMass();
      if (power <= 0) continue;
      car.body.applyLinearImpulse(Vec2((dx / d) * power, (dy / d) * power - power * 0.3), car.body.getWorldCenter(), true);
      car.body.setAngularVelocity(sign(dx || 1) * 6);
    }
  }

  _endMatch() {
    this.phase = 'ended';
    this.phaseTime = MATCH.endPause;
    if (this.winner < 0) this.winner = this.score[0] > this.score[1] ? 0 : this.score[1] > this.score[0] ? 1 : -1;
    this.events.push({ type: 'end', winner: this.winner, score: [...this.score] });
  }

  _onContact(contact) {
    const a = contact.getFixtureA().getBody();
    const b = contact.getFixtureB().getBody();
    const ka = a.getUserData()?.kind;
    const kb = b.getUserData()?.kind;
    if (!((ka === 'ball' && kb === 'car') || (ka === 'car' && kb === 'ball'))) return;
    const car = ka === 'car' ? a : b;
    const slot = car.getUserData().slot;
    if (this.tick - this._lastHitTick[slot] < 6) return;
    this._lastHitTick[slot] = this.tick;
    // no se pueden aplicar impulsos durante el paso de física: se aplican justo después
    this._pendingHits.push({ car, slot });
  }

  // Golpe "con chispa": además del choque físico, empuja la pelota desde el coche y un poco hacia arriba.
  _applyHits() {
    const hits = this._pendingHits;
    this._pendingHits = [];
    for (const { car, slot } of hits) {
      const ball = this.ball;
      if (!ball) continue;
      const cp = car.getPosition();
      const bp = ball.getPosition();
      let dx = bp.x - cp.x;
      let dy = bp.y - cp.y;
      let d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      const vc = car.getLinearVelocity();
      const vb = ball.getLinearVelocity();
      const closing = Math.max(0, (vc.x - vb.x) * dx + (vc.y - vb.y) * dy);
      dy -= BALL.hitLift;
      d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      const dv = Math.min(BALL.hitMax, BALL.hitBase + closing * BALL.hitScale);
      const imp = dv * ball.getMass();
      ball.applyLinearImpulse(Vec2(dx * imp, dy * imp), ball.getWorldCenter(), true);
      this.events.push({ type: 'hit', slot, power: Math.min(1, closing / 12) });
    }
  }

}
