// 視差滾動。三種模式，共用同一個 rAF 迴圈：
//
//   [data-parallax] > [data-parallax-layer]
//       窗格內平移背景。用在頁首那種滿版照片，位移量取決於
//       照片超出窗格的餘裕。
//
//   [data-parallax-drift="0.05"]
//       元素本身微幅上下飄移。交錯照片群組用這個 —— 每格給不同的
//       係數，滾動時彼此就會拉開一點點距離，這是「細微差別」的來源，
//       而不是整片背景大幅滑動。
//
//   [data-parallax-wash="0.02"]
//       整頁襯底。position:fixed 的極淡照片，跟著捲動非常緩慢地下沉。
//
// 刻意不用 background-attachment: fixed —— 那是最短的寫法，
// 但 iOS Safari 對它的支援是壞的（會整片不動或嚴重卡頓），
// Android 上也常有掉幀。改用 transform 位移，各平台行為一致。

/**
 * 強度：0~1，表示要用掉多少「可位移餘裕」。
 * 1 = 元素通過視窗的過程中，背景層剛好走完全部餘裕（效果最明顯）。
 */
const DEFAULT_INTENSITY = 1;

/**
 * [data-parallax-fade] 的浮出區間，單位是「頁首高度」的倍數。
 *
 * 基準刻意用頁首而不是視窗高度：表單頁的頁首只有資訊頁的六成高，
 * 用視窗高度換算的話，短頁面捲到底花紋都還沒浮出來。
 */
const FADE_FROM = 0.35;
const FADE_TO = 1.15;

/**
 * 元素通過視窗的進度。
 * +1 = 剛從下方進場，0 = 位於視窗正中，-1 = 剛從上方離場。
 */
function progressOf(rect, vh) {
  const travel = (vh + rect.height) / 2;
  return Math.max(-1, Math.min(1, (rect.top + rect.height / 2 - vh / 2) / travel));
}

/**
 * 啟用視差。
 *
 * @param {HTMLElement} root
 * @returns {{destroy:() => void}}
 */
