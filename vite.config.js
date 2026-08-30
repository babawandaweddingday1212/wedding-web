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
}));
