// Max гуляет по миру: тап по земле — идёт туда (анимация шагов в 4 стороны), камера держит его в кадре.
// В доме и в местах диалог начинается только после тапа по жителю: Max подходит и заговаривает.
// Выход — стрелка «Raus» у двери: Max идёт к ней и выходит (дом → двор, место → карта).
(function () {
  const SPEED = 300;                                                 // px сцены в секунду
  const ZONES = {                                                    // где можно ходить (прямоугольники сцены); дом — по маске пола обустройства
    Yard: [[40, 395, 920, 525]],
    Ort: [[130, 330, 900, 645]],
  };
  const EXIT = { Room: { at: [387, 470], to: 'Yard' }, Ort: { at: [548, 640], to: 'Yard' } };
  function anims(sc) {
    if (sc.anims.exists('w-down')) return;
    ['down', 'left', 'right', 'up'].forEach((d, k) => sc.anims.create({ key: 'w-' + d, frames: sc.anims.generateFrameNumbers('hero_walk', { frames: [k * 3, k * 3 + 1, k * 3 + 2, k * 3 + 1] }), frameRate: 8, repeat: -1 }));
  }
  function walkable(sc, x, y) {
    if (window.townWalkable) { const t = window.townWalkable(sc, x, y); if (t !== null) return t; }
    if (sc.scene.key === 'Room') {
      const d = sc.cache.json.get('fur'); if (!d) return true;
      const c = d.cell * d.scale, row = d.mask[Math.floor(y / c)]; return !!row && row[Math.floor(x / c)] === '1';
    }
    return ((sc.o && sc.o.walk) || ZONES[sc.scene.key] || []).some(([a, b, c, e]) => x >= a && x <= c && y >= b && y <= e);   // each place may have its own floor
  }
  function nearestWalkable(sc, x, y) {
    if (walkable(sc, x, y)) return [x, y];
    for (let r = 12; r <= 240; r += 12) for (let a = 0; a < 16; a++) { const t = a / 16 * Math.PI * 2, px = x + Math.cos(t) * r, py = y + Math.sin(t) * r; if (walkable(sc, px, py)) return [px, py]; }
    return null;
  }
  function grid(sc) {                                               // клетки, по которым можно ходить
    if (sc.townMask) return { c: sc.townMask.cell, rows: sc.townMask.mask };
    if (sc.o && sc.o.walk) {                                        // место: пол из прямоугольников -> сетка 12 px, путь в обход стен и мебели
      if (!sc.__grid || sc.__grid.o !== sc.o) {
        const c = 12, W = Math.ceil((sc.worldW || 1008) / c), H = Math.ceil((sc.worldH || 672) / c), rows = [];
        for (let y = 0; y < H; y++) { let r = ''; for (let x = 0; x < W; x++) r += walkable(sc, x * c + c / 2, y * c + c / 2) ? '1' : '0'; rows.push(r); }
        sc.__grid = { o: sc.o, c, rows };
      }
      return { c: sc.__grid.c, rows: sc.__grid.rows };
    }
    if (sc.scene.key === 'Room') { const d = sc.cache.json.get('fur'); if (d) return { c: d.cell * d.scale, rows: d.mask }; }
    return null;
  }
  function findPath(sc, x0, y0, x1, y1) {                             // A* по клеткам, 8 направлений
    const G = grid(sc); if (!G) return [[x1, y1]];
    const C = G.c, R = G.rows.length, W = G.rows[0].length, ok = (cx, cy) => cy >= 0 && cy < R && cx >= 0 && cx < W && G.rows[cy][cx] === '1';
    const sx = Math.floor(x0 / C), sy = Math.floor(y0 / C), tx = Math.floor(x1 / C), ty = Math.floor(y1 / C);
    if (!ok(tx, ty)) return null; const key = (a, b) => b * W + a, open = [[sx, sy]], g = new Map([[key(sx, sy), 0]]), from = new Map(), h = (a, b) => Math.hypot(a - tx, b - ty);
    const f = new Map([[key(sx, sy), h(sx, sy)]]); let n = 0;
    while (open.length && n++ < 40000) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (f.get(key(...open[i])) < f.get(key(...open[bi]))) bi = i;
      const [cx, cy] = open.splice(bi, 1)[0];
      if (cx === tx && cy === ty) { const pts = []; let k = key(cx, cy); while (k !== undefined) { pts.unshift([(k % W) * C + C / 2, Math.floor(k / W) * C + C / 2]); k = from.get(k); } pts[pts.length - 1] = [x1, y1]; return smooth(pts, ok, C); }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = cx + dx, ny = cy + dy; if (!ok(nx, ny) || (dx && dy && (!ok(cx + dx, cy) || !ok(cx, cy + dy)))) continue;
        const ng = g.get(key(cx, cy)) + (dx && dy ? 1.414 : 1), k = key(nx, ny);
        if (ng < (g.has(k) ? g.get(k) : Infinity)) { g.set(k, ng); f.set(k, ng + h(nx, ny)); from.set(k, key(cx, cy)); if (!open.some(o => o[0] === nx && o[1] === ny)) open.push([nx, ny]); }
      }
    }
    return [[x1, y1]];
  }
  function smooth(pts, ok, C) {                                      // выпрямить путь: пропускать точки, если прямая свободна
    const clear = (a, b) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (C / 2)); for (let i = 1; i < n; i++) { const x = a[0] + (b[0] - a[0]) * i / n, y = a[1] + (b[1] - a[1]) * i / n; if (!ok(Math.floor(x / C), Math.floor(y / C))) return false; } return true; };
    const out = [pts[0]]; let i = 0;
    while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !clear(pts[i], pts[j])) j--; out.push(pts[j]); i = j; }
    return out.slice(1);
  }
  function walkTo(sc, x, y, done) {
    const p0 = nearestWalkable(sc, x, y); if (!p0) return;
    const route = sc.walker ? findPath(sc, sc.walker.x, sc.walker.y, p0[0], p0[1]) : [p0];
    if (!route || !route.length) return;
    const step = i => { if (i >= route.length) { done && done(); return; } walkStraight(sc, route[i][0], route[i][1], () => step(i + 1)); };
    step(0);
  }
  function walkStraight(sc, x, y, done) {
    const p = [x, y];
    const h = sc.walker; if (sc.walkTween) sc.walkTween.stop();
    const dx = p[0] - h.x, dy = p[1] - h.y, dist = Math.hypot(dx, dy); if (dist < 4) { done && done(); return; }
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    h.play('w-' + dir, true); sc.facing = dir;
    sc.walkTween = sc.tweens.add({ targets: h, x: p[0], y: p[1], duration: dist / SPEED * 1000,
      onUpdate: () => { h.setDepth(h.y); if (sc.heroShadow) sc.heroShadow.setPosition(h.x, h.y - 2).setDepth(h.y - 1); if (window.camTo && !sc.__dragged) window.camTo(sc, h.x, h.y - 60); },
      onComplete: () => { h.stop(); h.setFrame({ down: 1, left: 4, right: 7, up: 10 }[dir]); sc.walkTween = null; done && done(); } });
  }
  function setup(sc) {
    if (!sc.hero || !sc.textures.exists('hero_walk')) return;
    anims(sc);
    const old = sc.hero, x = old.x, y = old.y; old.setVisible(false);
    sc.heroShadow = sc.add.ellipse(sc.__spawn ? sc.__spawn[0] : x, (sc.__spawn ? sc.__spawn[1] : y) - 2, 40, 12, 0x0f1c08, 0.35).setDepth(y - 1);
    const sp = sc.__spawn; if (sp) { sc.__spawn = null; old.setPosition(sp[0], sp[1]); }
    sc.walker = sc.add.sprite(sp ? sp[0] : x, sp ? sp[1] : y, 'hero_walk', 1).setOrigin(0.52, 0.97).setDepth(y);
    sc.hero = sc.walker;                                              // «Zauber» и прочее — от идущего Max
    sc.input.on('pointerup', (p, over) => {
      if (sc.__dragged || (over && over.length) || sc.talking || sc.busy) return;
      if (document.getElementById('reward').style.display === 'block') return;
      walkTo(sc, p.worldX, p.worldY);
    });
    const ex = sc.o && sc.o.exit ? { at: sc.o.exit, to: 'Yard' } : EXIT[sc.scene.key];
    if (ex) {                                                         // выход
      const g = sc.add.container(ex.at[0], ex.at[1]).setDepth(5000);
      const arrow = sc.add.triangle(0, 0, -16, -10, 16, -10, 0, 12, 0xffd23f).setStrokeStyle(3, 0x3b2314);
      const lbl = sc.add.text(0, 22, 'Raus', { fontFamily: 'Roboto, sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#ffe9b0', stroke: '#3b2314', strokeThickness: 4 }).setOrigin(0.5, 0);
      g.add([arrow, lbl]); g.setSize(80, 70); sc.exitMarker = g; g.setInteractive({ useHandCursor: true });
      sc.tweens.add({ targets: arrow, y: 6, duration: 500, yoyo: true, repeat: -1 });
      sc.exitFn = () => { sc.talking = false; document.getElementById('dlg').style.display = 'none'; walkTo(sc, ex.at[0], ex.at[1] - 20, () => leave(sc, ex.to)); };
      g.on('pointerup', () => { if (!sc.__dragged) sc.exitFn(); });
      let b = document.getElementById('bOut');   // «Raus» и во время разговора (стрелка у двери тогда под окном диалога)
      if (!b) { b = document.createElement('button'); b.id = 'bOut'; b.className = 'ui ui-btn'; b.textContent = '⟵ Raus'; document.getElementById('dlg').appendChild(b); }
      b.onclick = () => { const s = game.scene.getScenes(true)[0]; if (s && s.exitFn) s.exitFn(); };
    }
  }
  window.walkToScene = (sc, x, y, done) => walkTo(sc, x, y, done);
  window.walkSetup = sc => { if (sc.hero && !sc.walker) setup(sc); };
  function leave(sc, to) {
    if (sc.busy) return; sc.busy = true; window.whereSet && whereSet(to);
    sc.cameras.main.fadeOut(250, 29, 19, 11); sc.cameras.main.once('camerafadeoutcomplete', () => sc.scene.start(to));
  }
  // диалог — только после тапа по жителю
  function waitTalk() {
    const sc = this, npc = sc.npc; if (!npc) return;
    document.getElementById('dlg').style.display = 'none'; sc.talking = false;
    const name = sc.scene.key === 'Room' ? 'Herrn Schmidt' : 'den Leuten';
    document.getElementById('goalTxt').textContent = 'Sprich mit ' + name;
    const mark = sc.add.text(npc.x, npc.y - (npc.displayHeight || 60) - 6, '!', { fontFamily: 'Roboto, sans-serif', fontSize: '34px', fontStyle: 'bold', color: '#ffd23f', stroke: '#3b2314', strokeThickness: 6 }).setOrigin(0.5, 1).setDepth(6000);
    sc.tweens.add({ targets: mark, y: mark.y - 10, duration: 450, yoyo: true, repeat: -1 });
    npc.setInteractive({ useHandCursor: true });
    npc.once('pointerup', () => {
      mark.destroy(); const side = sc.walker && sc.walker.x < npc.x ? -60 : 60;
      walkTo(sc, npc.x + side, npc.y + 4, () => { sc.talking = true; if (window.camTo) { const c = sc.cameras.main; window.camTo(sc, (sc.walker.x + npc.x) / 2, (sc.walker.y + npc.y) / 2 + c.height / c.zoom * 0.02); }   // both above the dialog box
        if (sc.exitMarker) sc.exitMarker.setVisible(false); document.getElementById('dlg').style.display = 'block'; sc.show(); });
    });
  }
  (function hook() {
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 50);
    ['Yard', 'Room', 'Ort'].forEach(k => { const sc = g.scene.getScene(k); if (!sc) return;
      sc.constructor.prototype.waitTalk = waitTalk;
      sc.events.on('create', () => setTimeout(() => { if (sc.hero && !sc.walker) setup(sc); }, 0));
      sc.events.on('shutdown', () => { sc.walker = null; sc.heroShadow = null; sc.talking = false; sc.busy = false; });
    });
  })();
})();
