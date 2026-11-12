// Project detail view (opened by clicking the front screen) and the in-page editor (?edit).
//
// View mode is a full-screen strip of slides that loops through every project (each one's screen
// artwork, then its pictures, videos and frame sequences), with project, info and role along the
// bottom for the slide in front; scrolling down brings up "more about it" (summary, what I did, tools).
// Edit mode turns the same dialog into a form bound to content.json; "save" posts to
// tools/serve.py (localhost only), which writes content.json and rebuilds the readable layer,
// JSON-LD and llms.txt. Without that server, save downloads content.json instead.

const $ = (sel, el = document) => el.querySelector(sel);
const KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CATEGORIES = ['tesla', 'music', 'headset', 'ai', 'engineering'];

const FIELDS = [
  ['title', 'title', 'text'],
  ['subtitle', 'subtitle', 'text'],
  ['category', 'category', 'category'],
  ['when', 'when', 'text'],
  ['where', 'where', 'text'],
  ['desc', 'short text (shown beside the screens)', 'area', 3],
  ['summary', 'summary (detail page)', 'area', 5],
  ['highlights', 'more about it, one per line: heading | description (or section | heading | description)', 'lines', 6],
  ['tools', 'tools, comma separated', 'csv'],
  ['role', 'role, comma separated', 'csv'],
  ['links', 'links, one per line: label | https://...', 'links', 3],
  ['poster', 'screen artwork', 'poster'],
  ['key', 'web address (#key), lowercase-with-dashes', 'key'],
];

function toText(type, v) {
  if (type === 'lines') return (v || []).map((x) => (typeof x === 'string' ? x : [x.group, x.title, x.text].filter((y) => y !== undefined).join(' | '))).join('\n');
  if (type === 'csv') return (v || []).join(', ');
  if (type === 'links') return (v || []).map((l) => `${l.label} | ${l.href}`).join('\n');
  return v ?? '';
}
function fromText(type, s) {
  if (type === 'lines') {
    return s.split('\n').map((x) => x.trim()).filter(Boolean).map((line) => {
      const parts = line.split(' | ').map((y) => y.trim());
      if (parts.length >= 3) return { group: parts[0], title: parts[1], text: parts.slice(2).join(' | ') };
      return parts.length === 2 ? { title: parts[0], text: parts[1] } : line;
    });
  }
  if (type === 'csv') return s.split(',').map((x) => x.trim()).filter(Boolean);
  if (type === 'links') {
    return s.split('\n').map((x) => x.trim()).filter(Boolean).map((line) => {
      const [label, href] = line.includes('|') ? line.split('|').map((x) => x.trim()) : [line, line];
      return { label: label || href, href };
    });
  }
  return s;
}

