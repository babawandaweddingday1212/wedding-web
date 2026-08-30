import Swal from 'sweetalert2';
import { weddingData } from '../data/weddingData.js';

/**
 * 把回覆送到 Google Apps Script 的 Web App。
 *
 * ⚠️ Content-Type 一定要是 text/plain，不能用 application/json。
 * Apps Script 沒有實作 OPTIONS，而 application/json 會讓瀏覽器
 * 先送一個 CORS 預檢請求 —— 那個預檢會失敗，整筆送出就被擋在
 * 瀏覽器裡、根本到不了 Google。text/plain 屬於「簡單請求」，
 * 不觸發預檢；body 一樣是 JSON 字串，Apps Script 端用
 * e.postData.contents 解析。
 *
 * @param {string} endpoint - Apps Script 的 /exec 網址
 * @param {object} payload
 * @returns {Promise<boolean>} 是否確定寫入成功
 */
async function submitToEndpoint(endpoint, payload) {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow', // Apps Script 會 302 轉到 googleusercontent.com
    });
    if (!res.ok) return false;
    // 腳本回傳 { ok: true }。解析不出來就當作失敗，
    // 寧可請賓客重送，也不要讓回覆默默消失。
    const result = await res.json();
    return result?.ok === true;
  } catch (err) {
    console.warn('RSVP 送出失敗', err);
    return false;
  }
}

/**
 * 渲染獨立的 RSVP 出席回覆頁。
 *
 * 這一頁刻意做成可直接分享的網址（#/rsvp），
 * 新人可以把連結單獨傳給賓客，不必先走完 3D 動畫。
 *
 * @param {HTMLElement} root
 * @param {'groom'|'bride'|null} side - 從哪一側進來，用來預選賓客身份
 * @param {() => void} onBack - 返回婚禮資訊頁
 * @returns {() => void} cleanup
 */
