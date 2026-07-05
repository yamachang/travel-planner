// 冒煙測試：iPhone viewport 下跑過主要流程
// 執行：npm install && npm test（會自動啟動本機伺服器）
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  let path = req.url.split('?')[0];
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise(r => server.listen(8321, r));
const BASE = 'http://localhost:8321/';

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name} ${extra}`); }
}

const executablePath = process.env.PW_CHROMIUM || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  locale: 'zh-TW',
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await ctx.newPage();
page.on('pageerror', e => { failures++; console.error('  ✗ page error:', e.message); });

console.log('— M1 trip list + seed —');
await page.goto(BASE);
await page.waitForSelector('.trip-card');
const tripNames = await page.$$eval('.trip-card .trip-name', els => els.map(e => e.textContent));
check('4 個 seed 旅程', tripNames.length === 4, JSON.stringify(tripNames));
check('中文旅程名稱', tripNames.includes('巴黎') && tripNames.includes('阿姆斯特丹') && tripNames.includes('台灣') && tripNames.includes('東京'));

console.log('— M1 day view —');
await page.click('.trip-card:has-text("巴黎")');
await page.waitForSelector('.day-tab');
const dayTabs = await page.$$eval('.day-tab', els => els.length);
check('巴黎 5 個日期 tab（7/17–7/21）', dayTabs === 5, `got ${dayTabs}`);
check('URL 是第一天', page.url().includes('#/trip/paris-2026/day/2026-07-17'), page.url());

console.log('— M2 item CRUD —');
await page.click('.fab');
await page.click('.type-opt:has-text("景點/活動")');
await page.fill('#f-title', '羅浮宮');
await page.fill('#f-st', '09:30');
await page.fill('#f-loc', 'Musée du Louvre, Paris');
await page.click('#f-save');
await page.waitForSelector('.item-card');
check('新增項目顯示', await page.$eval('.item-title', e => e.textContent) === '羅浮宮');

await page.click('.fab');
await page.fill('#f-title', '龐畢度中心');
await page.fill('#f-st', '14:00');
await page.fill('#f-loc', 'Centre Pompidou, Paris');
await page.click('#f-save');
await page.waitForFunction(() => document.querySelectorAll('.item-card').length === 2);

// 導航連結應以上一站為起點
const dirHref = await page.locator('.item-card').nth(1).locator('a:has-text("導航")').getAttribute('href');
check('第二項的導航以上一站為 origin', !!dirHref && dirHref.includes('origin=') && decodeURIComponent(dirHref).includes('Louvre'), dirHref);

// 排序 ↑
await page.locator('.item-card').nth(1).locator('[data-up]').click();
await page.waitForFunction(() => document.querySelector('.item-title')?.textContent === '龐畢度中心');
check('↑ 上移生效', true);

// 編輯 + 移到別天
await page.click('.item-card:has-text("龐畢度中心") .chip:has-text("編輯")');
await page.selectOption('#f-date', '2026-07-18');
await page.click('#f-save');
await page.waitForFunction(() => location.hash.includes('2026-07-18'));
check('移到 7/18', await page.$eval('.item-title', e => e.textContent) === '龐畢度中心');

// reload 後仍在（localStorage 持久化）
await page.reload();
await page.waitForSelector('.item-card');
check('reload 後資料仍在', await page.$eval('.item-title', e => e.textContent) === '龐畢度中心');

// 刪除
await page.click('.chip:has-text("編輯")');
page.once('dialog', d => d.accept());
await page.click('#f-del');
await page.waitForSelector('.empty');
check('刪除後 7/18 變空', true);

console.log('— M3 ICS —');
const ics = await page.evaluate(() => {
  const trip = window.__tp.store.getTrip('paris-2026');
  window.__tp.store.addItem('paris-2026', {
    date: '2026-07-19', type: 'food', title: 'Café de Flore, 甜點',
    startTime: '15:00', endTime: '16:00', location: 'Café de Flore, Paris', confirmation: 'XY12345',
  });
  return window.__tp.ics.buildTripIcs(trip);
});
check('VCALENDAR 結構', ics.startsWith('BEGIN:VCALENDAR') && ics.trim().endsWith('END:VCALENDAR'));
check('VTIMEZONE Europe/Paris', ics.includes('BEGIN:VTIMEZONE') && ics.includes('TZID:Europe/Paris'));
check('DTSTART 帶 TZID', ics.includes('DTSTART;TZID=Europe/Paris:20260717T093000'));
check('SUMMARY 逗號 escape', ics.includes('Café de Flore\\, 甜點'));
check('DESCRIPTION 含確認碼', ics.includes('XY12345'));
check('全天項目用 VALUE=DATE', await page.evaluate(() => {
  window.__tp.store.addItem('paris-2026', { date: '2026-07-20', type: 'note', title: '自由活動' });
  return window.__tp.ics.buildTripIcs(window.__tp.store.getTrip('paris-2026')).includes('DTSTART;VALUE=DATE:20260720');
}));

console.log('— M4 AI prompt 複製 —');
await page.goto(BASE + '#/trip/paris-2026/day/2026-07-19');
await page.waitForSelector('.action-chip');
await page.click('[data-act="ai-day"]');
const clip = await page.evaluate(() => navigator.clipboard.readText());
check('prompt 含行程與問題', clip.includes('Café de Flore') && clip.includes('順不順'), clip.slice(0, 80));

console.log('— M4 email 解析 —');
const parsed = await page.evaluate(() => window.__tp.parser.parseEmail(
  `您的訂位已確認\n長榮航空 BR 87\n2026年7月17日 07:40 台北桃園 (TPE) → 巴黎戴高樂 (CDG) 16:45\n訂位代號: ABC123`,
  window.__tp.store.getTrip('paris-2026'),
));
check('抓到航班 BR 87', parsed.some(c => c.type === 'flight' && c.title.includes('BR 87')), JSON.stringify(parsed));
const f = parsed.find(c => c.type === 'flight');
check('航班日期 2026-07-17', f?.date === '2026-07-17', f?.date);
check('起飛時間 07:40', f?.startTime === '07:40', f?.startTime);
check('確認碼 ABC123', f?.confirmation === 'ABC123');
check('航線 TPE → CDG', f?.title.includes('TPE') && f?.title.includes('CDG'), f?.title);

const hotelParsed = await page.evaluate(() => window.__tp.parser.parseEmail(
  `Booking confirmed!\nHotel Le Marais\nCheck-in: Jul 17, 2026\nCheck-out: Jul 21, 2026\nConfirmation number: 7HQK2P`,
  window.__tp.store.getTrip('paris-2026'),
));
const h = hotelParsed.find(c => c.type === 'lodging');
check('抓到旅館', !!h, JSON.stringify(hotelParsed));
check('入住日 7/17', h?.date === '2026-07-17', h?.date);
check('旅館確認碼', h?.confirmation === '7HQK2P', h?.confirmation);

console.log('— M4 AI JSON 匯入驗證 —');
const aiOk = await page.evaluate(() => {
  const out = window.__tp.prompts.parseAiJson('```json\n[{"type":"flight","title":"KL 1234","date":"2026-07-21","startTime":"10:00","endTime":null,"location":"CDG","confirmation":"ZZZ999","notes":""}]\n```');
  return out.length === 1 && out[0].title === 'KL 1234' && out[0].startTime === '10:00';
});
check('AI JSON（含 ```包裝）解析', aiOk);
const aiBad = await page.evaluate(() => {
  try { window.__tp.prompts.parseAiJson('[{"type":"flight","date":"2026-07-21"}]'); return false; }
  catch { return true; }
});
check('缺 title 會被擋下', aiBad);

console.log('— M5 PWA —');
check('manifest link', await page.$eval('link[rel="manifest"]', e => e.href.endsWith('manifest.webmanifest')));
const swReady = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 8000))]);
  return reg ? 'ready' : 'timeout';
});
check('service worker 註冊成功', swReady === 'ready', swReady);

console.log('— 設定頁備份 —');
await page.goto(BASE + '#/settings');
await page.click('#btn-copy-backup');
const backup = await page.evaluate(() => navigator.clipboard.readText());
check('備份 JSON 可解析且含 trips', (() => { try { return Array.isArray(JSON.parse(backup).trips); } catch { return false; } })());

await browser.close();
server.close();

if (failures) {
  console.error(`\n${failures} 個測試失敗`);
  process.exit(1);
}
console.log('\n全部通過 ✓');
