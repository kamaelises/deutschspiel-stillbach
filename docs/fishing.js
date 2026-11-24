// Angeln — рыбалка в мире Wiesenland (сцена Welt). У воды 3 места «die Angelstelle» (бочка с рыбой из craftpix free fishing pack, x3)
// на сухой земле у озера/реки, до каждого можно дойти. Тап — Max идёт к месту, окно вверху (не закрывает Max): «Auswerfen» -> ждём -> «Es beißt!» ->
// «Ziehen!» за 1,6 с. Успел — улов (рыба 75 % / ракушка 25 %, по редкости) -> карточка Album.card с выбором артикля. Не успел — рыба ушла, без потерь.
// API: Fishing.spots(sc) (места в px сцены), Fishing.start(sc, spot), Fishing.close(), Fishing.debug = { bite: ms, win: ms, force: id } — для проверок.
(function () {
  const SIL = im => { im.setTint(0x1e2c14); if (window.Phaser && Phaser.TintModes && im.setTintMode) im.setTintMode(Phaser.TintModes.FILL); else if (im.setTintFill) im.setTintFill(0x1e2c14); return im.setAlpha(0.3); };   // тень-силуэт (Phaser 4: setTintMode FILL)
  const BASE = 'assets_v3/', COL = { der: '#3a7be0', die: '#e24848', das: '#2f9a4f' };
  const F = { debug: {} };
  function findSpots(sc) {                                           // сухой тайл травы/песка, рядом (1–2 тайла по прямой) — открытая вода; маска вокруг свободна
    const d = sc.world, W = window.WELT; if (!d || !W) return [];
    const { MW, MH, T, SC, CELL } = W, M = d.mask, X = v => v * SC, k = T / CELL;
    const cellOk = (cx, cy) => cy >= 0 && cy < M.length && cx >= 0 && cx < M[0].length && M[cy][cx] === '1';
    const water = (tx, ty) => tx >= 0 && ty >= 0 && tx < MW && ty < MH && d.tm[ty * MW + tx] === 15;
    const home = sc.home || { x: X(d.spawn[0]), y: X(d.spawn[1]) };
    const busy = [].concat((sc.pois || []).map(p => [p.x, p.y]), (sc.npcs || []).map(n => [n.x, n.y]), (sc.chests || []).map(c => [c.x, c.y]), (sc.spawns || []).map(s => [s.x, s.y]));
    const cand = [];
    const dry = (tx, ty) => { if (tx < 2 || ty < 2 || tx >= MW - 2 || ty >= MH - 2) return false; const i = ty * MW + tx; if (d.tm[i] || d.kind[i]) return false;
      for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) if (!cellOk(tx * k + xx, ty * k + yy)) return false; return true; };
    const nearBridge = (tx, ty) => (d.br || []).some(b => Math.abs(b.x / T - tx) < 4 && ty >= b.y / T - 4 && ty <= (b.y + b.h) / T + 4);
    for (let ty = 2; ty < MH - 2; ty++) for (let tx = 2; tx < MW - 2; tx++) {
      if (!dry(tx, ty)) continue;                                    // A: тут стоит Max
      const dir = [[0, -1], [1, 0], [-1, 0], [0, 1]].find(([dx, dy]) => water(tx + dx, ty + dy) || water(tx + 2 * dx, ty + 2 * dy));
      if (!dir || nearBridge(tx, ty)) continue;
      const B = dir[0] ? [tx, ty + 1] : [tx + 1, ty];                // B: соседний сухой тайл вдоль берега — бочка
      if (!dry(B[0], B[1])) continue;
      const x = X(tx * T + T / 2), y = X(ty * T + T - 4);
      if (busy.some(([bx, by]) => Math.hypot(bx - x, by - y) < 140)) continue;
      cand.push({ x, y, tx, ty, dir, B, bx: X(B[0] * T + T / 2), by: X(B[1] * T + T - 2), dist: Math.hypot(x - home.x, y - home.y) });
    }
    cand.sort((a, b) => a.dist - b.dist);
    const out = []; for (const c of cand) { if (out.length >= 3) break; if (out.some(o => Math.hypot(o.x - c.x, o.y - c.y) < 900)) continue; out.push(c); }
    return out;
  }
  function setup(sc) {
    const d = sc.world; if (!d) return;
    if (d.__fish) { sc.__fishSpots = d.__fish.map(s => ({ ...s })); }   // тот же мир (назад из подземелья) — те же места, маска уже помечена
    else {
    const spots = d.__fish = findSpots(sc); sc.__fishSpots = spots.map(s => ({ ...s }));
    const W = window.WELT, k = W.T / W.CELL, M = d.mask;             // бочка непроходима: Max её обходит, а не стоит в ней
    spots.forEach(s => { for (let yy = 0; yy < k; yy++) { const r = s.B[1] * k + yy; let row = M[r]; for (let xx = 0; xx < k; xx++) { const c = s.B[0] * k + xx; row = row.slice(0, c) + '0' + row.slice(c + 1); } M[r] = row; } });
    }
    const spots = sc.__fishSpots; if (!spots.length) return;
    const draw = () => {
      if (!sc.sys || !sc.sys.isActive()) return;
      spots.forEach(s => {
        const bx = s.bx, by = s.by;                                   // бочка на соседнем сухом тайле, Max встаёт у воды
        SIL(sc.add.image(bx - 24 + 6, by + 3, 'life_barrel').setOrigin(0, 1).setScale(3)).setDepth(by - 1);   // 16 px x3, левый край на сетке x3
        s.img = sc.add.image(bx - 24, by, 'life_barrel').setOrigin(0, 1).setScale(3).setDepth(by);
        const t1 = sc.add.text(bx, by - 96, 'die Angelstelle', { fontFamily: 'Roboto, sans-serif', fontSize: '19px', fontStyle: 'bold', color: '#fff7e0', stroke: '#3b2314', strokeThickness: 6 }).setOrigin(0.5, 1).setDepth(6000);
        sc.add.text(t1.x - t1.width / 2, t1.y - t1.height, 'die', { fontFamily: 'Roboto, sans-serif', fontSize: '19px', fontStyle: 'bold', color: COL.die, stroke: '#3b2314', strokeThickness: 6 }).setDepth(6001);
        sc.add.text(bx, by - 80, 'рыбалка', { fontFamily: 'Roboto, sans-serif', fontSize: '12px', color: '#f3e3c3', stroke: '#3b2314', strokeThickness: 4 }).setOrigin(0.5, 1).setDepth(6000);
        const z = sc.add.zone((bx + s.x) / 2, by - 30, 130, 100).setInteractive({ useHandCursor: true }); s.zone = z;
        z.on('pointerup', () => { if (sc.__dragged || sc.busy) return; const go = () => start(sc, s); if (window.walkToScene) walkToScene(sc, s.x, s.y, go); else go(); });
      });
    };
    if (sc.textures.exists('life_barrel')) draw(); else { sc.load.image('life_barrel', BASE + 'life/barrel.png'); sc.load.once('complete', draw); sc.load.start(); }
  }

  // ---------- окно рыбалки (вверху, как карточка находки)
  const css = document.createElement('style');
  css.textContent = `
    #fishBox{position:absolute;left:12px;right:12px;top:58px;display:none;gap:12px;align-items:center;padding:8px 12px 10px;color:#2e1e12;z-index:71}
    #fishBox .pic{flex:0 0 100px;height:96px;display:flex;align-items:center;justify-content:center}
    #fishBox .pic img{image-rendering:pixelated;width:84px;height:84px}
    #fishBox.wait .pic img{animation:fbob 1.1s ease-in-out infinite}
    #fishBox.bite .pic img{animation:fbite .18s linear infinite}
    @keyframes fbob{50%{transform:translateY(5px)}} @keyframes fbite{50%{transform:translate(3px,6px) rotate(4deg)}}
    #fishBox .body{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:6px}
    #fishBox .t{font-size:24px;font-weight:700;line-height:1.05}
    #fishBox .ru{display:block;font-size:13px;font-weight:400;color:#6b4a2e;line-height:1.15}
    #fishBox .row{display:flex;gap:8px;flex-wrap:wrap}
    #fishBox .ui-btn{font-family:inherit;color:#2e1e12;height:auto;min-height:52px;padding:2px 16px;font-size:22px;line-height:1.05;display:flex;flex-direction:column;align-items:center;justify-content:center}
    #fishBox .ui-btn.big{min-width:170px;font-size:26px;font-weight:800}
    #fishBox.bite .ui-btn.big{color:#9b2c1c;animation:fbite .3s linear infinite}`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'fishBox'; box.className = 'ui ui-panel-paper';
  const HUD = ['bag', 'bFurn', 'bMap', 'cbHero']; let cur = null, was = {}, timer = null;
  function show(state, html) { box.className = 'ui ui-panel-paper ' + state; box.innerHTML = html; box.style.display = 'flex'; box.dataset.state = state; if (window.Album && Album.dock) Album.dock(box, cur && cur.sc); HUD.forEach(k => { const e = document.getElementById(k); if (e && was[k] === undefined) { was[k] = e.style.display; e.style.display = 'none'; } }); }
  function hide() { clearTimeout(timer); box.style.display = 'none'; box.dataset.state = ''; HUD.forEach(k => { const e = document.getElementById(k); if (e && was[k] !== undefined) e.style.display = was[k]; }); was = {}; }
  const pic = k => `<div class="pic"><img src="${BASE}life/${k}.png" alt=""></div>`;
  function cast(msg) {
    show('cast', `${pic('rod')}<div class="body"><div class="t">${msg || '<b style="color:' + COL.die + '">die</b> Angelstelle'}<span class="ru">${msg ? 'попробуй ещё раз' : 'место для рыбалки · закинь удочку и жди поклёвку'}</span></div>
      <div class="row"><button class="ui ui-btn big" data-f="cast">Auswerfen!<span class="ru">закинуть</span></button><button class="ui ui-btn" data-f="out">Zurück<span class="ru">назад</span></button></div></div>`);
  }
  function wait() {
    if (window.speakDE) speakDE('Ich angle.');
    show('wait', `${pic('rod_line')}<div class="body"><div class="t">Warte …<span class="ru">ждём поклёвку — смотри на поплавок</span></div>
      <div class="row"><button class="ui ui-btn" data-f="early">Ziehen<span class="ru">тянуть</span></button><button class="ui ui-btn" data-f="out">Zurück<span class="ru">назад</span></button></div></div>`);
    timer = setTimeout(bite, F.debug.bite != null ? F.debug.bite : 1600 + Math.random() * 3200);
  }
  function bite() {
    if (window.speakDE) speakDE('Es beißt!');
    show('bite', `${pic('rod_line')}<div class="body"><div class="t">Es beißt! Zieh!<span class="ru">клюёт — тяни скорее!</span></div>
      <div class="row"><button class="ui ui-btn big" data-f="pull">Ziehen!<span class="ru">тянуть</span></button></div></div>`);
    timer = setTimeout(() => cast('Zu spät! Der Fisch ist weg.'), F.debug.win != null ? F.debug.win : 1600);
  }
  function pull() {
    clearTimeout(timer); const A = window.Album;
    const id = F.debug.force || (A && A.pick(Math.random() < 0.75 ? 'fische' : 'meer'));
    const c = cur; hide();
    if (!A || !id) return cast();
    A.card(id, { title_de: 'Gefangen!', title_ru: 'улов', scene: c.sc, onDone: () => { if (cur === c) { c.sc.busy = true; cast(); } } });
  }
  function start(sc, spot) {
    if (!sc || (window.Album && !Album.meta())) return false;
    cur = { sc, spot }; sc.busy = true;
    if (sc.walker && spot) { const f = { '0,-1': 10, '1,0': 7, '-1,0': 4, '0,1': 1 }[spot.dir.join(',')]; if (f != null) sc.walker.setFrame(f); }   // лицом к воде
    cast(); return true;
  }
  function close() { const c = cur; cur = null; hide(); if (c && c.sc) c.sc.busy = false; }
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !cur) return; e.stopPropagation();
    const f = b.dataset.f;
    if (f === 'out') close(); else if (f === 'cast') wait(); else if (f === 'pull') pull(); else if (f === 'early') { clearTimeout(timer); cast('Zu früh! Noch nichts.'); }
  });
  ['pointerdown', 'pointerup', 'touchstart'].forEach(t => box.addEventListener(t, e => e.stopPropagation()));
  F.spots = sc => (sc && sc.__fishSpots) || []; F.start = start; F.close = close; F.find = findSpots; F.state = () => box.dataset.state || '';
  window.Fishing = F;
  (function hook() {
    const ui = document.getElementById('ui'), g = window.game;
    if (!ui || !g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 80);
    ui.appendChild(box);
    const w = g.scene.getScene('Welt'); if (w) w.events.on('create', () => { close(); setup(w); });
  })();
})();
