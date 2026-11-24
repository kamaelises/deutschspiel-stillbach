// Код (свет/камера) 24.11 — свет и тени мира поверх сцен (чужие файлы не правит: только events.on('create') и postupdate).
// 1) Тени: гладкие эллипсы-тени (walk.js heroShadow, main.js foot(): цвет 0x0f1c08) заменены пиксельными мягкими тенями —
//    два тона (ядро + край), каждый пиксель тени = целый блок x3; враги боя (combat.js) и сундуки Wiesenland получают такие же тени.
// 2) Фон за краями карты: вместо чёрных/пустых полей — продолжение края фона (зеркало 16 пикс. арта -> ступенчатый переход
//    в средний цвет края, чуть темнее), дальше ровный цвет края. Всё на сетке x3.
// 3) Ночью/в сумерках у героя фонарь — ступенчатый пиксельный круг (ADD) над тонировкой time_fx.js: герой и дорога читаются.
// 4) Подписи мест в мире (wl_*: «die alten Steine» …) не уходят под часы/HUD: подпись съезжает ниже плашки (до ~1,5 своей высоты),
//    если её место глубже под HUD — прячется, пока камера не сдвинется.
(function () {
  const SC = { Yard: 1, Welt: 1, Room: 1, Ort: 1, Dungeon: 1, Furnish: 1 }, OUT = { Yard: 1, Welt: 1 };
  const SH_COL = 0x0f1c08, NEAR = () => (window.Phaser && Phaser.Textures && Phaser.Textures.FilterMode ? Phaser.Textures.FilterMode.NEAREST : 1);
  const near = (sc, k) => { try { sc.textures.get(k).setFilter(NEAR()); } catch (e) {} return k; };

  // ---- текстуры (процедурные, 1 пиксель текстуры = 1 пиксель арта, на экран — scale 3)
  function shadowTex(sc, w, h) {
    w = Math.max(4, Math.round(w)); h = Math.max(2, Math.round(h)); const k = `lfx_sh_${w}_${h}`, T = sc.textures; if (T.exists(k)) return k;
    const c = T.createCanvas(k, w, h), x = c.getContext();
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const dx = (i + 0.5 - w / 2) / (w / 2), dy = (j + 0.5 - h / 2) / (h / 2), r = dx * dx + dy * dy; if (r > 1.02) continue;
      x.fillStyle = r < 0.45 ? 'rgba(15,28,8,0.46)' : 'rgba(15,28,8,0.26)'; x.fillRect(i, j, 1, 1);
    }
    c.refresh(); return near(sc, k);
  }
  function glowTex(sc, R) {                                          // R пикселей арта; 4 ступени яркости, тёплый свет
    const k = 'lfx_glow_' + R, T = sc.textures; if (T.exists(k)) return k;
    const c = T.createCanvas(k, R * 2, R * 2), x = c.getContext(), BANDS = [[0.3, 'rgba(255,196,104,0.86)'], [0.55, 'rgba(255,164,72,0.5)'], [0.8, 'rgba(232,128,52,0.24)'], [1, 'rgba(200,104,40,0.09)']];
    for (let j = 0; j < R * 2; j++) for (let i = 0; i < R * 2; i++) {
      const d = Math.hypot(i + 0.5 - R, j + 0.5 - R) / R, b = BANDS.find(q => d <= q[0]); if (!b) continue; x.fillStyle = b[1]; x.fillRect(i, j, 1, 1);
    }
    c.refresh(); return near(sc, k);
  }
  window.LightFX = { glowTex, shadowTex };

  // ---- 1) тени
  // сетка x3: левый верхний угол тени/света — на кратных 3 координатах мира (как у карты), иначе ступени света режут пиксели арта
  const R3 = v => Math.round(v / 3) * 3;
  const put3 = (im, cx, cy) => im.setPosition(R3(cx - im.displayWidth / 2), R3(cy - im.displayHeight / 2));
  function shadowFor(sc, st, target, w, h, dy, depthOf) {
    const im = sc.add.image(0, 0, shadowTex(sc, w, h)).setOrigin(0, 0).setScale(3); im.__lfx = 1; put3(im, target.x, target.y + dy);
    st.sh.push({ im, t: target, dy, depthOf }); return im;
  }
  function scanShadows(sc, st) {
    (sc.children.list || []).forEach(o => {
      if (o.__lfx || o.type !== 'Ellipse' || o.fillColor !== SH_COL) return;
      o.__lfx = 1; const w = o.width * Math.abs(o.scaleX || 1) / 3, h = o.height * Math.abs(o.scaleY || 1) / 3;
      shadowFor(sc, st, o, w + 1, Math.max(3, h + 1), 4, 'same'); o.setFillStyle(SH_COL, 0);   // тень чуть ниже ступней (видна из-под героя); сам эллипс остаётся (его двигают walk.js/combat.js), но не рисуется
    });
    const E = sc.__cb && sc.__cb.enemies; if (E) E.forEach(e => { if (!e.spr || e.spr.__lfxSh) return; e.spr.__lfxSh = 1;
      shadowFor(sc, st, e.spr, Math.max(8, e.spr.displayWidth * 0.42 / 3), 4, -3, 'below'); });
    if (sc.scene.key === 'Welt' && sc.chests) sc.chests.forEach(c => { if (!c.img || c.img.__lfxSh) return; c.img.__lfxSh = 1;
      const im = sc.add.image(0, 0, shadowTex(sc, c.img.displayWidth / 3 + 2, 4)).setOrigin(0, 0).setScale(3).setDepth(c.img.depth - 1); im.__lfx = 1;
      put3(im, c.img.x + c.img.displayWidth / 2, c.img.y + c.img.displayHeight - 4); });
  }
  function syncShadows(sc, st) {
    st.sh = st.sh.filter(s => {
      if (!s.t.active || !s.t.scene) { s.im.destroy(); return false; }
      const t = s.t; put3(s.im, t.x, t.y + s.dy); s.im.setVisible(t.visible && t.alpha > 0.05).setAlpha(s.depthOf === 'same' ? 1 : t.alpha).setDepth(s.depthOf === 'same' ? t.depth : t.depth - 1);
      return true;
    });
  }

  // ---- 2) фон за краями
  function edges(sc, st) {
    (st.edge || []).forEach(o => o.destroy()); st.edge = [];
    const W = sc.worldW || 960, H = sc.worldH || 540; let bg = null, best = 0;
    (sc.children.list || []).forEach(o => { if (o.type !== 'Image' || o.__lfx || !o.frame || o.scrollFactorX !== 1) return; const a = o.displayWidth * o.displayHeight; if (a > best) { best = a; bg = o; } });
    if (!bg || best < W * H * 0.5) return;
    const fr = bg.frame, src = fr.source && fr.source.image, cw = fr.cutWidth, ch = fr.cutHeight; if (!src || cw < 8 || ch < 8) return;
    const sx = bg.displayWidth / cw, sy = bg.displayHeight / ch; if (Math.abs(sx - sy) > 0.01) return; const S = sx;
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    try { g.drawImage(src, fr.cutX, fr.cutY, cw, ch, 0, 0, cw, ch); g.getImageData(0, 0, 1, 1); } catch (e) { return; }
    const x0 = bg.x - bg.originX * bg.displayWidth, y0 = bg.y - bg.originY * bg.displayHeight, x1 = x0 + bg.displayWidth, y1 = y0 + bg.displayHeight, D = 16, FAR = 6000, dep = bg.depth - 1;
    const sides = [['top', 0, 0, cw, D], ['bottom', 0, ch - D, cw, D], ['left', 0, 0, D, ch], ['right', cw - D, 0, D, ch]];
    let n = 0; const key = s => `lfx_edge_${sc.scene.key}_${bg.texture.key}_${s}`;
    const dark = 0.86, all = [0, 0, 0];
    sides.forEach(([s, ax, ay, aw, ah]) => {
      const d = g.getImageData(ax, ay, aw, ah).data; let r = 0, gg = 0, b = 0, c = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; c++; }
      if (!c) return; const avg = [r / c, gg / c, b / c].map(v => v * dark); all[0] += avg[0]; all[1] += avg[1]; all[2] += avg[2]; n++;
      const k = key(s), T = sc.textures; if (T.exists(k)) T.remove(k);
      const horiz = s === 'top' || s === 'bottom', tw = horiz ? cw : D * 2, th = horiz ? D * 2 : ch, t = T.createCanvas(k, tw, th), x = t.getContext();
      const im = x.createImageData(tw, th), o = im.data;
      for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
        const dist = horiz ? (s === 'top' ? th - 1 - j : j) : (s === 'left' ? tw - 1 - i : i);   // 0 у края мира, растёт наружу
        const mi = Math.min(dist, D - 1), si = horiz ? i : (s === 'left' ? mi : D - 1 - mi), sj = horiz ? (s === 'top' ? mi : D - 1 - mi) : j;   // зеркало края
        const q = (sj * aw + si) * 4, step = dist < 6 ? 0.15 : dist < 12 ? 0.4 : dist < 22 ? 0.7 : 1, p = (j * tw + i) * 4;
        const mirror = d[q + 3] > 128 ? [d[q], d[q + 1], d[q + 2]] : avg;
        for (let ci = 0; ci < 3; ci++) o[p + ci] = Math.round((mirror[ci] * dark) * (1 - step) + avg[ci] * step);
        o[p + 3] = 255;
      }
      x.putImageData(im, 0, 0); t.refresh(); near(sc, k);
      const col = (Math.round(avg[0]) << 16) | (Math.round(avg[1]) << 8) | Math.round(avg[2]);
      const ext = horiz ? D * 2 * S : D * 2 * S;
      const img = s === 'top' ? sc.add.image(x0, y0 - ext, k).setOrigin(0, 0) : s === 'bottom' ? sc.add.image(x0, y1, k).setOrigin(0, 0)
        : s === 'left' ? sc.add.image(x0 - ext, y0, k).setOrigin(0, 0) : sc.add.image(x1, y0, k).setOrigin(0, 0);
      img.setScale(S).setDepth(dep); img.__lfx = 1; st.edge.push(img);
      const tt = bg.isTinted ? bg.tintTopLeft : null; if (tt != null && tt !== 0xffffff) img.setTint(tt);   // сезонный тон time_fx.js — как у фона
      const far = s === 'top' ? [x0, y0 - ext - FAR, x1 - x0, FAR] : s === 'bottom' ? [x0, y1 + ext, x1 - x0, FAR] : s === 'left' ? [x0 - ext - FAR, y0, FAR, y1 - y0] : [x1 + ext, y0, FAR, y1 - y0];
      const rc = sc.add.rectangle(far[0], far[1], far[2], far[3], col, 1).setOrigin(0, 0).setDepth(dep); rc.__lfx = 1; st.edge.push(rc);
    });
    if (n) { const col = all.map(v => Math.round(v / n)); sc.cameras.main.setBackgroundColor(`rgb(${col[0]},${col[1]},${col[2]})`); }   // углы — средний цвет краёв
  }

  // ---- 3) фонарь героя
  function lantern(sc, st) {
    if (!OUT[sc.scene.key]) return; const h = sc.walker || sc.hero; if (!h || !h.active) { if (st.lamp) st.lamp.setVisible(false); return; }
    const L = sc.__tfx ? sc.__tfx.L : 1, a = Math.max(0, Math.min(1, (0.78 - L) / 0.5));
    if (!st.lamp) { st.lamp = sc.add.image(0, 0, glowTex(sc, 34)).setOrigin(0, 0).setScale(3).setBlendMode(Phaser.BlendModes.ADD).setDepth((window.TimeFX ? TimeFX.OVER_D : 20000) + 2); st.lamp.__lfx = 1; st.lamp.__tfx = 1; }
    put3(st.lamp, h.x, h.y - 18); st.lamp.setAlpha(a * 0.3).setVisible(a > 0.02 && h.visible !== false);
  }

  // ---- 4) подписи мест не под HUD (#clock, плашка героя, цель, трекер)
  let hud = [], hudT = 0;
  function hudRects() {
    const now = Date.now(); if (now - hudT < 250) return hud; hudT = now;
    hud = ['clock', 'cbHero', 'goal', 'qTrack'].map(id => document.getElementById(id)).filter(e => e && e.offsetParent).map(e => e.getBoundingClientRect()).filter(r => r.width > 4);
    return hud;
  }
  function labels(sc, st) {
    const cam = sc.cameras.main, z = cam.zoom, wv = cam.worldView, R = hudRects();
    if (!st.lab) st.lab = (sc.children.list || []).filter(o => o.type === 'Image' && o.scrollFactorX === 1 && /^wl_(?!entry)/.test(o.texture && o.texture.key));
    st.lab.forEach(o => {
      if (!o.active) return; if (o.__homeY == null) o.__homeY = o.y;
      const w = o.displayWidth * z, hh = o.displayHeight * z, sx = (o.x - wv.x) * z + cam.x, left = sx - w * o.originX, top = (o.__homeY - o.displayHeight * o.originY - wv.y) * z + cam.y;
      let need = 0; R.forEach(r => { if (r.left < left + w && r.right > left && r.top < top + hh && r.bottom > top) need = Math.max(need, (r.bottom + 4 - top) / z); });
      const max = Math.max(o.displayHeight * 1.5, 170 / z); o.y = o.__homeY + Math.min(need, max); o.setAlpha(need > max ? 0 : 1);
    });
  }

  function setup(sc) {
    if (!SC[sc.scene.key]) return;
    const st = sc.__lfx = { sh: [], edge: [], lamp: null, lab: null };
    const later = () => { if (sc.sys && sc.sys.isActive() && sc.__lfx === st) { scanShadows(sc, st); edges(sc, st); st.lab = null; } };
    setTimeout(later, 0); setTimeout(later, 950);                       // участки A1, подписи и враги появляются позже
    const ev = sc.time.addEvent({ delay: 500, loop: true, callback: () => scanShadows(sc, st) });
    const upd = () => { if (sc.__lfx !== st) return; syncShadows(sc, st); lantern(sc, st); labels(sc, st); };
    sc.events.on('postupdate', upd);
    sc.events.once('shutdown', () => { sc.events.off('postupdate', upd); ev.remove(); sc.__lfx = null; });
  }
  (function hook() {
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 50);
    Object.keys(SC).forEach(k => { const sc = g.scene.getScene(k); if (sc) sc.events.on('create', () => setup(sc)); });
    g.scene.getScenes(true).forEach(sc => { if (SC[sc.scene.key] && !sc.__lfx) setup(sc); });
  })();
})();
