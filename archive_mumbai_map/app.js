/* Point-to-point mode, running the real Physarum Solver (physarum-solver.js)
   over Mumbai's actual road network -- a single source (start), a single
   sink (end). See physarum-solver.js for the model itself (Tero et al.
   2007/2010: Kirchhoff's current law + a saturating reinforcement/decay
   ODE on every tube's conductivity, no agents or branching heuristics).

   This file only does: address search/geocoding, map setup, cropping the
   bundled road graph to the region around the two chosen points, driving
   the solver forward each frame within a time budget, and rendering every
   edge with width/color proportional to its live conductivity D_ij. A
   tube's width IS its conductivity -- there is no separate "thickening"
   or "retraction" animation state; tubes with no flow decay to invisible
   as a direct, physical consequence of the same equation that grows the
   surviving ones, exactly like the real time-lapse photography. */

(() => {
  // Coverage area matches the bundled road data in roads-data.js.
  const COVERAGE = { south: 18.88, west: 72.79, north: 19.14, east: 72.93 };
  const MUMBAI_CENTER = [(COVERAGE.south + COVERAGE.north) / 2, (COVERAGE.west + COVERAGE.east) / 2];
  const MUMBAI_ZOOM = 12;
  const MUMBAI_VIEWBOX = `${COVERAGE.west},${COVERAGE.north},${COVERAGE.east},${COVERAGE.south}`; // left,top,right,bottom

  // ---------- Model constants (these ARE the physics, not visual tuning) ----------
  const DT = 0.14;                 // Euler step size for dD/dt = f(|Q|) - D
  const CG_MAX_ITER_FIRST = 120;   // conjugate-gradient iteration cap, first solve (cold start)
  const CG_MAX_ITER_WARM = 18;     // ...every solve after, warm-started from the previous pressures -- deliberately not
                                    // enough for full convergence on a large graph; see physarum-solver.js's note on
                                    // treating this as a fixed per-step compute budget rather than an exact solve
  const MAX_ITERS = 550;           // hard cap on Euler steps regardless of convergence
  const SETTLE_EPS = 0.0006;       // max per-edge |change in D| considered "settled"
  const CONSEC_SETTLE_NEEDED = 10; // ...for this many steps in a row, so a brief plateau doesn't stop it early
  const FRAME_BUDGET_MS = 14;      // don't let one animation frame's worth of solving block the UI

  const CROP_PAD_KM_MIN = 0.55;
  const CROP_PAD_FRACTION = 0.16;  // padding around the start/end bounding box, as a fraction of their straight-line distance -- deliberately tight: a real road graph's parallel-street redundancy makes CG cost grow fast with crop size
  const CROP_EXPAND_FACTOR = 1.9;  // if start and end aren't connected within the crop, widen and retry -- see beginSetup
  const CROP_MAX_ATTEMPTS = 5;

  const VISIBLE_FRACTION = 0.012;  // edges below this fraction of the current max D aren't drawn -- vanished
  const MIN_WIDTH = 0.6;
  const MAX_WIDTH = 8;
  const FLUX_SCALE = 0.05;         // calibrates f(Q)'s knee to this graph's typical per-edge flux -- see physarum-solver.js

  const LANDMARKS = [
    { name: 'Gateway of India', lat: 18.9220, lon: 72.8347 },
    { name: 'Chhatrapati Shivaji Terminus', lat: 18.9398, lon: 72.8355 },
    { name: 'Marine Drive', lat: 18.9440, lon: 72.8236 },
    { name: 'Bandra Bandstand', lat: 19.0400, lon: 72.8203 },
    { name: 'Juhu Beach', lat: 19.0990, lon: 72.8265 },
    { name: 'Andheri Station', lat: 19.1197, lon: 72.8468 },
    { name: 'Powai Lake', lat: 19.1197, lon: 72.9051 },
    { name: 'Bandra Kurla Complex', lat: 19.0669, lon: 72.8679 },
    { name: 'Dadar Station', lat: 19.0186, lon: 72.8446 },
    { name: 'Worli Sea Face', lat: 19.0176, lon: 72.8177 },
    { name: 'Colaba Causeway', lat: 18.9067, lon: 72.8147 },
    { name: 'Kurla Station', lat: 19.0728, lon: 72.8826 },
    { name: 'Chembur', lat: 19.0522, lon: 72.9005 },
    { name: 'Ghatkopar', lat: 19.0864, lon: 72.9081 },
    { name: 'Vile Parle', lat: 19.0999, lon: 72.8438 },
    { name: 'Santacruz', lat: 19.0821, lon: 72.8416 },
    { name: 'Byculla', lat: 18.9750, lon: 72.8330 },
    { name: 'Lower Parel', lat: 19.0000, lon: 72.8300 },
  ];

  const mapEl = document.getElementById('leafletMap');
  const canvas = document.getElementById('mapCanvas');
  const ctx = canvas.getContext('2d');

  const map = L.map(mapEl, {
    center: MUMBAI_CENTER,
    zoom: MUMBAI_ZOOM,
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

  const speedRange = document.getElementById('speedRange');
  const branchRange = document.getElementById('branchRange'); // repurposed: this IS gamma, the model's reinforcement exponent
  const branchLabel = document.getElementById('branchCountLabel');
  const speedLabel = document.getElementById('speedLabel');
  const startBtn = document.getElementById('startBtn');
  const resetBtn = document.getElementById('resetBtn');
  const randomBtn = document.getElementById('randomBtn');
  const hint = document.getElementById('canvasHint');
  const startInput = document.getElementById('startAddressInput');
  const endInput = document.getElementById('endAddressInput');
  const startSuggestions = document.getElementById('startSuggestions');
  const endSuggestions = document.getElementById('endSuggestions');

  const statStatus = document.getElementById('statStatus');
  const statSteps = document.getElementById('statIterations');
  const statActive = document.getElementById('statActive');
  const statTendrils = document.getElementById('statBest');
  const statRoutes = document.getElementById('statRoutes');
  const statPath = document.getElementById('statOptimal');

  let startLL = null, endLL = null;
  let start = null, end = null; // canvas pixel positions of the two chosen points
  let running = false;
  let phase = 'idle'; // idle | relaxing | done | error

  let solver = null;
  let subX = null, subY = null; // canvas pixel positions of every node in the cropped subgraph
  let startFree = -1, endFree = -1; // indices of the two terminals within the cropped subgraph
  let iterations = 0;
  let settledStreak = 0;
  let maxDeltaLast = 0;

  function projectLL(lat, lon) {
    const pt = map.latLngToContainerPoint([lat, lon]);
    return { x: pt.x, y: pt.y };
  }

  function resetAll() {
    startLL = null; endLL = null;
    start = null; end = null;
    running = false;
    phase = 'idle';
    solver = null;
    subX = null; subY = null;
    startFree = -1; endFree = -1;
    iterations = 0;
    settledStreak = 0;
    maxDeltaLast = 0;
    startInput.value = '';
    endInput.value = '';
    startSuggestions.classList.remove('open');
    endSuggestions.classList.remove('open');
    startBtn.textContent = 'Grow';
    startBtn.disabled = true;
    hint.textContent = 'Search an address, or click the map, to drop a start point.';
    map.setView(MUMBAI_CENTER, MUMBAI_ZOOM, { animate: false });
    updateStats();
    draw();
  }

  function gamma() {
    return parseFloat(branchRange.value);
  }
  function stepsPerFrame() {
    return parseInt(speedRange.value, 10);
  }

  // ---------- Geocoding ----------

  async function forwardGeocode(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&viewbox=${MUMBAI_VIEWBOX}&bounded=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('geocoding failed');
    return res.json();
  }

  async function reverseGeocode(lat, lon) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
      const res = await fetch(url);
      const data = await res.json();
      return data.display_name || null;
    } catch {
      return null;
    }
  }

  function attachAddressSearch(input, suggestionsEl, onSelect) {
    let debounceTimer = null;
    input.addEventListener('input', () => {
      const q = input.value.trim();
      clearTimeout(debounceTimer);
      if (q.length < 3) {
        suggestionsEl.innerHTML = '';
        suggestionsEl.classList.remove('open');
        return;
      }
      debounceTimer = setTimeout(async () => {
        let results = [];
        try {
          results = await forwardGeocode(q);
        } catch {
          results = [];
        }
        suggestionsEl.innerHTML = '';
        if (!results.length) {
          const div = document.createElement('div');
          div.className = 'suggestion-empty';
          div.textContent = 'No matches';
          suggestionsEl.appendChild(div);
        } else {
          results.forEach((r) => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.textContent = r.display_name;
            div.addEventListener('click', () => {
              onSelect({ lat: parseFloat(r.lat), lon: parseFloat(r.lon), label: r.display_name });
              suggestionsEl.innerHTML = '';
              suggestionsEl.classList.remove('open');
            });
            suggestionsEl.appendChild(div);
          });
        }
        suggestionsEl.classList.add('open');
      }, 400);
    });
  }

  document.addEventListener('click', (e) => {
    if (!startSuggestions.contains(e.target) && e.target !== startInput) {
      startSuggestions.classList.remove('open');
    }
    if (!endSuggestions.contains(e.target) && e.target !== endInput) {
      endSuggestions.classList.remove('open');
    }
  });

  attachAddressSearch(startInput, startSuggestions, (pt) => {
    startInput.value = pt.label;
    setStart(pt);
  });
  attachAddressSearch(endInput, endSuggestions, (pt) => {
    endInput.value = pt.label;
    setEnd(pt);
  });

  function setStart(pt) {
    startLL = { lat: pt.lat, lon: pt.lon };
    start = projectLL(pt.lat, pt.lon);
    draw();
    if (endLL) beginSetup(); else { hint.textContent = 'Now search or click an end point.'; updateStats(); }
  }
  function setEnd(pt) {
    endLL = { lat: pt.lat, lon: pt.lon };
    end = projectLL(pt.lat, pt.lon);
    draw();
    if (startLL) beginSetup(); else { hint.textContent = 'Now search or click a start point.'; updateStats(); }
  }

  canvas.addEventListener('click', async (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const latlng = map.containerPointToLatLng([x, y]);

    if (startLL && endLL) {
      resetAll();
    }

    const label = (await reverseGeocode(latlng.lat, latlng.lng)) || `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
    if (!startLL) {
      startInput.value = label;
      setStart({ lat: latlng.lat, lon: latlng.lng, label });
    } else if (!endLL) {
      endInput.value = label;
      setEnd({ lat: latlng.lat, lon: latlng.lng, label });
    }
  });

  // ---------- Road graph ----------

  let fullGraph = null; // built once from ROADS_DATA -- see physarum-solver.js
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

  function beginSetup() {
    running = false;
    startBtn.disabled = true;

    if (!isWithinCoverage(startLL.lat, startLL.lon) || !isWithinCoverage(endLL.lat, endLL.lon)) {
      phase = 'error';
      hint.textContent = 'That\'s outside the covered area (South Mumbai through Bandra, Andheri, Powai, Ghatkopar & Chembur) — try Reset and pick points within it, or use Random landmarks.';
      updateStats();
      draw();
      return;
    }

    const bounds = L.latLngBounds([startLL.lat, startLL.lon], [endLL.lat, endLL.lon]);
    map.fitBounds(bounds, { paddingTopLeft: [70, 70], paddingBottomRight: [70, 70], animate: false });
    start = projectLL(startLL.lat, startLL.lon);
    end = projectLL(endLL.lat, endLL.lon);

    try {
      const graph = ensureFullGraphBuilt();
      const startIdx = PhysarumGraph.nearestNode(graph, startLL.lat, startLL.lon);
      const endIdx = PhysarumGraph.nearestNode(graph, endLL.lat, endLL.lon);
      if (startIdx < 0 || endIdx < 0) throw new Error('No roads found nearby');

      // Crop to a padded box around the two points -- covering only the map
      // area that matters, the same way the real experiments only ever
      // cover the agar plate with the relevant region -- then take the
      // connected component within that crop. The tight default padding
      // keeps the common case fast, but some pairs genuinely need a wider
      // detour (water, parks, one-way sections) to connect at all, so widen
      // and retry rather than erroring out on the first attempt.
      const straightKm = PhysarumGraph.haversineMeters(startLL.lat, startLL.lon, endLL.lat, endLL.lon) / 1000;
      const south = Math.min(startLL.lat, endLL.lat), north = Math.max(startLL.lat, endLL.lat);
      const west = Math.min(startLL.lon, endLL.lon), east = Math.max(startLL.lon, endLL.lon);
      const midLat = (south + north) / 2;

      let mask = null;
      for (let attempt = 0; attempt < CROP_MAX_ATTEMPTS; attempt++) {
        const padKm = Math.max(CROP_PAD_KM_MIN, straightKm * CROP_PAD_FRACTION) * CROP_EXPAND_FACTOR ** attempt;
        const padDegLat = padKm / 111;
        const padDegLon = padKm / (111 * Math.max(0.2, Math.cos((midLat * Math.PI) / 180)));
        const bbox = { south: south - padDegLat, north: north + padDegLat, west: west - padDegLon, east: east + padDegLon };

        const bboxMask = new Uint8Array(graph.ids.length);
        for (let i = 0; i < graph.ids.length; i++) {
          if (graph.lat[i] >= bbox.south && graph.lat[i] <= bbox.north && graph.lon[i] >= bbox.west && graph.lon[i] <= bbox.east) {
            bboxMask[i] = 1;
          }
        }
        const candidate = PhysarumGraph.connectedComponentMasked(graph, startIdx, bboxMask);
        if (candidate[endIdx]) { mask = candidate; break; }
      }
      if (!mask) throw new Error('disconnected');

      const sub = PhysarumGraph.subgraphFromMask(graph, mask);
      subX = new Float64Array(sub.count);
      subY = new Float64Array(sub.count);
      for (let i = 0; i < sub.count; i++) {
        const full = sub.unmap[i];
        const pt = projectLL(graph.lat[full], graph.lon[full]);
        subX[i] = pt.x;
        subY[i] = pt.y;
      }
      startFree = sub.remap[startIdx];
      endFree = sub.remap[endIdx];

      beginGrowth(sub);
    } catch (err) {
      console.error('Road setup failed:', err);
      phase = 'error';
      hint.textContent = 'Could not build a route between those points — try Reset and different points.';
      updateStats();
      draw();
    }
  }

  // ---------- Solver drive ----------

  function beginGrowth(sub) {
    solver = new PhysarumSolver(sub.count, sub.edges, gamma(), FLUX_SCALE);
    const flux = new Map([[startFree, 1], [endFree, -1]]);
    solver.setFlux(flux, startFree);

    running = true;
    phase = 'relaxing';
    iterations = 0;
    settledStreak = 0;
    maxDeltaLast = 0;

    startBtn.textContent = 'Pause';
    startBtn.disabled = false;
    hint.textContent = `Relaxing the tube network across ${sub.edges.length.toLocaleString()} road segments — every tube starts equal, then thins to the ones actually carrying flow…`;
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
      hint.textContent = 'Settled — this is the model\'s answer.';
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

  function pathLengthKm() {
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
      statRoutes.textContent = phase === 'done' ? 'Settled' : maxDeltaLast.toFixed(4);
    } else {
      statActive.textContent = '0';
      statTendrils.textContent = '—';
      statRoutes.textContent = '—';
    }
    if (phase === 'idle' && !startLL) statStatus.textContent = 'Waiting for start point';
    else if (phase === 'idle' && !endLL) statStatus.textContent = 'Waiting for end point';
    else if (phase === 'error') statStatus.textContent = 'Error';
    else if (phase === 'done') statStatus.textContent = 'Settled';
    else if (running) statStatus.textContent = 'Relaxing…';
    else statStatus.textContent = 'Paused';
    statPath.textContent = phase === 'done' ? `${pathLengthKm().toFixed(2)} km` : '—';
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
      // Faint tubes (t <= 0.5) all share one path/stroke call for
      // performance -- there can be tens of thousands of them early on,
      // before the network has thinned out.
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

      // Strong tubes (t > 0.5) drawn individually so width/color can vary continuously with D.
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

    drawPoint(start, '#2e9e4f', 'START');
    drawPoint(end, '#e0483e', 'END');
  }

  function drawPoint(p, color, label) {
    if (!p) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillStyle = '#1a2420';
    ctx.textAlign = 'center';
    ctx.fillText(label, p.x, p.y - 16);
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
    if (!startLL || !endLL || phase !== 'relaxing') return;
    running = !running;
    startBtn.textContent = running ? 'Pause' : 'Resume';
  });

  resetBtn.addEventListener('click', resetAll);

  randomBtn.addEventListener('click', () => {
    resetAll();
    const a = LANDMARKS[Math.floor(Math.random() * LANDMARKS.length)];
    let b = LANDMARKS[Math.floor(Math.random() * LANDMARKS.length)];
    while (b.name === a.name) b = LANDMARKS[Math.floor(Math.random() * LANDMARKS.length)];
    startInput.value = a.name;
    endInput.value = b.name;
    setStart({ lat: a.lat, lon: a.lon, label: a.name });
    setEnd({ lat: b.lat, lon: b.lon, label: b.name });
  });

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
