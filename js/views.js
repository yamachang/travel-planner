import * as store from './store.js';
import { TYPE_META, ITEM_TYPES } from './store.js';
import { buildTripIcs, shareOrDownloadIcs } from './ics.js';
import { placeUrl, directionsUrl } from './maps.js';
import { parseEmail } from './parser.js';
import { buildAdvicePrompt, buildExtractionPrompt, parseAiJson, copyText } from './prompts.js';

const $app = () => document.getElementById('app');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { t.hidden = true; }, 2200);
}

function fmtDateShort(date) {
  const d = new Date(date + 'T00:00:00');
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()} ${week}`;
}

function fmtRange(trip) {
  const f = (s) => { const d = new Date(s + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}`; };
  return `${f(trip.startDate)} – ${f(trip.endDate)}`;
}

// ---------------- sheet ----------------
function openSheet(html) {
  closeSheet();
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.id = 'sheet';
  backdrop.innerHTML = `<div class="sheet">${html}</div>`;
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeSheet(); });
  document.body.appendChild(backdrop);
  return backdrop;
}

export function closeSheet() {
  document.getElementById('sheet')?.remove();
}

// ---------------- trip list ----------------
export function renderTripList() {
  const { trips } = store.getState();
  const today = new Date().toISOString().slice(0, 10);
  const cards = trips.map(t => {
    let meta;
    if (today < t.startDate) {
      const days = Math.round((new Date(t.startDate) - new Date(today)) / 86400000);
      meta = `還有 ${days} 天出發`;
    } else if (today <= t.endDate) {
      meta = '旅程進行中 ✨';
    } else {
      meta = '已結束';
    }
    const count = t.items.length;
    return `
      <div class="item-card" style="padding:0">
        <button class="trip-card" style="box-shadow:none;margin:0" data-trip="${esc(t.id)}">
          <div class="trip-name">${esc(t.name)}</div>
          <div class="trip-dates">${fmtRange(t)}｜${esc(t.destination)}</div>
          <div class="trip-meta">${meta}${count ? `｜${count} 個行程項目` : ''}</div>
        </button>
        <div class="item-side" style="padding-right:8px">
          <button class="mini-btn" data-edit-trip="${esc(t.id)}" aria-label="編輯旅程">✏️</button>
        </div>
      </div>`;
  }).join('');

  $app().innerHTML = `
    <div class="header">
      <h1>旅行計畫</h1>
      <button class="icon-btn" data-nav="#/settings" aria-label="設定">⚙️</button>
    </div>
    ${cards || '<div class="empty">還沒有旅程，按右下角 ＋ 新增</div>'}
    <button class="fab" data-new-trip aria-label="新增旅程">＋</button>`;

  $app().querySelectorAll('[data-trip]').forEach(b =>
    b.addEventListener('click', () => { location.hash = `#/trip/${b.dataset.trip}`; }));
  $app().querySelectorAll('[data-edit-trip]').forEach(b =>
    b.addEventListener('click', () => openTripSheet(store.getTrip(b.dataset.editTrip))));
  $app().querySelector('[data-new-trip]').addEventListener('click', () => openTripSheet(null));
  $app().querySelector('[data-nav]').addEventListener('click', (e) => { location.hash = e.currentTarget.dataset.nav; });
}

