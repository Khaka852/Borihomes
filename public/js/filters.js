document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('filterForm');
  const grid = document.getElementById('resultsGrid');
  const countEl = document.getElementById('resultsCount');
  const emptyState = document.getElementById('emptyState');
  const suggestionsGrid = document.getElementById('suggestionsGrid');
  const clearBtn = document.getElementById('clearFiltersBtn');

  // Pre-fill from URL query params (e.g. coming from homepage hero search)
  const params = new URLSearchParams(window.location.search);
  ['type', 'structure_type', 'budget', 'location', 'bedrooms', 'availability'].forEach((key) => {
    const val = params.get(key);
    if (val && form[key]) form[key].value = val;
  });

  async function loadResults() {
    countEl.textContent = 'Loading properties…';
    grid.innerHTML = '';
    suggestionsGrid.innerHTML = '';
    emptyState.style.display = 'none';

    const query = new URLSearchParams(new FormData(form)).toString();
    try {
      const res = await fetch(`/api/properties?${query}`);
      const data = await res.json();

      if (!data.results || data.results.length === 0) {
        countEl.textContent = '0 properties found';
        emptyState.style.display = 'block';
        if (data.suggestions && data.suggestions.length) {
          suggestionsGrid.innerHTML = data.suggestions.map(propertyCardHTML).join('');
          initCarousels(suggestionsGrid);
        }
        return;
      }

      countEl.textContent = `${data.count} propert${data.count === 1 ? 'y' : 'ies'} found`;
      grid.innerHTML = data.results.map(propertyCardHTML).join('');
      initCarousels(grid);
    } catch (err) {
      countEl.textContent = 'Could not load properties. Please try again.';
    }
  }

  form.querySelectorAll('select').forEach((el) => el.addEventListener('change', loadResults));

  // Text fields (the location typing box) should search as the person types,
  // not only once they click away — but debounced so we're not firing a
  // request on every single keystroke.
  let debounceTimer;
  form.querySelectorAll('input[type="text"]').forEach((el) => {
    el.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadResults, 400);
    });
  });

  clearBtn.addEventListener('click', () => {
    form.reset();
    loadResults();
  });

  loadResults();
});
