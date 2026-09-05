import * as THREE from 'three';
// GSAP 只取 core：這兩段動畫補間的都是純 JS 物件（uniform、material、
// Object3D 的位置與縮放），完全沒有碰 DOM 樣式，所以用不到預設進入點會
// 一併帶進來的 CSSPlugin。power / back 這些 ease 本來就在 core 裡。
import gsap from 'gsap/gsap-core';
import { createPrintedPortraitTexture } from '../utils/printedPortrait.js';

/**
 * 女方賓客動畫 —— 印刷廠：CMYK 四色印出合照
 *
 * 全長 4.6 秒，沒有任何文字說明：
 *   0.0s 紙從畫面外翻著飛進來，鏡頭在低處、偏側面
 *   0.8s 四支滾輪接連刷過（青→洋紅→黃→黑），刷過的地方才有墨
 *   2.5s 成品浮起、暖光暈開，鏡頭同時繞到正面並推近
 *
 * 顏色不是用「淡入」硬疊的，而是照真正的減色法混色：
 * 先把照片分解成 CMYK 四個色版，紙面從白開始，每道墨吸掉對應的波長。
 * 所以只刷青色時畫面是青色調的，疊上洋紅後轉紫，再加黃才回到膚色 ——
 * 這正是印刷疊印該有的樣子。
 *
 * 這一版重寫的是「質感」，核心的四色疊印沒有動：
 *   - 紙不再是一塊平板：頂點著色器上有行進波，紙面自己會抖、會捲，
 *     而且法線是解析算出來的，光打上去有真正的明暗起伏
 *   - 場景給了環境貼圖與 ACES 色調映射，滾輪才有金屬與濕墨的反射，
 *     不然 MeshStandardMaterial 在只有平行光的場景裡一定是塑膠感
 *   - 鏡頭全程都在繞著紙走（球座標的方位角／仰角／距離同時補間），
 *     紙也不再是固定角度正對鏡頭，而是斜著的四分之三角度
 *
 * @param {HTMLElement} container
 * @param {{ onProgress:(pct:number)=>void, onReady:()=>void, photo?:HTMLImageElement }} callbacks
 */
