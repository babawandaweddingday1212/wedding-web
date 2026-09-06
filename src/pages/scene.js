import { loadImage } from '../utils/photoParticles.js';
import { weddingData } from '../data/weddingData.js';

/**
 * 渲染 3D 過場動畫頁（男方 / 女方）
 * @param {HTMLElement} root
 * @param {'groom'|'bride'} side
 * @param {(side:'groom'|'bride') => void} onFinish - 動畫結束（或使用者略過）後導向資訊頁
 * @returns {() => void} cleanup
 */
export function renderScene(root, side, onFinish) {
  const isGroom = side === 'groom';

  root.innerHTML = `
    <section class="page scene-page ${isGroom ? 'scene-page--groom' : 'scene-page--bride'}" id="scene-root">
      <div class="scene-overlay">
        <div class="scene-overlay__top">
          <button class="scene-skip" id="scene-skip" type="button">略過動畫 »</button>
        </div>
        <div class="scene-overlay__bottom">
          <span class="scene-caption is-visible" style="font-size:.75rem; opacity:.6;">
            ${isGroom ? 'GROOM SIDE // ENGINEER MODE' : 'BRIDE SIDE // PRINTING HOUSE'}
          </span>
        </div>
      </div>
      <div class="scene-progress"><div class="scene-progress__bar" id="scene-progress-bar"></div></div>
      <div class="scene-loading" id="scene-loading" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:${
        isGroom ? '#39ff88' : '#8a3b46'
      }; font-family:${isGroom ? "'Share Tech Mono', monospace" : "'Noto Serif TC', serif"}; letter-spacing:.15em; font-size:.9rem; z-index:6; background:${
        isGroom ? '#000' : '#f4efe4'
      };">${isGroom ? 'LOADING...' : '準備中...'}</div>
    </section>
  `;

  // 開啟「減少動態效果」的人不該被塞一段 4.6 秒的全螢幕運鏡 + 粒子。
  // 但也不是整段拿掉 —— 那樣他們會完全看不到這張合照。做法是直接跳到
  // 最後一格：畫面該有的東西都在，只是沒有過程。
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sceneRoot = root.querySelector('#scene-root');
  const skipBtn = root.querySelector('#scene-skip');
  const progressBar = root.querySelector('#scene-progress-bar');

  // 進度條用 scaleX 而不是 width：width 每一幀都會觸發 layout → paint，
  // 而這個值是跟著動畫每一幀更新的，等於在 WebGL 每幀渲染旁邊再加一輪
  // 版面計算。transform 只走合成，完全不碰版面。
  const handleProgress = (pct) => {
    progressBar.style.transform = `scaleX(${pct / 100})`;
  };

  let finished = false;
  const handleReady = () => {
    if (finished) return;
    // 播完就換頁，中間不停留。動畫的最後一格本來就是資訊頁的前情提要，
    // 停在那裡只會讓人以為卡住或又要再播一次。
    // 減少動態效果的人是直接跳到最後一格的，給半秒讓那張畫面看得到。
    autoAdvanceTimeout = setTimeout(() => finish(), prefersReducedMotion ? 500 : 0);
  };

  let autoAdvanceTimeout = null;
  let fadeOutTimeout = null;
  let controller = null;
  let cancelled = false;

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(autoAdvanceTimeout);

    // 換頁前先把整個場景淡掉。男方那段是全黑背景，資訊頁是米色，
    // 直接抽掉會閃一格黑 → 米色。這裡等淡出跑完再導頁。
    // 減少動態效果時不做淡出，直接換。
    if (prefersReducedMotion) return onFinish(side);
    sceneRoot.classList.add('is-leaving');
    fadeOutTimeout = setTimeout(() => onFinish(side), 260);
  }

  const handleSkip = () => finish();
  skipBtn.addEventListener('click', handleSkip);

  const loaderEl = root.querySelector('#scene-loading');
  const loadScene = isGroom
    ? import('../scenes/groomScene.js').then((m) => m.createGroomScene)
    : import('../scenes/brideScene.js').then((m) => m.createBrideScene);

  // 合照必須在建立粒子與卡片貼圖「之前」就緒，所以和場景模組一起等。
  // 載入失敗時以 null 繼續：動畫照常演出，只是少了照片，不會整頁卡住。
  const loadPhoto = loadImage(weddingData.couplePortrait).catch((err) => {
    console.warn(err);
    return null;
  });

  Promise.all([loadScene, loadPhoto]).then(([createScene, photo]) => {
    if (cancelled) return;
    loaderEl.remove();
    controller = createScene(sceneRoot, {
      onProgress: handleProgress,
      onReady: handleReady,
      photo,
    });
    if (prefersReducedMotion) {
      controller.skipToEnd();
      handleProgress(100);
      handleReady();
    }
  });

  return () => {
    cancelled = true;
    finished = true;
    clearTimeout(autoAdvanceTimeout);
    clearTimeout(fadeOutTimeout);
    skipBtn.removeEventListener('click', handleSkip);
    if (controller) controller.dispose();
  };
}
