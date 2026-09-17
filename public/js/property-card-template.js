function propertyCardHTML(p) {
  const imgs = p.images.length > 0
    ? p.images.map((img) => `<img src="${img.url}" alt="${escapeHtml(p.title)} - ${img.type}" loading="lazy" />`).join('')
    : `<div class="carousel-placeholder">🏠 No photos yet</div>`;
  return `
  <div class="property-card">
    <a href="/properties/${p.id}" style="display:block;">
      <div class="carousel" data-carousel>
        <span class="badge status-${p.status.toLowerCase()}">${p.status}</span>
        <div class="carousel-track">${imgs}</div>
        <button class="carousel-btn prev" aria-label="Previous">&#8249;</button>
        <button class="carousel-btn next" aria-label="Next">&#8250;</button>
        <div class="carousel-dots"></div>
      </div>
      <div class="property-body">
        <div class="property-id">${p.id} · ${escapeHtml(p.type)}</div>
        <div class="property-title">${escapeHtml(p.title)}</div>
        <div class="property-meta">
          <span>📍 ${escapeHtml(p.location_area)}</span>
          <span>${p.bedrooms} Bed</span>
          <span>${p.bathrooms} Bath</span>
        </div>
        <div class="property-foot">
          <div class="property-price">${formatNaira(p.price)} <small>/ year</small></div>
          <div class="rating">★ ${p.rating}</div>
        </div>
      </div>
    </a>
  </div>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
