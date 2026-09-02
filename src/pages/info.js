import { weddingData } from '../data/weddingData.js';
import { createParallax } from '../utils/parallax.js';
import { backdropMarkup } from '../utils/pageBackdrop.js';
import { countdownMarkup, startCountdown } from '../utils/countdown.js';

const asset = (path) => `${import.meta.env.BASE_URL}${path}`;


// 交錯照片群組：三張直式照片並排，但各自往下錯開不同距離，
// 而且飄移係數都不一樣 —— 捲動時三張會慢慢拉開又靠攏，
// 這個「彼此有一點點速差」就是景深感的來源，比整片背景大幅
// 滑動含蓄得多，也不會把人臉裁掉。
//
// offset 單位是 rem，drift 是視窗高度的倍數（見 utils/parallax.js）。
const PHOTO_GROUPS = {
  tunnel: [
    { file: 'tunnel-03.jpg', offset: 0, drift: 0.075 },
    { file: 'tunnel-08.jpg', offset: 4, drift: 0.018 },
    { file: 'tunnel-12.jpg', offset: 1.6, drift: 0.048 },
  ],
  huashan: [
    { file: 'huashan-13.jpg', offset: 3.4, drift: 0.022 },
    { file: 'huashan-02.jpg', offset: 0, drift: 0.078 },
    { file: 'huashan-06.jpg', offset: 1.2, drift: 0.045 },
  ],
};

function renderPhotoGroup(name) {
  const items = PHOTO_GROUPS[name]
    .map(
      ({ file, offset, drift }) => `
        <figure class="stagger__item" style="--offset:${offset}rem" data-parallax-drift="${drift}">
          <img class="stagger__photo" src="${asset(`photos/album/${file}`)}" alt="" loading="lazy" decoding="async" />
        </figure>`
    )
    .join('');
  return `<section class="stagger stagger--${name}" aria-hidden="true">${items}</section>`;
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
    ${backdropMarkup()}

    <section class="page info">
      <header class="info__hero" data-parallax="0.7">
        <div class="hero-photo" data-parallax-layer aria-hidden="true"></div>
        <p class="landing__ornament" style="font-size:1rem; margin-bottom:.8rem;">YOU'RE INVITED</p>
        <h1 class="info__hero-title">${weddingData.eventName}</h1>
        ${countdownMarkup()}
        <p class="hero-welcome">${weddingData.welcomeMessage}</p>
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

      ${renderPhotoGroup('tunnel')}

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


      ${renderPhotoGroup('huashan')}

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
  const stopCountdown = startCountdown(root, target);

  // --- 視差滾動 ---
  const parallax = createParallax(root);

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
    stopCountdown();
    prevBtn.removeEventListener('click', handlePrev);
    nextBtn.removeEventListener('click', handleNext);
    flipbook?.destroy();
    parallax.destroy();
    goRsvpBtn.removeEventListener('click', handleGoRsvp);
  };
}
