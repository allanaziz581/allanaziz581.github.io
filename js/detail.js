// Project detail view (opened by clicking the front screen) and the in-page editor (?edit).
//
// View mode fills a dialog with the entry's summary, highlights, tools, role and links.
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

export function createDetail({ content, posterKeys, edit, onOpen, onClose, onGo, onChange }) {
  const P = content.work;
  const root = document.documentElement;
  const el = $('#detail');
  const view = $('.detail__view', el), form = $('.detail__form', el);
  const closeBtn = $('[data-detail-close]', el);
  const num = $('.detail__num', el), cat = $('.detail__cat', el), count = $('.detail__count', el);
  const title = $('.detail__title', el), sub = $('.detail__sub', el), meta = $('.detail__meta', el);
  const summary = $('.detail__summary', el), list = $('.detail__list', el), tools = $('.detail__tools', el);
  const role = $('.detail__role', el), links = $('.detail__links', el);
  const hlBlock = $('[data-block="highlights"]', el), toolBlock = $('[data-block="tools"]', el), roleBlock = $('[data-block="role"]', el);
  const mediaBlock = $('[data-block="media"]', el), stage = $('.detail__stage', el), cap = $('.detail__cap', el), thumbs = $('.detail__thumbs', el);
  const scrub = $('.detail__scrub', el), range = $('.detail__range', el), frameLabel = $('.detail__frame-label', el);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = -1, open = false, lastFocus = null, dirty = false, hideTimer = 0, frames = null, frameImg = null;

  const pad = (i) => String(i + 1).padStart(2, '0');

  // ---------- pictures: a big slide, a time slider for a frame sequence, thumbnails ----------
  function stopMedia() { stage.querySelectorAll('video').forEach((v) => v.pause()); }

  function setFrame(k) {
    if (!frames) return;
    k = Math.max(0, Math.min(frames.length - 1, k | 0));
    range.value = String(k);
    frameImg.src = frames[k].src;
    frameLabel.textContent = frames[k].label || `${k + 1} / ${frames.length}`;
    range.setAttribute('aria-valuetext', frameLabel.textContent);
  }

  function showSlide(items, k) {
    stopMedia();
    const m = items[k];
    frames = null;
    stage.classList.toggle('is-frames', m.type === 'frames');
    if (m.type === 'video') {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'metadata';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      if (m.poster) v.poster = m.poster;
      v.setAttribute('aria-label', m.alt);
      if (reduceMotion) v.controls = true; else v.autoplay = true;
      v.src = m.src;
      stage.replaceChildren(v);
    } else {
      frameImg = Object.assign(document.createElement('img'), { alt: m.alt, decoding: 'async', draggable: false });
      stage.replaceChildren(frameImg);
      if (m.type === 'frames') {
        frames = m.frames;
        frames.forEach((f) => { new Image().src = f.src; }); // warm the cache so dragging never waits
        range.max = String(frames.length - 1);
        setFrame(0);
      } else {
        frameImg.src = m.src;
      }
    }
    scrub.hidden = m.type !== 'frames';
    cap.textContent = m.caption || '';
    cap.hidden = !m.caption;
    [...thumbs.children].forEach((b, j) => b.setAttribute('aria-selected', String(j === k)));
  }

  function fillMedia(p) {
    const items = p.media || [];
    mediaBlock.hidden = !items.length;
    stopMedia();
    stage.replaceChildren();
    frames = null;
    thumbs.replaceChildren(...items.map((m, j) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'detail__thumb' });
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', `${j + 1} of ${items.length}: ${m.alt}`);
      b.append(Object.assign(document.createElement('img'), { src: m.poster || m.src, alt: '', loading: 'lazy', decoding: 'async' }));
      const tag = m.type === 'frames' ? 'drag' : m.type === 'video' ? 'video' : '';
      if (tag) b.append(Object.assign(document.createElement('span'), { className: 'detail__thumb-tag', textContent: tag }));
      b.addEventListener('click', () => showSlide(items, j));
      return b;
    }));
    thumbs.hidden = items.length < 2;
    if (items.length) showSlide(items, 0);
  }

  range.addEventListener('input', () => setFrame(+range.value));
  // dragging across the picture scrubs the frames too (mouse or finger; vertical swipes still scroll)
  let dragX = null;
  stage.addEventListener('pointerdown', (e) => {
    if (!frames) return;
    dragX = e.clientX;
    stage.setPointerCapture(e.pointerId);
    const r = stage.getBoundingClientRect();
    setFrame(Math.round(((e.clientX - r.left) / r.width) * (frames.length - 1)));
  });
  stage.addEventListener('pointermove', (e) => {
    if (!frames || dragX === null) return;
    const r = stage.getBoundingClientRect();
    setFrame(Math.round(((e.clientX - r.left) / r.width) * (frames.length - 1)));
  });
  const endDrag = () => { dragX = null; };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  function fillView(i) {
    const p = P[i];
    fillMedia(p);
    title.textContent = p.title;
    sub.textContent = p.subtitle || '';
    sub.hidden = !p.subtitle;
    meta.textContent = [p.when, p.where].filter(Boolean).join('  /  ');
    meta.hidden = !meta.textContent;
    summary.textContent = p.summary || p.desc || '';
    list.replaceChildren(...(p.highlights || []).map((h) => Object.assign(document.createElement('li'), { textContent: h })));
    hlBlock.hidden = !(p.highlights || []).length;
    tools.replaceChildren(...(p.tools || []).map((h) => Object.assign(document.createElement('li'), { textContent: h })));
    toolBlock.hidden = !(p.tools || []).length;
    role.textContent = (p.role || []).join(', ');
    roleBlock.hidden = !(p.role || []).length;
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
    cur = i;
    num.textContent = `[${pad(i)}]`;
    cat.textContent = P[i].category || '';
    count.textContent = `${pad(i)} / ${pad(P.length - 1)}`;
    view.hidden = !!edit;
    form.hidden = !edit;
    if (edit) fillForm(i); else fillView(i);
    $('.detail__inner', el).scrollTop = 0;
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
    onOpen(i);
  }

  function close() {
    if (!open) return;
    open = false;
    stopMedia();
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
  }

  closeBtn.addEventListener('click', close);
  $('[data-detail-prev]', el).addEventListener('click', () => step(-1));
  $('[data-detail-next]', el).addEventListener('click', () => step(1));
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  document.addEventListener('keydown', (e) => {
    if (!open) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (!typing && e.key === 'ArrowRight') { e.preventDefault(); step(1); return; }
    if (!typing && e.key === 'ArrowLeft') { e.preventDefault(); step(-1); return; }
    if (e.key === 'Tab') {
      const items = [...el.querySelectorAll('a[href], button, input, textarea, select')].filter((x) => !x.closest('[hidden]'));
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
