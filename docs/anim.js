// Код (анимации) 24.11 — живой мир поверх сцен (чужие файлы не правит: только events.on('create'), как time_fx.js / light.js).
// Pixel-art: всё по кадрам и целым пикселям арта x3 (сдвиг = 3 px экрана), без твинов-размытия; арт только из паков с лицензией.
// 1) Ветер Stillbach: кроны деревьев, кусты, цветы и трава запечены в town_bg -> вырезки их же пикселей (assets_v3/anim/wind.png,
//    style_pick/anim/build_anim.py, маски = рисунки craftpix 654184) качаются на 1 пиксель арта волной по карте. Глубина -9.5: над фоном,
//    под зимним инеем time_fx (-9) и под всем остальным -> трава и кусты никогда не закрывают Max, предметы и подписи; цвет = тон фона (сезон).
// 2) Вода: блики на море Stillbach и на озёрах/реке Wiesenland (1 пиксель -> крестик -> 1 пиксель), только в кадре камеры.
// 3) Животные у дороги: Küken, Hahn, Lamm, Schaf (craftpix farm_animals): idle/шаг по кадрам, бродят рядом по маске ходьбы, тап — слово.
// 4) Жители Wiesenland и NPC в доме дышат: верх фигуры (setCrop) опускается на 1 пиксель арта раз в ~1 с.
// 5) Сундук (API для loot.js): AnimFX.chestOpen(sc, chest, rar, items, done) — кадры открытия листа пака, затем свет редкости, предметы вылетают.
// 6) «Weniger Animation» (меньше движения): кнопка в окне System; хранится в localStorage ds_proto.lessAnim ('1'/'0');
//    не задано -> как prefers-reduced-motion системы. Вкл: ветер/блики/животные/дыхание стоят, сундук открывается сразу, CSS-анимации гаснут.
// API: AnimFX.less(), AnimFX.setLess(on), AnimFX.chestOpen(...), AnimFX.stats(sc). Арт: assets_v3/anim (LICENSE.txt).
(function () {
  const KEY = 'ds_proto.lessAnim', BASE = 'assets_v3/anim/';
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const less = () => { let v = null; try { v = localStorage.getItem(KEY); } catch (e) {} return v === '1' ? true : v === '0' ? false : !!(mq && mq.matches); };
  const css = document.createElement('style');
  css.textContent = `body.lessAnim *,body.lessAnim *::before,body.lessAnim *::after{animation-duration:.001s!important;animation-iteration-count:1!important;transition-duration:.001s!important}
    #sysWin #animSet .btn.on{box-shadow:inset 0 0 0 3px #3f4fb5}`;
  document.head.appendChild(css);
  function applyLess() {
    const on = less(); document.body.classList.toggle('lessAnim', on);
    try { window.dispatchEvent(new CustomEvent('ds:lessAnim', { detail: on })); } catch (e) {}
    const b = document.getElementById('bLess'); if (b) paintBtn(b);
    if (window.game && game.scene) game.scene.getScenes(true).forEach(sc => { if (sc.__afx) still(sc); });
  }
  function setLess(on) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {} applyLess(); }
  if (mq) { if (mq.addEventListener) mq.addEventListener('change', applyLess); else if (mq.addListener) mq.addListener(applyLess); }
  // ---- кнопка в окне System (system.js рисует окно заново при каждом открытии -> добавляем раздел, когда его нет)
  function paintBtn(b) { const on = less(); b.classList.toggle('on', on); b.innerHTML = `Weniger Animation: ${on ? 'an' : 'aus'}<span class="ru">меньше движения: ${on ? 'вкл' : 'выкл'} · ${localStorage.getItem(KEY) == null ? 'как в системе' : 'своё'}</span>`; }
  function addSetting() {
    const win = document.getElementById('sysWin'); if (!win) return;
    const body = win.querySelector('.body'); if (!body || body.querySelector('#animSet')) return;
    const box = document.createElement('div'); box.id = 'animSet';
    box.innerHTML = '<div class="sec">Einstellungen<span class="ru">настройки</span></div><button class="ui ui-btn btn" id="bLess"></button>';
    body.appendChild(box); const b = box.querySelector('#bLess'); paintBtn(b); b.onclick = () => setLess(!less());
  }
  (function hookSys() {
    const win = document.getElementById('sysWin'); if (!win) return setTimeout(hookSys, 150);
    new MutationObserver(addSetting).observe(win, { childList: true }); addSetting();
  })();
  if (document.body) applyLess(); else document.addEventListener('DOMContentLoaded', applyLess);
  // ---- общие помощники
  const S3 = v => Math.round(v / 3) * 3;                            // на сетку пикселей арта x3
  const RCOL = { h: 0xfff1c8, s: 0xffb347, ss: 0xc08cff, l: 0xffd23f };   // свет редкости (тон как в Album: häufig / selten / sehr selten / legendär)
  function pixTex(sc, key, w, h, draw) {                            // маленькая пиксельная текстура (1 px = 1 пиксель арта, на экране x3)
    if (sc.textures.exists(key)) return key; const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; draw(g); sc.textures.addCanvas(key, cv); return key;
  }
  function sparkTex(sc) {
    pixTex(sc, 'afx_sp1', 1, 1, g => { g.fillStyle = '#f2fbff'; g.fillRect(0, 0, 1, 1); });
    pixTex(sc, 'afx_sp2', 3, 3, g => { g.fillStyle = '#f2fbff'; g.fillRect(1, 0, 1, 3); g.fillRect(0, 1, 3, 1); });
    pixTex(sc, 'afx_wv', 3, 1, g => { g.fillStyle = 'rgba(232,248,255,0.85)'; g.fillRect(0, 0, 3, 1); });
  }
  function beamTex(sc, rar) {                                       // столб света над открытым сундуком: 3 ступени яркости, без размытия
    const c = RCOL[rar] || RCOL.h, hex = '#' + c.toString(16).padStart(6, '0');
    return pixTex(sc, 'afx_beam_' + rar, 11, 26, g => {
      for (let y = 0; y < 26; y++) { const a = y < 8 ? 0.25 : y < 16 ? 0.45 : 0.7;
        g.globalAlpha = a * 0.55; g.fillStyle = hex; g.fillRect(1, y, 9, 1); g.globalAlpha = a; g.fillRect(3, y, 5, 1); g.globalAlpha = Math.min(1, a + 0.25); g.fillStyle = '#ffffff'; g.fillRect(5, y, 1, 1); }
    });
  }
  const inView = (sc, x, y, m) => { const v = sc.cameras.main.worldView; m = m || 0; return x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m; };
  function still(sc) {                                              // «Weniger Animation»: всё стоит в покое (ветер 0, блики спрятаны, животные idle, дыхание вдох)
    const A = sc.__afx; if (!A) return; const L = less();
    (A.wind || []).forEach(o => { o.off = 0; o.img.x = o.x; });
    (A.sparks || []).forEach(s => { s.img.setVisible(false); s.st = 0; s.wait = 0; });
    (A.animals || []).forEach(a => { if (L) { a.tgt = null; a.spr.anims.stop(); a.spr.setFrame(a.idle0 + 0); } });
    (A.breath || []).forEach(b => b.set(0));
  }
  // ---- 1) ветер (Yard)
  function setupWind(sc) {
    const J = sc.cache.json.get('afx_wind'); if (!J || !sc.textures.exists('afx_wind')) return;
    const tex = sc.textures.get('afx_wind'), A = sc.__afx;
    A.wind = J.map((o, i) => { const f = 'w' + i; if (!tex.has(f)) tex.add(f, 0, o.fx, o.fy, o.w, o.h);
      const img = sc.add.image(o.x, o.y, 'afx_wind', f).setOrigin(0, 0).setScale(3).setDepth(-9.5); img.__afx = 1;
      // фаза: волна идёт слева направо по карте; деревья качаются реже и медленнее, цветы и трава — чаще
      const sp = o.k === 'tree' ? 0.9 : o.k === 'bush' ? 1.3 : 2.1, th = o.k === 'tree' ? 0.62 : o.k === 'bush' ? 0.55 : 0.35;
      return { img, x: o.x, y: o.y, w: o.w * 3, h: o.h * 3, k: o.k, sp, th, ph: (o.x * 0.0047 + o.y * 0.0013) % (Math.PI * 2), off: 0 }; });
    let tint = -1; const bg = (sc.children.list || []).find(o => o.type === 'Image' && o.texture && o.texture.key === 'town_bg');
    const tick = () => {
      const t = sc.time.now / 1000, tt = bg && bg.isTinted ? bg.tintTopLeft : 0xffffff;   // сезонный тон фона (time_fx) — тот же у вырезок
      if (tt !== tint) { tint = tt; A.wind.forEach(o => (tt === 0xffffff ? o.img.clearTint() : o.img.setTint(tt))); }
      const L = less(), gust = 0.55 + 0.45 * Math.sin(t * 0.37);    // порыв ветра: то сильнее, то тише
      for (const o of A.wind) {
        const vis = inView(sc, o.x + o.w / 2, o.y + o.h / 2, 160);  // вне кадра не рисуем (телефон: меньше работы на кадр)
        if (o.img.visible !== vis) o.img.setVisible(vis);
        if (!vis || L) continue;
        const v = Math.sin(t * o.sp - o.ph) * gust, off = v > o.th ? 1 : v < -o.th - 0.3 ? -1 : 0;   // чаще по ветру (вправо), реже обратно
        if (off !== o.off) { o.off = off; o.img.x = o.x + off * 3; }
      }
    };
    tick(); A.windEv = sc.time.addEvent({ delay: 170, loop: true, callback: tick });
  }
  // ---- 2) блики воды
  function setupSparks(sc, n, spot) {                               // spot() -> [x, y] точки воды в кадре или null
    sparkTex(sc); const A = sc.__afx;
    A.sparks = Array.from({ length: n }, (_, i) => ({ img: sc.add.image(0, 0, 'afx_sp1').setOrigin(0, 0).setScale(3).setDepth(-9.4).setVisible(false), st: 0, wait: (i * 7) % 13 }));
    A.sparks.forEach(s => { s.img.__afx = 1; });
    const SEQ = ['afx_sp1', 'afx_sp2', 'afx_sp2', 'afx_sp1'];           // 1 пиксель -> крестик -> 1 пиксель; иногда короткая волна «—»
    A.sparkEv = sc.time.addEvent({ delay: 140, loop: true, callback: () => {
      if (less()) return;
      for (const s of A.sparks) {
        if (s.wait > 0) { s.wait--; continue; }
        if (s.st === 0) { const p = spot(); if (!p) { s.wait = 6; continue; } s.wave = Math.random() < 0.35; s.p = [S3(p[0]), S3(p[1])]; }
        if (s.st >= (s.wave ? 3 : SEQ.length)) { s.st = 0; s.img.setVisible(false); s.wait = 4 + Math.floor(Math.random() * 18); continue; }
        const k = s.wave ? 'afx_wv' : SEQ[s.st], d = k === 'afx_sp2' ? 3 : 0;   // крестик 3x3 — центр в той же точке
        s.img.setTexture(k).setPosition(s.p[0] - d, s.p[1] - d).setVisible(true); s.st++;
      }
    } });
  }
  function isWaterPx(sc, key, x, y, k) {                            // пиксель фона синий = вода (берег/песок/пена — нет)
    const c = sc.textures.getPixel(Math.floor(x / k), Math.floor(y / k), key); return !!c && c.blue > c.red + 40 && c.blue > c.green - 10 && c.alpha > 0;
  }
  // ---- 3) животные (Yard). Листы craftpix 6x8: ряды 0–3 шаг (вниз, вверх, влево, вправо), 4–7 покой (4 кадра)
  const ANIM = { chick: ['das', 'Küken', 'цыплёнок'], rooster: ['der', 'Hahn', 'петух'], lamb: ['das', 'Lamm', 'ягнёнок'], sheep: ['das', 'Schaf', 'овца'] };
  const HERDS = [{ k: 'rooster', at: [700, 1010] }, { k: 'chick', at: [740, 1040] }, { k: 'chick', at: [660, 1050] }, { k: 'chick', at: [770, 990] },
    { k: 'sheep', at: [2190, 2250] }, { k: 'lamb', at: [2260, 2280] }, { k: 'sheep', at: [2110, 2300] }];
  const DIRS = ['down', 'up', 'left', 'right'];
  function walkOk(sc, x, y, r) { if (!window.townWalkable) return true; for (const [dx, dy] of [[0, 0], [-r, 0], [r, 0], [0, -6]]) if (!townWalkable(sc, x + dx, y + dy)) return false; return true; }
  function freeSpot(sc, x, y, r) {                                  // ближайшая проходимая точка у якоря (спираль по клеткам 12 px)
    for (let d = 0; d < 240; d += 12) for (let a = 0; a < 8; a++) { const px = S3(x + Math.cos(a * Math.PI / 4) * d), py = S3(y + Math.sin(a * Math.PI / 4) * d); if (walkOk(sc, px, py, r)) return [px, py]; }
    return null;
  }
  function setupAnimals(sc) {
    const M = sc.cache.json.get('afx_meta'), A = sc.__afx; if (!M) return; A.animals = [];
    Object.keys(ANIM).forEach(k => { if (!sc.textures.exists('afx_' + k)) return; const m = M[k];
      DIRS.forEach((d, r) => { const wk = `afx-${k}-walk-${d}`, ik = `afx-${k}-idle-${d}`;
        if (!sc.anims.exists(wk)) sc.anims.create({ key: wk, frames: sc.anims.generateFrameNumbers('afx_' + k, { start: r * 6, end: r * 6 + 5 }), frameRate: 9, repeat: -1 });
        if (!sc.anims.exists(ik)) sc.anims.create({ key: ik, frames: sc.anims.generateFrameNumbers('afx_' + k, { start: (4 + r) * 6, end: (4 + r) * 6 + 3 }), frameRate: 4, repeat: -1 }); });
      m.k = k; });
    HERDS.forEach((h, i) => {
      if (!sc.textures.exists('afx_' + h.k)) return; const m = M[h.k], p = freeSpot(sc, h.at[0], h.at[1], m.fw > 16 ? 18 : 9); if (!p) return;
      const spr = sc.add.sprite(p[0], p[1], 'afx_' + h.k, 24).setOrigin(0.5, 1).setScale(3).setDepth(p[1]); spr.__afx = 1; spr.animal = h.k;
      const a = { k: h.k, spr, home: p, tgt: null, dir: 'down', idle0: 24, wait: 10 + i * 7, r: m.fw > 16 ? 18 : 9, rng: m.fw > 16 ? 110 : 70 };
      if (!less()) spr.play({ key: `afx-${h.k}-idle-down`, startFrame: i % 4 });
      spr.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        if (sc.__dragged) return; const w = ANIM[h.k]; if (window.speakDE) speakDE(w[0] + ' ' + w[1]); if (window.toast) toast(w[0] + ' ' + w[1] + ' · ' + w[2], 1500);
        a.tgt = null; a.wait = 25; if (!less()) spr.play(`afx-${h.k}-idle-${a.dir}`, true);
      });
      A.animals.push(a);
    });
    A.animalEv = sc.time.addEvent({ delay: 100, loop: true, callback: () => {
      if (less()) return;
      for (const a of A.animals) {
        const s = a.spr;
        if (a.tgt) {
          const dx = a.tgt[0] - s.x, dy = a.tgt[1] - s.y, d = Math.hypot(dx, dy), st = a.k === 'chick' ? 3 : 3;   // шаг 1 пиксель арта за тик (~30 px/с)
          if (d <= st) { s.setPosition(a.tgt[0], a.tgt[1]); a.tgt = null; a.wait = 15 + Math.floor(Math.random() * 40); s.play(`afx-${a.k}-idle-${a.dir}`, true); }
          else { const nx = S3(s.x + dx / d * st), ny = S3(s.y + dy / d * st); if (walkOk(sc, nx, ny, a.r)) s.setPosition(nx, ny); else { a.tgt = null; a.wait = 10; s.play(`afx-${a.k}-idle-${a.dir}`, true); } }
          s.setDepth(s.y);
        } else if (a.wait > 0) { a.wait--; if (!s.anims.isPlaying) s.play(`afx-${a.k}-idle-${a.dir}`, true); }   // после «Weniger Animation: aus» снова оживает
        else {                                                    // новая цель рядом с домом стада, по прямой без препятствий
          for (let tr = 0; tr < 6; tr++) {
            const tx = S3(a.home[0] + (Math.random() * 2 - 1) * a.rng), ty = S3(a.home[1] + (Math.random() * 2 - 1) * a.rng * 0.6);
            let ok = walkOk(sc, tx, ty, a.r); for (let q = 1; ok && q < 6; q++) ok = walkOk(sc, s.x + (tx - s.x) * q / 6, s.y + (ty - s.y) * q / 6, a.r);
            const w = sc.walker; if (ok && w && Math.hypot(tx - w.x, ty - w.y) < 50) ok = false;   // не лезть под ноги Max
            if (ok) { a.tgt = [tx, ty]; const dx = tx - s.x, dy = ty - s.y; a.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
              a.idle0 = (4 + DIRS.indexOf(a.dir)) * 6; s.play(`afx-${a.k}-walk-${a.dir}`, true); break; }
          }
          if (!a.tgt) a.wait = 20;
        }
      }
    } });
  }
  // ---- 4) дыхание жителей: копия верхней части фигуры поверх (setCrop), на выдохе опускается на 1 пиксель арта; ноги стоят
  function breathe(sc, img, part) {
    if (!img || !img.frame) return null; const fw = img.frame.width, fh = img.frame.height, cut = Math.round(fh * (part || 0.58)), px = img.scaleY || 1;
    const top = sc.add.image(img.x, img.y, img.texture.key, img.frame.name).setOrigin(img.originX, img.originY).setScale(img.scaleX, img.scaleY).setDepth(img.depth + 0.01);
    top.setCrop(0, 0, fw, cut); top.__afx = 1; img.setCrop(0, cut, fw, fh - cut);   // низ — у оригинала, верх — у копии
    const b = { img, top, px, on: 0, ph: Math.floor(Math.random() * 8), set(v) { this.on = v; this.sync(); },
      sync() { top.setPosition(img.x, img.y + this.on * px).setVisible(img.visible && img.active).setAlpha(img.alpha); if (top.depth !== img.depth + 0.01) top.setDepth(img.depth + 0.01); } };
    return b;
  }
  function setupBreath(sc, list) {
    const A = sc.__afx; A.breath = list.filter(Boolean); let tick = 0;
    const fn = () => { for (const b of A.breath) b.sync(); };       // копия следует за фигурой (прыжок NPC в диалоге и т.п.)
    sc.events.on('postupdate', fn); sc.events.once('shutdown', () => sc.events.off('postupdate', fn));
    A.breathEv = sc.time.addEvent({ delay: 130, loop: true, callback: () => {
      tick++; if (less()) return;
      for (const b of A.breath) { if (!b.img.active) continue; const k = (tick + b.ph) % 9; b.set(k >= 5 && k <= 7 ? 1 : 0); }   // ~1,2 с: вдох 5 тиков, выдох 3
    } });
  }
  // ---- сцены
  function setupYard(sc) {
    const A = sc.__afx = { wind: [], sparks: [], animals: [], breath: [] };
    const go = () => {
      if (!sc.sys || !sc.sys.isActive() || sc.__afx !== A) return;
      if (sc.textures.exists('town_bg')) setupWind(sc);
      const T = sc.cache.json.get('town');
      if (T && T.water_y) setupSparks(sc, 22, () => {            // море Stillbach: от линии берега вниз, только в кадре
        const v = sc.cameras.main.worldView, y0 = Math.max(T.water_y + 24, v.y), y1 = Math.min(T.h - 6, v.bottom); if (y1 <= y0) return null;
        for (let i = 0; i < 4; i++) { const x = v.x + Math.random() * v.width, y = y0 + Math.random() * (y1 - y0); if (x > 0 && x < T.w && isWaterPx(sc, 'town_bg', x, y, 1)) return [x, y]; } return null; });
      setupAnimals(sc); still(sc);
    };
    const need = [];
    if (!sc.textures.exists('afx_wind')) { sc.load.image('afx_wind', BASE + 'wind.png'); need.push(1); }
    if (!sc.cache.json.get('afx_wind')) { sc.load.json('afx_wind', BASE + 'wind.json'); need.push(1); }
    if (!sc.cache.json.get('afx_meta')) { sc.load.json('afx_meta', BASE + 'anim.json'); need.push(1); }
    const M = { chick: 16, rooster: 32, lamb: 32, sheep: 32 };
    Object.keys(M).forEach(k => { if (!sc.textures.exists('afx_' + k)) { sc.load.spritesheet('afx_' + k, BASE + k + '.png', { frameWidth: M[k], frameHeight: M[k] }); need.push(1); } });
    if (need.length) { sc.load.once('complete', go); sc.load.start(); } else go();
  }
  function setupWelt(sc) {
    const A = sc.__afx = { wind: [], sparks: [], animals: [], breath: [] }, d = sc.world;
    setupBreath(sc, (sc.npcImgs || []).map(im => breathe(sc, im, 0.6)));
    const key = (sc.children.list.find(o => o.type === 'Image' && /^welt_map/.test(o.texture && o.texture.key)) || {}).texture;
    if (d && d.kind) setupSparks(sc, 18, () => {                    // озёра и река: клетка воды, все 4 соседа — тоже вода (не у берега)
      const v = sc.cameras.main.worldView, MW = 120, T = 48;
      for (let i = 0; i < 6; i++) { const tx = Math.floor((v.x + Math.random() * v.width) / T), ty = Math.floor((v.y + Math.random() * v.height) / T);
        const w = (x, y) => x >= 0 && y >= 0 && x < MW && y < 160 && d.kind[y * MW + x] === 2;
        if (w(tx, ty) && w(tx + 1, ty) && w(tx - 1, ty) && w(tx, ty + 1) && w(tx, ty - 1)) return [tx * T + 6 + Math.random() * 36, ty * T + 6 + Math.random() * 36]; }
      return null; });
    if (key) A.mapKey = key.key;
    still(sc);
  }
  function setupRoom(sc) { const A = sc.__afx = { breath: [] }; if (sc.npc && sc.npc.type === 'Image') setupBreath(sc, [breathe(sc, sc.npc, 0.55)]); still(sc); }
  // ---- 5) сундук: кадры открытия -> свет редкости (только ПОСЛЕ открытия) -> предметы вылетают вверх -> done()
  const ICSC = { coin: 1, heil: 3, blick: 3, rubin: 3 };            // пиксель арта = 3 px экрана везде: items/* нарисованы x4 (-> 0.75), монета x3 (-> 1), зелья и рубин x1 (-> 3)
  const ICURL = k => k === 'coin' ? 'assets_v3/icon_coin.png' : k === 'rubin' ? 'assets_v3/life/rubin.png' : 'assets_v3/items/' + k + '.png';
  function preloadIcons(sc, keys) {
    const miss = keys.filter(k => !sc.textures.exists('afx_ic_' + k)); if (!miss.length) return;
    miss.forEach(k => sc.load.image('afx_ic_' + k, ICURL(k))); sc.load.start();
  }
  function chestFrames(sc, img) {                                   // [{key, frame, dx, h}] — кадры того же пака, низ кадра = низ сундука
    const tk = img.texture.key;
    if (tk === 'world_atlas') return ['chest0', 'chest1', 'chest3'].filter(f => img.texture.has(f)).map(f => ({ key: tk, frame: f, h: img.texture.get(f).height, w: img.texture.get(f).width }));
    if (tk === 'dp_chest' && sc.textures.exists('dun_anim')) {      // der Keller: anim.png (craftpix 436971), 4 кадра; своя текстура с той же тенью, что у dp_chest
      const M = sc.cache.json.get('afx_meta'), R = (M && M.chest) || [[1, 162, 13, 14], [16, 163, 15, 13], [33, 155, 13, 21], [49, 157, 13, 19]], src = sc.textures.get('dun_anim').getSourceImage();
      return R.map((r, i) => { const key = 'afx_chest' + i; if (!sc.textures.exists(key)) {
        const [x, y, w, h] = r, cv = document.createElement('canvas'); cv.width = w + 2; cv.height = h + 1; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
        const s = document.createElement('canvas'); s.width = w; s.height = h; const sg = s.getContext('2d'); sg.drawImage(src, x, y, w, h, 0, 0, w, h); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = 'rgba(24,20,37,0.42)'; sg.fillRect(0, 0, w, h);
        g.drawImage(s, 2, 1); g.drawImage(src, x, y, w, h, 0, 0, w, h); sc.textures.addCanvas(key, cv); }
        return { key, frame: undefined, h: r[3], w: r[2], dx: (r[0] % 16) - 1 }; });
    }
    return [];
  }
  function chestOpen(sc, c, rar, items, done) {
    const img = c && c.img, fin = () => { try { done && done(); } catch (e) { console.warn(e); } };
    if (!sc || !img || !img.active || !sc.sys.isActive()) return fin();
    const F = chestFrames(sc, img), k = img.scaleX || 3, L = less();
    const left = img.x, bottom = img.y + (F[0] ? F[0].h : img.frame.height) * k;   // низ закрытого сундука — опора всех кадров
    const show = i => { const f = F[i]; if (!f) return; img.setTexture(f.key, f.frame); img.setPosition(left + (f.dx || 0) * k, bottom - f.h * k); img.clearTint(); };
    const topY = () => img.y, cx = () => S3(left + (F[0] ? F[0].w : img.frame.width) * k / 2);
    let i = 0;
    const glow = () => {
      const col = RCOL[rar] || RCOL.h, bm = sc.add.image(cx(), topY() + 9, beamTex(sc, rar)).setOrigin(0.5, 1).setScale(3).setBlendMode(Phaser.BlendModes.ADD).setDepth(img.depth + 1); bm.__afx = 1;
      if (L) { bm.setCrop(0, 0, 11, 26); sc.time.delayedCall(550, () => { bm.destroy(); fin(); }); return; }
      const H = [8, 16, 26, 26, 26, 26, 26, 18, 10], A = [1, 1, 1, 1, 0.8, 0.8, 0.6, 0.45, 0.3]; let s = 0;   // свет растёт снизу вверх ступенями и гаснет ступенями
      const parts = Array.from({ length: rar === 'l' ? 8 : rar === 'ss' ? 6 : rar === 's' ? 4 : 2 }, (_, j) => {
        const p = sc.add.image(cx() + (j % 2 ? 1 : -1) * (3 + (j * 9) % 15), topY() - (j * 7) % 18, 'afx_sp2').setOrigin(0.5, 0.5).setScale(3).setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDepth(img.depth + 2); p.__afx = 1; return p; });
      sparkTex(sc);
      sc.time.addEvent({ delay: 90, repeat: H.length - 1, callback: () => {
        bm.setCrop(0, 26 - H[s], 11, H[s]).setAlpha(A[s]); parts.forEach((p, j) => { p.y -= 6; p.setVisible((s + j) % 3 !== 0); p.setAlpha(A[s]); }); s++;
        if (s >= H.length) { bm.destroy(); parts.forEach(p => p.destroy()); fly(); }
      } });
    };
    const fly = () => {                                             // предметы награды выпрыгивают из сундука вверх (по 6 px = 2 пикселя арта за шаг)
      const ks = (items || []).filter(x => sc.textures.exists('afx_ic_' + x)).slice(0, 5); if (!ks.length) return fin();
      const ims = ks.map((x, j) => { const im = sc.add.image(S3(cx() + (j - (ks.length - 1) / 2) * 30), topY() + 12, 'afx_ic_' + x).setOrigin(0.5, 1).setScale(ICSC[x] || 0.75).setDepth(img.depth + 3); im.__afx = 1; return im; });
      let s = 0; sc.time.addEvent({ delay: 70, repeat: 7, callback: () => { ims.forEach((im, j) => { if (s >= j) im.y -= s < 5 ? 9 : 3; if (s >= 6) im.setAlpha(0.5); }); s++; if (s >= 8) { ims.forEach(im => im.destroy()); fin(); } } });
    };
    if (L || F.length < 2) { show(F.length - 1); return glow(); }
    show(0); sc.time.addEvent({ delay: 110, repeat: F.length - 1, callback: () => { i++; if (i < F.length) show(i); if (i >= F.length - 1) { if (!glow.__on) { glow.__on = 1; glow(); } } } });
  }
  function opened(sc, c) { const F = c && c.img ? chestFrames(sc, c.img) : []; if (!F.length) return false;   // уже открытый сундук (повторный вход) — открытый кадр
    const img = c.img, k = img.scaleX || 3, left = img.x, bottom = img.y + F[0].h * k, f = F[F.length - 1]; img.setTexture(f.key, f.frame).setPosition(left + (f.dx || 0) * k, bottom - f.h * k); return true; }
  function stats(sc) { const A = sc && sc.__afx; return A ? { wind: (A.wind || []).length, windMoved: (A.wind || []).filter(o => o.off).length, sparks: (A.sparks || []).filter(s => s.img.visible).length,
    animals: (A.animals || []).map(a => ({ k: a.k, x: a.spr.x, y: a.spr.y, walking: !!a.tgt, anim: a.spr.anims.isPlaying })), breath: (A.breath || []).length, less: less() } : null; }
  window.AnimFX = { less, setLess, chestOpen, opened, preloadIcons, stats, breathe, RCOL };
  (function hook() {
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 50);
    const on = (name, fn) => { const s = g.scene.getScene(name); if (s) s.events.on('create', () => { try { fn(s); } catch (e) { console.warn('AnimFX ' + name, e); } }); };
    on('Yard', setupYard); on('Welt', setupWelt); on('Room', setupRoom);
    on('Dungeon', sc => { sc.__afx = { breath: [] }; if (!sc.cache.json.get('afx_meta')) { sc.load.json('afx_meta', BASE + 'anim.json'); sc.load.start(); } });
    g.scene.getScenes(true).forEach(s => { if (!s.__afx && s.sys.settings.key === 'Yard' && s.cache.json.get('town')) setupYard(s); });   // сцена уже создана до этого файла
  })();
})();
