document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('hamburgerBtn');
  const menu = document.getElementById('mobileMenu');
  if (btn && menu) {
    btn.addEventListener('click', () => menu.classList.toggle('open'));
  }
});

// Formats a number as Nigerian Naira, e.g. 250000 -> "₦250,000"
function formatNaira(n) {
  return '₦' + Number(n).toLocaleString('en-NG');
}
