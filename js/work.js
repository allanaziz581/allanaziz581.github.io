// Selected work: CRT screens sliding along a diagonal through a pale room that takes the colour of
// whichever project is in front (rose for Tesla, blue for the headset, green for ThinkFree...). The
// room's lights fade up as you arrive from the hero, so there is no white flash.
import * as THREE from 'three';
import { posterFor, tintFor } from './posters.js';

const W = 5.3, H = 3.55, BEZEL = 0.2;
export const TEX_W = 1024, TEX_H = Math.round(1024 * (H - 2 * BEZEL) / (W - 2 * BEZEL)); // screen artwork size (also the detail view's poster slides)

const screenVert = /* glsl */`
uniform float uBulge;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  vec2 n = p.xy / vec2(${(W / 2).toFixed(3)}, ${(H / 2).toFixed(3)});
  p.z += uBulge * (1.0 - n.x * n.x) * (1.0 - n.y * n.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const screenFrag = /* glsl */`
precision highp float;
uniform sampler2D map;
uniform float uActive;
uniform float uTime;
varying vec2 vUv;
const vec2 SIZE = vec2(${W.toFixed(3)}, ${H.toFixed(3)});
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 p = (vUv - 0.5) * SIZE;
  float dOut = sdBox(p, SIZE * 0.5, 0.46);
  if (dOut > 0.01) discard;
  vec2 inner = SIZE * 0.5 - ${BEZEL.toFixed(3)};
  float dIn = sdBox(p, inner, 0.34);

  vec2 suv = p / inner;                       // -1..1 across the glass
  suv *= 1.0 + 0.05 * dot(suv, suv);          // tube curvature
  vec2 tuv = suv * 0.5 + 0.5;
  float sh = 0.0016 + 0.002 * (1.0 - uActive);
  vec3 img;
  img.r = texture2D(map, tuv + vec2(sh, 0.0)).r;
  img.g = texture2D(map, tuv).g;
  img.b = texture2D(map, tuv - vec2(sh, 0.0)).b;
  img *= 0.86 + 0.14 * sin(tuv.y * ${TEX_H.toFixed(1)} * 1.6);
  img *= smoothstep(1.55, 0.55, length(suv * vec2(0.9, 1.0)));
  img += vec3(0.07) * smoothstep(0.75, 0.0, length(suv - vec2(-0.55, 0.6)));
  img *= mix(0.3, 1.0, uActive);
  img += 0.015 * sin(uTime * 50.0 + tuv.y * 700.0) * uActive;

  // bezel: dark plastic with a soft lip
  float lip = smoothstep(0.0, -0.06, dIn) - smoothstep(-0.06, -0.12, dIn);
  vec3 bez = vec3(0.006) + vec3(0.03) * smoothstep(-0.04, 0.0, dIn);
  bez += vec3(0.05) * smoothstep(-0.05, 0.0, dOut);
  float glass = smoothstep(0.012, -0.012, dIn);
  vec3 col = mix(bez, img, glass);
  float a = smoothstep(0.012, -0.012, dOut);
  gl_FragColor = vec4(col, a);
}
`;

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function codeWall() {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 1024;
  const g = c.getContext('2d');
  // white words on a clear canvas; the wall's text layer colours them per project
  const words = [
    'S7-1500', 'TIA PORTAL', 'INTERLOCK', 'FAIL_SAFE', 'PWM DUTY', 'STM32', 'ESP32', 'QUARTUS', 'HARDCAML', 'KICAD',
    'FAISS', 'EVAL PASS', 'BPM 92', 'Dmaj9', 'Am7  Fmaj7  C  G', 'LOGIC PRO', 'ABLETON', 'BBC SO', 'SIDECHAIN', 'REVERB 2.4s',
    '0x3F', 'IRQ', 'UART', 'I2C', 'SPI', 'ADC 12-BIT', 'LPF 1.2kHz', 'GAIN -6dB', 'PLAN -> BUILD -> TEST', 'BAR 17',
  ];
  g.font = '600 13px ui-monospace, Menlo, monospace';
  g.fillStyle = '#ffffff';
  for (let y = 30; y < c.height; y += 26) {
    let x = (y * 37) % 160;
    while (x < c.width) {
      const w = words[Math.floor(Math.random() * words.length)];
      if (Math.random() > 0.35) g.fillText(w, x, y);
      x += g.measureText(w).width + 40 + Math.random() * 120;
    }
  }
  return c;
}

export const SCREEN_ASPECT = W / H;

export function createWork({ lowPower = false, projects = [] } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xebebeb);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 9.5);

  // room and wall-word colours per project, blended as the screens slide past
  const rooms = projects.map((p) => new THREE.Color(tintFor(p).room));
  const inks = projects.map((p) => new THREE.Color(tintFor(p).main));
  const blend = (list, idx, out, fallback) => {
    if (!list.length) return out.set(fallback);
    const i = Math.max(0, Math.min(list.length - 1, idx));
    const a = Math.floor(i), b = Math.min(list.length - 1, a + 1);
    return out.copy(list[a]).lerp(list[b], i - a);
  };
  const roomCol = new THREE.Color(), inkCol = new THREE.Color();

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-3, 5, 6);
  scene.add(key);

  const wallTex = new THREE.CanvasTexture(codeWall());
  wallTex.colorSpace = THREE.SRGBColorSpace;
  const wallGeo = new THREE.PlaneGeometry(44, 22);
  const wallMat = new THREE.MeshBasicMaterial({ color: 0xebebeb });
  const wordMat = new THREE.MeshBasicMaterial({ map: wallTex, transparent: true, opacity: 0.2, depthWrite: false });
  const wall = new THREE.Group();
  const words = new THREE.Mesh(wallGeo, wordMat);
  words.position.z = 0.01;
  wall.add(new THREE.Mesh(wallGeo, wallMat), words);
  wall.position.z = -10;
  scene.add(wall);

  const glassGeo = new THREE.PlaneGeometry(W, H, 48, 32);
  const bodyGeo = new THREE.ExtrudeGeometry(roundedRect(W * 0.985, H * 0.985, 0.44), {
    depth: 0.9, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 3, curveSegments: 10,
  });
  bodyGeo.translate(0, 0, -1.0);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.38, metalness: 0.15 });

  const screens = projects.map((proj, i) => {
    const draw = posterFor(proj);
    const canvas = document.createElement('canvas');
    canvas.width = TEX_W; canvas.height = TEX_H;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const uniforms = { map: { value: tex }, uActive: { value: 0 }, uTime: { value: 0 }, uBulge: { value: 0.28 } };
    const glass = new THREE.Mesh(glassGeo, new THREE.ShaderMaterial({
      vertexShader: screenVert, fragmentShader: screenFrag, uniforms, transparent: true,
    }));
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    const group = new THREE.Group();
    group.add(body, glass);
    scene.add(group);
    const s = { group, glass, draw, ctx, tex, uniforms, drawn: false };
    return s;
  });

  const redraw = (s, t) => { s.draw(s.ctx, TEX_W, TEX_H, t); s.tex.needsUpdate = true; s.drawn = true; };

  const look = new THREE.Vector2();
  const mouse = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let frame = 0;
  let baseZ = 9.5;
  // the front screen sits inside `area` (CSS px, set by main.js from where the list and the info
  // panel are), pulled back far enough to fit it and shifted to its centre with a view offset
  let vw = 1, vh = 1, area = null, offX = 0, offY = 0, bend = 0;
  const TAN = 2 * Math.tan(THREE.MathUtils.degToRad(17.5)); // view height per unit of distance (fov 35)
  // post.js bends the finished image (barrel, strength `bend`): the scene point at NDC s shows at
  // NDC o where s = o * (1 + bend * |o|^2) / (1 + 2 * bend), so the middle is enlarged up to 1 + 2 * bend
  const toScene = (e, o) => e * (1 + bend * (e * e + o * o)) / (1 + 2 * bend);
  const toShown = (x, y) => {
    let ox = x, oy = y;
    for (let i = 0; i < 16; i++) { const g = (1 + bend * (ox * ox + oy * oy)) / (1 + 2 * bend); ox = x / g; oy = y / g; }
    return [ox, oy];
  };
  // the area as the scene has to see it: the largest scene box whose bent image stays inside it
  function sceneArea(a) {
    const L = a.l / vw * 2 - 1, R = a.r / vw * 2 - 1, T = 1 - a.t / vh * 2, B = 1 - a.b / vh * 2;
    const ends = (lo, hi) => [lo <= 0 && hi >= 0 ? 0 : Math.min(Math.abs(lo), Math.abs(hi)), Math.max(Math.abs(lo), Math.abs(hi))];
    const xs = ends(L, R), ys = ends(B, T);
    const l = Math.max(...ys.map((o) => toScene(L, o))), r = Math.min(...ys.map((o) => toScene(R, o)));
    const t = Math.min(...xs.map((o) => toScene(T, o))), b = Math.max(...xs.map((o) => toScene(B, o)));
    return { l: (l + 1) / 2 * vw, r: (r + 1) / 2 * vw, t: (1 - t) / 2 * vh, b: (1 - b) / 2 * vh };
  }

  function frameScreen() {
    camera.aspect = vw / vh;
    const a = area ? sceneArea(area) : { l: 0, t: 0, r: vw, b: vh };
    const fw = Math.max(1, a.r - a.l) / vw, fh = Math.max(1, a.b - a.t) / vh;
    // never closer than 11, so big windows keep the size they always had
    // 1.06: the bezel's soft edge plus the pointer parallax (the camera drifts a little with the mouse)
    baseZ = Math.max(11, (W * 1.06) / (TAN * camera.aspect * fw), (H * 1.06) / (TAN * fh));
    offX = area ? vw / 2 - (a.l + a.r) / 2 : 0;
    offY = area ? vh / 2 - (a.t + a.b) / 2 : 0;
    camera.setViewOffset(vw, vh, offX, offY, vw, vh);
    // the wall has to cover the shifted view too
    const far = TAN * (baseZ + 10);
    const sx = (camera.aspect * far * (1 + 2 * Math.abs(offX) / vw)) / 44;
    const sy = (far * (1 + 2 * Math.abs(offY) / vh)) / 22;
    wall.scale.setScalar(Math.max(1, sx + 0.1, sy + 0.1));
  }

  return {
    scene, camera, count: screens.length,
    resize(w, h) { vw = w; vh = h; frameScreen(); },
    // rect: CSS px the front screen must stay inside, as shown; k: the work room's barrel strength
    setArea(rect, k = 0) { area = rect; bend = k; frameScreen(); },
    // where the front screen shows right now (CSS px, after the barrel), for layout checks
    screenRect() {
      const s = screens.find((x) => x.group.visible && x.uniforms.uActive.value > 0.99);
      if (!s) return null;
      s.group.updateMatrixWorld();
      const xs = [], ys = [];
      for (let i = 0; i <= 8; i++) {
        const u = -W / 2 + (W * i) / 8, v = -H / 2 + (H * i) / 8;
        for (const [x, y] of [[u, -H / 2], [u, H / 2], [-W / 2, v], [W / 2, v]]) {
          const p = new THREE.Vector3(x, y, 0).applyMatrix4(s.glass.matrixWorld).project(camera);
          const [ox, oy] = toShown(p.x, p.y);
          xs.push((ox + 1) / 2 * vw); ys.push((1 - oy) / 2 * vh);
        }
      }
      return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
    },
    // the outline (CSS px, after the barrel, front and back of the bezel) of the screen d steps from the
    // front one, everything at rest: main.js keeps the list and the info panel clear of the neighbours
    restOutline(d) {
      const cam = camera.clone();
      cam.setViewOffset(vw, vh, offX, offY, vw, vh);
      cam.position.set(0, 0, baseZ); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
      const ad = Math.abs(d);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(d * 5.8, -d * 4.1, -ad * 1.6),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(d * 0.32, -d * 0.5, -d * 0.12)),
        new THREE.Vector3(1, 1, 1));
      const pts = [], v = new THREE.Vector3();
      for (const z of [0.08, -1.08]) {
        for (let i = 0; i <= 32; i++) {
          const u = -W / 2 + (W * i) / 32, w = -H / 2 + (H * i) / 32;
          for (const [x, y] of [[u, -H / 2], [u, H / 2], [-W / 2, w], [W / 2, w]]) {
            v.set(x, y, z).applyMatrix4(m).project(cam);
            if (v.z > 1) continue;
            const [ox, oy] = toShown(v.x, v.y);
            pts.push([(ox + 1) / 2 * vw, (1 - oy) / 2 * vh]);
          }
        }
      }
      return pts;
    },
    setPointer(nx, ny) { mouse.set(nx, ny); },
    drawAll(t = 0) { screens.forEach((s) => redraw(s, t)); },
    // is the pointer (NDC) over screen i?
    pick(nx, ny, i) {
      const s = screens[i];
      if (!s || !s.group.visible) return false;
      ndc.set(nx, ny);
      ray.setFromCamera(ndc, camera);
      return ray.intersectObject(s.glass, false).length > 0;
    },
    // idx: float position along the list; zoom: 0..1 dive into the last screen at the end;
    // focus: 0..1 dive into the front screen to open its details
    // light: 0..1 the room's lights (the screens glow on their own), faded up on arrival
    update(t, dt, idx, zoom, reduced, focus = 0, light = 1) {
      look.lerp(mouse, 1 - Math.exp(-dt * 3));
      frame++;
      screens.forEach((s, i) => {
        const d = i - idx;
        const ad = Math.abs(d);
        const g = s.group;
        g.visible = ad < 2.6;
        g.position.set(d * 5.8, -d * 4.1, -ad * 1.6 + (ad < 1 ? 0 : 0));
        g.rotation.set(d * 0.32, -d * 0.5, -d * 0.12);
        s.uniforms.uActive.value = 1 - Math.min(1, ad) * 0.75;
        s.uniforms.uTime.value = t;
        const anim = !reduced && ad < 0.5;
        if (!s.drawn || (anim && frame % 2 === 0)) redraw(s, t);
      });
      const zz = Math.max(THREE.MathUtils.smoothstep(zoom, 0, 1), focus);
      const free = 1 - focus;
      // diving into a screen fills the whole window, so the offset eases back to the centre
      camera.setViewOffset(vw, vh, offX * (1 - zz), offY * (1 - zz), vw, vh);
      camera.position.set(look.x * 0.35 * free, look.y * 0.25 * free, baseZ - zz * (baseZ - (focus > zoom ? 2.45 : 2.2)));
      camera.lookAt(look.x * 0.1 * free, look.y * 0.08 * free, 0);
      wallMat.color.copy(blend(rooms, idx, roomCol, 0xe4dfd7)).multiplyScalar(light);
      scene.background.copy(wallMat.color);
      wordMat.color.copy(blend(inks, idx, inkCol, 0x000000)).multiplyScalar(light);
      wall.position.x = -look.x * 0.6 - idx * 0.4;
      wall.position.y = -look.y * 0.3 + idx * 0.25;
    },
  };
}
