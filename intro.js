/* Netflix-style intro sequence -- adapted from Slime-Mould-Deck/index.html's
   intro (same choreography/timing constants, see style.css for the keyframes).
   Self-contained: no dependency on Leaflet/PhysarumGraph/app.js, so it's safe
   to load and run before any of those. */
(function () {
  const overlay = document.getElementById('introOverlay');
  if (!overlay) return;
  const skipBtn = document.getElementById('introSkip');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const chime = new Audio('assets/intro-chime.mp3');
  chime.preload = 'auto';
  chime.volume = 0.7;

  /* The intro plays automatically on load, with no user gesture yet --
     browsers block unmuted audio in that case, so this first attempt reliably
     fails silently every time. chimeNeedsRetry records that so the NEXT
     real gesture (see unlockAudio below) can actually play it instead of
     the failure just being swallowed forever, which is what the previous
     version of this file did (comment promised a retry; no code did it). */
  let chimeNeedsRetry = false;
  function playChime() {
    try {
      chime.currentTime = 0;
      const p = chime.play();
      if (p && p.catch) p.catch(() => { chimeNeedsRetry = true; });
    } catch (e) { chimeNeedsRetry = true; }
  }

  /* Browsers only allow unmuted audio after a genuine user gesture on the
     page (a click/key/tap -- switching tabs or window focus doesn't count). */
  let audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    // This listener is on `document` with capture:true so it catches a
    // gesture anywhere on the page -- which means for a click on the skip
    // button or the overlay itself, THIS runs before that element's own
    // (bubble-phase) click handler, i.e. before finish() has set `finished`
    // yet, even though they're the same click. Checking `finished`
    // synchronously here couldn't tell "the user is skipping right now"
    // apart from "the user is genuinely still watching" -- retrying the
    // chime either way meant a skip-click made it start playing audibly
    // right as the visual faded out, i.e. the "audio after the video
    // finishes" bug. Deferring one tick lets finish() (if this same click
    // triggers it) run first, so the check below sees the real state.
    setTimeout(() => {
      if (chimeNeedsRetry && !finished) {
        chimeNeedsRetry = false;
        playChime();
        return;
      }
      // Already mid-playback (autoplay wasn't actually blocked this time,
      // or it already retried) -- leave it alone, priming would pause and
      // reset audio that's legitimately still going.
      if (!chime.paused) return;
      // No retry needed (either it already played, or the intro's already
      // done and playing it now would be exactly the out-of-sync bug this
      // is fixing) -- just prime the element (muted play+pause) so a LATER
      // programmatic play() (next replay via visibilitychange/F11) is
      // allowed even without a fresh gesture at that exact moment.
      const wasMuted = chime.muted;
      chime.muted = true;
      const p = chime.play();
      const reset = () => { chime.pause(); chime.currentTime = 0; chime.muted = wasMuted; };
      if (p && p.then) p.then(reset).catch(reset);
      else reset();
    }, 0);
  }
  ['click', 'keydown', 'touchstart', 'pointerdown'].forEach((evt) => {
    document.addEventListener(evt, unlockAudio, { once: true, capture: true });
  });

  let finished = false;
  let introRunning = false;
  let introTimer;

  function finish() {
    if (finished) return;
    finished = true;
    introRunning = false;
    clearTimeout(introTimer);
    overlay.classList.add('fading');
    setTimeout(() => { overlay.style.display = 'none'; }, 950);
  }

  /* Skip controls are wired up immediately and unconditionally -- NOT gated
     behind the visibility check below. If they were only attached once the
     animation actually starts, a page that loads without ever reporting
     `visibilityState === 'visible'` (happens in background tabs, some
     automation contexts, and in principle any browser edge case) would show
     a plain black overlay with genuinely no way to dismiss it. This way the
     overlay is always clickable/skippable from the instant it appears, even
     if the animation itself never gets to play. */
  overlay.addEventListener('click', finish);
  document.addEventListener('keydown', finish);
  if (skipBtn) skipBtn.addEventListener('click', (e) => { e.stopPropagation(); finish(); });

  function startAnimation() {
    if (introRunning || finished) return;
    introRunning = true;
    overlay.classList.remove('fading');
    overlay.classList.remove('playing');
    void overlay.offsetWidth; /* force reflow so adding 'playing' (again) restarts the CSS animations */
    requestAnimationFrame(() => {
      overlay.classList.add('playing');
      playChime();
    });
    introTimer = setTimeout(finish, 3900);
  }

  function playIntro() {
    if (finished || introRunning) return;
    if (reduceMotion) { finish(); return; }

    /* If the tab isn't actually visible (e.g. it loaded in a background
       tab), rAF and timers get throttled or frozen and the sequence never
       visibly starts. Defer until the tab is genuinely shown instead of
       assuming it already is -- the overlay stays up (and skippable, see
       above) in the meantime rather than silently doing nothing. */
    if (document.visibilityState !== 'visible') {
      document.addEventListener('visibilitychange', function onVisible() {
        if (document.visibilityState === 'visible') {
          document.removeEventListener('visibilitychange', onVisible);
          startAnimation();
        }
      });
      return;
    }

    startAnimation();
  }

  /* Chrome's address bar will silently prerender a URL you've typed/visited
     before (Prerender2) -- the whole page, including this script, runs in a
     hidden background tab, so by the time it's actually shown the intro has
     already played out unseen. document.prerendering + 'prerenderingchange'
     is the standard way to detect that and defer until real activation. */
  if (document.prerendering) {
    document.addEventListener('prerenderingchange', playIntro, { once: true });
  } else {
    /* pageshow (not just the initial script run) covers normal loads, hard
       reloads, and back/forward-cache restores alike, so the intro
       reliably replays every time the page is actually, visibly displayed. */
    window.addEventListener('pageshow', playIntro);
  }

  /* F11 triggers the browser's native window-fullscreen toggle, which does
     NOT dispatch a 'fullscreenchange' event -- so detect it by watching for
     the viewport suddenly matching the full screen size (no browser chrome
     left), in addition to listening for Fullscreen-API-driven changes. */
  let wasFullscreen = false;
  function isNowFullscreen() {
    return !!document.fullscreenElement ||
      (window.innerWidth === screen.width && window.innerHeight === screen.height);
  }
  function handleFullscreenToggle() {
    const full = isNowFullscreen();
    if (full && !wasFullscreen) { finished = false; overlay.style.display = 'flex'; playIntro(); }
    wasFullscreen = full;
  }
  window.addEventListener('resize', handleFullscreenToggle);
  document.addEventListener('fullscreenchange', handleFullscreenToggle);
})();
