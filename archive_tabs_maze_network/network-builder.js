/* Network Builder demo -- recreates the general result of Tero et al.
   (2010): place food sources of your own choosing (like oat flakes on
   agar) and watch an efficient network grow to connect them, via the same
   real Physarum Solver (physarum-solver.js) used by the Maze Solver demo.
   No map, no bundled data -- the underlying graph is a fine square lattice
   covering the plate (8-connected, so routes can run diagonally, not just
   in a strict grid), and terminals are just whichever lattice node is
   nearest wherever the user clicks. Per the 2010 paper, one terminal is
   arbitrarily the mathematical source (I=+1) and the rest split the sink
   flux evenly -- which terminal plays that role doesn't change the
   resulting network topology, since the physics only depends on relative
   pressure (see physarum-solver.js and the site's References section). */

(() => {
  const LATTICE_COLS = 42;
  const LATTICE_ROWS = 28;
  const MAX_TERMINALS = 10;
  const PICK_RADIUS_PX = 20; // click within this of an existing terminal removes it instead of adding a new one

  // ---------- Model constants ----------
  const DT = 0.14;
  const CG_MAX_ITER_FIRST = 140;
  const CG_MAX_ITER_WARM = 30;
  // Raw per-edge D can sit on a slow decay plateau (delta shrinks just
  // because D itself is already small) well before the network has actually
  // finished thinning down to its true answer -- observed empirically
  // settling on a visibly wrong, too-dense "final" state at some gamma
  // values if convergence were judged on maxDelta alone. CONSEC_SETTLE_NEEDED
  // below now also requires the rendered active-tube count to be unchanged,
  // not just the raw delta, which is what actually caught this -- MAX_ITERS
  // is raised accordingly so slow cases have enough steps to reach genuine
  // equilibrium (see maze.js, same fix).
  const MAX_ITERS = 4000;
  const SETTLE_EPS = 0.0006;
  const CONSEC_SETTLE_NEEDED = 10;

  const VISIBLE_FRACTION = 0.012;
  // A fine lattice has many near-equal-length routes between any two
  // points (just like a real street grid), which dilutes flux the same
  // way the archived road-network version needed to correct for -- see
  // physarum-solver.js's note on fluxScale. Tuned empirically for this
  // lattice resolution, same as the road-network constant was.
  const FLUX_SCALE = 0.1;

  // ---------- Growth-front animation (cosmetic pre-roll, NOT part of the
  // Tero/Nakagaki equations -- see physarum-solver.js's dijkstraDistances
  // comment and maze.js's identical mechanic). Before relaxation starts,
  // every lattice edge sits at DMIN (invisible) instead of the model's real
  // D0 initial condition; an expanding front -- straight-line lattice
  // distance from the source terminal, so on this open plate it reads as a
  // visibly circular/radial spread, the "growing in a circle" look real
  // plasmodium video actually has -- reveals and thickens tubes as it
  // passes, then relaxation (unchanged) takes over from there.
  const PHYS_D0 = window.PhysarumGraph.D0;
  const PHYS_DMIN = window.PhysarumGraph.DMIN;
  // 2026-08-08: both bumped ~3.5x on user feedback against the real Tero et
  // al. 2010 time-lapse -- a full grow-to-settle cycle previously finished
  // in under a second, nothing like the hours-long, visibly staged real
  // process. See RELAX_FRAMES_PER_STEP_BASE below for the matching
  // relaxation-phase slowdown -- growth alone being slow isn't enough if
  // relaxation still finishes instantly.
  const GROWTH_BASE_FRAMES = 780; // frames to sweep the front across the whole lattice at speed=1 (~13s @60fps); scales with the speed slider like relaxation does
  const GROWTH_JITTER_FRACTION = 0.32; // random per-edge offset (fraction of max source-distance) -- generous on purpose, so the front looks chaotic/exploratory (some directions lag, some poke ahead) rather than a tidy perfect circle
  const GROWTH_RAMP_FRAMES = 50; // baseline frames a tube takes to thicken from just-activated to full D0 -- jittered per-edge below (see edgeRampFrames) so branches don't all thicken in lockstep

  // ---------- "Petri dish" rendering (see growth-fx.js) -- cosmetic only,
  // reads D/Q/p that the solver already computed, never writes to them.
  const VIS_SMOOTH_K = 0.14;      // per-frame lerp rate of the rendered width/color toward the real D -- decouples visual smoothness from simulation step size/speed
  const RETRACT_K = 0.15;         // per-frame lerp rate of each tube's root->tip "reach" toward 0/1 -- ~(3/RETRACT_K)/60s to fully extend or retract, i.e. ~330ms
  const ACTIVE_THRESH_MULT = 1.4; // a tube counts as "alive" (reach -> 1) once its visual D clears VISIBLE_FRACTION by this margin, so it doesn't flicker right at the cutoff
  const MIN_TUBE_WIDTH = 0.5;     // thin hairline veins, not thick pipes -- matched against real Physarum photos, see growth-fx.js header
  const MAX_TUBE_WIDTH = 3;
  // The real organism spreads first as an undifferentiated protoplasmic
  // sheet (Tero et al. 2010, panels B/C, 5-8hr) and only later resolves
  // into distinct veins (panels D-F, 11-26hr) -- see drawSheetWash() and
  // its use in draw(). sheetOpacity eases toward 1 while exploring and
  // toward 0 once relaxing starts, at SHEET_FADE_K per frame, so the sheet
  // visibly consolidates into veins over ~2.5s rather than an instant swap.
  const SHEET_WASH_ALPHA = 0.05; // slightly dimmer than the maze's -- this lattice has ~4x the edges packed into a similar area, so overlap alone reads darker at the same per-stroke alpha
  const SHEET_FADE_K = 0.02;
  // Relaxation used to run several full Euler+CG solves per rendered frame
  // (as many as the speed slider's stepsPerFrame), which is why it read as
  // "instant" -- settling in under a second regardless of how many
  // iterations it actually took. Now it's throttled to at most one real
  // step every relaxFramesPerStep() frames (see below), independent of how
  // fast each individual step is to compute, so the thinning process stays
  // visible frame by frame the way the real 11-26hr time-lapse is.
  const RELAX_FRAMES_PER_STEP_BASE = 10; // at speed=1, one Euler step every 10 rendered frames (~6 steps/sec)
  const PARTICLE_MAX = 80;
  const PARTICLE_SPAWN_MIN_FRAMES = 4;
  const PARTICLE_SPAWN_JITTER_FRAMES = 5;
  const PARTICLE_BASE_SPEED = 0.05; // edge-fraction per frame at full conductance -- slower tubes get a fraction of this (see chooseNext below)

  const canvas = document.getElementById('networkCanvas');
  const ctx = canvas.getContext('2d');
  const hint = document.getElementById('networkHint');
  const speedRange = document.getElementById('networkSpeedRange');
  const speedLabel = document.getElementById('networkSpeedLabel');
  const gammaRange = document.getElementById('networkGammaRange');
  const gammaLabel = document.getElementById('networkGammaLabel');
  const startBtn = document.getElementById('networkStartBtn');
  const resetBtn = document.getElementById('networkResetBtn');
  const clearBtn = document.getElementById('networkClearBtn');
  const statStatus = document.getElementById('networkStatStatus');
  const statTerminals = document.getElementById('networkStatTerminals');
  const statIterations = document.getElementById('networkStatIterations');
  const statActive = document.getElementById('networkStatActive');
  const statConverge = document.getElementById('networkStatConverge');
  const statLength = document.getElementById('networkStatLength');

  let LOGICAL_W = 800, LOGICAL_H = 600, dpr = 1;
  let cellSize = 20, originX = 0, originY = 0;
  let lattice = null;       // { cols, rows, n, edges, nodeX, nodeY }
  let terminals = [];       // lattice node indices, in click order -- terminals[0] is always the source
  let solver = null;
  let running = false;
  let phase = 'idle';       // idle | exploring | relaxing | done
  let iterations = 0;
  let settledStreak = 0;
  let maxDeltaLast = 0;
  let lastActiveCount = -1;

  // Growth-front state (see constants above) -- rebuilt every resetAll().
  let edgeActivateAt = null;
  let edgeActivatedFrame = null;
  let edgeRampFrames = null;   // per-edge thickening duration (jittered around GROWTH_RAMP_FRAMES)
  let frontRadius = 0;
  let growTarget = 0;
  let growFrame = 0;
  let radiusDoneFrame = -1;

  // Rendering state (see growth-fx.js) -- rebuilt every resetAll().
  let visD = null;             // smoothed/animated copy of solver.D, chases it every frame
  let reach = null;            // 0 = fully retracted/invisible, 1 = fully extended root->tip
  let edgeRootNode = null;     // per-edge endpoint closer to the source -- tubes grow/retract root->tip
  let edgeTipNode = null;
  let particleField = null;
  let particleSpawnTimer = 0;
  let sheetOpacity = 0;        // undifferentiated-sheet layer strength, see SHEET_WASH_ALPHA above
  let relaxFrameCounter = 0;   // frames elapsed since the last real Euler step, see RELAX_FRAMES_PER_STEP_BASE above

  function buildLattice() {
    const cols = LATTICE_COLS, rows = LATTICE_ROWS, n = cols * rows;
    const idx = (c, r) => r * cols + c;
    const edges = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (c < cols - 1) edges.push({ a: idx(c, r), b: idx(c + 1, r), length: 1 });
        if (r < rows - 1) edges.push({ a: idx(c, r), b: idx(c, r + 1), length: 1 });
        if (c < cols - 1 && r < rows - 1) {
          edges.push({ a: idx(c, r), b: idx(c + 1, r + 1), length: Math.SQRT2 });
          edges.push({ a: idx(c + 1, r), b: idx(c, r + 1), length: Math.SQRT2 });
        }
      }
    }
    return { cols, rows, n, edges, nodeX: new Float64Array(n), nodeY: new Float64Array(n) };
  }

  function sizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return; // hidden tab -- resized again once it becomes visible
    LOGICAL_W = rect.width;
    LOGICAL_H = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = LOGICAL_W * dpr;
    canvas.height = LOGICAL_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layoutLattice();
  }

  function layoutLattice() {
    const margin = 20;
    cellSize = Math.min((LOGICAL_W - margin * 2) / (LATTICE_COLS - 1), (LOGICAL_H - margin * 2) / (LATTICE_ROWS - 1));
    originX = (LOGICAL_W - cellSize * (LATTICE_COLS - 1)) / 2;
    originY = (LOGICAL_H - cellSize * (LATTICE_ROWS - 1)) / 2;
    for (let r = 0; r < LATTICE_ROWS; r++) {
      for (let c = 0; c < LATTICE_COLS; c++) {
        const i = r * LATTICE_COLS + c;
        lattice.nodeX[i] = originX + c * cellSize;
        lattice.nodeY[i] = originY + r * cellSize;
      }
    }
  }

  // Canvas starts hidden (its tab isn't active on load), so a plain resize
  // listener alone isn't enough -- ResizeObserver also fires when a hidden
  // ancestor becomes visible (display:none -> block), which is exactly
  // when this canvas first gets real dimensions. Kept alongside (not
  // instead of) the window resize listener, and tabs.js also calls this
  // directly on tab switch as a third, synchronous trigger -- belt and
  // suspenders, since a delayed resize means clicks land on the wrong
  // lattice node until the window is next resized.
  if ('ResizeObserver' in window) {
    new ResizeObserver(sizeCanvas).observe(canvas.parentElement);
  }
  window.addEventListener('resize', sizeCanvas);
  window.__networkBuilderResize = sizeCanvas;

  function nearestNode(px, py) {
    const c = Math.round((px - originX) / cellSize);
    const r = Math.round((py - originY) / cellSize);
    const cc = Math.max(0, Math.min(LATTICE_COLS - 1, c));
    const rr = Math.max(0, Math.min(LATTICE_ROWS - 1, r));
    return rr * LATTICE_COLS + cc;
  }

  function gamma() { return parseFloat(gammaRange.value); }
  function stepsPerFrame() { return parseInt(speedRange.value, 10); }

  function updateStartEnabled() {
    startBtn.disabled = phase !== 'idle' || terminals.length < 2;
  }

  canvas.addEventListener('click', (ev) => {
    if (phase !== 'idle') return;
    const rect = canvas.getBoundingClientRect();
    const px = ev.clientX - rect.left, py = ev.clientY - rect.top;

    for (let i = 0; i < terminals.length; i++) {
      const dx = lattice.nodeX[terminals[i]] - px, dy = lattice.nodeY[terminals[i]] - py;
      if (Math.sqrt(dx * dx + dy * dy) < PICK_RADIUS_PX) {
        terminals.splice(i, 1);
        refreshPlacementUI();
        return;
      }
    }
    if (terminals.length >= MAX_TERMINALS) return;
    terminals.push(nearestNode(px, py));
    refreshPlacementUI();
  });

  function refreshPlacementUI() {
    statTerminals.textContent = terminals.length.toString();
    updateStartEnabled();
    if (terminals.length === 0) hint.textContent = 'Click the plate to place food sources (like oat flakes) — the first is the mathematical source, the rest are sinks. Then press Grow.';
    else if (terminals.length === 1) hint.textContent = 'One source placed — click again to add at least one sink, or click the source to remove it.';
    else hint.textContent = `${terminals.length} food sources placed — press Grow, or keep clicking (up to ${MAX_TERMINALS}).`;
    draw();
  }

  function clearPoints() {
    terminals = [];
    solver = null;
    particleField = null;
    phase = 'idle';
    running = false;
    iterations = 0;
    startBtn.textContent = 'Grow';
    statStatus.textContent = 'Place food sources';
    statIterations.textContent = '0';
    statActive.textContent = '0';
    statConverge.textContent = '—';
    statLength.textContent = '—';
    refreshPlacementUI();
  }

  function resetAll() {
    if (terminals.length < 2) return;
    solver = new window.PhysarumSolver(lattice.n, lattice.edges, gamma(), FLUX_SCALE);
    const flux = new Map();
    flux.set(terminals[0], 1);
    const sinkShare = -1 / (terminals.length - 1);
    for (let i = 1; i < terminals.length; i++) flux.set(terminals[i], sinkShare);
    solver.setFlux(flux, terminals[0]);
    solver.D.fill(PHYS_DMIN); // growth front (below) reveals tubes as it passes, instead of the model's raw D0-everywhere start

    const dist = window.PhysarumGraph.dijkstraDistances(lattice.n, lattice.edges, terminals[0]);
    let maxDist = 0;
    for (let i = 0; i < dist.length; i++) if (isFinite(dist[i]) && dist[i] > maxDist) maxDist = dist[i];
    const jitterMax = maxDist * GROWTH_JITTER_FRACTION;
    edgeActivateAt = new Float64Array(solver.m);
    edgeActivatedFrame = new Float64Array(solver.m).fill(-1);
    edgeRampFrames = new Float64Array(solver.m);
    edgeRootNode = new Int32Array(solver.m);
    edgeTipNode = new Int32Array(solver.m);
    for (let e = 0; e < solver.m; e++) {
      const a = solver.edgeA[e], b = solver.edgeB[e];
      const near = Math.min(dist[a], dist[b]);
      edgeActivateAt[e] = (isFinite(near) ? near : maxDist) + Math.random() * jitterMax;
      edgeRampFrames[e] = GROWTH_RAMP_FRAMES * (0.65 + Math.random() * 0.7); // some branches thicken noticeably faster than others
      if (dist[a] <= dist[b]) { edgeRootNode[e] = a; edgeTipNode[e] = b; } else { edgeRootNode[e] = b; edgeTipNode[e] = a; }
    }
    growTarget = maxDist + jitterMax;
    frontRadius = 0;
    growFrame = 0;
    radiusDoneFrame = -1;

    visD = new Float64Array(solver.m).fill(PHYS_DMIN);
    reach = new Float64Array(solver.m).fill(0);
    particleField = new window.PhysarumFX.ParticleFlow({
      adj: window.PhysarumFX.buildAdjacency(lattice.n, solver.edgeA, solver.edgeB),
      nodeX: lattice.nodeX,
      nodeY: lattice.nodeY,
      maxParticles: PARTICLE_MAX,
    });
    particleSpawnTimer = 0;
    sheetOpacity = 0;
    relaxFrameCounter = 0;

    running = false;
    phase = 'idle';
    iterations = 0;
    settledStreak = 0;
    maxDeltaLast = 0;
    lastActiveCount = -1;
    startBtn.textContent = 'Grow';
    updateStartEnabled();
    hint.textContent = `${terminals.length} food sources placed — press Grow, or keep clicking (up to ${MAX_TERMINALS}).`;
    statStatus.textContent = 'Ready';
  }

  function beginGrowth() {
    if (terminals.length < 2) return;
    if (!solver) resetAll();
    if (phase === 'idle') {
      phase = 'exploring';
      running = true;
      startBtn.textContent = 'Pause';
      startBtn.disabled = false;
      hint.textContent = 'Growing outward from the source, like the real organism first colonizing the whole plate…';
    } else if (phase === 'exploring' || phase === 'relaxing') {
      running = !running;
      startBtn.textContent = running ? 'Pause' : 'Resume';
    }
  }

  // Advances the cosmetic growth front by one frame -- see the constants
  // block above. Purely visual timing of when each tube starts thickening;
  // once the whole lattice is covered, D is exactly D0 everywhere (identical
  // to the model's real initial condition) and relaxation takes over unchanged.
  function advanceExploration() {
    const growPerFrame = growTarget > 0 ? (growTarget / GROWTH_BASE_FRAMES) * stepsPerFrame() : Infinity;
    growFrame++;
    frontRadius += growPerFrame;
    const { D } = solver;
    for (let e = 0; e < solver.m; e++) {
      if (edgeActivatedFrame[e] < 0) {
        if (frontRadius < edgeActivateAt[e]) continue;
        edgeActivatedFrame[e] = growFrame;
      }
      const t = Math.min(1, (growFrame - edgeActivatedFrame[e]) / edgeRampFrames[e]);
      const eased = 1 - Math.pow(1 - t, 3);
      D[e] = PHYS_DMIN + (PHYS_D0 - PHYS_DMIN) * eased;
    }
    if (frontRadius >= growTarget && radiusDoneFrame < 0) radiusDoneFrame = growFrame;
    if (radiusDoneFrame >= 0 && growFrame - radiusDoneFrame >= GROWTH_RAMP_FRAMES * 1.35 + 2) {
      D.fill(PHYS_D0);
      phase = 'relaxing';
      running = true;
      iterations = 0;
      settledStreak = 0;
      lastActiveCount = -1;
      relaxFrameCounter = 0;
      startBtn.textContent = 'Pause';
      hint.textContent = `Fully grown — now relaxing across ${solver.m.toLocaleString()} tubes, thinning to the ones actually carrying flow…`;
    }
  }

  // At speed=1, one real Euler step every RELAX_FRAMES_PER_STEP_BASE
  // rendered frames; faster speeds tighten that gap but never collapse to
  // "many steps in one frame" the way it used to -- see the constant's
  // comment for why.
  function relaxFramesPerStep() {
    return Math.max(1, Math.round(RELAX_FRAMES_PER_STEP_BASE / stepsPerFrame()));
  }

  // Same threshold rule the stats/rendering use for "still a real tube" --
  // reused here as the settle signal (see MAX_ITERS comment above).
  function countActive() {
    const m = maxD();
    const threshold = m * VISIBLE_FRACTION;
    let active = 0;
    for (let e = 0; e < solver.m; e++) if (solver.D[e] >= threshold) active++;
    return active;
  }

  function advance() {
    relaxFrameCounter++;
    if (relaxFrameCounter < relaxFramesPerStep()) return; // waiting out this frame -- see relaxFramesPerStep()
    relaxFrameCounter = 0;

    const cgCap = iterations === 0 ? CG_MAX_ITER_FIRST : CG_MAX_ITER_WARM;
    maxDeltaLast = solver.stepEuler(DT, cgCap);
    iterations++;
    const active = countActive();
    settledStreak = (maxDeltaLast < SETTLE_EPS && active === lastActiveCount) ? settledStreak + 1 : 0;
    lastActiveCount = active;

    if (settledStreak >= CONSEC_SETTLE_NEEDED || iterations >= MAX_ITERS) {
      phase = 'done';
      running = false;
      startBtn.textContent = 'Grow';
      hint.textContent = "Settled — this is the model's answer.";
    }
  }

  // ---------- Protoplasm particles (see growth-fx.js) -- purely cosmetic,
  // routes dots along the graph but never reads/writes anything the physics
  // depends on. Two different "which way does the flow go" strategies:
  // while the growth front is still spreading there's no real flux to
  // follow yet, so particles instead chase whichever neighboring edge the
  // front activated most recently (i.e. head for the growing tip); once
  // relaxation is running, particles instead follow the real Kirchhoff flow
  // direction/magnitude the solver already computed.
  function chooseNextGrowth(nodeIdx, incident, cameFromEdge) {
    let best = null, bestFrame = -1;
    for (const { edge, to } of incident) {
      if (edge === cameFromEdge) continue;
      if (edgeActivatedFrame[edge] < 0) continue;
      if (edgeActivatedFrame[edge] > bestFrame) { bestFrame = edgeActivatedFrame[edge]; best = { edge, to }; }
    }
    if (!best) return null;
    const m = maxD() || 1;
    return { edge: best.edge, to: best.to, speed: PARTICLE_BASE_SPEED * (0.35 + 0.65 * (solver.D[best.edge] / m)) };
  }

  function chooseNextRelax(nodeIdx, incident, cameFromEdge) {
    const m = maxD();
    const threshold = m * VISIBLE_FRACTION;
    const candidates = [];
    let total = 0;
    for (const { edge, to } of incident) {
      if (edge === cameFromEdge && incident.length > 1) continue;
      if (solver.D[edge] < threshold) continue;
      const flowsOut = solver.edgeA[edge] === nodeIdx ? solver.Q[edge] > 1e-9 : solver.Q[edge] < -1e-9;
      if (!flowsOut) continue;
      const w = Math.abs(solver.Q[edge]) + 1e-6;
      candidates.push({ edge, to, w });
      total += w;
    }
    if (!candidates.length) return null;
    let r = Math.random() * total;
    for (const c of candidates) {
      r -= c.w;
      if (r <= 0) return { edge: c.edge, to: c.to, speed: PARTICLE_BASE_SPEED * (0.35 + 0.65 * (solver.D[c.edge] / (m || 1))) };
    }
    const c = candidates[candidates.length - 1];
    return { edge: c.edge, to: c.to, speed: PARTICLE_BASE_SPEED };
  }

  function isSinkNode(nodeIdx) { return terminals.indexOf(nodeIdx) > 0; }

  function updateParticles() {
    if (!particleField || !terminals.length) return;
    const chooseNext = phase === 'exploring' ? chooseNextGrowth : chooseNextRelax;
    particleSpawnTimer--;
    if (particleSpawnTimer <= 0) {
      particleField.spawn(terminals[0], chooseNext);
      particleSpawnTimer = PARTICLE_SPAWN_MIN_FRAMES + Math.floor(Math.random() * PARTICLE_SPAWN_JITTER_FRAMES);
    }
    particleField.update(stepsPerFrame(), chooseNext, isSinkNode);
  }

  // ---------- Stats ----------
  function maxD() {
    let m = 0;
    for (let e = 0; e < solver.D.length; e++) if (solver.D[e] > m) m = solver.D[e];
    return m;
  }

  function updateStats() {
    if (!solver) return;
    statIterations.textContent = iterations.toLocaleString();
    // Same ceiling-relative threshold as updateVisuals() (see its comment)
    // -- avoids the same idle-degenerate case misreporting every tube as
    // "active" in the stats panel.
    const threshold = PHYS_D0 * VISIBLE_FRACTION;
    let active = 0, length = 0;
    for (let e = 0; e < solver.m; e++) {
      if (solver.D[e] >= threshold) { active++; length += solver.L[e]; }
    }
    statActive.textContent = active.toLocaleString();
    statConverge.textContent = phase === 'done' ? 'Settled' : phase === 'exploring' ? 'Growing' : maxDeltaLast.toFixed(4);
    statLength.textContent = phase === 'done' ? `${length.toFixed(0)} units` : '—';
    statStatus.textContent = phase === 'done' ? 'Settled'
      : phase === 'exploring' ? (running ? 'Growing…' : 'Paused')
      : phase === 'relaxing' ? (running ? 'Relaxing…' : 'Paused')
      : terminals.length < 2 ? 'Place food sources' : 'Ready';
  }

  // ---------- Rendering ----------
  // Smooths visD toward the real solver.D every frame (decouples rendered
  // width/color from raw simulation step size -- see VIS_SMOOTH_K) and eases
  // each tube's root->tip "reach" toward 1 (grown) or 0 (retracted) once its
  // visual conductivity crosses the active threshold -- this is what makes
  // new tubes visibly lengthen out of the source and dying tubes visibly
  // shrink back into it, instead of just fading in place.
  function updateVisuals() {
    let visMax = 0;
    for (let e = 0; e < solver.m; e++) {
      visD[e] += (solver.D[e] - visD[e]) * VIS_SMOOTH_K;
      if (visD[e] > visMax) visMax = visD[e];
    }
    // Threshold against the known ceiling (PHYS_D0), NOT the current live
    // max -- at idle every edge sits uniformly at DMIN, so visMax is also
    // DMIN and a max-relative threshold is trivially cleared by everything,
    // making the whole lattice render as fully grown before Grow is even
    // pressed. Anchoring to the constant ceiling instead means "active"
    // only ever means "meaningfully close to full conductivity," regardless
    // of whether the rest of the graph currently has any spread at all.
    const threshold = PHYS_D0 * VISIBLE_FRACTION * ACTIVE_THRESH_MULT;
    for (let e = 0; e < solver.m; e++) {
      const target = visD[e] > threshold ? 1 : 0;
      reach[e] += (target - reach[e]) * RETRACT_K;
    }

    // Undifferentiated-sheet strength (see drawSheetWash) -- rises while
    // exploring, eases back down once relaxing starts so the sheet visibly
    // consolidates into the thin veins instead of vanishing instantly.
    const sheetTarget = phase === 'exploring' ? 1 : 0;
    sheetOpacity += (sheetTarget - sheetOpacity) * SHEET_FADE_K;
    if (sheetOpacity < 0.001) sheetOpacity = 0;

    return visMax;
  }

  function drawLatticeGhost() {
    // The whole lattice, very faintly, so the plate reads as "alive
    // everywhere" before growth starts -- same idea as the maze's walls,
    // just showing potential connections instead of blocked ones.
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const e of lattice.edges) {
      ctx.moveTo(lattice.nodeX[e.a], lattice.nodeY[e.a]);
      ctx.lineTo(lattice.nodeX[e.b], lattice.nodeY[e.b]);
    }
    ctx.stroke();
  }

  // Source pulses subtly (the "pull" driving the whole organism, a size
  // pulse only -- no glow, matching the matte reference photos); sinks hold
  // a steady size so the direction of flow reads at a glance.
  function drawTerminal(idx, isSource, now) {
    const x = lattice.nodeX[idx], y = lattice.nodeY[idx];
    const pulse = isSource ? 0.5 + 0.5 * Math.sin(now / 420) : 0;
    const r = 7 + (isSource ? pulse * 1.1 : 0);
    const color = isSource ? '232,84,61' : '76,95,214';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${color})`;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  // Draws one tube as a plain root->tip line (see updateVisuals -- `reach`
  // is how far it's currently extended) -- a single matte stroke, no halo,
  // no shadow. Width and color both track conductivity directly: thin and
  // near-invisible when barely active, up to MAX_TUBE_WIDTH and solid
  // #a8c93a yellow-green at full conductivity. Matched directly against
  // real Physarum photos (see growth-fx.js header) -- the dark plate must
  // stay visible on both sides of every vein, at every conductivity.
  // alphaMul dims this layer while the undifferentiated sheet (below) is
  // still the dominant read, so exploring doesn't already look like a
  // "finished" differentiated network.
  function drawTube(e, visMax, alphaMul) {
    const r = reach[e];
    if (r <= 0.008) return;
    const t = visMax > 0 ? Math.min(1, visD[e] / visMax) : 0;
    const rootIdx = edgeRootNode[e], tipIdx = edgeTipNode[e];
    const rx = lattice.nodeX[rootIdx], ry = lattice.nodeY[rootIdx];
    const tx = lattice.nodeX[tipIdx], ty = lattice.nodeY[tipIdx];
    const ex = rx + (tx - rx) * r, ey = ry + (ty - ry) * r;
    const width = MIN_TUBE_WIDTH + (MAX_TUBE_WIDTH - MIN_TUBE_WIDTH) * t;
    const { r: cr, g: cg, b: cb } = window.PhysarumFX.activityColor(t);
    const alpha = (0.1 + t * 0.85) * alphaMul;

    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(ex, ey);
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(3)})`;
    ctx.stroke();
  }

  // The undifferentiated protoplasmic-sheet stage (Tero et al. 2010, panels
  // B/C) -- real Physarum doesn't grow as distinct tubes at first, it
  // spreads as a diffuse, translucent fan. Approximated here with wide,
  // very-low-alpha strokes along the same root->tip lines the real veins
  // will later occupy: individually barely visible, but this lattice's
  // heavy edge overlap (every node has up to 8 neighbors) accumulates into
  // a soft, textured wash rather than crisp separate lines. Drawn
  // underneath drawTube() so fine radiating texture still shows through,
  // then faded out by sheetOpacity (see updateVisuals) once relaxation
  // starts resolving it into the clean branching network.
  function drawSheetWash(e, opacityMul) {
    if (edgeActivatedFrame[e] < 0) return;
    const r = reach[e];
    if (r <= 0.01) return;
    const rootIdx = edgeRootNode[e], tipIdx = edgeTipNode[e];
    const rx = lattice.nodeX[rootIdx], ry = lattice.nodeY[rootIdx];
    const tx = lattice.nodeX[tipIdx], ty = lattice.nodeY[tipIdx];
    const ex = rx + (tx - rx) * r, ey = ry + (ty - ry) * r;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(ex, ey);
    ctx.lineWidth = cellSize * 0.85;
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(150,190,90,${(SHEET_WASH_ALPHA * opacityMul).toFixed(3)})`;
    ctx.stroke();
  }

  function draw() {
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
    if (!lattice) return;

    if (!solver) drawLatticeGhost();

    if (solver) {
      const visMax = updateVisuals();
      if (sheetOpacity > 0.004) {
        for (let e = 0; e < solver.m; e++) drawSheetWash(e, sheetOpacity);
      }
      const tubeAlphaMul = phase === 'exploring' ? 0.7 : 1;
      for (let e = 0; e < solver.m; e++) drawTube(e, visMax, tubeAlphaMul);
      if (particleField) particleField.draw(ctx, '200,230,110');
    }

    const now = performance.now();
    terminals.forEach((idx, i) => drawTerminal(idx, i === 0, now));
  }

  function frame() {
    if (phase === 'exploring' && running) advanceExploration();
    else if (phase === 'relaxing' && running) advance();
    if (running && (phase === 'exploring' || phase === 'relaxing')) updateParticles();
    draw();
    updateStats();
    requestAnimationFrame(frame);
  }

  // ---------- Controls ----------
  speedRange.addEventListener('input', () => { speedLabel.textContent = speedRange.value; });
  gammaRange.addEventListener('input', () => { gammaLabel.textContent = parseFloat(gammaRange.value).toFixed(1); });
  speedLabel.textContent = speedRange.value;
  gammaLabel.textContent = parseFloat(gammaRange.value).toFixed(1);

  startBtn.addEventListener('click', beginGrowth);
  resetBtn.addEventListener('click', () => { if (solver) resetAll(); });
  clearBtn.addEventListener('click', clearPoints);

  lattice = buildLattice();
  requestAnimationFrame(() => { sizeCanvas(); requestAnimationFrame(frame); });
})();
