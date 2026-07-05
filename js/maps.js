// Google Maps deep links（免 API key）

function locString(item) {
  if (item.lat != null && item.lng != null) return `${item.lat},${item.lng}`;
  return item.location || item.title || '';
}

export function placeUrl(item) {
  const q = locString(item);
  if (!q) return null;
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
}

export function directionsUrl(fromItem, toItem, travelmode = 'transit') {
  const dest = locString(toItem);
  if (!dest) return null;
  let url = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest)
    + '&travelmode=' + encodeURIComponent(travelmode);
  const origin = fromItem ? locString(fromItem) : '';
  if (origin) url += '&origin=' + encodeURIComponent(origin);
  return url;
}
