// 從 photos-src/album/ 的原始照片產生網頁用的相簿頁面與頁序清單。
//
// 直幅照片 → 一張一頁。
// 橫幅照片 → 切成左右兩半、橫跨一個跨頁，翻頁書攤開時是一張完整大圖。
//
// 跨頁的關鍵在對齊：page-flip 在 showCover:false 時，頁面是
// 0|1、2|3、4|5 這樣配對，左頁一定是「偶數索引」。
// 因此左半必須落在偶數索引，否則會被裝訂線切在錯的地方。
// 索引落在奇數時，就先插一張直幅照片把它推到偶數位。
//
// 用法：node scripts/build-album.mjs

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SRC = 'photos-src/album';
const OUT = 'public/photos/album';
const MANIFEST = 'src/data/albumPages.js';

/** 分組顯示順序：飯店 → 華山 → 棚拍（紅、白）→ 隧道 */
const GROUP_ORDER = ['hotel', 'huashan', 'studio-red', 'studio-white', 'tunnel'];

const PAGE_LONG_EDGE = 900; // 單頁輸出的長邊
const QUALITY = 78;

const sips = (args) => execFileSync('sips', args, { stdio: 'pipe' });

function size(file) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], {
    encoding: 'utf8',
  });
  const w = Number(out.match(/pixelWidth:\s*(\d+)/)[1]);
  const h = Number(out.match(/pixelHeight:\s*(\d+)/)[1]);
  return { w, h };
}

// 先把裁切工具編成執行檔：橫幅有 21 張、要跑 42 次，
// 每次都用 swift 直譯啟動會慢上一個數量級
const CROP_BIN = path.join(os.tmpdir(), 'wedding-crop');
console.log('編譯裁切工具…');
execFileSync('swiftc', ['-O', 'photos-src/crop.swift', '-o', CROP_BIN], { stdio: 'pipe' });

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const all = fs
  .readdirSync(SRC)
  .filter((f) => f.toLowerCase().endsWith('.jpg'))
  .sort();

// 依分組整理，組內維持檔名順序
const grouped = GROUP_ORDER.map((g) => ({
  group: g,
  files: all.filter((f) => f.startsWith(`${g}-`)).sort(),
}));

const ungrouped = all.filter((f) => !GROUP_ORDER.some((g) => f.startsWith(`${g}-`)));
if (ungrouped.length) {
  console.error('這些檔案不屬於任何分組：', ungrouped.join(', '));
  process.exit(1);
}

// 兩份頁序：
//   spread — 桌機跨頁模式，橫幅切成左右半
//   single — 手機單頁模式，橫幅維持完整一張（切半會變成兩張殘圖）
const spreadPages = [];
const singlePages = [];
let spreadCount = 0;
let singleCount = 0;

for (const { group, files } of grouped) {
  // 先分出直幅與橫幅，才能在需要對齊時把直幅照片挪過來墊
  const items = files.map((f) => {
    const { w, h } = size(path.join(SRC, f));
    return { file: f, wide: w > h };
  });

  const portraits = items.filter((i) => !i.wide);
  const wides = items.filter((i) => i.wide);
  let pi = 0;
  let wi = 0;

  // 交錯輸出：能放跨頁就放，位置不對就先補一張直幅
  while (pi < portraits.length || wi < wides.length) {
    const needAlign = spreadPages.length % 2 === 1;

    if (wi < wides.length && !needAlign) {
      const { file } = wides[wi++];
      const base = file.replace(/\.jpg$/i, '');
      spreadPages.push(
        { f: `${base}-L.jpg`, fit: 'cover' },
        { f: `${base}-R.jpg`, fit: 'cover' }
      );
      // 手機維持完整一張；橫幅放在直式頁面上要用 contain，否則會被裁掉大半
      singlePages.push({ f: file, fit: 'contain' });
      spreadCount++;
      continue;
    }

    if (pi < portraits.length) {
      const { file } = portraits[pi++];
      spreadPages.push({ f: file, fit: 'cover' });
      singlePages.push({ f: file, fit: 'cover' });
      singleCount++;
      continue;
    }

    // 只剩橫幅但位置是奇數 —— 補一張空白頁把它推到偶數位
    if (wi < wides.length) {
      spreadPages.push({ f: '__blank.jpg', fit: 'cover' });
      continue;
    }
  }
}

