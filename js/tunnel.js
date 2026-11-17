// About + contact: a corridor that is half factory line, half mixing desk.
// Circuit-board floor with chips, two fader lanes down the middle, robot arms
// and patch-cabled synth panels on both walls.
import * as THREE from 'three';

const LENGTH = 90;

function pcbTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#04100a'; g.fillRect(0, 0, 512, 1024);
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    let x = Math.round(Math.random() * 16) * 32, y = Math.random() * 1024;
    g.strokeStyle = Math.random() > 0.8 ? '#2d7a52' : '#163d2a';
    g.lineWidth = Math.random() > 0.7 ? 5 : 3;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      const len = 40 + Math.random() * 160;
      const dir = Math.floor(Math.random() * 3);
      if (dir === 0) y += len; else if (dir === 1) { x += len * 0.7; y += len * 0.7; } else { x -= len * 0.7; y += len * 0.7; }
      g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = '#3c8d63';
    g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
  }
  return c;
}

function rackTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, 512, 256);
  for (let m = 0; m < 4; m++) {
    const x = m * 128;
    g.fillStyle = m % 2 ? '#131317' : '#101013'; g.fillRect(x + 2, 2, 124, 252);
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.strokeRect(x + 2.5, 2.5, 123, 251);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) {
      const cx = x + 26 + k * 38, cy = 34 + r * 56;
      g.fillStyle = '#2a2a2e'; g.beginPath(); g.arc(cx, cy, 11, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#8a8a90'; g.lineWidth = 2;
      const a = Math.random() * Math.PI * 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9); g.stroke();
      const led = ['#39ff7e', '#ff5a36', '#3fa7ff', '#ffd23f'][Math.floor(Math.random() * 4)];
      if (Math.random() > 0.5) { g.fillStyle = led; g.fillRect(cx + 14, cy - 14, 3, 3); }
    }
  }
  return c;
}

function makeArm(mat, jointMat) {
  const arm = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.22, 20), mat);
  base.position.y = 0.11;
  arm.add(base);
  const yaw = new THREE.Group(); yaw.position.y = 0.22; arm.add(yaw);
  const shoulderJ = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 18), jointMat);
  shoulderJ.rotation.x = Math.PI / 2; shoulderJ.position.y = 0.12; yaw.add(shoulderJ);
  const shoulder = new THREE.Group(); shoulder.position.y = 0.12; yaw.add(shoulder);
  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.8, 6, 14), mat);
  upper.position.y = 0.45; shoulder.add(upper);
  const elbow = new THREE.Group(); elbow.position.y = 0.9; shoulder.add(elbow);
  const elbowJ = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.26, 16), jointMat);
  elbowJ.rotation.x = Math.PI / 2; elbow.add(elbowJ);
  const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.7, 6, 12), mat);
  fore.position.y = 0.4; elbow.add(fore);
  const wrist = new THREE.Group(); wrist.position.y = 0.8; elbow.add(wrist);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.14, 12), jointMat);
  wrist.add(head);
  const f1 = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.14, 0.06), mat);
  f1.position.set(-0.05, 0.12, 0); wrist.add(f1);
  const f2 = f1.clone(); f2.position.x = 0.05; wrist.add(f2);
  return { arm, yaw, shoulder, elbow, wrist };
}

