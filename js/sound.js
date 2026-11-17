// Optional ambient pad (off until the visitor turns it on).
// A Dmaj9 chord through a low-pass filter whose cutoff follows the page;
// each project change plays a soft pluck.
export function createSound() {
  let ctx = null, master, filter, bus, on = false;

  function init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0;
    filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 600; filter.Q.value = 0.8;
    bus = ctx.createGain(); bus.gain.value = 1;
    const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.35;
    const wet = ctx.createGain(); wet.gain.value = 0.28;
    filter.connect(bus);
    bus.connect(master); bus.connect(delay);
    delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(master);
    master.connect(ctx.destination);

    const notes = [73.42, 110.0, 185.0, 277.18, 329.63]; // D2 A2 F#3 C#4 E4
    notes.forEach((f, i) => {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = i < 2 ? 'triangle' : 'sawtooth';
        o.frequency.value = f; o.detune.value = det;
        const g = ctx.createGain(); g.gain.value = i < 2 ? 0.17 : 0.06;
        o.connect(g); g.connect(filter); o.start();
      }
    });
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const depth = ctx.createGain(); depth.gain.value = 220;
    lfo.connect(depth); depth.connect(filter.frequency); lfo.start();
    return true;
  }

  return {
    get on() { return on; },
    toggle() {
      if (!ctx && !init()) return false;
      on = !on;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      if (on) { ctx.resume(); master.gain.setTargetAtTime(0.1, now, 0.9); }
      else master.gain.setTargetAtTime(0, now, 0.2);
      return on;
    },
    setCutoff(hz) { if (ctx) filter.frequency.setTargetAtTime(hz, ctx.currentTime, 0.5); },
    pluck(i) {
      if (!ctx || !on) return;
      const scale = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33];
      const n = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = scale[i % scale.length];
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, n); g.gain.linearRampToValueAtTime(0.12, n + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, n + 1.4);
      o.connect(g); g.connect(bus); o.start(n); o.stop(n + 1.5);
    },
  };
}