// --- 產生圖檔 ---
for (const { files } of grouped) {
  for (const f of files) {
    const src = path.join(SRC, f);
    const { w, h } = size(src);
    const base = f.replace(/\.jpg$/i, '');

    // 直幅只要一份；橫幅除了左右半，還要保留完整一張給手機單頁模式用
    sips(['-Z', String(PAGE_LONG_EDGE), '-s', 'format', 'jpeg', '-s', 'formatOptions',
      String(QUALITY), '--out', path.join(OUT, f), src]);
    if (w <= h) continue;

    // 橫幅：等分成左右兩半，各自成為一頁。
    //
    // 這裡不用 sips —— 它的 --cropOffset 是以「中心」為基準，
    // 而且負值會被當成參數旗標，切不出乾淨的左右半（實測會重疊）。
    // photos-src/crop.swift 用 CoreImage 直接吃像素矩形，語意明確。
    const half = Math.floor(w / 2);
    for (const [suffix, x] of [['L', 0], ['R', w - half]]) {
      const tmp = path.join(OUT, `__tmp-${suffix}.jpg`);
      execFileSync(CROP_BIN, [src, tmp, String(x), '0', String(half), String(h)], {
        stdio: 'pipe',
      });
      sips(['-Z', String(PAGE_LONG_EDGE), '-s', 'format', 'jpeg', '-s', 'formatOptions',
        String(QUALITY), '--out', path.join(OUT, `${base}-${suffix}.jpg`), tmp]);
      fs.rmSync(tmp);
    }
  }
}

// 需要的話產生一張純白的墊頁
if (spreadPages.some((p) => p.f === '__blank.jpg')) {
  const w = 640;
  const h = 900;
  const ppm = path.join(OUT, '__blank.ppm');
  fs.writeFileSync(ppm, Buffer.concat([
    Buffer.from(`P6\n${w} ${h}\n255\n`),
    Buffer.alloc(w * h * 3, 0xff),
  ]));
  sips(['-s', 'format', 'jpeg', '--out', path.join(OUT, '__blank.jpg'), ppm]);
  fs.rmSync(ppm);
}

// --- 寫出頁序清單 ---
const missing = [...spreadPages, ...singlePages]
  .map((p) => p.f)
  .filter((f) => !fs.existsSync(path.join(OUT, f)));
if (missing.length) {
  console.error('清單裡有檔案不存在：', [...new Set(missing)].join(', '));
  process.exit(1);
}

const fmt = (list) =>
  list.map((p) => `  { f: '${p.f}', fit: '${p.fit}' },`).join('\n');

fs.writeFileSync(
  MANIFEST,
  '// 此檔由 scripts/build-album.mjs 產生，請勿手動編輯。\n' +
    `// 分組順序：${GROUP_ORDER.join(' → ')}\n` +
    '//\n' +
    '// albumSpread — 桌機跨頁模式：橫幅切成 -L / -R 兩半橫跨一個跨頁，\n' +
    '//               左半固定落在偶數索引（page-flip 的左頁一定是偶數）。\n' +
    '// albumSingle — 手機單頁模式：橫幅維持完整一張，切半會變成兩張殘圖。\n\n' +
    'export const albumSpread = [\n' + fmt(spreadPages) + '\n];\n\n' +
    'export const albumSingle = [\n' + fmt(singlePages) + '\n];\n'
);

const ok = (t, v) => console.log(`${v ? '✓' : '✗'} ${t}`);
console.log(`跨頁模式 ${spreadPages.length} 頁　單頁模式 ${singlePages.length} 頁`);
console.log(`（直幅 ${singleCount} 張、橫幅 ${spreadCount} 張）`);
ok('左半全部落在偶數索引',
  spreadPages.every((p, i) => !p.f.endsWith('-L.jpg') || i % 2 === 0));
ok('右半全部緊接左半',
  spreadPages.every((p, i) => !p.f.endsWith('-R.jpg') || spreadPages[i - 1]?.f === p.f.replace('-R.jpg', '-L.jpg')));
ok('單頁模式沒有任何半張圖',
  singlePages.every((p) => !/-[LR]\.jpg$/.test(p.f)));
ok('兩份清單涵蓋同樣的照片數',
  singlePages.filter((p) => p.f !== '__blank.jpg').length === singleCount + spreadCount);
