import { weddingData } from '../data/weddingData.js';

function formatCountdownParts(targetDate) {
  const now = new Date();
  const diff = Math.max(0, targetDate.getTime() - now.getTime());
  const day = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hour = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const min = Math.floor((diff / (1000 * 60)) % 60);
  const sec = Math.floor((diff / 1000) % 60);
  return { day, hour, min, sec };
}

function photoPlaceholderSvg(color, caption, src) {
  // 若 weddingData.photos 該項目有填 src（例如 '/photos/wedding-01.jpg'），
  // 會自動改用真實照片；沒有的話則顯示彩色佔位圖，方便還沒有照片時先預覽版型。
  if (src) {
    return `
      <button class="gallery__item" type="button" style="background-image:url('${src}'); background-size:cover; background-position:center;" data-caption="${caption}" data-image="${src}">
        <span>${caption}</span>
      </button>
    `;
  }
  return `
    <div class="gallery__item" style="background: linear-gradient(160deg, ${color} 0%, #ffffffaa 140%);" data-caption="${caption}" data-color="${color}">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" style="position:absolute; top:14px; left:50%; transform:translateX(-50%); opacity:.55;">
        <path d="M12 21s-7.5-4.7-9.9-9.1C.6 8.6 2.1 5 5.6 4.5c2-.3 3.6.7 4.4 2.1.8-1.4 2.4-2.4 4.4-2.1 3.5.5 5 4.1 3.5 7.4C19.5 16.3 12 21 12 21z" stroke="#fff" stroke-width="1.4"/>
      </svg>
      <span>${caption}</span>
    </div>
  `;
}

/**
 * 渲染婚禮資訊頁
 * @param {HTMLElement} root
 * @param {'groom'|'bride'|null} side
 * @param {() => void} onGoRsvp - 前往出席回覆表單頁
 * @returns {() => void} cleanup
 */
