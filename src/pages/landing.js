import { weddingData } from '../data/weddingData.js';

/**
 * 渲染首頁（Landing Page）
 * @param {HTMLElement} root - 掛載節點
 * @param {(side: 'groom' | 'bride') => void} onSelect - 選擇賓客身份後的回呼
 * @returns {() => void} cleanup 函式
 */
export function renderLanding(root, onSelect) {
  root.innerHTML = `
    <section class="page landing">
      <p class="landing__ornament">WEDDING INVITATION</p>
      <h1 class="landing__names">
        ${weddingData.groomName}<span class="heart">♥</span>${weddingData.brideName}
      </h1>
      <p class="landing__subtitle">${weddingData.subtitle}</p>
      <p class="landing__date">${weddingData.dateDisplay}</p>

      <p class="landing__prompt">請選擇您的賓客身份，即刻進入專屬邀請</p>
      <div class="landing__buttons">
        <button class="side-btn side-btn--groom" data-side="groom" type="button">
          男方賓客
          <small>GROOM'S GUEST</small>
        </button>
        <button class="side-btn side-btn--bride" data-side="bride" type="button">
          女方賓客
          <small>BRIDE'S GUEST</small>
        </button>
      </div>
    </section>
  `;

  const buttons = root.querySelectorAll('[data-side]');
  const handleClick = (e) => {
    const side = e.currentTarget.getAttribute('data-side');
    onSelect(side);
  };
  buttons.forEach((btn) => btn.addEventListener('click', handleClick));

  return () => {
    buttons.forEach((btn) => btn.removeEventListener('click', handleClick));
  };
}
