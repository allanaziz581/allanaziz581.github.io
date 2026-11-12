// Screen contents for the work entries, drawn on 2D canvases. content.json picks one by its "poster" key;
// unknown keys get a plain title card. Each draw(ctx, w, h, t) is animated while its screen is in front.

const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const PIX = '"Silkscreen", "Pixelify Sans", "Doto", monospace'; // Silkscreen holds only Z, L and C (see css --font-pix)
const DOT = '"Doto", ui-monospace, monospace';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function label(ctx, text, x, y, size, color, font = MONO, weight = 500, align = 'left') {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

function frame(ctx, w, h, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(24.5, 24.5, w - 49, h - 49);
}

// ThinkFree Finance: candles over a deep green field
const tfWalk = (() => {
  const r = rng(7); const out = []; let v = 0.5;
  for (let i = 0; i < 400; i++) { const o = v; v = Math.min(0.92, Math.max(0.08, v + (r() - 0.48) * 0.08)); out.push([o, v, Math.max(o, v) + r() * 0.04, Math.min(o, v) - r() * 0.04]); }
  return out;
})();
function thinkfree(ctx, w, h, t) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#04261c'); g.addColorStop(1, '#0b6a4a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  frame(ctx, w, h, 'rgba(180,255,220,.25)');
  label(ctx, 'ThinkFree', 56, 150, 108, '#ffffff', SANS, 800);
  label(ctx, 'Finance', 56, 250, 108, '#9effd0', SANS, 800);
  label(ctx, 'PLAIN-ENGLISH FINANCE FOR PEOPLE WHO DON\'T TRADE FOR A LIVING', 60, 300, 17, 'rgba(220,255,240,.75)', MONO, 600);
  // chart
  const x0 = 56, x1 = w - 56, y0 = h - 70, y1 = 340, n = 46, cw = (x1 - x0) / n;
  ctx.strokeStyle = 'rgba(200,255,230,.12)';
  for (let i = 0; i <= 4; i++) { const y = y1 + (y0 - y1) * i / 4; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
  const off = Math.floor(t * 3) % (tfWalk.length - n);
  for (let i = 0; i < n; i++) {
    const [o, c, hi, lo] = tfWalk[off + i];
    const X = x0 + i * cw + cw / 2;
    const Y = (v) => y0 - (y0 - y1) * v;
    const up = c >= o;
    ctx.strokeStyle = ctx.fillStyle = up ? '#7dffb8' : '#ff6b6b';
    ctx.beginPath(); ctx.moveTo(X, Y(hi)); ctx.lineTo(X, Y(lo)); ctx.stroke();
    ctx.fillRect(X - cw * 0.3, Y(Math.max(o, c)), cw * 0.6, Math.max(2, Math.abs(Y(o) - Y(c))));
  }
  const tags = ['LEGISLATION', 'LOBBYING', 'TRADE DISCLOSURES', 'CPI', 'NUMBERS CHECKED'];
  tags.forEach((s, i) => label(ctx, s, w - 56, 120 + i * 30, 16, i === 4 ? '#9effd0' : 'rgba(220,255,240,.55)', MONO, 700, 'right'));
}

// Tesla controls: ladder logic with power flowing through the rungs
function tesla(ctx, w, h, t) {
  ctx.fillStyle = '#0b0b0c'; ctx.fillRect(0, 0, w, h);
  frame(ctx, w, h, 'rgba(255,255,255,.12)');
  // the name big, in the red of the Tesla logo (#e82127) and the site's pixel font, matching the
  // TESLA heading beside the screen; the rest in white and grey under it
  label(ctx, 'TESLA', 54, 164, 142, '#e82127', PIX, 700);
  label(ctx, 'CONTROLS + AI ENGINEERING', 58, 214, 34, '#f4f4f4', SANS, 800);
  label(ctx, 'AUSTIN, TX  /  SUMMER 2026', 60, 246, 17, 'rgba(255,255,255,.55)', MONO, 700);
  const L = 70, R = w - 330, top = 290, gap = 70;
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#8a8a8a';
  ctx.beginPath(); ctx.moveTo(L, top - 20); ctx.lineTo(L, top + gap * 4 + 20); ctx.moveTo(R, top - 20); ctx.lineTo(R, top + gap * 4 + 20); ctx.stroke();
  const rungs = [
    ['E_STOP_OK', 'GUARD_CLOSED', 'MOTOR_RUN'],
    ['MOTOR_RUN', 'NOT FAULT', 'CONVEYOR_EN'],
    ['FAULT_RST', 'SAFE_STATE', 'FAULT_CLR'],
    ['ZONE_CLEAR', 'INTERLOCK_OK', 'CYCLE_START'],
  ];
  rungs.forEach((r, i) => {
    const y = top + i * gap + 20;
    const live = ((Math.floor(t * 1.2) + i) % 4) !== 3;
    const flow = (t * 160) % (R - L);
    ctx.strokeStyle = live ? '#39ff7e' : '#5a5a5a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();
    const cx = [L + 120, L + 300, R - 80];
    cx.forEach((x, k) => {
      ctx.fillStyle = '#0b0b0c'; ctx.fillRect(x - 22, y - 18, 44, 36);
      ctx.strokeStyle = live ? '#39ff7e' : '#8a8a8a'; ctx.lineWidth = 3;
      if (k < 2) {
        ctx.beginPath(); ctx.moveTo(x - 12, y - 16); ctx.lineTo(x - 12, y + 16); ctx.moveTo(x + 12, y - 16); ctx.lineTo(x + 12, y + 16); ctx.stroke();
        if (r[k].startsWith('NOT')) { ctx.beginPath(); ctx.moveTo(x - 14, y + 14); ctx.lineTo(x + 14, y - 14); ctx.stroke(); }
      } else {
        ctx.beginPath(); ctx.arc(x, y, 15, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 15, -Math.PI * 0.38, Math.PI * 0.38); ctx.stroke();
      }
      label(ctx, r[k], x, y - 26, 12, 'rgba(255,255,255,.7)', MONO, 600, 'center');
    });
    if (live) { ctx.fillStyle = '#d9ffe6'; ctx.fillRect(L + flow - 3, y - 3, 6, 6); }
  });
  // HMI tiles
  const hx = w - 290;
  [['INTERLOCK', 'OK', '#39ff7e'], ['FAIL-SAFE', 'ARMED', '#39ff7e'], ['AI EVALS', 'PASS', '#39ff7e'], ['MODE', 'AUTO', '#f4f4f4']].forEach(([k, v, c], i) => {
    const y = 270 + i * 82;
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.strokeRect(hx + 0.5, y + 0.5, 230, 66);
    label(ctx, k, hx + 14, y + 24, 13, 'rgba(255,255,255,.55)', MONO, 600);
    label(ctx, v, hx + 14, y + 54, 24, c, MONO, 800);
  });
}

// DSP guitar rig: oscilloscope, clean vs processed signal
function dsp(ctx, w, h, t) {
  ctx.fillStyle = '#03100a'; ctx.fillRect(0, 0, w, h);
  const x0 = 40, y0 = 40, W = w - 80, H = h - 80;
  ctx.strokeStyle = 'rgba(120,255,170,.12)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) { const x = x0 + W * i / 10; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + H); ctx.stroke(); }
  for (let i = 0; i <= 8; i++) { const y = y0 + H * i / 8; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + W, y); ctx.stroke(); }
  const mid = y0 + H * 0.62;
  const wave = (x, drive) => {
    const p = x * 0.035 - t * 4;
    let s = Math.sin(p) * 0.8 + Math.sin(p * 2.01) * 0.25 + Math.sin(p * 3.03) * 0.12;
    s *= 0.6 + 0.4 * Math.sin(x * 0.004 + t * 0.7);
    return drive ? Math.tanh(s * 3.2) * 0.9 : s * 0.75;
  };
  const trace = (drive, color, width, amp) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.shadowColor = color; ctx.shadowBlur = drive ? 14 : 0;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 3) { const y = mid - wave(x, drive) * amp; x === 0 ? ctx.moveTo(x0 + x, y) : ctx.lineTo(x0 + x, y); }
    ctx.stroke(); ctx.shadowBlur = 0;
  };
  trace(false, 'rgba(120,255,170,.35)', 2, 120);
  trace(true, '#9dffb4', 3, 120);
  label(ctx, 'DSP GUITAR RIG', 70, 130, 78, '#c8ffd6', PIX, 700);
  label(ctx, 'CH1 IN (CLEAN)    CH2 OUT (PROCESSED)', 74, 170, 17, 'rgba(160,255,190,.7)', MONO, 600);
  ['DRIVE', 'TONE', 'DELAY', 'MIX'].forEach((k, i) => {
    const cx = w - 300 + i * 66, cy = 104;
    ctx.strokeStyle = '#9dffb4'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.stroke();
    const a = -Math.PI * 1.25 + (0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.8 + i * 1.7))) * Math.PI * 1.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18); ctx.stroke();
    label(ctx, k, cx, cy + 44, 12, 'rgba(160,255,190,.75)', MONO, 700, 'center');
  });
  label(ctx, 'BREADBOARDED + TESTED', w - 70, h - 64, 15, 'rgba(160,255,190,.6)', MONO, 700, 'right');
}

