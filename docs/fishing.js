// Angeln — мини-игра рыбалки (Код (рыбалка) 24.11; прежняя версия — proto/_bak_fish/fishing.js.bak_fish).
// Ход: подойти к воде -> «Angeln!» -> держать палец (дальность) и отпустить -> der Schwimmer ждёт поклёвку 2–8 с (дёргается — рано)
// -> нырнул: «Jetzt!» за ~0,8 с (рано/поздно — рыба ушла, без потерь) -> вываживание: стрелка натяжения в зелёной зоне, рыба тянет рывками
// (сила от вида и размера) -> карточка улова «? Forelle — форель», размер в см, выбор der/die/das (ошибка ничего не отнимает, слово в «Повтор»,
// верно — монеты) -> Rucksack (ds_proto.inv: fish + Wortkarte) и альбом (Album, размер-рекорд cm).
// Вода и время: assets_v3/life/fish.json (style_pick/life/fish/build_fish.py): meer — Stillbach (der Steg, der Strand), fluss/see — Wiesenland (Welt);
// вид по сезону и фазе дня из window.WorldTime (time.js), без него — запасной расчёт по дате (localStorage 'ds_proto.debugDate').
// «Was beißt jetzt?» — какие рыбы возможны здесь и сейчас (не пойманные — силуэт и «?»).
// API: Fishing.spots(sc), start(sc, spot), close(), state(), now(), possible(water, t), data(), fight(), find(sc), debug = { bite, win, force, now, empty }.
// Событие улова: window 'ds:catch' { id, art, w, ru, cm, water, season, phase, artOk }; Quests.progress для активных заданий про рыбу.
(function () {
  const SIL = im => { im.setTint(0x1e2c14); if (window.Phaser && Phaser.TintModes && im.setTintMode) im.setTintMode(Phaser.TintModes.FILL); else if (im.setTintFill) im.setTintFill(0x1e2c14); return im.setAlpha(0.3); };
  const BASE = 'assets_v3/', COL = { der: '#3a7be0', die: '#e24848', das: '#2f9a4f' };
  const RCOL = { h: '#7d6b52', s: '#b0701a', ss: '#8e4fc4', l: '#c98a00' }, RSTAR = { h: '●', s: '★', ss: '★★', l: '★★★' };
  const F = { debug: {} }; let DATA = null;
  const dataReady = fetch(BASE + 'life/fish.json').then(r => r.json()).then(d => (DATA = d)).catch(e => { console.warn('Fishing', e); return null; });
  function syncAlbum() {                                             // раздел «die Fische» альбома = таблица fish.json (реальные виды; старые 8 картинок-фантазий убраны)
    const m = window.Album && Album.meta && Album.meta(); if (!m || !DATA || m.__fish) return; m.__fish = true;
    Object.keys(m.items).forEach(k => { if (m.items[k].sec === 'fische' && !DATA.fish[k]) delete m.items[k]; });
    Object.entries(DATA.fish).forEach(([k, v]) => { m.items[k] = { sec: 'fische', art: v.art, w: v.w, ru: v.ru, rar: v.rar, img: v.img, px: v.px }; });
  }
  const SKF = k => { try { return window.Skills && Skills.fx ? +Skills.fx(k) || 0 : 0; } catch (e) { return 0; } };   // навыки и Forschung (Код навыки 24.11)
  const loadedP = Promise.all([dataReady, window.Album ? Album.ready : null]).then(() => { syncAlbum(); return DATA; });

  // ---------- время: WorldTime (time.js) или запасной расчёт по дате устройства
  const normSeason = v => { v = String(v || '').toLowerCase(); return /fr(ü|ue)h/.test(v) ? 'fruehling' : /sommer/.test(v) ? 'sommer' : /herbst/.test(v) ? 'herbst' : /winter/.test(v) ? 'winter' : null; };
  const normPhase = v => { v = String(v || '').toLowerCase(); return /morgen/.test(v) ? 'morgen' : /abend/.test(v) ? 'abend' : /nacht/.test(v) ? 'nacht' : /tag/.test(v) ? 'tag' : null; };
  function now() {
    const o = F.debug.now; if (o) return { season: o.season, phase: o.phase, isNight: o.phase === 'nacht', src: 'debug' };
    if (window.WorldTime && WorldTime.now) { try { const t = WorldTime.now(), s = normSeason(t.season), p = normPhase(t.phase); if (s && p) return { season: s, phase: p, isNight: p === 'nacht', hour: t.hour, festivals: t.festivals || [], src: 'WorldTime' }; } catch (e) {} }
    let d = new Date(); try { const s = localStorage.getItem('ds_proto.debugDate'); if (s) { const x = new Date(s); if (!isNaN(x)) d = x; } } catch (e) {}
    const m = d.getMonth() + 1, h = d.getHours();
    const season = m >= 3 && m <= 5 ? 'fruehling' : m >= 6 && m <= 8 ? 'sommer' : m >= 9 && m <= 11 ? 'herbst' : 'winter';
    const phase = h >= 5 && h < 10 ? 'morgen' : h >= 10 && h < 17 ? 'tag' : h >= 17 && h < 21 ? 'abend' : 'nacht';
    return { season, phase, isNight: phase === 'nacht', hour: h, festivals: [], src: 'fallback' };
  }
  function possible(water, t) {
    t = t || now(); if (!DATA) return [];
    return Object.keys(DATA.fish).filter(k => { const f = DATA.fish[k]; return f.water.includes(water) && f.season.includes(t.season) && f.phase.includes(t.phase); });
  }
  function choose(water, dist, t) {                                  // вес по редкости; дальний заброс чуть чаще даёт редких
    const L = possible(water, t); if (!L.length) return null;
    const R = (window.Album && Album.meta() && Album.meta().rarity) || { h: [0, 0, 60], s: [0, 0, 28], ss: [0, 0, 10], l: [0, 0, 2] };
    const rare = 1 + SKF('fish.rare');                                // der Glückshaken / die Angel 2 (навыки, Forschung)
    const w = L.map(k => { const r = DATA.fish[k].rar; return R[r][2] * (r === 'h' ? 1 : (1 + dist) * rare); }), sum = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum; for (let i = 0; i < L.length; i++) { r -= w[i]; if (r < 0) return L[i]; } return L[L.length - 1];
  }
  function sizeOf(id, dist) { const [a, b] = DATA.fish[id].cm, r = Math.min(1, Math.pow(Math.random(), 1.6) * (0.85 + 0.3 * dist)); return Math.round(a + (b - a) * r); }

  // ---------- места у воды. Welt: сухой тайл у открытой воды (река = вода через весь мир с запада на восток, иначе озеро). Stillbach: Steg и Strand (море).
  function bodies(d, W) {                                            // связные водоёмы (тайлы воды и берега); ширина > 60 % мира — река
    if (d.__fishBodies) return d.__fishBodies;
    const { MW, MH } = W, lab = new Int32Array(MW * MH).fill(-1), info = [];
    for (let i0 = 0; i0 < MW * MH; i0++) {
      if (!d.tm[i0] || lab[i0] >= 0) continue;
      const id = info.length, st = [i0]; let minx = MW, maxx = 0; lab[i0] = id;
      while (st.length) { const i = st.pop(), x = i % MW, y = (i / MW) | 0; if (x < minx) minx = x; if (x > maxx) maxx = x;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= MW || b >= MH) return; const j = b * MW + a; if (d.tm[j] && lab[j] < 0) { lab[j] = id; st.push(j); } }); }
      info.push({ minx, maxx, kind: maxx - minx > MW * 0.6 ? 'fluss' : 'see' });
    }
    return (d.__fishBodies = { lab, info });
  }
  function findSpots(sc) {                                           // сухой тайл травы/песка, рядом (1–2 тайла по прямой) — открытая вода; маска вокруг свободна
    const d = sc.world, W = window.WELT; if (!d || !W) return [];
    const { MW, MH, T, SC, CELL } = W, M = d.mask, X = v => v * SC, k = T / CELL;
    const cellOk = (cx, cy) => cy >= 0 && cy < M.length && cx >= 0 && cx < M[0].length && M[cy][cx] === '1';
    const water = (tx, ty) => tx >= 0 && ty >= 0 && tx < MW && ty < MH && d.tm[ty * MW + tx] === 15;
    const home = sc.home || { x: X(d.spawn[0]), y: X(d.spawn[1]) };
    const busy = [].concat((sc.pois || []).map(p => [p.x, p.y]), (sc.npcs || []).map(n => [n.x, n.y]), (sc.chests || []).map(c => [c.x, c.y]), (sc.spawns || []).map(s => [s.x, s.y]));
    const B = bodies(d, W), cand = [];
    const dry = (tx, ty) => { if (tx < 2 || ty < 2 || tx >= MW - 2 || ty >= MH - 2) return false; const i = ty * MW + tx; if (d.tm[i] || d.kind[i]) return false;
      for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) if (!cellOk(tx * k + xx, ty * k + yy)) return false; return true; };
    const nearBridge = (tx, ty) => (d.br || []).some(b => Math.abs(b.x / T - tx) < 4 && ty >= b.y / T - 4 && ty <= (b.y + b.h) / T + 4);
    for (let ty = 2; ty < MH - 2; ty++) for (let tx = 2; tx < MW - 2; tx++) {
      if (!dry(tx, ty)) continue;                                    // A: тут стоит Max
      const dir = [[0, -1], [1, 0], [-1, 0], [0, 1]].find(([dx, dy]) => water(tx + dx, ty + dy) || water(tx + 2 * dx, ty + 2 * dy));
      if (!dir || nearBridge(tx, ty)) continue;
      const Bt = dir[0] ? [tx, ty + 1] : [tx + 1, ty];               // соседний сухой тайл вдоль берега — бочка
      if (!dry(Bt[0], Bt[1])) continue;
      const x = X(tx * T + T / 2), y = X(ty * T + T - 4);
      if (busy.some(([bx, by]) => Math.hypot(bx - x, by - y) < 140)) continue;
      const wt = water(tx + dir[0], ty + dir[1]) ? [tx + dir[0], ty + dir[1]] : [tx + 2 * dir[0], ty + 2 * dir[1]], b = B.lab[wt[1] * MW + wt[0]];
      cand.push({ x, y, tx, ty, dir, B: Bt, bx: X(Bt[0] * T + T / 2), by: X(Bt[1] * T + T - 2), dist: Math.hypot(x - home.x, y - home.y), water: b >= 0 ? B.info[b].kind : 'see' });
    }
    cand.sort((a, b) => a.dist - b.dist);
    const out = [];                                                  // 3 места, хотя бы одно у реки и одно у озера, если такие есть
    const add = c => { if (out.length >= 3 || out.includes(c) || out.some(o => Math.hypot(o.x - c.x, o.y - c.y) < 900)) return; out.push(c); };
    ['fluss', 'see'].forEach(w => { const c = cand.find(c => c.water === w && !out.some(o => Math.hypot(o.x - c.x, o.y - c.y) < 900)); if (c) add(c); });
    cand.forEach(add); out.sort((a, b) => a.dist - b.dist);
    return out;
  }
  function wetWelt(sc, x, y) { const d = sc.world, W = window.WELT, t = W.T * W.SC, tx = Math.floor(x / t), ty = Math.floor(y / t); return tx >= 0 && ty >= 0 && tx < W.MW && ty < W.MH && d.tm[ty * W.MW + tx] === 15; }
  const PIER = [2486, 2582];                                         // Steg (x в px деревни), море ниже T.water_y
  function wetTown(sc, x, y) { const T = sc.townMask; return !!T && y >= T.water_y + 14 && y < T.h - 6 && x > 6 && x < T.w - 6 && !(x >= PIER[0] && x <= PIER[1]); }
  function townSpots(sc) {
    const T = sc.townMask; if (!T || !T.water_y) return [];
    const ok = (x, y) => window.townWalkable && townWalkable(sc, x, y);
    const out = [];
    if (ok(2532, 2940)) out.push({ key: 'steg', de: 'der Steg', ru: 'причал', x: 2532, y: 2940, dir: [-1, 0], water: 'meer' });
    for (let r = 0; r < 900 && out.length < 2; r += 12) for (const x of [1400 - r, 1400 + r]) {   // Strand: у кромки воды, вокруг свободный песок (без камней)
      if (out.length >= 2 || x < 120 || x > PIER[0] - 160) continue;
      let y = null; for (let yy = T.water_y - 8; yy > T.water_y - 60; yy -= 6) if (ok(x, yy)) { y = yy; break; }
      if (y == null) continue; let free = true;
      for (let dy = 0; dy <= 84 && free; dy += 12) for (let dx = -48; dx <= 48 && free; dx += 12) free = ok(x + dx, y - dy);
      if (free) out.push({ key: 'strand', de: 'der Strand', ru: 'пляж', x, y, dir: [0, 1], water: 'meer' });
    }
    return out;
  }
  function label(sc, x, y, de, ru) {                                 // подпись: артикль в цвете рода, по-русски мелко
    const [a, ...w] = de.split(' '), st = { fontFamily: 'Roboto, sans-serif', fontStyle: 'bold', stroke: '#3b2314', strokeThickness: 6, fontSize: '19px' };
    const t2 = sc.add.text(0, y, a + ' ', { ...st, color: COL[a] || '#fff7e0' }).setOrigin(0, 1).setDepth(6001);   // артикль и слово рядом, без наложения (анимации/свет 24.11)
    const t1 = sc.add.text(0, y, w.join(' '), { ...st, color: '#fff7e0' }).setOrigin(0, 1).setDepth(6000);
    t2.x = Math.round(x - (t2.width + t1.width) / 2); t1.x = t2.x + t2.width;
    return [t1, t2, sc.add.text(x, y + 16, ru, { fontFamily: 'Roboto, sans-serif', fontSize: '12px', color: '#f3e3c3', stroke: '#3b2314', strokeThickness: 4 }).setOrigin(0.5, 1).setDepth(6000)];
  }
  const fade = (s, a) => (s && s.lbl || []).forEach(t => t.active && t.setAlpha(a));   // пока рыбачим — подпись места бледнее (не закрывает поплавок)
  const WRU = { meer: 'море', fluss: 'река', see: 'озеро' };
  function tapTo(sc, s, zone) { zone.on('pointerup', () => { if (sc.__dragged || sc.busy) return; const go = () => start(sc, s); if (window.walkToScene) walkToScene(sc, s.x, s.y, go); else go(); }); }
  function setupWelt(sc) {
    const d = sc.world; if (!d) return;
    if (d.__fish) { sc.__fishSpots = d.__fish.map(s => ({ ...s })); }   // тот же мир (назад из подземелья) — те же места, маска уже помечена
    else {
      const spots = d.__fish = findSpots(sc); sc.__fishSpots = spots.map(s => ({ ...s }));
      const W = window.WELT, k = W.T / W.CELL, M = d.mask;           // бочка непроходима: Max её обходит, а не стоит в ней
      spots.forEach(s => { for (let yy = 0; yy < k; yy++) { const r = s.B[1] * k + yy; let row = M[r]; for (let xx = 0; xx < k; xx++) { const c = s.B[0] * k + xx; row = row.slice(0, c) + '0' + row.slice(c + 1); } M[r] = row; } });
    }
    const spots = sc.__fishSpots; if (!spots.length) return;
    spots.forEach(s => { s.wet = (x, y) => wetWelt(sc, x, y); s.de = 'die Angelstelle'; s.place = s.water === 'fluss' ? 'der Fluss' : 'der See'; });
    const draw = () => {
      if (!sc.sys || !sc.sys.isActive()) return;
      spots.forEach(s => {
        const bx = s.bx, by = s.by;                                   // бочка с рыбой (craftpix free fishing pack) на соседнем сухом тайле, Max встаёт у воды
        SIL(sc.add.image(bx - 24 + 6, by + 3, 'life_barrel').setOrigin(0, 1).setScale(3)).setDepth(by - 1);
        s.img = sc.add.image(bx - 24, by, 'life_barrel').setOrigin(0, 1).setScale(3).setDepth(by);
        s.lbl = label(sc, bx, by - 96, 'die Angelstelle', 'рыбалка · ' + WRU[s.water]);
        const z = sc.add.zone((bx + s.x) / 2, by - 30, 130, 100).setInteractive({ useHandCursor: true }); s.zone = z; tapTo(sc, s, z);
      });
    };
    if (sc.textures.exists('life_barrel')) draw(); else { sc.load.image('life_barrel', BASE + 'life/barrel.png'); sc.load.once('complete', draw); sc.load.start(); }
  }
  function setupTown(sc) {
    const spots = sc.__fishSpots = townSpots(sc);
    spots.forEach(s => {
      s.wet = (x, y) => wetTown(sc, x, y); s.place = 'das Meer';
      s.lbl = label(sc, s.x, s.y - 92, s.de, 'рыбалка · море');
      const z = sc.add.zone(s.x, s.y - 50, 120, 120).setInteractive({ useHandCursor: true }); s.zone = z; tapTo(sc, s, z);
    });
  }

  // ---------- в мире: леска и der Schwimmer. В паке поплавка нет -> 3x5 пикселей арта (x3) цветами пака: красный приманки Icons_01, леска 0xa3abb9
  const FLOAT = [[0, 1, 0], [1, 1, 1], [2, 2, 2], [0, 2, 0]], FC = { 1: 0xd01c48, 2: 0xf0ead6 };
  function makeFloat(sc) {
    const g = sc.add.graphics(), P = 3;
    FLOAT.forEach((row, y) => row.forEach((c, x) => { if (c) g.fillStyle(0x3b2314, 1).fillRect((x - 1.5) * P - P, (y - 4) * P - P, P * 3, P * 3); }));
    FLOAT.forEach((row, y) => row.forEach((c, x) => { if (c) g.fillStyle(FC[c], 1).fillRect((x - 1.5) * P, (y - 4) * P, P, P); }));
    return g;
  }
  function ripple(sc, x, y, big) {
    const g = sc.add.graphics().setDepth(y - 2).setPosition(x, y); g.lineStyle(3, 0xeef8f4, 0.85).strokeEllipse(0, 0, 18, 7);
    sc.tweens.add({ targets: g, scaleX: big ? 3.4 : 2.2, scaleY: big ? 3.4 : 2.2, alpha: 0, duration: big ? 750 : 600, onComplete: () => g.destroy() });
  }
  function tip(c) {                                                  // кончик удилища у Max (по направлению к воде)
    const h = c.sc.walker, b = h.getBounds(), [dx, dy] = c.spot.dir;
    return dx ? { x: b.centerX + dx * b.width * 0.55, y: b.top + b.height * 0.3 } : dy < 0 ? { x: b.centerX + b.width * 0.35, y: b.top + b.height * 0.15 } : { x: b.centerX + b.width * 0.4, y: b.top + b.height * 0.55 };
  }
  function drawLine() {
    const c = cur; if (!c || !c.fl || !c.line) return;
    const a = tip(c), f = { x: c.fl.x, y: c.fl.y - 12 }, sag = c.st === 'fight' ? 4 + (1 - fs.T) * 14 : 16, g = c.line.clear();
    g.lineStyle(2, c.st === 'fight' && fs.T > 0.85 ? 0xe2584a : 0xe6e2d6, 0.95).beginPath(); g.moveTo(a.x, a.y);
    for (let i = 1; i <= 14; i++) { const t = i / 14; g.lineTo(a.x + (f.x - a.x) * t, a.y + (f.y - a.y) * t + Math.sin(Math.PI * t) * sag); }
    g.strokePath();
  }
  function range(c) {                                                // ближняя и дальняя точки воды по лучу от Max
    const { x, y, dir: [dx, dy] } = c.spot, max = c.sc.world ? 6 * WELT.T * WELT.SC : 260, y0 = y - 16; let lo = null, hi = null;
    for (let s = 24; s <= max; s += 6) { const px = x + dx * s, py = y0 + dy * s; if (c.spot.wet(px, py)) { if (lo == null) lo = s; hi = s; } else if (lo != null) break; }
    return lo == null ? null : [lo + 6, Math.max(lo + 6, hi - 6)];
  }
  function camOn(c, x, y) { if (window.camTo) { c.sc.__dragged = true; camTo(c.sc, x, y); } }
  function clearWorld(c) { if (!c) return; ['fl', 'line'].forEach(k => { if (c[k]) { c[k].destroy(); c[k] = null; } }); if (c.upd) { c.sc.events.off('update', c.upd); c.upd = null; } if (c.bob) { c.bob.stop(); c.bob = null; } if (c.shake) { c.shake.stop(); c.shake = null; } clearTimeout(c.nibT); }

  // ---------- окно рыбалки (немецкий крупно, русский мелко; ставится туда, где нет Max и поплавка)
  const css = document.createElement('style');
  css.textContent = `
    #fishBox{position:absolute;left:12px;right:12px;top:58px;display:none;gap:10px;align-items:center;padding:8px 12px 10px;color:#2e1e12;z-index:71}
    #fishBox .pic{flex:0 0 92px;height:88px;display:flex;align-items:center;justify-content:center}
    #fishBox .pic img{image-rendering:pixelated;display:block}
    #fishBox .body{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:6px}
    #fishBox .t{font-size:22px;font-weight:700;line-height:1.08}
    #fishBox .ru{display:block;font-size:13px;font-weight:400;color:#6b4a2e;line-height:1.15}
    #fishBox .when{font-size:15px;font-weight:700;line-height:1.1}
    #fishBox .msg{font-size:17px;font-weight:700;line-height:1.15;color:#9b2c1c}
    #fishBox .msg.good{color:#2f7a2a}
    #fishBox .row{display:flex;gap:8px;flex-wrap:wrap}
    #fishBox .ui-btn{font-family:inherit;color:#2e1e12;height:auto;min-height:52px;padding:2px 12px;font-size:20px;line-height:1.05;display:flex;flex-direction:column;align-items:center;justify-content:center;touch-action:none;user-select:none;-webkit-user-select:none}
    #fishBox .ui-btn.big{flex:1 1 150px;font-size:25px;font-weight:800}
    #fishBox .ui-btn.art{min-width:76px;font-size:24px;font-weight:800}
    #fishBox .ui-btn.on{outline:3px solid #ffd23f;outline-offset:-3px}
    #fishBox.bite .ui-btn.big{color:#9b2c1c;animation:fbite .25s linear infinite}
    @keyframes fbite{50%{transform:translate(2px,3px) rotate(2deg)}}
    #fishBox .bar{position:relative;height:24px;border:3px solid #6b4a2e;border-radius:6px;background:#eadbb8;overflow:hidden}
    #fishBox .bar .zone{position:absolute;top:0;bottom:0;background:#86c46e}
    #fishBox .bar .red{position:absolute;top:0;bottom:0;right:0;background:#e2584a}
    #fishBox .bar .fill{position:absolute;top:0;bottom:0;left:0;background:#d9a441}
    #fishBox .bar .ndl{position:absolute;top:-3px;bottom:-3px;width:6px;margin-left:-3px;background:#2e1e12;border-radius:2px}
    #fishBox .bar.prog .fill{background:#3a7be0}
    #fishBox .lbl{display:flex;justify-content:space-between;font-size:13px;color:#6b4a2e;line-height:1}
    #fishBox .q{font-size:25px;font-weight:700;line-height:1.1}
    #fishBox .q .gap{display:inline-block;min-width:52px;border-bottom:3px solid #6b4a2e;margin-right:6px;text-align:center}
    #fishBox .rar{font-size:14px;font-weight:700}
    #fishBox .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:6px}
    #fishBox .fc{border:2px solid #c9a877;border-radius:6px;padding:3px;display:flex;flex-direction:column;align-items:center;text-align:center;min-width:0;background:rgba(255,248,226,.35)}
    #fishBox .fc .im{height:50px;display:flex;align-items:center;justify-content:center}
    #fishBox .fc.miss img{filter:brightness(0);opacity:.3}
    #fishBox .fc .nm{font-size:15px;font-weight:700;line-height:1.1;overflow-wrap:anywhere}`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'fishBox'; box.className = 'ui ui-panel-paper';
  const HUD = ['bag', 'bFurn', 'bMap', 'cbHero']; let cur = null, was = {}, timer = null, raf = 0;
  const fs = { T: 0.45, P: 0, lo: 0.3, hi: 0.72, red: 0, slack: 0, jerk: 0, hold: false, eff: 0.5 };
  const fit = (px, bw, bh, kmax) => { const k = Math.max(1, Math.min(kmax || 4, Math.floor(Math.min(bw / px[0], bh / px[1])))); return `width:${px[0] * k}px;height:${px[1] * k}px`; };
  const art = de => { const [a, ...w] = de.split(' '); return `<b style="color:${COL[a] || '#2e1e12'}">${a}</b> ${w.join(' ')}`; };
  function screenY(c, y) { const sc = c.sc, cam = sc.cameras.main, cv = game.canvas.getBoundingClientRect(), k = cv.width / game.scale.width; return cv.top + ((y - cam.worldView.y) * cam.zoom + cam.y) * k; }
  function dock() {                                                  // окно в ту половину экрана, где больше места: не закрывает Max и поплавок
    const c = cur; box.style.top = '58px'; box.style.bottom = 'auto'; if (!c || !c.sc.walker || !window.game || !game.canvas) return;
    const hb = c.sc.walker.getBounds(), ys = [screenY(c, hb.top), screenY(c, hb.bottom)];
    if (c.fl) ys.push(screenY(c, c.fl.y - 18), screenY(c, c.fl.y + 6)); else if (c.aimAt) ys.push(screenY(c, c.aimAt.y));
    const ui = document.getElementById('ui').getBoundingClientRect(), top = Math.min(...ys), bot = Math.max(...ys);
    if (top - ui.top < ui.bottom - bot) { box.style.top = 'auto'; box.style.bottom = '12px'; }
  }
  function show(st, html) {
    box.className = 'ui ui-panel-paper ' + st; box.innerHTML = html; box.style.display = 'flex'; box.dataset.state = st; if (cur) cur.st = st; dock();
    HUD.forEach(k => { const e = document.getElementById(k); if (e && was[k] === undefined) { was[k] = e.style.display; e.style.display = 'none'; } });
  }
  function hide() { clearTimeout(timer); cancelAnimationFrame(raf); box.style.display = 'none'; box.dataset.state = ''; HUD.forEach(k => { const e = document.getElementById(k); if (e && was[k] !== undefined) e.style.display = was[k]; }); was = {}; }

  // ---------- ход игры
  const whenLine = t => { const S = DATA.seasons[t.season], P = DATA.phases[t.phase]; return `<div class="when">${art(S[0])} · ${art(P[0])}<span class="ru">${S[1]}, ${P[1]}${t.season === 'winter' ? ' · зимой клюёт реже' : ''}</span></div>`; };
  function ready(msg, good) {                                        // у воды: Angeln / Was beißt jetzt? / Zurück
    const c = cur; if (!c) return; clearWorld(c); clearTimeout(timer); cancelAnimationFrame(raf); c.sc.busy = true;
    const t = now(), place = c.spot.place || DATA.waters[c.spot.water][0];
    show('ready', `<div class="pic"><img src="${BASE}life/rod.png" alt="" style="${fit([30, 28], 92, 88, 3)}"></div><div class="body">
      ${msg ? `<div class="msg${good ? ' good' : ''}">${msg}</div>` : `<div class="t">${art(c.spot.de)} · ${art(place)}<span class="ru">рыбалка · ${WRU[c.spot.water]}</span></div>`}
      ${whenLine(t)}
      <div class="row"><button class="ui ui-btn big" data-f="angeln">Angeln!<span class="ru">ловить</span></button><button class="ui ui-btn" data-f="hint">Was beißt jetzt?<span class="ru">что клюёт</span></button><button class="ui ui-btn" data-f="out">Zurück<span class="ru">назад</span></button></div></div>`);
  }
  function hint() {                                                  // какие рыбы возможны здесь и сейчас; не пойманные — силуэт и «?»
    const c = cur, t = now(), L = possible(c.spot.water, t), A = window.Album, info = SKF('fish.info') > 0;
    const ACOL = { der: '#3a7be0', die: '#e24848', das: '#2f9a4f' }, RRU = { h: 'часто', s: 'редко', ss: 'очень редко', l: 'легенда' };
    const cards = L.map(k => { const f = DATA.fish[k], got = A && A.has(k); return `<div class="fc ${got ? '' : 'miss'}" data-id="${k}"><div class="im"><img src="${BASE + f.img}" alt="" style="${fit(f.px, 86, 50, 3)}"></div><div class="nm">${got ? art(f.art + ' ' + f.w) : info ? `<b style="color:${ACOL[f.art] || '#2e1e12'}">${f.art}</b> ?` : '?'}</div>${got ? `<span class="ru">${f.ru}</span>` : info ? `<span class="ru">${RRU[f.rar] || ''}</span>` : ''}</div>`; }).join('');   // die Fischkunde: артикль и редкость ещё не пойманных
    show('hint', `<div class="body"><div class="t">Was beißt jetzt?<span class="ru">что сейчас клюёт · ${WRU[c.spot.water]}</span></div>${whenLine(t)}
      ${L.length ? `<div class="grid">${cards}</div>` : '<div class="msg">Jetzt beißt hier nichts.<span class="ru">сейчас здесь не клюёт — приходи в другое время</span></div>'}
      <div class="row"><button class="ui ui-btn" data-f="back">Zurück<span class="ru">назад</span></button></div></div>`);
  }
  let aimT0 = 0, power = 0;
  function aim() {                                                   // держи палец — дальность (туда-обратно), отпусти — заброс
    const c = cur, r = range(c); if (!r) return ready('Hier ist kein Wasser.<span class="ru">тут нет воды</span>');
    c.r = r; c.aimAt = { x: c.spot.x + c.spot.dir[0] * (r[0] + r[1]) / 2, y: c.spot.y - 16 + c.spot.dir[1] * (r[0] + r[1]) / 2 };
    camOn(c, (c.spot.x + c.aimAt.x) / 2, (c.spot.y + c.aimAt.y) / 2 - 30); power = 0;
    show('aim', `<div class="body"><div class="t">Halten … und loslassen!<span class="ru">держи кнопку — чем дольше, тем дальше; отпусти — заброс</span></div>
      <div class="bar" id="fPow"><div class="fill" style="width:0%"></div></div><div class="lbl"><span>nah · близко</span><span>weit · далеко</span></div>
      <div class="row"><button class="ui ui-btn big" data-f="hold">Auswerfen<span class="ru">держи и отпусти</span></button><button class="ui ui-btn" data-f="back">Zurück<span class="ru">назад</span></button></div></div>`);
    setTimeout(dock, 320);
  }
  function aimTick() { if (!cur || cur.st !== 'aim' || !fs.hold) return; const t = (performance.now() - aimT0) / 1100; power = 1 - Math.abs(1 - (t % 2)); const e = box.querySelector('#fPow .fill'); if (e) e.style.width = Math.round(power * 100) + '%'; raf = requestAnimationFrame(aimTick); }
  function cast(p) {                                                 // заброс: поплавок летит по дуге, всплеск, ждём
    const c = cur; p = Math.max(0, Math.min(1, p)); const [lo, hi] = c.r, dist = lo + (hi - lo) * p, [dx, dy] = c.spot.dir;
    const to = { x: c.spot.x + dx * dist, y: c.spot.y - 16 + dy * dist }, a = tip(c); c.power = p; c.to = to;
    if (c.sc.walker) { const f = { '0,-1': 10, '1,0': 7, '-1,0': 4, '0,1': 1 }[c.spot.dir.join(',')]; if (f != null) c.sc.walker.setFrame(f); }
    c.fl = makeFloat(c.sc).setPosition(a.x, a.y).setDepth(5400); c.line = c.sc.add.graphics().setDepth(5401);
    c.upd = () => drawLine(); c.sc.events.on('update', c.upd);
    const o = { t: 0 }; camOn(c, (c.spot.x + to.x) / 2, (c.spot.y + to.y) / 2 - 30);
    c.sc.tweens.add({ targets: o, t: 1, duration: 450, onUpdate: () => { c.fl.setPosition(a.x + (to.x - a.x) * o.t, a.y + (to.y - a.y) * o.t - Math.sin(Math.PI * o.t) * 70); },
      onComplete: () => { if (cur !== c) return; c.fl.setPosition(to.x, to.y).setDepth(to.y + 1); ripple(c.sc, to.x, to.y, true); wait(); } });
    if (window.speakDE) speakDE('Ich werfe aus.');
    show('cast', `<div class="body"><div class="t">Platsch!<span class="ru">заброс</span></div></div>`);
  }
  function wait() {                                                  // der Schwimmer: подёргивания (рано!) и настоящая поклёвка
    const c = cur, t = now(), B = DATA.bite, winter = t.season === 'winter', dist = c.power || 0;
    c.fish = F.debug.force || choose(c.spot.water, dist, t); c.t = t;
    c.beifang = !F.debug.force && c.spot.water === 'meer' && Math.random() < ((DATA.beifang || {}).meer || 0) && window.Album ? Album.pick('meer') : null;
    if (c.beifang) c.fish = null;                                    // Beifang (ракушка, морская звезда …) вместо рыбы
    const empty = F.debug.empty || (!c.fish && !c.beifang) || (!F.debug.force && winter && Math.random() < B.winter_empty);
    let ms = F.debug.bite != null ? F.debug.bite : (B.wait[0] + Math.random() * (B.wait[1] - B.wait[0])) * (winter ? B.winter_wait : 1) * (t.phase === 'nacht' ? B.night_wait : 1);
    if (F.debug.bite == null) ms *= Math.max(0.4, 1 + SKF('fish.wait'));   // die ruhige Hand (навык), die Angel 2 (Forschung)
    c.bob = c.sc.tweens.add({ targets: c.fl, y: c.fl.y + 3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    show('wait', `<div class="body"><div class="t">${art('der Schwimmer')} … warte!<span class="ru">смотри на поплавок: дёргается — ещё рано, нырнул — жми «Jetzt!»</span></div>
      <div class="row"><button class="ui ui-btn big" data-f="jetzt">Jetzt!<span class="ru">подсечь</span></button><button class="ui ui-btn" data-f="reelin">Einholen<span class="ru">смотать</span></button></div></div>`);
    const nib = () => { if (cur !== c || c.st !== 'wait') return; if (!F.debug.bite) { c.sc.tweens.add({ targets: c.fl, x: c.to.x + (Math.random() < 0.5 ? -3 : 3), duration: 90, yoyo: true }); ripple(c.sc, c.to.x, c.to.y); }
      c.nibT = setTimeout(nib, 700 + Math.random() * 1300); };
    c.nibT = setTimeout(nib, 600 + Math.random() * 900);
    if (empty) { ms = Math.max(ms, F.debug.bite != null ? ms : 7000) * 1.2; timer = setTimeout(() => { if (cur === c) ready(winter ? 'Nichts beißt. Im Winter ist es ruhig.<span class="ru">не клюёт — зимой рыба малоактивна</span>' : 'Nichts beißt. Versuch es später!<span class="ru">не клюёт — попробуй в другое время</span>'); }, ms); return; }
    timer = setTimeout(bite, ms);
  }
  function bite() {                                                  // поплавок ныряет: окно подсечки ~0,8 с
    const c = cur; if (!c || c.st !== 'wait') return; clearTimeout(c.nibT); if (c.bob) { c.bob.stop(); c.bob = null; }
    c.fl.setPosition(c.to.x, c.to.y + 9).setAlpha(0.75); ripple(c.sc, c.to.x, c.to.y, true); setTimeout(() => cur === c && c.st === 'bite' && ripple(c.sc, c.to.x, c.to.y, true), 260);
    c.shake = c.sc.tweens.add({ targets: c.fl, x: c.to.x + 3, duration: 60, yoyo: true, repeat: -1 });
    if (window.speakDE) speakDE('Jetzt!');
    show('bite', `<div class="body"><div class="t">Jetzt! Es beißt!<span class="ru">клюёт — подсекай!</span></div>
      <div class="row"><button class="ui ui-btn big" data-f="jetzt">Jetzt!<span class="ru">подсечь</span></button></div></div>`);
    c.biteAt = performance.now();
    timer = setTimeout(() => { if (cur === c && c.st === 'bite') miss('late'); }, F.debug.win != null ? F.debug.win : DATA.bite.win);
  }
  function miss(why) {                                               // рано / поздно / сорвалась / оборвалась — без потерь
    const c = cur; if (!c) return; clearTimeout(c.nibT); if (c.shake) { c.shake.stop(); c.shake = null; }
    const M = { early: 'Zu früh! Der Fisch ist weg.<span class="ru">рано — рыба ушла, ничего не потеряно</span>', late: 'Zu spät! Der Fisch ist weg.<span class="ru">поздно — рыба ушла, ничего не потеряно</span>',
      escape: 'Der Fisch ist entkommen.<span class="ru">леска ослабла — рыба сорвалась, ничего не потеряно</span>', snap: 'Die Schnur ist gerissen!<span class="ru">слишком сильно тянул — леска порвалась, новая уже на месте</span>' };
    c.last = why; ready(M[why]);
  }

  function hook() {                                                  // подсечка вовремя -> вываживание
    const c = cur; clearTimeout(timer); if (c.shake) { c.shake.stop(); c.shake = null; }
    const f = c.fish && DATA.fish[c.fish]; c.cm = f ? sizeOf(c.fish, c.power || 0) : 0;
    const k = f ? (c.cm - f.cm[0]) / Math.max(1, f.cm[1] - f.cm[0]) : 0;
    Object.assign(fs, { T: 0.45, P: 0, red: 0, slack: 0, hold: false, eff: f ? f.force * (0.75 + 0.5 * k) : 0.2, jerk: 0.6, t0: performance.now(), last: performance.now() });
    c.fl.setAlpha(1);
    show('fight', `<div class="body"><div class="t">Der Fisch zieht!<span class="ru">держи стрелку в зелёной зоне: держишь кнопку — тянешь, отпустил — леска слабее</span></div>
      <div class="bar" id="fTen"><div class="zone" style="left:${fs.lo * 100}%;width:${(fs.hi - fs.lo) * 100}%"></div><div class="red" style="width:10%"></div><div class="ndl" style="left:45%"></div></div>
      <div class="lbl"><span>locker · слабо</span><span>Spannung · натяжение</span><span>zu fest · порвётся</span></div>
      <div class="bar prog" id="fPro"><div class="fill" style="width:0%"></div></div><div class="lbl"><span>der Fisch kommt näher · рыба ближе</span></div>
      <div class="row"><button class="ui ui-btn big" data-f="reel">Kurbeln!<span class="ru">держи — тянуть</span></button></div></div>`);
    raf = requestAnimationFrame(fightTick);
  }
  function fightTick() {
    const c = cur; if (!c || c.st !== 'fight') return;
    const t = performance.now(), dt = Math.min(0.05, (t - fs.last) / 1000); fs.last = t;
    fs.T += (fs.hold ? 0.6 : -0.5) * dt + 0.12 * fs.eff * dt;
    fs.jerk -= dt; if (fs.jerk <= 0) { fs.T += 0.08 + 0.14 * fs.eff * (0.7 + Math.random() * 0.5); fs.jerk = (0.5 + Math.random() * 0.8) / (0.6 + fs.eff * 0.6);   // рывок рыбы: сильнее и чаще у крупных и сильных
      if (c.fl) { c.sc.tweens.add({ targets: c.fl, x: c.fl.x + (Math.random() < 0.5 ? -6 : 6), duration: 80, yoyo: true }); ripple(c.sc, c.fl.x, c.fl.y); } }
    fs.T = Math.max(0, Math.min(1.02, fs.T));
    if (fs.T >= fs.lo && fs.T <= fs.hi) fs.P += dt * 0.28 / (0.5 + fs.eff * 0.7); else if (fs.T < fs.lo) fs.P = Math.max(0, fs.P - dt * 0.06);
    fs.red = fs.T >= 0.9 ? fs.red + dt : Math.max(0, fs.red - dt); fs.slack = fs.T <= 0.15 ? fs.slack + dt : Math.max(0, fs.slack - dt * 0.5);   // леска провисла ~1,3 с — рыба уходит
    const n = box.querySelector('#fTen .ndl'), p = box.querySelector('#fPro .fill');
    if (n) n.style.left = Math.min(100, fs.T * 100) + '%'; if (p) p.style.width = Math.min(100, fs.P * 100) + '%';
    if (c.fl && c.to) { const a = tip(c), k = Math.min(1, fs.P) * 0.75; c.fl.setPosition(c.to.x + (a.x - c.to.x) * k, c.to.y + (c.spot.y - 6 - c.to.y) * k); }
    if (fs.red > 0.6) return miss('snap');                           // в красной зоне дольше 0,6 с — леска рвётся
    if (fs.slack > 1.3) return miss('escape');
    if (fs.P >= 1) return landed();
    raf = requestAnimationFrame(fightTick);
  }
  function landed() {                                                // улов: Beifang -> карточка альбома; рыба -> своя карточка (размер, артикль)
    const c = cur; fs.hold = false; clearWorld(c);
    if (c.sc.walker) c.sc.walker.setFrame(1);
    if (c.beifang && window.Album) { hide(); Album.card(c.beifang, { title_de: 'Beifang!', title_ru: 'попалось на крючок', scene: c.sc, onDone: () => { if (cur === c) ready(); } }); return; }
    const f = DATA.fish[c.fish];
    if (window.speakDE) speakDE('Ein Fisch!');
    show('catch', `<div class="pic"><img src="${BASE + f.img}" alt="" style="${fit(f.px, 92, 88, 4)}"></div><div class="body">
      <div class="t">Gefangen! ${c.cm} cm<span class="ru">улов · ${c.cm} см · какой артикль?</span></div>
      <div class="q"><span class="gap">?</span>${f.w}<span class="ru">${f.ru}</span></div>
      <div class="rar" style="color:${RCOL[f.rar]}">${RSTAR[f.rar]} ${(Album.meta() ? Album.meta().rarity[f.rar][0] : '')}</div>
      <div class="row">${['der', 'die', 'das'].map(a => `<button class="ui ui-btn art" data-a="${a}" style="color:${COL[a]}">${a}</button>`).join('')}</div></div>`);
  }
  function payBonus(rar, id) {                                       // Антифарм 25.11: бонус за верный артикль — до caps_day.fish монет в день (Rewards -> Eco.earn)
    const want = ((DATA && DATA.coins) || {})[rar] || 3; let bonus = want;
    if (window.Rewards) bonus = Rewards.coins(want, 'fish ' + (id || rar), 'fish');
    else if (typeof setCoins === 'function' && typeof state !== 'undefined') setCoins(state.coins + bonus);
    return { bonus, capped: bonus < want };
  }
  F.payBonus = payBonus;
  function answer(a) {
    const c = cur, id = c.fish, f = DATA.fish[id], ok = a === f.art, word = f.art + ' ' + f.w;
    let isNew = true, rec = false, n = 1, bonus = 0;
    if (window.Album) {                                              // альбом: ✓ артикль, рекорд размера
      const r = Album.add(id, ok); isNew = r.isNew;
      try { const v = Album.load(), o = v.items[id]; rec = !isNew && c.cm > (o.cm || 0); o.cm = Math.max(o.cm || 0, c.cm); localStorage.setItem('ds_proto.album', JSON.stringify(v)); } catch (e) {}
    }
    try { const k = 'ds_proto.inv', v = JSON.parse(localStorage.getItem(k)) || {}; v.fish = v.fish || {}; v.fish[id] = (v.fish[id] || 0) + 1; n = v.fish[id];   // Rucksack: улов + карточка слова
      v.cards = v.cards || []; if (!v.cards.includes(word)) v.cards.push(word); localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
    let capped = false;
    if (ok) { const P = payBonus(f.rar, id); bonus = P.bonus; capped = P.capped; }
    else if (window.Combat && Combat.addReview) Combat.addReview({ art: f.art, w: f.w, ru: f.ru });
    if (window.speakDE) speakDE(word);
    const det = { id, art: f.art, w: f.w, ru: f.ru, cm: c.cm, water: c.spot.water, season: c.t && c.t.season, phase: c.t && c.t.phase, artOk: ok };
    try { window.dispatchEvent(new CustomEvent('ds:catch', { detail: det })); } catch (e) {}
    try { if (window.Quests && Quests.list) Quests.list().forEach(q => { if (/fisch|angel/i.test((q.goal_de || '') + ' ' + q.id)) Quests.progress(q.id, (q.count || 0) + 1); }); } catch (e) {}
    c.lastCatch = det;
    show('catch', `<div class="pic"><img src="${BASE + f.img}" alt="" style="${fit(f.px, 92, 88, 4)}"></div><div class="body">
      <div class="q">${art(word)} · ${c.cm} cm<span class="ru">${f.ru}</span></div>
      <div class="msg${ok ? ' good' : ''}">${ok ? (capped && !bonus ? `Richtig! ✓<span class="ru">верно · на сегодня монеты за рыбу собраны — ловить можно для практики</span>` : `Richtig! ✓ +${bonus} Münzen<span class="ru">верно — бонус монетами</span>`) : `Fast! Richtig ist: ${art(word)}<span class="ru">почти — улов всё равно твой, слово ушло в «Повтор»</span>`}</div>
      <div class="rar">${isNew ? 'Neu im Album!' : rec ? 'Rekord: ' + c.cm + ' cm!' : 'Im Album ✓'} · im Rucksack: ×${n}<span class="ru">${isNew ? 'новое в альбоме' : rec ? 'рекорд размера' : 'уже в альбоме'} · в рюкзаке</span></div>
      <div class="row"><button class="ui ui-btn big" data-f="weiter">Weiter</button></div></div>`);
  }

  function start(sc, spot) {
    if (!sc || !spot || !DATA) return false;
    if (cur) close();
    cur = { sc, spot }; sc.busy = true; fade(spot, 0.2);
    if (sc.walker) { const f = { '0,-1': 10, '1,0': 7, '-1,0': 4, '0,1': 1 }[spot.dir.join(',')]; if (f != null) sc.walker.setFrame(f); }   // лицом к воде
    ready(); return true;
  }
  function close() { const c = cur; fs.hold = false; clearWorld(c); cur = null; hide(); if (c) { fade(c.spot, 1); clearTimeout(c.nibT); if (c.shake) c.shake.stop(); if (c.sc) { c.sc.busy = false; c.sc.__dragged = false; } } }
  // кнопки: удержание (Auswerfen, Kurbeln) — pointerdown/up; остальное — click
  box.addEventListener('pointerdown', e => {
    const b = e.target.closest('button'); e.stopPropagation(); if (!b || !cur) return;
    if (b.dataset.f === 'hold' && cur.st === 'aim') { fs.hold = true; b.classList.add('on'); aimT0 = performance.now(); try { b.setPointerCapture(e.pointerId); } catch (x) {} raf = requestAnimationFrame(aimTick); }
    if (b.dataset.f === 'reel' && cur.st === 'fight') { fs.hold = true; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (x) {} }
  });
  const up = () => {
    if (!fs.hold) return; fs.hold = false; box.querySelectorAll('.on').forEach(x => x.classList.remove('on'));
    if (cur && cur.st === 'aim') { cancelAnimationFrame(raf); cast(power); }
  };
  ['pointerup', 'pointercancel'].forEach(t => window.addEventListener(t, up));
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); e.stopPropagation(); if (!b || !cur) return;
    const f = b.dataset.f, st = cur.st;
    if (b.dataset.a && st === 'catch') return answer(b.dataset.a);
    if (f === 'out') close(); else if (f === 'angeln') aim(); else if (f === 'hint') hint(); else if (f === 'back') ready(); else if (f === 'weiter') ready();
    else if (f === 'reelin' && st === 'wait') ready();
    else if (f === 'jetzt') { if (st === 'wait') miss('early'); else if (st === 'bite') hook(); }
  });
  ['pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup'].forEach(t => box.addEventListener(t, e => e.stopPropagation()));

  Object.assign(F, { spots: sc => (sc && sc.__fishSpots) || [], start, close, find: findSpots, state: () => box.dataset.state || '', now, possible,
    data: () => DATA, loaded: loadedP, fight: () => ({ ...fs }), cur: () => cur, townSpots, last: () => cur && cur.lastCatch, why: () => cur && cur.last });
  window.Fishing = F;
  (function hookScenes() {
    const ui = document.getElementById('ui'), g = window.game;
    if (!ui || !g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hookScenes, 80);
    ui.appendChild(box);
    const on = (key, fn) => { const s = g.scene.getScene(key); if (!s) return; s.events.on('create', () => { close(); dataReady.then(() => { syncAlbum(); if (s.sys.isActive()) fn(s); }); }); s.events.on('shutdown', () => { if (cur && cur.sc === s) close(); }); };
    on('Welt', setupWelt); on('Yard', s => setTimeout(() => { if (s.sys.isActive() && s.townMask) setupTown(s); }, 0));
  })();
})();
