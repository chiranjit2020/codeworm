/* CODEWORM — motion layer.
   Smooth scroll (Lenis), scroll reveals, word scrub, and the smoke veil.
   Pure enhancement: skipped entirely under prefers-reduced-motion, and every
   page reads correctly if this file never runs. */
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

  addEventListener('resize', () => { vh = innerHeight; dirty = true; });

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
  const scrubs = $$('.statement, .definition').map((el) => ({ el, words: splitWords(el) }));
  scrollFns.push(() => {
    scrubs.forEach(({ el, words }) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      const p = clamp((vh * 0.88 - r.top) / (vh * 0.43 + r.height));
      const n = words.length;
      words.forEach((w, i) => {
        const o = 0.18 + 0.82 * clamp((p - (i / n) * 0.8) / 0.2);
        w.style.setProperty('--o', o.toFixed(2));
      });
    });
  });

  /* ---------- Smoke (WebGL) ---------- */
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
  const pointer = { x: -9999, y: -9999 };
  addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });

  function makeSmoke(host, { veil = false, className = '' } = {}) {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    if (className) canvas.className = className;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true, powerPreference: 'low-power' });
    if (!gl) return null;

    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    ['u_res', 'u_m', 'u_t', 'u_v', 'u_a', 'u_s', 'u_c'].forEach((k) => { U[k] = gl.getUniformLocation(prog, k); });

    const s = { host, canvas, veil, active: false, v: veil ? 1 : 0.42, mx: 0.5, my: 0.5, first: true };
    const SCALE = 0.4; // render at 40%: smoke is soft, and this keeps GPU cost small
    const resize = () => {
      const w = Math.max(2, Math.round(host.clientWidth * SCALE));
      const h = Math.max(2, Math.round(host.clientHeight * SCALE));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    };
    new ResizeObserver(resize).observe(host);
    resize();

    s.draw = (t) => {
      const r = host.getBoundingClientRect();
      const tx = clamp((pointer.x - r.left) / Math.max(1, r.width), -0.5, 1.5);
      const ty = clamp(1 - (pointer.y - r.top) / Math.max(1, r.height), -0.5, 1.5);
      s.mx += (tx - s.mx) * 0.05;
      s.my += (ty - s.my) * 0.05;
      gl.uniform2f(U.u_res, canvas.width, canvas.height);
      gl.uniform2f(U.u_m, s.mx, s.my);
      gl.uniform1f(U.u_t, t * 0.001);
      gl.uniform1f(U.u_v, s.v);
      gl.uniform1f(U.u_s, scrollY * 0.0006);
      if (veil) {
        gl.uniform1f(U.u_a, 0.7);
        const c = [0.62, 0.64, 0.7];
        gl.uniform3f(U.u_c, c[0], c[1], c[2]);
      } else {
        gl.uniform1f(U.u_a, 0.2);
        const c = [0.3, 0.32, 0.4];
        gl.uniform3f(U.u_c, c[0], c[1], c[2]);
      }
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (s.first) { s.first = false; canvas.classList.add('is-on'); }
    };

    new IntersectionObserver(([e]) => { s.active = e.isIntersecting; }).observe(host);
    host.prepend(canvas);
    smokes.push(s);
    return s;
  }
  frameFns.push((t) => {
    for (const s of smokes) if (s.active && (!s.veil || s.v > 0.015)) s.draw(t);
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
    const set = (v) => {
      el.style.setProperty('--v', v.toFixed(3));
      el.toggleAttribute('data-done', v < 0.015);
      if (sm) sm.v = v;
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
    let cur = 1;
    frameFns.push(() => {
      const top = card.getBoundingClientRect().top;
      const target = 1 - clamp((vh * 0.92 - top) / (vh * 0.4));
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
      let target;
      if (pinned) target = pinned === 'clear' ? 0 : 1;
      else target = 1 - clamp((vh * 0.85 - layer.getBoundingClientRect().top) / (vh * 0.4));
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
      smokes.forEach((s) => { s.active = false; s.canvas.remove(); });
      smokes.length = 0;
      root.classList.add('no-smoke');
    }
  });

  /* ---------- Main loop ---------- */
  const tick = (t) => {
    requestAnimationFrame(tick);
    const y = readY();
    if (y !== scrollY) { scrollY = y; dirty = true; }
    for (const f of frameFns.slice()) f(t);
    if (dirty) { dirty = false; for (const f of scrollFns) f(scrollY); }
  };
  requestAnimationFrame(tick);
})();
