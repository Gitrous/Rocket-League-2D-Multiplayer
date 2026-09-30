// Constantes compartidas entre cliente y servidor.
// Todas las medidas de pantalla están en píxeles; la física trabaja en metros (PPM píxeles = 1 metro).

export const PPM = 32;
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
// Velocidad de la física (1 = normal). Por debajo de 1 todo el juego va a cámara lenta:
// coches, pelota, saltos y gravedad, manteniendo sus proporciones. Así da tiempo a controlar
// la pelota en el aire (air dribbles). El reloj del partido sigue en tiempo real.
export const GAME_SPEED = 0.55;
export const SIM_DT = DT * GAME_SPEED;
// Gravedad del juego en m/s² (afecta a coches y pelota; la pelota además usa BALL.gravityScale)
export const GRAVITY = 16;
export const SNAPSHOT_EVERY = 2; // el servidor envía el estado cada 2 ticks (30 Hz)

export const WIDTH = 1024;
export const HEIGHT = 384;

// Geometría del campo (px)
export const ARENA = {
  floorY: 352,
  ceilingY: 20,
  leftWallX: 90,
  rightWallX: 934,
  goalTopY: 216,      // larguero: la portería va desde aquí hasta el suelo
  goalBackLeft: 8,    // fondo de 82 px: cabe la pelota entera (64 px de diámetro)
  goalBackRight: 1016,
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
  radius: 32,
  density: 0.085,      // ~0,27 kg
  restitution: 0.4,    // rebote contra suelo, paredes y techo
  carRestitution: 0.08, // rebote contra los coches: casi nada, para poder llevarla encima (air dribble)
  friction: 0.3,
  linearDamping: 0.06,
  gravityScale: 0.8,   // cae algo más despacio que los coches, sin llegar a flotar
  angularDamping: 0.3,
  maxSpeed: 26,        // m/s
  // impulso extra al tocarla con el coche: base + parte de la velocidad de choque, con sesgo hacia arriba
  // los toques suaves (por debajo de hitMinSpeed m/s) no reciben impulso extra: así no bota sobre el coche
  hitMinSpeed: 3,
  hitBase: 0.8,
  hitScale: 0.45,
  hitMax: 8,
  hitLift: 0.35,
};

// Tipos de coche: cambian el comportamiento físico, no el aspecto.
export const CAR_TYPES = [
  { id: 'agil',        name: 'Ágil',        density: 0.8, maxSpeed: 9.5, accel: 20, airRot: 11.3, jump: 8.4, boostAccel: 35 },
  { id: 'equilibrado', name: 'Equilibrado', density: 1.0, maxSpeed: 9.0, accel: 18, airRot: 9.4, jump: 8.0, boostAccel: 34 },
  { id: 'pesado',      name: 'Pesado',      density: 1.4, maxSpeed: 8.3, accel: 16, airRot: 7.7, jump: 7.6, boostAccel: 32 },
];

export const CAR = {
  // hitbox: polígono convexo y simétrico (px, relativo al centro, y hacia abajo) que cubre
  // la carrocería, la cabina y las ruedas del dibujo. El morro y la cola están biselados.
  shape: [[-32, 12], [32, 12], [34, 3], [27, -7], [12, -14], [-12, -14], [-27, -7], [-34, 3]],
  friction: 0.12,
  restitution: 0.05,
  linearDamping: 0.08,
  angularDamping: 1.5,
  wheelOffsetX: 20,
  wheelOffsetY: 5,        // centro de las ruedas; con radio 7 tocan el borde inferior de la hitbox
  wheelRadius: 7,
  groundRay: 12,           // px de rayo desde el centro de la rueda hacia "abajo" para saber si toca suelo
  brakeDecel: 26,
  coastDecel: 3.5,
  stickAccel: 7,            // pega el coche a paredes/techo cuando va por ellas
  boostMaxSpeed: 15,
  airBoostMaxSpeed: 16,
  spawnHeight: 13,         // altura del centro del coche sobre el suelo en el saque
  secondJump: 6.2,
  flipImpulse: 6.5,
  flipSpin: 13,
  jumpLockTicks: 6,         // fotogramas tras saltar en los que se ignora el suelo
  dodgeBufferTicks: 5,      // fotogramas de margen para pulsar la dirección después del doble salto
  airRotStop: 0.6,          // al soltar la dirección en el aire, el giro se multiplica por esto cada fotograma (se para en ~0,1 s)
  boostDrain: 34,           // por segundo
  boostRegen: 7,            // por segundo
  spawnX: 170,
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
