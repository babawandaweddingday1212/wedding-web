import * as THREE from 'three';
import gsap from 'gsap';
import { createPrintedPortraitTexture } from '../utils/printedPortrait.js';

/**
 * 女方賓客動畫 —— 四道 CMYK 滾輪
 *
 * 一張空白的紙輕輕飛進畫面，四支滾輪依序刷過：
 * 青、洋紅、黃、黑，每刷一道就疊上一層色，最後浮現完整的合照。
 *
 * 顏色不是用「淡入」硬疊的，而是照真正的減色法混色：
 * 先把照片分解成 CMYK 四個色版，紙面從白開始，每道墨吸掉對應的波長。
 * 所以只刷青色時畫面是青色調的，疊上洋紅後轉紫，再加黃才回到膚色 ——
 * 這正是印刷疊印該有的樣子。
 *
 * @param {HTMLElement} container
 * @param {{ onCaption:(text:string)=>void, onProgress:(pct:number)=>void, onReady:()=>void, photo?:HTMLImageElement }} callbacks
 */
export function createBrideScene(container, { onCaption, onProgress, onReady, photo } = {}) {
  const noop = () => {};
  onCaption = onCaption || noop;
  onProgress = onProgress || noop;
  onReady = onReady || noop;

  const glCanvas = document.createElement('canvas');
  glCanvas.style.position = 'absolute';
  glCanvas.style.inset = '0';
  container.appendChild(glCanvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
  camera.position.set(0, 0, 6.4);

  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const disposables = [];
  const track = (obj) => {
    disposables.push(obj);
    return obj;
  };

  // ---------- 背景：暖色漸層 ----------
  function createBackdrop() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 512;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#f6e4d8');
    g.addColorStop(0.42, '#f1d9cf');
    g.addColorStop(0.75, '#e8c6c0');
    g.addColorStop(1, '#d9aaa6');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 512);
    const t = track(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  scene.background = createBackdrop();

  // ---------- 燈光 ----------
  scene.add(new THREE.AmbientLight(0xfff3e8, 0.85));
  const keyLight = new THREE.DirectionalLight(0xfff0dd, 1.05);
  keyLight.position.set(3, 5, 7);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xffd9d2, 0.45);
  fillLight.position.set(-5, -2, 4);
  scene.add(fillLight);
  const haloLight = new THREE.PointLight(0xffe2c0, 0, 12, 2);
  haloLight.position.set(0, 0.4, 3.2);
  scene.add(haloLight);

  // ---------- 紙張 ----------
  const SHEET_W = 2.4;
  const SHEET_H = SHEET_W * (1180 / 900);

  const printedTexture = track(createPrintedPortraitTexture(photo, { width: 900, height: 1180 }));

  // 四道色版各自的推進位置（-0.2 = 還沒開始，1.2 = 整面刷完）
  const passes = { c: -0.2, m: -0.2, y: -0.2, k: -0.2 };
  const sheetUniforms = {
    uPhoto: { value: printedTexture },
    uPass: { value: new THREE.Vector4(-0.2, -0.2, -0.2, -0.2) },
    uSpread: { value: 0.14 },
    // 去底色比例。0.75 是實際算圖比較過的結果：C/M/Y 三道都夠濃，
    // 最後一道 K 又還能明顯把深度拉回來，當作收尾最有戲。
    uUcr: { value: 0.75 },
  };

  const sheetMat = track(
    new THREE.ShaderMaterial({
      uniforms: sheetUniforms,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uPhoto;
        uniform vec4 uPass;
        uniform float uSpread;
        uniform float uUcr;
        varying vec2 vUv;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        // 單一道色版在這個位置的著墨量：刷過去的地方全滿，
        // 滾輪正前方用網點抖動做出「墨剛壓上去」的顆粒邊緣
        float coverage(float pass, float u, vec2 cell, float seed) {
          float solid = smoothstep(0.0, uSpread, pass - u);
          float n = hash(cell + seed);
          return step(n, solid);
        }

        void main() {
          vec3 photo = texture2D(uPhoto, vUv).rgb;

          // RGB → CMYK 分色，採「部分去底色」（uUcr）。
          // 完全去底色（uUcr = 1）會把所有中性濃度都搬到 K，
          // 而這張合照是暖調的，青版會因此幾乎全白 —— 第一道滾輪等於白刷。
          // 保留一部分底色後四道才都看得見，K 也還留有足夠份量收尾。
          float kRaw = min(1.0 - photo.r, min(1.0 - photo.g, 1.0 - photo.b));
          float K = kRaw * uUcr;
          float inv = max(1.0 - K, 0.001);
          // 由 K 反推 CMY，四道刷完的結果會精確還原成原圖
          vec3 ink = clamp(1.0 - photo / inv, 0.0, 1.0);

          // 每個色版用不同的亂數種子，等同印刷的不同網屏角度，
          // 四道墨才不會全部壓在同一個點上
          vec2 cell = floor(vUv * vec2(300.0, 380.0));
          float cC = coverage(uPass.x, vUv.x, cell, 11.3);
          float cM = coverage(uPass.y, vUv.x, cell, 47.9);
          float cY = coverage(uPass.z, vUv.x, cell, 83.1);
          float cK = coverage(uPass.w, vUv.x, cell, 129.7);

          // 減色法疊印：紙是白的，每道墨各自吸掉一段波長
          vec3 col = vec3(0.98, 0.965, 0.935);
          col.r *= 1.0 - ink.r * cC;
          col.g *= 1.0 - ink.g * cM;
          col.b *= 1.0 - ink.b * cY;
          col *= 1.0 - K * cK;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );

  const sheet = new THREE.Mesh(track(new THREE.PlaneGeometry(SHEET_W, SHEET_H, 24, 24)), sheetMat);
  sheet.position.set(-5.5, 3.4, -7);
  sheet.rotation.set(0.9, -1.1, 0.5);
  scene.add(sheet);

  // 紙張後方的柔光暈，最後成品浮起時亮起
  function createHaloTexture() {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,240,215,0.95)');
    g.addColorStop(0.45, 'rgba(255,225,195,0.4)');
    g.addColorStop(1, 'rgba(255,220,190,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return track(new THREE.CanvasTexture(c));
  }
  const haloMat = track(
    new THREE.MeshBasicMaterial({
      map: createHaloTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const halo = new THREE.Mesh(track(new THREE.PlaneGeometry(SHEET_W * 3.2, SHEET_H * 2.6)), haloMat);
  halo.position.set(0, 0, -1.2);
  scene.add(halo);

  // ---------- 四支 CMYK 滾輪 ----------
  const INKS = [
    { key: 'c', color: 0x00aeef, label: 'CYAN' },
    { key: 'm', color: 0xec008c, label: 'MAGENTA' },
    { key: 'y', color: 0xffd400, label: 'YELLOW' },
    { key: 'k', color: 0x2b2b2b, label: 'BLACK' },
  ];

  const ROLLER_R = 0.17;
  const rollerGeo = track(new THREE.CylinderGeometry(ROLLER_R, ROLLER_R, SHEET_H + 0.34, 28));
  const axleGeo = track(new THREE.CylinderGeometry(0.035, 0.035, SHEET_H + 0.85, 10));
  const capGeo = track(new THREE.CylinderGeometry(0.055, 0.055, 0.1, 12));

  const rollers = INKS.map((ink) => {
    const group = new THREE.Group();

    const mat = track(
      new THREE.MeshStandardMaterial({
        color: ink.color,
        roughness: 0.45,
        metalness: 0.15,
        emissive: ink.color,
        emissiveIntensity: 0.22,
        transparent: true,
        opacity: 0,
      })
    );
    const drum = new THREE.Mesh(rollerGeo, mat);
    group.add(drum);

    const axleMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xb9b2ab,
        roughness: 0.35,
        metalness: 0.75,
        transparent: true,
        opacity: 0,
      })
    );
    const axle = new THREE.Mesh(axleGeo, axleMat);
    group.add(axle);

    [-1, 1].forEach((s) => {
      const cap = new THREE.Mesh(capGeo, axleMat);
      cap.position.y = s * (SHEET_H / 2 + 0.28);
      group.add(cap);
    });

    // 滾輪貼著紙面前方滾動
    group.position.set(-SHEET_W / 2, 0, ROLLER_R + 0.02);
    group.visible = false;
    scene.add(group);

    return { ...ink, group, drum, mat, axleMat };
  });

  // ---------- 浪漫氛圍：花瓣與光斑 ----------
  function createPetalTexture() {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const x = c.getContext('2d');
    x.translate(size / 2, size / 2);
    const g = x.createRadialGradient(0, -10, 4, 0, 0, size / 2);
    g.addColorStop(0, 'rgba(255,236,235,0.98)');
    g.addColorStop(0.55, 'rgba(233,178,175,0.92)');
    g.addColorStop(1, 'rgba(205,136,136,0.0)');
    x.fillStyle = g;
    x.beginPath();
    x.ellipse(0, 0, size * 0.22, size * 0.42, 0, 0, Math.PI * 2);
    x.fill();
    return track(new THREE.CanvasTexture(c));
  }

  const petalMat = track(
    new THREE.MeshBasicMaterial({
      map: createPetalTexture(),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const petalGeo = track(new THREE.PlaneGeometry(0.3, 0.44));
  const petals = [];
  for (let i = 0; i < 46; i++) {
    const p = new THREE.Mesh(petalGeo, petalMat);
    p.position.set((Math.random() - 0.5) * 13, (Math.random() - 0.5) * 9, -4 + Math.random() * 7);
    p.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    p.userData = {
      fall: 0.12 + Math.random() * 0.22,
      drift: (Math.random() - 0.5) * 0.28,
      spin: (Math.random() - 0.5) * 0.9,
      swirl: Math.random() * Math.PI * 2,
    };
    scene.add(p);
    petals.push(p);
  }

  // 柔焦光斑
  function createBokehTexture() {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,246,228,0.9)');
    g.addColorStop(0.6, 'rgba(255,232,205,0.35)');
    g.addColorStop(1, 'rgba(255,225,195,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return track(new THREE.CanvasTexture(c));
  }
  const BOKEH = 150;
  const bokehGeo = track(new THREE.BufferGeometry());
  const bokehPos = new Float32Array(BOKEH * 3);
  for (let i = 0; i < BOKEH; i++) {
    bokehPos[i * 3] = (Math.random() - 0.5) * 15;
    bokehPos[i * 3 + 1] = (Math.random() - 0.5) * 10;
    bokehPos[i * 3 + 2] = -6 + Math.random() * 5;
  }
  bokehGeo.setAttribute('position', new THREE.BufferAttribute(bokehPos, 3));
  const bokeh = new THREE.Points(
    bokehGeo,
    track(
      new THREE.PointsMaterial({
        map: createBokehTexture(),
        size: 0.5,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      })
    )
  );
  scene.add(bokeh);

  // ---------- 取景 ----------
  function fitCamera() {
    const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    const distH = (SHEET_H * 1.32) / 2 / Math.tan(halfFov);
    const distW = (SHEET_W * 1.5) / 2 / (Math.tan(halfFov) * camera.aspect);
    camera.position.z = Math.max(distH, distW);
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitCamera();
  }
  resize();
  window.addEventListener('resize', resize);

  const clock = new THREE.Clock();
  let disposed = false;
  const lastPassX = {};

  // ---------- 時間軸 ----------
  const tl = gsap.timeline({
    onUpdate: () => onProgress(Math.round(tl.progress() * 100)),
  });

  onCaption('一張空白的紙，等著寫下我們的故事');

  // 1) 紙張輕輕飛進畫面
  tl.to(sheet.position, { x: 0, y: 0, z: 0, duration: 2.4, ease: 'power2.out' }, 0)
    .to(sheet.rotation, { x: 0, y: 0, z: 0, duration: 2.6, ease: 'power3.out' }, 0);

  // 2) 四道色版依序刷過
  const PASS_START = 2.5;
  const PASS_GAP = 0.85;
  const PASS_DUR = 1.65;

  INKS.forEach((ink, i) => {
    const at = PASS_START + i * PASS_GAP;
    const roller = rollers[i];

    tl.call(
      () => {
        roller.group.visible = true;
      },
      [],
      at - 0.25
    )
      .to([roller.mat, roller.axleMat], { opacity: 1, duration: 0.35 }, at - 0.25)
      .to(passes, { [ink.key]: 1.2, duration: PASS_DUR, ease: 'none' }, at)
      .to([roller.mat, roller.axleMat], { opacity: 0, duration: 0.4 }, at + PASS_DUR)
      .call(
        () => {
          roller.group.visible = false;
        },
        [],
        at + PASS_DUR + 0.4
      );
  });

  tl.call(() => onCaption('第一道色 · CYAN —— 是天空的顏色'), [], PASS_START)
    .call(() => onCaption('第二道色 · MAGENTA —— 是心跳的顏色'), [], PASS_START + PASS_GAP)
    .call(() => onCaption('第三道色 · YELLOW —— 是陽光的顏色'), [], PASS_START + PASS_GAP * 2)
    .call(() => onCaption('最後一道 · BLACK —— 是回憶的輪廓'), [], PASS_START + PASS_GAP * 3);

  // 3) 成品浮起、暖光暈開
  const FINISH = PASS_START + PASS_GAP * 3 + PASS_DUR + 0.5;
  tl.to(sheet.position, { y: 0.22, duration: 2.2, ease: 'power2.out' }, FINISH)
    .to(haloMat, { opacity: 0.9, duration: 1.6, ease: 'power1.out' }, FINISH)
    .to(haloLight, { intensity: 1.8, duration: 1.6, ease: 'power1.out' }, FINISH)
    .call(() => onCaption('我們的故事，完整了 ♥'), [], FINISH + 0.6)
    .call(() => onReady(), [], FINISH + 2.2);

  // ---------- Render Loop ----------
  let lastTime = 0;
  function animate(now) {
    if (disposed) return;
    const t = clock.getElapsedTime();
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;

    // 把四道推進值送進 shader
    sheetUniforms.uPass.value.set(passes.c, passes.m, passes.y, passes.k);

    // 滾輪位置直接由該色版的推進值換算，滾輪與著墨邊界永遠對得上
    rollers.forEach((r) => {
      const p = passes[r.key];
      const x = -SHEET_W / 2 + p * SHEET_W;
      r.group.position.x = x;
      r.group.position.y = sheet.position.y;
      // 依實際位移量換算滾動角度，看起來才像真的在滾而不是在原地轉
      const prev = lastPassX[r.key];
      if (prev !== undefined) r.drum.rotation.y += (x - prev) / ROLLER_R;
      lastPassX[r.key] = x;
    });

    // 花瓣飄落
    petals.forEach((p) => {
      const d = p.userData;
      p.position.y -= d.fall * dt;
      p.position.x += Math.sin(t * 0.6 + d.swirl) * d.drift * dt;
      p.rotation.z += d.spin * dt;
      p.rotation.y += d.spin * 0.6 * dt;
      if (p.position.y < -5) {
        p.position.y = 5;
        p.position.x = (Math.random() - 0.5) * 13;
      }
    });

    bokeh.rotation.z = t * 0.012;

    // 紙張的呼吸感，避免看起來像貼在畫面上的圖片
    sheet.rotation.y = Math.sin(t * 0.5) * 0.05;
    sheet.rotation.x = Math.sin(t * 0.38) * 0.03;
    halo.position.y = sheet.position.y;

    camera.lookAt(0, sheet.position.y * 0.5, 0);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  return {
    skipToEnd() {
      tl.progress(1);
      passes.c = passes.m = passes.y = passes.k = 1.2;
      sheetUniforms.uPass.value.set(1.2, 1.2, 1.2, 1.2);
      sheet.position.set(0, 0.22, 0);
      sheet.rotation.set(0, 0, 0);
      rollers.forEach((r) => (r.group.visible = false));
      haloMat.opacity = 0.9;
      haloLight.intensity = 1.8;
    },
    dispose() {
      disposed = true;
      tl.kill();
      window.removeEventListener('resize', resize);
      disposables.forEach((d) => d.dispose && d.dispose());
      renderer.dispose();
      if (glCanvas.parentNode) glCanvas.parentNode.removeChild(glCanvas);
    },
  };
}