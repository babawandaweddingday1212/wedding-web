/**
 * 數位雨與粒子文字共用的字元集。
 * 以二進位為主：'01' 刻意重複多次，隨機取用時畫面上大多會是 0 與 1，
 * 中間混一點程式碼符號當作工程師風格的點綴。
 * glyphAtlas.js 直接引用這份常數，兩邊的字母表才不會各自漂移。
 */
export const MATRIX_CHARS = ('01'.repeat(10) + '{}<>/\\=+;:love01git()λ$#').split('');

const CHARS = MATRIX_CHARS;

/**
 * 建立經典「駭客帝國」數位雨背景，畫在傳入的 2D canvas 上。
 * 回傳控制物件，可調整強度、暫停/恢復、以及銷毀。
 */
export function createMatrixRain(canvas, { fontSize = 18, color = '#39ff88' } = {}) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let columns = 0;
  let drops = [];
  let intensity = 1; // 0~1，控制透明度/亮度
  let speed = 1;
  let running = true;
  let rafId = null;
  let lastTime = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    columns = Math.ceil(width / fontSize);
    // 每一欄的起點散在「整個畫面高度」的範圍內，而不是全部從畫面上方
    // 很遠的地方開始掉。原本是 -50 列，以每幀約 0.75 列的速度要兩秒多
    // 才填滿畫面 —— 動畫全長只有 4.6 秒，開場那兩秒會是一片黑。
    const rows = height / fontSize;
    drops = new Array(columns).fill(0).map(() => Math.random() * (rows + 16) - 12);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
  }

  function frame(t) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    if (t - lastTime < 33) return; // ~30fps 足夠，省效能
    lastTime = t;

    ctx.fillStyle = `rgba(0, 8, 4, ${0.16 + (1 - intensity) * 0.1})`;
    ctx.fillRect(0, 0, width, height);

    ctx.font = `${fontSize}px 'Share Tech Mono', monospace`;
    for (let i = 0; i < columns; i++) {
      const char = CHARS[(Math.random() * CHARS.length) | 0];
      const x = i * fontSize;
      const y = drops[i] * fontSize;

      const isHead = Math.random() > 0.94;
      ctx.fillStyle = isHead ? 'rgba(210, 255, 230, 0.95)' : color;
      ctx.globalAlpha = 0.35 + intensity * 0.55;
      ctx.fillText(char, x, y);
      ctx.globalAlpha = 1;

      if (y > height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i] += speed * (0.5 + Math.random() * 0.5);
    }
  }

  resize();
  rafId = requestAnimationFrame(frame);
  window.addEventListener('resize', resize);

  return {
    setIntensity(v) {
      intensity = Math.max(0, Math.min(1, v));
    },
    setSpeed(v) {
      speed = v;
    },
    pause() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
    },
    resume() {
      if (!running) {
        running = true;
        rafId = requestAnimationFrame(frame);
      }
    },
    destroy() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    },
  };
}