export function createDetail({ content, posterKeys, poster, edit, onOpen, onClose, onGo, onChange }) {
  const P = content.work;
  const root = document.documentElement;
  const el = $('#detail');
  const view = $('.detail__view', el), form = $('.detail__form', el);
  const closeBtn = $('[data-detail-close]', el);
  const num = $('.detail__num', el), cat = $('.detail__cat', el), count = $('.detail__count', el);
  const title = $('.detail__title', el), sub = $('.detail__sub', el), meta = $('.detail__meta', el);
  const desc = $('.detail__desc', el), summary = $('.detail__summary', el), list = $('.detail__list', el), tools = $('.detail__tools', el);
  const role = $('.detail__role', el), links = $('.detail__links', el);
  const sumBlock = $('[data-block="summary"]', el), hlBlock = $('[data-block="highlights"]', el), toolBlock = $('[data-block="tools"]', el);
  const gallery = $('.detail__gallery', el), track = $('.detail__track', el), thumbs = $('.detail__thumbs', el), cap = $('.detail__cap', el);
  const prevPic = $('.detail__arrow--prev', el), nextPic = $('.detail__arrow--next', el);
  const more = $('.detail__more', el), sheet = $('.detail__sheet', el), infoBar = $('.detail__bar', el);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = -1, open = false, lastFocus = null, dirty = false, hideTimer = 0;

  const pad = (i) => String(i + 1).padStart(2, '0');

  // ---------- the strip ----------
  // One continuous strip runs through every project: each one's screen artwork first (the picture on
  // the screen the camera just dove into), then its pictures, videos and frame sequences from
  // content.json ("media"). The strip is wrapped round a wide drum and loops, so there are always
  // slides at both sides, and sliding along it runs straight on from one project into the next; the
  // project, info and role along the bottom follow whichever slide is in front. Drag, swipe or scroll
  // sideways, the arrow keys, a side slide or a thumbnail move along it.
  const strip = [], byProj = [];
  let pos = 0, target = 0, front = -1, raf = 0, last = 0, built = false, quiet = false;
  let drag = null; // { id, x, pos, moved, t, v, last }
  let G = null;    // the drum's measurements, from geom()

  const mod = (a, n) => ((a % n) + n) % n;
  const rel = (i, x) => mod(i - x + strip.length / 2, strip.length) - strip.length / 2; // signed distance round the loop

  function geom() {
    const r = gallery.getBoundingClientRect();
    const mobile = innerWidth < 768;
    const w = Math.max(160, Math.min(r.width * (mobile ? 0.78 : 0.44), r.height * 0.9 * 16 / 9));
    const gap = Math.round(Math.max(8, w * 0.05));
    const pitch = w + gap;                  // along the drum, from one slide's middle to the next
    const R = pitch / (mobile ? 0.2 : 0.15); // drum radius: about 9 degrees per slide on a desktop
    const a = pitch / R;
    const persp = Math.round(Math.max(900, w * 2.6));
    const px = (R * Math.sin(a) * persp) / (persp + R - R * Math.cos(a)); // on-screen distance to the next slide
    return { w, h: w * 9 / 16, gap, R, a, chord: 2 * R * Math.sin(a / 2), persp, px };
  }

  function shell(cls) {
    const s = document.createElement('div');
    s.className = `detail__slide ${cls}`.trim();
    const pic = Object.assign(document.createElement('div'), { className: 'detail__pic' });
    s.append(pic);
    return { s, pic };
  }

  function mediaSlide(m) {
    const { s, pic } = shell(m.type === 'frames' ? 'is-frames' : '');
    if (m.type === 'video') {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'none';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.setAttribute('aria-label', m.alt);
      if (reduceMotion) v.controls = true;
      pic.append(v);
      return { el: s, m, video: v, load() { if (m.poster) v.poster = m.poster; v.preload = 'metadata'; v.src = m.src; } };
    }
    const img = Object.assign(document.createElement('img'), { alt: m.alt, decoding: 'async', draggable: false });
    pic.append(img);
    if (m.type !== 'frames') return { el: s, m, load() { img.src = m.src; } };
    // a frame sequence: drag across the picture (or the slider under it) to move through time
    const bar = document.createElement('div');
    bar.className = 'detail__scrub';
    const range = Object.assign(document.createElement('input'), { type: 'range', min: '0', max: String(m.frames.length - 1), step: '1', value: '0', className: 'detail__range' });
    range.setAttribute('aria-label', 'time');
    const lab = Object.assign(document.createElement('span'), { className: 'detail__frame-label' });
    bar.append(range, lab);
    pic.append(bar);
    const slide = { el: s, m, img, range, lab };
    slide.setFrame = (k) => {
      k = Math.max(0, Math.min(m.frames.length - 1, k | 0));
      range.value = String(k);
      img.src = m.frames[k].src;
      lab.textContent = m.frames[k].label || `${k + 1} / ${m.frames.length}`;
      range.setAttribute('aria-valuetext', lab.textContent);
    };
    slide.load = () => { m.frames.forEach((f) => { new Image().src = f.src; }); slide.setFrame(0); };
    range.addEventListener('input', () => slide.setFrame(+range.value));
    const at = (e) => { const r = img.getBoundingClientRect(); return Math.round(((e.clientX - r.left) / r.width) * (m.frames.length - 1)); };
    let scrubbing = null;
    img.addEventListener('pointerdown', (e) => {
      if (strip[front] !== slide) return;
      e.stopPropagation();
      scrubbing = e.pointerId;
      img.setPointerCapture(e.pointerId);
      slide.setFrame(at(e));
    });
    img.addEventListener('pointermove', (e) => { if (scrubbing === e.pointerId) slide.setFrame(at(e)); });
    const end = () => { scrubbing = null; };
    img.addEventListener('pointerup', end);
    img.addEventListener('pointercancel', end);
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    return slide;
  }

  // the screen artwork, drawn live at the slide's 16:9 (the posters lay themselves out to the width)
  function posterSlide(p) {
    const { s, pic } = shell('detail__slide--poster');
    const H = poster.h, W = Math.round(H * 16 / 9);
    const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', `${p.title}: the project's screen artwork`);
    pic.append(c);
    const draw = poster.draw(p);
    const ctx = c.getContext('2d');
    const paint = (t) => draw(ctx, W, H, t);
    return { el: s, m: { type: 'poster', alt: c.getAttribute('aria-label') }, canvas: c, paint, load() { paint(0); } };
  }

  function build() {
    built = true;
    strip.length = 0; byProj.length = 0;
    P.forEach((p, i) => {
      const items = [posterSlide(p), ...(p.media || []).map(mediaSlide)];
      byProj[i] = [];
      items.forEach((s, k) => {
        Object.assign(s, { p: i, k, loaded: false });
        s.el.setAttribute('role', 'group');
        s.el.setAttribute('aria-roledescription', 'slide');
        s.el.setAttribute('aria-label', `${p.title}, ${k + 1} of ${items.length}`);
        byProj[i].push(strip.length);
        strip.push(s);
      });
    });
    track.replaceChildren(...strip.map((s) => s.el));
  }
  const ensure = (s) => { if (!s.loaded) { s.loaded = true; s.load(); } };

  // place every slide on the drum; returns true while artwork in view is animating
  function layout(now) {
    G = geom();
    gallery.style.perspective = `${G.persp}px`;
    track.style.setProperty('--gap', `${G.gap / 2}px`);
    let live = false;
    strip.forEach((s, i) => {
      const d = rel(i, pos), a = Math.abs(d);
      if (a < 3.6) ensure(s);
      if (a > 2.6) { s.el.style.visibility = 'hidden'; return; }
      s.el.style.visibility = '';
      s.el.style.width = `${G.chord + 1}px`;
      s.el.style.height = `${G.h}px`;
      s.el.style.transform = `translate(-50%, -50%) translateZ(${-G.R}px) rotateY(${d * G.a}rad) translateZ(${G.R}px)`;
      s.el.style.setProperty('--dim', (Math.min(a, 2) * 0.14).toFixed(3));
      if (s.paint && a < 1.6 && !reduceMotion) { s.paint(now / 1000); live = true; }
    });
    return live;
  }

  function tick(now) {
    raf = 0;
    if (!open || !strip.length) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    if (!drag) pos += (target - pos) * (1 - Math.exp(-dt * 9));
    if (Math.abs(target - pos) < 0.0005) pos = target;
    if (!drag && pos === target && Math.abs(pos) > strip.length * 4) { const k = Math.round(pos / strip.length) * strip.length; pos -= k; target -= k; }
    const live = layout(now);
    if (drag || pos !== target || live) raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf && open) { last = 0; raf = requestAnimationFrame(tick); } };

  // the slide nearest the target is in front: it plays, it is the one screen readers see, and its
  // project fills the bar along the bottom
  function syncFront() {
    if (!strip.length) return;
    const f = mod(Math.round(target), strip.length);
    if (f === front) return;
    front = f;
    strip.forEach((s, i) => {
      const on = i === f;
      s.el.setAttribute('aria-hidden', String(!on));
      s.el.classList.toggle('is-front', on);
      if (s.video) { if (on && !reduceMotion) { ensure(s); s.video.play().catch(() => {}); } else s.video.pause(); }
      s.el.querySelectorAll('input').forEach((x) => { x.tabIndex = on ? 0 : -1; });
    });
    const s = strip[f];
    cap.textContent = s.m.caption || '';
    cap.hidden = !s.m.caption;
    if (s.p !== cur) setProject(s.p);
    [...thumbs.children].forEach((b, j) => b.setAttribute('aria-selected', String(j === s.k)));
  }
  function goSlide(g, instant = false) {
    if (!strip.length) return;
    const base = Math.round(target);
    target = base + rel(g, base);
    if (instant) pos = target;
    syncFront();
    kick();
  }
  const moveBy = (k) => { target = Math.round(target) + k; syncFront(); kick(); };

  function stopMedia() { strip.forEach((s) => s.video?.pause()); }

  function setProject(i) {
    cur = i;
    header(i);
    fillText(i);
    const ids = byProj[i];
    thumbs.hidden = ids.length < 2;
    thumbs.replaceChildren(...ids.map((g, j) => {
      const s = strip[g];
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'detail__thumb' });
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', `picture ${j + 1} of ${ids.length}: ${s.m.alt}`);
      if (s.canvas) {
        ensure(s);
        const c = Object.assign(document.createElement('canvas'), { width: 160, height: 90 });
        c.getContext('2d').drawImage(s.canvas, 0, 0, c.width, c.height);
        b.append(c);
      } else {
        b.append(Object.assign(document.createElement('img'), { src: s.m.poster || s.m.src, alt: '', loading: 'lazy', decoding: 'async' }));
      }
      const tag = s.m.type === 'frames' ? 'drag' : s.m.type === 'video' ? 'video' : '';
      if (tag) b.append(Object.assign(document.createElement('span'), { className: 'detail__thumb-tag', textContent: tag }));
      b.addEventListener('click', () => goSlide(g));
      return b;
    }));
    if (quiet) return;
    // the strip ran on into another project: keep the room, the address and the bar with it
    onGo(i);
    onOpen(i);
    if (!reduceMotion) infoBar.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
  }

  // dragging the strip (a frame sequence in front scrubs instead: see mediaSlide)
  gallery.addEventListener('pointerdown', (e) => {
    if (!strip.length || e.button > 0 || e.target.closest('button, input')) return;
    drag = { id: e.pointerId, x: e.clientX, pos, moved: 0, t: performance.now(), v: 0, last: e.clientX };
    gallery.setPointerCapture(e.pointerId);
    kick();
  });
  gallery.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const now = performance.now();
    drag.v = 0.8 * drag.v + 0.2 * ((e.clientX - drag.last) / Math.max(1, now - drag.t));
    drag.t = now; drag.last = e.clientX;
    drag.moved = Math.max(drag.moved, Math.abs(e.clientX - drag.x));
    pos = target = drag.pos - (e.clientX - drag.x) / (G?.px || 400);
    syncFront();
    kick();
  });
  function endDrag(e) {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag;
    drag = null;
    if (d.moved < 6) {
      // a click: on a side slide it brings that slide to the front
      const hit = strip.findIndex((s) => s.el.contains(document.elementFromPoint(e.clientX, e.clientY)));
      goSlide(hit >= 0 ? hit : front);
      return;
    }
    target = Math.round(pos - (d.v * 180) / (G?.px || 400));
    syncFront();
    kick();
  }
  gallery.addEventListener('pointerup', endDrag);
  gallery.addEventListener('pointercancel', endDrag);
  // a sideways wheel or trackpad swipe glides along the strip and settles on the nearest slide
  // (main.js leaves sideways wheels to us and pulls out on vertical ones)
  let wheelSnap = 0;
  el.addEventListener('wheel', (e) => {
    if (!open || edit || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    target += e.deltaX / ((G?.px || 400) * 0.9);
    syncFront();
    kick();
    clearTimeout(wheelSnap);
    wheelSnap = setTimeout(() => { target = Math.round(target); syncFront(); kick(); }, 140);
  }, { passive: false });
  prevPic.addEventListener('click', () => moveBy(-1));
  nextPic.addEventListener('click', () => moveBy(1));
  addEventListener('resize', () => { if (open && !edit) layout(performance.now()); });

  // "> more about it" is just further down the page: scrolling down (or this button) brings it up
  const scrollView = (top) => view.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
  more.addEventListener('click', () => scrollView(sheet.offsetTop - 12));

  function header(i) {
    num.textContent = `[${pad(i)}]`;
    cat.textContent = P[i].category || '';
    count.textContent = `${pad(i)} / ${pad(P.length - 1)}`;
  }

  function fillText(i) {
    const p = P[i];
    title.textContent = p.title;
    sub.textContent = p.subtitle || '';
    sub.hidden = !p.subtitle;
    meta.textContent = [p.when, p.where].filter(Boolean).join('  /  ');
    meta.hidden = !meta.textContent;
    desc.textContent = p.desc || p.summary || '';
    summary.textContent = p.summary || '';
    sumBlock.hidden = !p.summary;
    // each piece of work: a numbered heading and a sentence or two (plain text items get just the text),
    // under a section heading where the entry groups them; numbers start again in each section
    const rows = [];
    let group = null, k = 0;
    for (const h of p.highlights || []) {
      const g = typeof h === 'string' ? '' : h.group || '';
      if (g && g !== group) {
        rows.push(Object.assign(document.createElement('li'), { className: 'detail__group', textContent: g }));
        k = 0;
      }
      group = g;
      const li = document.createElement('li');
      li.className = 'detail__item';
      if (typeof h !== 'string' && h.title) {
        const t = Object.assign(document.createElement('h4'), { className: 'detail__item-t' });
        t.append(Object.assign(document.createElement('span'), { className: 'detail__item-n', textContent: pad(k) }), ` ${h.title}`);
        li.append(t);
      }
      k++;
      li.append(Object.assign(document.createElement('p'), { textContent: typeof h === 'string' ? h : h.text }));
      rows.push(li);
    }
    list.replaceChildren(...rows);
    hlBlock.hidden = !(p.highlights || []).length;
    tools.replaceChildren(...(p.tools || []).map((h) => Object.assign(document.createElement('li'), { textContent: h })));
    toolBlock.hidden = !(p.tools || []).length;
    more.hidden = !(p.summary || (p.highlights || []).length || (p.tools || []).length);
    sheet.hidden = more.hidden;
    role.textContent = (p.role || []).join(', ');
    links.replaceChildren(...(p.links || []).map((l) => {
      const a = document.createElement('a');
      a.href = l.href; a.textContent = `> ${l.label}`;
      if (/^https:/.test(l.href)) { a.target = '_blank'; a.rel = 'noopener'; }
      return a;
    }));
    links.hidden = !(p.links || []).length;
  }

  function fillForm(i) {
    const p = P[i];
    title.textContent = p.title;
    sub.hidden = true; meta.hidden = true;
    form.replaceChildren();
    for (const [name, label, type, rows] of FIELDS) {
      const id = `f-${name}`;
      const wrap = document.createElement('div');
      wrap.className = 'field';
      const lab = Object.assign(document.createElement('label'), { htmlFor: id, textContent: label });
      let input;
      if (type === 'area' || type === 'lines' || type === 'links') {
        input = document.createElement('textarea');
        input.rows = rows || 3;
      } else if (type === 'poster') {
        input = document.createElement('select');
        for (const k of ['', ...posterKeys]) input.append(new Option(k || '(title card)', k));
      } else {
        input = document.createElement('input');
        input.type = 'text';
        if (type === 'category') {
          input.setAttribute('list', 'f-categories');
          const dl = document.createElement('datalist');
          dl.id = 'f-categories';
          CATEGORIES.forEach((c) => dl.append(new Option(c)));
          wrap.append(dl);
        }
      }
      input.id = id; input.name = name;
      input.value = toText(type, p[name]);
      input.addEventListener('input', () => {
        if (type === 'key') {
          const v = input.value.trim();
          const clash = P.some((q, k) => k !== i && q.key === v);
          const ok = KEY_RE.test(v) && !clash;
          input.setAttribute('aria-invalid', String(!ok));
          if (!ok) return;
          p.key = v;
        } else {
          p[name] = fromText(type, input.value);
        }
        if (name === 'title') title.textContent = p.title;
        setDirty(true);
        onChange(i);
      });
      wrap.prepend(lab);
      wrap.append(input);
      form.append(wrap);
    }
    const row = document.createElement('div');
    row.className = 'field field--actions';
    const btn = (txt, fn, cls = '') => Object.assign(document.createElement('button'), { type: 'button', textContent: txt, className: cls, onclick: fn });
    row.append(
      btn('move up', () => move(i, -1)),
      btn('move down', () => move(i, 1)),
      btn('delete', () => remove(i), 'danger'),
      btn('save', () => save(), 'primary'),
    );
    form.append(row);
  }


  function show(i) {
    view.hidden = !!edit;
    form.hidden = !edit;
    if (edit) { cur = i; header(i); fillForm(i); form.scrollTop = 0; return; }
    if (!built) build();
    view.scrollTop = 0;
    front = -1; cur = -1;
    quiet = true;
    goSlide(byProj[i][0], true);
    quiet = false;
  }

  function openAt(i) {
    clearTimeout(hideTimer);
    show(i);
    if (!open) {
      open = true;
      lastFocus = document.activeElement;
      el.hidden = false;
      root.classList.add('detail-open');
      requestAnimationFrame(() => el.classList.add('is-open'));
      closeBtn.focus({ preventScroll: true });
    }
    if (!edit) layout(performance.now());
    kick();
    onOpen(i);
  }

  function close() {
    if (!open) return;
    open = false;
    stopMedia();
    cancelAnimationFrame(raf); raf = 0;
    el.classList.remove('is-open');
    root.classList.remove('detail-open');
    hideTimer = setTimeout(() => { el.hidden = true; }, 350);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    onClose(cur);
  }

  // "< prev" / "next >": on to the first slide of the project before or after (the editor's form
  // just switches project)
  function step(d) {
    const j = mod(cur + d, P.length);
    if (!edit) { goSlide(byProj[j][0]); return; }
    onGo(j);
    show(j);
    onOpen(j);
  }

  closeBtn.addEventListener('click', close);
  $('[data-detail-prev]', el).addEventListener('click', () => step(-1));
  $('[data-detail-next]', el).addEventListener('click', () => step(1));
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  document.addEventListener('keydown', (e) => {
    if (!open) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if (e.key === 'Escape') {
      e.preventDefault();
      // scrolled down into the details: back up to the strip first, then out
      if (!edit && view.scrollTop > 8) { scrollView(0); closeBtn.focus({ preventScroll: true }); } else close();
      return;
    }
    if (!typing && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      const d = e.key === 'ArrowRight' ? 1 : -1;
      if (edit) step(d); else moveBy(d);
      return;
    }
    if (e.key === 'Tab') {
      const items = [...el.querySelectorAll('a[href], button, input, textarea, select')].filter((x) => !x.closest('[hidden], [aria-hidden="true"]') && !x.disabled);
      if (!items.length) return;
      const k = items.indexOf(document.activeElement);
      if (e.shiftKey && k <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
      else if (!e.shiftKey && k === items.length - 1) { e.preventDefault(); items[0].focus(); }
    }
  });

  // ---------- editor ----------
  const bar = $('.editbar');
  const barState = $('.editbar__state');
  function setState(msg) { if (barState) barState.textContent = msg; }
  function setDirty(v) { dirty = v; root.classList.toggle('edit-dirty', v); if (v) setState('unsaved changes'); }
  const payload = () => JSON.stringify({ ...content, work: P }, null, 2) + '\n';

  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([payload()], { type: 'application/json' }));
    a.download = 'content.json';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function save(after) {
    setState('saving');
    let res, out = {};
    try {
      res = await fetch('/__save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload() });
      out = await res.json().catch(() => ({}));
    } catch (_) { res = null; }
    if (res && res.ok && out.ok) {
      dirty = false;
      setState('saved. reloading');
      const key = after ?? (cur >= 0 ? P[cur]?.key : null);
      history.replaceState(null, '', `${location.pathname}?edit${key ? `#${key}/details` : '#work'}`);
      setTimeout(() => location.reload(), 300);
      return;
    }
    if (!res || [404, 405, 501].includes(res.status)) {
      download();
      setState('no save server here: content.json downloaded. Put it in the site folder and run tools/build.py');
      return;
    }
    setState(`not saved: ${out.error || `HTTP ${res.status}`}`);
  }

  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= P.length) return;
    [P[i], P[j]] = [P[j], P[i]];
    save(P[j].key);
  }
  function remove(i) {
    if (!confirm(`Delete "${P[i].title}"? This removes it from content.json when you save.`)) return;
    P.splice(i, 1);
    save('');
  }
  function add() {
    let n = 1;
    while (P.some((p) => p.key === `new-project-${n}`)) n++;
    P.push({
      key: `new-project-${n}`, category: 'engineering', title: 'New project', subtitle: '', when: '', where: '',
      desc: 'One or two lines about it.', role: [], summary: '', highlights: [], tools: [], links: [], poster: '', schemaType: 'CreativeWork',
    });
    save(`new-project-${n}`);
  }

  if (edit && bar) {
    bar.hidden = false;
    root.classList.add('is-edit');
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-edit]');
      if (!b) return;
      const act = b.dataset.edit;
      if (act === 'save') { e.preventDefault(); save(); }
      if (act === 'add') { e.preventDefault(); add(); }
      if (act === 'download') { e.preventDefault(); download(); setState('content.json downloaded'); }
      if (act === 'exit' && dirty && !confirm('Leave without saving?')) e.preventDefault();
    });
    addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
    setState('click a screen to edit it');
  }

  return {
    open: openAt,
    close,
    get isOpen() { return open; },
    get index() { return cur; },
  };
}
