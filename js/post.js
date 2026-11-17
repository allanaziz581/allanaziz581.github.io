// Full-screen pass: mixes two scene renders and adds the CRT look
// (barrel curve, colour fringing, scanlines, grain, vignette, glitch bands, flash, fade).
import * as THREE from 'three';

const vert = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const frag = /* glsl */`
precision highp float;
uniform sampler2D tA;
uniform sampler2D tB;
uniform float uMix;
uniform float uTime;
uniform float uDpr;
uniform float uBarrel;
uniform float uAberr;
uniform float uScan;
uniform float uGrain;
uniform float uVig;
uniform float uGlitch;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uFade;
varying vec2 vUv;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

vec2 barrel(vec2 uv, float k) {
  vec2 c = uv * 2.0 - 1.0;
  float r2 = dot(c, c);
  c *= (1.0 + k * r2) / (1.0 + k * 2.0);
  return c * 0.5 + 0.5;
}

vec3 scene(vec2 uv) {
  vec3 a = texture2D(tA, uv).rgb;
  if (uMix <= 0.0) return a;
  vec3 b = texture2D(tB, uv).rgb;
  return mix(a, b, uMix);
}

void main() {
  vec2 uv = vUv;
  float tick = floor(uTime * 14.0);

  // glitch: horizontal bands slide sideways while things move fast
  if (uGlitch > 0.001) {
    float band = floor(uv.y * 34.0 + hash(vec2(tick, 3.1)) * 7.0);
    float on = step(1.0 - uGlitch * 0.45, hash(vec2(band, tick)));
    uv.x += on * (hash(vec2(band, tick + 9.0)) - 0.5) * 0.12 * uGlitch;
  }

  float k = uBarrel;
  vec3 col;
  col.r = scene(barrel(uv, k + uAberr)).r;
  col.g = scene(barrel(uv, k)).g;
  col.b = scene(barrel(uv, k - uAberr)).b;

  // scanlines in CSS pixels
  float line = 0.5 + 0.5 * sin(gl_FragCoord.y / uDpr * 3.14159 * 0.66);
  col *= 1.0 - uScan * (1.0 - line);

  // vignette
  vec2 q = vUv - 0.5;
  float v = smoothstep(0.82, 0.22, length(q * vec2(1.0, 1.15)));
  col *= mix(1.0, v, uVig);

  // grain
  col += (hash(gl_FragCoord.xy + fract(uTime * 7.13) * 100.0) - 0.5) * uGrain;

  col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
  col *= 1.0 - uFade;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
  #include <colorspace_fragment>
}
`;

export function createPost(renderer, { samples = 4 } = {}) {
  const opts = { type: THREE.HalfFloatType, samples, depthBuffer: true };
  const rtA = new THREE.WebGLRenderTarget(2, 2, opts);
  const rtB = new THREE.WebGLRenderTarget(2, 2, opts);

  const uniforms = {
    tA: { value: rtA.texture },
    tB: { value: rtB.texture },
    uMix: { value: 0 },
    uTime: { value: 0 },
    uDpr: { value: 1 },
    uBarrel: { value: 0.2 },
    uAberr: { value: 0.004 },
    uScan: { value: 0.15 },
    uGrain: { value: 0.06 },
    uVig: { value: 0.8 },
    uGlitch: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(0xf0f0f0) },
    uFade: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    uniforms,
    setSize(w, h, dpr) {
      rtA.setSize(Math.round(w * dpr), Math.round(h * dpr));
      rtB.setSize(Math.round(w * dpr), Math.round(h * dpr));
      uniforms.uDpr.value = dpr;
    },
    render(a, b, mix) {
      renderer.setRenderTarget(rtA);
      renderer.render(a.scene, a.camera);
      if (b && mix > 0) {
        renderer.setRenderTarget(rtB);
        renderer.render(b.scene, b.camera);
        uniforms.uMix.value = mix;
      } else {
        uniforms.uMix.value = 0;
      }
      renderer.setRenderTarget(null);
      renderer.render(scene, cam);
    },
  };
}
