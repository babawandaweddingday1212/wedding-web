// 從 public/photos/background/ 的三張單一圖案線稿，拼出背景花紋用的那塊磚。
//
// 為什麼要拼：CSS 的 background-repeat 是死板的方陣。一層一個圖案時，
// 只要格子比視窗窄，同一朵花就會在同一個高度上並排出現兩次，一眼看穿是複製的；
// 而三個圖案各鋪一層的話，層跟層之間誰壓到誰完全沒人管，鯨魚就會穿過蘆葦。
//
// 所以只出一塊大磚、三種圖案全排在裡面。排法是磚牆式的交錯：
//   - 同一種圖案一律同一個大小、一律正面直立，不縮放也不翻面
//   - 底子是格子，但格子只決定「大概在哪一區」：單數欄整欄往下挪半格
//     （half-drop），每一格再各自往四周晃開 JITTER 那麼多。
//     不晃的話同一欄的 x 完全一樣，整片會看出一條條直排
//   - 每一格擺哪一種是隨機挑的（照順序輪會排出一條條同種圖案的斜線，
//     比整齊排列更顯眼），但要同時滿足這幾條規矩：
//       · 同種之間的高度至少差 MIN_ROW_GAP —— 兩隻同種同高最像複製貼上
//       · 每一欄三種各佔固定份額，不然亂數很容易讓某一欄整條都是鯨魚
//       · 上下相鄰不同種，直的方向也才不會連成一條
//   - 挑完會全部兩兩驗一次距離，撞到就直接報錯，不會默默生出重疊的圖
//
// 座標一律用「網頁上的 px」：磚的大小就是 CSS background-size 該填的值。
//
// 用法：node scripts/build-pattern.mjs

import fs from 'node:fs';
import path from 'node:path';

const DIR = 'public/photos/background';
const OUT = path.join(DIR, 'pattern.svg');

/** 切成幾欄幾列。欄數要雙數，左右接縫的錯位才接得起來 */
const GRID = [6, 6];

/** 一格多大。磚的大小＝格子 × 欄列數 */
const CELL = [640, 540];

/** 每一格可以往四周晃開多少 px（x, y）。太小會看出格子，太大就會擠在一起 */
const JITTER = [125, 70];

/** 同種圖案彼此的高度至少要差這麼多，否則看起來像排在同一條線上 */
const MIN_ROW_GAP = 140;

/** 單數欄往下挪的比例：0.5 就是挪半格，左右欄正好交錯 */
const COL_SHIFT = 0.5;

/** 每種圖案的墨跡寬度（px）。同一種全部一樣大 */
const SIZES = { whale: 440, lily: 270, cattail: 330 };

/** 圖案之間至少要留的空隙（以外框計） */
const GAP = 40;

/** 挑種類用的固定種子。改這個數字就換一種排法，換到順眼為止 */
const SEED = 3;

/** 把 potrace 輸出的 <g transform> 與底下所有 path 抓出來 */
function readMotif(name) {
  const svg = fs.readFileSync(path.join(DIR, `${name}.svg`), 'utf8');
  const g = svg.match(/<g transform="([^"]+)"[^>]*>([\s\S]*?)<\/g>/);
  if (!g) throw new Error(`${name}.svg 找不到 <g transform> 群組`);
  return { transform: g[1], paths: g[2].trim(), ink: inkBox(g[2], g[1]) };
}