function openTripSheet(trip) {
  const isNew = !trip;
  const t = trip || { name: '', destination: '', startDate: '', endDate: '', timezone: 'Asia/Taipei' };
  const tzOpts = store.TIMEZONES.map(z => `<option value="${z}" ${z === t.timezone ? 'selected' : ''}>${z}</option>`).join('');
  const sheet = openSheet(`
    <h2>${isNew ? '新增旅程' : '編輯旅程'}</h2>
    <div class="field"><label>名稱</label><input id="f-name" value="${esc(t.name)}" placeholder="例如：巴黎"></div>
    <div class="field"><label>目的地（給 Google Maps 用）</label><input id="f-dest" value="${esc(t.destination)}" placeholder="Paris, France"></div>
    <div class="field-row">
      <div class="field"><label>開始日期</label><input id="f-start" type="date" value="${esc(t.startDate)}"></div>
      <div class="field"><label>結束日期</label><input id="f-end" type="date" value="${esc(t.endDate)}"></div>
    </div>
    <div class="field"><label>時區（行事曆匯出用）</label><select id="f-tz">${tzOpts}</select></div>
    <button class="btn btn-primary" id="f-save">儲存</button>
    ${isNew ? '' : '<button class="btn btn-danger" id="f-del">刪除這趟旅程</button>'}
    <button class="btn btn-ghost" id="f-cancel">取消</button>`);

  sheet.querySelector('#f-save').addEventListener('click', () => {
    const name = sheet.querySelector('#f-name').value.trim();
    const startDate = sheet.querySelector('#f-start').value;
    const endDate = sheet.querySelector('#f-end').value;
    if (!name || !startDate || !endDate) { showToast('請填名稱和日期'); return; }
    if (endDate < startDate) { showToast('結束日期不能早於開始日期'); return; }
    store.upsertTrip({
      id: trip?.id, name,
      destination: sheet.querySelector('#f-dest').value.trim(),
      startDate, endDate,
      timezone: sheet.querySelector('#f-tz').value,
    });
    closeSheet();
    renderTripList();
  });
  sheet.querySelector('#f-del')?.addEventListener('click', () => {
    if (confirm(`確定要刪除「${t.name}」和裡面所有行程？`)) {
      store.deleteTrip(trip.id);
      closeSheet();
      renderTripList();
    }
  });
  sheet.querySelector('#f-cancel').addEventListener('click', closeSheet);
}

