# 旅行計畫 ✈️

個人獨旅行程規劃 PWA。零依賴、零 build——純 HTML/CSS/JS，push 到 GitHub Pages 就能用。

## 功能

- **行程管理**：旅程 → 日 → 行程項目（航班/住宿/景點/餐廳/交通/備註），新增、編輯、↑↓ 排序、移到別天都是一兩下的事
- **iPhone 行事曆**：一鍵匯出 .ics（整趟或單日），透過分享面板直接加入內建行事曆；時間帶正確時區（巴黎/阿姆斯特丹/台北/東京）
- **Google Maps**：每個地點有「地圖」連結和「從上一站導航」路線連結（免 API key）
- **匯入訂票信**：從 Gmail 複製確認信內文貼上 → 自動解析航班/旅館/日期/確認碼 → 勾選確認後加入；格式特殊的信可用「AI 協助解析」（複製指令給 Claude/Gemini，貼回 JSON）
- **AI 行程健檢**：一鍵複製「這樣的行程順不順？」prompt（含目前行程），貼到 Claude 或 Gemini app
- **離線可用**：service worker 快取，飛機上、沒網路也能看行程
- **備份**：設定頁可匯出/還原 JSON（資料只存在手機瀏覽器的 localStorage）

## 開始使用（一次性設定）

1. GitHub repo → **Settings → Pages** → Source 選 **Deploy from a branch** → `main` / `/ (root)`（repo 需為 public，private 需付費方案）
2. 等一兩分鐘，用 iPhone Safari 打開 `https://yamachang.github.io/travel-planner/`
3. 點 Safari 的 **分享 → 加入主畫面**，之後從主畫面開啟就是全螢幕 app

## 開發

```bash
npm run serve          # http://localhost:8000
npm install            # 只為了跑測試（playwright）
PW_CHROMIUM=/opt/pw-browsers/chromium npm test   # 沙盒環境用預裝 Chromium；本機直接 npm test
```

### ⚠️ 部署規則

任何檔案有改動，**必須同時把 `sw.js` 開頭的 `CACHE` 版本號 +1**（例如 `tp-v1` → `tp-v2`），否則已安裝的 app 會一直用舊快取。

## 架構

```
index.html            app shell + iOS meta + SW 註冊
manifest.webmanifest  PWA manifest（zh-TW、standalone）
sw.js                 service worker：precache、導航 network-first、資產 cache-first
css/style.css         mobile-first、深色模式、safe-area
js/app.js             hash router（#/trip/:id/day/:date）
js/store.js           狀態 + localStorage(travel-planner:v1) + 匯出/匯入
js/seed.js            預設四趟旅程（僅在空儲存時載入）
js/views.js           所有畫面與互動
js/ics.js             .ics 產生器（硬編碼 VTIMEZONE）
js/parser.js          訂票信啟發式解析
js/prompts.js         AI prompt 組裝 + AI JSON 匯入驗證
js/maps.js            Google Maps deep links
test/smoke.mjs        Playwright 冒煙測試（iPhone viewport）
```

資料模型重點：日期是從旅程區間衍生的，行程項目只帶 `date` 欄位——「移到別天」= 改一個欄位。
