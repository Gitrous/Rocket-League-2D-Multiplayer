// IA sencilla para el modo de 1 jugador. Lee el estado de la partida y devuelve los mismos
// controles que usaría una persona (izquierda/derecha, salto, turbo, freno).
import { ARENA, PPM } from './config.js';
import { normalizeAngle } from './game.js';

const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

export class Bot {
  constructor(slot, random = Math.random) {
    this.slot = slot;
    this.random = random;
    this.attackDir = slot === 0 ? 1 : -1;               // hacia dónde está la portería rival
    this.ownGoalX = slot === 0 ? ARENA.leftWallX : ARENA.rightWallX;
    this.jumpHold = 0;
    this.pendingSecond = -1;
    this.stuckTime = 0;
    this.decision = { h: 0, boost: false };
    this.thinkIn = 0;
    this.randomize();
  }

  // Se llama en cada saque: cambia un poco la personalidad para que no juegue siempre igual.
  randomize() {
    this.aggressive = this.random() < 0.5;
    this.reaction = 4 + Math.floor(this.random() * 6); // ticks entre decisiones
  }

  update(match) {
    const input = { h: 0, jump: false, boost: false, brake: false };
    if (match.phase === 'countdown') {
      if (match.phaseTime > 2.9) this.randomize();
      return input;
    }
    const car = match.cars[this.slot];
    const ball = match.ball;
    if (!ball) return input;

    const cp = car.body.getPosition();
    const me = { x: cp.x * PPM, y: cp.y * PPM, a: normalizeAngle(car.body.getAngle()) };
    const bp = ball.getPosition();
    const bv = ball.getLinearVelocity();
    const b = { x: bp.x * PPM, y: bp.y * PPM, vx: bv.x * PPM, vy: bv.y * PPM };
    const predX = b.x + b.vx * 0.35;

    // --- recuperarse si está volcado ---
    // (del revés y apoyado en el estadio: salta para despegarse y enderezarse)
    const upsideDown = Math.abs(me.a) > 1.6;
    const stuck = !car.grounded && upsideDown && Math.hypot(car.body.getLinearVelocity().x, car.body.getLinearVelocity().y) < 1.5;
    if (stuck) this.stuckTime += 1;
    else this.stuckTime = 0;
    if (this.stuckTime > 15) {
      input.jump = this.jumpHold++ % 20 < 6;
      input.h = -sign(me.a) || 1;
      return input;
    }

    // --- decidir objetivo (con algo de retraso, como una persona) ---
    if (--this.thinkIn <= 0) {
      this.thinkIn = this.reaction;
      const ballAhead = (predX - me.x) * this.attackDir > -10; // estoy entre la pelota y mi portería
      let targetX;
      let boost = false;
      if (ballAhead) {
        targetX = predX - this.attackDir * 18;
        boost = Math.abs(targetX - me.x) > (this.aggressive ? 90 : 220);
      } else {
        // volver a defender: ponerse detrás de la pelota por el lado de mi portería
        targetX = predX - this.attackDir * 130;
        const nearGoal = Math.abs(me.x - this.ownGoalX) < 110;
        if (nearGoal) targetX = this.ownGoalX + this.attackDir * 40;
        boost = Math.abs(targetX - me.x) > 150;
      }
      targetX = Math.max(ARENA.leftWallX + 20, Math.min(ARENA.rightWallX - 20, targetX));
      const diff = targetX - me.x;
      this.decision = { h: Math.abs(diff) > 10 ? sign(diff) : 0, boost, ballAhead };
    }

    const dx = b.x - me.x;
    const dy = b.y - me.y; // negativo = pelota por encima

    if (car.grounded) {
      input.h = this.decision.h;
      input.boost = this.decision.boost && car.boost > 5 && Math.abs(me.a) < 0.4;
      // saltar a por la pelota si está encima y cerca
      const reachable = Math.abs(dx) < 75 && dy < -25 && dy > -170;
      // saltar por encima si la pelota viene hacia mi portería y estoy delante
      const hopOver = !this.decision.ballAhead && Math.abs(dx) < 55 && dy > -40;
      if ((reachable || hopOver) && this.jumpHold === 0) {
        this.jumpHold = 8;
        this.pendingSecond = reachable && dy < -80 ? 14 : -1;
      }
    } else {
      // en el aire: mantener el coche derecho (el giro es directo: se suelta al estar casi recto)
      if (Math.abs(me.a) > 0.25) input.h = -sign(me.a);
      if (this.pendingSecond > 0 && --this.pendingSecond === 0) {
        input.h = Math.abs(dx) > 25 ? sign(dx) : 0;
        input.jump = true;
        this.pendingSecond = -1;
        return input;
      }
      input.boost = this.decision.ballAhead && dy < -40 && Math.abs(me.a) < 0.5 && car.boost > 20 && this.aggressive;
    }

    if (this.jumpHold > 0) {
      input.jump = this.jumpHold > 3;
      this.jumpHold--;
    }
    // no chocar de frente contra el rival buscando la pelota a ciegas
    const op = match.cars[1 - this.slot].body.getPosition();
    if (Math.abs(op.x * PPM - me.x) < 40 && Math.abs(op.y * PPM - me.y) < 30 && !car.grounded) input.boost = false;
    return input;
  }
}
