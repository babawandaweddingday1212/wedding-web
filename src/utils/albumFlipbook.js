import { PageFlip } from 'page-flip/dist/js/page-flip.module.js';
import 'page-flip/src/Style/stPageFlip.css';
import { albumSpread, albumSingle } from '../data/albumPages.js';

/** 目前頁面前後各預載幾頁 */
const PRELOAD_RANGE = 4;

/** 大於這個寬度才用跨頁模式；以下改單頁 */
const SPREAD_QUERY = '(min-width: 700px)';

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
  let pageEls = [];
  let resizeObserver = null;
  let resizeRaf = 0;

  function preload(center) {
    const from = Math.max(0, center - PRELOAD_RANGE);
    const to = Math.min(pageEls.length - 1, center + PRELOAD_RANGE);
    for (let i = from; i <= to; i++) {
      const img = pageEls[i].querySelector('img');
      if (img && !img.src && img.dataset.src) img.src = img.dataset.src;
    }
  }

  function build() {
    const spread = media.matches;
    const pages = spread ? albumSpread : albumSingle;

    // 圖片網址放 data-src，只載目前附近的頁面 ——
    // 全部一次載是十幾 MB，手機上會等很久
    container.innerHTML = pages
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
    pageEls = [...container.querySelectorAll('.album-page')];
    preload(0);

    flip = new PageFlip(container, {
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
    flip.on('flip', handleFlip);

    // 觀察外層而非 container：container 是 page-flip 自己會改尺寸的元素，
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

    onPageChange(1, flip.getPageCount());
  }

  function handleFlip(e) {
    const current = typeof e?.data === 'number' ? e.data : flip.getCurrentPageIndex();
    preload(current);
    onPageChange(current + 1, flip.getPageCount());
  }

  function teardown() {
    cancelAnimationFrame(resizeRaf);
    resizeObserver?.disconnect();
    resizeObserver = null;
    flip?.off('flip', handleFlip);
    flip?.destroy();
    flip = null;
    container.innerHTML = '';
  }

  // 跨越斷點時整個重建 —— 兩種模式用的是不同的頁序，
  // page-flip 沒辦法在載入後替換頁面內容
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
