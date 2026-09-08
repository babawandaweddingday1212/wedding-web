import { PageFlip } from 'page-flip/dist/js/page-flip.module.js';
import 'page-flip/src/Style/stPageFlip.css';
import { albumSpread, albumSingle } from '../data/albumPages.js';

/** 目前頁面前後各預載幾頁 */
const PRELOAD_RANGE = 4;

/** 大於這個寬度才用跨頁模式；以下改單頁 */
const SPREAD_QUERY = '(min-width: 700px)';

/**
 * 記住看到第幾頁用的 sessionStorage 鍵。
 *
 * 用 sessionStorage 而不是 localStorage：分頁關掉就該忘記 —— 下次有人
 * 重新點開 LINE 的連結，理應從第一張開始看，而不是接續上一位賓客
 * （或上個月的自己）停在的地方。
 *
 * 為什麼需要持久化：iOS 記憶體吃緊時會把背景分頁整個丟掉，使用者切回來
 * 是一次完整的重新載入。存在記憶體裡的頁碼會跟著沒了。
 */
const STORAGE_KEY = 'wedding:album-page';

/**
 * 把跨頁模式的半張（-L / -R）還原成原本那張的檔名。
 *
 * 兩種模式的頁序長度不同（跨頁 78 頁、單頁 57 頁），所以索引不能直接沿用。
 * 但每一張的「原始檔名」在兩邊都找得到，用它當共同的識別碼就能對位 ——
 * 手機轉成橫式時，看到的仍然是同一張照片。
 */
const baseName = (file) => file.replace(/-[LR]\.jpg$/, '.jpg');

/** sessionStorage 在無痕模式或某些 WebView 裡存取會直接丟例外，一律包起來 */
function readStoredPage() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function writeStoredPage(file) {
  try {
    if (file) sessionStorage.setItem(STORAGE_KEY, file);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 存不了就算了，頁碼記憶只是體驗加分，不該讓整個相簿掛掉
  }
}

/**
 * 建立婚紗照翻頁書。
 *
 * 兩種模式用不同的頁序：
 *   桌機跨頁 — 橫幅照片切成左右半橫跨一個跨頁，攤開來是一張完整大圖
 *   手機單頁 — 橫幅維持完整一張。單頁模式下若用切半的圖，
 *              使用者會看到兩張各自殘缺的半張照片。
 *
 * @param {HTMLElement} container
 * @param {(current:number, total:number) => void} [onPageChange]
 * @returns {{destroy:() => void, prev:() => void, next:() => void}}
 */
