# 俊笙 ♥ 婕瑜 婚禮邀請網站

用 [Vite](https://vitejs.dev) + [Three.js](https://threejs.org) + [GSAP](https://gsap.com) 打造的婚禮邀請單頁網站。

流程：**首頁（選擇男方／女方賓客）→ 專屬 3D 動畫過場 → 婚禮資訊頁（倒數、地圖、流程、RSVP 表單、婚紗照相簿）**

- 男方賓客：駭客／工程師風格 — 畫面先是稀疏的綠色字元，字元愈來愈密並聚合成新人合照，接著縮成圓點、顏色由駭客綠還原為照片原色，最後在兩人臉之間浮現心形連結線。
- 女方賓客：RICOH Pro C9500 生產型數位印刷機（依女方公司實機造型重建）— 鏡頭帶過機器全貌後鑽進進紙口，在印刷單元內跟著紙張前進，通過噴印頭時以 CMYK 噴墨網點逐步顯影出合照，最後送到出紙盤看成品。

> 目前所有內容（新人姓名、日期、地址、照片）皆為**示範資料**，請依照下方「如何替換成正式內容」章節修改。

---

## 快速開始

需要 Node.js 18 以上版本。

```bash
npm install
npm run dev        # 本機開發，預設 http://localhost:5173
npm run build       # 打包正式版本到 dist/
npm run preview     # 預覽打包後的正式版本
```

打包完成後，`dist/` 資料夾就是一個完全靜態的網站，可以直接部署到 Vercel、Netlify、GitHub Pages、Cloudflare Pages，或任何靜態空間 / 自己的虛擬主機。

---

## 專案結構

```
wedding-site/
├─ index.html                 # HTML 進入點（含字型載入）
├─ src/
│  ├─ main.js                 # 頁面路由（首頁 → 動畫 → 資訊頁）狀態機
│  ├─ style.css                # 全站樣式
│  ├─ data/
│  │  └─ weddingData.js       # ★ 婚禮資料設定檔（新人姓名、日期、地址、照片…）
│  ├─ pages/
│  │  ├─ landing.js           # 首頁（選擇男方／女方賓客）
│  │  ├─ scene.js             # 3D 動畫過場頁的外框（字幕、略過、進度條）
│  │  └─ info.js              # 婚禮資訊頁（倒數、地圖、流程、表單、相簿）
│  ├─ scenes/
│  │  ├─ groomScene.js        # 男方 3D 動畫（駭客風格）
│  │  └─ brideScene.js        # 女方 3D 動畫（RICOH Pro C9500 印刷機）
│  └─ utils/
│     ├─ matrixRain.js        # 數位雨背景效果
│     ├─ photoParticles.js    # ★ 照片取樣成粒子（座標／亮度／原色）＋色階拉伸
│     ├─ glyphAtlas.js        # 字元圖集貼圖（粒子的文字階段用）
│     ├─ printedPortrait.js   # 把合照排版成印刷卡片貼圖（給女方動畫用）
│     ├─ pressConsole.js      # 印刷機控制台螢幕 UI 貼圖
│     ├─ silhouette.js        # （已無引用，可刪）舊版側臉剪影繪製
│     └─ dotTexture.js        # （已無引用，可刪）舊版粒子柔光圓點材質
├─ public/
│  └─ photos/                 # 網頁實際使用的照片（請先壓到 1600px 以內）
└─ photos-src/                # 原始高解析照片，不會被打包進網站
```

> **照片很重要**：`public/photos/` 裡的檔案會原封不動被打包進網站，
> 直接放單眼相機出來的 20MB 原檔會讓賓客的手機載到天荒地老。
> 原檔請放 `photos-src/`，壓縮後的版本才放 `public/photos/`。

---

## 如何替換成正式內容

### 1. 新人姓名、日期、地點、流程、聯絡方式

打開 `src/data/weddingData.js`，修改裡面的欄位即可，**不需要動到任何頁面或動畫程式碼**：

```js
export const weddingData = {
  groomName: '俊笙',
  brideName: '婕瑜',
  dateISO: '2026-12-12T17:30:00+08:00',   // 倒數計時用
  dateDisplay: '2026 年 12 月 12 日（星期六）晚上 17:30 入席',
  venueName: '幸福會館 3 樓 幸福廳',
  address: '台北市中山區幸福路 100 號',
  mapEmbedSrc: 'https://www.google.com/maps?q=...&output=embed', // 見下方說明
  schedule: [ /* 婚禮流程 */ ],
  contact: { groomFamily: '...', brideFamily: '...' },
  photos: [ /* 婚紗照相簿，見下方說明 */ ],
  rsvpEndpoint: '', // 見下方「RSVP 表單」說明
};
```

**地圖**：到 Google 地圖搜尋正式地址 → 分享 → 嵌入地圖 → 複製 `<iframe src="...">` 裡的網址，貼到 `mapEmbedSrc`。

### 2. 婚紗照相簿

目前用彩色色塊佔位，之後有正式照片時：

1. 把照片檔案放進 `public/photos/`（例如 `wedding-01.jpg`）。
2. 打開 `src/data/weddingData.js` 的 `photos` 陣列，把每一項加上 `src` 欄位：
   ```js
   { id: 1, caption: '海邊夕陽', color: '#e8c4c4', src: '/photos/wedding-01.jpg' }
   ```
   相簿會自動偵測：有填 `src` 就顯示真實照片，沒填就維持彩色佔位圖，不需要修改任何頁面程式碼。可以先只換幾張測試效果，其餘保留佔位圖也沒問題。

### 3. 動畫中的「新人合照」

兩支動畫目前都用程式產生的**剪影 / 網點插畫**代替真人照片（在 `src/utils/silhouette.js` 與 `src/utils/printedPortrait.js`），效果已經設計成跟駭客風 / 印刷風主題搭配。

如果之後想換成真實照片：
- **男方動畫**：可以把 `groomScene.js` 中組成剪影的粒子，改成用真實照片的邊緣偵測結果取樣（技術上需要額外處理，非必要）。
- **女方動畫**：最簡單的做法是把 `printedPortrait.js` 產生的 canvas 內容，改成直接把真人合照 `drawImage()` 上去、疊加半透明的網點紋理，維持「剛印出來」的質感。

這兩處都有詳細註解，或可以直接請工程師 / 我協助調整。

### 4. RSVP 表單

目前是**前端模擬送出**（`src/pages/info.js`）：使用者送出後會看到成功訊息，資料會印在瀏覽器 console，但不會真的儲存到任何地方。

之後要串接真實後端，有兩個常見做法：

- **最簡單：Google 表單 / Google Sheet**（透過 Apps Script 建立一個接收 POST 的網址），把網址填入 `weddingData.js` 的 `rsvpEndpoint`，程式碼已經預留好會自動 `fetch(rsvpEndpoint, { method: 'POST', body: JSON.stringify(data) })`。
- **自訂後端**：接上任何你熟悉的後端 API（Firebase、Supabase、Notion API、自己寫的伺服器…），一樣填入 `rsvpEndpoint` 即可，或是直接修改 `handleSubmit` 函式。

---

## 技術重點 / 給工程師的補充說明

- **路由**：沒有用任何前端框架，`src/main.js` 是一個極簡的手寫狀態機，透過替換 `#app` 的內容切換「首頁 / 動畫 / 資訊頁」，並確實呼叫每頁回傳的 `cleanup()` 函式，避免 Three.js 場景、計時器、事件監聽器在切頁後繼續佔用資源。
- **效能**：`three` 相關程式碼透過動態 `import()` 拆分成獨立 chunk，只有在使用者真的點擊「男方／女方賓客」按鈕時才會載入，首頁本身非常輕量。
- **粒子動畫注意事項**：`groomScene.js` 中的粒子系統位置每一幀都會更新，因此明確設定 `points.frustumCulled = false`，避免 three.js 用初次計算出的 boundingSphere 做視錐剔除，導致動畫進行到一半粒子被誤判為畫面外而消失。
- **響應式**：全站排版以 CSS Grid / Flexbox + `clamp()` 字級撰寫，手機、平板、桌機都已測試過基本呈現。
- **無障礙 / 略過動畫**：兩支 3D 動畫都提供「略過動畫」按鈕與自動播放完畢後的「進入婚禮資訊」按鈕，避免動畫成為使用者取得資訊的阻礙。

---

## 已知限制

- 地圖與 Google Fonts 需要網路連線才能正確顯示（正式部署到網路上後即可正常運作）。
- RSVP 表單尚未串接任何真實後端，送出後資料不會被保存（見上方說明）。
- 3D 動畫在非常舊的裝置 / 瀏覽器（不支援 WebGL）上會無法顯示，建議之後視情況加上簡單的 WebGL 支援度偵測與純圖文備援畫面。
