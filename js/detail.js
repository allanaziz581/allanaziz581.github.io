// Project detail view (opened by clicking the front screen) and the in-page editor (?edit).
//
// View mode is a full-screen gallery: a row of slides (the entry's pictures, videos and frame
// sequences, or its screen artwork), with project, info and role along the bottom and the summary,
// highlights and tools behind "> more about it".
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
  ['highlights', 'highlights, one per line', 'lines', 6],
  ['tools', 'tools, comma separated', 'csv'],
  ['role', 'role, comma separated', 'csv'],
  ['links', 'links, one per line: label | https://...', 'links', 3],
  ['poster', 'screen artwork', 'poster'],
  ['key', 'web address (#key), lowercase-with-dashes', 'key'],
];

function toText(type, v) {
  if (type === 'lines') return (v || []).join('\n');
  if (type === 'csv') return (v || []).join(', ');
  if (type === 'links') return (v || []).map((l) => `${l.label} | ${l.href}`).join('\n');
  return v ?? '';
}
function fromText(type, s) {
  if (type === 'lines') return s.split('\n').map((x) => x.trim()).filter(Boolean);
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
  const hlBlock = $('[data-block="highlights"]', el), toolBlock = $('[data-block="tools"]', el);
  const gallery = $('.detail__gallery', el), track = $('.detail__track', el), thumbs = $('.detail__thumbs', el), cap = $('.detail__cap', el);
  const prevPic = $('.detail__arrow--prev', el), nextPic = $('.detail__arrow--next', el);
  const more = $('.detail__more', el), sheet = $('.detail__sheet', el);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = -1, open = false, lastFocus = null, dirty = false, hideTimer = 0;

  const pad = (i) => String(i + 1).padStart(2, '0');

  // ---------- the slide gallery ----------
  // Every project gets a row of big slides: its pictures, videos and frame sequences from content.json
  // ("media"), or its screen artwork drawn live when it has none. The slide in front is flat and full
  // size; its neighbours lean in at the sides. Drag, swipe sideways, the arrow keys, the side slides or
  // the thumbnails move along the row; past either end the arrow keys move on to the next project.
  let slides = [], pos = 0, target = 0, raf = 0, last = 0;
  let drag = null; // { id, x, pos, moved, t, v }

  function slideSize() {
    const r = gallery.getBoundingClientRect();
    const w = Math.max(160, Math.min(r.width * (innerWidth < 768 ? 0.84 : 0.56), r.height * 16 / 9));
    return { w, step: w * 1.07 };
  }

  function mediaSlide(m) {
    const s = document.createElement('div');
    s.className = 'detail__slide';
    if (m.type === 'video') {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'metadata';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      if (m.poster) v.poster = m.poster;
      v.setAttribute('aria-label', m.alt);
      if (reduceMotion) v.controls = true;
      v.src = m.src;
      s.append(v);
      return { el: s, m, video: v };
    }
    const img = Object.assign(document.createElement('img'), { alt: m.alt, decoding: 'async', draggable: false, src: m.type === 'frames' ? m.frames[0].src : m.src });
    s.append(img);
    if (m.type !== 'frames') return { el: s, m };
    // a frame sequence: drag across the picture (or the slider under it) to move through time
    s.classList.add('is-frames');
    m.frames.forEach((f) => { new Image().src = f.src; });
    const bar = document.createElement('div');
    bar.className = 'detail__scrub';
    const range = Object.assign(document.createElement('input'), { type: 'range', min: '0', max: String(m.frames.length - 1), step: '1', value: '0', className: 'detail__range' });
    range.setAttribute('aria-label', 'time');
    const lab = Object.assign(document.createElement('span'), { className: 'detail__frame-label' });
    bar.append(range, lab);
    s.append(bar);
    const slide = { el: s, m, img, range, lab };
    slide.setFrame = (k) => {
      k = Math.max(0, Math.min(m.frames.length - 1, k | 0));
      range.value = String(k);
      img.src = m.frames[k].src;
      lab.textContent = m.frames[k].label || `${k + 1} / ${m.frames.length}`;
      range.setAttribute('aria-valuetext', lab.textContent);
    };
    slide.setFrame(0);
    range.addEventListener('input', () => slide.setFrame(+range.value));
    const at = (e) => { const r = img.getBoundingClientRect(); return Math.round(((e.clientX - r.left) / r.width) * (m.frames.length - 1)); };
    let scrubbing = null;
    img.addEventListener('pointerdown', (e) => {
      if (slides[target] !== slide) return;
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

  function posterSlide(p) {
    const s = document.createElement('div');
    s.className = 'detail__slide detail__slide--poster';
    const c = Object.assign(document.createElement('canvas'), { width: poster.w, height: poster.h });
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', `${p.title}: the project's screen artwork`);
    s.append(c);
    const draw = poster.draw(p);
    const ctx = c.getContext('2d');
    draw(ctx, c.width, c.height, 0);
    return { el: s, m: { type: 'poster', alt: c.getAttribute('aria-label') }, canvas: c, paint: (t) => draw(ctx, c.width, c.height, t) };
  }

  function layout(now) {
    const { w, step } = slideSize();
    const mobile = innerWidth < 768;
    slides.forEach((s, i) => {
      const d = i - pos, a = Math.abs(d);
      const x = d * step;
      const rot = Math.max(-1.6, Math.min(1.6, d)) * (mobile ? 8 : 13);
      const sc = 1 - Math.min(a, 2) * 0.05;
      s.el.style.width = `${w}px`;
      s.el.style.transform = `translate(-50%, -50%) translateX(${x}px) rotateY(${rot}deg) scale(${sc})`;
      s.el.style.opacity = String(a > 2.6 ? 0 : 1 - Math.min(a, 1) * 0.42);
      s.el.style.zIndex = String(100 - Math.round(a * 10));
      s.el.style.visibility = a > 2.6 ? 'hidden' : '';
    });
    const front = slides[target];
    if (front?.paint && !reduceMotion) front.paint(now / 1000);
  }

  function tick(now) {
    raf = 0;
    if (!open || !slides.length) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    if (!drag) pos += (target - pos) * (1 - Math.exp(-dt * 11));
    if (Math.abs(target - pos) < 0.0005) pos = target;
    layout(now);
    const busy = drag || pos !== target || slides[target]?.paint;
    if (busy) raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf && open) { last = 0; raf = requestAnimationFrame(tick); } };

  function goSlide(k, instant = false) {
    if (!slides.length) return;
    k = Math.max(0, Math.min(slides.length - 1, k));
    target = k;
    if (instant) pos = k;
    slides.forEach((s, i) => {
      const on = i === k;
      s.el.setAttribute('aria-hidden', String(!on));
      s.el.classList.toggle('is-front', on);
      if (s.video) { if (on && !reduceMotion) s.video.play().catch(() => {}); else s.video.pause(); }
      s.el.querySelectorAll('input').forEach((x) => { x.tabIndex = on ? 0 : -1; });
    });
    const m = slides[k].m;
    cap.textContent = m.caption || '';
    cap.hidden = !m.caption;
    [...thumbs.children].forEach((b, j) => b.setAttribute('aria-selected', String(j === k)));
    prevPic.disabled = k === 0;
    nextPic.disabled = k === slides.length - 1;
    kick();
  }

  function stopMedia() { slides.forEach((s) => s.video?.pause()); }

  function fillGallery(p) {
    stopMedia();
    const items = p.media || [];
    slides = items.length ? items.map(mediaSlide) : [posterSlide(p)];
    track.replaceChildren(...slides.map((s, i) => {
      s.el.setAttribute('role', 'group');
      s.el.setAttribute('aria-roledescription', 'slide');
      s.el.setAttribute('aria-label', `${i + 1} of ${slides.length}`);
      return s.el;
    }));
    thumbs.replaceChildren(...slides.map((s, j) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'detail__thumb' });
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', `picture ${j + 1} of ${slides.length}: ${s.m.alt}`);
      if (s.canvas) {
        const c = Object.assign(document.createElement('canvas'), { width: 160, height: Math.round(160 * poster.h / poster.w) });
        c.getContext('2d').drawImage(s.canvas, 0, 0, c.width, c.height);
        b.append(c);
      } else {
        b.append(Object.assign(document.createElement('img'), { src: s.m.poster || s.m.src, alt: '', loading: 'lazy', decoding: 'async' }));
      }
      const tag = s.m.type === 'frames' ? 'drag' : s.m.type === 'video' ? 'video' : '';
      if (tag) b.append(Object.assign(document.createElement('span'), { className: 'detail__thumb-tag', textContent: tag }));
      b.addEventListener('click', () => goSlide(j));
      return b;
    }));
    gallery.classList.toggle('is-single', slides.length < 2);
    goSlide(0, true);
    layout(performance.now());
  }

  // dragging the row (a frame sequence in front scrubs instead: see mediaSlide)
  gallery.addEventListener('pointerdown', (e) => {
    if (!slides.length || e.button > 0 || e.target.closest('button, input')) return;
    drag = { id: e.pointerId, x: e.clientX, pos, moved: 0, t: performance.now(), v: 0, last: e.clientX };
    gallery.setPointerCapture(e.pointerId);
    kick();
  });
  gallery.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const { step } = slideSize();
    const now = performance.now();
    drag.v = 0.8 * drag.v + 0.2 * ((e.clientX - drag.last) / Math.max(1, now - drag.t));
    drag.t = now; drag.last = e.clientX;
    drag.moved = Math.max(drag.moved, Math.abs(e.clientX - drag.x));
    pos = Math.max(-0.35, Math.min(slides.length - 0.65, drag.pos - (e.clientX - drag.x) / step));
    kick();
  });
  function endDrag(e) {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag;
    drag = null;
    if (d.moved < 6) {
      // a click: on a side slide it brings that slide to the front
      const hit = slides.findIndex((s) => s.el.contains(document.elementFromPoint(e.clientX, e.clientY)));
      goSlide(hit >= 0 ? hit : target);
      return;
    }
    const { step } = slideSize();
    goSlide(Math.round(pos - (d.v * 180) / step));
  }
  gallery.addEventListener('pointerup', endDrag);
  gallery.addEventListener('pointercancel', endDrag);
  // a sideways wheel or trackpad swipe moves along the row (main.js leaves sideways wheels to us)
  let wheelAcc = 0, wheelAt = 0;
  el.addEventListener('wheel', (e) => {
    if (!open || edit || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    const now = performance.now();
    if (now - wheelAt > 350) wheelAcc = 0;
    wheelAt = now;
    wheelAcc += e.deltaX;
    if (Math.abs(wheelAcc) > 70) { goSlide(target + Math.sign(wheelAcc)); wheelAcc = -Math.sign(wheelAcc) * 400; }
  }, { passive: false });
  prevPic.addEventListener('click', () => goSlide(target - 1));
  nextPic.addEventListener('click', () => goSlide(target + 1));
  addEventListener('resize', () => { if (open) { layout(performance.now()); } });

  function setSheet(on) {
    sheet.hidden = !on;
    more.setAttribute('aria-expanded', String(on));
    more.textContent = on ? '> less' : '> more about it';
    if (on) sheet.scrollTop = 0;
  }
  more.addEventListener('click', () => setSheet(sheet.hidden));

  function fillView(i) {
    const p = P[i];
    title.textContent = p.title;
    sub.textContent = p.subtitle || '';
    sub.hidden = !p.subtitle;
    meta.textContent = [p.when, p.where].filter(Boolean).join('  /  ');
    meta.hidden = !meta.textContent;
    desc.textContent = p.desc || p.summary || '';
    summary.textContent = p.summary || '';
    summary.hidden = !p.summary;
    list.replaceChildren(...(p.highlights || []).map((h) => Object.assign(document.createElement('li'), { textContent: h })));
    hlBlock.hidden = !(p.highlights || []).length;
    tools.replaceChildren(...(p.tools || []).map((h) => Object.assign(document.createElement('li'), { textContent: h })));
    toolBlock.hidden = !(p.tools || []).length;
    more.hidden = !(p.summary || (p.highlights || []).length || (p.tools || []).length);
    role.textContent = (p.role || []).join(', ');
    links.replaceChildren(...(p.links || []).map((l) => {
      const a = document.createElement('a');
      a.href = l.href; a.textContent = `> ${l.label}`;
      if (/^https:/.test(l.href)) { a.target = '_blank'; a.rel = 'noopener'; }
      return a;
    }));
    links.hidden = !(p.links || []).length;
    setSheet(false);
    fillGallery(p);
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
    cur = i;
    num.textContent = `[${pad(i)}]`;
    cat.textContent = P[i].category || '';
    count.textContent = `${pad(i)} / ${pad(P.length - 1)}`;
    view.hidden = !!edit;
    form.hidden = !edit;
    if (edit) { fillForm(i); form.scrollTop = 0; } else fillView(i);
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
    if (!edit) goSlide(target, true);
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

  function step(d) {
    const j = (cur + d + P.length) % P.length;
    onGo(j);
    show(j);
    onOpen(j);
    kick();
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
      if (!sheet.hidden) { setSheet(false); more.focus(); } else close();
      return;
    }
    if (!typing && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      const d = e.key === 'ArrowRight' ? 1 : -1;
      // along this project's slides first, then on to the next project
      if (!edit && target + d >= 0 && target + d < slides.length) goSlide(target + d); else step(d);
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
