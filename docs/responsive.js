// Мир под любой экран. Холст Phaser — в настоящих пикселях экрана (без растяжения CSS: чётко, без «сетки»),
// камера сама подгоняет сцену 960x540: телефон вертикально — сцена на всю высоту, видна часть двора, её можно тянуть пальцем;
// горизонтально — вся сцена целиком. Слой кнопок (#ui) на вертикальном экране — 540 логических px шириной, на всю высоту.
(function () {
  const SW = 960, SH = 540;
  const gameDiv = document.getElementById('game'), stage = document.getElementById('stage'), ui = document.getElementById('ui');
  let portrait = false;
  const isPortrait = () => innerHeight > innerWidth * 1.05;

  function focusX(sc) {
    if (sc.camFocusX) return sc.camFocusX;
    if (sc.scene.key === 'Room' && sc.hero && sc.npc) return (sc.hero.x + sc.npc.x) / 2;
    if (sc.scene.key === 'Yard' && sc.house && sc.hero) return (sc.house.x + sc.hero.x) / 2;
    return SW / 2;
  }
  function fitCam(sc) {
    if (!sc || !sc.cameras || !sc.cameras.main) return;
    const cam = sc.cameras.main, vw = game.scale.width, vh = game.scale.height, furn = sc.scene.key === 'Furnish';
    let top = 0, h = vh;
    if (furn) {                                          // комната — между верхней плашкой и полкой мебели
      const goal = document.getElementById('goal'), bar = document.getElementById('furnBar');
      const gb = goal && goal.offsetParent ? goal.getBoundingClientRect().bottom + 6 : 0, bt = bar && bar.offsetHeight ? bar.getBoundingClientRect().top - 6 : vh;
      top = Math.max(0, Math.round(gb)); h = Math.max(120, Math.round(bt - top));
    }
    cam.setViewport(0, top, vw, h);
    const whole = !portrait;
    const z = whole ? Math.min(vw / SW, h / SH) : h / SH;
    cam.setZoom(z);
    const halfW = vw / z / 2, fx = whole ? SW / 2 : Math.max(halfW, Math.min(SW - halfW, focusX(sc)));
    cam.centerOn(fx, SH / 2);
    if (portrait && (sc.scene.key === 'Yard' || furn) && !sc.__drag) addDrag(sc);
  }
  window.fitCam = fitCam;
  function addDrag(sc) {                                            // тянуть пальцем влево-вправо (двор, обустройство)
    sc.__drag = true; let x0 = null, c0 = 0; sc.events.once('shutdown', () => { sc.__drag = false; sc.__dragged = false; sc.camFocusX = 0; });   // сцена перезапускается — слушатели снимаются, флаг тоже
    sc.input.on('pointerdown', p => { x0 = p.x; c0 = sc.cameras.main.midPoint.x; sc.__dragged = false; });
    sc.input.on('pointermove', p => {
      if (x0 === null || !portrait) return;
      if (Math.abs(p.x - x0) > 8) sc.__dragged = true; if (!sc.__dragged) return;
      const cam = sc.cameras.main, halfW = cam.width / cam.zoom / 2;
      const c = Math.max(halfW, Math.min(SW - halfW, c0 - (p.x - x0) / cam.zoom));
      cam.centerOn(c, SH / 2); sc.camFocusX = c;
    });
    const up = () => { x0 = null; }; sc.input.on('pointerup', up); sc.input.on('pointerupoutside', up);
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