// hardcaml-pwm: duty cycle gliding between targets
function pwm(ctx, w, h, t) {
  ctx.fillStyle = '#100a01'; ctx.fillRect(0, 0, w, h);
  frame(ctx, w, h, 'rgba(255,176,0,.25)');
  const amber = '#ffb000';
  label(ctx, 'hardcaml-pwm', 56, 128, 76, amber, MONO, 800);
  label(ctx, 'ROTARY ENCODER  ->  PWM, DUTY GLIDES TO EACH TARGET', 60, 168, 17, 'rgba(255,200,90,.7)', MONO, 600);
  // trace
  const x0 = 60, x1 = w - 60, base = 420, amp = 120, periods = 14, pw = (x1 - x0) / periods;
  const cycle = 7;
  const phase = (t % cycle) / cycle;
  const from = 0.18, to = 0.82;
  const target = phase < 0.5 ? to : from;
  const start = phase < 0.5 ? from : to;
  ctx.strokeStyle = amber; ctx.lineWidth = 3; ctx.shadowColor = amber; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(x0, base);
  for (let p = 0; p < periods; p++) {
    const k = Math.min(1, Math.max(0, (p - 3) / 4));
    const duty = Math.floor((start + (target - start) * k) * 16) / 16;
    const xs = x0 + p * pw, xh = xs + pw * duty;
    ctx.lineTo(xs, base); ctx.lineTo(xs, base - amp); ctx.lineTo(xh, base - amp); ctx.lineTo(xh, base); ctx.lineTo(xs + pw, base);
  }
  ctx.stroke(); ctx.shadowBlur = 0;
  label(ctx, 'step = target - duty', 60, 500, 22, '#ffd27a', MONO, 600);
  label(ctx, 'acc += step   (once per period)', 60, 532, 22, 'rgba(255,210,122,.75)', MONO, 500);
  label(ctx, 'duty = acc >> interp_log2', 60, 564, 22, 'rgba(255,210,122,.75)', MONO, 500);
  // knob
  const kx = w - 150, ky = 520;
  ctx.strokeStyle = amber; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(kx, ky, 58, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(kx + Math.cos(a) * 66, ky + Math.sin(a) * 66); ctx.lineTo(kx + Math.cos(a) * 72, ky + Math.sin(a) * 72); ctx.stroke(); }
  const a = -Math.PI * 1.25 + target * Math.PI * 1.5;
  ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(kx + Math.cos(a) * 46, ky + Math.sin(a) * 46); ctx.stroke();
  label(ctx, `TARGET ${Math.round(target * 100)}%`, kx, ky - 82, 15, amber, MONO, 700, 'center');
}

