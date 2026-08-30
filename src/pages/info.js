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

/**
 * 渲染婚禮資訊頁
 * @param {HTMLElement} root
 * @param {'groom'|'bride'|null} side
 * @param {() => void} onGoRsvp - 前往出席回覆表單頁
 * @returns {() => void} cleanup
 */
export function renderInfo(root, side, onGoRsvp) {
  const target = new Date(weddingData.dateISO);

  root.innerHTML = `
    <section class="page info">
      <header class="info__hero">
        <p class="landing__ornament" style="font-size:1rem; margin-bottom:.8rem;">YOU'RE INVITED</p>
        <h1 class="info__hero-title">${weddingData.eventName}</h1>
        <div class="countdown" id="countdown">
          <div class="countdown__item"><span class="countdown__num" data-unit="day">--</span><span class="countdown__label">DAYS</span></div>
          <div class="countdown__item"><span class="countdown__num" data-unit="hour">--</span><span class="countdown__label">HOURS</span></div>
          <div class="countdown__item"><span class="countdown__num" data-unit="min">--</span><span class="countdown__label">MIN</span></div>
          <div class="countdown__item"><span class="countdown__num" data-unit="sec">--</span><span class="countdown__label">SEC</span></div>
        </div>
        <p class="info__welcome">${weddingData.welcomeMessage}</p>
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
        <h2 class="section-title">交通資訊</h2>
        <p class="transport__intro">${weddingData.transport.intro}</p>

        <h3 class="transport__head">🚗 停車資訊</h3>
        <ol class="transport__lots">
          ${weddingData.transport.parking.lots
            .map(
              (lot) => `
            <li>
              <span class="transport__lot-name">${lot.name}</span>
              <span class="transport__lot-addr">${lot.addr}</span>
              ${lot.discount ? `<span class="transport__badge">${weddingData.transport.parking.note}</span>` : ''}
            </li>
          `
            )
            .join('')}
        </ol>

        <h3 class="transport__head">🚇 捷運</h3>
        <ul class="transport__list">
          ${weddingData.transport.mrt.map((t) => `<li>${t}</li>`).join('')}
        </ul>

        <h3 class="transport__head">🚌 公車</h3>
        <ul class="transport__list">
          <li>${weddingData.transport.bus}</li>
        </ul>

        ${
          weddingData.transport.mapImage
            ? `<img class="transport__map" src="${weddingData.transport.mapImage}" alt="交通位置示意圖" loading="lazy" />`
            : ''
        }
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
        <h2 class="section-title">婚紗照相簿</h2>
        <div class="album">
          <div class="album__book" id="album-book"></div>
        </div>
        <div class="album__controls">
          <button class="album__nav" id="album-prev" type="button" aria-label="上一頁">‹</button>
          <span class="album__counter" id="album-counter">– / –</span>
          <button class="album__nav" id="album-next" type="button" aria-label="下一頁">›</button>
        </div>
      </section>

      <section class="info__section">
        <h2 class="section-title">立即回覆出席</h2>
        <p class="info__cta-text">
          為了提供您美好的饗宴，請於 <b>${weddingData.rsvpDeadline}</b> 前撥空完成表單。<br />
          若需要紙本喜帖，歡迎您在表單裡留下寄送地址，期待我們精美的喜帖。
        </p>
        <button class="form-submit" id="go-rsvp" type="button">前往填寫回覆表單 →</button>
      </section>

      <footer class="info__footer">
        ${weddingData.title} · ${weddingData.dateDisplay}
      </footer>
    </section>

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

  // --- 婚紗照翻頁書 ---
  // 用動態 import 拆成獨立 chunk：page-flip 有 44KB，
  // 沒看到相簿的訪客不必為它付出載入成本。
  const bookEl = root.querySelector('#album-book');
  const counterEl = root.querySelector('#album-counter');
  const prevBtn = root.querySelector('#album-prev');
  const nextBtn = root.querySelector('#album-next');
  let flipbook = null;
  let cancelled = false;

  const handlePrev = () => flipbook?.prev();
  const handleNext = () => flipbook?.next();
  prevBtn.addEventListener('click', handlePrev);
  nextBtn.addEventListener('click', handleNext);

  import('../utils/albumFlipbook.js').then(({ createAlbumFlipbook }) => {
    if (cancelled) return;
    flipbook = createAlbumFlipbook(bookEl, (current, total) => {
      counterEl.textContent = `${current} / ${total}`;
    });
  });

  // --- 前往 RSVP 表單頁 ---
  // 表單本身已獨立成 src/pages/rsvp.js，這裡只負責導頁
  const goRsvpBtn = root.querySelector('#go-rsvp');
  const handleGoRsvp = () => onGoRsvp();
  goRsvpBtn.addEventListener('click', handleGoRsvp);

  return () => {
    cancelled = true;
    clearInterval(intervalId);
    prevBtn.removeEventListener('click', handlePrev);
    nextBtn.removeEventListener('click', handleNext);
    flipbook?.destroy();
    goRsvpBtn.removeEventListener('click', handleGoRsvp);
  };
}