// ---------------- day view ----------------
export function renderDayView(tripId, date) {
  const trip = store.getTrip(tripId);
  if (!trip) { location.hash = '#/'; return; }
  const dates = store.tripDates(trip);
  if (!dates.includes(date)) date = dates[0];
  const items = store.itemsForDate(trip, date);

  const tabs = dates.map(d =>
    `<button class="day-tab ${d === date ? 'active' : ''}" data-date="${d}">${fmtDateShort(d)}</button>`).join('');

  const cards = items.map((it, idx) => {
    const meta = TYPE_META[it.type] || TYPE_META.note;
    const prev = idx > 0 ? items[idx - 1] : null;
    const mapLink = placeUrl(it);
    const dirLink = (it.location || (it.lat != null)) ? directionsUrl(prev && (prev.location || prev.lat != null) ? prev : null, it) : null;
    return `
      <div class="item-card" data-item="${it.id}">
        <div class="item-emoji">${meta.emoji}</div>
        <div class="item-body">
          ${it.startTime ? `<div class="item-time">${it.startTime}${it.endTime ? ' – ' + it.endTime : ''}</div>` : ''}
          <div class="item-title">${esc(it.title)}</div>
          ${it.location ? `<div class="item-loc">📍 ${esc(it.location)}</div>` : ''}
          ${it.confirmation ? `<div class="item-conf">🎫 ${esc(it.confirmation)}</div>` : ''}
          ${it.notes ? `<div class="item-notes">${esc(it.notes)}</div>` : ''}
          <div class="item-links">
            ${mapLink ? `<a class="chip" href="${mapLink}" target="_blank" rel="noopener">🗺️ 地圖</a>` : ''}
            ${dirLink ? `<a class="chip" href="${dirLink}" target="_blank" rel="noopener">🧭 ${prev && prev.location ? '從上一站' : ''}導航</a>` : ''}
            <button class="chip" data-edit="${it.id}">✏️ 編輯</button>
          </div>
        </div>
        <div class="item-side">
          <button class="mini-btn" data-up="${it.id}" ${idx === 0 ? 'disabled' : ''} aria-label="上移">▲</button>
          <button class="mini-btn" data-down="${it.id}" ${idx === items.length - 1 ? 'disabled' : ''} aria-label="下移">▼</button>
        </div>
      </div>`;
  }).join('');

  $app().innerHTML = `
    <div class="header">
      <button class="back-btn" data-nav="#/" aria-label="返回">‹</button>
      <div style="flex:1;min-width:0">
        <h1>${esc(trip.name)}</h1>
        <div class="sub">${fmtRange(trip)}</div>
      </div>
    </div>
    <div class="day-tabs">${tabs}</div>
    ${cards || '<div class="empty">這天還沒有行程<br>按右下角 ＋ 新增，或用下面的「匯入訂票信」</div>'}
    <div class="section-title">工具</div>
    <div class="actions-row">
      <button class="action-chip" data-act="ics-day">📅 今日加入行事曆</button>
      <button class="action-chip" data-act="ics-trip">📅 整趟加入行事曆</button>
      <button class="action-chip" data-act="ai-day">🤖 AI 健檢（今日）</button>
      <button class="action-chip" data-act="ai-trip">🤖 AI 健檢（整趟）</button>
      <button class="action-chip" data-act="import">📥 匯入訂票信</button>
    </div>
    <button class="fab" data-add aria-label="新增行程">＋</button>`;

  const root = $app();
  root.querySelector('[data-nav]').addEventListener('click', () => { location.hash = '#/'; });
  root.querySelectorAll('.day-tab').forEach(b =>
    b.addEventListener('click', () => { location.hash = `#/trip/${tripId}/day/${b.dataset.date}`; }));
  root.querySelector('.day-tab.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });

  root.querySelectorAll('[data-edit]').forEach(b =>
    b.addEventListener('click', () => openItemSheet(trip, date, trip.items.find(i => i.id === b.dataset.edit))));
  root.querySelectorAll('[data-up]').forEach(b =>
    b.addEventListener('click', () => { store.moveItem(tripId, b.dataset.up, -1); renderDayView(tripId, date); }));
  root.querySelectorAll('[data-down]').forEach(b =>
    b.addEventListener('click', () => { store.moveItem(tripId, b.dataset.down, +1); renderDayView(tripId, date); }));
  root.querySelector('[data-add]').addEventListener('click', () => openItemSheet(trip, date, null));

  root.querySelector('[data-act="ics-day"]').addEventListener('click', async () => {
    const r = await shareOrDownloadIcs(`${trip.id}-${date}.ics`, buildTripIcs(trip, date));
    if (r === 'downloaded') showToast('已下載 .ics，點開即可加入行事曆');
  });
  root.querySelector('[data-act="ics-trip"]').addEventListener('click', async () => {
    const r = await shareOrDownloadIcs(`${trip.id}.ics`, buildTripIcs(trip));
    if (r === 'downloaded') showToast('已下載 .ics，點開即可加入行事曆');
  });
  root.querySelector('[data-act="ai-day"]').addEventListener('click', async () => {
    if (await copyText(buildAdvicePrompt(trip, date))) showToast('已複製，貼到 Claude 或 Gemini 就能問！');
  });
  root.querySelector('[data-act="ai-trip"]').addEventListener('click', async () => {
    if (await copyText(buildAdvicePrompt(trip))) showToast('已複製，貼到 Claude 或 Gemini 就能問！');
  });
  root.querySelector('[data-act="import"]').addEventListener('click', () => {
    location.hash = `#/trip/${tripId}/import`;
  });
}

function openItemSheet(trip, currentDate, item) {
  const isNew = !item;
  const it = item || { type: 'activity', title: '', date: currentDate, startTime: '', endTime: '', location: '', confirmation: '', notes: '' };
  const dates = store.tripDates(trip);
  const dateOpts = dates.map(d => `<option value="${d}" ${d === it.date ? 'selected' : ''}>${fmtDateShort(d)}</option>`).join('');
  const typeBtns = ITEM_TYPES.map(ty =>
    `<button class="type-opt ${ty === it.type ? 'active' : ''}" data-type="${ty}">${TYPE_META[ty].emoji} ${TYPE_META[ty].label}</button>`).join('');

  const sheet = openSheet(`
    <h2>${isNew ? '新增行程' : '編輯行程'}</h2>
    <div class="field"><label>類型</label><div class="type-picker" id="f-types">${typeBtns}</div></div>
    <div class="field"><label>名稱</label><input id="f-title" value="${esc(it.title)}" placeholder="例如：羅浮宮"></div>
    <div class="field"><label>日期（選別天就會移過去）</label><select id="f-date">${dateOpts}</select></div>
    <div class="field-row">
      <div class="field"><label>開始時間</label><input id="f-st" type="time" value="${esc(it.startTime || '')}"></div>
      <div class="field"><label>結束時間</label><input id="f-et" type="time" value="${esc(it.endTime || '')}"></div>
    </div>
    <div class="field"><label>地點（Google Maps 搜尋用）</label><input id="f-loc" value="${esc(it.location)}" placeholder="Musée du Louvre, Paris"></div>
    <div class="field"><label>確認碼 / 訂位代號</label><input id="f-conf" value="${esc(it.confirmation)}"></div>
    <div class="field"><label>備註</label><textarea id="f-notes">${esc(it.notes)}</textarea></div>
    <button class="btn btn-primary" id="f-save">儲存</button>
    ${isNew ? '' : '<button class="btn btn-danger" id="f-del">刪除</button>'}
    <button class="btn btn-ghost" id="f-cancel">取消</button>`);

  let selType = it.type;
  sheet.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => {
    selType = b.dataset.type;
    sheet.querySelectorAll('[data-type]').forEach(x => x.classList.toggle('active', x === b));
  }));

  sheet.querySelector('#f-save').addEventListener('click', () => {
    const title = sheet.querySelector('#f-title').value.trim();
    if (!title) { showToast('請填名稱'); return; }
    const data = {
      type: selType,
      title,
      date: sheet.querySelector('#f-date').value,
      startTime: sheet.querySelector('#f-st').value || null,
      endTime: sheet.querySelector('#f-et').value || null,
      location: sheet.querySelector('#f-loc').value.trim(),
      confirmation: sheet.querySelector('#f-conf').value.trim(),
      notes: sheet.querySelector('#f-notes').value.trim(),
    };
    if (isNew) store.addItem(trip.id, data);
    else store.updateItem(trip.id, item.id, data);
    closeSheet();
    location.hash = `#/trip/${trip.id}/day/${data.date}`;
    renderDayView(trip.id, data.date);
  });
  sheet.querySelector('#f-del')?.addEventListener('click', () => {
    if (confirm('確定刪除這個行程項目？')) {
      store.deleteItem(trip.id, item.id);
      closeSheet();
      renderDayView(trip.id, currentDate);
    }
  });
  sheet.querySelector('#f-cancel').addEventListener('click', closeSheet);
}