// The Brute VR: a cave mouth at night
const caveR = rng(42);
const caveLayers = [0, 1, 2, 3].map((l) => Array.from({ length: 40 }, () => caveR()));
function brute(ctx, w, h, t) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0a2a24'); g.addColorStop(1, '#010605');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // glow in the cave
  const rg = ctx.createRadialGradient(w * 0.55, h * 0.62, 10, w * 0.55, h * 0.62, 320);
  rg.addColorStop(0, 'rgba(120,255,200,.35)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
  caveLayers.forEach((pts, l) => {
    const shade = 18 + l * 10;
    ctx.fillStyle = `rgb(${shade * 0.4},${shade},${shade * 0.85})`;
    const drift = Math.sin(t * 0.3 + l) * (8 + l * 6);
    // ceiling
    ctx.beginPath(); ctx.moveTo(0, 0);
    pts.forEach((v, i) => ctx.lineTo(i / (pts.length - 1) * w + drift, 60 + l * 40 + v * (80 + l * 30) * (1 - Math.abs(i / pts.length - 0.55) * 0.6)));
    ctx.lineTo(w, 0); ctx.fill();
    // floor
    ctx.beginPath(); ctx.moveTo(0, h);
    pts.forEach((v, i) => ctx.lineTo(i / (pts.length - 1) * w - drift, h - (40 + l * 26 + v * (70 + l * 20))));
    ctx.lineTo(w, h); ctx.fill();
  });
  // foliage dots
  const r = rng(9);
  for (let i = 0; i < 180; i++) {
    const x = r() * w, y = h - r() * 170, s = 1 + r() * 3;
    ctx.fillStyle = `rgba(${90 + r() * 80},${200 + r() * 55},${120 + r() * 60},${0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + i))})`;
    ctx.fillRect(x, y, s, s);
  }
  label(ctx, 'THE BRUTE VR', w / 2, h * 0.47, 92, '#effff8', SANS, 900, 'center');
  label(ctx, 'AGGIE CODING CLUB  /  UNITY  /  MAPS, CAVE LEVEL, ENVIRONMENT', w / 2, h * 0.47 + 44, 16, 'rgba(200,255,235,.75)', MONO, 700, 'center');
}

