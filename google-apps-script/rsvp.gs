/**
 * 婚禮 RSVP → Google 試算表
 * ============================================================
 * 這段程式碼跑在 Google 的伺服器上、以「你」的權限執行，
 * 試算表的存取權杖不會進到瀏覽器，所以前端不需要任何金鑰。
 *
 * 【安裝步驟】
 * 1. 開一個新的 Google 試算表
 * 2. 選單 擴充功能 → Apps Script
 * 3. 把 Code.gs 的內容整個換成這個檔案
 * 4. 右上角「部署」→「新增部署作業」
 *      類型：網頁應用程式
 *      執行身分：我
 *      具有存取權的使用者：⚠️ 任何人
 *    （必須選「任何人」，賓客沒有 Google 帳號也要能送出）
 * 5. 第一次授權時會出現「未經驗證的應用程式」警告 ——
 *    點「進階」→「前往（不安全）」。那是因為這支腳本沒有經過
 *    Google 審核，不是真的有問題；它只會存取你自己這份試算表。
 * 6. 複製產生的 /exec 網址，填進 src/data/weddingData.js 的 rsvpEndpoint
 *
 * 【之後改了這個檔案】
 * 一定要重新「部署 → 管理部署作業 → 編輯 → 版本選『新版本』」，
 * 只按儲存不會更新線上的版本。
 */

const SHEET_NAME = 'RSVP';

/** 欄位對應：[前端送來的欄位名, 試算表標題] */
const COLUMNS = [
  ['_timestamp', '送出時間'],
  ['name', '姓名'],
  ['phone', '聯絡電話'],
  ['side', '賓客身份'],
  ['attending', '是否出席'],
  ['adults', '大人'],
  ['kids', '小孩'],
  ['childSeat', '兒童座椅'],
  ['mealRegular', '葷食'],
  ['mealVegetarian', '素食'],
  ['printedInvite', '紙本喜帖'],
  ['address', '寄送地址'],
  ['message', '祝福的話'],
];

/** 把前端的代碼翻成中文，試算表才看得懂 */
const LABELS = {
  side: { groom: '男方', bride: '女方' },
  attending: { yes: '出席', no: '無法出席' },
  childSeat: { yes: '需要', no: '' },
  printedInvite: { yes: '需要', no: '' },
};

function doPost(e) {
  // 同時有多人送出時，appendRow 可能寫到同一列，用鎖排隊
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'busy' });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOutput_({ ok: false, error: 'empty body' });
    }

    const data = JSON.parse(e.postData.contents);

    // 姓名是唯一的必填欄位，沒有就當作無效請求擋掉
    if (!data.name || !String(data.name).trim()) {
      return jsonOutput_({ ok: false, error: 'name required' });
    }

    const sheet = getSheet_();
    const row = COLUMNS.map(function (col) {
      const key = col[0];
      if (key === '_timestamp') return new Date();
      const raw = data[key] === undefined || data[key] === null ? '' : String(data[key]);
      const map = LABELS[key];
      return map && map[raw] !== undefined ? map[raw] : raw;
    });

    sheet.appendRow(row);
    return jsonOutput_({ ok: true });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** 用瀏覽器直接開 /exec 時會走到這裡，方便確認部署是否成功 */
function doGet() {
  return jsonOutput_({ ok: true, service: 'wedding-rsvp' });
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  // 第一次寫入時自動補上標題列
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(
      COLUMNS.map(function (col) {
        return col[1];
      })
    );
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
  }
  return sheet;
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
