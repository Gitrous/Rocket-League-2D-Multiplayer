// Constantes compartidas entre cliente y servidor.
// Todas las medidas de pantalla están en píxeles; la física trabaja en metros (PPM píxeles = 1 metro).

export const PPM = 32;
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const SNAPSHOT_EVERY = 2; // el servidor envía el estado cada 2 ticks (30 Hz)

export const WIDTH = 1024;
export const HEIGHT = 384;

// Geometría del campo (px)
export const ARENA = {
  floorY: 352,
  ceilingY: 20,
  leftWallX: 64,
  rightWallX: 960,
  goalTopY: 236,      // larguero: la portería va desde aquí hasta el suelo
  goalBackLeft: 12,
  goalBackRight: 1012,
  cornerRadius: 70,   // esquinas superiores curvas
};

export const MATCH = {
  duration: 180,        // segundos de partido
  countdown: 3,         // cuenta atrás antes de cada saque
  goalPause: 2.5,       // segundos de celebración tras un gol
  endPause: 1.5,
  startBoost: 33,
};

export const BALL = {
  radius: 16,
  density: 0.35,
  restitution: 0.62,
  friction: 0.3,
  linearDamping: 0.12,
  angularDamping: 0.3,
  maxSpeed: 26,        // m/s
};

// Tipos de coche: cambian el comportamiento físico, no el aspecto.
export const CAR_TYPES = [
  { id: 'agil',        name: 'Ágil',        density: 0.8, maxSpeed: 9.5, accel: 20, airRot: 6.2, jump: 8.4, boostAccel: 23 },
  { id: 'equilibrado', name: 'Equilibrado', density: 1.0, maxSpeed: 9.0, accel: 18, airRot: 5.2, jump: 8.0, boostAccel: 22 },
  { id: 'pesado',      name: 'Pesado',      density: 1.4, maxSpeed: 8.3, accel: 16, airRot: 4.2, jump: 7.6, boostAccel: 21 },
];

export const CAR = {
  // polígono convexo y simétrico (px, relativo al centro). y hacia abajo.
  shape: [[-31, 9], [31, 9], [32, 1], [24, -9], [-24, -9], [-32, 1]],
  friction: 0.12,
  restitution: 0.05,
  linearDamping: 0.08,
  angularDamping: 1.5,
  wheelOffsetX: 20,
  wheelOffsetY: 9,
  wheelRadius: 7,
  groundRay: 9,            // px de rayo hacia "abajo" local para saber si toca suelo
  brakeDecel: 26,
  coastDecel: 3.5,
  stickAccel: 7,            // pega el coche a paredes/techo cuando va por ellas
  boostMaxSpeed: 15,
  airBoostMaxSpeed: 13,
  secondJump: 6.2,
  flipImpulse: 6.5,
  flipSpin: 13,
  secondJumpWindow: 1.4,    // segundos tras despegar para el doble salto
  boostDrain: 34,           // por segundo
  boostRegen: 7,            // por segundo
  spawnX: 150,
};

// Opciones del garaje (puramente estéticas salvo "type")
export const COLORS = ['#2f7bff', '#ff8a1f', '#e8384f', '#2fd07a', '#b04cff', '#f2d33a', '#1fd1e0', '#eeeeee', '#3a3a46', '#ff5fb4'];
export const COLOR_NAMES = ['Azul', 'Naranja', 'Rojo', 'Verde', 'Morado', 'Amarillo', 'Cian', 'Blanco', 'Grafito', 'Rosa'];
export const BODIES = ['Bólido', 'Todoterreno', 'Cuña'];
export const WHEELS = ['Clásicas', 'Estrella', 'Neón'];
export const TRAILS = ['Fuego', 'Plasma', 'Arcoíris', 'Humo', 'Tóxica'];

export const LOADOUT_LIMITS = {
  color: COLORS.length,
  body: BODIES.length,
  wheels: WHEELS.length,
  trail: TRAILS.length,
  type: CAR_TYPES.length,
};

export function defaultLoadout(slot = 0) {
  return { color: slot === 0 ? 0 : 1, body: 0, wheels: 0, trail: 0, type: 1 };
}

export function sanitizeLoadout(l, slot = 0) {
  const out = defaultLoadout(slot);
  if (!l || typeof l !== 'object') return out;
  for (const k of Object.keys(LOADOUT_LIMITS)) {
    const v = Number(l[k]);
    if (Number.isInteger(v) && v >= 0 && v < LOADOUT_LIMITS[k]) out[k] = v;
  }
  return out;
}

export function sanitizeName(n, fallback = 'Jugador') {
  if (typeof n !== 'string') return fallback;
  const s = n.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
  return s || fallback;
}

export const EMPTY_INPUT = Object.freeze({ h: 0, jump: false, boost: false, brake: false });

export function sanitizeInput(i) {
  if (!i || typeof i !== 'object') return { ...EMPTY_INPUT };
  const h = Number(i.h);
  return {
    h: h > 0 ? 1 : h < 0 ? -1 : 0,
    jump: !!i.jump,
    boost: !!i.boost,
    brake: !!i.brake,
  };
}
