// Central list of known areas/streets in Bori. Used by:
// - the public search filter dropdown (views/properties.ejs)
// - the agent "Add Property" form (views/agent/add-property.ejs)
// - the backend filter logic (routes/api/properties.js), to know what counts
//   as a "known" area vs. something that should fall into "Other Areas".
//
// To add a new named street permanently, just add it to this list — it will
// automatically appear in both the filter dropdown and the add-property form.
const KNOWN_AREAS = [
  'Near Kenpoly',
  'Gokana Street',
  'Mayor Street',
  'Kenule Street',
  'FateWay',
  'Lipnee Street',
  'Nortem Street',
  'Poly Road',
  'Nwikabari Street',
  'Tigidam Street',
  'Court Road',
  'Market Road',
  'Abanee Street',
  'Boue/Bank Road',
  'Makoro Street',
  'TTC Road',
  'Prince Igbara Street',
];

module.exports = { KNOWN_AREAS };
