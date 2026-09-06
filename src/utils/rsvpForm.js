import { weddingData } from '../data/weddingData.js';
import { googleCalendarUrl } from './calendar.js';

// SweetAlert2（連同它的樣式）大約 40KB gzip，但只有「按下送出之後」
// 才會用到。靜態 import 會把它算進首屏的主 bundle，等於每個只是來看
// 婚禮資訊的賓客都先付一次這筆流量。改成動態載入，並在賓客第一次
// 碰到表單時就先在背景抓好，按下送出時彈窗仍然是即時出現的。
let swalPromise = null;
function loadSwal() {
  if (!swalPromise) swalPromise = import('sweetalert2').then((m) => m.default);
  return swalPromise;
}
/** 已經載好的 SweetAlert2，還沒載就回 null（給 cleanup 用，不觸發載入） */
let Swal = null;

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
 * ⚠️ 一定要重試。實測 Apps Script 冷啟動時，第一個 POST 會等十秒以上
 * 然後回一頁 404 的 HTML（同一個網址接下來的請求都是 1.3 秒、正常回
 * JSON）。那是 Google 端的暖機行為，不是賓客填錯，直接顯示「送出失敗」
 * 等於把第一個來填表的人擋在門外。
 *
 * 重試只在「HTTP 錯誤或連線失敗」時進行 —— 這兩種情況腳本多半根本
 * 沒被執行到，重送不會在試算表寫出兩列。腳本正常回應（不論 ok 與否）
 * 就不再重送。
 *
 * @param {string} endpoint - Apps Script 的 /exec 網址
 * @param {object} payload
 * @returns {Promise<boolean>} 是否確定寫入成功
 */
async function submitToEndpoint(endpoint, payload) {
  const RETRY_DELAYS = [800, 2500]; // 最多送三次

  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow', // Apps Script 會 302 轉到 googleusercontent.com
      });

      if (res.ok) {
        // 腳本回傳 { ok: true }。解析不出來就當作失敗，
        // 寧可請賓客重送，也不要讓回覆默默消失。
        const result = await res.json().catch(() => null);
        return result?.ok === true;
      }
      console.warn(`RSVP 送出失敗（HTTP ${res.status}），第 ${attempt + 1} 次`);
    } catch (err) {
      console.warn(`RSVP 送出失敗（連線錯誤），第 ${attempt + 1} 次`, err);
    }

    if (attempt >= RETRY_DELAYS.length) return false;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
  }
}

/**
 * 出席回覆表單的 HTML。
 *
 * 表單原本是獨立一頁（#/rsvp），現在直接嵌在婚禮資訊頁的最後一段 ——
 * 賓客看完流程與婚紗照就能接著填，中間不再多一次換頁。
 * markup 與行為拆成兩支函式（和 utils/countdown.js 同樣的作法），
 * 呼叫端才能把表單放進自己的版型裡。
 *
 * @param {'groom'|'bride'|null} side - 從哪一側進來，用來預選賓客身份
 * @returns {string}
 */
export function rsvpFormMarkup(side) {
  return `
    <form class="rsvp-form" id="rsvp-form" novalidate>
      <div class="form-row">
        <label for="rsvp-name">您的姓名 *</label>
        <input type="text" id="rsvp-name" name="name" required placeholder="請輸入姓名" />
      </div>

      <div class="form-row form-row--split">
        <div class="form-row">
          <label for="rsvp-phone">聯絡電話</label>
          <input type="tel" id="rsvp-phone" name="phone" placeholder="0900000000" />
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
          placeholder="例：台北市大同區承德路一段2號7樓"
        ></textarea>
      </div>

      <div class="form-row">
        <label for="rsvp-message">想對新人說的話</label>
        <textarea id="rsvp-message" name="message" placeholder="給新人的祝福..."></textarea>
      </div>

      <button class="form-submit" id="rsvp-submit" type="submit">
        <span class="form-submit__spinner" aria-hidden="true"></span>
        <span class="form-submit__label">送出回覆</span>
      </button>
      <p class="form-hint">＊請於 ${weddingData.rsvpDeadline} 前完成回覆，方便我們安排座位與餐點。</p>
    </form>
  `;
}

