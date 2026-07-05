import { TYPE_META, itemsForDate, tripDates } from './store.js';

// 硬編碼 VTIMEZONE：本 app 涵蓋的時區規則都很單純，不需要整個 tz 資料庫
const CET_RULES = (tzid) => [
  'BEGIN:VTIMEZONE',
  `TZID:${tzid}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
].join('\r\n');

const FIXED_TZ = (tzid, offset, name) => [
  'BEGIN:VTIMEZONE',
  `TZID:${tzid}`,
  'BEGIN:STANDARD',
  `TZOFFSETFROM:${offset}`,
  `TZOFFSETTO:${offset}`,
  `TZNAME:${name}`,
  'DTSTART:19700101T000000',
  'END:STANDARD',
  'END:VTIMEZONE',
].join('\r\n');

const EST_RULES = [
  'BEGIN:VTIMEZONE',
  'TZID:America/New_York',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0400',
  'TZNAME:EDT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'TZNAME:EST',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
].join('\r\n');

const VTIMEZONES = {
  'Europe/Paris': CET_RULES('Europe/Paris'),
  'Europe/Amsterdam': CET_RULES('Europe/Amsterdam'),
  'Asia/Taipei': FIXED_TZ('Asia/Taipei', '+0800', 'CST'),
  'Asia/Tokyo': FIXED_TZ('Asia/Tokyo', '+0900', 'JST'),
  'America/New_York': EST_RULES,
  'UTC': FIXED_TZ('UTC', '+0000', 'UTC'),
};

function escapeText(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// RFC 5545：每行最長 75 octets，續行以空白開頭
function foldLine(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 74) return line;
  const out = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const chLen = new TextEncoder().encode(ch).length;
    if (curLen + chLen > 73) {
      out.push(cur);
      cur = ' ';
      curLen = 1;
    }
    cur += ch;
    curLen += chLen;
  }
  out.push(cur);
  return out.join('\r\n');
}

function dtstamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function buildEvent(trip, item) {
  const tz = trip.timezone;
  const meta = TYPE_META[item.type] || TYPE_META.note;
  const lines = ['BEGIN:VEVENT'];
  lines.push(`UID:${item.id}@travel-planner`);
  lines.push(`DTSTAMP:${dtstamp()}`);
  const d = item.date.replace(/-/g, '');
  if (item.startTime) {
    const t = item.startTime.replace(':', '') + '00';
    lines.push(`DTSTART;TZID=${tz}:${d}T${t}`);
    if (item.endTime) {
      lines.push(`DTEND;TZID=${tz}:${d}T${item.endTime.replace(':', '')}00`);
    }
  } else {
    lines.push(`DTSTART;VALUE=DATE:${d}`);
  }
  lines.push(`SUMMARY:${escapeText(meta.emoji + ' ' + item.title)}`);
  if (item.location) lines.push(`LOCATION:${escapeText(item.location)}`);
  const descParts = [];
  if (item.confirmation) descParts.push(`確認碼：${item.confirmation}`);
  if (item.notes) descParts.push(item.notes);
  if (descParts.length) lines.push(`DESCRIPTION:${escapeText(descParts.join('\n'))}`);
  lines.push('END:VEVENT');
  return lines;
}

export function buildTripIcs(trip, dateFilter = null) {
  const dates = dateFilter ? [dateFilter] : tripDates(trip);
  const events = [];
  for (const date of dates) {
    for (const item of itemsForDate(trip, date)) events.push(...buildEvent(trip, item));
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//travel-planner//zh-TW',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(trip.name + (dateFilter ? ' ' + dateFilter : ''))}`,
  ];
  const tzBlock = VTIMEZONES[trip.timezone];
  if (tzBlock) lines.push(tzBlock);
  lines.push(...events, 'END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

export async function shareOrDownloadIcs(filename, content) {
  const file = new File([content], filename, { type: 'text/calendar' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
      // fall through to download
    }
  }
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}
