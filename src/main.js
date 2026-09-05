import './style.css';
import { renderLanding } from './pages/landing.js';
import { renderScene } from './pages/scene.js';
import { renderInfo } from './pages/info.js';

// ============================================================
// 以 hash 做的極簡路由
// ------------------------------------------------------------
// 這個站只有三個畫面，不需要引入路由框架。用 hash 的理由有兩個：
//   1. 資訊頁（含 RSVP 表單）要能單獨分享，賓客不必先看完 3D 動畫
//   2. 瀏覽器的上一頁要能用
// hash 路由還有一個實務好處：靜態空間（GitHub Pages、Cloudflare Pages）
// 不需要任何 rewrite 設定，重新整理也不會 404。
//
// 路由表：
//   #/                → 首頁（選擇賓客身份）
//   #/scene/<side>    → 3D 過場動畫
//   #/info/<side>     → 婚禮資訊（婚禮流程、婚紗照、出席回覆表單都在這一頁）
//
// 定錨（給 LINE 官方帳號那類外部連結用）：
//   #/album           → 資訊頁，直接捲到婚紗照相簿
//   #/rsvp            → 資訊頁，直接捲到出席回覆表單
//   #/venue #/transport #/schedule 同理
//   也可以寫成 #/info/groom/album 這種完整形式，同時指定身份與位置。
// ============================================================

/**
 * 資訊頁裡可以被定錨的區塊，值就是該 <section> 的 id（見 pages/info.js）。
 * 網址上的區塊名稱直接對應 id，外部連結才好記、好寫。
 */
const SECTION_IDS = ['venue', 'transport', 'schedule', 'album', 'rsvp'];

const app = document.querySelector('#app');
let cleanupCurrentPage = null;
let currentKey = null;

/**
 * 把 hash 拆成「哪一頁 / 哪一側 / 捲到哪一段」。
 *
 * 各段的順序刻意不強制：#/info/groom/album 與 #/info/album/groom
 * 都讀得懂，短網址 #/album 也一樣 —— 連結是要手寫貼進 LINE 的，
 * 順序記錯就進不去，太容易出事。
 */
function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  const parts = raw.split('/').filter(Boolean);

  let name = parts[0] || 'landing';
  let anchor = null;

  // #/album 這種短寫法：第一段就是區塊名稱，實際上要開的是資訊頁
  if (SECTION_IDS.includes(name)) {
    anchor = name;
    name = 'info';
  }

  const rest = parts.slice(1);
  const side = rest.find((p) => p === 'groom' || p === 'bride') || null;
  if (!anchor) anchor = rest.find((p) => SECTION_IDS.includes(p)) || null;

  return { name, side, anchor };
}

function mount(renderFn, anchor) {
  cancelAnchorScroll();
  if (cleanupCurrentPage) {
    cleanupCurrentPage();
    cleanupCurrentPage = null;
  }
  // 有指定錨點就交給 scrollToSection 決定捲軸位置，不要先跳回頂端
  if (!anchor) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  cleanupCurrentPage = renderFn(app) || null;
}

let anchorTimer = null;
let stopAnchorWatch = null;

/**
 * 捲到指定區塊。
 *
 * 捲一次是不夠的：區塊上方有 lazy 載入的照片與 Google 地圖 iframe，
 * 它們晚一點載完會把版面往下撐，剛剛算好的位置就整個偏掉了 ——
 * 相簿與表單都在整頁後半段，偏移量可能有好幾百 px，賓客打開 LINE
 * 的連結會停在一片空白處，還以為連錯地方。
 *
 * 所以這裡持續盯著文件高度、每次變動就重新對位，直到高度連續安定
 * 一段時間為止。（ResizeObserver 觀察 html/body 在實測中不會為了
 * 「內容把文件撐高」而觸發，所以老實用輪詢。）
 *
 * 使用者只要自己動了捲軸就立刻停手 —— 被程式一直拉回去比捲錯位置更煩。
 */
function scrollToSection(id) {
  cancelAnchorScroll();

  const el = document.getElementById(id);
  if (!el) return;

  const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
  events.forEach((type) => window.addEventListener(type, cancelAnchorScroll, { passive: true }));
  stopAnchorWatch = () => events.forEach((type) => window.removeEventListener(type, cancelAnchorScroll));

  const INTERVAL = 120;
  const SETTLED_MS = 900; // 高度安定這麼久就認定版面不會再動了
  const hardStop = Date.now() + 10000;
  let lastHeight = -1;
  let stableFor = 0;

  const step = () => {
    el.scrollIntoView({ block: 'start', behavior: 'auto' });

    const height = document.documentElement.scrollHeight;
    stableFor = height === lastHeight ? stableFor + INTERVAL : 0;
    lastHeight = height;

    if (stableFor >= SETTLED_MS || Date.now() > hardStop) cancelAnchorScroll();
    else anchorTimer = window.setTimeout(step, INTERVAL);
  };
  step();
}

function cancelAnchorScroll() {
  window.clearTimeout(anchorTimer);
  anchorTimer = null;
  if (stopAnchorWatch) stopAnchorWatch();
  stopAnchorWatch = null;
}

/**
 * @param {string} path - 不含開頭 '#/' 的路徑，例如 'info/groom'
 * @param {boolean} [replace] - 以取代的方式寫入歷史紀錄。
 *   動畫過場完成後導向資訊頁時用 replace，這樣從資訊頁按上一頁
 *   會回到首頁，而不是把動畫重播一次。
 */
function go(path, replace = false) {
  const target = `#/${path}`;
  if (window.location.hash !== target) {
    if (replace) window.history.replaceState(null, '', target);
    else window.history.pushState(null, '', target);
  }
  render();
}

function render() {
  const { name, side, anchor } = parseHash();
  // 同一個畫面不重複掛載：programmatic 導航與 popstate/hashchange
  // 可能對同一次切換各觸發一次。
  // key 刻意不含 anchor —— 從 #/album 換到 #/rsvp 只需要捲動，
  // 不必把整頁（含相簿翻頁書）重建一次。
  const key = `${name}:${side || ''}`;
  const isSamePage = key === currentKey;
  currentKey = key;

  switch (name) {
    case 'scene':
      // 沒有指定身份就退回首頁重選，否則動畫不知道要播哪一段
      if (!side) return go('', true);
      if (!isSamePage) {
        mount((root) => renderScene(root, side, (finishedSide) => go(`info/${finishedSide}`, true)));
      }
      break;

    case 'info':
      if (!isSamePage) mount((root) => renderInfo(root, side), anchor);
      if (anchor) scrollToSection(anchor);
      else if (isSamePage) window.scrollTo({ top: 0, behavior: 'smooth' });
      break;

    default:
      if (!isSamePage) mount((root) => renderLanding(root, (chosen) => go(`scene/${chosen}`)));
  }
}

// popstate 處理上一頁／下一頁；hashchange 處理使用者直接改網址列。
// 兩者都可能對同一次切換觸發，靠 render() 內的 currentKey 擋掉重複。
window.addEventListener('popstate', render);
window.addEventListener('hashchange', render);

// 首次載入若沒有 hash，補一個乾淨的 #/，讓之後的上一頁行為一致
if (!window.location.hash) {
  window.history.replaceState(null, '', '#/');
}
render();
