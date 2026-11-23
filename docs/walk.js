// Max гуляет по миру: тап по земле — идёт туда (анимация шагов в 4 стороны), камера держит его в кадре.
// В доме и в местах диалог начинается только после тапа по жителю: Max подходит и заговаривает.
// Выход — стрелка «Raus» у двери: Max идёт к ней и выходит (дом → двор, место → карта).
(function () {
  const SPEED = 230;                                                 // px сцены в секунду
  const ZONES = {                                                    // где можно ходить (прямоугольники сцены); дом — по маске пола обустройства
    Yard: [[40, 395, 920, 525]],
    Ort: [[130, 330, 900, 645]],
  };
  const EXIT = { Room: { at: [387, 470], to: 'Yard' }, Ort: { at: [548, 640], to: 'Karte' } };
  function anims(sc) {
    if (sc.anims.exists('w-down')) return;
    ['down', 'left', 'right', 'up'].forEach((d, k) => sc.anims.create({ key: 'w-' + d, frames: sc.anims.generateFrameNumbers('hero_walk', { frames: [k * 3, k * 3 + 1, k * 3 + 2, k * 3 + 1] }), frameRate: 8, repeat: -1 }));
  }
  function walkable(sc, x, y) {
    if (sc.scene.key === 'Room') {
      const d = sc.cache.json.get('fur'); if (!d) return true;
      const c = d.cell * d.scale, row = d.mask[Math.floor(y / c)]; return !!row && row[Math.floor(x / c)] === '1';
    }
    return (ZONES[sc.scene.key] || []).some(([a, b, c, e]) => x >= a && x <= c && y >= b && y <= e);
  }
  function nearestWalkable(sc, x, y) {
    if (walkable(sc, x, y)) return [x, y];
    for (let r = 12; r <= 240; r += 12) for (let a = 0; a < 16; a++) { const t = a / 16 * Math.PI * 2, px = x + Math.cos(t) * r, py = y + Math.sin(t) * r; if (walkable(sc, px, py)) return [px, py]; }
    return null;
  }
  function walkTo(sc, x, y, done) {
    const p = nearestWalkable(sc, x, y); if (!p) return;
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
    sc.heroShadow = sc.add.ellipse(x, y - 2, 40, 12, 0x0f1c08, 0.35).setDepth(y - 1);
    sc.walker = sc.add.sprite(x, y, 'hero_walk', 1).setOrigin(0.52, 0.97).setDepth(y);
    sc.hero = sc.walker;                                              // «Zauber» и прочее — от идущего Max
    sc.input.on('pointerup', (p, over) => {
      if (sc.__dragged || (over && over.length) || sc.talking || sc.busy) return;
      if (document.getElementById('reward').style.display === 'block') return;
      walkTo(sc, p.worldX, p.worldY);
    });
    const ex = EXIT[sc.scene.key];
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
      walkTo(sc, npc.x + side, npc.y + 4, () => { sc.talking = true; if (sc.exitMarker) sc.exitMarker.setVisible(false); document.getElementById('dlg').style.display = 'block'; sc.show(); });
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
