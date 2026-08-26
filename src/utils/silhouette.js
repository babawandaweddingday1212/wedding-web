// 側臉＋肩膀輪廓控制點（比例座標，臉部朝右）
const RAW_PROFILE_POINTS = [
  [0.5, 0.03],
  [0.64, 0.05],
  [0.74, 0.12],
  [0.76, 0.19],
  [0.83, 0.24],
  [0.92, 0.3],
  [0.83, 0.34],
  [0.85, 0.39],
  [0.81, 0.44],
  [0.79, 0.49],
  [0.73, 0.55],
  [0.67, 0.59],
  [0.63, 0.67],
  [0.69, 0.74],
  [0.93, 0.87],
  [0.99, 1.0],
  [0.01, 1.0],
  [0.07, 0.87],
  [0.17, 0.71],
  [0.15, 0.55],
  [0.12, 0.39],
  [0.13, 0.21],
  [0.25, 0.07],
  [0.5, 0.03],
];

/**
 * 在 canvas context 上畫出側臉剪影路徑（不含 fill/stroke，呼叫端自行決定）。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} offsetX
 * @param {number} offsetY
 * @param {number} width
 * @param {number} height
 * @param {'left'|'right'} facing - right = 鼻子朝右
 */
export function drawFaceProfilePath(ctx, offsetX, offsetY, width, height, facing = 'right') {
  const pts = RAW_PROFILE_POINTS.map(([x, y]) => {
    const fx = facing === 'left' ? 1 - x : x;
    return [offsetX + fx * width, offsetY + y * height];
  });

  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const mx = (cx + nx) / 2;
    const my = (cy + ny) / 2;
    ctx.quadraticCurveTo(cx, cy, mx, my);
  }
  ctx.closePath();
}

/**
 * 用 canvas 2D 畫出一個簡化的「人臉側臉剪影」，
 * 並取樣輪廓內部的像素座標，回傳正規化後 (-1 ~ 1) 的點陣列。
 * 可用來作為 Three.js 粒子系統的目標位置，組成人臉剪影。
 *
 * @param {'left'|'right'} facing - 臉部朝向（right = 鼻子朝右）
 * @param {number} width
 * @param {number} height
 * @param {number} step - 取樣間距（越小點越密集）
 */
export function sampleFaceSilhouette({
  facing = 'right',
  width = 260,
  height = 340,
  step = 3,
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#000';

  drawFaceProfilePath(ctx, 0, 0, width, height, facing);
  ctx.fill();

  const imgData = ctx.getImageData(0, 0, width, height).data;
  const points = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const alphaIdx = (y * width + x) * 4 + 3;
      if (imgData[alphaIdx] > 128) {
        const nx = (x / width) * 2 - 1;
        const ny = -((y / height) * 2 - 1);
        points.push([nx, ny]);
      }
    }
  }
  return points;
}
