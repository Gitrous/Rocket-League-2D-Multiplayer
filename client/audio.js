// Efectos de sonido sintetizados con Web Audio (sin archivos de audio).
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.boostNodes = [null, null];
    this.muted = false;
  }

  // Los navegadores sólo permiten audio tras una interacción del usuario.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.noise = this._makeNoise();
  }

  _makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _tone(freq, dur, { type = 'sine', gain = 0.3, slide = 0, delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noiseBurst(dur, { gain = 0.3, freq = 1200, q = 1, delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  jump() { this._tone(260, 0.18, { type: 'triangle', gain: 0.2, slide: 300 }); }
  flip() { this._noiseBurst(0.25, { gain: 0.25, freq: 2500, q: 0.7 }); this._tone(400, 0.2, { type: 'triangle', gain: 0.12, slide: 500 }); }
  hit(power = 0.5) {
    this._tone(140, 0.15, { type: 'sine', gain: 0.25 + power * 0.35, slide: -80 });
    this._noiseBurst(0.08, { gain: 0.15 + power * 0.25, freq: 900 });
  }
  beep(high = false) { this._tone(high ? 880 : 520, high ? 0.35 : 0.18, { type: 'square', gain: 0.12 }); }
  goal() {
    this._noiseBurst(0.9, { gain: 0.5, freq: 300, q: 0.5 });
    [220, 277, 330].forEach((f) => this._tone(f, 1.4, { type: 'sawtooth', gain: 0.08, delay: 0.1 }));
  }
  end() { [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.3, { type: 'triangle', gain: 0.15, delay: i * 0.12 })); }

  setBoosting(slot, on) {
    if (!this.ctx || this.muted) return;
    const cur = this.boostNodes[slot];
    if (on && !cur) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 700;
      const g = this.ctx.createGain();
      g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.12, this.ctx.currentTime + 0.08);
      src.connect(f).connect(g).connect(this.master);
      src.start();
      this.boostNodes[slot] = { src, g };
    } else if (!on && cur) {
      cur.g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.1);
      cur.src.stop(this.ctx.currentTime + 0.15);
      this.boostNodes[slot] = null;
    }
  }

  stopAll() {
    this.setBoosting(0, false);
    this.setBoosting(1, false);
  }
}
