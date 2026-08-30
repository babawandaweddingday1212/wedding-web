import { weddingData } from '../data/weddingData.js';

/**
 * 加入行事曆的連結。
 *
 * 兩種都不需要任何 API 或授權：
 *   Google — 用 calendar.google.com 的 TEMPLATE 網址帶參數，開啟預填好的新增頁
 *   .ics   — 指向 public/wedding.ics（由 scripts/build-ics.mjs 產生）
 *
 * 為什麼 .ics 用靜態檔而不是前端即時產生 Blob：
 * iOS Safari 對 blob:／data: 的下載限制很多，點了常常沒反應；
 * 指向真實網址時 iOS 會直接開啟「行事曆」App。
 */

/** 轉成 Google 行事曆要的 UTC 格式：YYYYMMDDTHHMMSSZ */
function toGoogleStamp(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Google 行事曆的新增事件網址 */
export function googleCalendarUrl() {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: weddingData.eventName,
    dates: `${toGoogleStamp(weddingData.dateISO)}/${toGoogleStamp(weddingData.dateEndISO)}`,
    location: `${weddingData.venueName}, ${weddingData.address}`,
    details: `${weddingData.venueName}\n${weddingData.address}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** 下載用的 .ics 網址（Apple 行事曆、Outlook 等） */
export function icsUrl() {
  return `${import.meta.env.BASE_URL}wedding.ics`;
}