// Music: piano roll, playhead, waveform
const rollR = rng(3);
const rollNotes = (() => {
  const notes = []; const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  for (let bar = 0; bar < 16; bar++) {
    const root = [0, 5, 3, 4][bar % 4];
    for (let k = 0; k < 3; k++) notes.push([bar * 4, 4, (root + [0, 4, 7][k]) % 12 + 2, 'chord']);
    for (let s = 0; s < 4; s++) if (rollR() > 0.25) notes.push([bar * 4 + s, 1 + Math.floor(rollR() * 2) * 0.5, 14 + scale[Math.floor(rollR() * scale.length)] % 12, 'lead']);
  }
  return notes;
})();
function studio(ctx, w, h, t) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#12051f'); g.addColorStop(1, '#2d0b40');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const x0 = 110, x1 = w - 40, y0 = 210, y1 = h - 150, rows = 28, rh = (y1 - y0) / rows;
  // keys
  for (let i = 0; i < rows; i++) {
    const black = [1, 3, 6, 8, 10].includes((rows - 1 - i) % 12);
    ctx.fillStyle = black ? '#1a0d24' : '#e9dcf2';
    ctx.fillRect(40, y0 + i * rh, 60, rh - 1);
    ctx.fillStyle = black ? 'rgba(255,255,255,.02)' : 'rgba(255,255,255,.05)';
    ctx.fillRect(x0, y0 + i * rh, x1 - x0, rh - 1);
  }
  const beats = 32, bw = (x1 - x0) / beats;
  const scroll = (t * 2.2) % 32;
  for (let b = 0; b <= beats; b++) {
    ctx.fillStyle = b % 4 === 0 ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.06)';
    ctx.fillRect(x0 + b * bw, y0, 1, y1 - y0);
  }
  const ph = (t * 2.2) % beats;
  for (const [start, len, pitch, kind] of rollNotes) {
    let s = start - scroll; if (s < -len) s += 64; if (s > beats) continue;
    const x = x0 + s * bw, y = y0 + (rows - 1 - pitch) * rh;
    const on = ph >= s && ph < s + len;
    ctx.fillStyle = kind === 'chord' ? (on ? '#7ae8ff' : 'rgba(122,232,255,.55)') : (on ? '#ffffff' : '#ff4fd8');
    ctx.fillRect(Math.max(x0, x) + 1, y + 1, Math.max(0, Math.min(len * bw, x + len * bw - x0)) - 2, rh - 2);
  }
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x0 + ph * bw, y0 - 6, 2, y1 - y0 + 12);
  // waveform
  ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 2; ctx.beginPath();
  for (let x = 0; x <= w - 80; x += 2) {
    const env = 0.35 + 0.65 * Math.abs(Math.sin(x * 0.012 - t * 1.4));
    const y = h - 78 + Math.sin(x * 0.9 + t * 30) * 30 * env * Math.sin(x * 0.05 + t);
    x === 0 ? ctx.moveTo(40 + x, y) : ctx.lineTo(40 + x, y);
  }
  ctx.stroke();
  label(ctx, 'MUSIC', 40, 120, 86, '#ffffff', SANS, 900);
  label(ctx, 'LOGIC PRO  /  ABLETON  /  BBC SYMPHONY ORCHESTRA  /  GUITAR', 44, 162, 17, 'rgba(255,200,245,.75)', MONO, 700);
  // transport
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(w - 150, 92); ctx.lineTo(w - 150, 124); ctx.lineTo(w - 124, 108); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ff4fd8'; ctx.beginPath(); ctx.arc(w - 88, 108, 13, 0, Math.PI * 2); ctx.fill();
}

