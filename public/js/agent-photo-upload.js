// Handles the "Add Property" photo picker: shows previews as photos are
// chosen, and on form submit uploads everything straight to Cloudinary from
// the browser (never touches our own server's disk — see README for why),
// then attaches the resulting URLs to the newly created property.

let extraPhotoFiles = [];

document.addEventListener('DOMContentLoaded', () => {
  // Required slots: clicking the drop zone opens its hidden file input,
  // and shows a preview once a file is chosen.
  document.querySelectorAll('.photo-slot-input').forEach((input) => {
    input.addEventListener('change', () => {
      const slot = input.closest('.photo-slot');
      const preview = slot.querySelector('.photo-slot-preview');
      const placeholder = slot.querySelector('.photo-slot-placeholder');
      const file = input.files[0];
      if (file) {
        preview.src = URL.createObjectURL(file);
        preview.style.display = 'block';
        placeholder.style.display = 'none';
        slot.classList.add('has-photo');
      }
    });
  });

  const addExtraBtn = document.getElementById('addExtraPhotosBtn');
  const extraInput = document.getElementById('extraPhotosInput');
  if (addExtraBtn) {
    addExtraBtn.addEventListener('click', () => extraInput.click());
    extraInput.addEventListener('change', () => {
      extraPhotoFiles = extraPhotoFiles.concat(Array.from(extraInput.files));
      renderExtraPhotoPreviews();
      extraInput.value = ''; // allow picking again / adding more
    });
  }
});

function renderExtraPhotoPreviews() {
  const wrap = document.getElementById('extraPhotosPreview');
  if (!wrap) return;
  wrap.innerHTML = extraPhotoFiles.map((file, i) => `
    <div style="position:relative;">
      <img src="${URL.createObjectURL(file)}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;" />
      <button type="button" onclick="removeExtraPhoto(${i})" style="position:absolute;top:-6px;right:-6px;background:#e0402a;color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:.7rem;cursor:pointer;">&times;</button>
    </div>
  `).join('');
}
function removeExtraPhoto(i) {
  extraPhotoFiles.splice(i, 1);
  renderExtraPhotoPreviews();
}

function resetPhotoSlots() {
  document.querySelectorAll('.photo-slot').forEach((slot) => {
    slot.classList.remove('has-photo');
    slot.querySelector('.photo-slot-preview').style.display = 'none';
    slot.querySelector('.photo-slot-placeholder').style.display = 'block';
  });
  extraPhotoFiles = [];
  renderExtraPhotoPreviews();
}

async function uploadToCloudinary(file) {
  const { cloudName, uploadPreset } = window.CLOUDINARY_CONFIG;
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', uploadPreset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Upload failed');
  const data = await res.json();
  return data.secure_url;
}

// Uploads every selected photo (5 required slots + any extras) and attaches
// them to the given property. Returns { uploaded, failed } counts — a single
// failed photo doesn't stop the others or the property itself from saving.
async function uploadAllPropertyPhotos(propertyId, onProgress) {
  const jobs = [];
  document.querySelectorAll('.photo-slot-input').forEach((input) => {
    if (input.files[0]) jobs.push({ file: input.files[0], type: input.dataset.type });
  });
  extraPhotoFiles.forEach((file) => jobs.push({ file, type: 'other' }));

  let uploaded = 0;
  let failed = 0;
  for (let i = 0; i < jobs.length; i++) {
    try {
      const url = await uploadToCloudinary(jobs[i].file);
      await fetch(`/api/agent/properties/${propertyId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: url, image_type: jobs[i].type }),
      });
      uploaded++;
    } catch (err) {
      failed++;
    }
    if (onProgress) onProgress(i + 1, jobs.length);
  }
  return { uploaded, failed };
}
