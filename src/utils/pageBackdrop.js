// 頁面襯底：色調層 + 花紋層。資訊頁與表單頁共用。
//
// 兩層都必須放在 .page 外面 —— .page 的淡入動畫是 forwards，
// 結束後仍套著 transform，裡面的 position:fixed 會改以 .page 為基準，
// 襯底就跟著頁面捲走、完全失去效果。

const asset = (path) => `${import.meta.env.BASE_URL}${path}`;

// 色調層的三張照片，由上而下依序淡入淡出（見 utils/parallax.js）。
// 挑的標準是「糊掉之後的色溫要明顯不同」而不是照片本身好不好看 ——
// 這幾張會被糊成一片色塊，看的是米白 → 磚紅 → 暖褐的走向。
//
// 用的是 photos/wash/ 裡 240px 寬的縮圖。這三張在頁面一開啟就會下載，
// 卻要吃 blur(26px) 再壓到 13% 濃度 —— 放原尺寸等於首屏先扛半 MB 換一
// 片看不出細節的色塊。縮到 240px 後總共只剩 29KB，糊完的結果肉眼分不出來。
const WASH_PHOTOS = ['photos/wash/huashan.jpg', 'photos/wash/studio-red.jpg', 'photos/wash/tunnel.jpg'];

/**
 * 產生襯底的 HTML。要放在 <section class="page"> 之前。
 * @returns {string}
 */
export function backdropMarkup() {
  return `
    <!-- 色調層：三張色調不同的照片交叉淡入，捲到哪一段背景就是哪個色調。
         單張圖只做平移是不夠的 —— 糊到那個程度之後，平移一兩百像素
         肉眼根本看不出來，整頁背景會像完全沒變。換底才看得出來。
         wash 係數給 0：只換色調，完全不位移。背景要是自己會滑，
         就變成「背景跟著捲」而不是「背景在變」了。 -->
    <div class="page-wash" data-parallax-wash="0" aria-hidden="true">
      ${WASH_PHOTOS.map(
        (file) => `<div class="page-wash__layer" style="background-image:url('${asset(file)}')"></div>`
      ).join('')}
    </div>

    <!-- 花紋層：整片鋪滿。
         data-parallax-fade 是它的最濃值 —— 首屏是 0，捲離頁首才浮出。
         data-parallax-slow 讓它以頁面 1/4 的速度跟著捲。 -->
    <div
      class="page-pattern"
      data-parallax-fade="0.13"
      data-parallax-slow="0.25"
      aria-hidden="true"
    ></div>
  `;
}
