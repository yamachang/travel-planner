import * as store from './store.js';
import { renderTripList, renderDayView, renderImportView, renderSettings, closeSheet } from './views.js';
import * as ics from './ics.js';
import * as parser from './parser.js';
import * as prompts from './prompts.js';
import * as maps from './maps.js';

store.load();

function route() {
  closeSheet();
  const hash = location.hash || '#/';
  let m;
  if ((m = hash.match(/^#\/trip\/([^/]+)\/day\/(\d{4}-\d{2}-\d{2})$/))) {
    renderDayView(m[1], m[2]);
  } else if ((m = hash.match(/^#\/trip\/([^/]+)\/import$/))) {
    renderImportView(m[1]);
  } else if ((m = hash.match(/^#\/trip\/([^/]+)$/))) {
    const trip = store.getTrip(m[1]);
    if (!trip) { location.hash = '#/'; return; }
    // 預設跳到「今天」（若在旅程期間內），否則第一天
    const today = new Date().toISOString().slice(0, 10);
    const dates = store.tripDates(trip);
    const target = dates.includes(today) ? today : dates[0];
    location.hash = `#/trip/${trip.id}/day/${target}`;
  } else if (hash === '#/settings') {
    renderSettings();
  } else {
    renderTripList();
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
route();

// 給測試與除錯用
window.__tp = { store, ics, parser, prompts, maps };