export function createBrideScene(container, { onProgress, onReady, photo } = {}) {
  const noop = () => {};
  onProgress = onProgress || noop;
  onReady = onReady || noop;

  const glCanvas = document.createElement('canvas');
  glCanvas.style.position = 'absolute';
  glCanvas.style.inset = '0';
  container.appendChild(glCanvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 100);

  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  // 沒有色調映射時，高光會直接夾在 1.0 變成一塊死白，塑膠感有一半來自這裡。
  // ACES 會把高光滾進去，金屬與濕墨的反光才有層次。
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

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
    g.addColorStop(0, '#fbeee4');
    g.addColorStop(0.42, '#f3ddd2');
    g.addColorStop(0.75, '#e6c3bd');
    g.addColorStop(1, '#cf9d9c');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 512);
    const t = track(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  scene.background = createBackdrop();

  // ---------- 環境貼圖 ----------
  // 一張手繪的等距長方投影：上半是柔和的棚燈，中間橫過一條亮帶（當作
  // 廠房的長條燈管），下半收暗。滾輪的金屬與清漆層靠它才有東西可以反射
  // —— 只有平行光的話，反射計算幾乎沒有輸入，再怎麼調參數都是塑膠。
  function createEnvironment() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const x = c.getContext('2d');

    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#fff6ec');
    g.addColorStop(0.45, '#f0d9cf');
    g.addColorStop(0.7, '#c9a49f');
    g.addColorStop(1, '#4a3a38');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 128);

    // 長條燈管：反射到滾輪上就是那道會跟著滾動跑的亮線
    const strip = x.createLinearGradient(0, 26, 0, 46);
    strip.addColorStop(0, 'rgba(255,255,255,0)');
    strip.addColorStop(0.5, 'rgba(255,250,240,1)');
    strip.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = strip;
    x.fillRect(0, 26, 256, 20);

    // 幾盞暖色點光源，讓反射不是一片均勻
    [
      [46, 70, 26],
      [150, 58, 20],
      [214, 82, 30],
    ].forEach(([cx, cy, r]) => {
      const p = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      p.addColorStop(0, 'rgba(255,236,206,0.85)');
      p.addColorStop(1, 'rgba(255,236,206,0)');
      x.fillStyle = p;
      x.fillRect(cx - r, cy - r, r * 2, r * 2);
    });

    const t = track(new THREE.CanvasTexture(c));
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  scene.environment = createEnvironment();

  // ---------- 燈光 ----------
  // 環境光刻意壓低。前一版是 0.85，等於把每個面都填到差不多亮，
  // 立體感全被洗掉 —— 這就是「打光很平」的來源。
  // 現在改成低環境 + 一盞明確的主光 + 一盞冷色補光 + 一盞背後的輪廓光。
  scene.add(new THREE.AmbientLight(0xfff3e8, 0.22));

  const keyLight = new THREE.DirectionalLight(0xfff1de, 2.6);
  keyLight.position.set(3.2, 4.6, 5.2);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xcfe0ff, 0.5);
  fillLight.position.set(-5, -1.5, 3);
  scene.add(fillLight);

  // 輪廓光：從紙的後上方打過來，把紙的邊緣從背景裡切出來
  const rimLight = new THREE.DirectionalLight(0xffd9c0, 1.6);
  rimLight.position.set(-2.4, 2.2, -4.5);
  scene.add(rimLight);

  const haloLight = new THREE.PointLight(0xffe2c0, 0, 14, 2);
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
    uTime: { value: 0 },
    // 紙的抖動幅度：剛飛進來時大，落定後留一點點，成品浮起時再收小
    uFlutter: { value: 1.6 },
    uLightDir: { value: new THREE.Vector3(3.2, 4.6, 5.2).normalize() },
  };

  const sheetMat = track(
    new THREE.ShaderMaterial({
      uniforms: sheetUniforms,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uFlutter;
        uniform vec3 uLightDir;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vLight;

        void main() {
          vUv = uv;

          // 兩道方向不同的行進波疊在一起。單一道波看起來像旗子，
          // 兩道錯開才像一張被氣流帶著走的紙。
          float ax = 0.052 * uFlutter;
          float ay = 0.038 * uFlutter;
          float kx = 2.6;
          float ky = 1.7;
          float px = position.x * kx + uTime * 2.1;
          float py = position.y * ky - uTime * 1.45;
          float z = sin(px) * ax + sin(py) * ay;

          // 法線用解析偏微分算，不用 computeVertexNormals ——
          // 每一幀重算整份幾何太慢，而且這裡本來就有解析式可以微分
          vec3 n = normalize(vec3(-cos(px) * kx * ax, -cos(py) * ky * ay, 1.0));

          vec4 mv = modelViewMatrix * vec4(position.x, position.y, position.z + z, 1.0);
          vNormal = normalize(normalMatrix * n);
          vView = normalize(-mv.xyz);
          vLight = normalize((viewMatrix * vec4(uLightDir, 0.0)).xyz);

          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uPhoto;
        uniform vec4 uPass;
        uniform float uSpread;
        uniform float uUcr;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vLight;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        // 單一道色版在這個位置的著墨量：刷過去的地方全滿，
        // 滾輪正前方用網點抖動做出「墨剛壓上去」的顆粒邊緣
        float coverage(float pass, float u, vec2 cell, float seed) {
          float solid = smoothstep(0.0, uSpread, pass - u);
          float n = hash(cell + seed);
          // 乘上 step(0.001, solid)：完全還沒刷到的地方一定是 0。
          // 少了這一項，hash 剛好等於 0 的格子會在整張紙上散出單格彩點。
          return step(n, solid) * step(0.001, solid);
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
          vec3 col = vec3(0.995, 0.982, 0.952);
          col.r *= 1.0 - ink.r * cC;
          col.g *= 1.0 - ink.g * cM;
          col.b *= 1.0 - ink.b * cY;
          col *= 1.0 - K * cK;

          // ---- 打光 ----
          // 紙很薄，光會透過去，所以漫射用「包覆式」而不是硬切在 90 度：
          // 背光面不會直接死黑，只是暗一階，這是紙該有的樣子。
          vec3 N = gl_FrontFacing ? normalize(vNormal) : -normalize(vNormal);
          vec3 L = normalize(vLight);
          vec3 V = normalize(vView);
          float wrap = dot(N, L) * 0.5 + 0.5;
          float diff = 0.66 + 0.62 * wrap * wrap;

          // 紙面的微弱光澤。銅版紙不是全霧面，掠角上會有一條淡淡的反光，
          // 剛好也讓紙抖動時的起伏看得出來。
          vec3 H = normalize(L + V);
          float spec = pow(clamp(dot(N, H), 0.0, 1.0), 46.0) * 0.16;

          // 紙纖維：極細的顆粒，避免大面積留白看起來像一塊乾淨的塑膠
          float fiber = hash(floor(vUv * vec2(1400.0, 1800.0))) * 0.035 - 0.015;

          // 滾輪的接觸陰影：每一道正在推進的色版，在它的著墨邊界壓一條暗痕。
          // 這條陰影是把滾輪「黏」在紙上的關鍵 —— 少了它，滾輪就只是一根
          // 浮在紙前面的管子。
          float shade = 0.0;
          shade = max(shade, smoothstep(0.10, 0.0, abs(uPass.x - vUv.x)) * step(-0.1, uPass.x) * step(uPass.x, 1.15));
          shade = max(shade, smoothstep(0.10, 0.0, abs(uPass.y - vUv.x)) * step(-0.1, uPass.y) * step(uPass.y, 1.15));
          shade = max(shade, smoothstep(0.10, 0.0, abs(uPass.z - vUv.x)) * step(-0.1, uPass.z) * step(uPass.z, 1.15));
          shade = max(shade, smoothstep(0.10, 0.0, abs(uPass.w - vUv.x)) * step(-0.1, uPass.w) * step(uPass.w, 1.15));

          gl_FragColor = vec4((col * diff + spec + fiber) * (1.0 - shade * 0.32), 1.0);
        }
      `,
    })
  );

  const sheet = new THREE.Mesh(track(new THREE.PlaneGeometry(SHEET_W, SHEET_H, 48, 48)), sheetMat);
  // 紙的基準姿態由時間軸補間，實際 rotation 每一幀再疊上晃動（見 render loop）
  const sheetBase = { rx: 0.42, ry: -0.92, rz: 0.34 };
  sheet.position.set(-2.6, -1.8, -2.4);
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
    // 油墨的顏色比印刷色票深一階：滾輪上那層是「濕的濃墨」，
    // 用色票的亮度加上清漆反光會變成糖果塑膠管。
    { key: 'c', color: 0x00587c, label: 'CYAN' },
    { key: 'm', color: 0x7d0046, label: 'MAGENTA' },
    { key: 'y', color: 0x9c7200, label: 'YELLOW' },
    { key: 'k', color: 0x100f0c, label: 'BLACK' },
  ];

  const ROLLER_R = 0.105;
  const rollerGeo = track(new THREE.CylinderGeometry(ROLLER_R, ROLLER_R, SHEET_H + 0.34, 40));
  const axleGeo = track(new THREE.CylinderGeometry(0.035, 0.035, SHEET_H + 0.85, 12));
  const capGeo = track(new THREE.CylinderGeometry(0.058, 0.058, 0.12, 16));

  const rollers = INKS.map((ink) => {
    const group = new THREE.Group();

    // 滾輪是「沾滿油墨的橡膠輥」：本體霧面（墨吃光），
    // 上面再蓋一層清漆當作濕墨的反光。單用 Standard 調高光澤只會像塑膠，
    // clearcoat 才是「一層濕的東西蓋在霧面上」。
    const mat = track(
      new THREE.MeshPhysicalMaterial({
        color: ink.color,
        roughness: 0.62,
        metalness: 0.0,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
        envMapIntensity: 0.75,
        transparent: true,
        opacity: 0,
      })
    );
    const drum = new THREE.Mesh(rollerGeo, mat);
    group.add(drum);

    // 軸心是拋光金屬，靠環境貼圖才看得出是金屬
    const axleMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xb9b3ab,
        roughness: 0.3,
        metalness: 1.0,
        envMapIntensity: 0.9,
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
    group.position.set(-SHEET_W / 2, 0, ROLLER_R + 0.008);
    group.visible = false;
    // 滾輪掛在紙底下：紙轉到哪個角度，滾輪就跟著貼在紙面上，
    // 不會出現「紙斜了、滾輪還直挺挺地站在世界座標裡」
    sheet.add(group);

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
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const petalGeo = track(new THREE.PlaneGeometry(0.3, 0.44));
  const petals = [];
  for (let i = 0; i < 28; i++) {
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
  const BOKEH = 64;
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
        size: 0.42,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      })
    )
  );
  scene.add(bokeh);

  // ---------- 取景 ----------
  // fitCamera 只算「紙剛好裝得下」的距離，實際機位由 camState 以它為基準
  // 推算，所以轉到螢幕方向或改視窗大小都不會打斷運鏡。
  let fitDistance = 6.4;
  function fitCamera() {
    const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    const distH = (SHEET_H * 1.3) / 2 / Math.tan(halfFov);
    const distW = (SHEET_W * 1.5) / 2 / (Math.tan(halfFov) * camera.aspect);
    fitDistance = Math.max(distH, distW);
  }

  // 鏡頭狀態（球座標）：az 方位角、el 仰角、dist 距離倍率、
  // targetY 看向的高度、roll 鏡頭自身傾斜
  const camState = { az: 0.44, el: -0.16, dist: 1.34, targetY: -0.28, roll: 0.05 };

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

  // 1) 紙翻著飛進畫面。位置與旋轉用不同長度的 ease，落定時才有「甩過頭
  //    再收回來」的手感，而不是兩軸同時到位的機器動作。
  tl.to(sheet.position, { x: 0, y: -0.05, z: 0, duration: 1.0, ease: 'power3.out' }, 0)
    .to(sheetBase, { rx: 0.07, ry: -0.26, rz: 0.02, duration: 1.25, ease: 'power2.out' }, 0)
    .to(sheetUniforms.uFlutter, { value: 0.62, duration: 1.3, ease: 'power2.out' }, 0);

  // 2) 四道色版接連刷過。刻意重疊：真的印刷機也是四個色座同時在跑，
  //    而且四道各等一輪的話光這段就要八秒。
  const PASS_START = 0.7;
  // 間隔比單道的行程長，畫面上最多同時兩支滾輪 —— 四支一起跑的話
  // 照片整段都被管子擋著，等於印了半天什麼也沒看到。
  const PASS_GAP = 0.46;
  const PASS_DUR = 0.62;

  INKS.forEach((ink, i) => {
    const at = PASS_START + i * PASS_GAP;
    const roller = rollers[i];

    tl.call(
      () => {
        roller.group.visible = true;
      },
      [],
      at - 0.18
    )
      .to([roller.mat, roller.axleMat], { opacity: 1, duration: 0.22 }, at - 0.18)
      .to(passes, { [ink.key]: 1.2, duration: PASS_DUR, ease: 'none' }, at)
      .to([roller.mat, roller.axleMat], { opacity: 0, duration: 0.28 }, at + PASS_DUR)
      .call(
        () => {
          roller.group.visible = false;
        },
        [],
        at + PASS_DUR + 0.28
      );
  });

  // 3) 成品浮起、暖光暈開、紙轉正面對鏡頭
  const FINISH = PASS_START + PASS_GAP * 3 + PASS_DUR * 0.72;
  tl.to(sheet.position, { y: 0.16, duration: 1.5, ease: 'power2.out' }, FINISH)
    .to(sheetBase, { rx: 0.01, ry: -0.07, rz: 0, duration: 1.6, ease: 'power2.inOut' }, FINISH)
    .to(sheetUniforms.uFlutter, { value: 0.3, duration: 1.6, ease: 'power2.out' }, FINISH)
    .to(haloMat, { opacity: 0.9, duration: 1.2, ease: 'power1.out' }, FINISH)
    .to(haloLight, { intensity: 2.2, duration: 1.2, ease: 'power1.out' }, FINISH);

  // 4) 鏡頭：整段都在走。從低處側面繞到正面、同時推近，
  //    最後 0.6 秒還在慢慢靠近 —— 那個「還沒停」就是收尾的呼吸。
  tl.to(camState, { az: 0.06, duration: 4.2, ease: 'power2.inOut' }, 0)
    .to(camState, { el: 0.05, duration: 4.2, ease: 'power2.inOut' }, 0)
    .to(camState, { dist: 0.98, duration: 3.4, ease: 'power2.out' }, 0)
    .to(camState, { dist: 0.94, duration: 1.2, ease: 'power1.inOut' }, 3.4)
    .to(camState, { targetY: 0.06, duration: 3.6, ease: 'power2.inOut' }, 0)
    .to(camState, { roll: 0, duration: 3.0, ease: 'power1.inOut' }, 0.3)
    .call(() => onReady(), [], 4.6);

  // ---------- Render Loop ----------
  let lastTime = 0;
  function animate(now) {
    if (disposed) return;
    const t = clock.getElapsedTime();
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;

    // 把四道推進值送進 shader
    sheetUniforms.uPass.value.set(passes.c, passes.m, passes.y, passes.k);
    sheetUniforms.uTime.value = t;

    // 紙的姿態＝時間軸給的基準 + 一直都在的微幅晃動。
    // 兩個週期不同的正弦，讓它讀起來像被氣流托著，而不是停在某個角度。
    const idle = sheetUniforms.uFlutter.value;
    sheet.rotation.set(
      sheetBase.rx + Math.sin(t * 0.72) * 0.035 * idle,
      sheetBase.ry + Math.sin(t * 0.53 + 1.1) * 0.075 * idle,
      sheetBase.rz + Math.sin(t * 0.41 + 2.2) * 0.02 * idle
    );

    // 滾輪位置直接由該色版的推進值換算，滾輪與著墨邊界永遠對得上。
    // 座標是紙的區域座標（滾輪掛在 sheet 底下），所以紙一斜，滾輪跟著斜。
    rollers.forEach((r) => {
      // 推進值的區間是 -0.2 ~ 1.2（頭尾各留一段，著墨邊界才能真的走完
      // 整張紙），但滾輪本身要夾在紙的範圍內 —— 不然待命與收尾時會看到
      // 一根管子浮在紙外面的空氣中。
      const p = Math.min(1, Math.max(0, passes[r.key]));
      const x = -SHEET_W / 2 + p * SHEET_W;
      r.group.position.x = x;
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
    halo.position.y = sheet.position.y;

    // 鏡頭繞著紙走：方位角、仰角、距離同時被時間軸推動，
    // 再疊一組極小的手持晃動。
    const sway = Math.sin(t * 0.8) * 0.012 + Math.sin(t * 0.29) * 0.008;
    const az = camState.az + sway;
    const el = camState.el + Math.sin(t * 0.63) * 0.008;
    const d = fitDistance * camState.dist;
    camera.position.set(
      Math.sin(az) * Math.cos(el) * d,
      Math.sin(el) * d + camState.targetY * 0.3,
      Math.cos(az) * Math.cos(el) * d
    );
    camera.lookAt(0, camState.targetY, 0);
    camera.rotateZ(camState.roll + sway * 0.25);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  return {
    skipToEnd() {
      tl.progress(1);
      passes.c = passes.m = passes.y = passes.k = 1.2;
      sheetUniforms.uPass.value.set(1.2, 1.2, 1.2, 1.2);
      sheetUniforms.uFlutter.value = 0.3;
      sheet.position.set(0, 0.16, 0);
      sheetBase.rx = 0.01;
      sheetBase.ry = -0.07;
      sheetBase.rz = 0;
      rollers.forEach((r) => (r.group.visible = false));
      haloMat.opacity = 0.9;
      haloLight.intensity = 2.2;
      camState.az = 0.06;
      camState.el = 0.05;
      camState.dist = 0.94;
      camState.targetY = 0.06;
      camState.roll = 0;
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
