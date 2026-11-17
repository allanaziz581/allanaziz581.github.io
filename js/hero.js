// Hero: a pixelated portrait made of blocks, in front of a curved grid that subdivides along its outline.
//
// With PORTRAIT set (js/content.js), the blocks are one cut-out photo in its own colours, a little
// thicker towards the middle of the figure so it has depth when it turns towards the pointer.
// Scrolling pixelates it away (bigger and bigger pixels), then scatters the blocks.
// Without PORTRAIT it falls back to a flat relief of a drawn figure.
import * as THREE from 'three';
import { PORTRAIT } from './content.js';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ---------- fallback figure (flat relief) ----------
function drawFigure(ctx, W, H) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.scale(W / 480, H / 600);
  const radial = (x, y, r0, x1, y1, r1, stops) => {
    const g = ctx.createRadialGradient(x, y, r0, x1, y1, r1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  };
  ctx.fillStyle = radial(200, 520, 10, 240, 600, 260, [[0, '#8a8a8a'], [0.6, '#4a4a4a'], [1, '#1e1e1e']]);
  ctx.beginPath(); ctx.ellipse(240, 650, 250, 175, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = radial(220, 430, 5, 240, 440, 80, [[0, '#9a9a9a'], [1, '#4f4f4f']]);
  ctx.beginPath(); ctx.ellipse(240, 445, 52, 80, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = radial(205, 235, 10, 240, 270, 160, [[0, '#e2e2e2'], [0.55, '#a8a8a8'], [1, '#4a4a4a']]);
  ctx.beginPath(); ctx.ellipse(240, 270, 108, 138, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#cfcfcf'; ctx.lineWidth = 26; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(240, 262, 136, Math.PI * 1.04, Math.PI * 1.96); ctx.stroke();
  for (const [x, c] of [[118, '#f0f0f0'], [362, '#a0a0a0']]) {
    ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x - 34, 220, 68, 120, 30); ctx.fill();
  }
  ctx.restore();
}

function flatModel(lowPower) {
  const COLS = lowPower ? 72 : 100, ROWS = lowPower ? 90 : 124;
  const big = document.createElement('canvas'); big.width = 480; big.height = 600;
  drawFigure(big.getContext('2d'), 480, 600);
  const small = document.createElement('canvas'); small.width = COLS; small.height = ROWS;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(big, 0, 0, COLS, ROWS);
  const px = sctx.getImageData(0, 0, COLS, ROWS).data;
  const PH = 5.7, CELL = PH / ROWS, Y_OFF = -0.75;
  const voxels = [];
  const mask = new Float32Array(COLS * ROWS);
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const k = j * COLS + i;
    const h = (px[k * 4] * 0.299 + px[k * 4 + 1] * 0.587 + px[k * 4 + 2] * 0.114) / 255;
    if (h <= 0.08) continue;
    mask[k] = 1;
    voxels.push({ x: (i - COLS / 2 + 0.5) * CELL, y: (ROWS / 2 - j - 0.5) * CELL + Y_OFF, z: h * 0.42, depth: 0.05 + h * 0.55, lum: h, gx: i, gy: ROWS - j });
  }
  return { voxels, mask, cols: COLS, rows: ROWS, CELL, PW: COLS * CELL, PH, Y_OFF, real: false };
}

// ---------- pixelated photo ----------
// One cut-out photo sampled into a grid of blocks. Every block also carries its colour, depth and
// visibility at three coarser pixel sizes (2, 4 and 8 blocks wide), so scrolling can pixelate the
// picture away, a group of blocks at a time, before it scatters.
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hash2 = (x, y, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Colour fix for a photo taken under street lights: per channel out = k * in^g, solved so the
// white shirt comes out neutral and the skin matches a daylight measurement of the same person.
function colourFix(d, w, h, white, skin, skinTarget) {
  const mean = (boxes, brightest) => {
    const px = [];
    for (const [u0, v0, u1, v1] of boxes) {
      for (let y = Math.floor(v0 * h); y < Math.min(h, Math.ceil(v1 * h)); y++) {
        for (let x = Math.floor(u0 * w); x < Math.min(w, Math.ceil(u1 * w)); x++) {
          const i = (y * w + x) * 4;
          if (d[i + 3] > 250) px.push([d[i], d[i + 1], d[i + 2]]);
        }
      }
    }
    if (!px.length) return null;
    if (brightest) { px.sort((a, b) => (b[0] + b[1] + b[2]) - (a[0] + a[1] + a[2])); px.length = Math.max(1, Math.round(px.length * brightest)); }
    return [0, 1, 2].map((k) => px.reduce((s, p) => s + p[k], 0) / px.length);
  };
  const W = mean([white], 0.3), S = mean(skin, 0);
  if (!W || !S) return null;
  const wt = Math.max(...W);
  return [0, 1, 2].map((k) => {
    const g = Math.min(1.5, Math.max(0.5, Math.log(wt / skinTarget[k]) / Math.log(W[k] / S[k])));
    return { g, a: wt / Math.pow(W[k], g) };
  });
}

async function photoModel(cfg, lowPower) {
  const [img, meta] = await Promise.all([loadImage(cfg.src), fetch(cfg.meta).then((r) => r.json())]);
  const bottom = cfg.bottom ?? 1;
  const iw = img.naturalWidth, ih = img.naturalHeight * bottom;
  // blocks across (fewer on phones)
  const COLS = lowPower ? 96 : 128;
  const ROWS = Math.round(COLS * ih / iw);
  const SS = Math.max(2, Math.min(4, Math.floor(iw / COLS))); // sub-samples per block side, no finer than the PNG
  const cw = COLS * SS, ch = ROWS * SS;
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const g2 = cv.getContext('2d', { willReadFrequently: true });
  g2.imageSmoothingQuality = 'high';
  g2.drawImage(img, 0, 0, iw, ih, 0, 0, cw, ch);
  const d = g2.getImageData(0, 0, cw, ch).data;

  // colour correction (boxes are 0..1 of the PNG; rescale v for the bottom crop)
  const [fx, fy, fw, fh] = meta.face;
  const vb = (b) => [b[0], b[1] / bottom, b[2], b[3] / bottom];
  const cheeks = [[fx + fw * 0.12, fy + fh * 0.56, fx + fw * 0.34, fy + fh * 0.72], [fx + fw * 0.66, fy + fh * 0.56, fx + fw * 0.88, fy + fh * 0.72]].map(vb);
  const fix = cfg.white && cfg.skinTarget ? colourFix(d, cw, ch, vb(cfg.white), cheeks, cfg.skinTarget) : null;
  const sat = cfg.saturation ?? 1;
  const correct = (r, g, b) => {
    let c = [r, g, b];
    if (fix) c = c.map((v, k) => Math.min(255, fix[k].a * Math.pow(Math.max(v, 0.5), fix[k].g)));
    const L = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    return c.map((v) => toLin(Math.min(255, Math.max(0, L + (v - L) * sat)) / 255));
  };

  // level 0: each block = alpha-weighted mean of its patch, in linear light
  const N = COLS * ROWS;
  const A = new Float32Array(N), R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), Lum = new Float32Array(N);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    let sa = 0, sr = 0, sg = 0, sb = 0;
    for (let y = r * SS; y < r * SS + SS; y++) for (let x = c * SS; x < c * SS + SS; x++) {
      const i = (y * cw + x) * 4, al = d[i + 3] / 255;
      if (al <= 0) continue;
      const [lr, lg, lb] = correct(d[i], d[i + 1], d[i + 2]);
      sa += al; sr += lr * al; sg += lg * al; sb += lb * al;
    }
    const k = r * COLS + c;
    A[k] = sa / (SS * SS);
    if (sa > 0) { R[k] = sr / sa; G[k] = sg / sa; B[k] = sb / sa; }
    Lum[k] = 0.2126 * R[k] + 0.7152 * G[k] + 0.0722 * B[k];
  }
  // the bottom edge of the photo dissolves instead of stopping in a straight line
  const fade = cfg.fadeRows ?? 0.2;
  for (let r = 0; r < ROWS; r++) {
    const f = sstep(ROWS * (1 - fade), ROWS, r + 0.5);
    if (f > 0) for (let c = 0; c < COLS; c++) if (hash2(c, r, 1) < f * 1.05) A[r * COLS + c] = 0;
  }
  const on0 = (k) => A[k] >= 0.5;

  // depth: thicker towards the middle of the figure (distance to the outline), plus a little light relief
  const D = new Float32Array(N).fill(1e9);
  for (let k = 0; k < N; k++) if (!on0(k)) D[k] = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const k = r * COLS + c; if (!D[k]) continue;
    if (c > 0) D[k] = Math.min(D[k], D[k - 1] + 1);
    if (r > 0) D[k] = Math.min(D[k], D[k - COLS] + 1, c > 0 ? D[k - COLS - 1] + 1.4 : 1e9, c < COLS - 1 ? D[k - COLS + 1] + 1.4 : 1e9);
    if (c === 0 || c === COLS - 1 || r === 0) D[k] = Math.min(D[k], 1);
  }
  for (let r = ROWS - 1; r >= 0; r--) for (let c = COLS - 1; c >= 0; c--) {
    const k = r * COLS + c; if (!D[k]) continue;
    if (c < COLS - 1) D[k] = Math.min(D[k], D[k + 1] + 1);
    if (r < ROWS - 1) D[k] = Math.min(D[k], D[k + COLS] + 1, c < COLS - 1 ? D[k + COLS + 1] + 1.4 : 1e9, c > 0 ? D[k + COLS - 1] + 1.4 : 1e9);
  }
  const PH = cfg.height ?? 5.4, CELL = PH / ROWS, Y_OFF = cfg.yOffset ?? -0.6;
  const DMAX = COLS * 0.2;
  const RELIEF = CELL * COLS / 96; // same relief depth whatever the block count
  const Z = new Float32Array(N);
  for (let k = 0; k < N; k++) Z[k] = on0(k) ? RELIEF * (9 * Math.sqrt(Math.min(D[k], DMAX) / DMAX) + 1.2 * Math.sqrt(Lum[k])) : 0;

  // coarser levels: groups of s x s blocks share one colour and depth; a group shows if half covered
  const LV = [1, 2, 4, 8];
  const lv = LV.map((s, li) => {
    if (li === 0) return null;
    const gc = Math.ceil(COLS / s), gr = Math.ceil(ROWS / s);
    const out = { s, on: new Uint8Array(gc * gr), col: new Float32Array(gc * gr * 3), z: new Float32Array(gc * gr), gc };
    for (let gy = 0; gy < gr; gy++) for (let gx = 0; gx < gc; gx++) {
      let sa = 0, n = 0, sr = 0, sg = 0, sb = 0, sz = 0, nz = 0;
      for (let r = gy * s; r < Math.min(ROWS, gy * s + s); r++) for (let c = gx * s; c < Math.min(COLS, gx * s + s); c++) {
        const k = r * COLS + c; n++;
        if (A[k] <= 0) continue;
        sa += A[k]; sr += R[k] * A[k]; sg += G[k] * A[k]; sb += B[k] * A[k];
        if (on0(k)) { sz += Z[k]; nz++; }
      }
      const q = gy * gc + gx;
      out.on[q] = sa / n >= 0.5 ? 1 : 0;
      if (sa > 0) { out.col[q * 3] = sr / sa; out.col[q * 3 + 1] = sg / sa; out.col[q * 3 + 2] = sb / sa; }
      out.z[q] = nz ? sz / nz : 0;
    }
    return out;
  });

  const voxels = [];
  const mask = new Float32Array(N);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const k = r * COLS + c;
    const vis = [on0(k) ? 1 : 0], cols = [], zs = [Z[k]], gh = [];
    for (let li = 1; li < LV.length; li++) {
      const L = lv[li], q = Math.floor(r / L.s) * L.gc + Math.floor(c / L.s);
      vis.push(L.on[q]); cols.push([L.col[q * 3], L.col[q * 3 + 1], L.col[q * 3 + 2]]); zs.push(L.z[q]);
      gh.push(hash2(Math.floor(c / L.s), Math.floor(r / L.s), L.s));
    }
    if (!vis.some(Boolean)) continue;
    mask[k] = vis[0];
    voxels.push({
      x: (c - COLS / 2 + 0.5) * CELL, y: (ROWS / 2 - r - 0.5) * CELL + Y_OFF, z: 0,
      depth: CELL * 2.2, lum: Lum[k], lin: [R[k], G[k], B[k]], gx: c, gy: ROWS - r,
      vis, cols, zs, gh,
    });
  }
  return { voxels, mask, cols: COLS, rows: ROWS, CELL, PW: COLS * CELL, PH, Y_OFF, real: true };
}

