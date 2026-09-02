// ============================================================
// 婚禮資料設定檔（示範 / 模擬資料）
// ------------------------------------------------------------
// 之後要換成正式內容時，只需要修改這個檔案即可，
// 不需要動到頁面或動畫的程式碼。
// 照片檔案請放在 /public/photos/ 資料夾內，
// 再把下面 photos 陣列中的 src 換成實際檔名即可
// （例如 asset('photos/wedding-01.jpg')）。
// ============================================================

/**
 * 把 public/ 底下的檔案組成正確的網址。
 *
 * 網站部署在 GitHub Pages 時位於子路徑（/wedding-web/），
 * 直接寫 '/photos/x.jpg' 會被瀏覽器解析成網域根目錄而 404。
 * Vite 只會替它自己編譯的資源加上 base，字串字面值不會處理，
 * 所以這裡要自己接上 import.meta.env.BASE_URL
 * （開發時是 '/'，正式版是 '/wedding-web/'）。
 *
 * @param {string} path - 不以斜線開頭的相對路徑
 */
const asset = (path) => `${import.meta.env.BASE_URL}${path}`;

/**
 * 婚禮日期的中文寫法。
 * 抽出來當單一來源：入席時間與首頁的歡迎詞都由它組出來，
 * 改日期時只要動這一行（以及下面的 dateISO）。
 */
const dateShort = '2026 年 12 月 12 日（星期六）';