export function createAlbumFlipbook(container, onPageChange = () => {}) {
  const base = import.meta.env.BASE_URL;
  const media = window.matchMedia(SPREAD_QUERY);

  let flip = null;
  /**
   * 真正交給 page-flip 的元素，每次 build 都重新建一個。
   *
   * ⚠️ 不能把 container（#album-book）直接交給 page-flip —— 它的
   * destroy() 是 `this.ui.destroy(), this.block.remove()`，會把你傳進去的
   * 那個元素整個從 DOM 移除。手機一轉成橫式就會跨過斷點觸發重建，
   * 於是 #album-book 連同相簿一起消失，之後每次 build() 都是在一個
   * 脫離文件的元素上跑，轉回直式也救不回來（賓客回報的正是這個）。
   * 給它一個用完即丟的內層元素，#album-book 就永遠留在文件裡。
   */
  let stage = null;
  let pageEls = [];
  let resizeObserver = null;
  let resizeRaf = 0;
  /** 目前這一頁的原始檔名。整個「記住看到哪」就是靠這一個值。 */
  let currentFile = readStoredPage();
  let currentPages = [];
  /**
   * 還原位置時 turnToPage 會「非同步」補送一次 flip 事件，那一次要忽略。
   *
   * 不忽略的話會把記憶值往回帶一格：跨頁模式下 39 個跨頁有 18 個是兩張
   * 不同的照片並排，turnToPage 會停在跨頁的左頁，於是「使用者原本在右邊
   * 那張」就被覆寫成左邊那張。程式自己跳的頁本來就不該當成使用者翻頁。
   */
  let ignoreNextFlip = false;

  function preload(center) {
    const from = Math.max(0, center - PRELOAD_RANGE);
    const to = Math.min(pageEls.length - 1, center + PRELOAD_RANGE);
    for (let i = from; i <= to; i++) {
      const img = pageEls[i].querySelector('img');
      if (img && !img.src && img.dataset.src) img.src = img.dataset.src;
    }
  }

  /** 把目前停在第幾頁記下來（同時寫進 sessionStorage） */
  function remember(index) {
    const page = currentPages[index];
    currentFile = page ? baseName(page.f) : null;
    writeStoredPage(currentFile);
  }

  function build() {
    const spread = media.matches;
    const pages = spread ? albumSpread : albumSingle;
    currentPages = pages;

    // 還原上次看到的那一張。找不到（例如相簿換過照片、或第一次進來）
    // 就從頭開始。
    const startIndex = currentFile
      ? Math.max(0, pages.findIndex((p) => baseName(p.f) === currentFile))
      : 0;

    // 圖片網址放 data-src，只載目前附近的頁面 ——
    // 全部一次載是十幾 MB，手機上會等很久
    stage = document.createElement('div');
    stage.className = 'album-stage';
    stage.innerHTML = pages
      .map((p, i) => {
        // 跨頁的左右半：頁面比例與半張圖不完全相同，object-fit: cover
        // 一定會裁掉一些寬度。預設是左右均分裁切，那會吃掉接縫兩側的內容，
        // 攤開時中間就少一塊、圖接不起來。
        // 把對齊點推到「外緣」，裁切就只發生在書的外側，接縫保持完整。
        const seam = p.f.endsWith('-L.jpg')
          ? ' album-page__img--seam-left'
          : p.f.endsWith('-R.jpg')
            ? ' album-page__img--seam-right'
            : '';
        return `
        <div class="album-page">
          <img
            class="album-page__img album-page__img--${p.fit}${seam}"
            data-src="${base}photos/album/${p.f}"
            alt="婚紗照 ${i + 1}"
          />
        </div>`;
      })
      .join('');
    container.replaceChildren(stage);
    pageEls = [...stage.querySelectorAll('.album-page')];
    preload(startIndex);

    flip = new PageFlip(stage, {
      width: 420,
      height: 590,
      size: 'stretch',
      minWidth: 200,
      maxWidth: 1000,
      minHeight: 280,
      maxHeight: 1400,
      // 書縫陰影刻意壓很低。橫幅照片是切成兩半橫跨跨頁的，
      // 陰影一重就會在照片中央變成一道明暗斷層 ——
      // 單獨的頁面看不出來，但一張圖被切開時非常明顯。
      maxShadowOpacity: 0.08,
      showCover: false,
      mobileScrollSupport: true,
      usePortrait: !spread,
      drawShadow: true,
      flippingTime: 700,
    });
    flip.loadFromHTML(pageEls);
    if (startIndex > 0) {
      ignoreNextFlip = true;
      flip.turnToPage(startIndex);
    }
    flip.on('flip', handleFlip);
    // 兜底：萬一哪個版本的 page-flip 根本不送那次事件，旗標會一直留著，
    // 反而吞掉使用者真正的第一次翻頁。相簿剛出現的頭幾百毫秒內不會有人
    // 翻頁，這個時間窗是安全的。
    if (ignoreNextFlip) setTimeout(() => (ignoreNextFlip = false), 400);

    // 觀察外層而非 stage：stage 是 page-flip 自己會改尺寸的元素，
    // 觀察它會變成「改尺寸 → update → 又改尺寸」的回饋迴圈，畫面會抖
    const host = container.parentElement ?? container;
    let lastW = 0;
    let lastH = 0;
    resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const w = Math.round(width);
      const h = Math.round(height);
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => flip?.update());
    });
    resizeObserver.observe(host);

    // 跨頁模式下 turnToPage(3) 會停在 2|3 那個跨頁，所以要問實際落點，
    // 不能直接用 startIndex
    onPageChange(flip.getCurrentPageIndex() + 1, flip.getPageCount());
  }

  function handleFlip(e) {
    const current = typeof e?.data === 'number' ? e.data : flip.getCurrentPageIndex();
    preload(current);
    if (ignoreNextFlip) ignoreNextFlip = false;
    else remember(current);
    onPageChange(current + 1, flip.getPageCount());
  }

  function teardown() {
    ignoreNextFlip = false;
    cancelAnimationFrame(resizeRaf);
    resizeObserver?.disconnect();
    resizeObserver = null;
    flip?.off('flip', handleFlip);
    // destroy() 會把 stage 從 DOM 移除，那正是我們要的 —— 它是拋棄式的。
    flip?.destroy();
    flip = null;
    stage = null;
    // 保險：萬一哪個版本的 page-flip 沒移除 stage，這裡收乾淨
    container.replaceChildren();
  }

  // 跨越斷點時整個重建 —— 兩種模式用的是不同的頁序，
  // page-flip 沒辦法在載入後替換頁面內容。
  //
  // 手機轉成橫式一定會跨過 700px（iPhone 直式約 390、橫式約 850），
  // 所以這條路徑比想像中常走。currentFile 讓重建之後還是停在同一張照片。
  const handleModeChange = () => {
    teardown();
    build();
  };
  media.addEventListener('change', handleModeChange);

  build();

  return {
    prev: () => flip?.flipPrev(),
    next: () => flip?.flipNext(),
    destroy() {
      media.removeEventListener('change', handleModeChange);
      teardown();
    },
  };
}