// quadtree grid; cells split where the silhouette edge passes through them. Coloured like the night
// photo: a near-black sky, a warm streetlight haze low down, a few
// out-of-focus lights, and the cells that hug the outline glowing warm.
function drawGrid(mask, mw, mh, toMask, tw, th) {
  const c = document.createElement('canvas');
  c.width = tw; c.height = th;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, th);
  sky.addColorStop(0, '#050505'); sky.addColorStop(0.55, '#080808'); sky.addColorStop(1, '#0d0a08');
  g.fillStyle = sky;
  g.fillRect(0, 0, tw, th);
  const glow = (x, y, r, rgba) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, rgba); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  glow(tw * 0.5, th * 1.05, th * 0.75, 'rgba(255,120,50,.22)');   // street level
  glow(tw * 0.18, th * 0.28, th * 0.09, 'rgba(255,170,90,.20)');  // street lights, out of focus
  glow(tw * 0.83, th * 0.2, th * 0.07, 'rgba(255,190,110,.18)');
  glow(tw * 0.7, th * 0.42, th * 0.05, 'rgba(255,200,150,.12)');
  glow(tw * 0.3, th * 0.12, th * 0.05, 'rgba(255,230,200,.10)');
  const at = (px, py) => {
    const [mx, my] = toMask(px / tw, py / th);
    if (mx < 0 || my < 0 || mx >= 1 || my >= 1) return 0;
    return mask[(Math.floor(my * mh) * mw + Math.floor(mx * mw))] > 0.08 ? 1 : 0;
  };
  const cells = [];
  const split = (x, y, s, depth) => {
    let sum = 0, n = 0;
    const steps = 5;
    for (let i = 0; i < steps; i++) for (let j = 0; j < steps; j++) {
      sum += at(x + (i + 0.5) / steps * s, y + (j + 0.5) / steps * s); n++;
    }
    const mixed = sum > 0 && sum < n;
    if (mixed && depth < 4 && s > 10) {
      const h = s / 2;
      split(x, y, h, depth + 1); split(x + h, y, h, depth + 1);
      split(x, y + h, h, depth + 1); split(x + h, y + h, h, depth + 1);
    } else {
      cells.push([x, y, s, depth, sum / n]);
    }
  };
  const base = Math.round(th / 9);
  for (let y = 0; y < th; y += base) for (let x = 0; x < tw; x += base) split(x, y, base, 0);
  for (const [x, y, s, depth, fill] of cells) {
    // plain grey far from the figure, warm orange in the small cells along the outline
    g.strokeStyle = depth > 1 ? `rgba(255,160,95,${0.16 + depth * 0.08})` : `rgba(200,200,200,${0.12 + depth * 0.06})`;
    g.lineWidth = depth > 2 ? 1 : 1.6;
    g.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3);
    if (fill > 0 && depth > 1) {
      g.fillStyle = `rgba(255,150,80,${0.03 + 0.035 * depth})`;
      g.fillRect(x + 2, y + 2, s - 4, s - 4);
    }
  }
  for (let i = 0; i < 260; i++) {
    const warm = Math.random() > 0.5;
    g.fillStyle = warm ? `rgba(255,190,130,${Math.random() * 0.3})` : `rgba(210,210,210,${Math.random() * 0.24})`;
    g.fillRect(Math.random() * tw, Math.random() * th, 2, 2);
  }
  return c;
}