export function renderInfo(root, side, onGoRsvp) {
  const target = new Date(weddingData.dateISO);
  const sideLabel = side === 'groom' ? '男方賓客' : side === 'bride' ? '女方賓客' : '賓客';

  root.innerHTML = `
    <section class="page info">
      <header class="info__hero">
        <p class="landing__ornament" style="font-size:1rem; margin-bottom:.8rem;">YOU'RE INVITED</p>
        <h1 class="info__hero-title">${weddingData.eventName}</h1>
        <p class="info__hero-sub">歡迎您，${sideLabel}｜${weddingData.dateDisplay}</p>
        <div class="countdown" id="countdown">
          <div class="countdown__item"><span class="countdown__num" data-unit="day">--</span><span class="countdown__label">DAYS</span></div>
          <div class="countdown__item"><span class="countdown__num" data-unit="hour">--</span><span class="countdown__label">HOURS</span></div>
          <div class="countdown__item"><span class="countdown__num" data-unit="min">--</span><span class="countdown__label">MIN</span></div>
          <div class="countdown__item"><span class="countdown__num" data-unit="sec">--</span><span class="countdown__label">SEC</span></div>
        </div>
        <div class="notice-banner">目前網站內容為「示範資料」，正式婚禮資訊確認後將會更新 ✨</div>
      </header>

      <section class="info__section">
        <h2 class="section-title">婚禮地點</h2>
        <div class="venue-card">
          <iframe
            class="venue-card__map"
            src="${weddingData.mapEmbedSrc}"
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"
            title="婚禮地點地圖"
          ></iframe>
          <div class="venue-card__body">
            <div class="venue-card__name">${weddingData.venueName}</div>
            <div class="venue-card__addr">${weddingData.address}</div>
            <a class="venue-card__link" href="${weddingData.mapLinkUrl}" target="_blank" rel="noopener">在 Google 地圖中開啟 →</a>
          </div>
        </div>
      </section>

      <section class="info__section">
        <h2 class="section-title">婚禮流程</h2>
        <ul class="schedule-list">
          ${weddingData.schedule
            .map(
              (s) => `
            <li>
              <span class="schedule-time">${s.time}</span>
              <span><span class="schedule-title">${s.title}</span><span class="schedule-desc">${s.desc}</span></span>
            </li>
          `
            )
            .join('')}
        </ul>
      </section>

      <section class="info__section">
        <h2 class="section-title">聯絡我們</h2>
        <ul class="contact-list">
          <li>${weddingData.contact.groomFamily}</li>
          <li>${weddingData.contact.brideFamily}</li>
        </ul>
      </section>

      <section class="info__section">
        <h2 class="section-title">婚紗照相簿</h2>
        <div class="gallery" id="gallery">
          ${weddingData.photos.map((p) => photoPlaceholderSvg(p.color, p.caption, p.src)).join('')}
        </div>
      </section>

      <section class="info__section">
        <h2 class="section-title">出席回覆 RSVP</h2>
        <p class="info__cta-text">
          為了讓我們準備座位與餐點，請撥空完成回覆。
          若需要紙本喜帖，也可以在表單裡留下寄送地址。
        </p>
        <button class="form-submit" id="go-rsvp" type="button">前往填寫回覆表單 →</button>
      </section>

      <footer class="info__footer">
        ${weddingData.title} · ${weddingData.dateDisplay}
      </footer>
    </section>

    <div class="lightbox" id="lightbox">
      <div class="lightbox__panel" id="lightbox-panel">
        <button class="lightbox__close" id="lightbox-close" type="button" aria-label="關閉">✕</button>
        <span id="lightbox-caption"></span>
      </div>
    </div>
  `;

  // --- 倒數計時 ---
  const countdownEl = root.querySelector('#countdown');
  const tick = () => {
    const { day, hour, min, sec } = formatCountdownParts(target);
    countdownEl.querySelector('[data-unit="day"]').textContent = day;
    countdownEl.querySelector('[data-unit="hour"]').textContent = String(hour).padStart(2, '0');
    countdownEl.querySelector('[data-unit="min"]').textContent = String(min).padStart(2, '0');
    countdownEl.querySelector('[data-unit="sec"]').textContent = String(sec).padStart(2, '0');
  };
  tick();
  const intervalId = setInterval(tick, 1000);

  // --- 相簿 Lightbox ---
  const gallery = root.querySelector('#gallery');
  const lightbox = root.querySelector('#lightbox');
  const lightboxPanel = root.querySelector('#lightbox-panel');
  const lightboxCaption = root.querySelector('#lightbox-caption');
  const lightboxClose = root.querySelector('#lightbox-close');

  const openLightbox = (e) => {
    const item = e.target.closest('.gallery__item');
    if (!item) return;
    const caption = item.getAttribute('data-caption');
    const image = item.getAttribute('data-image');
    const color = item.getAttribute('data-color');
    lightboxPanel.style.background = image
      ? `center / cover no-repeat url('${image}')`
      : `linear-gradient(160deg, ${color} 0%, #ffffffaa 140%)`;
    lightboxCaption.textContent = caption;
    lightbox.classList.add('is-open');
  };
  const closeLightbox = () => lightbox.classList.remove('is-open');

  gallery.addEventListener('click', openLightbox);
  lightboxClose.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  // --- 前往 RSVP 表單頁 ---
  // 表單本身已獨立成 src/pages/rsvp.js，這裡只負責導頁
  const goRsvpBtn = root.querySelector('#go-rsvp');
  const handleGoRsvp = () => onGoRsvp();
  goRsvpBtn.addEventListener('click', handleGoRsvp);

  return () => {
    clearInterval(intervalId);
    gallery.removeEventListener('click', openLightbox);
    lightboxClose.removeEventListener('click', closeLightbox);
    goRsvpBtn.removeEventListener('click', handleGoRsvp);
  };
}
