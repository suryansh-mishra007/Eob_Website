/* Station Network mode, running the real Physarum Solver (physarum-solver.js)
   over Mumbai's rail stations -- this recreates the actual Tero et al.
   2010 Science paper methodology, including its own simplification for
   the multi-city case: rather than every city being a source, ONE station
   is designated the mathematical source (I_i = +1) and every other
   station is a sink absorbing an equal share (I_i = -1/7 each). The paper
   explicitly notes -- and we rely on the same fact -- that which station
   is picked as source is arbitrary and doesn't change the resulting
   network, since the underlying equations only depend on relative
   pressure. There is still no "chosen start point" in the sense of
   picking an origin/destination pair: all eight stations are terminals of
   the same simultaneous relaxation, exactly like the real experiment
   placing oat flakes at every city at once.

   See physarum-solver.js for the model itself. This file only does:
   station setup, cropping the bundled road graph to the region spanning
   all eight stations, driving the solver forward each frame within a
   time budget, and rendering every road segment with width/color
   proportional to its live conductivity D_ij -- the minimal network that
   still connects every station emerges directly from that rendering, not
   from a separate pruning pass.

   Self-contained (own IIFE, own Leaflet instance) so the point-to-point
   mode in app.js is never at risk -- both files share only
   physarum-solver.js, loaded once before either. */