export async function createHero({ lowPower = false } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050505);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  let model = null;
  if (PORTRAIT) {
    try { model = await photoModel(PORTRAIT, lowPower); } catch (err) { console.warn('[hero] portrait model failed, using figure', err); }
  }
  if (!model) model = flatModel(lowPower);
  const { voxels, mask, cols, rows, CELL, PW, PH, Y_OFF } = model;

  // ---- blocks ----
  // Per block: aVis/aZ = visibility and depth at pixel sizes 1, 2, 4, 8; aCol1..3 = colour at 2, 4, 8;
  // aGh.xyz = a random number per coarse group, so whole groups switch size together as uPix rises.
  const count = voxels.length;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const aGrid = new Float32Array(count * 2);
  const aVis = new Float32Array(count * 4);
  const aZ = new Float32Array(count * 4);
  const aGh = new Float32Array(count * 4);
  const aCol = [1, 2, 3].map(() => new Float32Array(count * 3));
  const real = !!model.real; // photo: true colours; drawn figure: teal monochrome
  const mat = new THREE.MeshStandardMaterial(real ? { roughness: 0.85, metalness: 0 } : { roughness: 0.5, metalness: 0.2 });
  const uniforms = {
    uTime: { value: 0 }, uExplode: { value: 0 }, uIntro: { value: 0 }, uWave: { value: 1 }, uPix: { value: 0 },
    uCell: { value: CELL }, uRows: { value: rows }, uMouse: { value: new THREE.Vector2(99, 99) },
    uView: { value: new THREE.Vector3(0, 0, 1) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        // WebGL allows 16 vertex attributes: depth rides in aGh.w and the random numbers come from the grid position
        attribute vec2 aGrid; attribute vec4 aVis; attribute vec4 aZ; attribute vec4 aGh;
        attribute vec3 aCol1; attribute vec3 aCol2; attribute vec3 aCol3;
        uniform float uTime, uExplode, uIntro, uWave, uPix, uCell, uRows; uniform vec2 uMouse; uniform vec3 uView;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        vec3 aRand = fract(sin(vec3(dot(aGrid, vec2(12.9898, 78.233)), dot(aGrid, vec2(39.3468, 11.135)), dot(aGrid, vec2(73.156, 52.235)))) * 43758.5453);
        float aDepth = aGh.w;
        // pixel size for this block: level k -> k+1 happens group by group as uPix passes each group's number
        float pixT = clamp(uPix, 0.0, 1.0) * 3.0;
        float pixK = floor(pixT);
        float pixH = pixK < 0.5 ? aGh.x : (pixK < 1.5 ? aGh.y : aGh.z);
        float pixL = min(3.0, pixK + step(pixH, pixT - pixK) * step(0.0001, pixT - pixK));
        vec4 pixSel = vec4(step(pixL, 0.5), step(0.5, pixL) * step(pixL, 1.5), step(1.5, pixL) * step(pixL, 2.5), step(2.5, pixL));
        #ifdef USE_INSTANCING_COLOR
          vColor.xyz = instanceColor.xyz * pixSel.x + aCol1 * pixSel.y + aCol2 * pixSel.z + aCol3 * pixSel.w;
        #endif`)
      .replace('#include <begin_vertex>', `
        float pixVis = dot(aVis, pixSel);
        // coarse pixels close the gaps between blocks so each group reads as one square
        float gap = pixL > 0.5 ? 1.0 : 0.86;
        vec3 transformed = position * vec3(uCell * gap, uCell * gap, aDepth) * pixVis;
        transformed.z += dot(aZ, pixSel);
        float w = sin(aGrid.x * 0.21 + uTime * 1.3) * sin(aGrid.y * 0.17 - uTime * 0.9);
        transformed += uView * (w * 0.03 * uWave);
        vec3 wp = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float md = length(wp.xy - uMouse);
        transformed += uView * (smoothstep(0.9, 0.0, md) * 0.26 * uWave);
        float rowT = clamp(uIntro * 1.7 - (1.0 - aGrid.y / uRows) * 0.7 - aRand.x * 0.15, 0.0, 1.0);
        transformed -= uView * ((1.0 - rowT) * 2.5);
        transformed *= mix(0.2, 1.0, rowT);
        transformed += uView * (aRand.x * uExplode * 11.0);
        transformed.xy += (aRand.yz - 0.5) * uExplode * 5.0;
      `);
  };
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  voxels.forEach((v, k) => {
    m4.makeTranslation(v.x, v.y, 0);
    mesh.setMatrixAt(k, m4);
    aGh[k * 4 + 3] = v.depth;
    aGrid[k * 2] = v.gx; aGrid[k * 2 + 1] = v.gy;
    if (real) {
      col.setRGB(...v.lin); // already linear
      for (let l = 0; l < 4; l++) { aVis[k * 4 + l] = v.vis[l]; aZ[k * 4 + l] = v.zs[l]; }
      for (let l = 0; l < 3; l++) { aGh[k * 4 + l] = v.gh[l]; aCol[l].set(v.cols[l], k * 3); }
    } else {
      const t = Math.pow(v.lum, 1.6);
      col.setRGB(0.04 + 0.5 * t, 0.065 + 0.58 * t, 0.08 + 0.6 * t);
      for (let l = 0; l < 4; l++) { aVis[k * 4 + l] = 1; aZ[k * 4 + l] = v.z; }
      for (let l = 0; l < 3; l++) { aGh[k * 4 + l] = Math.random(); aCol[l].set([col.r, col.g, col.b], k * 3); }
    }
    mesh.setColorAt(k, col);
  });
  geo.setAttribute('aGrid', new THREE.InstancedBufferAttribute(aGrid, 2));
  geo.setAttribute('aVis', new THREE.InstancedBufferAttribute(aVis, 4));
  geo.setAttribute('aZ', new THREE.InstancedBufferAttribute(aZ, 4));
  geo.setAttribute('aGh', new THREE.InstancedBufferAttribute(aGh, 4));
  aCol.forEach((a, l) => geo.setAttribute(`aCol${l + 1}`, new THREE.InstancedBufferAttribute(a, 3)));
  mesh.frustumCulled = false;
  const bust = new THREE.Group();
  bust.add(mesh);
  scene.add(bust);

  // ---- grid backdrop ----
  const GRID_Z = -3;
  const depthRatio = (10 - GRID_Z) / 10;
  const GW = 22, GH = 11;
  const toMask = (u, v) => {
    const Xw = (u - 0.5) * GW / depthRatio;
    const Yw = (0.5 - v) * GH / depthRatio;
    return [Xw / PW + 0.5, 0.5 - (Yw - Y_OFF) / PH];
  };
  const gridTex = new THREE.CanvasTexture(drawGrid(mask, cols, rows, toMask, 2200, 1100));
  gridTex.colorSpace = THREE.SRGBColorSpace;
  gridTex.anisotropy = 4;
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), new THREE.MeshBasicMaterial({ map: gridTex }));
  grid.position.z = GRID_Z;
  scene.add(grid);

  // white light for the photo so its own colours come through (its lighting is already in it);
  // cool light for the drawn figure
  scene.add(new THREE.AmbientLight(real ? 0xffffff : 0xbfe8ff, real ? 0.55 : 0.14));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, real ? 0.15 : 0));
  const key = new THREE.DirectionalLight(real ? 0xffffff : 0xe8ffff, real ? 1.0 : 2.2);
  key.position.set(-6, real ? 1.6 : 3, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(real ? 0xffffff : 0x9fc8ff, real ? 0.3 : 0.5);
  fill.position.set(4, 0, 6);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(real ? 0xffa060 : 0x6fa8ff, real ? 0.7 : 1.0);
  rim.position.set(5, 2, -4);
  scene.add(rim);

  const mouse = new THREE.Vector2();
  const look = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.6);
  const hit = new THREE.Vector3();
  const camLocal = new THREE.Vector3();
  let hasPointer = false;
  let baseY = 0;

  return {
    scene, camera, uniforms,
    resize(w, h) {
      camera.aspect = w / h;
      const a = w / h;
      // narrow screens: step back until the whole figure fits across with a small margin
      const fitZ = (PW * 1.12) / (2 * Math.tan(THREE.MathUtils.degToRad(17.5)) * a);
      camera.position.z = Math.max(a < 0.6 ? 14 : a < 0.8 ? 12.5 : 10, fitZ);
      baseY = a < 0.8 ? -1.1 : 0;
      camera.updateProjectionMatrix();
      const need = (w / h) * 2 * Math.tan(THREE.MathUtils.degToRad(17.5)) * (camera.position.z - GRID_Z);
      grid.scale.setScalar(Math.max(1, need / GW + 0.05));
    },
    setPointer(nx, ny) { mouse.set(nx, ny); hasPointer = true; },
    update(t, dt, p, reduced) {
      uniforms.uTime.value = t;
      uniforms.uWave.value = reduced ? 0 : 1;
      look.lerp(mouse, 1 - Math.exp(-dt * 3));
      // the picture turns a little towards the pointer, enough to show the depth of the blocks
      bust.rotation.y = look.x * 0.22;
      bust.rotation.x = -look.y * 0.08;
      bust.updateMatrixWorld();
      camLocal.copy(camera.position); bust.worldToLocal(camLocal);
      uniforms.uView.value.copy(camLocal).normalize();
      grid.position.x = -look.x * 0.25;
      grid.position.y = -look.y * 0.15;
      if (hasPointer) {
        ray.setFromCamera(mouse, camera);
        if (ray.ray.intersectPlane(plane, hit)) uniforms.uMouse.value.set(hit.x, hit.y);
      }
      // scrolling first pixelates the picture away (1 -> 2 -> 4 -> 8 blocks per pixel), then scatters it
      uniforms.uPix.value = THREE.MathUtils.smoothstep(p, 0.03, 0.55);
      const e = THREE.MathUtils.smoothstep(p, 0.35, 1.0);
      uniforms.uExplode.value = e * e;
      camera.position.y = baseY - p * 0.4;
      camera.rotation.z = -p * 0.05;
    },
  };
}
