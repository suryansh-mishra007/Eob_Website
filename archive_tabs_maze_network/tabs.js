/* Switches between the Maze Solver and Network Builder demos. Purely UI --
   each demo's own script (maze.js / network-builder.js) manages its canvas
   and keeps running/rendering regardless of which tab is visible. The
   Network Builder canvas also sizes itself via ResizeObserver when its
   panel goes from display:none to visible, but that firing is tied to the
   render pipeline producing an actual frame -- calling its resize function
   directly here too (network-builder.js exposes it as
   window.__networkBuilderResize) forces it synchronously via
   getBoundingClientRect instead of waiting on that, so clicks placing
   terminals are never briefly misaligned right after switching tabs. */

(() => {
  const tabs = [
    { btn: document.getElementById('tabBtnMaze'), panel: document.getElementById('panelMaze') },
    { btn: document.getElementById('tabBtnNetwork'), panel: document.getElementById('panelNetwork') },
  ];

  tabs.forEach(({ btn, panel }) => {
    btn.addEventListener('click', () => {
      tabs.forEach(({ btn: b, panel: p }) => {
        const active = p === panel;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
        p.classList.toggle('active', active);
      });
      if (panel.id === 'panelNetwork' && window.__networkBuilderResize) window.__networkBuilderResize();
    });
  });
})();
