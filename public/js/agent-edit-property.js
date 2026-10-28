// "Edit" on the agent's My Properties page.
//
// The form is pre-filled with the property's details. Sending it does NOT
// change the live listing — it sends a request to the admin, and the public
// keeps seeing the current version until the admin approves it.
// (Needs the page's `allMyProperties` list and `loadMyProperties()`.)

const EDIT_FEE_PRESETS = ['Caution fee', 'Drink fee', 'Agreement fee', 'Legal fee'];

function editEsc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const editEl = (id) => document.getElementById(id);

function editAddFeeRow(name, amount) {
  const wrap = editEl('editFeeRows');
  if (wrap.children.length >= 8) return;
  const isPreset = !name || EDIT_FEE_PRESETS.includes(name);
  const row = document.createElement('div');
  row.className = 'fee-row';
  row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;';
  row.innerHTML =
    '<select class="form-control fee-name-select" style="flex:1 1 140px;">' +
      EDIT_FEE_PRESETS.map((n) => `<option>${n}</option>`).join('') + '<option value="__other">Other…</option>' +
    '</select>' +
    '<input class="form-control fee-name-other" placeholder="Fee name" maxlength="40" style="flex:1 1 140px;display:none;" />' +
    '<input class="form-control fee-amount" type="number" min="1" step="1" placeholder="Amount (₦)" style="flex:1 1 120px;" />' +
    '<button type="button" class="btn btn-outline btn-sm fee-remove" aria-label="Remove fee">&times;</button>';
  const select = row.querySelector('.fee-name-select');
  const other = row.querySelector('.fee-name-other');
  if (isPreset) {
    select.value = name || EDIT_FEE_PRESETS[0];
  } else {
    select.value = '__other';
    other.value = name;
    other.style.display = 'block';
  }
  row.querySelector('.fee-amount').value = amount === undefined ? '' : amount;
  select.addEventListener('change', () => { other.style.display = select.value === '__other' ? 'block' : 'none'; });
  row.querySelector('.fee-remove').addEventListener('click', () => row.remove());
  wrap.appendChild(row);
}

// Every row must be complete, so a fee is never silently left off the listing.
function editCollectFees() {
  const fees = [];
  document.querySelectorAll('#editFeeRows .fee-row').forEach((row) => {
    const picked = row.querySelector('.fee-name-select').value;
    const name = picked === '__other' ? row.querySelector('.fee-name-other').value.trim() : picked;
    const amountText = row.querySelector('.fee-amount').value.trim();
    if (!name || !amountText || Number(amountText) < 1) {
      throw new Error('Each extra fee needs a name and an amount above zero — or remove that row.');
    }
    fees.push({ name, amount: Number(amountText) });
  });
  return fees;
}

function closeEditModal() { editEl('editModal').classList.remove('open'); }

