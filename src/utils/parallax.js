// 視差滾動：背景層以比捲動更慢的速度位移，產生景深感。
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
 * 啟用視差。
 *
 * 掃描 root 底下所有 [data-parallax] 容器，位移其中的
 * [data-parallax-layer]。速度可用 data-parallax="0.4" 個別指定。
 *
 * @param {HTMLElement} root
 * @returns {{destroy:() => void}}
 */
export function createParallax(root) {
  const noop = { destroy() {} };

  // 開了「減少動態效果」就完全不做，背景維持靜止
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return noop;

  const items = [...root.querySelectorAll('[data-parallax]')]
    .map((el) => {
      const layer = el.querySelector('[data-parallax-layer]');
      if (!layer) return null;
      const intensity = Number(el.dataset.parallax) || DEFAULT_INTENSITY;
      return { el, layer, intensity };
    })
    .filter(Boolean);

  if (!items.length) return noop;

  let rafId = null;

  function update() {
    rafId = null;
    const vh = window.innerHeight;

    for (const { el, layer, intensity } of items) {
      const rect = el.getBoundingClientRect();
      // 離畫面還很遠就不算，省下 layout 與繪製
      if (rect.bottom < -200 || rect.top > vh + 200) continue;

      // 元素通過視窗的進度：
      //   -1 = 剛從下方進場，0 = 位於視窗正中，+1 = 剛從上方離場
      const travel = (vh + rect.height) / 2;
      const progress = Math.max(-1, Math.min(1, (rect.top + rect.height / 2 - vh / 2) / travel));

      // 背景層比容器高，多出來的部分就是可位移的餘裕。
      // 直接把進度映射到餘裕上，元素走完整個視窗時剛好用滿 ——
      // 這樣位移永遠不會被夾住（夾住的瞬間畫面會「停住」，很明顯）。
      const room = Math.max(0, (layer.offsetHeight - rect.height) / 2);
      const shift = -progress * room * intensity;

      layer.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
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
      for (const { layer } of items) layer.style.transform = '';
    },
  };
}