/** 墨跡範圍。曲線只取控制點，會略微高估，但三張一致高估不影響相對大小 */
function inkBox(paths, transform) {
  const [, tx, ty, sx, sy] = transform
    .match(/translate\(([-\d.]+),([-\d.]+)\)\s*scale\(([-\d.]+),([-\d.]+)\)/)
    .map(Number);
  const d = [...paths.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]).join(' ');
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+/g) ?? [];
  const argc = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };
  const xs = [];
  const ys = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let cmd = null;

  for (let i = 0; i < tokens.length; ) {
    const t = tokens[i];
    if (/[a-zA-Z]/.test(t)) {
      cmd = t;
      i += 1;
      if (cmd === 'Z' || cmd === 'z') {
        x = startX;
        y = startY;
        xs.push(x);
        ys.push(y);
      }
      continue;
    }
    const upper = cmd.toUpperCase();
    const rel = cmd === cmd.toLowerCase();
    const n = argc[upper];
    const a = tokens.slice(i, i + n).map(Number);
    i += n;

    if (upper === 'H') x = rel ? x + a[0] : a[0];
    else if (upper === 'V') y = rel ? y + a[0] : a[0];
    else {
      for (let j = 0; j < n - 2; j += 2) {
        xs.push(rel ? x + a[j] : a[j]);
        ys.push(rel ? y + a[j + 1] : a[j + 1]);
      }
      const [px, py] = a.slice(-2);
      x = rel ? x + px : px;
      y = rel ? y + py : py;
      if (upper === 'M') {
        startX = x;
        startY = y;
        cmd = rel ? 'l' : 'L'; // M 之後接的座標是隱含的 lineto
      }
    }
    xs.push(x);
    ys.push(y);
  }

  const X = xs.map((v) => tx + sx * v);
  const Y = ys.map((v) => ty + sy * v);
  const x0 = Math.min(...X);
  const y0 = Math.min(...Y);
  const x1 = Math.max(...X);
  const y1 = Math.max(...Y);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}

/** 固定種子的亂數：同一份設定每次跑出來的排法都一樣 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 高度差也要繞回去算：磚頂和磚底其實是接在一起的 */
function rowGap(a, b) {
  const d = Math.abs(a.y - b.y) % TILE[1];
  return Math.min(d, TILE[1] - d);
}

/** 磚會無限重複，所以兩隻是否太靠近要繞著左右上下接回去一起看 */
function tooClose(a, b, gap) {
  const [tw, th] = TILE;
  for (const dx of [-tw, 0, tw]) {
    for (const dy of [-th, 0, th]) {
      const near =
        Math.abs(a.x + dx - b.x) * 2 < a.w + b.w + gap * 2 &&
        Math.abs(a.y + dy - b.y) * 2 < a.h + b.h + gap * 2;
      if (near) return true;
    }
  }
  return false;
}

const motifs = Object.fromEntries(
  Object.keys(SIZES).map((n) => [n, readMotif(n)]),
);

const [COLS, ROWS] = GRID;
const [cellW, cellH] = CELL;
const TILE = [COLS * cellW, ROWS * cellH];

/** 每種圖案擺上去之後佔多大 */
const boxes = Object.fromEntries(
  Object.entries(SIZES).map(([name, w]) => {
    const { ink } = motifs[name];
    return [name, { w, h: (w / ink.w) * ink.h, scale: w / ink.w }];
  }),
);

/** 格子中心。單數欄整欄往下挪，這就是「交錯」的底子 */
const cellAt = (col, row) => ({
  x: (col + 0.5) * cellW,
  y: ((row + 0.5 + (col % 2 ? COL_SHIFT : 0)) * cellH) % TILE[1],
});

const random = rng(SEED);
// 一欄一欄由上往下填，「上面那格是什麼」才查得到
const cells = [];
for (let col = 0; col < COLS; col += 1) {
  for (let row = 0; row < ROWS; row += 1) cells.push({ col, row, ...cellAt(col, row) });
}

// 每一欄要三種平均分，列數得能被種類數整除
if (ROWS % Object.keys(SIZES).length) throw new Error('列數要能被種類數整除');

// 三種平均分配，一格一格由上往下填。每一格把三種都試一遍，全都違規就整盤
// 重來（種子固定，所以跑幾次結果都一樣）
const KINDS = Object.keys(SIZES);
const PER_COL = ROWS / KINDS.length; // 每一欄每種各擺幾隻

