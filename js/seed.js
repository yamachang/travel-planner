// 初始四段旅程骨架（僅在儲存空間為空時載入，不會覆蓋使用者資料）
export const SEED_TRIPS = [
  {
    id: 'paris-2026', name: '巴黎', destination: 'Paris, France',
    startDate: '2026-07-17', endDate: '2026-07-21', timezone: 'Europe/Paris', items: [],
  },
  {
    id: 'amsterdam-2026', name: '阿姆斯特丹', destination: 'Amsterdam, Netherlands',
    startDate: '2026-07-21', endDate: '2026-07-25', timezone: 'Europe/Amsterdam', items: [],
  },
  {
    id: 'taiwan-2026', name: '台灣', destination: 'Taiwan',
    startDate: '2026-07-25', endDate: '2026-08-10', timezone: 'Asia/Taipei', items: [],
  },
  {
    id: 'tokyo-2026', name: '東京', destination: 'Tokyo, Japan',
    startDate: '2026-08-10', endDate: '2026-08-13', timezone: 'Asia/Tokyo', items: [],
  },
];
