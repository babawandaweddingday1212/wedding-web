import * as THREE from 'three';
// GSAP 只取 core：這段動畫補間的都是純 JS 物件（uniform、material、Object3D
// 的位置與縮放），完全沒有碰 DOM 樣式，所以用不到預設進入點會一併帶進來的
// CSSPlugin。power / back 這些 ease 本來就在 core 裡。
import gsap from 'gsap/gsap-core';
import { createPrintedPortraitTexture } from '../utils/printedPortrait.js';

/**
 * 女方賓客動畫 —— 印刷廠：CMYK 四色印出合照
 *
 * 全長 4.6 秒，沒有任何文字說明：
 *   0.0s 鏡頭貼在紙面上，近到只看得見紙纖維與網點 —— 印刷放大鏡的視角
 *   0.4s 四支滾輪接連刷過，網點一顆顆長出來（青→洋紅→黃→黑）
 *   0.8s 鏡頭一路拉遠，網點自己收斂成照片
 *   2.4s 最後一道黑版故意套印不準，再喀一下對準，整張圖瞬間變銳利
 *   2.8s 紙轉成四分之三角、微微浮起，暖光暈開
 *
 * 為什麼是這個表現方式：
 * 舊版是「整張紙從頭到尾平擺在畫面中央被刷四道」—— 資訊都對，但看起來
 * 像投影片。這一版把印刷這件事最迷人的兩個瞬間放大：
 *   1. 網點。四色網屏各自有固定角度（青 15°、洋紅 75°、黃 0°、黑 45°），
 *      疊在一起會長出玫瑰紋。那是印刷品在放大鏡下的樣子，一看就知道是印的。
 *      鏡頭從貼著紙面拉遠，網點不用做任何事就會自己收斂成照片。
 *   2. 套印。四個色版對不準時邊緣會出現彩色重影，對準的那一下整張圖會
 *      「喀」地變銳利 —— 印刷廠每天在追的就是那一下。
 *
 * 顏色仍然是真正的減色法混色：照片先分成 CMYK 四個色版，紙面從白開始，
 * 每道墨吸掉對應的波長。只刷青色時畫面是青色調，疊上洋紅後轉紫，
 * 再加黃才回到膚色。
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
  const camera = new THREE.PerspectiveCamera(46, 1, 0.02, 100);

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
  // 一張手繪的等距長方投影：上半是柔和的棚燈，中間橫過一條亮帶（廠房的
  // 長條燈管），下半收暗。滾輪的金屬與清漆層靠它才有東西可以反射 ——
  // 只有平行光的話，反射計算幾乎沒有輸入，再怎麼調參數都是塑膠。
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

    const strip = x.createLinearGradient(0, 26, 0, 46);
    strip.addColorStop(0, 'rgba(255,255,255,0)');
    strip.addColorStop(0.5, 'rgba(255,250,240,1)');
    strip.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = strip;
    x.fillRect(0, 26, 256, 20);

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
  // 低環境光 + 一盞明確的主光 + 冷色補光 + 背後的輪廓光。
  // 環境光開太大（前一版 0.85）會把每個面都填到差不多亮，立體感全被洗掉。
  scene.add(new THREE.AmbientLight(0xfff3e8, 0.22));

  const keyLight = new THREE.DirectionalLight(0xfff1de, 2.6);
  keyLight.position.set(3.2, 4.6, 5.2);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xcfe0ff, 0.5);
  fillLight.position.set(-5, -1.5, 3);
  scene.add(fillLight);

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
  // 四個色版的套印偏移（UV 單位）。開場刻意對不準，之後補間回 0。
  const reg = {
    cx: -0.006, cy: 0.004,
    mx: 0.005, my: 0.005,
    yx: 0.004, yy: -0.006,
    kx: 0.014, ky: 0.009,
  };

  const sheetUniforms = {
    uPhoto: { value: printedTexture },
    uPass: { value: new THREE.Vector4(-0.2, -0.2, -0.2, -0.2) },
    // 墨在滾輪正前方堆起來的寬度。窄一點才像壓上去的，不是淡入的。
    uSpread: { value: 0.05 },
    // 去底色比例。0.75 是實際算圖比較過的結果：C/M/Y 三道都夠濃，
    // 最後一道 K 又還能明顯把深度拉回來，當作收尾最有戲。
    uUcr: { value: 0.75 },
    // 網線頻率（沿紙高的網點數）。135 在拉遠後仍看得出網紋，
    // 貼近時則是清楚的玫瑰紋 —— 這個數字就是「印刷感」的旋鈕。
    uFreq: { value: 128 },
    // 網屏強度。拉遠之後網點小於兩三個螢幕像素，硬畫下去只會跟像素格
    // 打架長出摩爾紋 —— 而真實的印刷品拿遠了本來就分辨不出網點，
    // 眼睛看到的是連續調。所以拉遠時把網屏往連續調收，只留一點顆粒。
    uScreenMix: { value: 1 },
    uAspect: { value: SHEET_W / SHEET_H },
    uRegC: { value: new THREE.Vector2() },
    uRegM: { value: new THREE.Vector2() },
    uRegY: { value: new THREE.Vector2() },
    uRegK: { value: new THREE.Vector2() },
    uTime: { value: 0 },
    uFlutter: { value: 0.55 },
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
        uniform float uFreq;
        uniform float uScreenMix;
        uniform float uAspect;
        uniform vec2 uRegC;
        uniform vec2 uRegM;
        uniform vec2 uRegY;
        uniform vec2 uRegK;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vLight;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        // RGB → CMYK 分色，採「部分去底色」（uUcr）。
        // 完全去底色（uUcr = 1）會把所有中性濃度都搬到 K，而這張合照是
        // 暖調的，青版會因此幾乎全白 —— 第一道滾輪等於白刷。保留一部分
        // 底色後四道才都看得見，K 也還留有足夠份量收尾。
        // 回傳 xyz = CMY，w = K。
        vec4 separate(vec2 uv) {
          vec3 photo = texture2D(uPhoto, clamp(uv, 0.0, 1.0)).rgb;
          float kRaw = min(1.0 - photo.r, min(1.0 - photo.g, 1.0 - photo.b));
          float K = kRaw * uUcr;
          float inv = max(1.0 - K, 0.001);
          return vec4(clamp(1.0 - photo / inv, 0.0, 1.0), K);
        }

        // 旋轉網屏上的一顆網點。
        // 每個色版有自己的網屏角度（青 15°、洋紅 75°、黃 0°、黑 45°）——
        // 那是真的印刷用的角度，四個角度錯開疊印才會長出玫瑰紋，
        // 全部同角度的話會出現大片撞網的摩爾紋。
        // 網點面積正比於濃度，所以半徑取 sqrt。
        float screenDot(float value, vec2 uv, float ang) {
          vec2 p = vec2(uv.x * uAspect, uv.y) * uFreq;
          float c = cos(ang);
          float s = sin(ang);
          vec2 r = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
          vec2 cell = fract(r) - 0.5;
          float d = length(cell) * 2.0;
          float radius = sqrt(clamp(value, 0.0, 1.0)) * 1.08;
          return smoothstep(radius, radius - 0.16, d);
        }

        // 滾輪推進到哪，墨就上到哪。邊界用一小段漸變，像墨剛被壓上去。
        float sweep(float pass, float u) {
          return smoothstep(0.0, uSpread, pass - u);
        }

        void main() {
          // 每個色版在自己的偏移位置取樣 —— 這就是套印不準的來源：
          // 四個版沒對齊時，邊緣會出現彩色重影
          vec4 sepC = separate(vUv + uRegC);
          vec4 sepM = separate(vUv + uRegM);
          vec4 sepY = separate(vUv + uRegY);
          vec4 sepK = separate(vUv + uRegK);

          float amtC = sepC.x * sweep(uPass.x, vUv.x);
          float amtM = sepM.y * sweep(uPass.y, vUv.x);
          float amtY = sepY.z * sweep(uPass.z, vUv.x);
          float amtK = sepK.w * sweep(uPass.w, vUv.x);

          // 文字與線稿不上網屏。真正的印刷只有連續調的影像會做網點，
          // 卡片上的字是實地印上去的 —— 把字也打成網點的話，小字會被
          // 網屏吃掉變成一團麻點，這裡整張卡的文案就全毀了。
          // 判斷方式：黑版濃到接近實地的地方就是線稿。
          float lineArt = smoothstep(0.80, 0.93, sepK.w);

          // 網屏 → 連續調的比例：lineArt（文字）永遠是連續調，
          // 其餘部分照 uScreenMix 決定還看得見多少網點。
          // 變數不能叫 flat —— 那是 GLSL ES 3.0 的內插修飾詞，是保留字。
          float toneFlat = max(lineArt, 1.0 - uScreenMix);

          float covC = mix(screenDot(amtC, vUv + uRegC, radians(15.0)), amtC, toneFlat);
          float covM = mix(screenDot(amtM, vUv + uRegM, radians(75.0)), amtM, toneFlat);
          float covY = mix(screenDot(amtY, vUv + uRegY, radians(0.0)), amtY, toneFlat);
          float covK = mix(screenDot(amtK, vUv + uRegK, radians(45.0)), amtK, toneFlat);

          // 減色法疊印：紙是白的，網點是實地的墨，光穿過墨層被吸掉一部分。
          //
          // 這裡用的是真實油墨的透射色，而不是「青墨把 R 乘以 0」那種理想模型。
          // 理想模型算出來的青是 #00FFFF —— 那是螢幕的螢光青，印刷機印不出來；
          // 真正的 process cyan 偏一點藍綠、亮度也低一階。四色都換成實際色票之後，
          // 疊印的結果才會是印刷品的顏色，而不是螢幕的顏色。
          const vec3 INK_C = vec3(0.00, 0.68, 0.94);
          const vec3 INK_M = vec3(0.93, 0.12, 0.55);
          const vec3 INK_Y = vec3(1.00, 0.94, 0.05);
          const vec3 INK_K = vec3(0.09, 0.09, 0.09);

          vec3 col = vec3(0.995, 0.982, 0.952);
          col *= mix(vec3(1.0), INK_C, covC);
          col *= mix(vec3(1.0), INK_M, covM);
          col *= mix(vec3(1.0), INK_Y, covY);
          col *= mix(vec3(1.0), INK_K, covK);

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

          // 紙纖維：貼近看得到的顆粒。這是開場那顆特寫的主角之一 ——
          // 沒有它，極近距離下紙面會是一塊光滑的塑膠。
          // 顆粒強度跟著網屏一起收：拉遠之後纖維本來就看不見了。
          float fiber = (hash(floor(vUv * vec2(1400.0, 1800.0))) * 0.075 - 0.032)
                        * (0.3 + 0.7 * uScreenMix);

          // 滾輪的接觸陰影：正在推進的色版在著墨邊界壓一條暗痕。
          // 這條陰影是把滾輪「黏」在紙上的關鍵。
          float shade = 0.0;
          shade = max(shade, smoothstep(0.09, 0.0, abs(uPass.x - vUv.x)) * step(-0.1, uPass.x) * step(uPass.x, 1.15));
          shade = max(shade, smoothstep(0.09, 0.0, abs(uPass.y - vUv.x)) * step(-0.1, uPass.y) * step(uPass.y, 1.15));
          shade = max(shade, smoothstep(0.09, 0.0, abs(uPass.z - vUv.x)) * step(-0.1, uPass.z) * step(uPass.z, 1.15));
          shade = max(shade, smoothstep(0.09, 0.0, abs(uPass.w - vUv.x)) * step(-0.1, uPass.w) * step(uPass.w, 1.15));

          gl_FragColor = vec4((col * diff + spec + fiber) * (1.0 - shade * 0.3), 1.0);
        }
      `,
    })
  );

  // 分段數給高一點：開場是貼著紙面的特寫，頂點波的折線在那個距離下會露餡
  const sheet = new THREE.Mesh(track(new THREE.PlaneGeometry(SHEET_W, SHEET_H, 72, 72)), sheetMat);
  // 紙的基準姿態由時間軸補間，實際 rotation 每一幀再疊上晃動（見 render loop）
  const sheetBase = { rx: 0.03, ry: -0.1, rz: 0.01 };
  sheet.position.set(0, 0, 0);
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
    { key: 'c', color: 0x00587c },
    { key: 'm', color: 0x7d0046 },
    { key: 'y', color: 0x9c7200 },
    { key: 'k', color: 0x100f0c },
  ];

  const ROLLER_R = 0.105;
  const rollerGeo = track(new THREE.CylinderGeometry(ROLLER_R, ROLLER_R, SHEET_H + 0.34, 44));
  const axleGeo = track(new THREE.CylinderGeometry(0.035, 0.035, SHEET_H + 0.85, 12));
  const capGeo = track(new THREE.CylinderGeometry(0.058, 0.058, 0.12, 16));

  const rollers = INKS.map((ink) => {
    const group = new THREE.Group();

    // 滾輪是沾滿油墨的橡膠輥：本體霧面（墨吃光），上面再蓋一層清漆當作
    // 濕墨的反光。單用 Standard 調高光澤只會像塑膠，clearcoat 才是
    // 「一層濕的東西蓋在霧面上」。
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
    p.position.set((Math.random() - 0.5) * 13, (Math.random() - 0.5) * 9, -4 + Math.random() * 5);
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
    bokehPos[i * 3 + 2] = -6 + Math.random() * 4;
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
    const distH = (SHEET_H * 1.28) / 2 / Math.tan(halfFov);
    const distW = (SHEET_W * 1.5) / 2 / (Math.tan(halfFov) * camera.aspect);
    fitDistance = Math.max(distH, distW);
  }

  // 鏡頭狀態（球座標）：az 方位角、el 仰角、dist 距離倍率、
  // targetX/Y 看向紙上的哪一點、roll 鏡頭自身傾斜。
  // 起手是貼在紙面左側的特寫（dist 0.17），那裡正好是第一道墨落下的位置。
  const camState = { az: -0.4, el: 0.16, dist: 0.21, targetX: -0.58, targetY: 0.32, roll: 0.05 };

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

  // 1) 四道色版接連刷過。刻意重疊：真的印刷機也是四個色座同時在跑，
  //    而且四道各等一輪的話光這段就要八秒。
  const PASS_START = 0.18;
  const PASS_GAP = 0.4;
  const PASS_DUR = 0.7;

  INKS.forEach((ink, i) => {
    const at = PASS_START + i * PASS_GAP;
    const roller = rollers[i];

    tl.call(
      () => {
        roller.group.visible = true;
      },
      [],
      at - 0.15
    )
      .to([roller.mat, roller.axleMat], { opacity: 1, duration: 0.2 }, at - 0.15)
      .to(passes, { [ink.key]: 1.2, duration: PASS_DUR, ease: 'none' }, at)
      .to([roller.mat, roller.axleMat], { opacity: 0, duration: 0.25 }, at + PASS_DUR)
      .call(
        () => {
          roller.group.visible = false;
        },
        [],
        at + PASS_DUR + 0.25
      );
  });

  // 2) 套印：前三道在鏡頭還很近的時候就慢慢收斂，最後一道黑版留到最後
  //    才「喀」一下對準 —— back.out 的一點過衝就是那個機械感。
  tl.to(reg, { cx: 0, cy: 0, duration: 1.4, ease: 'power2.inOut' }, 0.9)
    .to(reg, { mx: 0, my: 0, duration: 1.4, ease: 'power2.inOut' }, 1.1)
    .to(reg, { yx: 0, yy: 0, duration: 1.4, ease: 'power2.inOut' }, 1.3)
    .to(reg, { kx: 0, ky: 0, duration: 0.5, ease: 'back.out(2.4)' }, 2.45);

  // 3) 鏡頭：從貼著紙面一路拉遠到整張紙。
  //    網線頻率同時從 128 收到 300：這一步不是物理上真實的（真的印刷機
  //    網線是固定的），但畫面上要同時成立兩件事 —— 貼著看要有大到看得見
  //    玫瑰紋的網點，拉遠後又要細到能還原照片與讀得出卡片上的字。
  //    頻率的變化被藏在鏡頭運動裡，看起來就是「距離拉開，畫面自己收斂」。
  tl.to(sheetUniforms.uFreq, { value: 210, duration: 2.6, ease: 'power2.inOut' }, 0.7)
    .to(sheetUniforms.uScreenMix, { value: 0.34, duration: 2.4, ease: 'power2.inOut' }, 0.9)
    .to(camState, { dist: 0.88, duration: 2.9, ease: 'power2.inOut' }, 0.55)
    .to(camState, { dist: 0.84, duration: 1.3, ease: 'power1.inOut' }, 3.4)
    .to(camState, { az: 0.012, duration: 3.4, ease: 'power2.inOut' }, 0.3)
    .to(camState, { el: 0.02, duration: 3.4, ease: 'power2.inOut' }, 0.3)
    .to(camState, { targetX: 0, duration: 2.9, ease: 'power2.inOut' }, 0.55)
    .to(camState, { targetY: 0.04, duration: 2.9, ease: 'power2.inOut' }, 0.55)
    .to(camState, { roll: 0, duration: 2.6, ease: 'power1.inOut' }, 0.4);

  // 4) 成品浮起、轉成四分之三角、暖光暈開
  tl.to(sheet.position, { y: 0.14, duration: 1.5, ease: 'power2.out' }, 2.75)
    // 定位時正對鏡頭，不留斜角。過程中的翻轉與微幅晃動都保留，
    // 但最後停住的那個姿態是正的 —— 成品要像被端正地拿在眼前，
    // 不是斜擺在那裡。
    .to(sheetBase, { rx: 0, ry: 0, rz: 0, duration: 1.6, ease: 'power2.inOut' }, 2.75)
    .to(sheetUniforms.uFlutter, { value: 0.22, duration: 1.6, ease: 'power2.out' }, 2.75)
    .to(haloMat, { opacity: 0.9, duration: 1.2, ease: 'power1.out' }, 2.9)
    .to(haloLight, { intensity: 2.2, duration: 1.2, ease: 'power1.out' }, 2.9)
    .call(() => onReady(), [], 4.6);

  // ---------- Render Loop ----------
  let lastTime = 0;
  function animate(now) {
    if (disposed) return;
    const t = clock.getElapsedTime();
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;

    sheetUniforms.uPass.value.set(passes.c, passes.m, passes.y, passes.k);
    sheetUniforms.uTime.value = t;
    sheetUniforms.uRegC.value.set(reg.cx, reg.cy);
    sheetUniforms.uRegM.value.set(reg.mx, reg.my);
    sheetUniforms.uRegY.value.set(reg.yx, reg.yy);
    sheetUniforms.uRegK.value.set(reg.kx, reg.ky);

    // 紙的姿態＝時間軸給的基準 + 一直都在的微幅晃動。
    // 兩個週期不同的正弦，讓它讀起來像被氣流托著，而不是停在某個角度。
    const idle = sheetUniforms.uFlutter.value;
    sheet.rotation.set(
      sheetBase.rx + Math.sin(t * 0.72) * 0.035 * idle,
      sheetBase.ry + Math.sin(t * 0.53 + 1.1) * 0.075 * idle,
      sheetBase.rz + Math.sin(t * 0.41 + 2.2) * 0.02 * idle
    );

    // 滾輪位置直接由該色版的推進值換算，滾輪與著墨邊界永遠對得上。
    // 推進值的區間是 -0.2 ~ 1.2（頭尾各留一段，著墨邊界才能真的走完整張
    // 紙），但滾輪本身要夾在紙的範圍內 —— 不然待命與收尾時會看到一根
    // 管子浮在紙外面的空氣中。
    rollers.forEach((r) => {
      const p = Math.min(1, Math.max(0, passes[r.key]));
      const x = -SHEET_W / 2 + p * SHEET_W;
      r.group.position.x = x;
      // 依實際位移量換算滾動角度，看起來才像真的在滾而不是在原地轉
      const prev = lastPassX[r.key];
      if (prev !== undefined) r.drum.rotation.y += (x - prev) / ROLLER_R;
      lastPassX[r.key] = x;
    });

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
    const tx = camState.targetX * SHEET_W * 0.5;
    const ty = camState.targetY * SHEET_H * 0.5;
    camera.position.set(
      tx + Math.sin(az) * Math.cos(el) * d,
      ty + Math.sin(el) * d,
      Math.cos(az) * Math.cos(el) * d
    );
    camera.lookAt(tx, ty, 0);
    camera.rotateZ(camState.roll + sway * 0.25);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  return {
    /** 跳到最後一格。開啟「減少動態效果」時由 pages/scene.js 直接呼叫。 */
    skipToEnd() {
      tl.progress(1);
      passes.c = passes.m = passes.y = passes.k = 1.2;
      sheetUniforms.uPass.value.set(1.2, 1.2, 1.2, 1.2);
      sheetUniforms.uFlutter.value = 0.22;
      sheetUniforms.uFreq.value = 210;
      sheetUniforms.uScreenMix.value = 0.34;
      reg.cx = reg.cy = reg.mx = reg.my = reg.yx = reg.yy = reg.kx = reg.ky = 0;
      sheet.position.set(0, 0.14, 0);
      sheetBase.rx = 0;
      sheetBase.ry = 0;
      sheetBase.rz = 0;
      rollers.forEach((r) => (r.group.visible = false));
      haloMat.opacity = 0.9;
      haloLight.intensity = 2.2;
      camState.az = 0.012;
      camState.el = 0.02;
      camState.dist = 0.84;
      camState.targetX = 0;
      camState.targetY = 0.04;
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
