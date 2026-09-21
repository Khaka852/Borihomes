function statusPill(status) {
  const map = {
    'Available': 'pill-green', 'Approved': 'pill-green', 'approved': 'pill-green', 'Confirmed': 'pill-green', 'Completed': 'pill-green',
    'Reserved': 'pill-amber', 'Pending': 'pill-amber', 'Pending Approval': 'pill-amber', 'pending': 'pill-amber', 'New': 'pill-amber',
    'Rented': 'pill-gray', 'Contacted': 'pill-gray', 'Unavailable': 'pill-red', 'Cancelled': 'pill-red', 'rejected': 'pill-red', 'Closed': 'pill-gray',
  };
  return `<span class="pill ${map[status] || 'pill-gray'}">${status}</span>`;
}
function nairaFmt(n) { return '₦' + Number(n).toLocaleString('en-NG'); }
