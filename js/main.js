// Orchestrates the three scenes against the page scroll, plus overlays, menu, cursor, sound,
// the project detail view and the ?edit editor. Work entries come from content.json.
import * as THREE from 'three';
import { createPost } from './post.js';
import { createHero } from './hero.js';
import { createWork, SCREEN_ASPECT, TEX_W, TEX_H } from './work.js';
import { createTunnel } from './tunnel.js';
import { createSound } from './sound.js';
import { loadContent } from './content.js';
import { POSTERS, posterFor, tintFor, DEFAULT_TINT } from './posters.js';
import { createDetail } from './detail.js';

const root = document.documentElement;
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, v) => { const x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const bump = (v, c, w) => Math.max(0, 1 - Math.abs(v - c) / w);
const lerp = (a, b, k) => a + (b - a) * k;
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
// work room lights: dark while the hero hands over, then up over about half a screen of scrolling.
// Squared-and-more in linear light so the brightness you see rises evenly instead of jumping.
const roomLight = (s) => 0.02 + 0.98 * Math.pow(sstep(1.08, 1.58, s), 2.2);

const EDIT = new URLSearchParams(location.search).has('edit');
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = reducedQuery.matches;
reducedQuery.addEventListener?.('change', (e) => { reduced = e.matches; });

const preloader = $('.preloader');
const setProgress = (p) => preloader.style.setProperty('--p', p.toFixed(3));

function webglOK() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch (_) { return false; }
}

function fallback(err) {
  if (err) console.warn('[site] visual layer off:', err);
  root.classList.add('no-webgl');
  root.classList.remove('is-loading');
  root.classList.add('is-ready');
}

// Scroll map in screen heights. Everything after the work section follows the number of entries.
function scrollMap(n) {
  const S = { workStart: 1.55, step: 1.0, n };
  S.workEnd = S.workStart + (n - 1) * S.step;
  S.zoomStart = S.workEnd + 0.2;
  S.cut = S.workEnd + 0.8;
  S.about = S.cut + 1.0;
  S.aboutSwitch = S.cut + 1.7;
  S.tunnelEnd = S.cut + 3.25;
  S.max = S.tunnelEnd + 1.4;
  return S;
}

