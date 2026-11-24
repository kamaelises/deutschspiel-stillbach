// Идеал (Wiesenland) 24.11 — «жизнь» континента Welt поверх запечённой карты (overworld.js не трогает: только events.on('create') сцены Welt).
// 1) ветер в кронах: копия верхней части дерева из world_atlas (setCrop) сдвигается на 1 пиксель арта (x3) — пул, только деревья в кадре
// 2) тени по солнцу WorldTime (как light.js у героя): пиксельный овал у основания дерева/камня/дома, утром на запад, вечером на восток; сам предмет из тени вырезан
//    ночью — окна хуторов светятся (стёкла из пикселей дома, тёплый цвет), сила = темнота time_fx
// 3) куры у первого хутора, овцы у второго (craftpix farm_animals из assets_v3/anim, как в деревне); тап — слово с артиклем
// «Weniger Animation»: ветер стоит, животные в покое. Всё x3 NEAREST, без blur.
(function () {
  const SC = 3, BASE = 'assets_v3/anim/';
  const less = () => document.body.classList.contains('lessAnim');
  const clamp = v => Math.max(0, Math.min(1, v));
  const darkK = sc => clamp((0.8 - (sc.__tfx ? sc.__tfx.L : 1)) / 0.5);
  function sunDx(sc) {                                              // -3..3 пикселя арта; ночью 0
    const n = window.WorldTime && WorldTime.now && WorldTime.now(); if (!n) return 0;
    if ((sc.__tfx ? sc.__tfx.L : 1) < 0.35) return 0;
    return Math.round(Math.max(-1, Math.min(1, (n.hour + n.minute / 60 - 13) / 6)) * 3);
  }
  const SHADOW_KEY = /^(tree|boulder|rock|house2|stump|well|cart|barrel)/;
  // ---- тени: текстура на (ключ, сдвиг)
  // один атлас 'wsp_sh' на все (ключ x сдвиг -3..3): одна текстура -> один пакет отрисовки (телефон)
  function shadowAtlas(sc, F) {
    if (sc.textures.exists('wsp_sh')) return;
    const A = sc.textures.get('world_atlas').getSourceImage(), keys = Object.keys(F.frames).filter(k => SHADOW_KEY.test(k)), W = 2048, lay = [];
    let x = 0, y = 0, rh = 0;
    keys.forEach(k => { const f = F.frames[k]; for (let dx = -3; dx <= 3; dx++) { const w = f[2] + 10, h = f[3] + 3; if (x + w > W) { x = 0; y += rh + 1; rh = 0; } lay.push([k, dx, x, y, w, h]); x += w + 1; rh = Math.max(rh, h); } });
    const c = document.createElement('canvas'); c.width = W; c.height = y + rh + 1; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    lay.forEach(([key, dx, x0, y0, W1, H1]) => { const f = F.frames[key], ox = 5;
      const big = /^house/.test(key), cx = ox + f[2] / 2 + dx * 1.7, cy = f[3] - (big ? 4 : 1), rx = f[2] * (big ? 0.42 : 0.34) + Math.abs(dx), ry = Math.max(2, Math.round(f[3] * (big ? 0.06 : 0.05)));
      g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgb(30,44,20)';
      for (let yy = Math.floor(cy - ry); yy <= Math.ceil(cy + ry); yy++) for (let xx = Math.floor(cx - rx); xx <= Math.ceil(cx + rx); xx++) {
        const u = (xx + 0.5 - cx) / rx, v = (yy + 0.5 - cy) / ry; if (u * u + v * v <= 1 && xx >= 0 && yy >= 0 && xx < W1 && yy < H1) g.fillRect(x0 + xx, y0 + yy, 1, 1); }
      g.globalCompositeOperation = 'destination-out'; g.drawImage(A, f[0], f[1], f[2], f[3], x0 + ox, y0, f[2], f[3]); });   // предмет сам не темнеет
    g.globalCompositeOperation = 'source-over';
    sc.textures.addCanvas('wsp_sh', c); const t = sc.textures.get('wsp_sh'); t.setFilter(Phaser.Textures.FilterMode.NEAREST);
    lay.forEach(([k, dx, x0, y0, w, h]) => t.add(k + '_' + dx, 0, x0, y0, w, h));
  }
  // ---- окна хуторов: стёкла (тёмные пиксели в рамах house2) -> тёплый свет
  function winTex(sc, F, key) {
    const tk = 'wsp_win_' + key; if (sc.textures.exists(tk)) return tk;
    const f = F.frames[key], A = sc.textures.get('world_atlas').getSourceImage();
    const c = document.createElement('canvas'); c.width = f[2]; c.height = f[3]; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(A, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
    const im = g.getImageData(0, 0, f[2], f[3]), p = im.data, out = g.createImageData(f[2], f[3]), o = out.data;
    for (const [x0, y0, x1, y1] of [[88, 80, 102, 94], [109, 113, 121, 127]]) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const k = (y * f[2] + x) * 4; if (p[k + 3] < 200 || (p[k] + p[k + 1] + p[k + 2]) / 3 >= 70) continue;
      const top = (y - y0) % 5 === 0; o[k] = 255; o[k + 1] = top ? 236 : 206; o[k + 2] = top ? 160 : 112; o[k + 3] = 255; }
    g.clearRect(0, 0, f[2], f[3]); g.putImageData(out, 0, 0); sc.textures.addCanvas(tk, c); sc.textures.get(tk).setFilter(Phaser.Textures.FilterMode.NEAREST); return tk;
  }
  // ---- животные
  const ANIM = { chick: ['das', 'Küken', 'цыплёнок', 16], rooster: ['der', 'Hahn', 'петух', 32], lamb: ['das', 'Lamm', 'ягнёнок', 32], sheep: ['das', 'Schaf', 'овца', 32] };
  const DIRS = ['down', 'up', 'left', 'right'];
  function walkable(sc, x, y) { const M = sc.townMask; if (!M) return false; const r = M.mask[Math.floor(y / M.cell)]; return !!r && r[Math.floor(x / M.cell)] === '1'; }
  function okAt(sc, x, y, r) {                                      // проходимо и не у таблички хутора (животное не заходит на подпись)
    if ((sc.world.signs || []).some(s => x > s.x * SC - 40 && x < s.x * SC + 288 + 40 && y > s.y * SC - 50 && y < s.y * SC + 114 + 60)) return false;
    if ((sc.world.npcs || []).some(n => x > (n.x - 22) * SC && x < (n.x + n.w + 22) * SC && y > (n.y - 4) * SC && y < (n.y + n.h + 38) * SC)) return false;   // не под ногами у жителя (и его реплики)
    return [[0, 0], [-r, 0], [r, 0], [0, -6]].every(([dx, dy]) => walkable(sc, x + dx, y + dy)); }
  function animals(sc, P) {
    const d = sc.world, X = v => v * SC, S3 = v => Math.round(v / 3) * 3; P.animals = [];
    Object.keys(ANIM).forEach(k => { if (!sc.textures.exists('afx_' + k)) return;
      DIRS.forEach((dd, r) => { const wk = `afx-${k}-walk-${dd}`, ik = `afx-${k}-idle-${dd}`;
        if (!sc.anims.exists(wk)) sc.anims.create({ key: wk, frames: sc.anims.generateFrameNumbers('afx_' + k, { start: r * 6, end: r * 6 + 5 }), frameRate: 9, repeat: -1 });
        if (!sc.anims.exists(ik)) sc.anims.create({ key: ik, frames: sc.anims.generateFrameNumbers('afx_' + k, { start: (4 + r) * 6, end: (4 + r) * 6 + 3 }), frameRate: 4, repeat: -1 }); }); });
    const herds = [['rooster', 'chick', 'chick'], ['sheep', 'lamb', 'sheep']];
    d.zones.filter(z => z.act === 'hamlet').forEach((z, hi) => {
      const hx = X(z.x1) + 40, hy = X(z.y1) + 75;                    // справа перед домом, под двором (колодец/телега); табличка — слева, туда не ходят
      (herds[hi % 2]).forEach((k, i) => {
        if (!sc.textures.exists('afx_' + k)) return; const r = ANIM[k][3] > 16 ? 18 : 9;
        let p = null; for (let dd = 0; dd < 200 && !p; dd += 12) for (let a = 0; a < 8 && !p; a++) { const x = S3(hx - i * 40 + Math.cos(a * Math.PI / 4) * dd), y = S3(hy + Math.sin(a * Math.PI / 4) * dd); if (okAt(sc, x, y, r)) p = [x, y]; }
        if (!p) return;
        const spr = sc.add.sprite(p[0], p[1], 'afx_' + k, 24).setOrigin(0.5, 1).setScale(3).setDepth(p[1]); spr.__afx = 1; spr.animal = k;
        const a = { k, spr, home: p, tgt: null, dir: 'down', wait: 8 + i * 9 + hi * 5, r, rng: r > 9 ? 90 : 60 };
        if (!less()) spr.play({ key: `afx-${k}-idle-down`, startFrame: i % 4 });
        spr.setInteractive({ useHandCursor: true }).on('pointerup', () => { if (sc.__dragged) return; const w = ANIM[k]; if (window.speakDE) speakDE(w[0] + ' ' + w[1]); if (window.toast) toast(w[0] + ' ' + w[1] + ' · ' + w[2], 1500); a.tgt = null; a.wait = 25; });
        P.animals.push(a);
      });
    });
    P.animalEv = sc.time.addEvent({ delay: 100, loop: true, callback: () => {
      const L = less();
      for (const a of P.animals) { const s = a.spr;
        if (L) { if (s.anims.isPlaying) { s.anims.stop(); s.setFrame((4 + DIRS.indexOf(a.dir)) * 6); } a.tgt = null; continue; }
        if (a.tgt) { const dx = a.tgt[0] - s.x, dy = a.tgt[1] - s.y, dd = Math.hypot(dx, dy);
          if (dd <= 3) { s.setPosition(a.tgt[0], a.tgt[1]); a.tgt = null; a.wait = 15 + Math.floor(Math.random() * 40); s.play(`afx-${a.k}-idle-${a.dir}`, true); }
          else { const nx = S3(s.x + dx / dd * 3), ny = S3(s.y + dy / dd * 3); if (okAt(sc, nx, ny, a.r)) s.setPosition(nx, ny); else { a.tgt = null; a.wait = 10; s.play(`afx-${a.k}-idle-${a.dir}`, true); } }
          s.setDepth(s.y); }
        else if (a.wait > 0) { a.wait--; if (!s.anims.isPlaying) s.play(`afx-${a.k}-idle-${a.dir}`, true); }
        else { for (let t = 0; t < 6 && !a.tgt; t++) { const tx = S3(a.home[0] + (Math.random() * 2 - 1) * a.rng), ty = S3(a.home[1] + (Math.random() * 2 - 1) * a.rng * 0.6);
            let ok = okAt(sc, tx, ty, a.r); for (let q = 1; ok && q < 6; q++) ok = okAt(sc, s.x + (tx - s.x) * q / 6, s.y + (ty - s.y) * q / 6, a.r);
            const w = sc.walker; if (ok && w && Math.hypot(tx - w.x, ty - w.y) < 50) ok = false;
            if (ok) { a.tgt = [tx, ty]; const dx = tx - s.x, dy = ty - s.y; a.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'); s.play(`afx-${a.k}-walk-${a.dir}`, true); } }
          if (!a.tgt) a.wait = 20; }
      } } });
  }
  // ---- сцена
  function setup(sc) {
    const d = sc.world, F = sc.cache.json.get('world_atlas_json'); if (!d || !F) return;
    const P = sc.__wsp = { crowns: [], shadows: [], wins: [], animals: [], stat: { crownsVis: 0, shadowsVis: 0 } }, X = v => v * SC;
    // объекты по корзинам 256 px мира 1x — быстрый поиск видимых
    const BK = 256, grid = new Map(), add = (e) => { const k = (e.o.x / BK | 0) + ',' + (e.o.y / BK | 0); (grid.get(k) || grid.set(k, []).get(k)).push(e); };
    d.draws.forEach(o => { if (o.skip) return; const tree = /^tree/.test(o.key), sh = o.shadow && SHADOW_KEY.test(o.key); if (tree || sh) add({ o, tree, sh }); });
    // 24.11 замер (_ws_probe.cjs, 412x860 CPU 4x, лес): кроны (16 шт.) и тени (17 шт.) по отдельности роняют fps 56 -> 39..47, шаг JS +0.1 мс —
    // цена в растре, не в коде. До разбора — выключены (включить для опытов: ?wsp=1). Животные и окна — без потерь fps.
    const ON = /[?&]wsp=1/.test(location.search), POOL_C = ON ? 60 : 0, POOL_S = ON ? 140 : 0;
    for (let i = 0; i < POOL_C; i++) { const im = sc.add.image(0, 0, 'world_atlas', 'tree0').setOrigin(0, 0).setScale(SC).setDepth(-9.5).setVisible(false); im.__wsp = 1; P.crowns.push({ im, t: null, off: 0 }); }
    if (ON) shadowAtlas(sc, F);
    for (let i = 0; i < POOL_S; i++) { const im = sc.add.image(0, 0, 'wsp_sh', 'tree0_0').setOrigin(0, 0).setScale(SC).setDepth(-9.7).setVisible(false); im.__wsp = 1; P.shadows.push({ im, t: null }); }
    const OD = () => (window.TimeFX ? TimeFX.OVER_D : 20000);         // как fx.js: окна над ночной тонировкой time_fx, подписи всё равно выше (UI_BUMP)
    if (!sc.textures.exists('wsp_pool')) { const c = document.createElement('canvas'); c.width = 36; c.height = 12; const g = c.getContext('2d');   // пятно света под окном: 3 ступени, без размытия
      [[18, 6, 'rgb(46,30,8)'], [13, 4.4, 'rgb(70,46,12)'], [8, 2.8, 'rgb(96,64,18)']].forEach(([rx, ry, col]) => { g.fillStyle = col; for (let y = 0; y < 12; y++) for (let x = 0; x < 36; x++) { const u = (x + 0.5 - 18) / rx, v = (y + 0.5 - 6) / ry; if (u * u + v * v <= 1) g.fillRect(x, y, 1, 1); } });
      sc.textures.addCanvas('wsp_pool', c); }
    d.draws.forEach(o => { if (!/^house2/.test(o.key)) return; const im = sc.add.image(X(o.x), X(o.y), winTex(sc, F, o.key)).setOrigin(0, 0).setScale(SC).setDepth(OD() + 1).setAlpha(0).setVisible(false); im.__wsp = 1; P.wins.push(im);
      const pl = sc.add.image(X(o.x + 115), X(o.y + o.h - 6), 'wsp_pool').setOrigin(0.5, 0.5).setScale(SC).setBlendMode(Phaser.BlendModes.ADD).setDepth(OD() + 1).setAlpha(0).setVisible(false); pl.__wsp = 1; P.wins.push(pl); });
    let lastV = '', lastDx = null, lastSa = null;
    const assign = (force) => {
      const v = sc.cameras.main.worldView, m = 60, x0 = (v.x - m) / SC, y0 = (v.y - m) / SC, x1 = (v.right + m) / SC, y1 = (v.bottom + m) / SC;
      const dx = sunDx(sc), sa = (sc.__tfx ? sc.__tfx.L : 1) < 0.35 ? 0.14 : 0.26, key = [x0 | 0, y0 | 0, x1 | 0, y1 | 0].join(',');
      if (!force && key === lastV && dx === lastDx && sa === lastSa) return; lastV = key; lastDx = dx; lastSa = sa;
      const vis = []; for (let by = Math.floor((y0 - 160) / BK); by <= Math.floor(y1 / BK); by++) for (let bx = Math.floor((x0 - 160) / BK); bx <= Math.floor(x1 / BK); bx++) { const L = grid.get(bx + ',' + by); if (L) for (const e of L) { const o = e.o; if (o.x + o.w >= x0 && o.x <= x1 && o.y + o.h >= y0 && o.y <= y1) vis.push(e); } }
      let ci = 0, si = 0;
      for (const e of vis) { const o = e.o;
        if (e.tree && ci < POOL_C) { const c = P.crowns[ci++]; if (c.t !== o) { c.t = o; c.off = 0; c.im.setFrame(o.key).setPosition(X(o.x), X(o.y)); c.im.setCrop(0, 0, o.w, Math.round(o.h * 0.58)); c.ph = (o.x * 0.047 + o.y * 0.013) % (Math.PI * 2); c.sp = 0.8 + ((o.x * 7 + o.y) % 5) * 0.07; } c.im.setVisible(true); }
        if (e.sh && si < POOL_S) { const s = P.shadows[si++], tk = o.key + '_' + dx; if (s.t !== o || s.tk !== tk) { s.t = o; s.tk = tk; s.im.setFrame(tk).setPosition(X(o.x - 5), X(o.y)); } s.im.setAlpha(sa).setVisible(true); } }
      for (let i = ci; i < POOL_C; i++) { const c = P.crowns[i]; if (c.t) { c.t = null; c.im.setVisible(false); } }
      for (let i = si; i < POOL_S; i++) { const s = P.shadows[i]; if (s.t) { s.t = null; s.im.setVisible(false); } }
      P.stat.crownsVis = ci; P.stat.shadowsVis = si;
    };
    const windTick = () => {
      const L = less(), t = sc.time.now / 1000, gust = 0.72 + 0.28 * Math.sin(t * 0.37);   // порыв: сильнее/тише, но без полного штиля
      const map = P.map || (P.map = (sc.children.list || []).find(o => o.type === 'Image' && /^welt_map/.test(o.texture && o.texture.key))), tt = map && map.isTinted ? map.tintTopLeft : 0xffffff;
      if (tt !== P.tint) { P.tint = tt; P.crowns.forEach(c => (tt === 0xffffff ? c.im.clearTint() : c.im.setTint(tt))); }   // сезонный тон карты (time_fx) — тот же у крон
      for (const c of P.crowns) { if (!c.t) continue; let off = 0;
        if (!L) { const v = Math.sin(t * c.sp - c.ph) * gust; off = v > 0.5 ? 1 : v < -0.85 ? -1 : 0; }   // чаще по ветру (вправо), реже обратно; 1 пиксель арта
        if (off !== c.off) { c.off = off; c.im.x = X(c.t.x) + off * SC; } }
      const k = darkK(sc); for (const w of P.wins) { const a = Math.round(k * 10) / 10 * 0.95; if (w.alpha !== a) w.setAlpha(a); w.setVisible(a > 0.02); }
    };
    assign(true); windTick();
    P.assignEv = sc.time.addEvent({ delay: 400, loop: true, callback: () => assign(false) });
    P.windEv = sc.time.addEvent({ delay: 170, loop: true, callback: windTick });
    P.reassign = () => assign(true);
    // животные: листы craftpix (те же ключи, что у деревни)
    const need = []; Object.keys(ANIM).forEach(k => { if (!sc.textures.exists('afx_' + k)) { sc.load.spritesheet('afx_' + k, BASE + k + '.png', { frameWidth: ANIM[k][3], frameHeight: ANIM[k][3] }); need.push(k); } });
    const go = () => { if (sc.__wsp === P && sc.sys && sc.sys.isActive()) animals(sc, P); };
    if (need.length) { sc.load.once('complete', go); sc.load.start(); } else go();
  }
  function stats() { const g = window.game, sc = g && g.scene.getScene('Welt'), P = sc && sc.__wsp; if (!P) return null;
    return { crowns: P.crowns.filter(c => c.t).length, crownsMoved: P.crowns.filter(c => c.t && c.off).length, shadows: P.shadows.filter(s => s.t).length, sunDx: sunDx(sc), wins: P.wins.length, winAlpha: P.wins.map(w => w.visible ? w.alpha : 0), animals: P.animals.map(a => [a.k, Math.round(a.spr.x), Math.round(a.spr.y)]) }; }
  function pause(on) {                                              // замер A/B в одной странице: всё welt_plus выключено / включено
    const sc = window.game && game.scene.getScene('Welt'), P = sc && sc.__wsp; if (!P) return false;
    [P.assignEv, P.windEv, P.animalEv].forEach(e => { if (e) e.paused = !!on; });
    if (on) { P.crowns.forEach(c => { c.t = null; c.im.setVisible(false); }); P.shadows.forEach(s => { s.t = null; s.im.setVisible(false); }); P.wins.forEach(w => w.setVisible(false)); P.animals.forEach(a => a.spr.setVisible(false)); }
    else { P.animals.forEach(a => a.spr.setVisible(true)); P.reassign(); }
    return true;
  }
  window.WeltPlus = { stats, pause, reassign: () => { const sc = window.game && game.scene.getScene('Welt'); if (sc && sc.__wsp) sc.__wsp.reassign(); } };
  (function hook() {
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 50);
    const sc = g.scene.getScene('Welt'); if (!sc) return setTimeout(hook, 100);
    sc.events.on('create', () => { try { setup(sc); } catch (e) { console.warn('welt_plus', e); } });
  })();
})();
