/* CODEWORM — Reading guide (opt-in).
   Underlines the sentence you are most likely reading. No camera: it infers the
   position from where you scroll, and from the pointer or a touch if you have
   moved it recently. Nothing leaves the device and nothing is stored except
   the on/off choice.

   How it decides
   1. Skimming (fast scroll) shows nothing.
   2. If the pointer or a touch moved in the last 2.5 s, it wins.
   3. Otherwise the "focal line", about 40% down the viewport, where people who
      scroll tend to read.
   4. An active text selection always wins: the guide steps aside.
   It draws with the CSS Custom Highlight API, so the page's markup is never
   changed and nothing reflows. Browsers without it never see the toggle. */
(() => {
  'use strict';
  if (!('highlights' in CSS) || typeof Highlight === 'undefined') return;
  const btn = document.querySelector('.reading-toggle');
  const main = document.querySelector('main');
  if (!btn || !main) return;

  const KEY = 'cw-reading';
  const SKIM = 0.9;          // px per ms; faster than ~900 px/s counts as skimming
  const POINTER_MS = 2500;   // how long a pointer/touch signal stays in charge
  const REACH = 70;          // how far (px) a block may sit from the probe line
  const STEP = 160;          // ms between updates while the page is moving
  const BLOCKS = 'p, li, dd, .statement, .definition';

  const focal = () => innerHeight * (innerWidth < 700 ? 0.42 : 0.4);

  // Candidate text: leaf blocks of real prose, not labels or decoration
  const blocks = [...main.querySelectorAll(BLOCKS)].filter((el) =>
    el.textContent.trim().length >= 25 &&
    !el.querySelector(BLOCKS) &&
    !el.closest('[aria-hidden="true"], .veil, button, .tabs__list'));

  /* ---------- state ---------- */
  let on = false;
  try { on = localStorage.getItem(KEY) === '1'; } catch (e) { /* private mode */ }
  let timer = null;
  let lastY = window.scrollY;
  let lastT = performance.now();
  let current = null;                       // { range, name }
  const ptr = { x: 0, y: 0, t: 0 };

  const status = document.createElement('div');
  status.className = 'vh';
  status.setAttribute('role', 'status');
  document.body.append(status);

  /* ---------- sentences of a block, as DOM Ranges ---------- */
  function sentenceRanges(block) {
    const nodes = [];
    let text = '';
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      nodes.push({ n, start: text.length });
      text += n.nodeValue;
    }
    const at = (off) => {
      for (let i = nodes.length - 1; i >= 0; i--) if (off >= nodes[i].start) return [nodes[i].n, Math.min(off - nodes[i].start, nodes[i].n.nodeValue.length)];
      return [nodes[0].n, 0];
    };
    const out = [];
    const re = /[^.!?…]+(?:[.!?…]+["”’')\]]*|$)/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const raw = m[0];
      const lead = raw.length - raw.trimStart().length;
      const trimmed = raw.trim();
      if (trimmed.length < 2) continue;
      const r = document.createRange();
      const [sn, so] = at(m.index + lead);
      const [en, eo] = at(m.index + lead + trimmed.length);
      r.setStart(sn, so);
      r.setEnd(en, eo);
      out.push(r);
    }
    return out;
  }

  const gap = (r, y) => (y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0);

  /* ---------- drawing ---------- */
  function clear() {
    if (!current) return;
    CSS.highlights.delete('cw-read-light');
    CSS.highlights.delete('cw-read-dark');
    current = null;
  }
  const same = (a, b) => a.startContainer === b.startContainer && a.startOffset === b.startOffset &&
                         a.endContainer === b.endContainer && a.endOffset === b.endOffset;
  function show(block, range) {
    if (current && same(current.range, range)) return;
    // pick the palette from the text colour actually in force here (handles dark panels inside light sections)
    const c = getComputedStyle(block).color.match(/[\d.]+/g).map(Number);
    const light = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 > 0.5;
    const name = light ? 'cw-read-dark' : 'cw-read-light';
    CSS.highlights.delete('cw-read-light');
    CSS.highlights.delete('cw-read-dark');
    CSS.highlights.set(name, new Highlight(range));
    current = { range, name };
  }

  /* ---------- the decision ---------- */
  function run() {
    timer = null;
    if (!on) return;
    const now = performance.now();
    const y = window.scrollY;
    const v = Math.abs(y - lastY) / Math.max(1, now - lastT);
    lastY = y; lastT = now;
    if (v > SKIM) { clear(); timer = setTimeout(run, STEP); return; } // skimming: look again until it settles
    const sel = getSelection();
    if (sel && !sel.isCollapsed) { clear(); return; }               // the reader is selecting text

    const usePtr = ptr.t && now - ptr.t < POINTER_MS && ptr.y > 80; // ignore the header area
    const py = usePtr ? ptr.y : focal();
    const px = usePtr ? ptr.x : null;

    // 1. reads only: which block is closest to the probe line
    let best = null;
    let bestD = Infinity;
    for (const el of blocks) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.bottom < py - REACH || r.top > py + REACH) continue;
      const d = gap(r, py);
      if (d < bestD) { best = el; bestD = d; }
    }
    if (!best || bestD > REACH) { clear(); return; }

    // 2. which sentence of it
    let pick = null;
    let pickD = Infinity;
    for (const range of sentenceRanges(best)) {
      for (const r of range.getClientRects()) {
        const d = gap(r, py) + (px === null ? 0 : (px < r.left ? r.left - px : px > r.right ? px - r.right : 0) * 0.001);
        if (d < pickD) { pick = range; pickD = d; }
      }
    }
    if (!pick) { clear(); return; }
    show(best, pick);
  }

  function schedule() {
    if (!on || timer) return;
    timer = setTimeout(run, STEP);
  }

  /* ---------- signals ---------- */
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  document.addEventListener('selectionchange', schedule);
  const seen = (e) => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.t = performance.now(); schedule(); };
  addEventListener('pointermove', seen, { passive: true });
  addEventListener('pointerdown', seen, { passive: true });

  /* ---------- the toggle ---------- */
  btn.hidden = false;
  const apply = (announce) => {
    btn.setAttribute('aria-pressed', String(on));
    if (announce) status.textContent = on ? 'Reading guide on' : 'Reading guide off';
    if (on) { lastY = window.scrollY; lastT = performance.now(); run(); } else { clear(); }
  };
  btn.addEventListener('click', () => {
    on = !on;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* still works this visit */ }
    apply(true);
  });
  apply(false);
})();
