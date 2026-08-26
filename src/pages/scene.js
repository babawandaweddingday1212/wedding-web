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
          <span class="scene-caption" id="scene-caption"></span>
          <button class="scene-skip" id="scene-skip" type="button">略過動畫 »</button>
        </div>
        <div class="scene-overlay__bottom">
          <span class="scene-caption is-visible" style="font-size:.75rem; opacity:.6;">
            ${isGroom ? 'GROOM SIDE // ENGINEER MODE' : 'BRIDE SIDE // PRINTING HOUSE'}
          </span>
        </div>
      </div>
      <button class="scene-continue" id="scene-continue" type="button">進入婚禮資訊 →</button>
      <div class="scene-progress"><div class="scene-progress__bar" id="scene-progress-bar"></div></div>
      <div class="scene-loading" id="scene-loading" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:${
        isGroom ? '#39ff88' : '#8a3b46'
      }; font-family:${isGroom ? "'Share Tech Mono', monospace" : "'Noto Serif TC', serif"}; letter-spacing:.15em; font-size:.9rem; z-index:6; background:${
        isGroom ? '#000' : '#f4efe4'
      };">${isGroom ? 'LOADING...' : '準備中...'}</div>
    </section>
  `;

  const sceneRoot = root.querySelector('#scene-root');
  const captionEl = root.querySelector('#scene-caption');
  const skipBtn = root.querySelector('#scene-skip');
  const continueBtn = root.querySelector('#scene-continue');
  const progressBar = root.querySelector('#scene-progress-bar');

  let captionTimeout = null;
  const handleCaption = (text) => {
    captionEl.classList.remove('is-visible');
    clearTimeout(captionTimeout);
    captionTimeout = setTimeout(() => {
      captionEl.textContent = text;
      captionEl.classList.add('is-visible');
    }, 180);
  };

  const handleProgress = (pct) => {
    progressBar.style.width = `${pct}%`;
  };

  let finished = false;
  const handleReady = () => {
    if (finished) return;
    continueBtn.classList.add('is-visible');
    // 動畫播完後，短暫停留讓使用者欣賞畫面，接著自動導向資訊頁
    autoAdvanceTimeout = setTimeout(() => finish(), 2400);
  };

  let autoAdvanceTimeout = null;
  let controller = null;
  let cancelled = false;

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(autoAdvanceTimeout);
    onFinish(side);
  }

  const handleSkip = () => finish();
  const handleContinue = () => finish();

  skipBtn.addEventListener('click', handleSkip);
  continueBtn.addEventListener('click', handleContinue);

  const loaderEl = root.querySelector('#scene-loading');
  const loadScene = isGroom
    ? import('../scenes/groomScene.js').then((m) => m.createGroomScene)
    : import('../scenes/brideScene.js').then((m) => m.createBrideScene);

  // 合照必須在建立粒子與卡片貼圖「之前」就緒，所以和場景模組一起等。
  // 載入失敗時以 null 繼續：動畫照常演出，只是少了照片，不會整頁卡住。
  const loadPhoto = loadImage(weddingData.couplePhoto).catch((err) => {
    console.warn(err);
    return null;
  });

  Promise.all([loadScene, loadPhoto]).then(([createScene, photo]) => {
    if (cancelled) return;
    loaderEl.remove();
    controller = createScene(sceneRoot, {
      onCaption: handleCaption,
      onProgress: handleProgress,
      onReady: handleReady,
      photo,
    });
  });

  return () => {
    cancelled = true;
    finished = true;
    clearTimeout(captionTimeout);
    clearTimeout(autoAdvanceTimeout);
    skipBtn.removeEventListener('click', handleSkip);
    continueBtn.removeEventListener('click', handleContinue);
    if (controller) controller.dispose();
  };
}
