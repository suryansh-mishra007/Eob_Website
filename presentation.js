/* Slide viewer for the Presentation tab. The deck's video-intro slide
   (slide 1) is excluded -- it doesn't render as a useful static image, see
   PROJECT_NOTES.md. Slides 2-41 of the source deck are shown as 1-40 here. */
(() => {
  const TOTAL_SLIDES = 40; // deck slides 2..41, exported as images/slides/slide-02.jpg .. slide-41.jpg
  const FIRST_SLIDE_NUM = 2;

  const slideImage = document.getElementById('slideImage');
  const slideCounter = document.getElementById('slideCounter');
  const slideThumbs = document.getElementById('slideThumbs');
  const prevBtn = document.getElementById('slidePrev');
  const nextBtn = document.getElementById('slideNext');
  const panel = document.getElementById('panelPresentation');

  if (!slideImage) return;

  let current = 0; // 0-based index into TOTAL_SLIDES

  function slidePath(index) {
    const num = FIRST_SLIDE_NUM + index;
    return `images/slides/slide-${String(num).padStart(2, '0')}.jpg`;
  }

  function render() {
    slideImage.src = slidePath(current);
    slideCounter.textContent = `${current + 1} / ${TOTAL_SLIDES}`;
    for (const el of slideThumbs.children) {
      el.classList.toggle('active', Number(el.dataset.index) === current);
    }
    const activeThumb = slideThumbs.children[current];
    if (activeThumb) activeThumb.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }

  function go(delta) {
    current = (current + delta + TOTAL_SLIDES) % TOTAL_SLIDES;
    render();
  }

  prevBtn.addEventListener('click', () => go(-1));
  nextBtn.addEventListener('click', () => go(1));

  document.addEventListener('keydown', (e) => {
    if (panel.classList.contains('hidden')) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  });

  for (let i = 0; i < TOTAL_SLIDES; i++) {
    const thumb = document.createElement('img');
    thumb.src = slidePath(i);
    thumb.className = 'slide-thumb';
    thumb.dataset.index = String(i);
    thumb.alt = `Slide ${i + 1}`;
    thumb.loading = 'lazy';
    thumb.addEventListener('click', () => { current = i; render(); });
    slideThumbs.appendChild(thumb);
  }

  render();
})();