export const weddingData = {
  // 新人姓名
  groomName: '俊笙',
  brideName: '婕瑜',

  // 主視覺合照 —— 兩段 3D 動畫都會用它：
  // 男方場景把它重建成數位雨粒子影像，女方場景把它印在卡片上。
  // 原始檔在 photos-src/couple-portrait-original.jpg，
  // 換照片時建議先壓到 1600px 以內再放進 public/photos/。
  couplePortrait: asset('photos/couple-portrait.jpg'),

  // 送出回覆後，會從視窗左下與右下升起的去背半身人像。
  // 由 photos-src/person-cutout.swift 產生
  // （macOS Vision 內建人像分割，不需安裝任何模型）：
  //   swift photos-src/person-cutout.swift <原圖> <輸出.png> \
  //         <水平起點> <寬度> <垂直起點> <高度>
  // 這兩張的來源與參數（比例，垂直以畫面上緣為 0）：
  //   來源  photos-src/couple-with-childhood-photos-original.jpg
  //   新娘  0.0  0.478  0.0  0.60
  //   新郎  0.50 0.50   0.0  0.60
  brideCutout: asset('photos/bride-cutout.png'),
  groomCutout: asset('photos/groom-cutout.png'),

  // 頁面標題／副標
  title: '俊笙 ♥ 婕瑜',
  subtitle: '我們要結婚了，誠摯邀請您一同見證這幸福的一刻',

  // 婚禮名稱
  eventName: '俊笙 & 婕瑜 婚禮宴客',

  // 日期時間（ISO 格式，含時區）－ 用於倒數計時
  // 開始時間取「入席」的 18:00，不是流程第一列的 17:00 ——
  // 17:00 是彩排，賓客的行事曆事件不該從那時開始。
  // 結束時間用於加入行事曆的事件長度（流程最後是 21:00 送客，抓到 21:30）。
  dateISO: '2026-12-12T18:00:00+08:00',
  dateEndISO: '2026-12-12T21:30:00+08:00',
  dateShort,
  dateDisplay: `${dateShort}晚上 18:00 入席`,

  // 資訊頁倒數計時下方的一句話
  welcomeMessage: `歡迎您的到來，請保留${dateShort}這個寶貴的夜晚，一起見證我們的婚禮`,

  // 地點
  venueName: '上海鄉村 承德本家 7 樓',
  address: '103 臺北市大同區承德路一段 2 號 7 樓（皇翔臺北廣場）',

  // 地圖嵌入與導航連結。
  // 用 ?q=<查詢字串>&output=embed 這種形式不需要 Google Maps API 金鑰；
  // 查詢字串同時帶店名與完整地址，定位才會準確。
  mapEmbedSrc:
    'https://www.google.com/maps?q=%E4%B8%8A%E6%B5%B7%E9%84%89%E6%9D%91%20%E6%89%BF%E5%BE%B7%E6%9C%AC%E5%AE%B6%20103%E8%87%BA%E5%8C%97%E5%B8%82%E5%A4%A7%E5%90%8C%E5%8D%80%E6%89%BF%E5%BE%B7%E8%B7%AF%E4%B8%80%E6%AE%B52%E8%99%9F7%E6%A8%93&output=embed',
  mapLinkUrl:
    'https://www.google.com/maps/search/?api=1&query=%E4%B8%8A%E6%B5%B7%E9%84%89%E6%9D%91%20%E6%89%BF%E5%BE%B7%E6%9C%AC%E5%AE%B6%20103%E8%87%BA%E5%8C%97%E5%B8%82%E5%A4%A7%E5%90%8C%E5%8D%80%E6%89%BF%E5%BE%B7%E8%B7%AF%E4%B8%80%E6%AE%B52%E8%99%9F7%E6%A8%93',

  // 交通資訊
  transport: {
    intro:
      '本店入口位於承德路一段及華陰街交叉口（皇翔臺北廣場），鄰近台北車站。',

    parking: {
      note: '於本棟停車可直接折抵',
      lots: [
        {
          name: 'CITY PARKING 城市車旅停車場 皇翔臺北廣場場站（皇翔台汽北）',
          addr: '臺北市大同區承德路一段 2 號 B1–B5',
          discount: true,
        },
        {
          name: 'Times 台北地下街停車場 中央入口',
          addr: '臺北市大同區市民大道一段 100 號 B2',
        },
        {
          name: '壹車房 站前停車場',
          addr: '臺北市大同區華陰街 89 號',
        },
        {
          name: '廣德利停車場',
          addr: '臺北市大同區太原路 13-1 號',
        },
      ],
    },

    mrt: [
      '搭乘淡水信義線或板南線至「台北車站」，前往地下街 Y7 出口出站，步行約 1 分鐘即可到達。',
      '地下街 Y9 通往連通道，可前往皇翔大樓 B2 搭乘電梯至 7 樓上海鄉村。',
    ],

    bus: '搭乘 2、215、304 承德、63、756、797、811、林口—台北車站（承德），於「台北車站（承德）」站下車即可到達。',

    // 交通示意圖。換圖時放進 public/photos/ 再改這裡即可；留空則不顯示。
    // 檔名刻意用純英數 —— 中文檔名在網址裡要做百分比編碼，沒必要冒這個險。
    mapImage: asset('photos/transport-map.png'),
  },

  // 流程
  schedule: [
    { time: '17:00', title: '賓客報到', desc: '簽名、入席、拿小禮、留聲機玩起來' },
    { time: '18:00', title: '婚宴開席', desc: '新人交換誓言與戒指' },
    { time: '18:30', title: '宴會活動', desc: '來就知道....' },
    { time: '21:00', title: '送客合影', desc: '一起和我們拍美照！' },
  ],

  // 回覆截止日
  rsvpDeadline: '2026/9/27（日）',

  // 婚紗照相簿的頁面順序見 src/data/albumPages.js

  // RSVP 表單送出端點（先留空，之後可接 Google 表單 / 後端 API）
  // 範例：'https://script.google.com/macros/s/xxxxx/exec'
  // Google Apps Script Web App。腳本在 Google 伺服器上以擁有者權限執行，
  // 把回覆寫進試算表，因此前端不需要任何金鑰。
  // 這個網址不是機密（它必然會出現在前端 bundle 裡），但也不必張揚 ——
  // 知道網址的人可以往試算表灌資料。腳本端已擋掉沒有姓名的請求。
  // 腳本內容見 google-apps-script/rsvp.gs。
  rsvpEndpoint:
    'https://script.google.com/macros/s/AKfycbwqgBD9e722t_SJlPs3-_FkdO2-vfmqBqe974hQ_7d1PG0TsZkmikgKdDp0ElhH_7WOgQ/exec',
};