(() => {
  const COVERAGE = { south: 18.88, west: 72.79, north: 19.14, east: 72.93 };

  // Eight of Mumbai's major suburban rail stations that fall inside the bundled
  // bbox. Coordinates are public, well-known station locations (same sourcing
  // approach as app.js's LANDMARKS -- no live geocoding). Borivali, Thane,
  // Mulund, and Kalyan were dropped: all fall outside COVERAGE (north/east of
  // the bundled South Mumbai -> Andheri/Powai/Ghatkopar/Chembur area).
  const STATIONS = [
    { name: 'Churchgate', lat: 18.9322, lon: 72.8264 },
    { name: 'CST', lat: 18.9398, lon: 72.8355 },
    { name: 'Dadar', lat: 19.0186, lon: 72.8446 },
    { name: 'Bandra', lat: 19.0544, lon: 72.8406 },
    { name: 'Andheri', lat: 19.1197, lon: 72.8468 },
    { name: 'Kurla', lat: 19.0728, lon: 72.8826 },
    { name: 'Ghatkopar', lat: 19.0864, lon: 72.9081 },
    { name: 'Vikhroli', lat: 19.1077, lon: 72.9296 },
  ];

  // ---------- Model constants (same physics as app.js, see physarum-solver.js) ----------
  const DT = 0.14;
  const CG_MAX_ITER_FIRST = 150;
  const CG_MAX_ITER_WARM = 20;     // deliberately not enough for full convergence on this large a graph --
                                    // see physarum-solver.js's note on treating this as a fixed per-step
                                    // compute budget (with Jacobi preconditioning) rather than an exact solve
  const MAX_ITERS = 1600; // coordinating flow across all 8 stations at once genuinely takes longer to
                           // settle than the 2-terminal case in app.js -- confirmed via testing that network
                           // length keeps climbing while regions are still differentiating, then falls once
                           // full connectivity is reached, plateauing well before this cap in practice
  const SETTLE_EPS = 0.0006;
  const CONSEC_SETTLE_NEEDED = 10;
  const FRAME_BUDGET_MS = 14;

  const CROP_PAD_KM = 2.5; // flat padding around the stations' bounding box -- they already span most of the bundled map

  const VISIBLE_FRACTION = 0.012;
  const MIN_WIDTH = 0.6;
  const MAX_WIDTH = 8;
  const FLUX_SCALE = 0.05; // calibrates f(Q)'s knee to this graph's typical per-edge flux -- see physarum-solver.js

  const mapEl = document.getElementById('networkLeafletMap');
  const canvas = document.getElementById('networkMapCanvas');
  const ctx = canvas.getContext('2d');

  const map = L.map(mapEl, {
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    touchZoom: false,
    tap: false,
    attributionControl: true,
  });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  }).addTo(map);

  let LOGICAL_W = 800;
  let LOGICAL_H = 600;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  function sizeCanvas() {
    const rect = mapEl.getBoundingClientRect();
    LOGICAL_W = rect.width;
    LOGICAL_H = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = LOGICAL_W * dpr;
    canvas.height = LOGICAL_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    map.invalidateSize();
  }
  sizeCanvas();
  window.addEventListener('resize', sizeCanvas);

  const speedRange = document.getElementById('networkSpeedRange');
  const branchRange = document.getElementById('networkBranchRange'); // repurposed: this IS gamma
  const branchLabel = document.getElementById('networkBranchCountLabel');
  const speedLabel = document.getElementById('networkSpeedLabel');
  const startBtn = document.getElementById('networkStartBtn');
  const resetBtn = document.getElementById('networkResetBtn');
  const hint = document.getElementById('networkCanvasHint');

  const statStatus = document.getElementById('networkStatStatus');
  const statSteps = document.getElementById('networkStatSteps');
  const statActive = document.getElementById('networkStatActive');
  const statTendrils = document.getElementById('networkStatTendrils');
  const statConnected = document.getElementById('networkStatConnected');
  const statConnectors = document.getElementById('networkStatConnectors');
  const statLength = document.getElementById('networkStatLength');

  let stationPositions = [];
  let running = false;
  let phase = 'idle'; // idle | relaxing | done | error

  let solver = null;
  let subX = null, subY = null;
  let stationFree = []; // indices of the 8 stations within the cropped subgraph
  let dsuParent = null; // reused each frame for the "stations connected" live stat
  let iterations = 0;
  let settledStreak = 0;
  let maxDeltaLast = 0;

  function projectLL(lat, lon) {
    const pt = map.latLngToContainerPoint([lat, lon]);
    return { x: pt.x, y: pt.y };
  }

  function resetAll() {
    running = false;
    phase = 'idle';
    solver = null;
    subX = null; subY = null;
    stationFree = [];
    dsuParent = null;
    iterations = 0;
    settledStreak = 0;
    maxDeltaLast = 0;
    startBtn.textContent = 'Grow';
    startBtn.disabled = false;
    hint.textContent = 'Eight stations, relaxing at once — press Grow to begin.';

    const bounds = L.latLngBounds(STATIONS.map((s) => [s.lat, s.lon]));
    map.fitBounds(bounds, { paddingTopLeft: [60, 60], paddingBottomRight: [60, 60], animate: false });
    stationPositions = STATIONS.map((s) => projectLL(s.lat, s.lon));

    updateStats();
    draw();
  }

  function gamma() {
    return parseFloat(branchRange.value);
  }
  function stepsPerFrame() {
    return parseInt(speedRange.value, 10);
  }

  // ---------- Road graph ----------

  let fullGraph = null;
  function ensureFullGraphBuilt() {
    if (!fullGraph) fullGraph = PhysarumGraph.buildFullGraph(ROADS_DATA);
    return fullGraph;
  }

  function isWithinCoverage(lat, lon) {
    const marginLat = (COVERAGE.north - COVERAGE.south) * 0.08;
    const marginLon = (COVERAGE.east - COVERAGE.west) * 0.08;
    return lat >= COVERAGE.south - marginLat && lat <= COVERAGE.north + marginLat &&
           lon >= COVERAGE.west - marginLon && lon <= COVERAGE.east + marginLon;
  }

  // ---------- Setup ----------

  function startGrowthSequence() {
    if (phase !== 'idle' && phase !== 'error') return;
    running = false;
    startBtn.disabled = true;

    if (STATIONS.some((s) => !isWithinCoverage(s.lat, s.lon))) {
      phase = 'error';
      hint.textContent = 'A station falls outside the covered road data — try Reset.';
      updateStats();
      draw();
      return;
    }

    try {
      const graph = ensureFullGraphBuilt();
      const stationIdx = STATIONS.map((s) => PhysarumGraph.nearestNode(graph, s.lat, s.lon));
      if (stationIdx.some((i) => i < 0)) throw new Error('Could not snap a station onto the road network');

      const lats = STATIONS.map((s) => s.lat), lons = STATIONS.map((s) => s.lon);
      const south = Math.min(...lats), north = Math.max(...lats);
      const west = Math.min(...lons), east = Math.max(...lons);
      const midLat = (south + north) / 2;
      const padDegLat = CROP_PAD_KM / 111;
      const padDegLon = CROP_PAD_KM / (111 * Math.max(0.2, Math.cos((midLat * Math.PI) / 180)));
      const bbox = { south: south - padDegLat, north: north + padDegLat, west: west - padDegLon, east: east + padDegLon };

      const bboxMask = new Uint8Array(graph.ids.length);
      for (let i = 0; i < graph.ids.length; i++) {
        if (graph.lat[i] >= bbox.south && graph.lat[i] <= bbox.north && graph.lon[i] >= bbox.west && graph.lon[i] <= bbox.east) {
          bboxMask[i] = 1;
        }
      }
      const mask = PhysarumGraph.connectedComponentMasked(graph, stationIdx[0], bboxMask);
      if (stationIdx.some((i) => !mask[i])) throw new Error('A station is disconnected from the others in the road graph');

      const sub = PhysarumGraph.subgraphFromMask(graph, mask);
      subX = new Float64Array(sub.count);
      subY = new Float64Array(sub.count);
      for (let i = 0; i < sub.count; i++) {
        const full = sub.unmap[i];
        const pt = projectLL(graph.lat[full], graph.lon[full]);
        subX[i] = pt.x;
        subY[i] = pt.y;
      }
      stationFree = stationIdx.map((i) => sub.remap[i]);
      dsuParent = new Int32Array(sub.count);

      beginGrowth(sub);
    } catch (err) {
      console.error('Road setup failed:', err);
      phase = 'error';
      hint.textContent = 'Could not connect the stations through the road network — try Reset.';
      updateStats();
      draw();
    }
  }

  // ---------- Solver drive ----------

  function beginGrowth(sub) {
    solver = new PhysarumSolver(sub.count, sub.edges, gamma(), FLUX_SCALE);
    // One station is the mathematical source, the rest split the sink flux
    // evenly -- see the file header for why (Tero et al. 2010's own
    // simplification for the multi-terminal case).
    const flux = new Map();
    flux.set(stationFree[0], 1);
    for (let i = 1; i < stationFree.length; i++) flux.set(stationFree[i], -1 / (stationFree.length - 1));
    solver.setFlux(flux, stationFree[0]);

    running = true;
    phase = 'relaxing';
    iterations = 0;
    settledStreak = 0;
    maxDeltaLast = 0;

    startBtn.textContent = 'Pause';
    startBtn.disabled = false;
    hint.textContent = `Relaxing the tube network across ${sub.edges.length.toLocaleString()} road segments spanning all 8 stations — this one takes longer than the two-point model, since flow has to coordinate across all eight at once…`;
  }

  function advance() {
    const frameStart = performance.now();
    const steps = stepsPerFrame();
    for (let i = 0; i < steps; i++) {
      if (iterations >= MAX_ITERS) break;
      const cgCap = iterations === 0 ? CG_MAX_ITER_FIRST : CG_MAX_ITER_WARM;
      maxDeltaLast = solver.stepEuler(DT, cgCap);
      iterations++;
      settledStreak = maxDeltaLast < SETTLE_EPS ? settledStreak + 1 : 0;
      if (performance.now() - frameStart > FRAME_BUDGET_MS) break;
      if (settledStreak >= CONSEC_SETTLE_NEEDED || iterations >= MAX_ITERS) break;
    }
    if (settledStreak >= CONSEC_SETTLE_NEEDED || iterations >= MAX_ITERS) {
      phase = 'done';
      running = false;
      hint.textContent = `Settled — the network connecting ${stationsConnectedCount()} of ${STATIONS.length} stations.`;
    }
  }

  // ---------- Stats ----------

  function maxD() {
    if (!solver) return 0;
    let m = 0;
    for (let e = 0; e < solver.D.length; e++) if (solver.D[e] > m) m = solver.D[e];
    return m;
  }

  function visibleEdgeCount(threshold) {
    if (!solver) return 0;
    let n = 0;
    for (let e = 0; e < solver.D.length; e++) if (solver.D[e] >= threshold) n++;
    return n;
  }

  // Live connectivity of the 8 stations through tubes currently above the
  // visibility threshold -- a union-find rebuilt each call over the
  // "strong enough to still be part of the network" subgraph (cheap: only
  // as many edges as are currently visible).
  function dsuFind(parent, i) {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  }
  function stationsConnectedCount() {
    if (!solver || !dsuParent) return 0;
    for (let i = 0; i < dsuParent.length; i++) dsuParent[i] = i;
    const threshold = maxD() * VISIBLE_FRACTION;
    const { edgeA, edgeB } = solver;
    for (let e = 0; e < solver.m; e++) {
      if (solver.D[e] < threshold) continue;
      const a = edgeA[e], b = edgeB[e];
      const ra = dsuFind(dsuParent, a), rb = dsuFind(dsuParent, b);
      if (ra !== rb) dsuParent[ra] = rb;
    }
    const root = dsuFind(dsuParent, stationFree[0]);
    let count = 1;
    for (let i = 1; i < stationFree.length; i++) if (dsuFind(dsuParent, stationFree[i]) === root) count++;
    return count;
  }

  function networkLengthKm() {
    if (!solver) return 0;
    const threshold = maxD() * VISIBLE_FRACTION;
    let meters = 0;
    for (let e = 0; e < solver.m; e++) {
      if (solver.D[e] >= threshold) meters += solver.L[e];
    }
    return meters / 1000;
  }

  function updateStats() {
    statSteps.textContent = iterations.toLocaleString();
    if (solver) {
      const m = maxD();
      const threshold = m * VISIBLE_FRACTION;
      statActive.textContent = visibleEdgeCount(threshold).toLocaleString();
      statTendrils.textContent = solver.m.toLocaleString();
      statConnected.textContent = `${stationsConnectedCount()} / ${STATIONS.length}`;
      statConnectors.textContent = phase === 'done' ? 'Settled' : maxDeltaLast.toFixed(4);
    } else {
      statActive.textContent = '0';
      statTendrils.textContent = '—';
      statConnected.textContent = phase === 'idle' ? '—' : `0 / ${STATIONS.length}`;
      statConnectors.textContent = '—';
    }
    if (phase === 'idle') statStatus.textContent = 'Ready';
    else if (phase === 'error') statStatus.textContent = 'Error';
    else if (phase === 'done') statStatus.textContent = 'Settled';
    else if (running) statStatus.textContent = 'Relaxing…';
    else statStatus.textContent = 'Paused';
    statLength.textContent = phase === 'done' || phase === 'relaxing' ? `${networkLengthKm().toFixed(2)} km` : '—';
  }

  // ---------- Rendering ----------

  function tubeColor(t) {
    const r = Math.round(46 + (255 - 46) * t);
    const g = Math.round(158 + (185 - 158) * t);
    const b = Math.round(79 + (20 - 79) * t);
    return `${r},${g},${b}`;
  }

  function draw() {
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

    if (solver && subX) {
      const { edgeA, edgeB } = solver;
      const m = maxD();
      const threshold = m * VISIBLE_FRACTION;
      ctx.beginPath();
      for (let e = 0; e < solver.m; e++) {
        const d = solver.D[e];
        if (d < threshold) continue;
        const t = m > 0 ? Math.min(1, d / m) : 0;
        if (t > 0.5) continue;
        const a = edgeA[e], b = edgeB[e];
        ctx.moveTo(subX[a], subY[a]);
        ctx.lineTo(subX[b], subY[b]);
      }
      ctx.strokeStyle = 'rgba(46,158,79,0.55)';
      ctx.lineWidth = MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * 0.4;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 0;
      ctx.stroke();

      for (let e = 0; e < solver.m; e++) {
        const d = solver.D[e];
        const t = m > 0 ? Math.min(1, d / m) : 0;
        if (t <= 0.5) continue;
        const a = edgeA[e], b = edgeB[e];
        const width = MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * t;
        ctx.beginPath();
        ctx.moveTo(subX[a], subY[a]);
        ctx.lineTo(subX[b], subY[b]);
        ctx.strokeStyle = `rgba(${tubeColor(t)},0.95)`;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.shadowColor = `rgba(${tubeColor(t)},0.85)`;
        ctx.shadowBlur = phase === 'done' ? 4 + t * 8 : 0;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    for (let s = 0; s < STATIONS.length; s++) {
      drawStationPoint(stationPositions[s], STATIONS[s].name);
    }
  }

  function drawStationPoint(p, label) {
    if (!p) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#2e9e4f';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#1a2420';
    ctx.textAlign = 'center';
    ctx.fillText(label, p.x, p.y - 13);
  }

  function simTick() {
    if (phase === 'relaxing' && running) {
      advance();
    }
    draw();
    updateStats();
  }

  function frame() {
    simTick();
    requestAnimationFrame(frame);
  }

  // ---------- Controls ----------

  startBtn.addEventListener('click', () => {
    if (phase === 'idle' || phase === 'error') { startGrowthSequence(); return; }
    if (phase === 'relaxing') {
      running = !running;
      startBtn.textContent = running ? 'Pause' : 'Resume';
    }
  });

  resetBtn.addEventListener('click', resetAll);

  branchRange.addEventListener('input', () => {
    branchLabel.textContent = parseFloat(branchRange.value).toFixed(1);
    if (solver) solver.gamma = gamma();
  });
  speedRange.addEventListener('input', () => {
    speedLabel.textContent = `${speedRange.value}/frame`;
  });

  branchLabel.textContent = parseFloat(branchRange.value).toFixed(1);
  speedLabel.textContent = `${speedRange.value}/frame`;

  resetAll();
  requestAnimationFrame(frame);
})();