// ---------------- import view ----------------
let importTab = 'paste';
let candidates = [];

export function renderImportView(tripId) {
  const trip = store.getTrip(tripId);
  if (!trip) { location.hash = '#/'; return; }

  const candHtml = candidates.map((c, i) => {
    const meta = TYPE_META[c.type] || TYPE_META.note;
    const dates = store.tripDates(trip);
    const inRange = dates.includes(c.date);
    const dateOpts = dates.map(d => `<option value="${d}" ${d === c.date ? 'selected' : ''}>${fmtDateShort(d)}</option>`).join('')
      + (inRange ? '' : `<option value="${esc(c.date)}" selected>${esc(c.date)}（不在旅程範圍）</option>`);
    const typeOpts = ITEM_TYPES.map(ty => `<option value="${ty}" ${ty === c.type ? 'selected' : ''}>${TYPE_META[ty].emoji} ${TYPE_META[ty].label}</option>`).join('');
    return `
      <div class="cand">
        <input type="checkbox" data-ck="${i}" ${c._skip ? '' : 'checked'}>
        <div class="cand-body">
          <div class="cand-title">${meta.emoji} ${esc(c.title)}</div>
          <div class="cand-meta">
            ${c.startTime ? c.startTime + ' ' : ''}${c.location ? '📍' + esc(c.location) : ''}
            ${c.confirmation ? '｜🎫 ' + esc(c.confirmation) : ''}${c.notes ? '｜' + esc(c.notes) : ''}
          </div>
          <select data-cdate="${i}">${dateOpts}</select>
          <select data-ctype="${i}">${typeOpts}</select>
        </div>
      </div>`;
  }).join('');

  $app().innerHTML = `
    <div class="header">
      <button class="back-btn" data-nav aria-label="返回">‹</button>
      <div style="flex:1;min-width:0">
        <h1>匯入訂票信</h1>
        <div class="sub">${esc(trip.name)}</div>
      </div>
    </div>
    <div class="seg">
      <button data-tab="paste" class="${importTab === 'paste' ? 'active' : ''}">貼上信件內容</button>
      <button data-tab="ai" class="${importTab === 'ai' ? 'active' : ''}">AI 協助解析</button>
    </div>
    <div id="tab-paste" ${importTab === 'paste' ? '' : 'hidden'}>
      <p class="hint">到 Gmail 打開訂票/訂房確認信 → 全選複製內文 → 貼到下面 → 按「解析」。</p>
      <div class="field"><textarea id="paste-text" placeholder="貼上 email 內文…" style="min-height:140px"></textarea></div>
      <button class="btn btn-primary" id="btn-parse">解析</button>
    </div>
    <div id="tab-ai" ${importTab === 'ai' ? '' : 'hidden'}>
      <p class="hint">遇到格式特殊、自動解析失敗的信：<br>
      1. 貼上信件內文，按「複製 AI 指令」<br>
      2. 到 Claude 或 Gemini app 貼上送出<br>
      3. 把 AI 回覆的 JSON 複製回來，貼到第二格按「匯入」</p>
      <div class="field"><textarea id="ai-email" placeholder="貼上 email 內文…"></textarea></div>
      <button class="btn btn-primary" id="btn-copy-prompt">① 複製 AI 指令</button>
      <div class="field" style="margin-top:16px"><textarea id="ai-json" placeholder='貼上 AI 回覆的 JSON…'></textarea></div>
      <button class="btn btn-primary" id="btn-import-json">② 匯入 JSON</button>
    </div>
    ${candidates.length ? `
      <div class="section-title">解析結果（勾選要加入的項目）</div>
      ${candHtml}
      <button class="btn btn-primary" id="btn-add-cands">加入行程</button>
      <button class="btn btn-ghost" id="btn-clear-cands">清除結果</button>` : ''}
  `;

  const root = $app();
  root.querySelector('[data-nav]').addEventListener('click', () => { location.hash = `#/trip/${tripId}`; });
  root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    importTab = b.dataset.tab;
    renderImportView(tripId);
  }));

  root.querySelector('#btn-parse')?.addEventListener('click', () => {
    const text = root.querySelector('#paste-text').value;
    if (!text.trim()) { showToast('先貼上信件內容'); return; }
    const found = parseEmail(text, trip);
    if (!found.length) { showToast('沒解析出東西，試試「AI 協助解析」'); return; }
    candidates = found;
    renderImportView(tripId);
  });

  root.querySelector('#btn-copy-prompt')?.addEventListener('click', async () => {
    const text = root.querySelector('#ai-email').value;
    if (!text.trim()) { showToast('先貼上信件內容'); return; }
    if (await copyText(buildExtractionPrompt(text, trip))) showToast('已複製！到 Claude/Gemini 貼上送出');
  });

  root.querySelector('#btn-import-json')?.addEventListener('click', () => {
    const text = root.querySelector('#ai-json').value;
    if (!text.trim()) { showToast('先貼上 AI 回覆的 JSON'); return; }
    try {
      candidates = parseAiJson(text);
      renderImportView(tripId);
    } catch (e) {
      showToast('JSON 解析失敗：' + e.message);
    }
  });

  root.querySelectorAll('[data-ck]').forEach(el => el.addEventListener('change', () => {
    candidates[+el.dataset.ck]._skip = !el.checked;
  }));
  root.querySelectorAll('[data-cdate]').forEach(el => el.addEventListener('change', () => {
    candidates[+el.dataset.cdate].date = el.value;
  }));
  root.querySelectorAll('[data-ctype]').forEach(el => el.addEventListener('change', () => {
    candidates[+el.dataset.ctype].type = el.value;
  }));

  root.querySelector('#btn-add-cands')?.addEventListener('click', () => {
    const chosen = candidates.filter(c => !c._skip);
    if (!chosen.length) { showToast('沒有勾選任何項目'); return; }
    let added = 0;
    for (const c of chosen) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date)) continue;
      store.addItem(tripId, c);
      added++;
    }
    candidates = [];
    showToast(`已加入 ${added} 個行程項目`);
    location.hash = `#/trip/${tripId}/day/${chosen[0].date}`;
  });
  root.querySelector('#btn-clear-cands')?.addEventListener('click', () => {
    candidates = [];
    renderImportView(tripId);
  });
}

