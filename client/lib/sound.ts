// Short synthesized sound effects (no audio files needed). Browsers only allow audio
// after the user has interacted with the page, so failures are silent.
let ctx: AudioContext | null = null;

function audio() {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, duration: number, { type = "sine", gain = 0.08 }: { type?: OscillatorType; gain?: number } = {}) {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const vol = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = a.currentTime + start;
  vol.gain.setValueAtTime(0, t);
  vol.gain.linearRampToValueAtTime(gain, t + 0.01);
  vol.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(vol).connect(a.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

export const sounds = {
  light: () => tone(660, 0, 0.18, { type: "square", gain: 0.04 }),
  lightsOut: () => {
    tone(880, 0, 0.12, { type: "square", gain: 0.05 });
    tone(1320, 0.12, 0.25, { type: "square", gain: 0.05 });
  },
  chequered: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.14, 0.35, { type: "triangle", gain: 0.07 })),
  radio: () => {
    tone(1800, 0, 0.05, { type: "square", gain: 0.03 });
    tone(1200, 0.07, 0.05, { type: "square", gain: 0.03 });
  },
  alert: () => tone(740, 0, 0.15, { type: "sine", gain: 0.06 }),
  flag: () => {
    tone(440, 0, 0.2, { type: "sawtooth", gain: 0.04 });
    tone(440, 0.3, 0.2, { type: "sawtooth", gain: 0.04 });
  },
  unlock: () => audio(),
};
