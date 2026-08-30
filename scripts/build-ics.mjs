// 由 src/data/weddingData.js 產生 public/wedding.ics。
//
// 為什麼要靜態檔而不是前端即時產生 Blob：
// iOS Safari 對 blob:／data: 的下載限制很多，點了常常沒反應。
// 指向一個真實的 .ics 網址最可靠 —— iOS 會直接開啟「行事曆」App，
// Android 與桌機則會下載並交給預設行事曆程式。
//
// 這支腳本綁在 npm run build 之前執行，日期改了不會忘記同步。

import fs from 'node:fs';

const SRC = 'src/data/weddingData.js';
const OUT = 'public/wedding.ics';

const src = fs.readFileSync(SRC, 'utf8');

/** 從設定檔取出字串欄位（只取單引號的簡單字面值） */
function field(name) {
  const m = src.match(new RegExp(`\\n\\s*${name}:\\s*'([^']*)'`));
  if (!m) {
    console.error(`weddingData.js 找不到欄位：${name}`);
    process.exit(1);
  }
  return m[1];
}

const eventName = field('eventName');
const startISO = field('dateISO');
const endISO = field('dateEndISO');
const venueName = field('venueName');
const address = field('address');

/** 轉成 iCalendar 的 UTC 時間戳：YYYYMMDDTHHMMSSZ */
function stamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    console.error(`日期格式無法解析：${iso}`);
    process.exit(1);
  }
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** iCalendar 的文字跳脫：反斜線、分號、逗號、換行 */
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/**
 * iCalendar 規定每行不得超過 75 個八位元組，超過要折行
 * （續行以一個空白開頭）。中文是多位元組字元，
 * 折行時必須整個字元一起搬，不能從中間切開。
 */
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 73) return line;

  const out = [];
  let cur = Buffer.alloc(0);
  for (const ch of line) {
    const chBytes = Buffer.from(ch, 'utf8');
    const limit = out.length === 0 ? 73 : 72; // 續行多一個前導空白
    if (cur.length + chBytes.length > limit) {
      out.push(cur.toString('utf8'));
      cur = Buffer.alloc(0);
    }
    cur = Buffer.concat([cur, chBytes]);
  }
  if (cur.length) out.push(cur.toString('utf8'));
  return out.join('\r\n ');
}

const lines = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//wedding-site//TW',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'BEGIN:VEVENT',
  `UID:${stamp(startISO)}-wedding@babawanda`,
  `DTSTAMP:${stamp(new Date().toISOString())}`,
  `DTSTART:${stamp(startISO)}`,
  `DTEND:${stamp(endISO)}`,
  `SUMMARY:${esc(eventName)}`,
  `LOCATION:${esc(`${venueName}, ${address}`)}`,
  `DESCRIPTION:${esc(`${eventName}\n${venueName}\n${address}`)}`,
  'BEGIN:VALARM',
  'TRIGGER:-P1D', // 前一天提醒
  'ACTION:DISPLAY',
  `DESCRIPTION:${esc(`明天是 ${eventName}`)}`,
  'END:VALARM',
  'END:VEVENT',
  'END:VCALENDAR',
];

// iCalendar 規定換行必須是 CRLF
fs.writeFileSync(OUT, lines.map(fold).join('\r\n') + '\r\n');

const over = fs
  .readFileSync(OUT, 'utf8')
  .split('\r\n')
  .filter((l) => Buffer.from(l, 'utf8').length > 75);
console.log(`已產生 ${OUT}`);
console.log(`  ${eventName}`);
console.log(`  ${startISO} → ${endISO}`);
console.log(`  ${over.length === 0 ? '✓' : '✗'} 每行都在 75 位元組內`);
