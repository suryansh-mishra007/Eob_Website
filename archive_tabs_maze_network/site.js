/* Page chrome: ambient hero animation, scroll-reveal, active nav link.
   Purely decorative — the actual model lives in app.js. */

(() => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Ambient hero animation ----------
  // A slow, looping field of branching lines behind the hero text, echoing
  // the same growth-and-fork logic as the real model, purely for texture.
  const heroCanvas = document.getElementById('heroCanvas');
  if (heroCanvas && !prefersReducedMotion) {
    const ctx = heroCanvas.getContext('2d');
    let w = 0, h = 0, dpr = 1;
    let tips = [];

    function resize() {
      const rect = heroCanvas.parentElement.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      heroCanvas.width = w * dpr;
      heroCanvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#f8f5ee';
      ctx.fillRect(0, 0, w, h);
    }

    // Each tendril gets one of the site's accent hues instead of a single
    // flat color -- purely decorative, but it's the first thing a visitor
    // sees, so it should already read as "colorful," not monochrome.
    const HUES = ['rgba(15,157,132,0.5)', 'rgba(232,84,61,0.45)', 'rgba(220,154,46,0.5)', 'rgba(76,95,214,0.42)', 'rgba(155,93,229,0.42)'];

    function seed() {
      tips = [];
      const count = 4;
      for (let i = 0; i < count; i++) {
        tips.push({
          x: w * (0.1 + Math.random() * 0.8),
          y: h * (1.05 + Math.random() * 0.15),
          heading: -Math.PI / 2 + (Math.random() - 0.5) * 0.7,
          life: 0,
          maxLife: 260 + Math.random() * 220,
          color: HUES[Math.floor(Math.random() * HUES.length)],
        });
      }
    }

    resize();
    seed();
    window.addEventListener('resize', () => { resize(); seed(); });

    let visible = true;
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
      });
      io.observe(heroCanvas);
    }

    function step() {
      if (visible) {
        ctx.fillStyle = 'rgba(248,245,238,0.06)';
        ctx.fillRect(0, 0, w, h);

        ctx.lineCap = 'round';
        ctx.lineWidth = 1;
        for (let i = tips.length - 1; i >= 0; i--) {
          const t = tips[i];
          t.life++;
          const nx = t.x + Math.cos(t.heading) * 1.1;
          const ny = t.y + Math.sin(t.heading) * 1.1;
          ctx.strokeStyle = t.color;
          ctx.beginPath();
          ctx.moveTo(t.x, t.y);
          ctx.lineTo(nx, ny);
          ctx.stroke();
          t.x = nx;
          t.y = ny;
          t.heading += (Math.random() - 0.5) * 0.14;

          if (Math.random() < 0.01 && tips.length < 16) {
            tips.push({
              x: t.x,
              y: t.y,
              heading: t.heading + (Math.random() < 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.5),
              life: 0,
              maxLife: 120 + Math.random() * 160,
              color: HUES[Math.floor(Math.random() * HUES.length)],
            });
          }
          if (t.life > t.maxLife || t.y < -30 || t.x < -30 || t.x > w + 30) {
            tips.splice(i, 1);
          }
        }
        if (tips.length === 0) seed();
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ---------- Scroll reveal ----------
  const revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length && 'IntersectionObserver' in window && !prefersReducedMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach((el) => io.observe(el));

    // Safety net: content must never stay invisible indefinitely (e.g. if
    // observer callbacks are delayed by an inactive/background tab).
    setTimeout(() => {
      revealEls.forEach((el) => el.classList.add('is-visible'));
    }, 2500);
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  // ---------- Active nav link ----------
  const navLinks = Array.from(document.querySelectorAll('.nav a'));
  const sections = navLinks
    .map((a) => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const link = navLinks.find((a) => a.getAttribute('href') === '#' + entry.target.id);
        if (!link) return;
        if (entry.isIntersecting) {
          navLinks.forEach((a) => a.classList.remove('active'));
          link.classList.add('active');
        }
      });
    }, { rootMargin: '-40% 0px -50% 0px' });
    sections.forEach((s) => io.observe(s));
  }
})();