async function boot() {
  if (!webglOK()) return fallback('no WebGL2');
  const content = await loadContent();
  const PROJECTS = content.work;
  const S = scrollMap(PROJECTS.length);
  const musicKey = (PROJECTS.find((p) => p.category === 'music') || PROJECTS[PROJECTS.length - 1]).key;
  const GOTO = { home: 0, work: S.workStart, about: S.about, contact: S.max };
  PROJECTS.forEach((p, i) => { GOTO[p.key] = S.workStart + i * S.step; });
  GOTO.studio = GOTO[musicKey];

  const lowPower = innerWidth < 768 || (navigator.hardwareConcurrency || 8) <= 4;
  const canvas = $('#gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const dpr = Math.min(devicePixelRatio || 1, lowPower ? 1.5 : 1.75);
  renderer.setPixelRatio(dpr);
  const post = createPost(renderer, { samples: lowPower ? 2 : 4 });
  // post look per scene (barrel = how hard the image is bent; work.setArea needs the work room's)
  const LOOK = {
    hero: { barrel: 0.24, aberr: 0.0045, scan: 0.2, grain: 0.07, vig: 0.95 },
    work: { barrel: 0.16, aberr: 0.003, scan: 0.05, grain: 0.04, vig: 0.22 },
    tunnel: { barrel: 0.22, aberr: 0.004, scan: 0.14, grain: 0.08, vig: 0.85 },
  };
  const t0 = performance.now();

  setProgress(0.08);
  await Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 2500))]);
  setProgress(0.25);
  const hero = await createHero({ lowPower });
  setProgress(0.55);
  const work = createWork({ lowPower, projects: PROJECTS });
  work.drawAll(0);
  setProgress(0.72);
  const tunnel = createTunnel({ lowPower });
  tunnel.prime();
  setProgress(0.86);
  const scenes = [hero, work, tunnel];

  // ---------- work list (rebuilt from content so it always matches the screens) ----------
  const listEl = $('.work__list');
  listEl.replaceChildren(...PROJECTS.map((p, i) => {
    const li = document.createElement('li');
    li.dataset.i = i; li.dataset.key = p.key;
    const b = document.createElement('button');
    b.type = 'button'; b.tabIndex = -1;
    b.textContent = `[${String(i + 1).padStart(2, '0')}] ${p.title.toLowerCase()}`;
    li.append(b);
    return li;
  }));

  // ---------- sizing ----------
  const track = $('#scroll-track');
  let vw = innerWidth, vh = innerHeight, gw = 0, gh = 0;
  let queueFrameWork = () => {}; // set once the work overlay is wired up (below)
  function resize(force) {
    const w = innerWidth, h = innerHeight;
    // the picture is drawn at the canvas's own size: the full screen with a phone browser's bars hidden
    // (css #gl), which stays put when the bars come and go, so it never stretches
    const cw = canvas.clientWidth || w, ch = canvas.clientHeight || h;
    if (force || cw !== gw || ch !== gh) {
      gw = cw; gh = ch;
      renderer.setSize(cw, ch, false);
      post.setSize(cw, ch, dpr);
      scenes.forEach((s) => s.resize(cw, ch));
      queueFrameWork();
    }
    // the scroll unit ignores small height changes from mobile browser bars
    if (!force && w === vw && Math.abs(h - vh) < 120) return;
    vw = w; vh = h;
    queueFrameWork();
    track.style.height = `${Math.round((S.max + 1) * vh)}px`;
  }
  resize(true);
  addEventListener('resize', () => resize(false));

  scenes.forEach((s) => renderer.compile(s.scene, s.camera));
  setProgress(1);
  await new Promise((r) => setTimeout(r, Math.max(0, 900 - (performance.now() - t0))));

  // ---------- state ----------
  let sTarget = scrollY / vh, sCur = sTarget, sPrev = sCur;
  let introStart = -1;
  let active = -1;
  let focusTarget = 0, focusCur = 0, glitchKick = 0;
  let litWas = ''; // the work room's light, mirrored on its overlay as --lit (css: the list's bands)
  addEventListener('scroll', () => { sTarget = scrollY / vh; }, { passive: true });

  // ---------- overlays ----------
  const ov = Object.fromEntries($$('[data-ov]').map((el) => [el.dataset.ov, el]));
  const aboutBlocks = $$('[data-about]');
  const listItems = $$('.work__list li');
  const info = $('.work__info');
  const infoNum = $('.work__num'), infoTitle = $('.work__info-title'), infoDesc = $('.work__desc'), infoRole = $('.work__role');
  const infoCat = $('.work__cat');
  const infoLink = $('.work__link'), infoLinkRow = $('.work__info-link');
  const openBtn = $('.work__open');
  if (EDIT) openBtn.textContent = '> edit project';
  const sound = createSound();

  function setOverlay(el, o) {
    el.style.opacity = o.toFixed(3);
    el.classList.toggle('is-on', o > 0.02);
  }

  function fillInfo(i) {
    const p = PROJECTS[i];
    infoNum.textContent = String(i + 1).padStart(2, '0');
    infoTitle.textContent = p.title.toLowerCase();
    infoTitle.dataset.poster = p.poster || '';
    fitTitle();
    infoCat.textContent = p.category || '';
    infoDesc.textContent = p.desc;
    infoRole.textContent = (p.role || []).join(', ');
    const l = (p.links || [])[0];
    if (l) { infoLinkRow.hidden = false; infoLink.href = l.href; infoLink.textContent = l.label; }
    else infoLinkRow.hidden = true;
    placeSide();
  }

  // the heading starts at the CSS size (Tesla's) and steps down only until its longest word fits and it
  // takes at most two lines (so "dsp guitar rig" doesn't push the panel into the next screen)
  function fitTitle() {
    infoTitle.style.fontSize = '';
    if (!infoTitle.clientWidth) return;
    let fs = parseFloat(getComputedStyle(infoTitle).fontSize);
    const lh = parseFloat(getComputedStyle(infoTitle).lineHeight) / fs || 0.95;
    const tooBig = () => infoTitle.scrollWidth > infoTitle.clientWidth + 1 || infoTitle.offsetHeight > fs * lh * 2.5;
    while (fs > 18 && tooBig()) { fs -= 1; infoTitle.style.fontSize = fs + 'px'; }
  }
  addEventListener('resize', fitTitle);

  // ---------- work layout: the front screen never sits under the list or the info panel ----------
  // Side by side (list left, info right, screen between) or stacked (list on top, info along the
  // bottom, screen between), whichever leaves the bigger screen; then the camera frames the screen
  // inside that free area (work.setArea). Re-run on resize and when content changes.
  const workIndex = $('.work__index');
  const fitH = (a) => Math.max(0, Math.min((a.r - a.l) / SCREEN_ASPECT, a.b - a.t)); // screen height that fits
  // Side by side, the list and the info panel also keep GAP clear of the screens either side of the
  // front one (the previous sits up left, the next down right): each stays centred unless that would
  // bring it closer, then the info moves up and the list down, never into the name/menu row.
  // Stacked has its bands (css) instead.
  const GAP = 28;
  let clear = null; // { h, head, foot, next, prev }: the side layout's limits, null while stacked
  const edgeIn = (pts, el, pick) => {
    const r = el.getBoundingClientRect(), ys = pts.filter(([x]) => x >= r.left - GAP && x <= r.right + GAP).map(([, y]) => y);
    return ys.length ? pick(...ys) : null;
  };
  function placeSide() {
    if (!clear) {
      workIndex.style.top = info.style.top = workIndex.style.transform = info.style.transform = '';
      return;
    }
    const { h, head, foot, next, prev } = clear;
    const ih = info.offsetHeight, lh = workIndex.offsetHeight;
    let it = (h - ih) / 2;
    if (next !== null) it = Math.min(it, next - GAP - ih);
    let lt = (h - lh) / 2;
    if (prev !== null) lt = Math.max(lt, prev + GAP);
    lt = Math.min(lt, h - foot - lh);
    info.style.top = `${Math.round(Math.max(head + 8, it))}px`;
    workIndex.style.top = `${Math.round(Math.max(head + 8, lt))}px`;
    info.style.transform = workIndex.style.transform = 'none';
  }
  function frameWork() {
    const w = innerWidth, h = ov.work.clientHeight || innerHeight;
    const air = clamp(w * 0.025, 14, 36);
    const head = 62, foot = 40; // the name/menu row and the bottom row
    clear = null; placeSide(); info.style.width = '';
    ov.work.classList.remove('is-stacked');
    const li = workIndex.getBoundingClientRect(), inf = info.getBoundingClientRect();
    const side = { l: li.right + air, r: inf.left - air, t: head, b: h - foot };
    // stacked: reserve room for the tallest project's info so the screen doesn't jump between projects
    ov.work.classList.add('is-stacked');
    let tallest = 0;
    PROJECTS.forEach((_, i) => { fillInfo(i); tallest = Math.max(tallest, info.offsetHeight); });
    const li2 = workIndex.getBoundingClientRect(), infBottom = info.getBoundingClientRect().bottom;
    const stacked = { l: li2.left, r: w - li2.left, t: li2.bottom + air * 0.7, b: infBottom - tallest - air * 0.7 };
    // keep the list on the left unless stacking buys a clearly bigger screen
    const useStacked = fitH(stacked) > 1.3 * fitH(side);
    ov.work.classList.toggle('is-stacked', useStacked);
    ov.work.style.setProperty('--band-top', `${Math.round(li2.bottom)}px`);
    ov.work.style.setProperty('--band-bottom', `${Math.round(h - (infBottom - tallest))}px`);
    info.classList.remove('is-crowded');
    if (useStacked) {
      fillInfo(Math.max(0, active));
      work.setArea(stacked, LOOK.work.barrel);
      return;
    }
    // side by side: the tallest project's info has to fit between the name/menu row and GAP above the
    // next screen. On a short window it may not: widen the info column a step at a time (fewer lines),
    // which narrows the front screen, by no more than a fifth. Still too tall: a soft backing (css).
    const tallestSide = () => { let t = 0; PROJECTS.forEach((_, i) => { fillInfo(i); t = Math.max(t, info.offsetHeight); }); return t; };
    const base = info.offsetWidth, h0 = fitH(side);
    let area = side, next = null, room = Infinity;
    for (let wi = base; ; wi += 24) {
      info.style.width = wi === base ? '' : `${wi}px`;
      area = { ...side, r: side.r - (wi - base) };
      work.setArea(area, LOOK.work.barrel);
      next = edgeIn(work.restOutline(1), info, Math.min);
      room = next === null ? Infinity : next - (head + 8) - tallestSide(); // what's left between them
      if (room >= GAP || wi + 24 > 420 || fitH({ ...area, r: area.r - 24 }) < 0.8 * h0) break;
    }
    info.classList.toggle('is-crowded', room < 6); // only when the text would actually reach the bezel
    // the next screen's top edge above the info column, the previous one's bottom edge beside the list
    clear = { h, head, foot, next, prev: edgeIn(work.restOutline(-1), workIndex, Math.max) };
    fillInfo(Math.max(0, active));
  }
  let frameReq = 0;
  queueFrameWork = () => { if (!frameReq) frameReq = requestAnimationFrame(() => { frameReq = 0; frameWork(); }); };
  frameWork();
  // the heading font arrives after the first layout: fit the side heading and frame the screen again
  document.fonts?.ready.then(() => { fitTitle(); queueFrameWork(); });
  if (/[?&]layout\b/.test(location.search)) { // layout checks only
    window.__workScreenRect = () => work.screenRect();
    window.__workRest = (d) => work.restOutline(d);
  }

  // --main / --pop (and --accent) follow the project in front, back to streetlight orange outside the work room.
  // --hi is the one that reads on the dark project page: the pop colour, or the main one when the pop is
  // too dark (Tesla's near-black)
  let tintKey = '';
  const lum = (hex) => {
    const c = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  function setTint(t) {
    const key = t.main + t.pop;
    if (key === tintKey) return;
    tintKey = key;
    root.style.setProperty('--main', t.main);
    root.style.setProperty('--pop', t.pop);
    root.style.setProperty('--accent', t.pop);
    root.style.setProperty('--room', t.room);
    root.style.setProperty('--hi', lum(t.pop) > 0.12 ? t.pop : t.main);
  }
  function setActive(i) {
    if (i === active) return;
    const first = active === -1;
    active = i;
    listItems.forEach((li, k) => li.classList.toggle('is-active', k === i));
    const apply = () => { fillInfo(active); info.classList.remove('is-swapping'); };
    if (first || reduced) apply();
    else { info.classList.add('is-swapping'); setTimeout(apply, 180); }
    if (!first) sound.pluck(i);
  }

  // ---------- navigation ----------
  function goto(key, instant) {
    const s = GOTO[key];
    if (s === undefined) return;
    const top = Math.round(s * vh);
    scrollTo({ top, behavior: instant || reduced ? 'auto' : 'smooth' });
    sTarget = s;
    if (instant) { sCur = sPrev = s; }
  }

  // ---------- detail view ----------
  const detail = createDetail({
    content,
    posterKeys: Object.keys(POSTERS),
    poster: { draw: posterFor, w: TEX_W, h: TEX_H },
    edit: EDIT,
    onOpen(i) {
      focusTarget = 1;
      root.style.overflow = 'hidden';
      history.replaceState(null, '', `${location.search}#${PROJECTS[i].key}/details`);
    },
    onClose(i) {
      focusTarget = 0;
      root.style.overflow = '';
      if (PROJECTS[i]) history.replaceState(null, '', `${location.search}#${PROJECTS[i].key}`);
    },
    onGo(j) {
      // channel change: jump the scroll to the other screen behind a glitch
      root.style.overflow = '';
      goto(PROJECTS[j].key, true);
      root.style.overflow = 'hidden';
      setActive(j);
      glitchKick = 1;
    },
    onChange(i) { if (i === active) fillInfo(i); queueFrameWork(); },
  });
  function openDetail(i) {
    closeMenu(false);
    if (Math.abs(sCur - GOTO[PROJECTS[i].key]) > 0.02) goto(PROJECTS[i].key, true);
    setActive(i);
    detail.open(i);
  }
  const workVisible = () => sCur > 1.3 && sCur < S.zoomStart && !detail.isOpen;

  // ---------- scroll outwards ----------
  // An open project is a page of its own: scrolling down brings up "more about it" under the strip.
  // Scrolling up from the top of that page (or swiping down from its top) pulls the camera back out
  // of the screen; past PULL_CLOSE it lets go and the project closes, stop sooner and it settles
  // back in. Scrolling down past the end does nothing, and a scroll that has just brought the page back
  // to the top stops there: zooming out takes a fresh scroll up.
  const PULL_CLOSE = 0.34;
  const detailView = $('#detail .detail__view');
  // the project page, or the editor form; the top bar scrolls the page too
  const scroller = (t) => t?.closest?.('.detail__scroll') || (detailView.hidden ? null : detailView);
  let pull = 0, pullAt = 0, holdUntil = 0, panelScrolledAt = 0, touchY = null, touchX = null, touchPanel = null, touchSide = false;
  let wheelAt = 0, wheelScrolled = false, touchFromTop = true;
  $('#detail').addEventListener('scroll', () => { panelScrolledAt = performance.now(); }, { passive: true, capture: true });
  function pullBy(amount) {
    pull = Math.min(1, pull + amount);
    pullAt = performance.now();
    if (pull >= PULL_CLOSE) {
      holdUntil = pullAt + 450; // swallow the rest of this gesture so the page doesn't jump on to the next project
      detail.close();
    }
  }
  const canScroll = (el, dy) => (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0);
  addEventListener('wheel', (e) => {
    const now = performance.now();
    if (!detail.isOpen) {
      if (now < holdUntil) { e.preventDefault(); holdUntil = now + 320; }
      return;
    }
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // sideways: the gallery's slides (js/detail.js)
    const panel = scroller(e.target);
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    if (now - wheelAt > 300) wheelScrolled = false; // a pause: the next wheel is a new gesture
    wheelAt = now;
    if (panel && (canScroll(panel, dy) || now - panelScrolledAt < 250)) {
      wheelScrolled = true;
      if (!panel.contains(e.target)) { e.preventDefault(); panel.scrollTop += dy; } // a wheel over the top bar
      return;
    }
    e.preventDefault();
    if (panel && (dy > 0 || wheelScrolled)) return; // the end of the page, or the scroll that just got back to the top
    pullBy(Math.min(300, Math.abs(dy)) / 700);
  }, { passive: false });
  addEventListener('touchstart', (e) => {
    if (!detail.isOpen) return;
    touchY = e.touches[0].clientY;
    touchX = e.touches[0].clientX;
    touchPanel = scroller(e.target);
    touchFromTop = !touchPanel || touchPanel.scrollTop <= 0; // only a swipe that starts at the top pulls out
    touchSide = false;
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (touchY == null) return;
    if (!detail.isOpen) {
      // the swipe that closed the project: hold the page still until the finger lifts
      if (performance.now() < holdUntil) { e.preventDefault(); holdUntil = performance.now() + 320; }
      return;
    }
    const y = e.touches[0].clientY, x = e.touches[0].clientX, dy = y - touchY, dx = x - touchX;
    // a sideways swipe belongs to the gallery (or a time slider), not to the pull
    if (touchSide || Math.abs(dx) > Math.abs(dy)) { touchSide = true; return; }
    touchY = y; touchX = x;
    if (touchPanel && !(touchFromTop && dy > 0 && touchPanel.scrollTop <= 0)) return;
    e.preventDefault();
    pullBy(Math.abs(dy) / (innerHeight * 0.55));
  }, { passive: false });
  addEventListener('touchend', () => { touchY = null; }, { passive: true });
  addEventListener('touchcancel', () => { touchY = null; }, { passive: true });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-goto]');
    if (a) {
      e.preventDefault();
      closeMenu(false);
      if (detail.isOpen) detail.close();
      goto(a.dataset.goto);
      history.replaceState(null, '', location.pathname + location.search + (a.dataset.goto === 'home' ? '' : `#${a.dataset.goto}`));
      return;
    }
    if (e.target.closest('.work__open')) { if (active >= 0) openDetail(active); return; }
    const li = e.target.closest('.work__list li');
    if (li) {
      const i = +li.dataset.i;
      if (i === active && workVisible()) openDetail(i); else goto(PROJECTS[i].key);
      return;
    }
    // click on the front screen opens it
    if ((e.target === canvas || e.target === document.body || e.target === root) && workVisible() && active >= 0) {
      const nx = (e.clientX / gw) * 2 - 1, ny = -(e.clientY / gh) * 2 + 1;
      if (work.pick(nx, ny, active)) openDetail(active);
    }
  });

  // ---------- menu ----------
  const menu = $('#menu');
  const menuBtn = $('[data-menu-toggle]');
  function openMenu() {
    if (detail.isOpen) detail.close();
    menu.hidden = false;
    requestAnimationFrame(() => menu.classList.add('is-open'));
    menuBtn.setAttribute('aria-expanded', 'true');
    root.style.overflow = 'hidden';
    const cur = currentSection();
    $$('.menu__list a', menu).forEach((a) => a.setAttribute('aria-current', a.dataset.goto === cur ? 'true' : 'false'));
    $('.menu__list a', menu).focus();
  }
  function closeMenu(returnFocus = true) {
    if (menu.hidden) return;
    menu.classList.remove('is-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    root.style.overflow = '';
    setTimeout(() => { menu.hidden = true; }, 250);
    if (returnFocus) menuBtn.focus();
  }
  menuBtn.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
  document.addEventListener('keydown', (e) => {
    if (menu.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
    if (e.key === 'Tab') {
      const items = [menuBtn, ...$$('a', menu)];
      const i = items.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
      else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
    }
  });
  function currentSection() {
    if (sCur < 1) return 'home';
    if (sCur < S.cut) return PROJECTS[active]?.key === musicKey ? 'studio' : 'work';
    if (sCur < S.tunnelEnd) return 'about';
    return 'contact';
  }

  // ---------- sound ----------
  const soundBtn = $('[data-sound]');
  soundBtn.addEventListener('click', () => {
    const on = sound.toggle();
    soundBtn.setAttribute('aria-pressed', String(on));
    $('.sound-toggle__state', soundBtn).textContent = on ? 'on' : 'off';
  });

  // ---------- pointer (the cursor itself is a CSS pixel arrow) ----------
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  addEventListener('pointermove', (e) => {
    const nx = (e.clientX / gw) * 2 - 1, ny = -(e.clientY / gh) * 2 + 1;
    // a finger has no hover: touch would leave a permanent dent in the bust and tilt the scenes
    if (e.pointerType !== 'touch') scenes.forEach((s) => s.setPointer(nx, ny));
    if (!fine) return;
    const overScreen = workVisible() && active >= 0 && e.target === canvas && work.pick(nx, ny, active);
    root.classList.toggle('over-screen', !!overScreen);
  }, { passive: true });

  // ---------- post look per scene (LOOK is defined next to the post pass, above) ----------
  const U = post.uniforms;
  function applyLook(a, b, k) {
    U.uBarrel.value = lerp(a.barrel, b.barrel, k);
    U.uAberr.value = lerp(a.aberr, b.aberr, k);
    U.uScan.value = lerp(a.scan, b.scan, k);
    U.uGrain.value = lerp(a.grain, b.grain, k);
    U.uVig.value = lerp(a.vig, b.vig, k);
  }

  // ---------- go ----------
  root.classList.remove('is-loading');
  root.classList.add('is-ready');
  // deep links: #key scrolls to that screen, #key/details also opens it. The readable layer has
  // elements with the same ids, so the browser's own jump to them (which can land after the page
  // finishes loading) is undone here.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  function route(instant) {
    const [key, mode] = decodeURIComponent(location.hash.slice(1)).split('/');
    if (!key || GOTO[key] === undefined) return false;
    goto(key, instant);
    const i = PROJECTS.findIndex((p) => p.key === key);
    if (i >= 0 && mode === 'details' && !detail.isOpen) setTimeout(() => openDetail(i), instant ? 400 : 900);
    return true;
  }
  if (route(true) && document.readyState !== 'complete') {
    addEventListener('load', () => {
      const [key] = decodeURIComponent(location.hash.slice(1)).split('/');
      if (GOTO[key] !== undefined) goto(key, true);
    }, { once: true });
  }
  addEventListener('hashchange', () => { if (!detail.isOpen) route(false); });

  let last = performance.now() / 1000;
  function frame(nowMs) {
    const now = nowMs / 1000;
    const dt = Math.min(0.05, Math.max(0.001, now - last));
    last = now;
    if (introStart < 0) introStart = now;

    sPrev = sCur;
    sCur += (sTarget - sCur) * (1 - Math.exp(-dt * (reduced ? 20 : 7)));
    if (Math.abs(sTarget - sCur) < 1e-4) sCur = sTarget;
    const s = sCur;
    const vel = (s - sPrev) / dt;

    // work index with a resting plateau on each project
    const raw = clamp((s - S.workStart) / S.step, 0, S.n - 1);
    const k = Math.floor(raw);
    const idx = Math.min(S.n - 1, k + sstep(0.3, 0.7, raw - k));
    if (s > 1.2 && s < S.cut && !detail.isOpen) setActive(Math.round(idx));
    setTint(s > 1.1 && s < S.cut + 0.2 && active >= 0 ? tintFor(PROJECTS[active]) : DEFAULT_TINT);

    // scroll outwards: the pull eases back to nothing once the wheel or finger stops
    if (pull > 0 && (!detail.isOpen || performance.now() - pullAt > 180)) pull *= Math.exp(-dt * (detail.isOpen ? 7 : 30));
    if (pull < 1e-3) pull = 0;
    root.style.setProperty('--pull', pull.toFixed(3));
    const fTarget = focusTarget * (1 - pull);
    focusCur = reduced ? fTarget : focusCur + (fTarget - focusCur) * (1 - Math.exp(-dt * (pull > 0 ? 9 : 3.4)));
    if (Math.abs(fTarget - focusCur) < 1e-3) focusCur = fTarget;
    const focus = easeInOut(focusCur);

    const zoom = sstep(S.zoomStart, S.cut, s);
    const tunnelP = clamp((s - S.cut) / (S.tunnelEnd - S.cut), 0, 1);
    const contactP = clamp((s - S.tunnelEnd) / (S.max - S.tunnelEnd), 0, 1);

    // which scenes draw
    let A, B = null, mix = 0;
    if (s < 0.95) { A = hero; applyLook(LOOK.hero, LOOK.hero, 0); }
    else if (s < 1.3) { A = hero; B = work; mix = sstep(0.95, 1.28, s); applyLook(LOOK.hero, LOOK.work, mix); }
    else if (s < S.cut - 0.06) { A = work; applyLook(LOOK.work, LOOK.work, 0); }
    else if (s < S.cut + 0.3) { A = work; B = tunnel; mix = sstep(S.cut - 0.05, S.cut + 0.08, s); applyLook(LOOK.work, LOOK.tunnel, mix); }
    else { A = tunnel; applyLook(LOOK.tunnel, LOOK.tunnel, 0); }

    const intro = reduced ? 1 : clamp((now - introStart) / 2.4, 0, 1);
    if (A === hero || B === hero) { hero.uniforms.uIntro.value = 1 - Math.pow(1 - intro, 3); hero.update(now, dt, clamp(s, 0, 1.3), reduced); }
    if (A === work || B === work) work.update(now, dt, idx, zoom, reduced, focus, roomLight(s));
    if (A === tunnel || B === tunnel) tunnel.update(now, dt, tunnelP, contactP, reduced);

    glitchKick = Math.max(0, glitchKick - dt * 3);
    U.uTime.value = now;
    // hero -> work: no flash; the room starts dark (only the screens glow) and its lights come up
    U.uFlash.value = 0;
    U.uFade.value = bump(s, S.cut, 0.12) * 0.95 + contactP * 0.45;
    const g = reduced ? 0 : Math.abs(vel) * 0.25 + bump(s, 1.0, 0.18) + bump(s, S.cut, 0.18) * 1.2 + glitchKick * 0.8 + bump(focusCur, 0.5, 0.35) * 0.25;
    U.uGlitch.value = clamp(g, 0, 1);
    post.render(A, B, mix);

    // overlays
    setOverlay(ov.hero, 1 - sstep(0.12, 0.5, s));
    setOverlay(ov.work, sstep(1.2, 1.5, s) * (1 - sstep(S.zoomStart, S.zoomStart + 0.3, s)) * (1 - sstep(0, 0.3, focusCur)));
    const lit = roomLight(s).toFixed(2);
    if (lit !== litWas) { litWas = lit; ov.work.style.setProperty('--lit', lit); }
    const aboutOp = sstep(S.cut + 0.2, S.cut + 0.45, s) * (1 - sstep(S.tunnelEnd - 0.25, S.tunnelEnd, s));
    setOverlay(ov.about, aboutOp);
    aboutBlocks[0].classList.toggle('is-on', aboutOp > 0.02 && s < S.aboutSwitch);
    aboutBlocks[1].classList.toggle('is-on', aboutOp > 0.02 && s >= S.aboutSwitch);
    setOverlay(ov.contact, sstep(S.tunnelEnd + 0.1, S.tunnelEnd + 0.6, s));

    if (sound.on) {
      const cutoff = s < 1 ? 520 : s < S.cut ? 1500 + focus * 1200 : 360 + tunnelP * 600 - contactP * 400;
      sound.setCutoff(cutoff);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot().catch(fallback);
