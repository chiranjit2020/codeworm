/* CODEWORM Build Lab — progressive enhancement only.
   Every page is readable and usable without this file. */
(() => {
  'use strict';

  /* Navigation: collapsible on small screens */
  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');

  if (toggle && nav) {
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      nav.toggleAttribute('data-open', open);
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { setOpen(false); toggle.focus(); }
    });
  }

  if (header) {
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* Theme: the saved or system choice is applied by an inline script in <head>
     (so there is no flash); this only wires up the switch. */
  const root = document.documentElement;
  const themeBtn = document.querySelector('.theme-toggle');
  if (themeBtn) {
    const sync = () => {
      const dark = root.dataset.theme === 'dark';
      themeBtn.setAttribute('aria-pressed', String(dark));
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = dark ? '#0d0d10' : '#f9f9fd';
    };
    sync();
    themeBtn.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.classList.add('theme-anim');
      root.dataset.theme = next;
      try { localStorage.setItem('cw-theme', next); } catch (e) { /* private mode: applies for this visit only */ }
      sync();
      setTimeout(() => root.classList.remove('theme-anim'), 400);
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      try { if (localStorage.getItem('cw-theme')) return; } catch (err) { /* ignore */ }
      root.dataset.theme = e.matches ? 'dark' : 'light';
      sync();
    });
  }

  /* Tabs (WAI-ARIA tab pattern). Without JS every panel is simply shown. */
  document.querySelectorAll('[data-tabs]').forEach((root) => {
    const list = root.querySelector('[role="tablist"]');
    if (!list) return;
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
    list.hidden = false;

    const select = (i, focus) => {
      tabs.forEach((t, j) => {
        const on = i === j;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        panels[j].hidden = !on;
      });
      if (focus) tabs[i].focus();
    };

    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', (e) => {
        const last = tabs.length - 1;
        const next = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i + last) % tabs.length, Home: 0, End: last }[e.key];
        if (next !== undefined) { e.preventDefault(); select(next, true); }
      });
    });
    select(0);
  });

  /* Process timeline: mark the stage currently in the reading band */
  const rows = document.querySelectorAll('.timeline li');
  if (rows.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.target.classList.toggle('is-active', e.isIntersecting)),
      { rootMargin: '-42% 0px -42% 0px' }
    );
    rows.forEach((r) => io.observe(r));
  }

  /* Contact form: no backend. Compose a mailto: message from the fields. */
  const form = document.querySelector('[data-contact]');
  if (form) {
    const status = form.querySelector('.form__status');
    const intentParam = new URLSearchParams(location.search).get('intent');
    if (intentParam) {
      const match = [...form.querySelectorAll('input[name="intent"]')].find((r) => r.value === intentParam);
      if (match) match.checked = true;
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;

      const d = new FormData(form);
      const intent = form.querySelector('input[name="intent"]:checked');
      const intentLabel = intent ? intent.parentElement.textContent.trim() : 'Not specified';
      const body = [
        `I want to: ${intentLabel}`,
        `Name: ${d.get('name')}`,
        `Email: ${d.get('email')}`,
        `Experience: ${d.get('experience') || 'Not specified'}`,
        `Link: ${d.get('link') || '—'}`,
        '',
        'WHAT I AM WORKING ON',
        d.get('working') || '—',
        '',
        'THE PROBLEM',
        d.get('problem'),
        '',
        'WHAT I HAVE ALREADY TRIED',
        d.get('tried') || '—',
      ].join('\n');

      const subject = `Engineering problem: ${intentLabel}`;
      window.location.href = `mailto:${form.dataset.to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      if (status) status.textContent = 'Your email app should open with the message ready to send.';
    });
  }
})();
