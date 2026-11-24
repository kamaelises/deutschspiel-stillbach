// Код (анимации/свет) 24.11 — «сок» мира поверх сцен Yard/Welt (чужие файлы не правит: только events.on('create'), как time_fx/light/anim).
// Всё пиксельное: текстуры рисуются по 1 пикселю арта, на экран x3, позиции на сетке 3 px, движение шагами по 1 пикселю арта, яркость — ступенями.
// 1) Ночь: окна домов Stillbach светятся (маска стёкол из пикселей town_bg: style_pick/fx/build_fx.py -> assets_v3/fx/win_glow.png)
//    и бросают ступенчатое пятно света на землю; свет мерцает ступенями (не плавно).
// 2) День: тени облаков медленно плывут по миру (Yard, Welt); дым из труб (Yard); бабочки (весна/лето); птицы пролетают.
// 3) Ночь (не зима): светлячки. Шаги Max — пыль. 4) Погода по календарю: дождь (с брызгами и затемнением), утренний туман.
//    Отладка: ?weather=rain|fog|clear. 5) «Weniger Animation» / prefers-reduced-motion (AnimFX.less()): всё стоит, частиц нет, свет окон без мерцания.
// API: FX.stats(sc), FX.weather(date).
(function () {
  if (!window.WorldTime || /[?&]nofx=1/.test(location.search)) return;
  const WT = window.WorldTime, OUT = { Yard: 1, Welt: 1 }, BASE = 'assets_v3/fx/';
  const OD = () => (window.TimeFX ? TimeFX.OVER_D : 20000);
  const less = () => !!(window.AnimFX && AnimFX.less());
  // ---- 6) «сок» интерфейса (CSS): кнопка с отжимом на 3 px, тост-слово выпрыгивает пружинкой (ступенями), шторка при смене сцены.
  //      Свойства translate/scale не трогают transform элементов (тост центрируется transform'ом). «Weniger Animation» гасит всё (body.lessAnim, anim.js).
  const css = document.createElement('style'); css.id = 'fxCss';
  css.textContent = `#ui .ui-btn:active,#ui button.ui:active{translate:0 3px;filter:brightness(.92)}
    #toast{animation:fxPop .32s steps(2,end) 1}
    @keyframes fxPop{0%{scale:.6}35%{scale:1.14}70%{scale:.96}100%{scale:1}}
    #fxCurtain{position:fixed;inset:0;z-index:50;pointer-events:none;display:none;background:
      repeating-linear-gradient(90deg,#1d130b 0 24px,#2a1c10 24px 48px);animation:fxCurt .36s steps(6,end) 1 forwards}
    @keyframes fxCurt{from{clip-path:inset(0 0 0 0)}to{clip-path:inset(0 0 100% 0)}}
    body.lessAnim #fxCurtain{display:none!important}`;
  document.head.appendChild(css);
  function curtain() {                                              // шторка поднимается 6 ступенями (пиксельные полосы), потом исчезает
    if (document.body.classList.contains('lessAnim')) return; let c = document.getElementById('fxCurtain');
    if (!c) { c = document.createElement('div'); c.id = 'fxCurtain'; document.body.appendChild(c); }
    c.style.display = 'none'; void c.offsetWidth; c.style.display = 'block'; clearTimeout(curtain.t); curtain.t = setTimeout(() => { c.style.display = 'none'; }, 400);
  }
  const S3 = v => Math.round(v / 3) * 3, rnd = (a, b) => a + Math.random() * (b - a), clamp = v => Math.max(0, Math.min(1, v));
  const darkK = sc => clamp((0.8 - (sc.__tfx ? sc.__tfx.L : 1)) / 0.5);          // 0 днём .. 1 ночью
  function tex(sc, key, w, h, draw) {
    if (sc.textures.exists(key)) return key; const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; draw(g, (c, x, y, ww, hh) => { g.fillStyle = c; g.fillRect(x, y, ww || 1, hh || 1); });
    sc.textures.addCanvas(key, cv); return key;
  }
  const inView = (sc, x, y, m) => { const v = sc.cameras.main.worldView; return x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m; };
  // ---- погода по календарю: детерминированно по дате (у всех одинаково), дождь — часы дня, туман — утро
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  const RAIN_P = { fruehling: 0.32, sommer: 0.18, herbst: 0.4, winter: 0 }, FOG_P = { fruehling: 0.25, sommer: 0.1, herbst: 0.5, winter: 0.4 };
  function weather(date) {
    const q = (location.search.match(/[?&]weather=(\w+)/) || [])[1]; if (q) return q;
    const d = date || WT.now().date, day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, se = WT.seasonOf ? WT.seasonOf(d) : WT.now().season, h = d.getHours();
    const r = hash(day + 'r'), from = 9 + Math.floor(hash(day + 'f') * 8);
    if (r < (RAIN_P[se] || 0) && h >= from && h < from + 3 + Math.floor(hash(day + 'l') * 4)) return 'rain';
    if (hash(day + 'n') < (FOG_P[se] || 0) && h >= 5 && h < 9) return 'fog';
    return 'clear';
  }
  // ---- текстуры
  function texes(sc) {
    tex(sc, 'fx_ff', 1, 1, (g, p) => p('#e9ff7a', 0, 0));
    tex(sc, 'fx_ff2', 3, 3, (g, p) => { p('rgba(200,255,90,0.45)', 1, 0, 1, 3); p('rgba(200,255,90,0.45)', 0, 1, 3, 1); p('#f4ffb0', 1, 1); });
    [1, 2, 3].forEach(k => tex(sc, 'fx_puff' + k, k + 2, k + 1, (g, p) => { p('rgba(226,226,232,0.9)', 1, 0, k, k + 1); p('rgba(226,226,232,0.9)', 0, 1, k + 2, k - 1 || 1); p('rgba(255,255,255,0.9)', 1, 0, 1, 1); }));
    tex(sc, 'fx_dust', 4, 2, (g, p) => { p('rgba(214,196,160,0.75)', 1, 0, 2, 1); p('rgba(214,196,160,0.55)', 0, 1, 4, 1); });
    tex(sc, 'fx_drop', 1, 4, (g, p) => { p('rgba(200,222,246,0.55)', 0, 0, 1, 1); p('rgba(222,236,252,0.9)', 0, 1, 1, 3); });
    tex(sc, 'fx_spl', 3, 2, (g, p) => { p('rgba(222,236,252,0.85)', 0, 0); p('rgba(222,236,252,0.85)', 2, 0); p('rgba(222,236,252,0.5)', 1, 1); });
    tex(sc, 'fx_bird0', 5, 2, (g, p) => { p('#2b2633', 0, 0); p('#2b2633', 1, 1); p('#2b2633', 2, 1); p('#2b2633', 3, 1); p('#2b2633', 4, 0); });
    tex(sc, 'fx_bird1', 5, 2, (g, p) => { p('#2b2633', 0, 1); p('#2b2633', 1, 0); p('#2b2633', 2, 1); p('#2b2633', 3, 0); p('#2b2633', 4, 1); });
    const BF = [['#fff7d6', '#e8c860'], ['#ffb347', '#c86a1c'], ['#c9e4ff', '#6f8fd0']];
    BF.forEach(([a, b], i) => { // бабочка 5x4: крылья раскрыты / сложены (тело 1 px тёмное)
      tex(sc, `fx_bf${i}a`, 5, 4, (g, p) => { p(a, 0, 0, 2, 2); p(a, 3, 0, 2, 2); p(b, 0, 2, 2, 1); p(b, 3, 2, 2, 1); p('#3a2a22', 2, 0, 1, 4); });
      tex(sc, `fx_bf${i}b`, 5, 4, (g, p) => { p(a, 1, 0, 1, 2); p(a, 3, 0, 1, 2); p(b, 1, 2, 1, 1); p(b, 3, 2, 1, 1); p('#3a2a22', 2, 0, 1, 4); });
    });
    tex(sc, 'fx_cloud', 64, 30, (g, p) => {                       // тень облака: объединение кругов, край — ступень светлее, без размытия
      const C = [[16, 17, 11], [30, 12, 12], [44, 16, 12], [54, 20, 8], [24, 21, 9], [38, 21, 10]];
      for (let y = 0; y < 30; y++) for (let x = 0; x < 64; x++) {
        const d = Math.min(...C.map(([cx, cy, r]) => Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.25) - r));
        if (d < -3) p('rgba(18,30,48,0.13)', x, y); else if (d < 0) p('rgba(18,30,48,0.07)', x, y);
      }
    });
    tex(sc, 'fx_fog', 96, 12, (g, p) => {                         // полоса тумана: 3 ступени плотности, рваный пиксельный край
      for (let x = 0; x < 96; x++) { const t = 3 + Math.round(2 * Math.sin(x * 0.31) + Math.sin(x * 0.11 + 1)), b = 9 + Math.round(1.5 * Math.sin(x * 0.23 + 2));
        for (let y = 0; y < 12; y++) { if (y < t || y > b) continue; const m = Math.min(y - t, b - y); p(m >= 2 ? 'rgba(236,240,246,0.30)' : m >= 1 ? 'rgba(236,240,246,0.2)' : 'rgba(236,240,246,0.1)', x, y); } }
    });
  }
  function poolTex(sc, w) {                                         // пятно света на земле: плоский эллипс, 3 ступени
    w = Math.max(8, Math.round(w / 3)); const h = Math.max(4, Math.round(w * 0.42)), key = `fx_pool_${w}`;
    return tex(sc, key, w, h, (g, p) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2)); if (d > 1) continue;
      p(d < 0.45 ? 'rgba(255,196,110,0.42)' : d < 0.75 ? 'rgba(255,170,80,0.24)' : 'rgba(230,140,60,0.11)', x, y); } });
  }
  // ---- 1) окна ночью + пятна света на земле (Yard)
  function setupWindows(sc, F) {
    const J = sc.cache.json.get('fx_meta'); if (!J || !sc.textures.exists('fx_win')) return;
    // маска окон — кусками по домам (кадры той же текстуры), а не картинкой на весь мир: меньше заливки на кадр (телефон)
    const T = sc.cache.json.get('town') || {}, tx = sc.textures.get('fx_win'), boxes = (T.houses || []).filter(h => !h.plot).map(h => h.box).concat(Object.values(T.buildings || {}).map(b => b.box));
    F.wins = boxes.map((b, i) => { const f = 'wb' + i, x0 = Math.floor(b[0] / 3), y0 = Math.floor(b[1] / 3); if (!tx.has(f)) tx.add(f, 0, x0, y0, Math.ceil(b[2] / 3) - x0, Math.ceil(b[3] / 3) - y0);
      const im = sc.add.image(x0 * 3, y0 * 3, 'fx_win', f).setOrigin(0, 0).setScale(3).setDepth(OD() + 1).setVisible(false); im.__tfx = 1; return im; });   // NORMAL поверх тонировки: стекло = тёплый свет (ADD на синем стекле давал розовый)
    F.win = { set visible(v) {}, get visible() { return F.wins.some(w => w.visible); }, get alpha() { return F.wins[0] ? F.wins[0].alpha : 0; },
      setVisible(v) { F.wins.forEach(w => w.setVisible(v && inView(sc, w.x + w.displayWidth / 2, w.y + w.displayHeight / 2, 500))); return this; }, setAlpha(a) { F.wins.forEach(w => w.setAlpha(a)); return this; } };
    F.pools = J.windows.filter(w => w[3] - w[1] < 150).map(w => {      // только окна нижнего этажа (до 150 px над низом дома) светят на землю
      const im = sc.add.image(0, 0, poolTex(sc, Math.max(36, w[2] * 2))).setOrigin(0.5, 0).setScale(3).setBlendMode(Phaser.BlendModes.ADD).setDepth(OD() + 1).setVisible(false);
      im.setPosition(S3(w[0]), S3(w[3] + 3)); im.x = S3(im.x - im.displayWidth / 2) + im.displayWidth / 2; im.__tfx = 1; return im; });
  }
  function tickWindows(sc, F, k) {
    if (!F.win) return; const on = k > 0.03; F.win.setVisible(on); F.pools.forEach(p => p.setVisible(on && inView(sc, p.x, p.y, 200))); if (!on) return;
    if (!less() && Math.random() < 0.18) F.flick = [1, 1, 0.9, 1, 0.82][Math.floor(Math.random() * 5)];   // мерцание свечей/очага: ступени
    const f = less() ? 1 : (F.flick || 1); F.win.setAlpha(k * 0.95 * f); F.pools.forEach((p, i) => p.setAlpha(k * 0.8 * (i % 3 ? f : 1)));
  }
  // ---- 2) дым из труб (Yard): пул клубов, подъём на 1 пиксель арта за шаг, ветер вправо, растёт и тает ступенями
  function setupSmoke(sc, F) {
    const J = sc.cache.json.get('fx_meta'); if (!J) return; F.smoke = [];
    J.chimneys.forEach((c, ci) => { for (let i = 0; i < 6; i++) { const im = sc.add.image(0, 0, 'fx_puff1').setOrigin(0.5, 1).setScale(3).setDepth(OD() - 3).setVisible(false); im.__fx = 1;
      F.smoke.push({ im, c, age: -i * 5 - ci * 2, x: c[0], y: c[1] }); } });
  }
  function tickSmoke(sc, F) {
    if (!F.smoke) return; const L = less();
    for (const s of F.smoke) {
      if (L || !inView(sc, s.c[0], s.c[1], 200)) { s.im.setVisible(false); continue; }
      s.age++; if (s.age < 0) continue;
      if (s.age === 1) { s.x = s.c[0]; s.y = s.c[1]; }
      if (s.age % 2 === 0) s.y -= 3; if (s.age % 5 === 0) s.x += 3;
      const st = s.age < 6 ? 1 : s.age < 14 ? 2 : 3, a = s.age < 14 ? 0.75 : s.age < 22 ? 0.5 : 0.28;
      s.im.setTexture('fx_puff' + st).setPosition(S3(s.x), S3(s.y)).setAlpha(a).setVisible(true);
      if (s.age > 30) { s.age = -Math.floor(Math.random() * 4); s.im.setVisible(false); }
    }
  }
  // ---- 3) тени облаков (день): плывут по ветру на 1 пиксель арта за шаг, вне кадра — переезжают на другой край
  function setupClouds(sc, F) {
    F.clouds = [0, 1, 2].map(i => { const im = sc.add.image(0, 0, 'fx_cloud').setOrigin(0, 0).setScale(i === 1 ? 6 : 3).setDepth(OD() - 4); im.__fx = 1;
      const v = sc.cameras.main.worldView; im.setPosition(S3(v.x + v.width * (i * 0.45) - 60), S3(v.y + v.height * (0.15 + i * 0.3))); return im; });
  }
  function tickClouds(sc, F, step) {
    if (!F.clouds) return; const v = sc.cameras.main.worldView, day = (sc.__tfx ? sc.__tfx.L : 1) > 0.72 && F.w !== 'rain' && F.w !== 'fog';
    F.clouds.forEach((c, i) => {
      c.setVisible(day); if (!day) return;
      if (step && !less()) c.x += 3;
      const far = c.x > v.right + v.width || c.x + c.displayWidth < v.x - v.width || c.y > v.bottom + v.height || c.y + c.displayHeight < v.y - v.height;
      if (far) c.setPosition(S3(v.x + rnd(-0.3, 0.8) * v.width), S3(v.y + (i / 3 + rnd(0, 0.2)) * v.height));   // камера прыгнула — облако сразу в кадре
      else if (c.x > v.right + 30 || c.x + c.displayWidth < v.x - 400 || c.y > v.bottom + 200 || c.y + c.displayHeight < v.y - 200) c.setPosition(S3(v.x - c.displayWidth - rnd(0, 120)), S3(v.y + rnd(-0.1, 0.8) * v.height));
    });
  }
  // ---- 4) светлячки (ночь, не зима), бабочки (день, весна/лето), птицы, пыль от шагов
  function setupLife(sc, F) {
    F.ff = Array.from({ length: 16 }, (_, i) => { const im = sc.add.image(0, 0, 'fx_ff').setOrigin(0, 0).setScale(3).setBlendMode(Phaser.BlendModes.ADD).setDepth(OD() + 2).setVisible(false); im.__tfx = 1; return { im, t: i * 3, on: 0 }; });
    F.bf = Array.from({ length: sc.scene.key === 'Yard' ? 5 : 3 }, (_, i) => { const im = sc.add.image(0, 0, `fx_bf${i % 3}a`).setOrigin(0.5, 1).setScale(3).setDepth(OD() - 6).setVisible(false); im.__fx = 1; return { im, i, dx: 1, dy: 0, t: 0 }; });
    F.birds = Array.from({ length: 3 }, () => { const im = sc.add.image(0, 0, 'fx_bird0').setOrigin(0, 0).setScale(3).setDepth(OD() - 1).setVisible(false); im.__fx = 1; return im; });
    F.birdT = 40 + Math.floor(Math.random() * 80);
    F.dust = Array.from({ length: 6 }, () => { const im = sc.add.image(0, 0, 'fx_dust').setOrigin(0.5, 1).setScale(3).setVisible(false); im.__fx = 1; return { im, age: 99 }; });
  }
  const spotIn = (v, m) => [S3(v.x + m + Math.random() * (v.width - 2 * m)), S3(v.y + m + Math.random() * (v.height - 2 * m))];
  function tickLife(sc, F, tick) {
    const v = sc.cameras.main.worldView, L = less(), n = WT.now(), k = darkK(sc), wet = F.w === 'rain';
    // светлячки
    const ffOn = !L && k > 0.5 && n.season === 'sommer' && F.w === 'clear';   // Glühwürmchen — летние ночи (июнь–июль), не в дождь/туман
    for (const f of F.ff) {
      if (!ffOn) { f.im.setVisible(false); continue; }
      f.t--; if (f.t <= 0) { f.on = !f.on; f.t = f.on ? 8 + Math.floor(Math.random() * 14) : 4 + Math.floor(Math.random() * 20); if (f.on) { const p = spotIn(v, 30); f.im.setPosition(p[0], p[1]); } }
      if (f.on && tick % 2 === 0) { f.im.x = S3(f.im.x + (Math.floor(Math.random() * 3) - 1) * 3); f.im.y = S3(f.im.y + (Math.floor(Math.random() * 3) - 1.3) * 3); }
      f.im.setTexture(f.on && f.t % 6 < 3 ? 'fx_ff2' : 'fx_ff').setVisible(!!f.on);
    }
    // бабочки
    const bfOn = !L && k < 0.2 && (n.season === 'sommer' || n.season === 'fruehling') && !wet && F.w !== 'fog';
    for (const b of F.bf) {
      if (!bfOn) { b.im.setVisible(false); b.live = 0; continue; }
      if (!b.live || !inView(sc, b.im.x, b.im.y, 40)) { const p = spotIn(v, 60); b.im.setPosition(p[0], p[1]); b.live = 1; }
      b.t++; if (b.t % 12 === 0) { b.dx = Math.random() < 0.5 ? -1 : 1; b.dy = Math.floor(Math.random() * 3) - 1; }
      if (tick % 2 === 0) { b.im.x = S3(b.im.x + b.dx * 3); b.im.y = S3(b.im.y + (b.dy + (b.t % 4 < 2 ? -1 : 1)) * 3); }
      b.im.setTexture(`fx_bf${b.i % 3}${b.t % 2 ? 'a' : 'b'}`).setFlipX(b.dx < 0).setVisible(true);   // глубина постоянная (OD-6): без пересортировки списка каждый шаг
    }
    // птицы: стайка из 3 раз в 10–20 с пролетает по верху кадра (день)
    if (!L && k < 0.3 && !wet) {
      if (F.birdFly) { F.birdFly.t++; F.birds.forEach((im, j) => { im.x += 6; im.setTexture((F.birdFly.t + j) % 4 < 2 ? 'fx_bird0' : 'fx_bird1'); });
        if (F.birds[0].x > v.right + 40) { F.birdFly = null; F.birds.forEach(im => im.setVisible(false)); } }
      else if (--F.birdT <= 0) { F.birdT = 100 + Math.floor(Math.random() * 100); const y = S3(v.y + v.height * rnd(0.12, 0.4)), x = S3(v.x - 60);
        F.birds.forEach((im, j) => im.setPosition(x - [0, 18, 24][j], y + [0, -12, 12][j]).setVisible(true)); F.birdFly = { t: 0 }; }
    } else { F.birds.forEach(im => im.setVisible(false)); F.birdFly = null; }
    // пыль от шагов Max
    const w = sc.walker || sc.hero;
    if (w && w.active && !L) { const moved = F.lastW && Math.hypot(w.x - F.lastW[0], w.y - F.lastW[1]) > 4; F.lastW = [w.x, w.y];
      if (moved && tick % 3 === 0) { const d = F.dust.find(q => q.age > 4); if (d) { d.age = 0; d.im.setPosition(S3(w.x + (Math.random() < 0.5 ? -6 : 6)), S3(w.y + 3)).setDepth(w.depth - 0.5); } } }
    for (const d of F.dust) { d.age++; d.im.setVisible(d.age <= 4 && !L).setAlpha(d.age <= 2 ? 0.8 : 0.4); if (d.age === 3) d.im.y -= 3; }
  }
  // ---- 5) погода: дождь (капли 1x3, брызги, мир темнее и синее) и утренний туман (полосы 3 ступеней, плывут)
  function setupWeather(sc, F) {                                    // создаётся только в первый дождливый/туманный час (пул не висит в списке сцены зря)
    if (F.wet || F.w === 'clear') return; const W = sc.worldW || 8000, H = sc.worldH || 8000;
    F.wet = sc.add.rectangle(-6400, -6400, W + 12800, H + 12800, 0xb4bccc, 1).setOrigin(0, 0).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(OD() - 0.5).setVisible(false); F.wet.__fx = 1;
    F.drops = Array.from({ length: 60 }, () => { const im = sc.add.image(0, 0, 'fx_drop').setOrigin(0, 0).setScale(3).setDepth(OD() - 2).setVisible(false); im.__fx = 1; return { im, end: 0, spl: 0 }; });
    F.fog = Array.from({ length: 6 }, (_, i) => { const im = sc.add.image(0, 0, 'fx_fog').setOrigin(0, 0).setScale(6).setDepth(OD() - 1.5).setVisible(false); im.__fx = 1; im.__i = i; return im; });
  }
  function tickRain(sc, F) {
    const on = F.w === 'rain', v = sc.cameras.main.worldView; F.wet.setVisible(on);
    for (const d of F.drops) {
      if (!on || less()) { d.im.setVisible(false); d.end = 0; continue; }
      if (!d.end) { d.im.setTexture('fx_drop').setPosition(S3(v.x + Math.random() * (v.width + 60)), S3(v.y - Math.random() * v.height * 0.6)); d.end = d.im.y + v.height * rnd(0.4, 1.1); d.spl = 0; }
      if (d.spl) { if (++d.spl > 3) d.end = 0; continue; }
      d.im.y += 15; if ((d.im.y / 15) % 3 < 1) d.im.x -= 3;
      if (d.im.y >= d.end) { d.spl = 1; d.im.setTexture('fx_spl').setPosition(S3(d.im.x - 3), S3(d.im.y + 6)); }
      d.im.setVisible(true);
    }
  }
  function tickFog(sc, F, step) {
    const n = WT.now(), on = F.w === 'fog', v = sc.cameras.main.worldView, a = n.hour < 8 ? 1 : n.hour < 9 ? 0.6 : 0.3;
    F.fog.forEach(im => {
      im.setVisible(on); if (!on) return;
      if (!im.__set || im.x > v.right + 20 || im.x + im.displayWidth < v.x - 300 || im.y > v.bottom || im.y + im.displayHeight < v.y) {
        im.__set = 1; im.setPosition(S3(v.x - 120 + ((im.__i * 197) % Math.max(1, v.width)) - (im.x > v.right ? v.width : 0)), S3(v.y + (im.__i + 0.3) * v.height / 6)); }
      if (step && !less()) im.x += 3; im.setAlpha(a);
    });
  }
  // ---- сцена
  function setup(sc) {
    if (!OUT[sc.scene.key]) return; texes(sc);
    const F = sc.__fx = { w: weather() }, yard = sc.scene.key === 'Yard';
    const go = () => {
      if (!sc.sys || !sc.sys.isActive() || sc.__fx !== F) return;
      if (yard) { setupWindows(sc, F); setupSmoke(sc, F); }
      setupClouds(sc, F); setupLife(sc, F); setupWeather(sc, F);
      let tick = 0;
      F.ev = sc.time.addEvent({ delay: 100, loop: true, callback: () => {
        tick++; if (tick % 50 === 0) { F.w = weather(); setupWeather(sc, F); }
        if (tick % 10 === 1 && window.TimeFX) (sc.children.list || []).forEach(o => { if (o.depth < TimeFX.UI_BUMP && TimeFX.isUI(o)) o.setDepth(o.depth + TimeFX.UI_BUMP); });   // подписи всегда над дымом/бабочками/облаками (и днём)
        const k = darkK(sc); tickWindows(sc, F, k); tickSmoke(sc, F); tickClouds(sc, F, tick % 2 === 0); tickLife(sc, F, tick); if (F.fog) tickFog(sc, F, tick % 4 === 0);
        if (window.TimeFX && sc.__tfx && sc.__tfx.em) sc.__tfx.em.setVisible(F.w !== 'rain');   // сезонные частицы time_fx стоят под дождём
      } });
      F.rev = sc.time.addEvent({ delay: 50, loop: true, callback: () => { if (F.drops) tickRain(sc, F); } });
    };
    const need = [];
    if (yard && !sc.textures.exists('fx_win')) { sc.load.image('fx_win', BASE + 'win_glow.png'); need.push(1); }
    if (yard && !sc.cache.json.get('fx_meta')) { sc.load.json('fx_meta', BASE + 'fx.json'); need.push(1); }
    if (need.length) { sc.load.once('complete', () => setTimeout(go, 0)); sc.load.start(); } else setTimeout(go, 0);
    sc.events.once('shutdown', () => { if (F.ev) F.ev.remove(); if (F.rev) F.rev.remove(); sc.__fx = null; });
  }
  function stats(sc) { const F = sc && sc.__fx; if (!F) return null; const vis = a => (a || []).filter(o => (o.im || o).visible).length;
    return { w: F.w, win: !!(F.win && F.win.visible), winA: F.win ? +F.win.alpha.toFixed(2) : 0, pools: vis(F.pools), smoke: vis(F.smoke), clouds: vis(F.clouds), ff: vis(F.ff), bf: vis(F.bf), birds: vis(F.birds), drops: vis(F.drops), fog: vis(F.fog), wet: !!(F.wet && F.wet.visible), less: less() }; }
  function pause(sc, on) {                                          // замер A/B в одной странице (checks/fx_fps.cjs AB=1): всё fx спрятано и стоит
    const F = sc && sc.__fx; if (!F) return; F.paused = !!on; if (F.ev) F.ev.paused = !!on; if (F.rev) F.rev.paused = !!on;
    (sc.children.list || []).forEach(o => { if (o.__fx || (o.__tfx && /^fx_/.test(o.texture && o.texture.key))) { if (on) { o.__fxVis = o.visible; o.setVisible(false); } else if (o.__fxVis != null) o.setVisible(o.__fxVis); } });
  }
  window.FX = { stats, weather, pause };
  (function hook() {
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 50);
    Object.keys(OUT).forEach(k => { const sc = g.scene.getScene(k); if (sc) sc.events.on('create', () => { try { setup(sc); } catch (e) { console.warn('FX ' + k, e); } }); });
    // тряска камеры при ударе в бою (combat.js strike -> cameras.main.shake): при «Weniger Animation» — без тряски
    const CP = Phaser.Cameras && Phaser.Cameras.Scene2D && Phaser.Cameras.Scene2D.Camera && Phaser.Cameras.Scene2D.Camera.prototype;
    if (CP && CP.shake && !CP.shake.__fx) { const sh0 = CP.shake; CP.shake = function () { return less() ? this : sh0.apply(this, arguments); }; CP.shake.__fx = 1; }
    let first = true;                                               // шторка — на каждую смену сцены, кроме первого входа в игру
    ['Yard', 'Welt', 'Room', 'Ort', 'Dungeon', 'Arena', 'Furnish'].forEach(k => { const sc = g.scene.getScene(k); if (sc) sc.events.on('create', () => { if (first) { first = false; return; } curtain(); }); });
    if (g.scene.getScenes(true).length) first = false;
    g.scene.getScenes(true).forEach(sc => { if (OUT[sc.scene.key] && !sc.__fx) setup(sc); });
  })();
})();
