// Initializes every element with [data-carousel] on the page.
// Works for both property-card carousels and can be reused elsewhere.
function initCarousels(root = document) {
  root.querySelectorAll('[data-carousel]').forEach((el) => {
    if (el.dataset.carouselInit) return; // avoid double-init
    el.dataset.carouselInit = '1';

    const track = el.querySelector('.carousel-track');
    const slides = Array.from(track.children);
    if (slides.length === 0) return; // no photos yet — just show the placeholder, nothing to slide
    const dotsWrap = el.querySelector('.carousel-dots');
    let index = 0;
    let autoTimer = null;
    let startX = null;

    slides.forEach((_, i) => {
      const dot = document.createElement('span');
      if (i === 0) dot.classList.add('active');
      dot.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); goTo(i); resetAuto(); });
      dotsWrap.appendChild(dot);
    });

    function render() {
      track.style.transform = `translateX(-${index * 100}%)`;
      dotsWrap.querySelectorAll('span').forEach((d, i) => d.classList.toggle('active', i === index));
    }
    function goTo(i) { index = (i + slides.length) % slides.length; render(); }
    function next() { goTo(index + 1); }
    function prev() { goTo(index - 1); }
    function resetAuto() {
      clearInterval(autoTimer);
      autoTimer = setInterval(next, 3500);
    }

    const nextBtn = el.querySelector('.carousel-btn.next');
    const prevBtn = el.querySelector('.carousel-btn.prev');
    if (nextBtn) nextBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); next(); resetAuto(); });
    if (prevBtn) prevBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); prev(); resetAuto(); });

    // Touch swipe support
    el.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; clearInterval(autoTimer); }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 40) (dx < 0 ? next() : prev());
      startX = null;
      resetAuto();
    });

    el.addEventListener('mouseenter', () => clearInterval(autoTimer));
    el.addEventListener('mouseleave', resetAuto);

    render();
    resetAuto();
  });
}

document.addEventListener('DOMContentLoaded', () => initCarousels());