// Wearable headset: a recorded sensor session replaying, one lane per sensor, like tracks in a DAW
const hsR = rng(11);
const hsDist = (() => { const out = []; let v = 0.55; for (let i = 0; i < 256; i++) { if (hsR() > 0.6) v = Math.min(0.9, Math.max(0.12, v + (hsR() - 0.5) * 0.45)); out.push(v); } return out; })();
const hsFrames = Array.from({ length: 256 }, () => 0.25 + hsR() * 0.6);
function headset(ctx, w, h, t) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#061430'); g.addColorStop(1, '#0f3f7a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  frame(ctx, w, h, 'rgba(170,215,255,.22)');
  label(ctx, 'Wearable', 56, 150, 108, '#ffffff', SANS, 800);
  label(ctx, 'Headset', 56, 250, 108, '#8fd3ff', SANS, 800);
  label(ctx, 'ELECTRONICS  /  SENSORS  /  COMPUTER VISION', 60, 300, 17, 'rgba(215,235,255,.75)', MONO, 600);
  ['KICAD', 'ESP32-S3', 'SWIFT + CORE ML', '3D PRINTING', 'IN DEVELOPMENT'].forEach((s, i) =>
    label(ctx, s, w - 56, 120 + i * 30, 16, i === 4 ? '#8fd3ff' : 'rgba(215,235,255,.55)', MONO, 700, 'right'));

  // lanes
  const top = 352, bottom = h - 64, hx0 = 56, hx1 = 196, x0 = 206, x1 = w - 56;
  const lanes = ['CAMERA', 'RADAR', 'DISTANCE'], lh = (bottom - top) / lanes.length;
  const span = 64, step = (x1 - x0) / span, scroll = (t * 4) % 256;
  const ph = ((t * 0.12) % 1) * (x1 - x0);
  // ruler
  for (let b = 0; b <= span; b++) {
    const s = b - (scroll % 1);
    if (s < 0) continue;
    const x = x0 + s * step, major = (Math.floor(scroll) + b) % 8 === 0;
    ctx.fillStyle = major ? 'rgba(215,235,255,.35)' : 'rgba(215,235,255,.12)';
    ctx.fillRect(x, top - (major ? 14 : 8), 1, major ? 14 : 8);
  }
  lanes.forEach((name, li) => {
    const y = top + li * lh, cy = y + lh / 2;
    ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(hx0, y + 4, hx1 - hx0, lh - 8);
    ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fillRect(x0, y + 4, x1 - x0, lh - 8);
    label(ctx, name, hx0 + 14, cy + 6, 15, 'rgba(225,240,255,.85)', MONO, 700);
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y + 4, x1 - x0, lh - 8); ctx.clip();
    if (li === 0) {
      // camera: one tile per frame, lit as the playhead passes
      for (let b = -1; b <= span; b++) {
        const k = (Math.floor(scroll) + b) & 255, x = x0 + (b - (scroll % 1)) * step;
        const lit = Math.abs(x + step / 2 - (x0 + ph)) < step * 1.5;
        ctx.fillStyle = lit ? '#ffffff' : `rgba(143,211,255,${0.18 + hsFrames[k] * 0.45})`;
        ctx.fillRect(x + 2, y + 14, step - 4, lh - 28);
      }
    } else if (li === 1) {
      // radar: return strength over time
      ctx.strokeStyle = '#8fd3ff'; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = x0; x <= x1; x += 3) {
        const u = (x - x0) / step + scroll;
        const env = 0.35 + 0.65 * Math.pow(Math.abs(Math.sin(u * 0.09)), 2);
        const v = Math.sin(u * 0.95) * 0.7 + Math.sin(u * 2.2 + 1) * 0.3;
        const yy = cy + v * env * (lh / 2 - 16);
        x === x0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    } else {
      // distance: stepped readings
      ctx.strokeStyle = '#ffc46b'; ctx.lineWidth = 2.5; ctx.beginPath();
      for (let b = -1; b <= span + 1; b++) {
        const k = (Math.floor(scroll) + b) & 255, x = x0 + (b - (scroll % 1)) * step;
        const yy = y + 12 + (1 - hsDist[k]) * (lh - 24);
        b === -1 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
        ctx.lineTo(x + step, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  });
  // playhead and transport
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x0 + ph, top - 16, 2, bottom - top + 16);
  ctx.beginPath(); ctx.moveTo(x1 - 120, top - 34); ctx.lineTo(x1 - 120, top - 14); ctx.lineTo(x1 - 104, top - 24); ctx.closePath(); ctx.fill();
  label(ctx, 'REPLAY', x1, top - 18, 15, 'rgba(225,240,255,.85)', MONO, 700, 'right');
}