export function createTunnel({ lowPower = false } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06040f);
  scene.fog = new THREE.FogExp2(0x06040f, 0.075);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 80);

  scene.add(new THREE.AmbientLight(0x9fb8c8, 0.22));
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x061008, 0.55);
  scene.add(hemi);
  const lamp = new THREE.PointLight(0xe9fbff, 26, 14, 1.6);
  scene.add(lamp);
  // streetlight orange ahead, studio pink off to one side
  const lamp2 = new THREE.PointLight(0xff8a3d, 12, 10, 1.8);
  scene.add(lamp2);
  const lamp3 = new THREE.PointLight(0xff5fd2, 7, 9, 1.8);
  scene.add(lamp3);

  // floor
  const pcb = new THREE.CanvasTexture(pcbTexture());
  pcb.colorSpace = THREE.SRGBColorSpace;
  pcb.wrapS = pcb.wrapT = THREE.RepeatWrapping;
  pcb.repeat.set(1.4, LENGTH / 6);
  pcb.anisotropy = 8;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(7, LENGTH),
    new THREE.MeshStandardMaterial({ map: pcb, emissiveMap: pcb, emissive: 0x2bff8a, emissiveIntensity: 0.22, roughness: 0.55, metalness: 0.35 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -LENGTH / 2 + 6;
  scene.add(floor);

  const dummy = new THREE.Object3D();
  const SPACING = lowPower ? 2.6 : 2.0;
  const STEPS = Math.floor((LENGTH - 6) / SPACING);

  // chips with green parts, both sides of the lanes
  const chipMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.35, metalness: 0.4 });
  const chips = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), chipMat, STEPS * 4);
  const partMat = new THREE.MeshStandardMaterial({ color: 0x1f6d3c, emissive: 0x2bff7a, emissiveIntensity: 0.35, roughness: 0.5 });
  const parts = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), partMat, STEPS * 8);
  let ci = 0, pi = 0;
  for (let s = 0; s < STEPS; s++) {
    const z = 4 - s * SPACING;
    for (const side of [-1, 1]) {
      dummy.position.set(side * 1.25, 0.05, z); dummy.scale.set(0.62, 0.1, 0.62); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      chips.setMatrixAt(ci++, dummy.matrix);
      dummy.position.set(side * 1.95, 0.04, z - 0.7); dummy.scale.set(0.38, 0.08, 0.5); dummy.updateMatrix();
      chips.setMatrixAt(ci++, dummy.matrix);
      for (let k = 0; k < 4; k++) {
        dummy.position.set(side * (0.75 + (k % 2) * 0.12), 0.05, z - 0.35 - Math.floor(k / 2) * 0.3);
        dummy.scale.set(0.09, 0.09, 0.16); dummy.updateMatrix();
        parts.setMatrixAt(pi++, dummy.matrix);
      }
    }
  }
  scene.add(chips, parts);

  // fader lanes down the middle: slots, caps and meter LEDs
  const slotMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 });
  const slots = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), slotMat, STEPS * 2);
  const capMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3, emissive: 0x333333 });
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), capMat, STEPS * 2);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const LEDS_PER = 8;
  const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ledMat, STEPS * 2 * LEDS_PER);
  const ledColor = new THREE.Color();
  let si = 0;
  for (let s = 0; s < STEPS; s++) {
    const z = 4 - s * SPACING;
    for (const side of [-1, 1]) {
      dummy.position.set(side * 0.32, 0.012, z); dummy.scale.set(0.07, 0.02, SPACING * 0.78); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      slots.setMatrixAt(si++, dummy.matrix);
    }
  }
  scene.add(slots, caps, leds);

  // walls: synth/rack panels
  const rack = new THREE.CanvasTexture(rackTexture());
  rack.colorSpace = THREE.SRGBColorSpace;
  rack.wrapS = rack.wrapT = THREE.RepeatWrapping;
  rack.repeat.set(LENGTH / 4, 1);
  const wallMat = new THREE.MeshStandardMaterial({ map: rack, emissiveMap: rack, emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.6 });
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(LENGTH, 2), wallMat);
    wall.rotation.y = side * -Math.PI / 2;
    wall.position.set(side * 3.4, 1.0, -LENGTH / 2 + 6);
    scene.add(wall);
  }
  // ceiling light strips
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xdffaff, toneMapped: false });
  const strips = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stripMat, STEPS);
  for (let s = 0; s < STEPS; s++) {
    dummy.position.set(0, 3.1, 4 - s * SPACING); dummy.scale.set(2.2, 0.03, 0.08); dummy.updateMatrix();
    strips.setMatrixAt(s, dummy.matrix);
  }
  scene.add(strips);

  // robot arms on shelves, cables to the floor
  const armMat = new THREE.MeshStandardMaterial({ color: 0xe9ecee, roughness: 0.32, metalness: 0.05 });
  const jointMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.4, metalness: 0.5 });
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.4 });
  const cableColors = [0xff6a00, 0x2b6cff, 0xff2a2a, 0xf2c200, 0x39ff7e];
  const cableMats = cableColors.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, emissive: c, emissiveIntensity: 0.15 }));
  const arms = [];
  const ARM_STEP = lowPower ? 4.4 : 3.2;
  const ARM_COUNT = Math.floor((LENGTH - 10) / ARM_STEP);
  const shelf = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), shelfMat, ARM_COUNT * 2);
  let sh = 0;
  for (let a = 0; a < ARM_COUNT; a++) {
    for (const side of [-1, 1]) {
      const z = 2 - a * ARM_STEP - (side > 0 ? ARM_STEP / 2 : 0);
      const r = makeArm(armMat, jointMat);
      r.arm.position.set(side * 2.75, 0.55, z);
      r.arm.rotation.y = side > 0 ? 0 : Math.PI; // +Z joint rotation leans the arm toward the centre on both walls
      scene.add(r.arm);
      arms.push({ ...r, side, seed: Math.random() * 10 });
      dummy.position.set(side * 2.9, 0.27, z); dummy.scale.set(0.9, 0.55, 0.9); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      shelf.setMatrixAt(sh++, dummy.matrix);
      for (let k = 0; k < 2; k++) {
        const from = new THREE.Vector3(side * 2.75, 0.5, z + (k ? 0.18 : -0.18));
        const to = new THREE.Vector3(side * (0.9 + Math.random() * 0.7), 0.03, z - 0.6 - Math.random() * 1.2);
        const mid = from.clone().lerp(to, 0.5); mid.y = 0.04;
        const curve = new THREE.CatmullRomCurve3([from, new THREE.Vector3(side * 2.45, 0.08, from.z), mid, to]);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.022, 6, false), cableMats[(a * 2 + k + (side > 0 ? 1 : 0)) % cableMats.length]);
        scene.add(tube);
      }
    }
  }
  scene.add(shelf);

  // signals racing along the board
  const SIG = lowPower ? 40 : 90;
  const sigMat = new THREE.MeshBasicMaterial({ color: 0xb9ffd8, toneMapped: false, transparent: true, opacity: 0.9 });
  const signals = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), sigMat, SIG);
  const sig = Array.from({ length: SIG }, () => ({
    x: (Math.random() > 0.5 ? 1 : -1) * (0.55 + Math.random() * 2.1),
    z: 4 - Math.random() * (LENGTH - 8),
    v: 2 + Math.random() * 6,
  }));
  scene.add(signals);

  const look = new THREE.Vector2();
  const mouse = new THREE.Vector2();
  const tmpColor = new THREE.Color();

  return {
    scene, camera,
    resize(w, h) { camera.aspect = w / h; camera.fov = w / h < 0.8 ? 62 : 48; camera.updateProjectionMatrix(); },
    setPointer(nx, ny) { mouse.set(nx, ny); },
    // p: 0..1 through the corridor; c: 0..1 contact (camera slows and tilts up)
    update(t, dt, p, c, reduced) {
      look.lerp(mouse, 1 - Math.exp(-dt * 2.5));
      const ease = THREE.MathUtils.smootherstep(c, 0, 1);
      const z = 3.5 - p * 34 - ease * 6;
      const bob = reduced ? 0 : Math.sin(t * 1.3) * 0.02;
      camera.position.set(look.x * 0.25, 1.05 + bob + ease * 0.55, z);
      camera.lookAt(look.x * 0.5, 0.55 + look.y * 0.3 + ease * 1.1, z - 6);
      lamp.position.set(0, 2.2, z - 3.5);
      lamp2.position.set(0, 0.6, z - 8);
      lamp3.position.set(1.4, 1.4, z - 5.5);

      // faders follow a made-up song: kick on the beat, pads breathing
      const beat = t * 1.6;
      let ci2 = 0, li = 0;
      for (let s = 0; s < STEPS; s++) {
        const zz = 4 - s * SPACING;
        if (zz > z + 6 || zz < z - 30) { // far away: park off-screen cheaply
          for (const _ of [0, 1]) { dummy.position.set(0, -5, 0); dummy.scale.setScalar(0.001); dummy.updateMatrix(); caps.setMatrixAt(ci2++, dummy.matrix); for (let k = 0; k < LEDS_PER; k++) leds.setMatrixAt(li++, dummy.matrix); }
          continue;
        }
        for (const side of [-1, 1]) {
          const lvl = reduced ? 0.6 : 0.5 + 0.38 * Math.sin(beat * (side > 0 ? 1 : 0.5) + s * 0.55) * Math.abs(Math.sin(t * 0.4 + s * 0.2));
          dummy.position.set(side * 0.32, 0.06, zz + SPACING * 0.36 - lvl * SPACING * 0.72);
          dummy.scale.set(0.24, 0.09, 0.13); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
          caps.setMatrixAt(ci2++, dummy.matrix);
          for (let k = 0; k < LEDS_PER; k++) {
            dummy.position.set(side * 0.52, 0.02, zz + SPACING * 0.33 - k * SPACING * 0.09);
            dummy.scale.set(0.05, 0.02, 0.05); dummy.updateMatrix();
            leds.setMatrixAt(li, dummy.matrix);
            const on = k / LEDS_PER < lvl;
            const hue = k > LEDS_PER - 2 ? 0.0 : k > LEDS_PER - 4 ? 0.13 : 0.38;
            tmpColor.setHSL(hue, 1, on ? 0.6 : 0.06);
            leds.setColorAt(li++, tmpColor);
          }
        }
      }
      caps.instanceMatrix.needsUpdate = true;
      leds.instanceMatrix.needsUpdate = true;
      if (leds.instanceColor) leds.instanceColor.needsUpdate = true;

      for (let i = 0; i < SIG; i++) {
        const s = sig[i];
        if (!reduced) s.z -= s.v * dt;
        if (s.z < -LENGTH + 8) s.z = 4;
        dummy.position.set(s.x, 0.03, s.z); dummy.scale.set(0.035, 0.02, 0.35); dummy.updateMatrix();
        signals.setMatrixAt(i, dummy.matrix);
      }
      signals.instanceMatrix.needsUpdate = true;

      if (!reduced) {
        for (const a of arms) {
          if (Math.abs(a.arm.position.z - z) > 26) continue;
          const k = t * 0.7 + a.seed;
          a.yaw.rotation.y = Math.sin(k * 0.6) * 0.5;
          a.shoulder.rotation.z = 0.5 + Math.sin(k) * 0.25;
          a.elbow.rotation.z = 1.0 + Math.sin(k * 1.3 + 1) * 0.35;
          a.wrist.rotation.z = 0.4 + Math.sin(k * 1.7) * 0.4;
        }
      }
    },
    prime() {
      for (const a of arms) {
        a.shoulder.rotation.z = 0.5; a.elbow.rotation.z = 1.0; a.wrist.rotation.z = 0.4;
      }
    },
  };
}
