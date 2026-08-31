import { defineConfig } from 'vite';

// GitHub Pages 的專案網站掛在子路徑底下：
//   https://babawandaweddingday1212.github.io/wedding-web/
// 因此正式版要把 base 設成 repo 名稱，Vite 產生的資源路徑才會正確。
// 本機開發仍用 '/'，不然 dev server 要多打一層路徑。
//
// 注意：base 只作用於 Vite 自己編譯的資源。程式碼裡指向 public/ 的
// 字串路徑要自己接 import.meta.env.BASE_URL（見 src/data/weddingData.js
// 的 asset()）。
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/wedding-web/' : '/',

  build: {
    // ⚠️ 一定要設。預設的壓縮目標較新，會把
    //   @media (max-width: 640px)
    // 改寫成 Media Queries Level 4 的範圍語法
    //   @media (width <= 640px)
    // 那是 Safari 16.4 才支援的寫法 —— 舊版 Safari 會整段忽略，
    // 導致所有手機版樣式（輸入框 16px 防放大、欄位收合、觸控尺寸）
    // 全部失效，畫面就跑版了。
    //
    // 婚禮網站的賓客手機版本很雜，把目標壓低換取相容性是值得的。
    cssTarget: ['safari13', 'chrome87', 'firefox78', 'edge88'],
    target: ['es2020', 'safari13', 'chrome87', 'firefox78', 'edge88'],
  },
}));
