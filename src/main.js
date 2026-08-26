import './style.css';
import { renderLanding } from './pages/landing.js';
import { renderScene } from './pages/scene.js';
import { renderInfo } from './pages/info.js';
import { renderRsvp } from './pages/rsvp.js';

// ============================================================
// 以 hash 做的極簡路由
// ------------------------------------------------------------
// 這個站只有四個畫面，不需要引入路由框架。用 hash 的理由有兩個：
//   1. RSVP 表單獨立成頁後要能單獨分享（#/rsvp），賓客不必先看完 3D 動畫
//   2. 瀏覽器的上一頁要能用
// hash 路由還有一個實務好處：靜態空間（GitHub Pages、Cloudflare Pages）
// 不需要任何 rewrite 設定，重新整理也不會 404。
//
// 路由表：
//   #/                → 首頁（選擇賓客身份）
//   #/scene/<side>    → 3D 過場動畫
//   #/info/<side>     → 婚禮資訊
//   #/rsvp[/<side>]   → 出席回覆表單
// ============================================================

const app = document.querySelector('#app');
let cleanupCurrentPage = null;
let currentKey = null;

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [name, rawSide] = raw.split('/');
  const side = rawSide === 'groom' || rawSide === 'bride' ? rawSide : null;
  return { name: name || 'landing', side };
}

function mount(renderFn) {
  if (cleanupCurrentPage) {
    cleanupCurrentPage();
    cleanupCurrentPage = null;
  }
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  cleanupCurrentPage = renderFn(app) || null;
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
  const { name, side } = parseHash();
  // 同一個畫面不重複掛載：programmatic 導航與 popstate/hashchange
  // 可能對同一次切換各觸發一次
  const key = `${name}:${side || ''}`;
  if (key === currentKey) return;
  currentKey = key;

  switch (name) {
    case 'scene':
      // 沒有指定身份就退回首頁重選，否則動畫不知道要播哪一段
      if (!side) return go('', true);
      mount((root) => renderScene(root, side, (finishedSide) => go(`info/${finishedSide}`, true)));
      break;

    case 'info':
      mount((root) => renderInfo(root, side || 'groom', () => go(`rsvp/${side || 'groom'}`)));
      break;

    case 'rsvp':
      mount((root) => renderRsvp(root, side, () => go(`info/${side || 'groom'}`)));
      break;

    default:
      mount((root) => renderLanding(root, (chosen) => go(`scene/${chosen}`)));
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