// 把一張照片取樣成粒子資料，供 Three.js 粒子系統重建影像。
//
// 婚紗照多半是低光源的暗調作品，直方圖幾乎全擠在左側
// （本專案這張：50% 像素亮度 < 16，最亮處也只到 144，從未接近 255）。
// 若直接用原始亮度當門檻或當粒子強度，畫面會整片死黑、認不出人形，
// 因此取樣時一律先把實際動態範圍 [black, white] 拉伸到 0~1 再做 gamma 提亮。

/**
 * 這張合照實測的動態範圍（原始亮度 0~255）：
 * 中位數僅 16.1，最亮處只到 143.8。
 *
 * gamma 0.45 是為「數位雨綠色階段」挑的：把中位數從 8.6% 提到約 33%。
 * 彩色階段與印刷卡片另外使用較保守的 colorGamma 0.85 / white 132，
 * 那組值已用離線算圖確認過在米色紙上的表現。
 */
export const PHOTO_LEVELS = { black: 6, white: 118, gamma: 0.45 };
export const PHOTO_COLOR_LEVELS = { black: 6, white: 132, gamma: 0.85 };

/** 建 256 階查表，避免每個像素都做一次 Math.pow */
function buildLut({ black, white, gamma }) {
  const span = Math.max(1, white - black);
  const lut = new Float32Array(256);
  for (let v = 0; v < 256; v++) {
    const stretched = Math.min(1, Math.max(0, (v - black) / span));
    lut[v] = Math.pow(stretched, gamma);
  }
  return lut;
}

/**
 * 把 canvas 上指定區域的色階拉伸到滿格並做 gamma 提亮，就地修改像素。
 * 暗調照片若不做這步，印在米色紙上會整塊糊成黑色。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {{black?:number, white?:number, gamma?:number}} [levels]
 */
export function stretchTone(ctx, x, y, w, h, levels = {}) {
  const lut = buildLut({ ...PHOTO_COLOR_LEVELS, ...levels });
  const imageData = ctx.getImageData(x, y, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[d[i]] * 255;
    d[i + 1] = lut[d[i + 1]] * 255;
    d[i + 2] = lut[d[i + 2]] * 255;
  }
  ctx.putImageData(imageData, x, y);
}

/**
 * 取樣照片，產生粒子座標、亮度與原色。
 *
 * @param {HTMLImageElement|HTMLCanvasElement} image - 已載入完成的圖片
 * @param {object} [options]
 * @param {number} [options.cols] - 橫向取樣格數（越大粒子越密、細節越清楚）
 * @param {number} [options.threshold] - 低於此正規化亮度的像素直接捨棄（0~1）
 * @returns {{count:number, nx:Float32Array, ny:Float32Array, lum:Float32Array,
 *            rgb:Float32Array, cols:number, rows:number, aspect:number}}
 *   nx/ny 為 -1~1 正規化座標（ny 向上為正）；lum 為 0~1 提亮後亮度；
 *   rgb 為每顆粒子的照片原色（0~1，已做較保守的色階拉伸）。
 */
export function samplePhotoParticles(
  image,
  {
    cols = 230,
    threshold = 0.14,
    black = PHOTO_LEVELS.black,
    white = PHOTO_LEVELS.white,
    gamma = PHOTO_LEVELS.gamma,
    colorLevels = PHOTO_COLOR_LEVELS,
  } = {}
) {
  const srcW = image.naturalWidth || image.width;
  const srcH = image.naturalHeight || image.height;
  const aspect = srcW / srcH;
  const rows = Math.max(1, Math.round(cols / aspect));

  // 直接把圖片縮繪到取樣網格大小，交給瀏覽器做降採樣（比自己跳點取樣更平滑）
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, cols, rows);
  const data = ctx.getImageData(0, 0, cols, rows).data;

  const lumLut = buildLut({ black, white, gamma });
  const colorLut = buildLut(colorLevels);
  const total = cols * rows;

  // 先寫進滿容量的緩衝區，最後再截成實際長度，避免逐點 push 造成大量重新配置
  const nx = new Float32Array(total);
  const ny = new Float32Array(total);
  const lum = new Float32Array(total);
  const rgb = new Float32Array(total * 3);
  let count = 0;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const value = lumLut[Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)];
      if (value <= threshold) continue;

      nx[count] = (x / (cols - 1)) * 2 - 1;
      ny[count] = -((y / (rows - 1)) * 2 - 1);
      lum[count] = value;

      const c = count * 3;
      rgb[c] = colorLut[r];
      rgb[c + 1] = colorLut[g];
      rgb[c + 2] = colorLut[b];
      count++;
    }
  }

  return {
    count,
    nx: nx.subarray(0, count),
    ny: ny.subarray(0, count),
    lum: lum.subarray(0, count),
    rgb: rgb.subarray(0, count * 3),
    cols,
    rows,
    aspect,
  };
}

/**
 * 載入圖片，回傳 Promise<HTMLImageElement>。
 * @param {string} src
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`圖片載入失敗：${src}`));
    img.src = src;
  });
}