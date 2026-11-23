// Arena — тестовый полигон боя (не в деревне): карта подземелья художника craftpix 169442 (Dungeon1) x3, маска пола, 3 врага.
// Вход: адрес с #arena или кнопка «Keller-Test» на карте (Karte). Выход «Raus» — во двор. Подключает бой: Combat.spawnEnemies.
(function () {
  class Arena extends Phaser.Scene {
    constructor() { super('Arena'); }
    preload() {
      this.load.image('arena_bg', 'assets_v3/arena/arena_bg.png'); this.load.json('arena', 'assets_v3/arena/arena.json');
      if (window.Combat) Combat.preload(this);
    }
    create() {
      const A = this.cache.json.get('arena'); this.A = A;
      this.worldW = A.w; this.worldH = A.h; this.viewW = 960; this.viewH = 540;
      this.cameras.main.setBackgroundColor(0x1d1a26); this.cameras.main.fadeIn(300);
      this.add.image(0, 0, 'arena_bg').setOrigin(0, 0).setDepth(-10);
      this.townMask = { cell: A.cell, mask: A.mask };                // walk.js: A* по маске пола, герой не проходит сквозь стены
      this.o = { exit: A.exit };                                     // walk.js: стрелка «Raus» у входа → двор
      this.hero = this.add.image(A.spawn[0], A.spawn[1], 'v3_hero').setOrigin(0.5, 1);
      this.camFocus = [A.spawn[0], A.spawn[1] - 60];
      ['bag', 'bFurn', 'bMap', 'clock'].forEach(k => { const e = document.getElementById(k); if (e) e.style.display = 'none'; });
      document.getElementById('dlg').style.display = 'none';
      const g = document.getElementById('goalTxt'); if (g) g.textContent = 'Keller-Übung';
      if (window.walkSetup) window.walkSetup(this);
      if (window.fitCam) { window.fitCam(this); setTimeout(() => window.fitCam(this), 0); }
      Combat.heroHp(Combat.hpMax());                                 // полигон: всегда с полным здоровьем
      this.enemies = Combat.spawnEnemies(this, A.enemies, { types: ['slime1', 'slime2', 'orc1'], entry: A.spawn });
      this.events.once('shutdown', () => { this.walker = null; this.heroShadow = null; this.talking = false; this.busy = false; ['bag', 'bMap'].forEach(k => { const e = document.getElementById(k); if (e) e.style.display = ''; }); });
    }
    update(t, dt) { Combat.update(this, dt); }
  }
  window.Arena = Arena;
  (function hook() {
    const g = window.game; if (!g || !g.scene || !g.isBooted || !g.scene.scenes.length) return setTimeout(hook, 50);
    if (!g.scene.getScene('Arena')) g.scene.add('Arena', Arena, false);
    const k = g.scene.getScene('Karte');                             // временная кнопка на карте (только для проверки боя)
    if (k) k.events.on('create', () => {
      const back = document.getElementById('bMapBack'); if (!back || document.getElementById('bArena')) return;
      const b = document.createElement('button'); b.id = 'bArena'; b.className = 'ui ui-btn'; b.style.marginLeft = '8px';
      b.innerHTML = '<b style="font-weight:700">Keller-Test</b><small class="cb-ru2">подвал · проба</small>';
      back.after(b); b.onclick = () => { document.getElementById('mapPanel').style.display = 'none'; k.cameras.main.fadeOut(250, 29, 19, 11); k.cameras.main.once('camerafadeoutcomplete', () => k.scene.start('Arena')); };
    });
    if (/arena/i.test(location.hash)) {                              // #arena: сразу на полигон
      const go = () => { const cur = g.scene.getScenes(true)[0]; if (!cur || cur.scene.key === 'Boot') return setTimeout(go, 60); if (cur.scene.key !== 'Arena') cur.scene.start('Arena'); };
      go();
    }
  })();
  const st = document.createElement('style');
  st.textContent = '#bArena{font-family:inherit;color:#2e1e12;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;height:44px;padding:0 14px;vertical-align:top;line-height:1.05}#bArena .cb-ru2{display:block;font-size:11px;font-weight:500;opacity:.78}';
  document.head.appendChild(st);
})();
