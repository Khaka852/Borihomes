document.addEventListener('DOMContentLoaded', () => {
  // Gallery thumbnail switching
  const mainImg = document.getElementById('mainGalleryImg');
  document.querySelectorAll('#galleryThumbs img').forEach((thumb) => {
    thumb.addEventListener('click', () => {
      mainImg.src = thumb.dataset.full;
      document.querySelectorAll('#galleryThumbs img').forEach((t) => t.classList.remove('active'));
      thumb.classList.add('active');
    });
  });

  // Enquiry form
  document.getElementById('enquiryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const alertBox = document.getElementById('enquiryAlert');
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const res = await fetch('/api/enquiries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || (result.errors && result.errors[0].msg) || 'Something went wrong.');
      let html = `<div class="alert alert-success">Enquiry #${result.enquiryNumber} sent for ${result.property}. ${result.message}</div>`;
      if (result.whatsapp && result.whatsapp.link) {
        html += `<a href="${result.whatsapp.link}" target="_blank" rel="noopener" class="btn btn-primary btn-block" style="background:#25D366;border-color:#25D366;margin-top:4px;">💬 Chat with ${result.whatsapp.agentName} on WhatsApp</a>`;
      }
      showSubmitted(e.target, alertBox, html);
    } catch (err) {
      alertBox.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    } finally {
      btn.disabled = false; btn.textContent = 'Send Enquiry';
    }
  });

  // Inspection form
  document.getElementById('inspectionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const alertBox = document.getElementById('inspectionAlert');
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Submitting…';
    try {
      const res = await fetch('/api/inspections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || (result.errors && result.errors[0].msg) || 'Something went wrong.');
      let html = `<div class="alert alert-success">Inspection request received for ${result.property}. ${result.message}</div>`;
      if (result.whatsapp && result.whatsapp.link) {
        html += `<a href="${result.whatsapp.link}" target="_blank" rel="noopener" class="btn btn-primary btn-block" style="background:#25D366;border-color:#25D366;margin-top:4px;">💬 Chat with ${result.whatsapp.agentName} on WhatsApp</a>`;
      }
      showSubmitted(e.target, alertBox, html);
    } catch (err) {
      alertBox.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    } finally {
      btn.disabled = false; btn.textContent = 'Request Inspection';
    }
  });
});

// After a successful submit: clear + hide the form, show the confirmation
// (and agent WhatsApp button, if any) in its place, with a Back link that
// brings back a fresh empty form.
function showSubmitted(form, alertBox, html) {
  form.reset();
  form.style.display = 'none';
  alertBox.innerHTML = html +
    '<button type="button" class="btn btn-outline btn-sm btn-block" style="margin-top:8px;" data-back>&larr; Back to form</button>';
  alertBox.querySelector('[data-back]').addEventListener('click', () => {
    alertBox.innerHTML = '';
    form.style.display = '';
  });
  alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});