// plain title card for entries without their own artwork
function generic(p) {
  const words = (p.title || '').toUpperCase().split(/\s+/);
  const lines = [];
  for (const wd of words) { const last = lines[lines.length - 1]; if (last && (last + ' ' + wd).length <= 12) lines[lines.length - 1] = last + ' ' + wd; else lines.push(wd); }
  return (ctx, w, h, t) => {
    ctx.fillStyle = '#0b0b0c'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 48) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 48) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
    frame(ctx, w, h, 'rgba(255,255,255,.18)');
    label(ctx, `[${(p.category || 'project').toUpperCase()}]`, 60, 110, 22, '#39ff7e', MONO, 800);
    lines.slice(0, 3).forEach((ln, i) => label(ctx, ln, 56, 210 + i * 96, 92, '#f4f4f4', SANS, 900));
    if (p.subtitle) label(ctx, p.subtitle.toUpperCase().slice(0, 60), 60, h - 70, 18, 'rgba(255,255,255,.65)', MONO, 700);
    const sc = (t * 120) % (h + 40);
    ctx.fillStyle = 'rgba(57,255,126,.12)'; ctx.fillRect(0, sc - 40, w, 3);
  };
}

export const POSTERS = { thinkfree, tesla, dsp, pwm, brute, studio, headset };
export const posterFor = (p) => POSTERS[p.poster] || generic(p);

// Each project's three colours (a main colour, a background shade and a colour that pops),
// picked from its screen art. `main`: the big heading beside the screen and the words on the wall.
// `room`: the pale background shade of the room while that screen is in front. `pop`: the contrasting
// colour for the project number, the marker on the selected row and the accents.
export const TINTS = {
  tesla: { main: '#e82127', room: '#ecd3cf', pop: '#161616' },     // logo red, rose, near-black (Tesla's red, black, white)
  studio: { main: '#1d2b7d', room: '#d3ecf6', pop: '#ef2f9c' },    // dark blue, light blue, pink (the notes)
  headset: { main: '#1856b8', room: '#cfdcf1', pop: '#f26b1d' },   // blue, pale blue, the orange distance line
  thinkfree: { main: '#0b5e40', room: '#cfe9dc', pop: '#ff4f5e' }, // deep green, mint, the red candles
  pwm: { main: '#7a4300', room: '#f1e1bf', pop: '#2f6bff' },       // amber-brown, cream, electric blue
  dsp: { main: '#1f6b35', room: '#d5ebd3', pop: '#ff7a1a' },       // forest, pale sage, orange
  brute: { main: '#0b5d56', room: '#cde7e3', pop: '#e89a00' },     // deep teal, pale aqua, torch gold
};
export const DEFAULT_TINT = { main: '#a8481a', room: '#e4dfd7', pop: '#ff8a3d' };
export const tintFor = (p) => TINTS[p.poster] || DEFAULT_TINT;
