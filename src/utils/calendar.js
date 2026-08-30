import { weddingData } from '../data/weddingData.js';

/**
 * 加入行事曆的連結。
 *
 * 用 calendar.google.com 的 TEMPLATE 網址帶參數，開啟預填好的新增頁，
 * 不需要任何 API 或授權。
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

