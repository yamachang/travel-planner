// 訂票確認信啟發式解析：輸出候選項目清單，一律經過使用者確認再寫入

const AIRLINE_CODES = new Set([
  'BR', 'CI', 'JX', 'IT', 'AE', // 台灣
  'AF', 'KL', 'LH', 'BA', 'LX', 'AZ', 'IB', 'SK', 'AY', 'TP', 'EW', 'U2', 'FR', 'VY', 'TO', // 歐洲
  'NH', 'JL', 'MM', 'GK', '7G', 'BC', // 日本
  'DL', 'UA', 'AA', 'B6', 'AS', 'WN', // 美國
  'CX', 'KE', 'OZ', 'SQ', 'TG', 'TR', 'VN', 'PR', 'MH', 'GA', 'EK', 'QR', 'EY', 'TK', // 亞洲/中東
]);

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
};

function pad(n) { return String(n).padStart(2, '0'); }

// 從文字裡抓出所有日期（回傳 YYYY-MM-DD），年份缺漏時用 fallbackYear
export function extractDates(text, fallbackYear) {
  const found = [];
  let m;
  const iso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
  while ((m = iso.exec(text))) found.push(`${m[1]}-${pad(m[2])}-${pad(m[3])}`);

  const zh = /(?:(20\d{2})年)?\s*(\d{1,2})月(\d{1,2})日/g;
  while ((m = zh.exec(text))) found.push(`${m[1] || fallbackYear}-${pad(m[2])}-${pad(m[3])}`);

  // "Jul 17, 2026" / "July 17" / "17 July 2026"
  const en1 = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?\b/g;
  while ((m = en1.exec(text))) {
    const mon = MONTHS[m[1].toLowerCase()];
    if (mon) found.push(`${m[3] || fallbackYear}-${pad(mon)}-${pad(m[2])}`);
  }
  const en2 = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?(?:\s+(20\d{2}))?\b/g;
  while ((m = en2.exec(text))) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon) found.push(`${m[3] || fallbackYear}-${pad(mon)}-${pad(m[1])}`);
  }
  return [...new Set(found)];
}

export function extractTimes(text) {
  const found = [];
  let m;
  const re = /(上午|下午|晚上|凌晨)?\s*([01]?\d|2[0-3]):([0-5]\d)\s*(AM|PM|am|pm)?/g;
  while ((m = re.exec(text))) {
    let h = parseInt(m[2], 10);
    const min = m[3];
    const zh = m[1];
    const ampm = (m[4] || '').toLowerCase();
    if ((ampm === 'pm' || zh === '下午' || zh === '晚上') && h < 12) h += 12;
    if ((ampm === 'am' || zh === '上午') && h === 12) h = 0;
    if (zh === '凌晨' && h === 12) h = 0;
    found.push(`${pad(h)}:${min}`);
  }
  return found;
}

export function extractFlights(text) {
  const found = [];
  let m;
  const re = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{1,4})\b/g;
  while ((m = re.exec(text))) {
    if (AIRLINE_CODES.has(m[1])) found.push(`${m[1]} ${m[2]}`);
  }
  return [...new Set(found)];
}

export function extractAirports(text) {
  const found = [];
  let m;
  const paren = /\(([A-Z]{3})\)/g;
  while ((m = paren.exec(text))) found.push(m[1]);
  const arrow = /\b([A-Z]{3})\s*(?:→|->|—|to)\s*([A-Z]{3})\b/g;
  while ((m = arrow.exec(text))) { found.push(m[1], m[2]); }
  return [...new Set(found)];
}

export function extractConfirmation(text) {
  const re = /(?:confirmation(?:\s+(?:number|code))?|booking(?:\s+(?:reference|number|code))?|reference|reservation(?:\s+(?:number|code))?|PNR|record\s+locator|訂位代號|確認號碼|確認碼|訂單編號|預訂編號)\s*[:：#]?\s*([A-Z0-9]{5,8})\b/i;
  const m = re.exec(text);
  return m ? m[1] : '';
}

function extractHotel(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const kw = /(hotel|hostel|inn|resort|apartment|b&b|飯店|酒店|旅館|旅店|民宿|青年旅舍)/i;
  for (const line of lines) {
    if (kw.test(line) && line.length < 80 && !/check|入住|退房|policy|cancel/i.test(line)) {
      return line.replace(/^(your booking at|booking confirmed|預訂)[:：]?\s*/i, '');
    }
  }
  return null;
}

function firstDateNear(text, keywordRe, fallbackYear) {
  const m = keywordRe.exec(text);
  if (!m) return null;
  const window = text.slice(m.index, m.index + 120);
  const dates = extractDates(window, fallbackYear);
  return dates[0] || null;
}

// 主入口：回傳候選項目（尚未寫入 store 的 plain objects）
export function parseEmail(text, trip) {
  const fallbackYear = trip ? trip.startDate.slice(0, 4) : String(new Date().getFullYear());
  const candidates = [];
  const dates = extractDates(text, fallbackYear);
  const times = extractTimes(text);
  const confirmation = extractConfirmation(text);
  const flights = extractFlights(text);
  const airports = extractAirports(text);

  for (const flight of flights) {
    const route = airports.length >= 2 ? `${airports[0]} → ${airports[1]}` : '';
    candidates.push({
      type: 'flight',
      title: `${flight}${route ? ' ' + route : ''}`,
      date: dates[0] || (trip ? trip.startDate : ''),
      startTime: times[0] || null,
      endTime: times[1] || null,
      location: airports[0] ? `${airports[0]} Airport` : '',
      confirmation,
      notes: '',
    });
  }

  const hotel = extractHotel(text);
  if (hotel) {
    const checkin = firstDateNear(text, /(check[-\s]?in|入住)/i, fallbackYear) || dates[0] || (trip ? trip.startDate : '');
    const checkout = firstDateNear(text, /(check[-\s]?out|退房)/i, fallbackYear) || dates[1] || '';
    candidates.push({
      type: 'lodging',
      title: hotel,
      date: checkin,
      startTime: null,
      endTime: null,
      location: hotel,
      confirmation,
      notes: checkout ? `退房：${checkout}` : '',
    });
  }

  // 什麼都沒抓到但有日期＋確認碼 → 出一個泛用候選
  if (!candidates.length && (dates.length || confirmation)) {
    const firstLine = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)[0] || '預訂';
    candidates.push({
      type: 'note',
      title: firstLine.slice(0, 60),
      date: dates[0] || (trip ? trip.startDate : ''),
      startTime: times[0] || null,
      endTime: null,
      location: '',
      confirmation,
      notes: '',
    });
  }
  return candidates;
}
