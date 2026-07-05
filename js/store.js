import { SEED_TRIPS } from './seed.js';

const KEY = 'travel-planner:v1';
const SORT_GAP = 100;

export const ITEM_TYPES = ['flight', 'lodging', 'activity', 'food', 'transport', 'note'];
export const TYPE_META = {
  flight:    { emoji: '✈️', label: '航班' },
  lodging:   { emoji: '🏨', label: '住宿' },
  activity:  { emoji: '📍', label: '景點/活動' },
  food:      { emoji: '🍜', label: '餐廳' },
  transport: { emoji: '🚆', label: '交通' },
  note:      { emoji: '📝', label: '備註' },
};
export const TIMEZONES = ['Europe/Paris', 'Europe/Amsterdam', 'Asia/Taipei', 'Asia/Tokyo', 'America/New_York', 'UTC'];

let state = null;

function newId() {
  return (crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.trips)) {
        state = parsed;
        return state;
      }
    }
  } catch (e) { /* corrupted storage falls through to seed */ }
  state = { schemaVersion: 1, trips: SEED_TRIPS.map(t => ({ ...t, items: [] })) };
  save();
  return state;
}

export function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function getState() { return state; }

export function getTrip(id) {
  return state.trips.find(t => t.id === id) || null;
}

// ---------- date helpers ----------
export function tripDates(trip) {
  const dates = [];
  const end = new Date(trip.endDate + 'T00:00:00');
  for (let d = new Date(trip.startDate + 'T00:00:00'); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export function itemsForDate(trip, date) {
  return trip.items
    .filter(i => i.date === date)
    .sort((a, b) => (a.sortOrder - b.sortOrder) || String(a.startTime || '99:99').localeCompare(String(b.startTime || '99:99')));
}

// ---------- trip CRUD ----------
export function upsertTrip(data) {
  const existing = data.id ? getTrip(data.id) : null;
  if (existing) {
    Object.assign(existing, data);
  } else {
    state.trips.push({
      id: newId(), name: data.name, destination: data.destination || '',
      startDate: data.startDate, endDate: data.endDate,
      timezone: data.timezone || 'Asia/Taipei', items: [],
    });
  }
  state.trips.sort((a, b) => a.startDate.localeCompare(b.startDate));
  save();
}

export function deleteTrip(id) {
  state.trips = state.trips.filter(t => t.id !== id);
  save();
}

// ---------- item CRUD ----------
function nextSortOrder(trip, date) {
  const items = trip.items.filter(i => i.date === date);
  return items.length ? Math.max(...items.map(i => i.sortOrder || 0)) + SORT_GAP : SORT_GAP;
}

export function addItem(tripId, data) {
  const trip = getTrip(tripId);
  if (!trip) return null;
  const item = {
    id: newId(),
    date: data.date,
    type: ITEM_TYPES.includes(data.type) ? data.type : 'activity',
    title: data.title || '未命名',
    startTime: data.startTime || null,
    endTime: data.endTime || null,
    location: data.location || '',
    lat: data.lat ?? null,
    lng: data.lng ?? null,
    confirmation: data.confirmation || '',
    notes: data.notes || '',
    sortOrder: nextSortOrder(trip, data.date),
  };
  trip.items.push(item);
  save();
  return item;
}

export function updateItem(tripId, itemId, data) {
  const trip = getTrip(tripId);
  const item = trip && trip.items.find(i => i.id === itemId);
  if (!item) return;
  const movingDay = data.date && data.date !== item.date;
  Object.assign(item, data);
  if (movingDay) item.sortOrder = nextSortOrder(trip, item.date);
  save();
}

export function deleteItem(tripId, itemId) {
  const trip = getTrip(tripId);
  if (!trip) return;
  trip.items = trip.items.filter(i => i.id !== itemId);
  save();
}

export function moveItem(tripId, itemId, dir) {
  const trip = getTrip(tripId);
  const item = trip && trip.items.find(i => i.id === itemId);
  if (!item) return;
  const siblings = itemsForDate(trip, item.date);
  const idx = siblings.findIndex(i => i.id === itemId);
  const swapWith = siblings[idx + dir];
  if (!swapWith) return;
  const tmp = item.sortOrder;
  item.sortOrder = swapWith.sortOrder;
  swapWith.sortOrder = tmp;
  save();
}

// ---------- backup / import ----------
export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text, { merge = false } = {}) {
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.trips)) throw new Error('格式不正確：缺少 trips');
  for (const t of parsed.trips) {
    if (!t.id || !t.name || !t.startDate || !t.endDate) throw new Error('格式不正確：trip 缺少必要欄位');
    if (!Array.isArray(t.items)) t.items = [];
  }
  if (merge) {
    for (const t of parsed.trips) {
      const existing = getTrip(t.id);
      if (existing) Object.assign(existing, t);
      else state.trips.push(t);
    }
  } else {
    state = { schemaVersion: 1, trips: parsed.trips };
  }
  state.trips.sort((a, b) => a.startDate.localeCompare(b.startDate));
  save();
}

export function resetToSeed() {
  state = { schemaVersion: 1, trips: SEED_TRIPS.map(t => ({ ...t, items: [] })) };
  save();
}
