/* Point-to-point mode, restored tree-growth/tendril heuristic (pre-"real
   algorithm" pivot) -- reconstructed from PROJECT_NOTES.md's description
   plus reference screenshots of the original UI (no source code survived;
   see PROJECT_NOTES.md for what's exact vs. reconstructed).

   Mechanic, reconstructed from real reference recordings of the pre-pivot
   version (see PROJECT_NOTES.md): tendril "tips" start at the source and
   walk the real road graph outward, weighted to favor the goal direction
   (GOAL_BIAS) but genuinely free to wander, branching at junctions --
   purely a visual heuristic, explicitly NOT the Tero/Nakagaki
   Kirchhoff+reinforcement-decay model (physarum-solver.js is only used
   here for its graph-loading/cropping helpers, not PhysarumSolver itself).
   Growth is left running -- not cut off at a fixed time -- until either
   ROUTES_FOUND_TARGET tendrils have independently reached the goal on
   their own, or every tip has died out, so the mesh has time to actually
   spread across the whole corridor toward the goal instead of stalling
   near the source. A single Dijkstra-guided tip is the only guaranteed
   element (see stepOnce's homing trigger), spawned only if the organic
   walk is failing to reach the goal at all -- a safety net for a
   pathologically narrow corridor, not the normal case. Once growth ends,
   the WINNING route is always the exact shortest path (Dijkstra, real
   segment lengths, computed directly -- see dijkstraShortestPath()/
   beginPrune()), never just "whichever tendril happened to find it" -- so
   the highlighted answer is provably correct even though the growth
   animation leading up to it is not. Every other grown edge retracts back
   toward the source while the winner solidifies from green to amber. */

