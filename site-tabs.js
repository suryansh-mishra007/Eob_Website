/* Top-level tab switcher: Model / Presentation / Team. Pure UI -- the Model
   tab's map/simulation (app.js) keeps running underneath regardless of
   which tab is visible, same "no pause-on-hide" behavior as the archived
   maze/network-builder tabs.js this is modeled after. */
(() => {
  const tabs = [
    { btn: document.getElementById('tabBtnModel'), panel: document.getElementById('panelModel') },
    { btn: document.getElementById('tabBtnPresentation'), panel: document.getElementById('panelPresentation') },
    { btn: document.getElementById('tabBtnTeam'), panel: document.getElementById('panelTeam') },
  ];

  function activate(target) {
    for (const t of tabs) {
      const isActive = t === target;
      t.btn.classList.toggle('active', isActive);
      t.btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      t.panel.classList.toggle('hidden', !isActive);
    }
  }

  for (const t of tabs) {
    t.btn.addEventListener('click', () => activate(t));
  }
})();
