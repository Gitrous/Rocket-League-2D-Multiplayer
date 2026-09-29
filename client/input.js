// Teclado. Cada esquema traduce teclas a los controles del coche.
const SCHEMES = {
  p1: { left: ['KeyA'], right: ['KeyD'], jump: ['KeyW'], boost: ['Space', 'ShiftLeft'], brake: ['KeyS'] },
  p2: { left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp'], boost: ['Enter', 'NumpadEnter', 'Numpad0', 'ShiftRight'], brake: ['ArrowDown'] },
};
SCHEMES.both = Object.fromEntries(Object.keys(SCHEMES.p1).map((k) => [k, [...SCHEMES.p1[k], ...SCHEMES.p2[k]]]));

const GAME_KEYS = new Set(Object.values(SCHEMES.both).flat());

export class Keyboard {
  constructor() {
    this.down = new Set();
    this.enabled = false;
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) this.down.clear();
  }

  read(schemeName) {
    const s = SCHEMES[schemeName];
    const any = (codes) => codes.some((c) => this.down.has(c));
    return {
      h: (any(s.right) ? 1 : 0) - (any(s.left) ? 1 : 0),
      jump: any(s.jump),
      boost: any(s.boost),
      brake: any(s.brake),
    };
  }
}

export function sameInput(a, b) {
  return a && b && a.h === b.h && a.jump === b.jump && a.boost === b.boost && a.brake === b.brake;
}