function assign() {
  const left = new Map(); // 每一欄每種還剩幾隻可用
  const placed = [];

  for (const cell of cells) {
    const tried = new Set();
    let ok = false;
    while (!ok && tried.size < KINDS.length) {
      const quota = (name) => left.get(`${cell.col}:${name}`) ?? PER_COL;
      const pick = KINDS.filter((n) => !tried.has(n) && quota(n) > 0);
      if (!pick.length) break;
      const name = pick[Math.floor(random() * pick.length)];
      tried.add(name);

      const above = placed.filter(
        (p) => p.col === cell.col && (p.row === cell.row - 1 || p.row === ROWS - 1),
      );
      if (above.some((p) => p.motif === name)) continue;

      // 同一格裡多試幾個落點，撞到就換一個位置再試，都不行才換種類
      for (let shot = 0; shot < 80 && !ok; shot += 1) {
        const item = {
          ...cell,
          ...boxes[name],
          motif: name,
          x: cell.x + (random() * 2 - 1) * JITTER[0],
          y: cell.y + (random() * 2 - 1) * JITTER[1],
        };
        const clash = placed.some(
          (p) =>
            tooClose(item, p, GAP) || (p.motif === name && rowGap(item, p) < MIN_ROW_GAP),
        );
        if (clash) continue;
        left.set(`${cell.col}:${name}`, quota(name) - 1);
        placed.push(item);
        ok = true;
      }
    }
    if (!ok) return null;
  }
  return placed;
}

let placed = null;
for (let attempt = 0; attempt < 500 && !placed; attempt += 1) placed = assign();
if (!placed) throw new Error('排不出不相撞的組合：格子要放大，或 SIZES 要縮小');

// 保險：全部兩兩再驗一次，寧可 build 掛掉也不要默默生出疊在一起的圖
for (let i = 0; i < placed.length; i += 1) {
  for (let j = i + 1; j < placed.length; j += 1) {
    if (tooClose(placed[i], placed[j], GAP)) {
      throw new Error(`${placed[i].motif} 和 ${placed[j].motif} 靠太近`);
    }
    if (placed[i].motif === placed[j].motif && rowGap(placed[i], placed[j]) < MIN_ROW_GAP) {
      throw new Error(`兩隻 ${placed[i].motif} 的高度差不到 ${MIN_ROW_GAP}px`);
    }
  }
}

const round = (n) => Number(n.toFixed(2));
const [TW, TH] = TILE;

const uses = placed.flatMap(({ x, y, w, h, motif, scale }) => {
  const { ink } = motifs[motif];
  // 由外往內讀：先把墨跡中心移到原點，縮到指定大小，再擺到格子中心
  const shape = `scale(${round(scale)}) translate(${round(-ink.cx)} ${round(-ink.cy)})`;

  // 壓到磚邊的，在對邊也補一份，接縫處才接得起來
  const dxs = [0, ...(x - w / 2 < 0 ? [TW] : []), ...(x + w / 2 > TW ? [-TW] : [])];
  const dys = [0, ...(y - h / 2 < 0 ? [TH] : []), ...(y + h / 2 > TH ? [-TH] : [])];

  return dxs.flatMap((dx) =>
    dys.map(
      (dy) =>
        // href 與 xlink:href 都寫：舊版 Safari 只認得 xlink 那個
        `  <use href="#${motif}" xlink:href="#${motif}"` +
        ` transform="translate(${round(x + dx)} ${round(y + dy)}) ${shape}" />`,
    ),
  );
});

const defs = Object.entries(motifs).map(
  ([name, m]) => `<g id="${name}" transform="${m.transform}">\n${m.paths}\n</g>`,
);

fs.writeFileSync(
  OUT,
  `<?xml version="1.0" encoding="UTF-8"?>
<!-- 由 scripts/build-pattern.mjs 產生，請勿手改；要改排版動那支腳本的設定 -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
 width="${TW}" height="${TH}" viewBox="0 0 ${TW} ${TH}" fill="#8a6a4f" stroke="none">
<defs>
${defs.join('\n')}
</defs>
${uses.join('\n')}
</svg>
`,
);

const tally = Object.keys(SIZES)
  .map((n) => `${n} ${placed.filter((p) => p.motif === n).length} 隻 @ ${SIZES[n]}px`)
  .join('、');
console.log(`${OUT}  ${TW}×${TH}px，${placed.length} 隻（${tally}）`);
console.log('CSS 的 background-size 就填這個磚尺寸。');
