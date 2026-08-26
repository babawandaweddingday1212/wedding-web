import * as THREE from 'three';
import { MATRIX_CHARS } from './matrixRain.js';

// 與背景數位雨同一套字元，粒子化的文字才會像是從雨裡長出來的
const GLYPHS = MATRIX_CHARS;

const ATLAS_COLS = 8;

/**
 * 產生一張 8x8 的字元圖集貼圖（白字、透明底），供粒子當作 point sprite。
 * 白字是刻意的：實際顏色在 shader 裡染，才能從駭客綠漸變成照片原色。
 *
 * @param {{cell?:number}} [options] - cell 為單格邊長（像素）
 * @returns {{texture:THREE.CanvasTexture, cols:number, count:number}}
 */
export function createGlyphAtlas({ cell = 64 } = {}) {
  const rows = Math.ceil(GLYPHS.length / ATLAS_COLS);
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * cell;
  canvas.height = ATLAS_COLS * cell; // 補成正方形，shader 的 UV 計算才能共用同一個除數
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(cell * 0.78)}px 'Share Tech Mono', monospace`;

  GLYPHS.forEach((ch, i) => {
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);
    ctx.fillText(ch, col * cell + cell / 2, row * cell + cell / 2);
  });

  const texture = new THREE.CanvasTexture(canvas);
  // flipY 關掉，shader 裡 row 0 才會對應到 canvas 最上面那排字
  texture.flipY = false;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;

  return { texture, cols: ATLAS_COLS, count: GLYPHS.length, rows };
}