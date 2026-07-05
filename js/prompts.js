import { TYPE_META, ITEM_TYPES, itemsForDate, tripDates } from './store.js';

function fmtDate(date) {
  const d = new Date(date + 'T00:00:00');
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}（${week}）`;
}

export function serializeTrip(trip, dateFilter = null) {
  const dates = dateFilter ? [dateFilter] : tripDates(trip);
  const out = [`【${trip.name}】${trip.startDate} 到 ${trip.endDate}（${trip.destination}）`];
  for (const date of dates) {
    const items = itemsForDate(trip, date);
    out.push(`\n${fmtDate(date)}：`);
    if (!items.length) { out.push('（尚未安排）'); continue; }
    for (const it of items) {
      const meta = TYPE_META[it.type] || TYPE_META.note;
      let line = `- ${meta.emoji} `;
      if (it.startTime) line += it.startTime + (it.endTime ? `–${it.endTime}` : '') + ' ';
      line += it.title;
      if (it.location && it.location !== it.title) line += `（${it.location}）`;
      if (it.notes) line += `｜${it.notes}`;
      out.push(line);
    }
  }
  return out.join('\n');
}

export function buildAdvicePrompt(trip, dateFilter = null) {
  return [
    '我在規劃一趟獨旅，以下是' + (dateFilter ? `${fmtDate(dateFilter)}的行程` : '整趟行程') + '：',
    '',
    serializeTrip(trip, dateFilter),
    '',
    '請幫我看看：',
    '1. 這樣的行程順不順？動線有沒有繞路或安排太趕/太鬆？',
    '2. 各點之間的移動方式和時間建議？',
    '3. 有沒有推薦順路加入的景點或餐廳？',
    '請用繁體中文回答。',
  ].join('\n');
}

const ITEM_SCHEMA_EXAMPLE = `[
  {
    "type": "flight",
    "title": "BR 87 TPE → CDG",
    "date": "2026-07-17",
    "startTime": "07:40",
    "endTime": null,
    "location": "Taoyuan International Airport (TPE)",
    "confirmation": "ABC123",
    "notes": ""
  }
]`;

export function buildExtractionPrompt(emailText, trip) {
  return [
    '請從下面這封訂票/訂房確認信中，擷取出行程項目，並以 JSON 陣列回覆（只回覆 JSON，不要其他文字）。',
    '',
    '每個項目的格式：',
    ITEM_SCHEMA_EXAMPLE,
    '',
    `規則：type 只能是 ${ITEM_TYPES.join(' | ')}；date 用 YYYY-MM-DD；時間用 24 小時制 HH:MM，沒有就填 null；`
    + `confirmation 放訂位代號/確認碼；location 放完整地點名稱（方便在 Google Maps 搜尋）。`,
    trip ? `這封信屬於「${trip.name}」旅程（${trip.startDate} 到 ${trip.endDate}），日期缺年份時請以此推斷。` : '',
    '',
    '=== 信件內容開始 ===',
    emailText,
    '=== 信件內容結束 ===',
  ].join('\n');
}

// AI 回覆的 JSON → 驗證後的候選項目
export function parseAiJson(text) {
  // 容忍 ```json ... ``` 包裝與前後雜訊
  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  const arr = JSON.parse(cleaned);
  if (!Array.isArray(arr)) throw new Error('必須是 JSON 陣列');
  return arr.map((raw, i) => {
    const title = String(raw.title || '').slice(0, 120);
    const date = String(raw.date || '');
    if (!title) throw new Error(`第 ${i + 1} 筆缺少 title`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`第 ${i + 1} 筆 date 格式錯誤（需要 YYYY-MM-DD）`);
    const time = (v) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) ? v : null;
    return {
      type: ITEM_TYPES.includes(raw.type) ? raw.type : 'activity',
      title,
      date,
      startTime: time(raw.startTime),
      endTime: time(raw.endTime),
      location: String(raw.location || '').slice(0, 200),
      confirmation: String(raw.confirmation || '').slice(0, 40),
      notes: String(raw.notes || '').slice(0, 500),
    };
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { /* ignore */ }
    ta.remove();
    return ok;
  }
}
