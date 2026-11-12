// Selected work: CRT screens sliding along a diagonal through a pale room that takes the colour of
// whichever project is in front (rose for Tesla, blue for the headset, green for ThinkFree...). The
// room's lights fade up as you arrive from the hero, so there is no white flash.
import * as THREE from 'three';
import { posterFor, tintFor } from './posters.js';

const W = 5.3, H = 3.55, BEZEL = 0.2;
const TEX_W = 1024, TEX_H = Math.round(1024 * (H - 2 * BEZEL) / (W - 2 * BEZEL));

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

  return {
    scene, camera, count: screens.length,
    resize(w, h) {
      camera.aspect = w / h;
      const fit = (W * 1.3) / (2 * Math.tan(THREE.MathUtils.degToRad(17.5)) * camera.aspect);
      baseZ = Math.max(11, fit);
      camera.updateProjectionMatrix();
      const need = (w / h) * 2 * Math.tan(THREE.MathUtils.degToRad(17.5)) * (baseZ + 10);
      wall.scale.setScalar(Math.max(1, need / 44 + 0.1));
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