export function createParallax(root) {
  const noop = { destroy() {} };

  // 開了「減少動態效果」就完全不做，畫面維持靜止
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return noop;

  const panes = [...root.querySelectorAll('[data-parallax]')]
    .map((el) => {
      const layer = el.querySelector('[data-parallax-layer]');
      if (!layer) return null;
      return { el, layer, intensity: Number(el.dataset.parallax) || DEFAULT_INTENSITY };
    })
    .filter(Boolean);

  const drifters = [...root.querySelectorAll('[data-parallax-drift]')].map((el) => ({
    el,
    amount: Number(el.dataset.parallaxDrift) || 0,
  }));

  const washes = [...root.querySelectorAll('[data-parallax-wash]')].map((el) => ({
    el,
    factor: Number(el.dataset.parallaxWash) || 0,
    layers: [...el.children],
  }));

  const fades = [...root.querySelectorAll('[data-parallax-fade]')].map((el) => ({
    el,
    max: Number(el.dataset.parallaxFade) || 1,
  }));

  const slows = [...root.querySelectorAll('[data-parallax-slow]')].map((el) => ({
    el,
    factor: Number(el.dataset.parallaxSlow) || 0,
  }));

  if (!panes.length && !drifters.length && !washes.length && !fades.length && !slows.length) {
    return noop;
  }

  let rafId = null;

  function update() {
    rafId = null;
    const vh = window.innerHeight;

    // --- 窗格內平移背景 ---
    for (const { el, layer, intensity } of panes) {
      const rect = el.getBoundingClientRect();
      // 離畫面還很遠就不算，省下 layout 與繪製
      if (rect.bottom < -200 || rect.top > vh + 200) continue;

      // 背景層上下多出來的部分就是可位移的餘裕，而且允許不對稱 ——
      // 這批照片人臉都在上半部，上方餘裕必須留小（否則窗格一開始就
      // 落在人臉下方），下方則可以留大來換取位移距離。
      const roomDown = Math.max(0, -layer.offsetTop);
      const roomUp = Math.max(0, layer.offsetHeight + layer.offsetTop - rect.height);

      const progress = progressOf(rect, vh);
      const shift = -progress * (progress < 0 ? roomDown : roomUp) * intensity;
      layer.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
    }

    // --- 元素本身微幅飄移 ---
    for (const { el, amount } of drifters) {
      const rect = el.getBoundingClientRect();
      // height 為 0 表示被 display:none 收起來了（窄螢幕會收掉第三張）。
      // 不擋的話 rect 全是 0，會被算成「剛離場」而寫入一個假的位移。
      if (!rect.height || rect.bottom < -200 || rect.top > vh + 200) continue;

      // 係數大的走得比頁面快一點（像在前景），小的慢一點（像在遠處）。
      // 幅度用視窗高度換算，換裝置時比例才一致。
      const shift = progressOf(rect, vh) * amount * vh;
      el.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
    }

    // --- 整頁襯底 ---
    const scrolled = window.scrollY || window.pageYOffset || 0;
    const scrollable = Math.max(1, document.documentElement.scrollHeight - vh);
    // 整頁進度 0~1，用來決定現在該是哪個色調
    const pageProgress = Math.max(0, Math.min(1, scrolled / scrollable));

    for (const { el, factor, layers } of washes) {
      // fixed 元素沒有「通過視窗」的概念，直接跟捲動距離走，
      // 並夾在自身超出視窗的餘裕內，免得捲到底時露出邊緣。
      const room = Math.max(0, (el.offsetHeight - vh) / 2);
      el.style.transform = `translate3d(0, ${(-Math.min(scrolled * factor, room)).toFixed(1)}px, 0)`;

      // 交叉淡入：把 0~1 平均切成 n 段，每層在自己的位置最濃，
      // 往兩邊線性退到 0。相鄰兩層的濃度隨時加總為 1，
      // 所以整體亮度是連續的，不會在交界處忽明忽暗。
      const last = layers.length - 1;
      if (last < 1) continue;
      for (let i = 0; i <= last; i += 1) {
        const weight = Math.max(0, 1 - Math.abs(pageProgress - i / last) * last);
        layers[i].style.opacity = weight.toFixed(3);
      }
    }

    // --- 捲離頁首才浮出 ---
    // 頁首是大照片，上面再疊花紋會太吵。
    // 基準取頁首本身的高度（第一個視差窗格就是頁首），
    // 兩頁的頁首高度差很多，用視窗高度換算會讓矮的那頁浮不出來。
    const heroH = panes[0]?.el.offsetHeight || vh;
    const t = Math.max(0, Math.min(1, (scrolled / heroH - FADE_FROM) / (FADE_TO - FADE_FROM)));
    for (const { el, max } of fades) el.style.opacity = (max * t).toFixed(3);

    // --- 以頁面的幾分之幾速度移動 ---
    // 元素是 position:fixed，本來完全不動（等於速度 0）。
    // 往上推 scrolled × factor，看起來就是以 factor 倍的速度跟著捲。
    // 夾在自身超出視窗的高度內，捲到底才不會露出下緣。
    for (const { el, factor } of slows) {
      const room = Math.max(0, el.offsetHeight - vh);
      el.style.transform = `translate3d(0, ${(-Math.min(scrolled * factor, room)).toFixed(1)}px, 0)`;
    }
  }

  // 捲動事件觸發得非常密集，用 rAF 收斂成每幀最多算一次
  function schedule() {
    if (rafId === null) rafId = requestAnimationFrame(update);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();

  return {
    destroy() {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (rafId !== null) cancelAnimationFrame(rafId);
      for (const { layer } of panes) layer.style.transform = '';
      for (const { el } of drifters) el.style.transform = '';
      for (const { el, layers } of washes) {
        el.style.transform = '';
        for (const layer of layers) layer.style.opacity = '';
      }
      for (const { el } of fades) el.style.opacity = '';
      for (const { el } of slows) el.style.transform = '';
    },
  };
}
