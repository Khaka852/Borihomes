// SECURITY CHOKE POINT
// -----------------------------------------------------------------------
// This file is the ONLY place that decides what property fields are
// returned to a given caller. Public serialization NEVER includes private
// fields — those simply are not present on the object passed in unless the
// caller explicitly joined property_private (which routes/api/properties.js
// only does for authenticated admin/authorised-agent requests).
// -----------------------------------------------------------------------

function toPublicProperty(row, images) {
  return {
    id: row.property_id,
    type: row.type,
    title: row.title,
    price: row.price,
    location_area: row.location_area,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    description: row.description,
    amenities: safeParseArray(row.amenities),
    rating: row.rating,
    status: row.status,
    images: images || [],
  };
}

// Used for admin, or an agent viewing a property assigned to them.
function toPrivateProperty(row, images, privateData, agentName, landlord) {
  return {
    ...toPublicProperty(row, images),
    approval_status: row.approval_status,
    agent: agentName || null,
    landlord: landlord
      ? { name: landlord.name, phone: landlord.phone, email: landlord.email }
      : null,
    full_address: privateData ? privateData.full_address : null,
    internal_notes: privateData ? privateData.internal_notes : null,
    verification_info: privateData ? privateData.verification_info : null,
    commission_info: privateData ? privateData.commission_info : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function safeParseArray(json) {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

module.exports = { toPublicProperty, toPrivateProperty };
