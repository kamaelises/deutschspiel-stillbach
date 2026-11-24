// Идеал (тени/интерьеры) 24.11 — shade.js. Чужие файлы не правит: только events.on('create') сцен Yard / Ort / Room.
// 1) Тени домов Stillbach по солнцу (WorldTime): дома запечены в town_bg, поэтому тени — отдельный слой (одна canvas-текстура 960x1008,
//    1 пиксель = 3 px мира, scale 3) сразу над фоном. Утром тень падает на запад (влево-вверх), вечером на восток, в полдень — только
//    короткая тень у фасада. Направление/длина — 7 ступеней, плотность — 3 ступени по яркости дня, два тона (ядро у стены + край).
//    Ночью теней нет. Тени не ложатся на запечённые дома (их box из town.json вырезан). Здания A1 (a1_*) тоже отбрасывают тень.
// 2) Свет в интерьерах (Ort: Bäckerei, Café, Supermarkt, Gildenhaus; Room — комната Max): днём тёплые пятна от окон/двери на полу,
//    вечером и ночью — лампы и свечи (ADD над тонировкой time_fx.js), свечи мерцают ступенями; печь в Bäckerei горит всегда.
//    der Adventskranz (ort.js, decor.json): свет над горящими свечами (число = прошедшие воскресенья Адвента), огонёк 3 кадра;
//    «Weniger Animation» (AnimFX.less()): мерцание и огонёк стоят. Отладка: window.Shade.stats(scene).
(function () {
  const R3 = v => Math.round(v / 3) * 3, WT = () => window.WorldTime;
  const less = () => !!(window.AnimFX && AnimFX.less && AnimFX.less());
  const OVER = () => (window.TimeFX ? TimeFX.OVER_D : 20000) + 1;
  const NEAR = () => (window.Phaser && Phaser.Textures && Phaser.Textures.FilterMode ? Phaser.Textures.FilterMode.NEAREST : 1);
  const near = (sc, k) => { try { sc.textures.get(k).setFilter(NEAR()); } catch (e) {} return k; };
  function lightNow() { const W = WT(); if (!W) return null; const n = W.now(); return { n, L: W.light ? W.light(n.date) : 1, h: n.hour + n.minute / 60 }; }

  // ---------------- 1) тени домов
  // 24.11 23:00 ВЫКЛЮЧЕНО (главный): тень по box стен ложилась на крыши/навесы (box уже силуэта). Включать только с маской силуэта домов.
  const HOUSE_SHADOWS = false;
  function sun() {
    const t = lightNow(); if (!t) return null;
    if (t.L < 0.35) return { key: 'off', on: false };
    const s = Math.max(-1, Math.min(1, (t.h - 13) / 6)), step = Math.round(s * 3), a = t.L < 0.55 ? 0 : t.L < 0.8 ? 1 : 2;
    return { key: step + '_' + a, on: true, step, a };
  }
  function casters(sc, T) {
    const baked = [], all = [];
    Object.values(T.buildings || {}).forEach(b => b.box && baked.push(b.box));   // запечённые дома: box стен (у Bäckerei — без навеса и бочек)
    (T.houses || []).filter(h => !h.plot && h.box).forEach(h => baked.push(h.box));
    baked.forEach(b => all.push(b));
    (sc.children.list || []).forEach(o => {
      if (o.type !== 'Image' || !o.active || !o.visible || !/^a1_(?!stake)/.test(o.texture && o.texture.key) || o.displayWidth < 60 || o.displayHeight < 60) return;
      const x0 = o.x - o.originX * o.displayWidth, y0 = o.y - o.originY * o.displayHeight; all.push([x0, y0, x0 + o.displayWidth, y0 + o.displayHeight]);
    });
    return { baked, all };
  }
  function drawShadows(sc, st, T, S) {
    const W = Math.ceil(T.w / 3), H = Math.ceil(T.h / 3);
    if (!st.tex) { const k = 'shd_houses_' + Math.random().toString(36).slice(2, 7); st.tex = sc.textures.createCanvas(k, W, H); near(sc, k); st.key = k; }
    const cv = st.tex.getCanvas ? st.tex.getCanvas() : st.tex.canvas, x = st.tex.getContext(); x.clearRect(0, 0, W, H);
    if (!S.on) { st.tex.refresh(); return 0; }
    const m = st.mask || (st.mask = document.createElement('canvas')); m.width = W; m.height = H; const g = m.getContext('2d');
    g.clearRect(0, 0, W, H); g.globalCompositeOperation = 'lighten';
    const C = casters(sc, T); let n = 0;
    const poly = (pts, v) => { g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px / 3, py / 3) : g.moveTo(px / 3, py / 3)); g.closePath(); g.fill(); };
    C.all.forEach(([x0, y0, x1, y1]) => {
      const Hh = y1 - y0, Ww = x1 - x0, st3 = Math.abs(S.step), yt = y0 + Hh * 0.34, yb = y1 - 3;
      // контакт у фасада (всегда, кроме ночи): полоса 2 пикселя арта под стеной
      poly([[x0 + 6, yb], [x1 - 6, yb], [x1 - 6, yb + 6], [x0 + 6, yb + 6]], 200); n++;
      if (!st3) return;
      const len = R3(Math.min(Hh * 0.5, 150) * st3 / 3), half = R3(len * 0.45), drop = (yb - yt) * 0.4;   // верх тени скошен к земле (силуэт крыши), низ — по земле у стены
      const side = L => { const d = drop * L / len; return S.step < 0
        ? [[x0 + 3, yt], [x0 - L, yt + d], [x0 - L, yb + 3], [x0 + 3, yb + 3]]
        : [[x1 - 3, yt], [x1 + L, yt + d], [x1 + L, yb + 3], [x1 - 3, yb + 3]]; };
      poly(side(len), 100); poly(side(half), 200);
    });
    g.globalCompositeOperation = 'source-over';
    C.baked.forEach(([x0, y0, x1, y1]) => g.clearRect(Math.floor(x0 / 3), Math.floor(y0 / 3), Math.ceil((x1 - x0) / 3), Math.ceil((y1 - y0) / 3)));
    const src = g.getImageData(0, 0, W, H).data, out = x.createImageData(W, H), o = out.data;
    const A_OUT = [32, 44, 56][S.a], A_IN = [56, 72, 90][S.a];   // 0..255: край / ядро
    for (let i = 0; i < src.length; i += 4) { const v = src[i]; if (v < 50) continue; o[i] = 15; o[i + 1] = 28; o[i + 2] = 8; o[i + 3] = v >= 150 ? A_IN : A_OUT; }
    x.putImageData(out, 0, 0); st.tex.refresh(); return n;
  }
  function setupYard(sc) {
    if (!HOUSE_SHADOWS) { sc.__shd = { off: 1 }; return; }
    const T = sc.cache.json.get('town'); if (!T) return;
    const st = sc.__shd = { tex: null, img: null, key: '', last: '', nCast: -1, n: 0 };
    const tick = () => {
      if (sc.__shd !== st || !sc.sys || !sc.sys.isActive()) return;
      const bg = (sc.children.list || []).find(o => o.type === 'Image' && o.texture && o.texture.key === 'town_bg'); if (!bg) return;
      const S = sun(); if (!S) return; const nc = casters(sc, T).all.length;
      if (S.key === st.last && nc === st.nCast && st.img) return;
      st.last = S.key; st.nCast = nc; st.n = drawShadows(sc, st, T, S); st.on = S.on; st.state = S;
      if (!st.img) { st.img = sc.add.image(0, 0, st.key).setOrigin(0, 0).setScale(3); st.img.__lfx = 1; st.img.__tfx = 1; }
      st.img.setDepth(bg.depth + 0.5).setVisible(S.on);
    };
    setTimeout(tick, 0); setTimeout(tick, 1000);
    const ev = sc.time.addEvent({ delay: 1500, loop: true, callback: tick });
    sc.events.once('shutdown', () => { ev.remove(); if (st.tex) { try { sc.textures.remove(st.key); } catch (e) {} } sc.__shd = null; });
  }

  // ---------------- 2) свет в интерьерах (px мира; сетка style_pick/shade/_g_*.png)
  // win: [cx, yTop, w, h] — пятно дня на полу (от окна/двери); lamp: [x, y, R(px арта), kind] kind: candle (мерцает) | lamp | oven (горит всегда)
  const ROOMS = {
    baeckerei: { win: [[194, 237, 66, 72], [429, 237, 66, 72]], lamp: [[306, 150, 24, 'oven'], [300, 556, 16, 'candle'], [130, 400, 12, 'lamp'], [490, 400, 12, 'lamp']] },
    cafe: { win: [[384, 414, 108, 84]], lamp: [[130, 168, 14, 'candle'], [130, 330, 14, 'candle'], [384, 186, 16, 'candle'], [740, 60, 12, 'lamp']] },
    supermarkt: { win: [[456, 414, 108, 84]], lamp: [[300, 330, 16, 'candle'], [669, 112, 12, 'lamp'], [264, 66, 12, 'lamp'], [520, 66, 12, 'lamp']] },
    buergeramt: { win: [[505, 520, 108, 72]], lamp: [[538, 306, 16, 'candle'], [722, 172, 12, 'lamp'], [290, 136, 12, 'lamp'], [100, 330, 12, 'lamp'], [905, 330, 12, 'lamp']] },
    room: { win: [[385, 145, 60, 66], [481, 145, 60, 66]], lamp: [[469, 370, 16, 'candle'], [810, 135, 12, 'lamp']] },
  };
  function poolTex(sc, w, h) {                                     // пятно дня: трапеция, расширяется к полу, 3 ступени яркости (px арта)
    w = Math.max(6, Math.round(w / 3)); h = Math.max(6, Math.round(h / 3)); const k = `shd_pool_${w}_${h}`, T = sc.textures; if (T.exists(k)) return k;
    const c = T.createCanvas(k, w + 8, h), x = c.getContext();
    for (let j = 0; j < h; j++) { const t = j / h, half = (w / 2) + 4 * t, a = t < 0.34 ? 0.5 : t < 0.67 ? 0.34 : 0.2, cx = (w + 8) / 2;
      x.fillStyle = `rgba(255,214,150,${a})`; x.fillRect(Math.round(cx - half), j, Math.round(half * 2), 1); }
    c.refresh(); return near(sc, k);
  }
  function wreath(sc) { return (sc.children.list || []).find(o => o.decor && o.decor.key === 'adventskranz'); }
  function setupIn(sc) {
    const key = sc.scene.key === 'Room' ? 'room' : sc.placeKey, R = ROOMS[key]; if (!R || !window.LightFX) return;
    const st = sc.__shd = { pools: [], lamps: [], wr: null, wrGlow: null, key };
    R.win.forEach(([cx, y, w, h]) => { const k = poolTex(sc, w, h), im = sc.add.image(0, R3(y), k).setOrigin(0, 0).setScale(3).setBlendMode(Phaser.BlendModes.ADD).setDepth(1); im.x = R3(cx - im.displayWidth / 2); im.__lfx = 1; im.__tfx = 1; st.pools.push(im); });   // пятно на полу: depth 1 — под героем (depth = y), над фоном (-10)
    R.lamp.forEach(([x, y, r, kind], i) => { const im = sc.add.image(R3(x - r * 3), R3(y - r * 3), LightFX.glowTex(sc, r)).setOrigin(0, 0).setScale(3).setBlendMode(Phaser.BlendModes.ADD).setDepth(OVER()); im.__lfx = 1; im.__tfx = 1; st.lamps.push({ im, kind, i }); });
    const FL = [1, 0.86, 1, 0.74, 0.94, 0.82];
    const tick = () => {
      if (sc.__shd !== st || !sc.sys || !sc.sys.isActive()) return;
      const t = lightNow(), L = t ? t.L : 1, still = less(), f = i => still ? 0.9 : FL[Math.floor(sc.time.now / 160 + i * 2) % FL.length];
      const dayA = Math.max(0, Math.min(1, (L - 0.3) / 0.5)), nightA = Math.max(0, Math.min(1, (0.85 - L) / 0.5));
      st.pools.forEach(p => p.setAlpha(0.5 * dayA).setVisible(dayA > 0.02));
      st.lamps.forEach(({ im, kind, i }) => {
        const a = kind === 'oven' ? 0.4 + 0.35 * nightA : kind === 'candle' ? 0.55 * nightA : 0.4 * nightA;
        im.setAlpha(a * (kind === 'lamp' ? 1 : f(i))).setVisible(a > 0.02);
      });
      // der Adventskranz: свет над горящими свечами, при «Weniger Animation» огонёк стоит
      const w = st.wr && st.wr.active ? st.wr : (st.wr = wreath(sc));
      if (w && w.decor) {
        const n = w.decor.state || 0, fl = 3, f0 = n * fl;
        if (still) { if (w.anims && w.anims.isPlaying) w.anims.stop(); if (w.frame && w.frame.name !== f0) w.setFrame(f0); }
        else if (n > 0 && w.anims && !w.anims.isPlaying && w.anims.currentAnim) w.anims.play(w.anims.currentAnim.key);
        if (n > 0 && !st.wrGlow) { const r = 10 + 2 * n; st.wrGlow = sc.add.image(R3(w.x + 45 - r * 3), R3(w.y + 18 - r * 3), LightFX.glowTex(sc, r)).setOrigin(0, 0).setScale(3).setBlendMode(Phaser.BlendModes.ADD).setDepth(OVER()); st.wrGlow.__lfx = 1; st.wrGlow.__tfx = 1; }
        if (st.wrGlow) st.wrGlow.setAlpha((0.32 + 0.3 * nightA) * f(7));
      }
    };
    tick(); const ev = sc.time.addEvent({ delay: 160, loop: true, callback: tick });
    sc.events.once('shutdown', () => { ev.remove(); sc.__shd = null; });
  }

  window.Shade = {
    ROOMS,
    stats(sc) { const s = sc && sc.__shd; if (!s) return null; if (s.off) return { scene: sc.scene.key, off: true, img: false };
      if (s.pools) return { scene: sc.scene.key, place: s.key, pools: s.pools.filter(p => p.visible).length, lamps: s.lamps.filter(l => l.im.visible).length, wreath: s.wr && s.wr.decor ? s.wr.decor.state : null, wreathGlow: !!(s.wrGlow && s.wrGlow.visible), wreathPlaying: !!(s.wr && s.wr.anims && s.wr.anims.isPlaying), less: less() };
      return { scene: sc.scene.key, on: !!s.on, state: s.last, casters: s.nCast, img: !!(s.img && s.img.visible) }; },
  };
  (function hook() {
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 50);
    const y = g.scene.getScene('Yard'); if (y) y.events.on('create', () => setupYard(y));
    ['Ort', 'Room'].forEach(k => { const sc = g.scene.getScene(k); if (sc) sc.events.on('create', () => setTimeout(() => { if (sc.sys.isActive()) setupIn(sc); }, 0)); });
    g.scene.getScenes(true).forEach(sc => { if (sc.__shd) return; if (sc.scene.key === 'Yard') setupYard(sc); else if (sc.scene.key === 'Ort' || sc.scene.key === 'Room') setupIn(sc); });
  })();
})();