function openEditModal(propertyId) {
  const p = allMyProperties.find((x) => x.id === propertyId);
  if (!p) return;
  const pending = p.pending_edit ? p.pending_edit.raw : {};
  const val = (f) => (f in pending ? pending[f] : p[f]);
  const form = editEl('editForm');
  form.dataset.propertyId = p.id;
  form.style.display = '';
  editEl('editAlert').innerHTML = '';
  editEl('editModalTitle').textContent = `Edit ${p.id}`;

  editEl('editStatus').value = val('status');
  editEl('editPrice').value = val('price');
  const typeSelect = editEl('editType');
  if (![...typeSelect.options].some((o) => o.value === val('type'))) {
    const o = document.createElement('option'); o.value = o.textContent = val('type'); typeSelect.appendChild(o);
  }
  typeSelect.value = val('type');
  editEl('editTitle').value = val('title');
  editEl('editLocation').value = val('location_area');
  editEl('editBeds').value = val('bedrooms');
  editEl('editBaths').value = val('bathrooms');
  editEl('editDescription').value = val('description') || '';
  editEl('editAmenities').value = (val('amenities') || []).join(', ');
  editEl('editFeeRows').innerHTML = '';
  (val('extra_fees') || []).forEach((f) => editAddFeeRow(f.name, f.amount));

  const live = p.approval_status === 'approved';
  editEl('editNote').textContent = live
    ? 'Changes are sent to the admin for approval. The public keeps seeing the current version until then.'
    : "This listing isn't live yet, so changes are saved straight away and the admin reviews them when approving the listing.";
  editEl('editSubmit').textContent = live ? 'Send for approval' : 'Save changes';

  const pendingBox = editEl('editPending');
  if (p.pending_edit) {
    pendingBox.style.display = 'block';
    pendingBox.querySelector('span').textContent = 'You already have a change waiting for approval. The form shows what you asked for — send again to replace it.';
  } else {
    pendingBox.style.display = 'none';
  }
  if (p.approval_status === 'rejected') {
    form.style.display = 'none';
    editEl('editAlert').innerHTML = '<div class="alert alert-error">This listing was rejected, so it can\'t be edited. Please contact the admin.</div>';
  }
  editEl('editModal').classList.add('open');
}

async function cancelPendingEdit() {
  const id = editEl('editForm').dataset.propertyId;
  const res = await fetch(`/api/agent/properties/${encodeURIComponent(id)}/edits/pending`, { method: 'DELETE' });
  if (res.ok) { closeEditModal(); loadMyProperties(); }
  else editEl('editAlert').innerHTML = '<div class="alert alert-error">Could not cancel the request. Please try again.</div>';
}

document.addEventListener('DOMContentLoaded', () => {
  editEl('editAddFee').addEventListener('click', () => editAddFeeRow());
  editEl('editCancelPending').addEventListener('click', cancelPendingEdit);
  editEl('editModal').addEventListener('click', (ev) => { if (ev.target === editEl('editModal')) closeEditModal(); });

  editEl('editForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const alertBox = editEl('editAlert');
    const btn = editEl('editSubmit');
    const num = (id) => (editEl(id).value.trim() === '' ? '' : Number(editEl(id).value));
    let body;
    try {
      body = {
        status: editEl('editStatus').value,
        price: num('editPrice'),
        type: editEl('editType').value,
        title: editEl('editTitle').value,
        location_area: editEl('editLocation').value,
        bedrooms: num('editBeds'),
        bathrooms: num('editBaths'),
        description: editEl('editDescription').value,
        amenities: editEl('editAmenities').value.split(',').map((s) => s.trim()).filter(Boolean),
        extra_fees: editCollectFees(),
      };
    } catch (err) {
      alertBox.innerHTML = `<div class="alert alert-error">${editEsc(err.message)}</div>`;
      return;
    }
    const idleLabel = btn.textContent;
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const res = await fetch(`/api/agent/properties/${encodeURIComponent(form.dataset.propertyId)}/edits`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (data.errors && data.errors[0].msg) || 'Something went wrong.');
      // Done: the form closes and the outcome takes its place.
      form.style.display = 'none';
      editEl('editPending').style.display = 'none';
      const list = (data.changes || []).map((c) => `<li><strong>${editEsc(c.label)}:</strong> ${editEsc(c.from)} &rarr; ${editEsc(c.to)}</li>`).join('');
      alertBox.innerHTML = `<div class="alert alert-success">${editEsc(data.message)}</div>` +
        (list ? `<ul style="margin:0 0 12px;padding-left:20px;">${list}</ul>` : '') +
        '<button type="button" class="btn btn-outline btn-sm btn-block" id="editDone">Close</button>';
      editEl('editDone').addEventListener('click', () => { closeEditModal(); loadMyProperties(); });
    } catch (err) {
      alertBox.innerHTML = `<div class="alert alert-error">${editEsc(err.message)}</div>`;
    } finally {
      btn.disabled = false; btn.textContent = idleLabel;
    }
  });
});
