import * as THREE from 'three';
import gsap from 'gsap';
import { createMatrixRain } from '../utils/matrixRain.js';
import { samplePhotoParticles } from '../utils/photoParticles.js';
import { createGlyphAtlas } from '../utils/glyphAtlas.js';

/**
 * 男方賓客動畫 —— 駭客／工程師風格
 *
 * 三段式變化，全部在 GPU 上完成：
 *   1. 稀疏的綠色字元從上方落下（uReveal 很小 → 畫面上只有「一點點文字」）
 *   2. 字元愈來愈密並聚合到照片座標，接著縮成圓點（uReveal↑、uGlyphMix 0→1）
 *   3. 顏色由駭客綠漸變回照片原色（uColorMix 0→1）
 *
 * @param {HTMLElement} container
 * @param {{ onCaption:(text:string)=>void, onProgress:(pct:number)=>void, onReady:()=>void, photo?:HTMLImageElement }} callbacks
 */
export function createGroomScene(container, { onCaption, onProgress, onReady, photo } = {}) {
  const noop = () => {};
  onCaption = onCaption || noop;
  onProgress = onProgress || noop;
  onReady = onReady || noop;

  // ---------- DOM ----------
  const rainCanvas = document.createElement('canvas');
  rainCanvas.style.position = 'absolute';
  rainCanvas.style.inset = '0';
  rainCanvas.style.zIndex = '0';
  container.appendChild(rainCanvas);

  const glCanvas = document.createElement('canvas');
  glCanvas.style.position = 'absolute';
  glCanvas.style.inset = '0';
  glCanvas.style.zIndex = '1';
  container.appendChild(glCanvas);

  const rain = createMatrixRain(rainCanvas, { color: '#39ff88' });
  rain.setIntensity(0.55);

  // ---------- Three.js 基本設定 ----------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.set(0, 0, 8);

  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  // ---------- 粒子與背景素材 ----------
  const atlas = createGlyphAtlas();

  function createVignetteTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(0,6,3,0.75)');
    grad.addColorStop(0.55, 'rgba(0,6,3,0.45)');
    grad.addColorStop(1, 'rgba(0,6,3,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }
  const vignetteTexture = createVignetteTexture();

  // ---------- 從合照取樣出粒子影像 ----------
  // 粒子密度直接決定「認不認得出是誰」：cols 230 在 2:3 直幅照片上
  // 約可取到 5~6 萬個點，五官才有足夠層次；低於一萬點會糊成一團色塊。
  const PHOTO_HEIGHT = 6.4;
  const sampled = photo ? samplePhotoParticles(photo, { cols: 230 }) : null;
  const photoWidth = sampled ? PHOTO_HEIGHT * sampled.aspect : 4.2;

  const vignetteGeo = new THREE.PlaneGeometry(photoWidth * 1.5, PHOTO_HEIGHT * 1.18);
  const vignetteMat = new THREE.MeshBasicMaterial({
    map: vignetteTexture,
    transparent: true,
    depthWrite: false,
    opacity: 0,
  });
  const vignetteMesh = new THREE.Mesh(vignetteGeo, vignetteMat);
  vignetteMesh.position.set(0, 0, -1.1);
  scene.add(vignetteMesh);

  const uniforms = {
    uAssemble: { value: 0 },
    uReveal: { value: 0.04 },
    uGlyphMix: { value: 0 },
    uColorMix: { value: 0 },
    uAtlas: { value: atlas.texture },
    uAtlasCols: { value: atlas.cols },
    uSpacing: { value: 0.02 },
    uGlyphScale: { value: 1.45 },
    uDotSize: { value: 0.03 },
    uScale: { value: 500 },
  };

  const VERTEX_SHADER = /* glsl */ `
    attribute vec3 aStart;
    attribute vec3 aTarget;
    attribute vec3 aPhotoColor;
    attribute float aLum;
    attribute float aDelay;
    attribute float aGlyph;
    attribute float aRand;

    uniform float uAssemble;
    uniform float uReveal;
    uniform float uGlyphMix;
    uniform float uSpacing;
    uniform float uGlyphScale;
    uniform float uDotSize;
    uniform float uScale;
    uniform float uAtlasCols;

    varying vec3 vPhotoColor;
    varying vec3 vGreenColor;
    varying vec2 vCell;
    varying float vAlpha;

    void main() {
      float p = clamp((uAssemble - aDelay) / max(0.0001, 1.0 - aDelay), 0.0, 1.0);
      float eased = 1.0 - pow(1.0 - p, 3.0);
      vec4 mv = modelViewMatrix * vec4(mix(aStart, aTarget, eased), 1.0);
      gl_Position = projectionMatrix * mv;

      // 只有「已出現」的粒子看得見；uReveal 由小變大，文字就由稀疏長成整張照片
      vAlpha = step(aRand, uReveal);

      // 字元尺寸隨密度反向縮放，讓螢幕覆蓋率維持恆定：
      // 少量字元時每個都很大很清楚，全部出現時自動縮小，畫面才不會糊成一片
      float density = max(uReveal, 0.02);
      float glyphSize = uSpacing / sqrt(density) * uGlyphScale;
      float worldSize = mix(glyphSize, uDotSize, uGlyphMix);
      gl_PointSize = worldSize * uScale / max(0.001, -mv.z);

      vPhotoColor = aPhotoColor;

      // 駭客綠由亮度驅動；高光往白綠偏，但幅度壓在 0.35 避免整張泛白
      float hl = aLum * aLum * 0.35;
      vGreenColor = vec3((0.224 + hl) * aLum, aLum, (0.533 + hl * 0.6) * aLum);

      vCell = vec2(mod(aGlyph, uAtlasCols), floor(aGlyph / uAtlasCols));
    }
  `;

  const FRAGMENT_SHADER = /* glsl */ `
    uniform sampler2D uAtlas;
    uniform float uAtlasCols;
    uniform float uGlyphMix;
    uniform float uColorMix;

    varying vec3 vPhotoColor;
    varying vec3 vGreenColor;
    varying vec2 vCell;
    varying float vAlpha;

    void main() {
      if (vAlpha < 0.5) discard;

      vec2 pc = gl_PointCoord;
      float glyphA = texture2D(uAtlas, (vCell + pc) / uAtlasCols).a;

      float d = length(pc - vec2(0.5));
      float dotA = smoothstep(0.5, 0.12, d);

      float a = mix(glyphA, dotA, uGlyphMix);
      if (a < 0.02) discard;

      gl_FragColor = vec4(mix(vGreenColor, vPhotoColor, uColorMix), a);
    }
  `;

  function buildPhotoPoints(data) {
    const { count, nx, ny, lum, rgb, rows } = data;

    const aStart = new Float32Array(count * 3);
    const aTarget = new Float32Array(count * 3);
    const aPhotoColor = new Float32Array(count * 3);
    const aLum = new Float32Array(count);
    const aDelay = new Float32Array(count);
    const aGlyph = new Float32Array(count);
    const aRand = new Float32Array(count);

    const halfW = photoWidth / 2;
    const halfH = PHOTO_HEIGHT / 2;

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      aTarget[ix] = nx[i] * halfW;
      aTarget[ix + 1] = ny[i] * halfH;
      // 只給極小的景深抖動：值一大，照片細節就會在視覺上糊掉
      aTarget[ix + 2] = (Math.random() - 0.5) * 0.16;

      // 起始位置：像數位雨一樣從畫面上方隨機落下
      aStart[ix] = (Math.random() - 0.5) * 9;
      aStart[ix + 1] = 7 + Math.random() * 9;
      aStart[ix + 2] = (Math.random() - 0.5) * 4;

      aPhotoColor[ix] = rgb[ix];
      aPhotoColor[ix + 1] = rgb[ix + 1];
      aPhotoColor[ix + 2] = rgb[ix + 2];

      aLum[i] = lum[i];
      aGlyph[i] = Math.floor(Math.random() * atlas.count);
      aRand[i] = Math.random();
      // 由上往下掃描式落點，讀起來像逐行解碼
      aDelay[i] = (1 - (ny[i] + 1) / 2) * 0.25 + Math.random() * 0.3;
    }

    const geometry = new THREE.BufferGeometry();
    // position 只是給 three.js 算 draw range 用，實際座標由 aStart/aTarget 在 shader 內插
    geometry.setAttribute('position', new THREE.BufferAttribute(aTarget.slice(), 3));
    geometry.setAttribute('aStart', new THREE.BufferAttribute(aStart, 3));
    geometry.setAttribute('aTarget', new THREE.BufferAttribute(aTarget, 3));
    geometry.setAttribute('aPhotoColor', new THREE.BufferAttribute(aPhotoColor, 3));
    geometry.setAttribute('aLum', new THREE.BufferAttribute(aLum, 1));
    geometry.setAttribute('aDelay', new THREE.BufferAttribute(aDelay, 1));
    geometry.setAttribute('aGlyph', new THREE.BufferAttribute(aGlyph, 1));
    geometry.setAttribute('aRand', new THREE.BufferAttribute(aRand, 1));

    // 粒子間距（世界單位）決定字元的基準大小
    uniforms.uSpacing.value = PHOTO_HEIGHT / rows;
    uniforms.uDotSize.value = (PHOTO_HEIGHT / rows) * 1.55;

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      // 用一般 alpha 混合而非加法混合：加法會讓重疊粒子把顏色推向白色，
      // 照片原色就還原不出來了
      blending: THREE.NormalBlending,
    });

    const points = new THREE.Points(geometry, material);
    // 粒子位置在 shader 內變動，three.js 初次算出的 boundingSphere 會誤判，
    // 因此關閉這個物件的 frustum culling。
    points.frustumCulled = false;
    scene.add(points);

    return { points, geometry, material, count };
  }

  // 照片載入失敗時不讓整段動畫崩掉：數位雨與愛心仍會照常演出
  const cloud = sampled ? buildPhotoPoints(sampled) : null;

  // ---------- 相機取景 ----------
  // 照片要「大一點」，但在手機直式畫面上不能被裁掉，
  // 因此每次 resize 都依高度與寬度兩個方向重算相機距離，取較遠者。
  function fitCamera() {
    const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    const distForHeight = PHOTO_HEIGHT * 0.5 / Math.tan(halfFov);
    const distForWidth = photoWidth * 0.5 / (Math.tan(halfFov) * camera.aspect);
    camera.position.z = Math.max(distForHeight, distForWidth) * 1.1;
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitCamera();
    // 與 three.js PointsMaterial 的 sizeAttenuation 同一套換算
    uniforms.uScale.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y * 0.5;
  }
  resize();
  window.addEventListener('resize', resize);

  // ---------- 兩人臉之間的連結愛心線 ----------
  // 錨點取在照片上兩張臉中間的空隙（正規化座標，y 向上為正），
  // 這樣愛心不會壓到任何一張臉。
  const HEART_ANCHOR = { nx: -0.06, ny: 0.5 };
  const HEART_SIZE = 0.5;
  const heartX = HEART_ANCHOR.nx * (photoWidth / 2);
  const heartY = HEART_ANCHOR.ny * (PHOTO_HEIGHT / 2);

  function heartPoints(segments = 80) {
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push(new THREE.Vector3((x / 16) * HEART_SIZE, (y / 16) * HEART_SIZE, 0));
    }
    return pts;
  }

  const heartGeometry = new THREE.BufferGeometry().setFromPoints(heartPoints());
  const heartMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
  });
  const heartLine = new THREE.LineLoop(heartGeometry, heartMaterial);
  heartLine.position.set(heartX, heartY, 0.4);
  heartLine.scale.set(0, 0, 0);
  scene.add(heartLine);

  const glowGeometry = new THREE.SphereGeometry(0.34, 24, 24);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x39ff88,
    transparent: true,
    opacity: 0,
  });
  const glowSphere = new THREE.Mesh(glowGeometry, glowMaterial);
  glowSphere.position.set(heartX, heartY, -0.4);
  scene.add(glowSphere);

  // ---------- 動畫時間軸 ----------
  const state = { mouseX: 0, mouseY: 0 };
  const clock = new THREE.Clock();
  let disposed = false;

  const handleMouseMove = (e) => {
    const rect = container.getBoundingClientRect();
    state.mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    state.mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  };
  container.addEventListener('mousemove', handleMouseMove);

  const tl = gsap.timeline({
    onUpdate: () => onProgress(Math.round(tl.progress() * 100)),
  });

  onCaption('正在解析賓客資料 // decrypting_guest_data...');

  tl.to(uniforms.uAssemble, { value: 1, duration: 4.2, ease: 'power2.out' }, 0)
    .to(uniforms.uReveal, { value: 1, duration: 3.6, ease: 'power1.inOut' }, 0)
    .call(() => onCaption('影像資料串流中 // streaming_pixels...'), [], 1.8)
    .call(() => rain.setIntensity(0.24), [], 0.6)
    .to(vignetteMat, { opacity: 1, duration: 2.2, ease: 'power1.out' }, 1.2)
    // 字元縮成圓點，照片的細節這時才真正浮現
    .to(uniforms.uGlyphMix, { value: 1, duration: 3.0, ease: 'power2.inOut' }, 2.6)
    .call(() => onCaption('人臉辨識完成 // FACE_MATCH: 100%'), [], 4.4)
    // 綠色褪去，還原照片原本的顏色
    .to(uniforms.uColorMix, { value: 1, duration: 3.2, ease: 'power1.inOut' }, 4.2)
    .call(() => rain.setIntensity(0.1), [], 4.6)
    .call(() => onCaption('色彩還原完成 // TRUE_COLOR restored'), [], 6.6)
    .to(heartMaterial, { opacity: 0.9, duration: 1, ease: 'power1.out' }, 6.8)
    .to(heartLine.scale, { x: 1, y: 1, z: 1, duration: 1.1, ease: 'back.out(1.8)' }, 6.8)
    .to(glowMaterial, { opacity: 0.28, duration: 1.4, ease: 'power1.out' }, 7.0)
    .call(() => onCaption('SYNC_COMPLETE：兩顆心已成功配對 ♥'), [], 7.9)
    .call(() => onReady(), [], 8.8);

  // ---------- Render Loop ----------
  function animate() {
    if (disposed) return;
    const t = clock.getElapsedTime();
    heartLine.rotation.z = Math.sin(t * 0.6) * 0.02;
    glowSphere.material.opacity = glowMaterial.opacity * (0.85 + Math.sin(t * 2.4) * 0.15);

    // 視差幅度刻意壓小：照片是有細節的影像，鏡頭晃太大會讓五官看起來在游動
    camera.position.x += (state.mouseX * 0.22 - camera.position.x) * 0.03;
    camera.position.y += (-state.mouseY * 0.15 - camera.position.y) * 0.03;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();

  return {
    skipToEnd() {
      tl.progress(1);
      uniforms.uAssemble.value = 1;
      uniforms.uReveal.value = 1;
      uniforms.uGlyphMix.value = 1;
      uniforms.uColorMix.value = 1;
      heartMaterial.opacity = 0.9;
      heartLine.scale.set(1, 1, 1);
      glowMaterial.opacity = 0.28;
      vignetteMat.opacity = 1;
      rain.setIntensity(0.1);
    },
    dispose() {
      disposed = true;
      tl.kill();
      rain.destroy();
      window.removeEventListener('resize', resize);
      container.removeEventListener('mousemove', handleMouseMove);
      if (cloud) {
        cloud.geometry.dispose();
        cloud.material.dispose();
      }
      atlas.texture.dispose();
      heartGeometry.dispose();
      heartMaterial.dispose();
      glowGeometry.dispose();
      glowMaterial.dispose();
      vignetteGeo.dispose();
      vignetteMat.dispose();
      vignetteTexture.dispose();
      renderer.dispose();
      if (rainCanvas.parentNode) rainCanvas.parentNode.removeChild(rainCanvas);
      if (glCanvas.parentNode) glCanvas.parentNode.removeChild(glCanvas);
    },
  };
}