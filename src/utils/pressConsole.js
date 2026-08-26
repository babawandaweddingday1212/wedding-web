import * as THREE from 'three';
import { weddingData } from '../data/weddingData.js';

/**
 * 產生 RICOH Pro C9500 控制台螢幕的貼圖：作業佇列 + CMYK 墨量 + 進度條。
 * 回傳的 update() 讓進度條可以跟著動畫走，強化「機器正在工作」的科技感。
 *
 * @returns {{texture:THREE.CanvasTexture, update:(progress:number)=>void}}
 */
export function createPressConsole() {
  const width = 512;
  const height = 320;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const inks = [
    { label: 'C', color: '#00aeef', level: 0.86 },
    { label: 'M', color: '#ec008c', level: 0.72 },
    { label: 'Y', color: '#ffd400', level: 0.91 },
    { label: 'K', color: '#2b2b2b', level: 0.64 },
  ];

  function update(progress) {
    const p = Math.max(0, Math.min(1, progress));

    // 介面底色
    ctx.fillStyle = '#12161c';
    ctx.fillRect(0, 0, width, height);

    // 標題列
    ctx.fillStyle = '#1c232c';
    ctx.fillRect(0, 0, width, 42);
    ctx.fillStyle = '#e6ebf2';
    ctx.font = '600 20px "Share Tech Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('RICOH  Pro C9500', 18, 28);

    ctx.fillStyle = p >= 1 ? '#3ddc84' : '#ffb020';
    ctx.beginPath();
    ctx.arc(width - 30, 21, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8ea0b5';
    ctx.font = '13px "Share Tech Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(p >= 1 ? 'READY' : 'PRINTING', width - 46, 26);

    // 作業資訊
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8ea0b5';
    ctx.font = '13px "Share Tech Mono", monospace';
    ctx.fillText('JOB', 18, 68);
    ctx.fillStyle = '#e6ebf2';
    ctx.font = '15px "Noto Sans TC", sans-serif';
    ctx.fillText(`${weddingData.groomName} × ${weddingData.brideName}  婚禮邀請卡`, 58, 68);

    ctx.fillStyle = '#8ea0b5';
    ctx.font = '13px "Share Tech Mono", monospace';
    ctx.fillText('STOCK', 18, 92);
    ctx.fillStyle = '#e6ebf2';
    ctx.fillText('310gsm  MATT  A4', 66, 92);

    ctx.fillStyle = '#8ea0b5';
    ctx.fillText('MODE', 18, 116);
    ctx.fillStyle = '#e6ebf2';
    ctx.fillText('CMYK  1200dpi  DUPLEX', 66, 116);

    // CMYK 墨量條
    const barY = 148;
    const barW = 104;
    inks.forEach((ink, i) => {
      const x = 18 + i * (barW + 14);
      ctx.fillStyle = '#8ea0b5';
      ctx.font = '13px "Share Tech Mono", monospace';
      ctx.fillText(ink.label, x, barY - 8);

      ctx.fillStyle = '#232c37';
      ctx.fillRect(x, barY, barW, 16);
      ctx.fillStyle = ink.color;
      ctx.fillRect(x, barY, barW * ink.level, 16);

      ctx.fillStyle = '#6f8095';
      ctx.font = '11px "Share Tech Mono", monospace';
      ctx.fillText(`${Math.round(ink.level * 100)}%`, x + barW - 26, barY + 30);
    });

    // 進度條
    const pbY = 232;
    ctx.fillStyle = '#8ea0b5';
    ctx.font = '13px "Share Tech Mono", monospace';
    ctx.fillText('SHEET 1 / 1', 18, pbY - 8);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(p * 100)}%`, width - 18, pbY - 8);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#232c37';
    ctx.fillRect(18, pbY, width - 36, 18);
    const grad = ctx.createLinearGradient(18, 0, width - 18, 0);
    grad.addColorStop(0, '#00aeef');
    grad.addColorStop(0.5, '#ec008c');
    grad.addColorStop(1, '#ffd400');
    ctx.fillStyle = grad;
    ctx.fillRect(18, pbY, (width - 36) * p, 18);

    // 底部狀態列
    ctx.fillStyle = '#1c232c';
    ctx.fillRect(0, height - 40, width, 40);
    ctx.fillStyle = '#6f8095';
    ctx.font = '12px "Share Tech Mono", monospace';
    ctx.fillText('REGISTRATION  OK   ·   FUSER  185°C   ·   VACUUM FEED  ON', 18, height - 16);

    texture.needsUpdate = true;
  }

  update(0);
  return { texture, update };
}