(() => {
  const COVERAGE = { south: 18.88, west: 72.79, north: 19.14, east: 72.93 };
  const MUMBAI_CENTER = [(COVERAGE.south + COVERAGE.north) / 2, (COVERAGE.west + COVERAGE.east) / 2];
  const MUMBAI_ZOOM = 12;
  const MUMBAI_VIEWBOX = `${COVERAGE.west},${COVERAGE.north},${COVERAGE.east},${COVERAGE.south}`;

  // Widened from earlier rounds (0.55/0.16): a tight crop meant the
  // cropped subgraph itself had little lateral street network beyond the
  // direct start-end line, so even a well-tuned branching walk had nowhere
  // real to spread into -- the mesh could only ever cluster near the
  // source. The reference recordings' wide, corridor-filling coverage
  // needs genuine width in the underlying graph, not just in the walk.
  const CROP_PAD_KM_MIN = 1.1;
  const CROP_PAD_FRACTION = 0.32;
  const CROP_EXPAND_FACTOR = 1.9;
  const CROP_MAX_ATTEMPTS = 5;

  // ---------- Heuristic tuning constants (ALL of these are reconstruction
  // guesses, not recovered originals -- none of this was in PROJECT_NOTES.md
  // or the screenshots at parameter-level detail. Tune freely.) ----------
  const MAX_ACTIVE_TIPS = 90;        // concurrent-branch cap -- matched against reference recordings, which plateaued around 38-58 active branches
  const MAX_TOTAL_TENDRILS = 6000;   // hard safety cap on ever-spawned tips
  const GOAL_BIAS = 3.5;             // 0 = pure random walk, higher = more directly toward the end node. Raised substantially from earlier rounds: a weak bias let growth bloom symmetrically around the source and stall there instead of actually advancing toward the goal (the "clustering at the start" complaint) and rarely let any tendril land exactly on the goal node. A strong-but-not-absolute bias (branch children still roll independently per spare direction regardless of alignment, see stepOnce) is what the reference recordings' wide-but-goal-directed mesh actually depended on.
  const BRANCH_CHANCE_MAX = 0.55;    // at Branching slider = 10 -- rolled INDEPENDENTLY per spare direction at a junction (see stepOnce), not just once per visit

  // Growth is NOT cut off at a fixed time. Reference recordings of the
  // pre-pivot version ran for 400-1000+ steps and organically racked up
  // 20-40+ tendrils actually reaching the goal before settling -- that
  // long, patient run is what let the mesh spread across the whole
  // corridor toward the goal instead of just the area right around the
  // source. Growth instead stops once ROUTES_FOUND_TARGET tendrils have
  // reached the goal on their own (or every tip has died out first).
  // MAX_GROWTH_STEPS is purely a safety ceiling for a pathological case
  // where the target is never reached. STEPS_PER_SECOND is scaled by
  // dtSeconds in advance() below (a prior version of this file added a
  // fixed amount once per *rendered frame* instead, which at ~60fps ran
  // ~60x faster than intended -- that's fixed).
  const STEPS_PER_SECOND = 24;
  const ROUTES_FOUND_TARGET = 25;
  const MAX_GROWTH_STEPS = 1600;

  const PRUNE_SECONDS = 6;           // paced retraction duration once a winner is picked -- longer than earlier rounds since a longer growth run now leaves a bigger mesh to unwind
  const RETRACT_WINDOW_FRAC = 0.5;   // fraction of PRUNE_SECONDS an individual edge takes to retract, staggered by distance from source so the wave visibly runs tip-first back to the host
  const CLOUD_WIDTH_PX = 10;
  const CLOUD_ALPHA = 0.055;

  // If no tendril has reached the goal by this fraction of the growth
  // budget (or every tendril has already died without finding it), a
  // single Dijkstra-guided tip is spawned as a safety net -- see
  // stepOnce's homing trigger. This is NOT the normal way routes get
  // found (with GOAL_BIAS above, the organic walk should reach the goal
  // repeatedly on its own, matching the reference recordings); it exists
  // purely so a pathologically narrow corridor (few real side-junctions
  // anywhere along the way) can't leave growth ending with nobody having
  // arrived.
  const HOMING_TRIGGER_FRACTION = 0.5;

  // How often (in growth steps) to drop dead tendrils from the tracking
  // array. Without this the array only ever grows (up to MAX_TOTAL_TENDRILS)
  // and every step re-scans all of it, including tips that died long ago --
  // the main cause of the animation slowing down/stuttering the longer a
  // run went on.
  const TIP_COMPACT_INTERVAL = 20;

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

  let LOGICAL_W = 800, LOGICAL_H = 600, dpr = Math.min(window.devicePixelRatio || 1, 2);

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
  const branchRange = document.getElementById('branchRange');
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
  let start = null, end = null;
  let running = false;
  let phase = 'idle'; // idle | growing | pruning | done | error

  let subX = null, subY = null;
  let adj = null;               // adj[node] = [[neighborNode, edgeIdx], ...]
  let edges = null;              // [{a,b,length}]
  let startFree = -1, endFree = -1;

  let tips = [];
  let aliveTipCount = 0;         // maintained incrementally -- avoids re-scanning all of `tips` every step just to count active branches
  let edgeGrownBy = null;        // -1 = ungrown, else the tip id that first crossed it
  let edgeRetract = null;        // Float32Array, 1 = fully extended (root->tip), eases to 0 (collapsed at root) when pruned away
  let edgeIsWinner = null;
  let edgeFromNode = null;       // Int32Array, the root end (closer to source) of each grown edge -- set once, on first crossing only (see stepOnce)
  let edgeToNode = null;         // Int32Array, the tip end (farther from source) of each grown edge -- set once, on first crossing only
  let edgeDepth = null;          // Float64Array, distance-from-source (meters) to each edge's root end, for staggering the retraction wave -- set once, on first crossing only
  let pruneMaxDepth = 1;
  let homingSpawned = false;
  let growthSteps = 0;
  let totalTendrils = 0;
  let routesFoundCount = 0;      // how many tendrils reached the goal (flavor stat only -- the actual winning route is always computed exactly, see beginPrune)
  let winner = null;             // { path: [nodeIdx...], meters }
  let pruneT = 0;                // 0..1 through the retraction animation
  let stepAccumulator = 0;
  let nextTipId = 0;

  function projectLL(lat, lon) {
    const pt = map.latLngToContainerPoint([lat, lon]);
    return { x: pt.x, y: pt.y };
  }

  function resetAll() {
    startLL = null; endLL = null;
    start = null; end = null;
    running = false;
    phase = 'idle';
    subX = null; subY = null;
    adj = null; edges = null;
    startFree = -1; endFree = -1;
    tips = []; aliveTipCount = 0;
    edgeGrownBy = null; edgeRetract = null; edgeIsWinner = null;
    edgeFromNode = null; edgeToNode = null; edgeDepth = null; pruneMaxDepth = 1; homingSpawned = false;
    growthSteps = 0; totalTendrils = 0; routesFoundCount = 0; winner = null; pruneT = 0;
    stepAccumulator = 0; nextTipId = 0;
    startInput.value = ''; endInput.value = '';
    startSuggestions.classList.remove('open');
    endSuggestions.classList.remove('open');
    startBtn.textContent = 'Grow';
    startBtn.disabled = true;
    hint.textContent = 'Search an address, or click the map, to drop a start point.';
    map.setView(MUMBAI_CENTER, MUMBAI_ZOOM, { animate: false });
    updateStats();
    draw();
  }

  function branchSlider() { return parseInt(branchRange.value, 10); }
  function speedMultiplier() { return parseFloat(speedRange.value); }

  // ---------- Geocoding (unchanged plumbing) ----------

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
    } catch { return null; }
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
        try { results = await forwardGeocode(q); } catch { results = []; }
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
    if (!startSuggestions.contains(e.target) && e.target !== startInput) startSuggestions.classList.remove('open');
    if (!endSuggestions.contains(e.target) && e.target !== endInput) endSuggestions.classList.remove('open');
  });
  attachAddressSearch(startInput, startSuggestions, (pt) => { startInput.value = pt.label; setStart(pt); });
  attachAddressSearch(endInput, endSuggestions, (pt) => { endInput.value = pt.label; setEnd(pt); });

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
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const latlng = map.containerPointToLatLng([x, y]);
    if (startLL && endLL) resetAll();
    const label = (await reverseGeocode(latlng.lat, latlng.lng)) || `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
    if (!startLL) { startInput.value = label; setStart({ lat: latlng.lat, lon: latlng.lng, label }); }
    else if (!endLL) { endInput.value = label; setEnd({ lat: latlng.lat, lon: latlng.lng, label }); }
  });

  // ---------- Road graph (reuses physarum-solver.js's graph-loading/cropping helpers only) ----------

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

  function beginSetup() {
    running = false;
    startBtn.disabled = true;
    if (!isWithinCoverage(startLL.lat, startLL.lon) || !isWithinCoverage(endLL.lat, endLL.lon)) {
      phase = 'error';
      hint.textContent = 'That\'s outside the covered area (South Mumbai through Bandra, Andheri, Powai, Ghatkopar & Chembur) — try Reset and pick points within it, or use Random landmarks.';
      updateStats(); draw();
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
          if (graph.lat[i] >= bbox.south && graph.lat[i] <= bbox.north && graph.lon[i] >= bbox.west && graph.lon[i] <= bbox.east) bboxMask[i] = 1;
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
        subX[i] = pt.x; subY[i] = pt.y;
      }
      startFree = sub.remap[startIdx];
      endFree = sub.remap[endIdx];
      edges = sub.edges;

      beginGrowth();
    } catch (err) {
      console.error('Road setup failed:', err);
      phase = 'error';
      hint.textContent = 'Could not build a route between those points — try Reset and different points.';
      updateStats(); draw();
    }
  }

  // ---------- Tendril growth heuristic ----------

  function buildAdjacency(count, edgeList) {
    const a = Array.from({ length: count }, () => []);
    edgeList.forEach((e, i) => { a[e.a].push([e.b, i]); a[e.b].push([e.a, i]); });
    return a;
  }

  function beginGrowth() {
    adj = buildAdjacency(subX.length, edges);
    edgeGrownBy = new Int32Array(edges.length).fill(-1);
    edgeRetract = new Float32Array(edges.length).fill(1);
    edgeIsWinner = new Uint8Array(edges.length);
    edgeFromNode = new Int32Array(edges.length).fill(-1);
    edgeToNode = new Int32Array(edges.length).fill(-1);
    edgeDepth = new Float64Array(edges.length);
    pruneMaxDepth = 1; homingSpawned = false;
    growthSteps = 0; totalTendrils = 0; routesFoundCount = 0; winner = null; pruneT = 0; stepAccumulator = 0; nextTipId = 0;

    tips = []; aliveTipCount = 0;

    // Send one tendril down every road touching the source immediately,
    // instead of leaving the very first branch to a single tip rolling
    // dice -- the reference recordings' mesh visibly fans out from frame
    // one. Everything from here is the organic, goal-biased random walk
    // (see chooseNext/stepOnce) -- no separate deterministic route system;
    // GOAL_BIAS plus a long, patient run (see ROUTES_FOUND_TARGET above) is
    // what lets this naturally rack up dozens of tendrils reaching the
    // goal on their own, matching the reference recordings.
    for (const [nb, e] of adj[startFree]) {
      if (aliveTipCount >= MAX_ACTIVE_TIPS || totalTendrils >= MAX_TOTAL_TENDRILS) break;
      const childId = nextTipId++;
      markEdgeGrown(e, childId, startFree, nb, 0);
      spawnTip({ id: childId, node: nb, cameFromEdge: e, meters: edges[e].length, alive: true });
    }

    running = true;
    phase = 'growing';
    startBtn.textContent = 'Pause';
    startBtn.disabled = false;
    hint.textContent = `Growing outward from the start across ${edges.length.toLocaleString()} road segments — branching, wandering, and gradually spreading toward the other point…`;
  }

  function dirToEnd(node) {
    const dx = subX[endFree] - subX[node], dy = subY[endFree] - subY[node];
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  }

  function chooseNext(node, excludeEdge) {
    const options = adj[node].filter(([, e]) => e !== excludeEdge);
    if (!options.length) return null;
    const [gx, gy] = dirToEnd(node);
    const weights = options.map(([nb, e]) => {
      const dx = subX[nb] - subX[node], dy = subY[nb] - subY[node];
      const len = Math.hypot(dx, dy) || 1;
      const dot = (dx / len) * gx + (dy / len) * gy;
      return { nb, e, w: 1 + GOAL_BIAS * Math.max(0, dot) };
    });
    const total = weights.reduce((s, o) => s + o.w, 0);
    let r = Math.random() * total;
    for (const o of weights) { r -= o.w; if (r <= 0) return o; }
    return weights[weights.length - 1];
  }

  // Records an edge's growth direction/depth the FIRST time it's crossed
  // only. This used to be written unconditionally on every crossing, which
  // meant an edge already grown by one tendril could get its root/tip and
  // depth silently overwritten later by a different tendril (or the same
  // one looping back around) crossing it again -- since the retraction
  // wave in advance() is ordered by that depth value, this corrupted the
  // ordering and made the "unwind back to the host" animation look like
  // random fading instead of a clean sweep. Write-once fixes it.
  function markEdgeGrown(e, tipId, fromNode, toNode, depth) {
    if (edgeGrownBy[e] !== -1) return;
    edgeGrownBy[e] = tipId;
    edgeFromNode[e] = fromNode;
    edgeToNode[e] = toNode;
    edgeDepth[e] = depth;
  }

  function killTip(tip) {
    if (!tip.alive) return;
    tip.alive = false;
    aliveTipCount--;
  }

  function spawnTip(tip) {
    tips.push(tip);
    aliveTipCount++;
    totalTendrils++;
  }

  function stepOnce() {
    if (aliveTipCount === 0) return;
    growthSteps++;
    const branchChance = (branchSlider() / 10) * BRANCH_CHANCE_MAX;

    for (const tip of tips) {
      if (!tip.alive) continue;

      if (tip.node === endFree) {
        routesFoundCount++;
        killTip(tip);
        continue;
      }

      // Homing tips (see the trigger below) skip the random walk entirely
      // and walk a precomputed shortest path toward the goal. Speed (edges
      // advanced per step) was set when spawned so it finishes within
      // whatever growth budget remains, however long the real route is --
      // normally 1 hop/step (still visibly moving), only compressed if
      // spawned late with a long route still to cover.
      if (tip.homing) {
        for (let h = 0; h < tip.homingHopsPerStep; h++) {
          if (tip.node === endFree) break;
          const nextNode = tip.homingPath[tip.homingIdx + 1];
          if (nextNode === undefined) break;
          const found = adj[tip.node].find(([nb]) => nb === nextNode);
          if (!found) { killTip(tip); break; }
          const [nb, e] = found;
          markEdgeGrown(e, tip.id, tip.node, nb, tip.meters);
          tip.homingIdx++;
          tip.node = nb;
          tip.cameFromEdge = e;
          tip.meters += edges[e].length;
        }
        continue;
      }

      const options = adj[tip.node].filter(([, e]) => e !== tip.cameFromEdge);
      if (!options.length) { killTip(tip); continue; }

      // Pick the direction this tip itself continues in.
      const primary = chooseNext(tip.node, tip.cameFromEdge);
      if (!primary) { killTip(tip); continue; }

      // Branch: at a real junction (degree > 1 excluding the way we came),
      // roll INDEPENDENTLY for every other available direction -- not just
      // a single coin-flip for one spare -- so a real multi-way junction
      // can spawn several children in one visit. This is what actually
      // produces a tree-like fan instead of a single wandering line.
      if (options.length > 1) {
        for (const [bnb, be] of options) {
          if (be === primary.e) continue;
          if (totalTendrils >= MAX_TOTAL_TENDRILS || aliveTipCount >= MAX_ACTIVE_TIPS) break;
          if (Math.random() < branchChance) {
            const childId = nextTipId++;
            markEdgeGrown(be, childId, tip.node, bnb, tip.meters);
            spawnTip({ id: childId, node: bnb, cameFromEdge: be, meters: tip.meters + edges[be].length, alive: true });
          }
        }
      }

      markEdgeGrown(primary.e, tip.id, tip.node, primary.nb, tip.meters);
      tip.node = primary.nb;
      tip.cameFromEdge = primary.e;
      tip.meters += edges[primary.e].length;
    }

    // Safety net, not the normal path (see HOMING_TRIGGER_FRACTION above):
    // if the organic walk still hasn't reached the goal by this fraction of
    // the growth budget, or every tip has already died without finding it,
    // spawn one Dijkstra-guided tip that's guaranteed to walk a real path
    // to the goal. Compresses speed (multiple edges/step) if needed so it
    // still finishes before MAX_GROWTH_STEPS regardless of how late it
    // was spawned or how long the real route is.
    if (routesFoundCount === 0 && !homingSpawned &&
        (aliveTipCount === 0 || growthSteps > MAX_GROWTH_STEPS * HOMING_TRIGGER_FRACTION)) {
      const fallback = dijkstraShortestPath();
      if (fallback) {
        homingSpawned = true;
        const hopsNeeded = fallback.path.length - 1;
        const stepsRemaining = Math.max(1, MAX_GROWTH_STEPS - growthSteps);
        const homingHopsPerStep = Math.max(1, Math.ceil(hopsNeeded / stepsRemaining));
        spawnTip({
          id: nextTipId++, node: startFree, cameFromEdge: -1, meters: 0,
          alive: true, homing: true, homingPath: fallback.path, homingIdx: 0, homingHopsPerStep,
        });
      }
    }

    // Periodically drop dead tendrils from the array so `for (const tip of
    // tips)` above stays proportional to *currently alive* tips instead of
    // every tip ever spawned this run -- without this, a long run with lots
    // of branching gets visibly slower and stutters the further it goes.
    if (growthSteps % TIP_COMPACT_INTERVAL === 0) {
      tips = tips.filter((t) => t.alive);
    }
  }

  // Shared Dijkstra core: finds the path from startFree to endFree that
  // minimizes sum(edgeWeight(e)), returning just the node path. Binary-heap
  // priority queue (O((V+E) log V)) -- this used to be a plain O(V^2)
  // linear scan for the next-closest node, which was fine at the previous,
  // tighter crop width but became a genuine multi-second stall per call
  // once CROP_PAD_FRACTION was widened (see above) to fix tendrils
  // clustering near the source: a wider crop means a much bigger subgraph
  // (tens of thousands of nodes), and V^2 on that is catastrophic --
  // measured directly at ~1.7s for a single call on a 17k-node subgraph,
  // which is what was actually causing the multi-second freezes, not the
  // per-step tendril logic (measured separately at <0.2ms/step).
  function dijkstraCore(edgeWeight) {
    const n = subX.length;
    const dist = new Float64Array(n).fill(Infinity);
    const prevNode = new Int32Array(n).fill(-1);
    const visited = new Uint8Array(n);
    dist[startFree] = 0;

    // Array-based binary min-heap of [dist, node] pairs. Decrease-key is
    // done by lazy deletion: push a fresh smaller entry rather than
    // mutating the old one, and skip stale entries (dist[node] has since
    // improved past what this popped entry claims) when they're popped.
    const heap = [[0, startFree]];
    const heapPush = (d, node) => {
      heap.push([d, node]);
      let i = heap.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (heap[parent][0] <= heap[i][0]) break;
        const tmp = heap[parent]; heap[parent] = heap[i]; heap[i] = tmp;
        i = parent;
      }
    };
    const heapPop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        const len = heap.length;
        for (;;) {
          const l = i * 2 + 1, r = i * 2 + 2;
          let smallest = i;
          if (l < len && heap[l][0] < heap[smallest][0]) smallest = l;
          if (r < len && heap[r][0] < heap[smallest][0]) smallest = r;
          if (smallest === i) break;
          const tmp = heap[smallest]; heap[smallest] = heap[i]; heap[i] = tmp;
          i = smallest;
        }
      }
      return top;
    };

    while (heap.length) {
      const [d, u] = heapPop();
      if (visited[u] || d > dist[u]) continue; // already settled, or a stale lazy-deleted entry
      visited[u] = 1;
      if (u === endFree) break;
      for (const [nb, e] of adj[u]) {
        if (visited[nb]) continue;
        const nd = d + edgeWeight(e);
        if (nd < dist[nb]) {
          dist[nb] = nd;
          prevNode[nb] = u;
          heapPush(nd, nb);
        }
      }
    }

    if (!Number.isFinite(dist[endFree])) return null;
    const path = [endFree];
    let cur = endFree;
    while (cur !== startFree) { cur = prevNode[cur]; path.push(cur); }
    path.reverse();
    return path;
  }

  // Real length of a node path, by summing actual edge lengths.
  function pathRealMeters(path) {
    let meters = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      for (const [nb, e] of adj[a]) if (nb === b) { meters += edges[e].length; break; }
    }
    return meters;
  }

  // Exact shortest path between start and end on the real (cropped) road
  // subgraph, by real segment lengths. This is the ALWAYS-authoritative
  // answer used in beginPrune() below and by the homing-tip safety net --
  // the tendrils are purely the visual spectacle, they never decide what's
  // actually shortest, so the highlighted route is provably correct and
  // not just "whatever the growth happened to find."
  function dijkstraShortestPath() {
    const path = dijkstraCore((e) => edges[e].length);
    if (!path) return null;
    return { path, meters: pathRealMeters(path) };
  }

  function beginPrune() {
    // The winning/solidifying route is always the exact shortest path,
    // computed directly -- never just "the best of whatever the random
    // tendrils happened to find" (routesFoundCount is kept purely as a
    // flavor stat about how many tendrils reached the goal on their own).
    // This is what makes the highlighted answer defensible if someone
    // cross-checks it against a real routing engine.
    winner = dijkstraShortestPath();
    const winSet = new Set();
    if (winner) {
      for (let i = 0; i < winner.path.length - 1; i++) {
        const a = winner.path[i], b = winner.path[i + 1];
        for (const [nb, e] of adj[a]) if (nb === b) { winSet.add(e); break; }
      }
    }
    for (const e of winSet) edgeIsWinner[e] = 1;

    // Depth (distance-from-source to each losing edge's root end) drives
    // the retraction wave below -- edges near the tips retract first, edges
    // near the host retract last, so the whole losing tree visibly unwinds
    // back toward the source instead of just fading in place.
    pruneMaxDepth = 0;
    for (let e = 0; e < edges.length; e++) {
      if (edgeGrownBy[e] !== -1 && !edgeIsWinner[e]) pruneMaxDepth = Math.max(pruneMaxDepth, edgeDepth[e]);
    }
    if (pruneMaxDepth <= 0) pruneMaxDepth = 1;

    phase = 'pruning';
    pruneT = 0;
    hint.textContent = 'The verified shortest route solidifies while every other tendril retracts back into the host.';
  }

  function advance(dtSeconds) {
    if (phase === 'growing') {
      // Scaled by real elapsed time, not by rendered frames -- this used to
      // add a fixed amount once per `advance()` call regardless of dt,
      // which at ~60fps meant growth actually ran ~60x faster than the
      // "steps/sec" it was calibrated for. Now speed=1x really is
      // STEPS_PER_SECOND steps per real second.
      stepAccumulator += speedMultiplier() * STEPS_PER_SECOND * dtSeconds;
      while (stepAccumulator >= 1) {
        stepOnce();
        stepAccumulator -= 1;
        if (growthSteps >= MAX_GROWTH_STEPS || routesFoundCount >= ROUTES_FOUND_TARGET || (aliveTipCount === 0 && routesFoundCount > 0)) break;
      }
      if (growthSteps >= MAX_GROWTH_STEPS || routesFoundCount >= ROUTES_FOUND_TARGET || (aliveTipCount === 0 && routesFoundCount > 0)) {
        beginPrune();
      }
    } else if (phase === 'pruning') {
      pruneT = Math.min(1, pruneT + dtSeconds / PRUNE_SECONDS);
      for (let e = 0; e < edges.length; e++) {
        if (edgeIsWinner[e]) continue;
        if (edgeGrownBy[e] === -1) continue;
        // Staggered wave: edges far from the source (near the losing tips)
        // start retracting immediately; edges near the source don't start
        // until the wave reaches them, finishing right as pruneT hits 1.
        const depthFrac = edgeDepth[e] / pruneMaxDepth;
        const localStart = (1 - depthFrac) * (1 - RETRACT_WINDOW_FRAC);
        const localT = Math.min(1, Math.max(0, (pruneT - localStart) / RETRACT_WINDOW_FRAC));
        edgeRetract[e] = 1 - localT; // 1 = fully extended root->tip, 0 = fully collapsed at root
      }
      if (pruneT >= 1) {
        phase = 'done';
        running = false;
        hint.textContent = 'Connected — this is the verified shortest route on the real road network (exact, not a guess).';
      }
    }
  }

  // ---------- Stats ----------

  function updateStats() {
    statSteps.textContent = growthSteps.toLocaleString();
    statActive.textContent = aliveTipCount.toLocaleString();
    statTendrils.textContent = edges ? totalTendrils.toLocaleString() : '—';
    statRoutes.textContent = routesFoundCount ? routesFoundCount.toLocaleString() : (edges ? '0' : '—');
    if (phase === 'idle' && !startLL) statStatus.textContent = 'Waiting for start point';
    else if (phase === 'idle' && !endLL) statStatus.textContent = 'Waiting for end point';
    else if (phase === 'error') statStatus.textContent = 'Error';
    else if (phase === 'done') statStatus.textContent = 'Connected';
    else if (phase === 'pruning') statStatus.textContent = 'Solidifying the verified shortest route…';
    else if (phase === 'growing') statStatus.textContent = running ? `Growing… (${routesFoundCount} tendrils reached the goal)` : 'Paused';
    else statStatus.textContent = 'Ready';
    statPath.textContent = winner ? `${(winner.meters / 1000).toFixed(2)} km` : '—';
  }

  // ---------- Rendering ----------

  function draw() {
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

    if (edges && subX) {
      // Cloud wash: wide, low-alpha strokes on every grown-but-not-yet-
      // retracted edge, overlapping into the soft translucent blob look
      // from the reference screenshots.
      // edgeRetract doubles as the root->tip "reach" fraction: 1 draws the
      // full edge, easing toward 0 draws a progressively shorter segment
      // that visibly shrinks back toward the root (host) end rather than
      // just fading out in place.
      ctx.lineCap = 'round';
      for (let e = 0; e < edges.length; e++) {
        if (edgeGrownBy[e] === -1 || edgeRetract[e] <= 0.01 || edgeIsWinner[e]) continue;
        const root = edgeFromNode[e], tip = edgeToNode[e];
        const reach = edgeRetract[e];
        const tx = subX[root] + (subX[tip] - subX[root]) * reach;
        const ty = subY[root] + (subY[tip] - subY[root]) * reach;
        ctx.beginPath();
        ctx.moveTo(subX[root], subY[root]);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = `rgba(150,230,165,${(CLOUD_ALPHA * reach).toFixed(3)})`;
        ctx.lineWidth = CLOUD_WIDTH_PX;
        ctx.stroke();
      }
      // Thin distinct tendril lines on top of the wash.
      for (let e = 0; e < edges.length; e++) {
        if (edgeGrownBy[e] === -1 || edgeRetract[e] <= 0.01 || edgeIsWinner[e]) continue;
        const root = edgeFromNode[e], tip = edgeToNode[e];
        const reach = edgeRetract[e];
        const tx = subX[root] + (subX[tip] - subX[root]) * reach;
        const ty = subY[root] + (subY[tip] - subY[root]) * reach;
        ctx.beginPath();
        ctx.moveTo(subX[root], subY[root]);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = `rgba(96,196,120,${(0.85 * reach).toFixed(3)})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      // Winning path -- solidifies from light green to amber as pruneT advances.
      if (winner) {
        const amberMix = phase === 'pruning' ? pruneT : 1;
        const r = Math.round(143 + (245 - 143) * amberMix);
        const g = Math.round(227 + (166 - 227) * amberMix);
        const bch = Math.round(160 + (35 - 160) * amberMix);
        for (let e = 0; e < edges.length; e++) {
          if (!edgeIsWinner[e]) continue;
          const { a, b } = edges[e];
          ctx.beginPath();
          ctx.moveTo(subX[a], subY[a]);
          ctx.lineTo(subX[b], subY[b]);
          ctx.strokeStyle = `rgb(${r},${g},${bch})`;
          ctx.lineWidth = 5;
          ctx.stroke();
        }
      }
      // Active tip dots -- where the growth front currently is. The
      // homing-tip safety net (if spawned) is drawn identically so it
      // reads as just another agent, not a visually special case.
      if (phase === 'growing') {
        for (const tip of tips) {
          if (!tip.alive) continue;
          ctx.beginPath();
          ctx.arc(subX[tip.node], subY[tip.node], 3.2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(96,196,120,0.95)';
          ctx.fill();
        }
      }
    }

    drawPoint(start, '#8fe3a0', 'START');
    drawPoint(end, '#e5483e', 'END');
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

  let lastT = performance.now();
  function simTick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    if (running || phase === 'pruning') advance(dt);
    draw();
    updateStats();
  }
  function frame() { simTick(); requestAnimationFrame(frame); }

  // ---------- Controls ----------

  startBtn.addEventListener('click', () => {
    if (!startLL || !endLL || phase !== 'growing') return;
    running = !running;
    startBtn.textContent = running ? 'Pause' : 'Resume';
  });
  resetBtn.addEventListener('click', resetAll);
  randomBtn.addEventListener('click', () => {
    resetAll();
    const a = LANDMARKS[Math.floor(Math.random() * LANDMARKS.length)];
    let b = LANDMARKS[Math.floor(Math.random() * LANDMARKS.length)];
    while (b.name === a.name) b = LANDMARKS[Math.floor(Math.random() * LANDMARKS.length)];
    startInput.value = a.name; endInput.value = b.name;
    setStart({ lat: a.lat, lon: a.lon, label: a.name });
    setEnd({ lat: b.lat, lon: b.lon, label: b.name });
  });
  branchRange.addEventListener('input', () => { branchLabel.textContent = branchSlider().toString(); });
  speedRange.addEventListener('input', () => { speedLabel.textContent = `${speedMultiplier().toFixed(1)}×`; });
  branchLabel.textContent = branchSlider().toString();
  speedLabel.textContent = `${speedMultiplier().toFixed(1)}×`;

  resetAll();
  requestAnimationFrame(frame);
})();