/**
 * 綁定表單行為（人數連動、紙本喜帖地址、送出）。
 * @param {HTMLElement} root - 包含 rsvpFormMarkup() 產生之節點的容器
 * @returns {() => void} cleanup
 */
export function initRsvpForm(root) {
  const form = root.querySelector('#rsvp-form');

  // 送出成功後升起的去背半身照，以及它的延遲計時器。
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

  // --- 送出 ---
  // 送到 Google 要一到數秒（冷啟動時更久），這段時間按鈕必須有反應：
  // 沒有的話賓客只會覺得「按了沒事」，於是連按好幾次。
  const submitBtn = root.querySelector('#rsvp-submit');
  const submitLabel = submitBtn.querySelector('.form-submit__label');
  let sending = false;

  function setSending(on) {
    sending = on;
    submitBtn.disabled = on;
    submitBtn.classList.toggle('is-loading', on);
    submitLabel.textContent = on ? '送出中…' : '送出回覆';
    form.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (sending) return;
    validateAddress();
    if (!form.reportValidity()) return;

    // 兩條路（成功／失敗）都要用到彈窗，先開始載，跟送出並行
    const swalReady = loadSwal().then((mod) => (Swal = mod));

    const data = Object.fromEntries(new FormData(form).entries());
    // 未勾選的 checkbox 根本不會出現在 FormData 裡。
    // 補成明確的 yes/no，試算表的欄位才不會忽有忽無。
    data.childSeat = childSeatInput.checked ? 'yes' : 'no';
    data.printedInvite = printedInput.checked ? 'yes' : 'no';

    setSending(true);
    if (weddingData.rsvpEndpoint) {
      const sent = await submitToEndpoint(weddingData.rsvpEndpoint, data);
      if (!sent) {
        setSending(false);
        await swalReady;
        // 沒送出去就不能顯示成功，也不能清空表單 ——
        // 賓客才不會以為已經回覆完成，也不用重打一次
        await Swal.fire({
          title: '送出失敗',
          html:
            '網路似乎有點問題，您填的資料都還留在表單上。<br />' +
            '請確認網路後再按一次「送出回覆」。',
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

    setSending(false);
    await swalReady;
    form.reset();
    // reset() 只還原輸入框的預設值，衍生的狀態要自己補回來
    syncMeals('adults', true);
    syncPrinted();

    const result = await Swal.fire({
      title: attending ? '感謝您的回覆！' : '謝謝您特地告知',
      html: attending
        ? `我們已經收到您的資訊<br />期待在 <b>${weddingData.dateDisplay}</b> 與您相見 🎉`
        : '雖然這次無法見到您，<br />還是很開心收到您的心意 🤍',
      confirmButtonText: '知道了',
      // 無法出席的人不需要加行事曆，那顆按鈕就不顯示
      showCancelButton: attending,
      cancelButtonText: '加入行事曆',
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
          <img class="couple-rise__fig couple-rise__fig--left" src="${weddingData.brideCutout}" alt="" />
          <img class="couple-rise__fig couple-rise__fig--right" src="${weddingData.groomCutout}" alt="" />
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

    if (result.dismiss === Swal.DismissReason.cancel) {
      // 「加入行事曆」：開新分頁到 Google 行事曆預填好的新增頁
      window.open(googleCalendarUrl(), '_blank', 'noopener');
    }
  };

  form.addEventListener('submit', handleSubmit);
  // 賓客開始填的時候就在背景載彈窗，按下送出時才不會多等一次網路
  const warmSwal = () => loadSwal();
  form.addEventListener('focusin', warmSwal, { once: true });

  return () => {
    // 彈窗開著時若被導頁（例如按了瀏覽器上一頁），要一併關掉，
    // 否則會殘留在新頁面上。計時器與人像也一併收掉，避免關閉後才觸發。
    window.clearTimeout(coupleTimer);
    coupleStage?.remove();
    coupleStage = null;
    Swal?.close();
    form.removeEventListener('submit', handleSubmit);
    form.removeEventListener('focusin', warmSwal);
    mealHandlers.forEach(({ el, onInput, onChange }) => {
      el.removeEventListener('input', onInput);
      el.removeEventListener('change', onChange);
    });
    childSeatInput.removeEventListener('change', onSeatChange);
    printedInput.removeEventListener('change', onPrintedChange);
    addressInput.removeEventListener('input', onAddressInput);
  };
}
