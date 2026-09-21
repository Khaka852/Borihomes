function statusPill(status) {
  const map = {
    'Available': 'pill-green', 'Approved': 'pill-green', 'approved': 'pill-green', 'Confirmed': 'pill-green', 'Completed': 'pill-green',
    'Reserved': 'pill-amber', 'Pending': 'pill-amber', 'Pending Approval': 'pill-amber', 'pending': 'pill-amber', 'New': 'pill-amber',
    'Rented': 'pill-gray', 'Contacted': 'pill-gray', 'Unavailable': 'pill-red', 'Cancelled': 'pill-red', 'rejected': 'pill-red', 'Closed': 'pill-gray',
  };
  return `<span class="pill ${map[status] || 'pill-gray'}">${status}</span>`;
}
function nairaFmt(n) { return '₦' + Number(n).toLocaleString('en-NG'); }

// Reusable click-to-sort table header helper for the admin/agent dashboards.
// `state` is a small {field, dir} object the calling page keeps around;
// `render` is the page's own function that redraws the table body.
function makeSortable(state, render) {
  return {
    setSort(field) {
      if (state.field === field) {
        state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.field = field;
        state.dir = 'asc';
      }
      render();
    },
    sortRows(rows) {
      if (!state.field) return rows;
      const field = state.field;
      const dir = state.dir === 'asc' ? 1 : -1;
      return [...rows].sort((a, b) => {
        let av = a[field];
        let bv = b[field];
        if (av === null || av === undefined) av = '';
        if (bv === null || bv === undefined) bv = '';
        if (typeof av === 'string') av = av.toLowerCase();
        if (typeof bv === 'string') bv = bv.toLowerCase();
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    },
    headerLabel(field, label) {
      if (state.field !== field) return label;
      return label + (state.dir === 'asc' ? ' ▲' : ' ▼');
    },
  };
}
