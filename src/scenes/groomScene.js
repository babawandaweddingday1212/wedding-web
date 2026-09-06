import * as THREE from 'three';
// GSAP 只取 core：這段動畫補間的都是純 JS 物件（uniform、material、Object3D
// 的位置與縮放），完全沒有碰 DOM 樣式，所以用不到預設進入點會一併帶進來的
// CSSPlugin。power / back 這些 ease 本來就在 core 裡。
import gsap from 'gsap/gsap-core';
import { createMatrixRain } from '../utils/matrixRain.js';
import { samplePhotoParticles } from '../utils/photoParticles.js';
import { createGlyphAtlas } from '../utils/glyphAtlas.js';

/**
 * 男方賓客動畫 —— 工程師：程式碼變成照片
 *
 * 全長 4.6 秒，沒有任何文字說明：
 *   0.0s 幾萬個綠色字元從 3D 空間的深處往畫面中央飛，有的從鏡頭旁邊擦過去
 *   1.5s 它們各自落到自己在合照裡的像素位置，畫面慢慢認得出是兩個人
 *   2.2s 字縮成點、駭客綠褪回原色，照片同時依亮度長出浮雕厚度
 *   3.5s 鏡頭繞回正面，兩人之間的心形自己描出來
 *
 * 這段的主要視覺是「前後」：
 *   - 起點是以自己的目標位置為圓心往隨機方向推開 5~24 個世界單位，方向
 *     刻意壓在 z 軸上，所以多數粒子是從深處或鏡頭後方飛來，不是在同一個
 *     平面上左右移動
 *   - 飛行中的字元放大 4.2 倍再縮回像素大小 —— 照片像素只有 0.03 個世界
 *     單位，飛在二十個單位外投影出來不到一個像素，不放大整群都看不見
 *   - 遠處的粒子連透明度一起壓下去。每顆一樣亮的話，再深的景深也會讀成
 *     一片平面
 *
 * @param {HTMLElement} container
 * @param {{ onProgress:(pct:number)=>void, onReady:()=>void, photo?:HTMLImageElement }} callbacks
 */