// ---------------- settings ----------------
export function renderSettings() {
  $app().innerHTML = `
    <div class="header">
      <button class="back-btn" data-nav aria-label="返回">‹</button>
      <h1>設定</h1>
    </div>
    <div class="setting-block">
      <h3>📦 備份</h3>
      <p>資料只存在這支手機的瀏覽器裡。建議偶爾備份一次，換手機或清瀏覽器資料前一定要備份。</p>
      <button class="btn btn-primary" id="btn-export">匯出備份檔（JSON）</button>
      <button class="btn btn-ghost" id="btn-copy-backup">或複製 JSON 到剪貼簿</button>
    </div>
    <div class="setting-block">
      <h3>📥 還原備份</h3>
      <div class="field"><textarea id="restore-text" placeholder="貼上備份 JSON…"></textarea></div>
      <button class="btn btn-primary" id="btn-restore">還原（取代現有資料）</button>
      <button class="btn btn-ghost" id="btn-merge">合併到現有資料</button>
    </div>
    <div class="setting-block">
      <h3>📱 安裝到主畫面</h3>
      <p>用 Safari 打開本頁 → 點下方「分享」按鈕 → 「加入主畫面」，之後就像一般 app 一樣使用，離線也能開。</p>
    </div>
    <div class="setting-block">
      <h3>⚠️ 重設</h3>
      <button class="btn btn-danger" id="btn-reset">清除全部，回到預設四趟旅程</button>
    </div>`;

  const root = $app();
  root.querySelector('[data-nav]').addEventListener('click', () => { location.hash = '#/'; });
  root.querySelector('#btn-export').addEventListener('click', async () => {
    const json = store.exportJSON();
    const name = `travel-planner-backup-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`;
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
  root.querySelector('#btn-copy-backup').addEventListener('click', async () => {
    if (await copyText(store.exportJSON())) showToast('已複製備份 JSON');
  });
  const doRestore = (merge) => {
    const text = root.querySelector('#restore-text').value;
    if (!text.trim()) { showToast('先貼上備份 JSON'); return; }
    try {
      store.importJSON(text, { merge });
      showToast(merge ? '已合併' : '已還原');
      location.hash = '#/';
    } catch (e) {
      showToast('還原失敗：' + e.message);
    }
  };
  root.querySelector('#btn-restore').addEventListener('click', () => doRestore(false));
  root.querySelector('#btn-merge').addEventListener('click', () => doRestore(true));
  root.querySelector('#btn-reset').addEventListener('click', () => {
    if (confirm('確定要清除所有資料，回到預設的四趟旅程？此動作無法復原。')) {
      store.resetToSeed();
      location.hash = '#/';
      renderTripList();
    }
  });
}
