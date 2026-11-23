// Мир под любой экран. Холст Phaser — в настоящих пикселях экрана (без растяжения CSS: чётко, без «сетки»),
// камера сама подгоняет сцену 960x540: телефон вертикально — сцена на всю высоту, видна часть двора, её можно тянуть пальцем;
// горизонтально — вся сцена целиком. Слой кнопок (#ui) на вертикальном экране — 540 логических px шириной, на всю высоту.
(function () {
  const SW = 960, SH = 540;
  const gameDiv = document.getElementById('game'), stage = document.getElementById('stage'), ui = document.getElementById('ui');
  let portrait = false;
  const isPortrait = () => innerHeight > innerWidth * 1.05;

  const PAN = ['Yard', 'Room', 'Furnish', 'Ort'];
  const clampC = (c, half, size) => (half * 2 >= size ? size / 2 : Math.max(half, Math.min(size - half, c)));
  function focus(sc) {
    if (sc.camFocus) return sc.camFocus;
    if (sc.scene.key === 'Room' && sc.hero && sc.npc) return [(sc.hero.x + sc.npc.x) / 2, SH / 2];
    if (sc.scene.key === 'Yard' && sc.house && sc.hero) return [(sc.house.x + sc.hero.x) / 2, SH / 2];
    if (sc.scene.key === 'Ort' && sc.o) return [(sc.o.hero[0] + sc.o.npc[0]) / 2, WH(sc) / 2];
    return [SW / 2, SH / 2];
  }
  const WW = sc => sc.worldW || SW, WH = sc => sc.worldH || SH;
  function apply(sc, cx, cy) {                                       // центр камеры в пределах сцены (по обеим осям)
    const cam = sc.cameras.main, hw = cam.width / cam.zoom / 2, hh = cam.height / cam.zoom / 2;
    const x = clampC(cx, hw, WW(sc)), y = clampC(cy, hh, WH(sc)); cam.centerOn(x, y); sc.camFocus = [x, y];
  }
  function fitCam(sc) {
    if (!sc || !sc.cameras || !sc.cameras.main) return;
    const cam = sc.cameras.main, vw = game.scale.width, vh = game.scale.height, furn = sc.scene.key === 'Furnish';
    let top = 0, h = vh;
    if (furn) {                                                      // комната — между верхней плашкой и полкой мебели
      const goal = document.getElementById('goal'), bar = document.getElementById('furnBar');
      const gb = goal && goal.offsetParent ? goal.getBoundingClientRect().bottom + 6 : 0, bt = bar && bar.offsetHeight ? bar.getBoundingClientRect().top - 6 : vh;
      top = Math.max(0, Math.round(gb)); h = Math.max(120, Math.round(bt - top));
    }
    cam.setViewport(0, top, vw, h);
    sc.__base = portrait ? h / WH(sc) : Math.min(vw / WW(sc), h / WH(sc));       // вертикально — по высоте, горизонтально — целиком
    cam.setZoom(sc.__base * (sc.__uz || 1));
    const [fx, fy] = focus(sc); apply(sc, fx, fy);
    if (PAN.includes(sc.scene.key) && !sc.__drag) addDrag(sc);
  }
  window.fitCam = fitCam; window.camTo = (sc, x, y) => apply(sc, x, y);
  function addDrag(sc) {                                            // один палец — двигать в любую сторону, два — приблизить/отдалить
    sc.__drag = true; sc.input.addPointer(1);
    let start = null, pinch = null;
    sc.events.once('shutdown', () => { sc.__drag = false; sc.__dragged = false; sc.camFocus = null; sc.__uz = 1; });
    const pts = () => [sc.input.pointer1, sc.input.pointer2].filter(q => q && q.isDown);
    sc.input.on('pointerdown', p => { const m = sc.cameras.main.midPoint; start = { x: p.x, y: p.y, cx: m.x, cy: m.y }; sc.__dragged = false;
      const d = pts(); if (d.length === 2) { pinch = { dist: Math.hypot(d[0].x - d[1].x, d[0].y - d[1].y), uz: sc.__uz || 1 }; sc.__dragged = true; } });
    sc.input.on('pointermove', p => {
      const cam = sc.cameras.main, d = pts();
      if (pinch && d.length === 2) {
        const uz = Math.max(1, Math.min(3, pinch.uz * Math.hypot(d[0].x - d[1].x, d[0].y - d[1].y) / Math.max(10, pinch.dist)));
        const m = cam.midPoint; sc.__uz = uz; cam.setZoom(sc.__base * uz); apply(sc, m.x, m.y); return;
      }
      if (!start) return;
      if (Math.hypot(p.x - start.x, p.y - start.y) > 8) sc.__dragged = true; if (!sc.__dragged) return;
      apply(sc, start.cx - (p.x - start.x) / cam.zoom, start.cy - (p.y - start.y) / cam.zoom);
    });
    const up = () => { if (pts().length < 2) pinch = null; if (!pts().length) start = null; };
    sc.input.on('pointerup', up); sc.input.on('pointerupoutside', up);
    sc.input.on('wheel', (p, o, dx, dy) => { const cam = sc.cameras.main, m = cam.midPoint; sc.__uz = Math.max(1, Math.min(3, (sc.__uz || 1) * (dy > 0 ? 0.9 : 1.1))); cam.setZoom(sc.__base * sc.__uz); apply(sc, m.x, m.y); });
  }
  function layout() {
    const vw = innerWidth, vh = innerHeight; portrait = isPortrait();
    document.body.classList.toggle('vert', portrait);
    const UW = portrait ? 540 : 960, UH = portrait ? Math.round(540 * vh / vw) : 540;
    const s = Math.min(vw / UW, vh / UH);
    stage.style.width = UW + 'px'; stage.style.height = UH + 'px'; ui.style.width = UW + 'px'; ui.style.height = UH + 'px';
    stage.style.transform = `scale(${s})`; stage.style.left = (vw - UW * s) / 2 + 'px'; stage.style.top = (vh - UH * s) / 2 + 'px';
    if (gameDiv.parentElement === stage) document.body.insertBefore(gameDiv, stage);
    gameDiv.style.width = vw + 'px'; gameDiv.style.height = vh + 'px';
    if (window.game && game.scale && game.isBooted) { if (game.scale.width !== vw || game.scale.height !== vh) game.scale.resize(vw, vh); game.scene.getScenes(true).forEach(fitCam); }
  }
  window.fit = layout;                                                // main.js зовёт fit() — теперь это эта раскладка
  function hook() {
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length || !g.isBooted) return setTimeout(hook, 50);
    g.scene.scenes.forEach(sc => sc.events.on('create', () => { fitCam(sc); setTimeout(() => fitCam(sc), 0); }));
    layout();
  }
  removeEventListener('resize', window.__oldFit || (() => {}));
  addEventListener('resize', layout); layout(); hook();
  const st = document.createElement('style');
  st.textContent = `
    #stage{pointer-events:none} #game{position:absolute;left:0;top:0} #game canvas{width:auto!important;height:auto!important;image-rendering:pixelated}
    body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
    body.vert #clock{display:none}
    body.vert #furnBar{flex-wrap:wrap;overflow:visible;justify-content:center}
    body.vert #furnBar .ui-btn{min-width:78px;flex:0 0 auto}
    .appLinks{flex-wrap:wrap}
    body.vert #btns{flex-wrap:wrap;justify-content:center}
    body.vert #btns .ui-btn{min-width:0;flex:1 1 40%}
    body.vert #dlg{left:12px;right:12px}
    body.vert .portrait{bottom:240px;width:112px;height:112px}
    body.vert #micHelp{width:auto;left:12px;right:12px;transform:none}
    body.vert #clock .ui-nameplate,body.vert #goal .ui-nameplate{font-size:18px}
    body.vert #toast{top:110px;font-size:26px;white-space:nowrap}`;
  document.head.appendChild(st);
})();