export function createGroomScene(container, { onProgress, onReady, photo } = {}) {
  const noop = () => {};
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

  // 數位雨只是背景質感，強度壓低 —— 前景那群粒子才是主角
  const rain = createMatrixRain(rainCanvas, { color: '#39ff88' });
  rain.setIntensity(0.22);

  // ---------- Three.js 基本設定 ----------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);

  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const atlas = createGlyphAtlas();

  // ---------- 從合照取樣出粒子影像 ----------
  // 粒子密度直接決定「認不認得出是誰」：cols 230 在 2:3 直幅照片上
  // 約可取到 5~6 萬個點，五官才有足夠層次；低於一萬點會糊成一團色塊。
  const PHOTO_HEIGHT = 6.4;
  const sampled = photo ? samplePhotoParticles(photo, { cols: 230 }) : null;
  const photoWidth = sampled ? PHOTO_HEIGHT * sampled.aspect : 4.2;

  // 兩人臉中間的空隙，心形長在這裡
  const HEART_ANCHOR = { nx: -0.06, ny: 0.5 };
  const heartX = HEART_ANCHOR.nx * (photoWidth / 2);
  const heartY = HEART_ANCHOR.ny * (PHOTO_HEIGHT / 2);

  // ---------- 襯在粒子後面的暗場 ----------
  function createScrimTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(0,10,5,0.82)');
    grad.addColorStop(0.55, 'rgba(0,8,4,0.5)');
    grad.addColorStop(1, 'rgba(0,6,3,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }
  const scrimTexture = createScrimTexture();
  const scrimGeo = new THREE.PlaneGeometry(photoWidth * 1.6, PHOTO_HEIGHT * 1.22);
  const scrimMat = new THREE.MeshBasicMaterial({
    map: scrimTexture,
    transparent: true,
    depthWrite: false,
    opacity: 0,
  });
  const scrim = new THREE.Mesh(scrimGeo, scrimMat);
  scrim.position.set(0, 0, -1.6);
  scene.add(scrim);

  const uniforms = {
    uAssemble: { value: 0 }, // 從飛來的位置聚合到照片位置
    uReveal: { value: 0.05 }, // 已經出現的粒子比例
    uGlyphMix: { value: 0 }, // 字元 → 圓點
    uColorMix: { value: 0 }, // 駭客綠 → 照片原色
    // 起伏幅度。一開始就有，而且刻意誇張 —— 影像還沒成形的時候，
    // 整片點雲像一塊在空間裡飄的布，前後起伏近三個世界單位
    // （照片本身高 6.4），鏡頭一動就明顯錯位。
    // 收尾時補間回 0：最後定下來的必須是一張平的照片。
    uRelief: { value: 1.9 },
    uTime: { value: 0 },
    uAtlas: { value: atlas.texture },
    uAtlasCols: { value: atlas.cols },
    uGlyph: { value: 0.05 },
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
    uniform float uRelief;
    uniform float uTime;
    uniform float uGlyph;
    uniform float uDotSize;
    uniform float uScale;
    uniform float uAtlasCols;

    varying vec3 vPhotoColor;
    varying vec3 vGreenColor;
    varying vec2 vCell;
    varying float vAlpha;
    varying float vDepth;

    void main() {
      float p = clamp((uAssemble - aDelay) / max(0.0001, 1.0 - aDelay), 0.0, 1.0);
      // 進場用強一點的 ease-out：飛來的那段要快，靠近定位時才慢下來
      float eased = 1.0 - pow(1.0 - p, 4.0);

      vec3 target = aTarget;

      // 起伏刻意「跟畫面內容無關」：用位置驅動的三道行進波，不是亮度。
      // 依亮度推的話，亮的地方（臉、手臂）會整片凸出來，看起來像人臉
      // 從照片裡浮出來 —— 那不是我們要的。改用波之後，相鄰的點是一起
      // 動的，整片讀起來是一塊在空間裡飄的布，臉不會變形。
      float wave =
        sin(aTarget.x * 1.15 + uTime * 0.9) * 0.62 +
        sin(aTarget.y * 0.80 - uTime * 0.70) * 0.50 +
        sin((aTarget.x + aTarget.y) * 0.55 + uTime * 1.30) * 0.34;
      // 疊一點點per-particle 的雜訊，讓布面不會完全平滑得像塑膠
      wave += (aRand - 0.5) * 0.18;
      target.z += wave * uRelief;

      vec3 pos = mix(aStart, target, eased);

      vAlpha = step(aRand, uReveal);

      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mv;

      // 距離衰減。飛在遠處的粒子要暗下去，前後才拉得開 ——
      // 每顆點一樣亮的話，再深的景深也會讀成一片平面。
      vDepth = smoothstep(-30.0, -6.0, mv.z);

      // 飛行中的字元要比它在照片裡的尺寸大得多。照片像素的尺寸只有
      // 0.03 個世界單位，飛在二十個單位外時投影出來不到一個像素 ——
      // 等於整群粒子在遠處是看不見的。所以飛行階段放大，抵達的過程中
      // 再縮回像素大小，那個「由大縮小」本身就是落定的動作。
      float glyphNow = mix(uGlyph * 4.2, uGlyph, eased);
      float world = mix(glyphNow, uDotSize, uGlyphMix);
      gl_PointSize = world * uScale / max(0.001, -mv.z);

      vPhotoColor = min(aPhotoColor * 1.38, vec3(1.0));

      // 駭客綠由亮度驅動。還在飛的粒子亮度不能用照片亮度 —— 這張合照
      // 多數像素亮度低於 0.15，飛在半空中會整片看不見。飛行途中用終端機
      // 該有的亮度，落定的過程再收斂回它真正的亮度。
      float flying = 1.0 - eased;
      float lum = mix(aLum, 0.45 + 0.45 * aRand, flying);
      float hl = lum * lum * 0.35;
      vGreenColor = vec3((0.224 + hl) * lum, lum, (0.533 + hl * 0.6) * lum);

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
    varying float vDepth;

    void main() {
      if (vAlpha < 0.5) discard;

      vec2 pc = gl_PointCoord;
      float glyphA = texture2D(uAtlas, (vCell + pc) / uAtlasCols).a;

      float d = length(pc - vec2(0.5));
      float dotA = smoothstep(0.5, 0.12, d);

      float a = mix(glyphA, dotA, uGlyphMix);
      if (a < 0.02) discard;

      vec3 col = mix(vGreenColor, vPhotoColor, uColorMix);

      // 遠處的粒子連透明度一起壓下去，景深才夠明顯
      float depthFade = 0.34 + 0.66 * vDepth;
      gl_FragColor = vec4(col, a * depthFade);
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
    const dir = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      aTarget[ix] = nx[i] * halfW;
      aTarget[ix + 1] = ny[i] * halfH;
      aTarget[ix + 2] = (Math.random() - 0.5) * 0.1;

      // 起點：以自己的目標位置為圓心，往一個隨機方向推開 5~24 個單位。
      // 方向刻意壓扁在 z 軸上（乘 1.8），大部分粒子因此是從深處或從
      // 鏡頭後方飛過來的，而不是在同一個平面上左右移動 —— 那才有前後。
      dir
        .set(Math.random() - 0.5, Math.random() - 0.5, (Math.random() - 0.5) * 1.8)
        .normalize();
      const dist = 5 + Math.pow(Math.random(), 0.75) * 19;
      aStart[ix] = aTarget[ix] + dir.x * dist;
      aStart[ix + 1] = aTarget[ix + 1] + dir.y * dist;
      aStart[ix + 2] = aTarget[ix + 2] + dir.z * dist;

      aPhotoColor[ix] = rgb[ix];
      aPhotoColor[ix + 1] = rgb[ix + 1];
      aPhotoColor[ix + 2] = rgb[ix + 2];

      aLum[i] = lum[i];
      aGlyph[i] = Math.floor(Math.random() * atlas.count);
      aRand[i] = Math.random();
      // 抵達時間拉得很開：畫面上永遠同時有「剛出發的」和「快到位的」，
      // 聚合才不是一次到齊的整齊動作
      aDelay[i] = Math.pow(Math.random(), 1.4) * 0.72;
    }

    const geometry = new THREE.BufferGeometry();
    // position 只是給 three.js 算 draw range 用，實際座標由 shader 內插
    geometry.setAttribute('position', new THREE.BufferAttribute(aTarget.slice(), 3));
    geometry.setAttribute('aStart', new THREE.BufferAttribute(aStart, 3));
    geometry.setAttribute('aTarget', new THREE.BufferAttribute(aTarget, 3));
    geometry.setAttribute('aPhotoColor', new THREE.BufferAttribute(aPhotoColor, 3));
    geometry.setAttribute('aLum', new THREE.BufferAttribute(aLum, 1));
    geometry.setAttribute('aDelay', new THREE.BufferAttribute(aDelay, 1));
    geometry.setAttribute('aGlyph', new THREE.BufferAttribute(aGlyph, 1));
    geometry.setAttribute('aRand', new THREE.BufferAttribute(aRand, 1));

    const spacing = PHOTO_HEIGHT / rows;
    uniforms.uGlyph.value = spacing * 1.85;
    uniforms.uDotSize.value = spacing * 1.55;

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

    return { points, geometry, material };
  }

  // 照片載入失敗時不讓整段動畫崩掉：數位雨與心形仍會照常演出
  const cloud = sampled ? buildPhotoPoints(sampled) : null;

  // ---------- 相機 ----------
  // fitCamera 只算「照片剛好裝得下」的距離，實際機位由 camState 以它為基準
  // 推算，所以轉向或改視窗大小都不會打斷運鏡。
  let fitDistance = 8;
  function fitCamera() {
    const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    const distForHeight = (PHOTO_HEIGHT * 0.5) / Math.tan(halfFov);
    const distForWidth = (photoWidth * 0.5) / (Math.tan(halfFov) * camera.aspect);
    fitDistance = Math.max(distForHeight, distForWidth) * 1.08;
  }

  // dolly 是距離倍率，swing 是水平擺角（弧度），lift 是高度，roll 是鏡頭傾斜
  const camState = { dolly: 1.5, swing: -0.42, lift: 0.5, roll: 0.05 };

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

  // ---------- 兩人臉之間的心形 ----------
  const HEART_SIZE = 0.5;
  const HEART_SEGMENTS = 96;

  function heartPoints(segments) {
    const pts = [];
    // 從最下方的尖端起筆，兩邊才會對稱地描上去
    for (let i = 0; i <= segments; i++) {
      const t = Math.PI + (i / segments) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push(new THREE.Vector3((x / 16) * HEART_SIZE, (y / 16) * HEART_SIZE, 0));
    }
    return pts;
  }

  const heartGeometry = new THREE.BufferGeometry().setFromPoints(heartPoints(HEART_SEGMENTS));
  const heartMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
  });
  // 用 Line 而不是 LineLoop：搭配 setDrawRange 就能讓線條「描出來」。
  // 縮放彈出（back.out）那種做法太像 UI 元件跳出來，線條自己描一圈才像手寫。
  const heartLine = new THREE.Line(heartGeometry, heartMaterial);
  heartLine.position.set(heartX, heartY, 0.5);
  heartGeometry.setDrawRange(0, 0);
  scene.add(heartLine);
  const heartDraw = { progress: 0 };

  // 心形背後的光暈。加法混合的柔光貼片 —— 不透明的球疊在照片上
  // 只會是一塊實心多邊形，那是貼色紙不是發光。
  function createGlowTexture() {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(150,255,200,0.9)');
    g.addColorStop(0.35, 'rgba(57,255,136,0.32)');
    g.addColorStop(1, 'rgba(57,255,136,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }
  const glowTexture = createGlowTexture();
  const glowGeometry = new THREE.PlaneGeometry(1.7, 1.7);
  const glowMaterial = new THREE.MeshBasicMaterial({
    map: glowTexture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.position.set(heartX, heartY, -0.5);
  scene.add(glow);

  // ---------- 時間軸 ----------
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const clock = new THREE.Clock();
  let disposed = false;

  const handlePointerMove = (e) => {
    const rect = container.getBoundingClientRect();
    pointer.tx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    pointer.ty = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  };
  container.addEventListener('mousemove', handlePointerMove);

  const tl = gsap.timeline({
    onUpdate: () => onProgress(Math.round(tl.progress() * 100)),
  });

  tl
    // 1) 一大群字元從深處飛來，各自落到自己的像素位置
    .to(uniforms.uAssemble, { value: 1, duration: 2.9, ease: 'power1.inOut' }, 0)
    .to(uniforms.uReveal, { value: 1, duration: 0.9, ease: 'power1.out' }, 0)
    .to(scrimMat, { opacity: 0.88, duration: 1.6, ease: 'power1.out' }, 0.8)
    .call(() => rain.setIntensity(0.1), [], 1.6)
    // 2) 字縮成點、還原原色，同時長出浮雕厚度
    .to(uniforms.uGlyphMix, { value: 1, duration: 1.1, ease: 'power2.inOut' }, 2.1)
    .to(uniforms.uColorMix, { value: 1, duration: 1.2, ease: 'power1.inOut' }, 2.5)
    // 厚度收回 0：影像完整之後留一拍讓人看見那個立體，才壓平 ——
    // 那一下就是「從一團在空間裡的點，變成一張照片」
    .to(uniforms.uRelief, { value: 0, duration: 1.25, ease: 'power2.inOut' }, 3.1)
    // 3) 鏡頭：開場在遠處看著粒子飛，一路推進、擺正，收尾再緩緩繞回去一點，
    //    那個「還在動」就是讓浮雕厚度被看見的關鍵
    .to(camState, { dolly: 1.0, duration: 4.2, ease: 'power2.out' }, 0)
    .to(camState, { swing: 0.18, duration: 3.0, ease: 'power1.inOut' }, 0)
    .to(camState, { swing: -0.05, duration: 1.4, ease: 'power2.inOut' }, 3.0)
    .to(camState, { lift: 0, duration: 3.4, ease: 'power2.inOut' }, 0)
    .to(camState, { roll: 0, duration: 3.0, ease: 'power1.inOut' }, 0.3)
    // 4) 心形自己描一圈
    .to(heartDraw, { progress: 1, duration: 0.85, ease: 'power2.inOut' }, 3.4)
    .to(heartMaterial, { opacity: 0.92, duration: 0.3, ease: 'power1.out' }, 3.4)
    .to(glowMaterial, { opacity: 0.3, duration: 0.8, ease: 'power1.out' }, 3.5)
    .call(() => onReady(), [], 4.6);

  // ---------- Render Loop ----------
  let lastTime = 0;
  function animate(now) {
    if (disposed) return;
    const t = clock.getElapsedTime();
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;

    uniforms.uTime.value = t;

    heartGeometry.setDrawRange(0, Math.round(heartDraw.progress * (HEART_SEGMENTS + 1)));
    heartLine.rotation.z = Math.sin(t * 0.6) * 0.02;
    glow.scale.setScalar(0.94 + Math.sin(t * 2.4) * 0.06);

    // 滑鼠視差要先平滑再用。直接把游標座標接到機位上沒有慣性，
    // 讀起來是機械的；阻尼係數也必須跟著 dt 換算，否則 120Hz 螢幕的
    // 收斂速度會是 60Hz 的兩倍。
    const damp = 1 - Math.pow(0.0015, dt);
    pointer.x += (pointer.tx - pointer.x) * damp;
    pointer.y += (pointer.ty - pointer.y) * damp;

    // 機位以照片中心為圓心。兩個不同週期的正弦當手持晃動 ——
    // 幅度只有幾公分，目的是讓畫面不是完全靜止。
    const dist = fitDistance * camState.dolly;
    const sway = Math.sin(t * 0.85) * 0.03 + Math.sin(t * 0.31) * 0.018;
    const bob = Math.sin(t * 0.62) * 0.028;

    const swing = camState.swing + pointer.x * 0.05 + sway * 0.35;
    camera.position.set(
      Math.sin(swing) * dist,
      camState.lift + bob - pointer.y * 0.12,
      Math.cos(swing) * dist
    );
    camera.lookAt(0, camState.lift * 0.25, 0);
    camera.rotateZ(camState.roll + sway * 0.06);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  return {
    /** 跳到最後一格。開啟「減少動態效果」時由 pages/scene.js 直接呼叫。 */
    skipToEnd() {
      tl.progress(1);
      uniforms.uAssemble.value = 1;
      uniforms.uReveal.value = 1;
      uniforms.uGlyphMix.value = 1;
      uniforms.uColorMix.value = 1;
      uniforms.uRelief.value = 0;
      scrimMat.opacity = 0.88;
      heartDraw.progress = 1;
      heartMaterial.opacity = 0.92;
      glowMaterial.opacity = 0.3;
      camState.dolly = 1;
      camState.swing = -0.05;
      camState.lift = 0;
      camState.roll = 0;
      rain.setIntensity(0.1);
    },
    dispose() {
      disposed = true;
      tl.kill();
      rain.destroy();
      window.removeEventListener('resize', resize);
      container.removeEventListener('mousemove', handlePointerMove);
      if (cloud) {
        cloud.geometry.dispose();
        cloud.material.dispose();
      }
      atlas.texture.dispose();
      heartGeometry.dispose();
      heartMaterial.dispose();
      glowGeometry.dispose();
      glowMaterial.dispose();
      glowTexture.dispose();
      scrimGeo.dispose();
      scrimMat.dispose();
      scrimTexture.dispose();
      renderer.dispose();
      if (rainCanvas.parentNode) rainCanvas.parentNode.removeChild(rainCanvas);
      if (glCanvas.parentNode) glCanvas.parentNode.removeChild(glCanvas);
    },
  };
}
