/* CODEWORM — motion layer.
   Smooth scroll (Lenis), scroll reveals, word scrub, and the smoke veil.
   Pure enhancement: skipped entirely under prefers-reduced-motion, and every
   page reads correctly if this file never runs.

   Performance rules this file follows
   - Never read layout inside the frame loop: element positions are measured
     once (and on resize/load) and derived from the scroll offset afterwards.
   - WebGL canvases are created only when their section is near the viewport.
   - Ambient smoke redraws at 20 fps, and rests after a few seconds without scroll
     or pointer movement; writes are skipped when nothing changed. */
(() => {
  'use strict';
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const root = document.documentElement;
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const readY = () => window.scrollY || 0;

  let vh = innerHeight;
  let scrollY = readY();
  const frameFns = [];   // run every frame (smoke, lerps)
  const scrollFns = [];  // run when the scroll position changed
  let dirty = true;

  /* ---------- Geometry cache: measure in batches, never per frame ---------- */
  const geo = new Map(); // element -> { top (document coords), left, w, h }
  const measure = (el) => {
    const r = el.getBoundingClientRect();
    geo.set(el, { top: r.top + scrollY, left: r.left, w: r.width, h: r.height });
  };
  const track = (el) => {
    measure(el);
    return {
      top: () => geo.get(el).top - scrollY,   // viewport-relative top
      get: () => geo.get(el),
    };
  };
  const remeasureAll = () => { geo.forEach((_, el) => measure(el)); dirty = true; };
  let remeasureQueued = false;
  const queueRemeasure = () => {
    if (remeasureQueued) return;
    remeasureQueued = true;
    requestAnimationFrame(() => { remeasureQueued = false; vh = innerHeight; remeasureAll(); });
  };
  addEventListener('resize', queueRemeasure);
  addEventListener('load', () => { queueRemeasure(); setTimeout(queueRemeasure, 1600); }); // 1.6 s: after the reveals settle
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueRemeasure);
  if ('ResizeObserver' in window) new ResizeObserver(queueRemeasure).observe(document.body);

  /* ---------- Lenis smooth scroll ---------- */
  if (window.Lenis) {
    new window.Lenis({ lerp: 0.09, autoRaf: true, anchors: { offset: -84 } });
  }

  /* ---------- Scroll progress bar ---------- */
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.prepend(bar);
  scrollFns.push((y) => {
    const max = root.scrollHeight - vh;
    bar.style.setProperty('--sp', max > 0 ? clamp(y / max).toFixed(4) : '0');
  });

  /* ---------- Ring turns with the page ---------- */
  const ring = document.querySelector('.hero__mark');
  if (ring) scrollFns.push((y) => ring.style.setProperty('--sr', (y * 0.18).toFixed(1)));

  /* ---------- Reveal on enter (blur + rise, like emerging from smoke) ---------- */
  const REVEAL = [
    '.section-head > *', '.qgrid > .qcard', '.cells > li', '.labs > .lab-card', '.principles > li',
    '.anatomy > li', '.timeline > li', '.decisions > div', '.failures > .failure', '.duo__col',
    '.compare__col', '.spectrum > div', '.vs', '.flow', '.tradeoff', '.arch', '.arch__verdict',
    '.scenario', '.quote', '.questions > li', '.notlist > li', '.bring > li', '.prose > p',
    '.contact-grid__aside > *', '.form', '.tabs__list', '.chain', '.cta__card'
  ].join(',');

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target;
        io.unobserve(el);
        el.classList.add('is-in');
        // hand the element back to its own transitions once it has arrived
        setTimeout(() => { el.classList.remove('rv', 'is-in'); el.style.removeProperty('--i'); }, 1400);
      });
    }, { rootMargin: '0px 0px -6% 0px' });

    $$(REVEAL).forEach((el) => {
      const idx = Math.min(6, [...el.parentElement.children].indexOf(el));
      el.style.setProperty('--i', String(idx));
      el.classList.add('rv');
      io.observe(el);
    });
  }

  /* ---------- Word scrub: statements light up as you read them ---------- */
  function splitWords(el) {
    const words = [];
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(part); return; }
            const sp = document.createElement('span');
            sp.className = 'scrub-w';
            sp.textContent = part;
            frag.append(sp);
            words.push(sp);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(el);
    return words;
  }
  const scrubs = $$('.statement, .definition').map((el) => ({ el, words: splitWords(el), g: track(el), last: -1 }));
  scrollFns.push(() => {
    scrubs.forEach((s) => {
      const { top, h } = s.g.get();
      const t = top - scrollY;
      if (t + h < -100 || t > vh + 100) return;
      const p = clamp((vh * 0.88 - t) / (vh * 0.43 + h));
      if (Math.abs(p - s.last) < 0.004) return;
      s.last = p;
      const n = s.words.length;
      s.words.forEach((w, i) => {
        const o = 0.5 + 0.5 * clamp((p - (i / n) * 0.8) / 0.2);
        w.style.setProperty('--o', o.toFixed(2));
      });
    });
  });

  /* ---------- Smoke (WebGL), created lazily ---------- */
  const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FRAG = [
    'precision mediump float;',
    'uniform vec2 u_res,u_m;uniform float u_t,u_v,u_a,u_s;uniform vec3 u_c;',
    'float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    '  return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}',
    'void main(){',
    '  vec2 uv=gl_FragCoord.xy/u_res;float asp=u_res.x/u_res.y;',
    '  vec2 p=vec2(uv.x*asp,uv.y)*2.+vec2(0.,u_s);float t=u_t*.05;',
    '  vec2 d=(uv-u_m)*vec2(asp,1.);float md=exp(-dot(d,d)*10.);',
    '  vec2 q=vec2(fbm(p+t),fbm(p+vec2(5.2,1.3)-t));',
    '  vec2 r=vec2(fbm(p+2.6*q+vec2(1.7,9.2)+t*1.4),fbm(p+2.6*q+vec2(8.3,2.8)-t));',
    '  float f=fbm(p+2.6*r+d*md*1.2);',
    '  float th=.9-u_v*.85;',
    '  float a=smoothstep(th,th+.28,f)*u_a;',
    '  vec3 col=mix(u_c,vec3(.71,1.,0.),smoothstep(.55,.95,r.x)*.28);',
    '  gl_FragColor=vec4(col*a,a);',
    '}'
  ].join('\n');

  const smokes = [];
  let smokeDisabled = false;
  const pointer = { x: -9999, y: -9999 };
  let lastActive = performance.now();      // last scroll or pointer movement
  const IDLE_MS = 5000;                    // ambient smoke rests after this long without input
  addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; lastActive = performance.now(); }, { passive: true });

  function initSmoke(s) {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    if (s.className) canvas.className = s.className;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true, powerPreference: 'low-power' });
    if (!gl) return false;

    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    ['u_res', 'u_m', 'u_t', 'u_v', 'u_a', 'u_s', 'u_c'].forEach((k) => { U[k] = gl.getUniformLocation(prog, k); });

    const SCALE = s.veil ? 0.4 : 0.3; // smoke is soft; low resolution keeps GPU cost small
    const size = () => {
      const g = s.g.get();
      const w = Math.max(2, Math.round(g.w * SCALE));
      const h = Math.max(2, Math.round(g.h * SCALE));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    };

    s.canvas = canvas;
    s.draw = (t) => {
      size();
      const g = s.g.get();
      const top = g.top - scrollY;
      const tx = clamp((pointer.x - g.left) / Math.max(1, g.w), -0.5, 1.5);
      const ty = clamp(1 - (pointer.y - top) / Math.max(1, g.h), -0.5, 1.5);
      s.mx += (tx - s.mx) * 0.05;
      s.my += (ty - s.my) * 0.05;
      gl.uniform2f(U.u_res, canvas.width, canvas.height);
      gl.uniform2f(U.u_m, s.mx, s.my);
      gl.uniform1f(U.u_t, s.time * 0.001);
      gl.uniform1f(U.u_v, s.v);
      gl.uniform1f(U.u_s, scrollY * 0.0006);
      if (s.veil) { gl.uniform1f(U.u_a, 0.7); gl.uniform3f(U.u_c, 0.62, 0.64, 0.7); }
      else { gl.uniform1f(U.u_a, 0.2); gl.uniform3f(U.u_c, 0.3, 0.32, 0.4); }
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (s.first) { s.first = false; canvas.classList.add('is-on'); }
    };
    s.host.prepend(canvas);
    return true;
  }

  // Ambient smoke isn't needed for first paint: wait for load, then for an idle moment.
  let idleOK = false;
  const idleWaiters = [];
  const onIdle = () => { idleOK = true; idleWaiters.splice(0).forEach((f) => f()); };
  const afterLoad = () => ('requestIdleCallback' in window ? requestIdleCallback(onIdle, { timeout: 1500 }) : setTimeout(onIdle, 400));
  if (document.readyState === 'complete') afterLoad(); else addEventListener('load', afterLoad, { once: true });

  function makeSmoke(host, { veil = false, className = '' } = {}) {
    const s = { host, veil, className, g: track(host), active: false, ready: false, failed: false,
                v: veil ? 1 : 0.42, mx: 0.5, my: 0.5, first: true, lastDraw: 0, time: 0, inView: false, draw: null, canvas: null };
    smokes.push(s);
    if (!('IntersectionObserver' in window)) return s;
    // Create the canvas (and compile the shader) only once the section is near the viewport.
    const start = () => {
      if (smokeDisabled || s.failed || s.ready || !s.inView) return;
      s.ready = initSmoke(s);
      s.failed = !s.ready;
      s.active = s.ready;
    };
    new IntersectionObserver(([e]) => {
      s.inView = e.isIntersecting;
      if (smokeDisabled || s.failed) return;
      if (s.inView && !s.ready) {
        // veils are part of the intro and start at once; ambient smoke waits for idle
        if (s.veil || idleOK) start(); else idleWaiters.push(start);
      }
      s.active = s.inView && s.ready;
    }, { rootMargin: '250px 0px' }).observe(host);
    return s;
  }
  frameFns.push((t) => {
    const resting = t - lastActive > IDLE_MS;
    for (const s of smokes) {
      if (!s.active || (s.veil && s.v <= 0.015)) continue;
      if (!s.veil && (resting || t - s.lastDraw < 50)) continue; // ambient: 20 fps, and still when nobody is moving
      const dt = s.lastDraw ? Math.min(t - s.lastDraw, 100) : 16;
      s.time += dt;                 // animation clock only advances while drawing, so resuming never jumps
      s.lastDraw = t;
      s.draw(t);
    }
  });

  /* Ambient smoke behind hero, page heads and the closing call-to-action */
  $$('.hero, .page-hero, .cta').forEach((host) => makeSmoke(host, { className: 'smoke' }));

  /* ---------- Veil: glass + smoke that dissolves ---------- */
  function makeVeil(host) {
    const el = document.createElement('div');
    el.className = 'veil';
    el.setAttribute('aria-hidden', 'true');
    host.append(el);
    const sm = makeSmoke(el, { veil: true });
    let shown = -1;
    const set = (v) => {
      if (sm) sm.v = v;
      if (Math.abs(v - shown) < 0.004) return; // nothing visible changed: skip the style write
      shown = v;
      el.style.setProperty('--v', v.toFixed(3));
      el.toggleAttribute('data-done', v < 0.015);
    };
    set(1);
    return { el, set };
  }

  // Hero: the page arrives out of smoke
  const hero = document.querySelector('.hero');
  if (hero) {
    const vl = makeVeil(hero);
    vl.set(0.9);
    let t0 = null;
    const intro = (t) => {
      if (t0 === null) t0 = t;
      const p = clamp((t - t0 - 120) / 1500);
      vl.set(0.9 * (1 - easeOut(p)));
      if (p >= 1) frameFns.splice(frameFns.indexOf(intro), 1);
    };
    frameFns.push(intro);
    // Never leave the hero veiled, even if animation frames stall.
    setTimeout(() => {
      vl.set(0);
      const i = frameFns.indexOf(intro);
      if (i > -1) frameFns.splice(i, 1);
    }, 3500);
  }

  // Glass panels clear as they scroll into view
  $$('.cta__card').forEach((card) => {
    const vl = makeVeil(card);
    const g = track(card);
    let cur = 1;
    frameFns.push(() => {
      const target = 1 - clamp((vh * 0.92 - g.top()) / (vh * 0.4));
      if (Math.abs(target - cur) < 0.002) return; // settled (also true while far off-screen)
      cur += (target - cur) * 0.12;
      vl.set(cur);
    });
  });

  // Black box: the decision layer sits behind smoke until you scroll to it
  const box = document.querySelector('[data-blackbox]');
  const layer = box && box.querySelector('.chain__layer');
  const btn = box && box.querySelector('[data-blackbox-toggle]');
  if (layer && btn) {
    const vl = makeVeil(layer);
    const g = track(layer);
    const label = btn.querySelector('span');
    let pinned = null; // null = follow scroll; 'clear' | 'veil' = the reader's override
    let cur = 1;
    label.textContent = 'Clear the smoke';
    btn.hidden = false;
    btn.addEventListener('click', () => {
      pinned = pinned === 'clear' ? 'veil' : 'clear';
      const on = pinned === 'clear';
      btn.setAttribute('aria-pressed', String(on));
      label.textContent = on ? 'Bring the smoke back' : 'Clear the smoke';
    });
    frameFns.push(() => {
      const target = pinned ? (pinned === 'clear' ? 0 : 1) : 1 - clamp((vh * 0.85 - g.top()) / (vh * 0.4));
      if (Math.abs(target - cur) < 0.002) return;
      cur += (target - cur) * 0.1;
      vl.set(cur);
    });
  }

  /* ---------- Frame-time guard ----------
     On a weak GPU the smoke is the first thing to go; the glass and the
     reveals stay. Sampled once, after the shaders have warmed up. */
  const samples = [];
  let lastT = 0;
  frameFns.push((t) => {
    if (t < 1800 || samples.length >= 90) return;
    if (lastT) samples.push(t - lastT);
    lastT = t;
    if (samples.length === 90 && samples.reduce((a, b) => a + b, 0) / 90 > 38) {
      smokeDisabled = true;
      smokes.forEach((s) => { s.active = false; if (s.canvas) s.canvas.remove(); });
      root.classList.add('no-smoke');
    }
  });

  /* ---------- Main loop ---------- */
  const tick = (t) => {
    requestAnimationFrame(tick);
    const y = readY();
    if (y !== scrollY) { scrollY = y; dirty = true; lastActive = t; }
    for (const f of frameFns.slice()) f(t);
    if (dirty) { dirty = false; for (const f of scrollFns) f(scrollY); }
  };
  requestAnimationFrame(tick);
})();