export function renderRsvp(root, side, onBack) {
  root.innerHTML = `
    <section class="page rsvp-page">
      <header class="rsvp-page__hero">
        <button class="rsvp-page__back" id="rsvp-back" type="button">← 返回婚禮資訊</button>
        <h1 class="rsvp-page__title">出席回覆</h1>
        <p class="rsvp-page__sub">${weddingData.title}　${weddingData.dateDisplay}</p>
      </header>

      <div class="rsvp-page__body">
        <form class="rsvp-form" id="rsvp-form" novalidate>
          <div class="form-row">
            <label for="rsvp-name">您的姓名 *</label>
            <input type="text" id="rsvp-name" name="name" required placeholder="請輸入姓名" />
          </div>

          <div class="form-row form-row--split">
            <div class="form-row">
              <label for="rsvp-phone">聯絡電話</label>
              <input type="tel" id="rsvp-phone" name="phone" placeholder="0900-000-000" />
            </div>
            <div class="form-row">
              <label for="rsvp-side">賓客身份</label>
              <select id="rsvp-side" name="side">
                <option value="groom" ${side === 'groom' ? 'selected' : ''}>男方賓客</option>
                <option value="bride" ${side === 'bride' ? 'selected' : ''}>女方賓客</option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <label>是否出席</label>
            <div class="radio-group">
              <label><input type="radio" name="attending" value="yes" checked /> 準時出席</label>
              <label><input type="radio" name="attending" value="no" /> 無法出席</label>
            </div>
          </div>

          <div class="form-row--attendance">
            <div class="form-row">
              <label for="rsvp-adults">大人</label>
              <input type="number" id="rsvp-adults" name="adults" min="0" max="20" value="1" />
            </div>
            <div class="form-row">
              <label for="rsvp-kids">小孩</label>
              <input type="number" id="rsvp-kids" name="kids" min="0" max="10" value="0" />
            </div>
            <div class="form-row form-row--checkbox">
              <span class="form-row__label-spacer" aria-hidden="true">&nbsp;</span>
              <label class="form-check">
                <input type="checkbox" id="rsvp-child-seat" name="childSeat" value="yes" />
                <span>需要兒童座椅</span>
              </label>
            </div>
          </div>

          <div class="form-row form-row--split">
            <div class="form-row">
              <label for="rsvp-meat">葷食</label>
              <input type="number" id="rsvp-meat" name="mealRegular" min="0" max="30" value="1" />
            </div>
            <div class="form-row">
              <label for="rsvp-veg">素食</label>
              <input type="number" id="rsvp-veg" name="mealVegetarian" min="0" max="30" value="0" />
            </div>
          </div>

          <p class="form-note" id="rsvp-meal-note"></p>

          <div class="form-divider"></div>

          <label class="form-check">
            <input type="checkbox" id="rsvp-printed" name="printedInvite" value="yes" />
            <span>需要紙本喜帖</span>
          </label>

          <div class="form-row" id="rsvp-address-row" hidden>
            <label for="rsvp-address">寄送地址 *</label>
            <textarea
              id="rsvp-address"
              name="address"
              rows="2"
              placeholder="例：110 台北市信義區信義路五段 7 號 10 樓"
            ></textarea>
            <p class="form-note">我們會把紙本喜帖寄到這個地址，請填寫完整郵遞區號與門牌。</p>
          </div>

          <div class="form-row">
            <label for="rsvp-message">想對新人說的話</label>
            <textarea id="rsvp-message" name="message" placeholder="給新人的祝福..."></textarea>
          </div>

          <button class="form-submit" type="submit">送出回覆</button>
          <p class="form-hint">＊此表單目前為前端模擬送出，尚未串接後端。未來可接上 Google 表單或自訂 API。</p>
        </form>
      </div>

      <footer class="info__footer">
        ${weddingData.title} · ${weddingData.dateDisplay}
      </footer>
    </section>
  `;

  const form = root.querySelector('#rsvp-form');
  const backBtn = root.querySelector('#rsvp-back');

  // 送出成功後升起的去背半身照，以及它的 5 秒計時器。
  // 放在這一層是為了讓頁面 cleanup 也能收拾（例如彈窗還開著就被導頁）。
  let coupleStage = null;
  let coupleTimer = null;

  // --- 用餐人數自動對齊 ---
  // 「用餐偏好」若做成單選，兩人同行一葷一素就填不出來。
  // 改成分別填份數，並讓葷食 + 素食恆等於大人 + 小孩 ——
  // 由程式維持這個關係，使用者就不可能送出湊不攏的組合。
  const adultsInput = root.querySelector('#rsvp-adults');
  const kidsInput = root.querySelector('#rsvp-kids');
  const meatInput = root.querySelector('#rsvp-meat');
  const vegInput = root.querySelector('#rsvp-veg');
  const childSeatInput = root.querySelector('#rsvp-child-seat');
  const mealNote = root.querySelector('#rsvp-meal-note');

  const readInt = (el, fallback = 0) => {
    const n = parseInt(el.value, 10);
    return Number.isFinite(n) ? n : fallback;
  };
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  /**
   * @param {'adults'|'kids'|'meat'|'veg'|'seat'} source - 使用者剛動到哪一格
   * @param {boolean} writeBack - 是否把修正後的值寫回輸入框
   *   （打字途中不寫回，否則會跟使用者搶著改欄位內容）
   */
  function syncMeals(source, writeBack) {
    let adults = clamp(readInt(adultsInput, 1), 0, 20);
    const kids = clamp(readInt(kidsInput, 0), 0, 10);

    // 大人與小孩不能同時為 0，否則等於沒有人出席
    let total = adults + kids;
    if (total < 1) {
      adults = 1;
      total = 1;
      adultsInput.value = adults;
    } else if (writeBack) {
      adultsInput.value = adults;
      kidsInput.value = kids;
    }

    let meat = clamp(readInt(meatInput), 0, total);
    let veg = clamp(readInt(vegInput), 0, total);

    if (source === 'meat') {
      veg = total - meat;
    } else if (source === 'veg') {
      meat = total - veg;
    } else if (source === 'adults' || source === 'kids') {
      // 人數變動時優先保留素食份數，其餘補到葷食
      veg = Math.min(veg, total);
      meat = total - veg;
    }

    if (source !== 'meat' || writeBack) meatInput.value = meat;
    if (source !== 'veg' || writeBack) vegInput.value = veg;
    meatInput.max = total;
    vegInput.max = total;

    mealNote.textContent =
      `共 ${total} 位（大人 ${adults} 位、小孩 ${kids} 位）：葷食 ${meat} 份、素食 ${veg} 份` +
      (childSeatInput.checked ? '，需要兒童座椅' : '');
  }

  const mealHandlers = [
    [adultsInput, 'adults'],
    [kidsInput, 'kids'],
    [meatInput, 'meat'],
    [vegInput, 'veg'],
  ].map(([el, key]) => {
    const onInput = () => syncMeals(key, false);
    const onChange = () => syncMeals(key, true);
    el.addEventListener('input', onInput);
    el.addEventListener('change', onChange);
    return { el, onInput, onChange };
  });

  const onSeatChange = () => syncMeals('seat', true);
  childSeatInput.addEventListener('change', onSeatChange);
  syncMeals('adults', true);

  // --- 紙本喜帖與寄送地址 ---
  // 勾選才需要地址。未勾選時把欄位 disabled：
  // disabled 的欄位不列入瀏覽器的驗證，也不會被 FormData 送出，
  // 因此不會出現「隱藏的必填欄位擋住送出」這種卡死的狀況。
  const printedInput = root.querySelector('#rsvp-printed');
  const addressRow = root.querySelector('#rsvp-address-row');
  const addressInput = root.querySelector('#rsvp-address');

  function syncPrinted() {
    const need = printedInput.checked;
    addressRow.hidden = !need;
    addressInput.required = need;
    addressInput.disabled = !need;
    if (!need) addressInput.setCustomValidity('');
  }

  /** 只有空白字元的地址在瀏覽器眼中仍算「已填」，這裡自己擋掉 */
  function validateAddress() {
    if (printedInput.checked && !addressInput.value.trim()) {
      addressInput.setCustomValidity('勾選「需要紙本喜帖」後，請填寫寄送地址');
      return false;
    }
    addressInput.setCustomValidity('');
    return true;
  }

  const onPrintedChange = () => {
    syncPrinted();
    if (printedInput.checked) addressInput.focus();
  };
  const onAddressInput = () => addressInput.setCustomValidity('');
  printedInput.addEventListener('change', onPrintedChange);
  addressInput.addEventListener('input', onAddressInput);
  syncPrinted();

  const handleSubmit = async (e) => {
    e.preventDefault();
    validateAddress();
    if (!form.reportValidity()) return;

    const data = Object.fromEntries(new FormData(form).entries());
    // 未勾選的 checkbox 根本不會出現在 FormData 裡。
    // 補成明確的 yes/no，試算表的欄位才不會忽有忽無。
    data.childSeat = childSeatInput.checked ? 'yes' : 'no';
    data.printedInvite = printedInput.checked ? 'yes' : 'no';

    if (weddingData.rsvpEndpoint) {
      const sent = await submitToEndpoint(weddingData.rsvpEndpoint, data);
      if (!sent) {
        // 沒送出去就不能顯示成功，也不能清空表單 ——
        // 賓客才不會以為已經回覆完成，也不用重打一次
        await Swal.fire({
          title: '送出失敗',
          html:
            '網路似乎有點問題，您的資料還留在表單上。<br />' +
            '請稍後再按一次送出，或直接聯絡我們：<br />' +
            `<b>${weddingData.contact.groomFamily}</b><br /><b>${weddingData.contact.brideFamily}</b>`,
          confirmButtonText: '知道了',
          customClass: {
            popup: 'swal-wedding',
            title: 'swal-wedding__title',
            htmlContainer: 'swal-wedding__text',
            confirmButton: 'swal-wedding__confirm',
          },
        });
        return;
      }
    }

    const attending = form.querySelector('input[name="attending"]:checked')?.value === 'yes';

    form.reset();
    // reset() 只還原輸入框的預設值，衍生的狀態要自己補回來
    syncMeals('adults', true);
    syncPrinted();

    const result = await Swal.fire({
      title: attending ? '感謝您的回覆！' : '謝謝您特地告知',
      html: attending
        ? `我們已經收到您的資訊<br />期待在 <b>${weddingData.dateDisplay}</b> 與您相見 🎉`
        : '雖然這次無法見到您，<br />還是很開心收到您的心意 🤍',
      confirmButtonText: '回到婚禮資訊',
      showCancelButton: true,
      cancelButtonText: '留在這一頁',
      reverseButtons: true,
      // 全部改用自訂 class，才能套上網站的米色／緋色與襯線字體，
      // 不然會是 SweetAlert 預設的藍白配色，跟整體調性不合
      customClass: {
        popup: 'swal-wedding',
        title: 'swal-wedding__title',
        htmlContainer: 'swal-wedding__text',
        confirmButton: 'swal-wedding__confirm',
        cancelButton: 'swal-wedding__cancel',
      },
      // 兩張去背半身照從整個視窗的正下方升起，分別貼齊左右邊緣。
      // 它們必須放在彈窗「外面」才能貼到視窗底部，所以掛在 Swal 的
      // container 上、且插在 popup 之前 —— 這樣層級在遮罩之上、彈窗之下，
      // 手機上彈窗較寬時也只會從兩側探出來，不會蓋住按鈕。
      didOpen: () => {
        const container = Swal.getContainer();
        const popup = Swal.getPopup();
        if (!container || !popup) return;

        coupleStage = document.createElement('div');
        coupleStage.className = 'couple-rise';
        coupleStage.setAttribute('aria-hidden', 'true');
        coupleStage.innerHTML = `
          <img class="couple-rise__fig couple-rise__fig--left" src="${weddingData.halfBride}" alt="" />
          <img class="couple-rise__fig couple-rise__fig--right" src="${weddingData.halfGroom}" alt="" />
        `;
        container.insertBefore(coupleStage, popup);

        coupleTimer = window.setTimeout(() => {
          coupleStage?.classList.add('is-up');
        }, 2500);
      },
      willClose: () => {
        window.clearTimeout(coupleTimer);
        coupleStage?.remove();
        coupleStage = null;
      },
    });

    if (result.isConfirmed) onBack();
  };

  const handleBack = () => onBack();
  form.addEventListener('submit', handleSubmit);
  backBtn.addEventListener('click', handleBack);

  return () => {
    // 彈窗開著時若被導頁（例如按了瀏覽器上一頁），要一併關掉，
    // 否則會殘留在新頁面上。計時器與人像也一併收掉，避免關閉後才觸發。
    window.clearTimeout(coupleTimer);
    coupleStage?.remove();
    coupleStage = null;
    Swal.close();
    form.removeEventListener('submit', handleSubmit);
    backBtn.removeEventListener('click', handleBack);
    mealHandlers.forEach(({ el, onInput, onChange }) => {
      el.removeEventListener('input', onInput);
      el.removeEventListener('change', onChange);
    });
    childSeatInput.removeEventListener('change', onSeatChange);
    printedInput.removeEventListener('change', onPrintedChange);
    addressInput.removeEventListener('input', onAddressInput);
  };
}