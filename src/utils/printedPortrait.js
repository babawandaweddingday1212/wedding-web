import * as THREE from 'three';
import { stretchTone } from './photoParticles.js';
import { weddingData } from '../data/weddingData.js';

/**
 * 產生一張「剛從印刷機印出來」的新人合照卡片貼圖：
 * 米色紙張 + 真實婚紗照 + 印刷業的對位記號與 CMYK 色標。
 *
 * @param {HTMLImageElement|null} photo - 已載入完成的合照；傳 null 時只印出文字卡片
 * @param {{width?:number, height?:number}} [options]
 * @returns {THREE.CanvasTexture}
 */
export function createPrintedPortraitTexture(photo, { width = 900, height = 1180 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // 紙張底色
  ctx.fillStyle = '#f7f1e6';
  ctx.fillRect(0, 0, width, height);

  // 紙張紋理雜訊
  for (let i = 0; i < 4200; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    ctx.fillStyle = `rgba(120,100,80,${Math.random() * 0.04})`;
    ctx.fillRect(x, y, 1, 1);
  }

  // ---------- 合照 ----------
  if (photo) {
    const srcW = photo.naturalWidth || photo.width;
    const srcH = photo.naturalHeight || photo.height;
    const aspect = srcW / srcH;

    // 先以高度定框，超出可用寬度時再以寬度回推，直幅／橫幅照片都能安全置中
    let frameH = Math.round(height * 0.585);
    let frameW = Math.round(frameH * aspect);
    const maxW = Math.round(width * 0.78);
    if (frameW > maxW) {
      frameW = maxW;
      frameH = Math.round(frameW / aspect);
    }
    const frameX = Math.round((width - frameW) / 2);
    const frameY = Math.round(height * 0.063);

    ctx.drawImage(photo, frameX, frameY, frameW, frameH);
    // 婚紗照是低光源暗調，不拉色階的話印在米色紙上會變成一塊黑
    stretchTone(ctx, frameX, frameY, frameW, frameH, { gamma: 0.85, white: 132 });

    // 讓照片和紙張調性融合的暖色薄霧
    ctx.fillStyle = 'rgba(196,150,110,0.10)';
    ctx.fillRect(frameX, frameY, frameW, frameH);

    // 照片壓框
    ctx.strokeStyle = 'rgba(74,59,48,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(frameX + 0.5, frameY + 0.5, frameW - 1, frameH - 1);
  }

  // ---------- 印刷套色記號（十字對位標記，印刷業經典元素） ----------
  const drawRegistrationMark = (x, y) => {
    ctx.strokeStyle = 'rgba(60,50,45,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x - 11, y);
    ctx.lineTo(x + 11, y);
    ctx.moveTo(x, y - 11);
    ctx.lineTo(x, y + 11);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.stroke();
  };
  [
    [32, 32],
    [width - 32, 32],
    [32, height - 32],
    [width - 32, height - 32],
  ].forEach(([x, y]) => drawRegistrationMark(x, y));

  // ---------- CMYK 色標條 ----------
  const swatchColors = ['#00aeef', '#ec008c', '#fff200', '#231f20'];
  const swatchW = 32;
  swatchColors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(
      width / 2 - (swatchColors.length * swatchW) / 2 + i * swatchW,
      height * 0.685,
      swatchW - 5,
      12
    );
  });

  // ---------- 文字 ----------
  ctx.textAlign = 'center';
  ctx.fillStyle = '#4a3b30';
  ctx.font = '600 44px "Noto Serif TC", serif';
  ctx.fillText(`${weddingData.groomName} ♥ ${weddingData.brideName}`, width / 2, height * 0.765);

  ctx.font = '400 19px "Share Tech Mono", monospace';
  ctx.fillStyle = '#8a7f73';
  ctx.letterSpacing = '2px';
  ctx.fillText('PRINTED WITH LOVE · LIMITED EDITION', width / 2, height * 0.818);

  ctx.font = '400 19px "Noto Sans TC", sans-serif';
  ctx.fillStyle = '#7a6f63';
  ctx.letterSpacing = '0px';
  ctx.fillText(weddingData.dateDisplay, width / 2, height * 0.868);

  ctx.strokeStyle = 'rgba(138,59,70,0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(23, 23, width - 46, height - 46);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}