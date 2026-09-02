// 倒數計時。資訊頁與表單頁的頁首共用。

/**
 * 倒數計時的 HTML。
 * @returns {string}
 */
export function countdownMarkup() {
  const unit = (key, label) =>
    `<div class="countdown__item"><span class="countdown__num" data-unit="${key}">--</span><span class="countdown__label">${label}</span></div>`;
  return `
    <div class="countdown" data-countdown>
      ${unit('day', 'DAYS')}${unit('hour', 'HOURS')}${unit('min', 'MIN')}${unit('sec', 'SEC')}
    </div>`;
}

function parts(target) {
  const diff = Math.max(0, target.getTime() - Date.now());
  return {
    day: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hour: Math.floor((diff / (1000 * 60 * 60)) % 24),
    min: Math.floor((diff / (1000 * 60)) % 60),
    sec: Math.floor((diff / 1000) % 60),
  };
}

/**
 * 啟動倒數計時。
 * @param {HTMLElement} root - 頁面容器
 * @param {Date} target
 * @returns {() => void} 停止用
 */
export function startCountdown(root, target) {
  const el = root.querySelector('[data-countdown]');
  if (!el) return () => {};

  const tick = () => {
    const { day, hour, min, sec } = parts(target);
    el.querySelector('[data-unit="day"]').textContent = day;
    el.querySelector('[data-unit="hour"]').textContent = String(hour).padStart(2, '0');
    el.querySelector('[data-unit="min"]').textContent = String(min).padStart(2, '0');
    el.querySelector('[data-unit="sec"]').textContent = String(sec).padStart(2, '0');
  };

  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}
