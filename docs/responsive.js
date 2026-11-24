// Мир под любой экран. Холст Phaser — в настоящих пикселях экрана (без растяжения CSS: чётко, без «сетки»),
// камера сама подгоняет сцену 960x540: телефон вертикально — сцена на всю высоту, видна часть двора, её можно тянуть пальцем;
// горизонтально — вся сцена целиком. Слой кнопок (#ui) на вертикальном экране — 540 логических px шириной, на всю высоту.
(function () {
  const SW = 960, SH = 540;
  const gameDiv = document.getElementById('game'), stage = document.getElementById('stage'), ui = document.getElementById('ui');
  let portrait = false;
  const isPortrait = () => innerHeight > innerWidth * 1.05;

  const PAN = ['Yard', 'Room', 'Furnish', 'Ort', 'Dungeon', 'Welt'];
  const clampC = (c, half, size) => (half * 2 >= size ? size / 2 : Math.max(half, Math.min(size - half, c)));
  function focus(sc) {
    if (sc.camFocus) return sc.camFocus;
    if (sc.scene.key === 'Room' && sc.hero && sc.npc) return [(sc.hero.x + sc.npc.x) / 2, SH / 2];
    if (sc.scene.key === 'Yard' && sc.house && sc.hero) return [(sc.house.x + sc.hero.x) / 2, SH / 2];
    if (sc.scene.key === 'Ort' && sc.o) return [(sc.o.hero[0] + sc.o.npc[0]) / 2, WH(sc) / 2];
    return [SW / 2, SH / 2];
  }
  const WW = sc => sc.worldW || SW, WH = sc => sc.worldH || SH;
  const snap = z => Math.max(1 / 3, Math.floor(z * 3 + 0.02) / 3);   // art is x3: zoom n/3 keeps every art pixel a whole number of screen pixels
  function apply(sc, cx, cy) {                                       // центр камеры в пределах сцены (по обеим осям)
    const cam = sc.cameras.main, hw = cam.width / cam.zoom / 2, hh = cam.height / cam.zoom / 2;
    const x = clampC(cx, hw, WW(sc)), y = clampC(cy, hh, WH(sc) + (sc.talking ? hh * 0.45 : 0)); cam.centerOn(x, y);   // while talking the scene may slide up above the dialog box sc.camFocus = [x, y];
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
    const VW = sc.viewW || WW(sc), VH = sc.viewH || WH(sc); sc.__base = portrait ? h / VH : Math.min(vw / VW, h / VH);   // деревня больше экрана: масштаб как у двора       // вертикально — по высоте, горизонтально — целиком
    cam.setZoom(zLim(sc, snap(sc.__base * (sc.__uz || 1))));
    const [fx, fy] = focus(sc); apply(sc, fx, fy);
    if (PAN.includes(sc.scene.key) && !sc.__drag) addDrag(sc);
  }
  window.fitCam = fitCam; window.camTo = (sc, x, y) => apply(sc, x, y);
  // Свет/камера 24.11: пределы зума. Наружу — до 2/3 (пиксель арта = 2 пикс. экрана) и не дальше, чем сцена закрывает экран
  // (маленькие комнаты не отдаляются); где сцена короче экрана (комната на телефоне) — фон light.js за краями, не чёрное. Внутрь — до 2,5 от обычного, не больше 4. Шаги кратны 1/3 (сетка x3).
  const snapUp = z => Math.ceil(z * 3 - 0.02) / 3;
  function zRange(sc) {
    const cam = sc.cameras.main, z0 = snap(sc.__base || 1), fit = snapUp(Math.max(cam.width / WW(sc), cam.height / WH(sc)));   // наружу — пока сцена ещё закрывает весь экран
    return [Math.min(z0, Math.max(2 / 3, fit)), Math.max(z0, Math.min(4, snap((sc.__base || 1) * 2.5)))];
  }
  function zLim(sc, z) { const [a, b] = zRange(sc); return Math.max(a, Math.min(b, z)); }
  function zoomAt(sc, z, px, py) {                                  // новый зум, точка мира под (px,py) экрана остаётся на месте
    const cam = sc.cameras.main; z = zLim(sc, z); if (Math.abs(z - cam.zoom) < 0.001) return false;
    const m = cam.midPoint, ox = (px == null ? 0 : px - cam.x - cam.width / 2), oy = (py == null ? 0 : py - cam.y - cam.height / 2);
    const wx = m.x + ox / cam.zoom, wy = m.y + oy / cam.zoom; cam.setZoom(z); sc.__uz = z / (sc.__base || 1);
    apply(sc, wx - ox / z, wy - oy / z); return true;
  }
  const zoomStep = (sc, dir, px, py) => zoomAt(sc, (Math.round(sc.cameras.main.zoom * 3) + dir) / 3, px, py);
  window.camZoom = { step: zoomStep, range: zRange, at: zoomAt };
  function addDrag(sc) {                                            // один палец — двигать в любую сторону, два — приблизить/отдалить
    sc.__drag = true; sc.input.addPointer(1);
    let start = null, pinch = null;
    sc.events.once('shutdown', () => { sc.__drag = false; sc.__dragged = false; sc.camFocus = null; sc.__uz = 1; });
    const pts = () => [sc.input.pointer1, sc.input.pointer2].filter(q => q && q.isDown);
    sc.input.on('pointerdown', p => { const m = sc.cameras.main.midPoint; start = { x: p.x, y: p.y, cx: m.x, cy: m.y }; sc.__dragged = false;
      const d = pts(); if (d.length === 2) { pinch = { dist: Math.hypot(d[0].x - d[1].x, d[0].y - d[1].y), z: sc.cameras.main.zoom }; sc.__dragged = true; } });
    sc.input.on('pointermove', p => {
      const cam = sc.cameras.main, d = pts();
      if (pinch && d.length === 2) {                                 // щипок: зум вокруг точки между пальцами
        const r = Math.hypot(d[0].x - d[1].x, d[0].y - d[1].y) / Math.max(10, pinch.dist), z = r >= 1 ? snap(pinch.z * r) : snapUp(pinch.z * r);
        zoomAt(sc, z, (d[0].x + d[1].x) / 2, (d[0].y + d[1].y) / 2); return;
      }
      if (!start || sc.__noPan) return;                               // Einrichten: пока предмет в руках, палец двигает предмет, а не комнату
      if (Math.hypot(p.x - start.x, p.y - start.y) > 8) sc.__dragged = true; if (!sc.__dragged) return;
      apply(sc, start.cx - (p.x - start.x) / cam.zoom, start.cy - (p.y - start.y) / cam.zoom);
    });
    const up = () => { const d = pts();
      if (pinch && d.length === 1) { const m = sc.cameras.main.midPoint; start = { x: d[0].x, y: d[0].y, cx: m.x, cy: m.y }; }   // после щипка оставшийся палец тянет без скачка
      if (d.length < 2) pinch = null; if (!d.length) start = null; };
    sc.input.on('pointerup', up); sc.input.on('pointerupoutside', up);
    let acc = 0;                                                     // колесо/тачпад: шаг 1/3 на каждые ~100 единиц прокрутки, вокруг курсора
    sc.input.on('wheel', (p, o, dx, dy) => { acc += dy; if (Math.abs(acc) < 90) return; const dir = acc > 0 ? -1 : 1; acc = 0; zoomStep(sc, dir, p.x, p.y); });
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
    body.vert #bMap{right:auto;left:12px} body.vert #bFurn{right:auto;left:50%;transform:translateX(-50%)} body.vert #bag{right:12px}
    body.vert #furnBar{flex-wrap:wrap;overflow:visible;justify-content:center}
    body.vert #furnBar .ui-btn{min-width:78px;flex:0 0 auto}
    .appLinks{flex-wrap:wrap}
    body.vert #btns{flex-wrap:wrap;justify-content:center}
    body.vert #btns .ui-btn{min-width:0;flex:1 1 40%}
    body.vert #dlg{left:12px;right:12px}
    body.vert .portrait{bottom:240px;width:112px;height:112px}
    body.vert #micHelp{width:auto;left:12px;right:12px;transform:none}
    body.vert #clock .ui-nameplate,body.vert #goal .ui-nameplate{font-size:18px}
    body.vert #toast{top:110px;font-size:26px;white-space:nowrap}
    #zoomBtns{position:absolute;right:10px;top:42%;display:none;flex-direction:column;gap:10px;pointer-events:auto;z-index:4}
    #zoomBtns .ui-btn{width:48px;height:48px;min-width:0;padding:0;font-size:30px;line-height:1;justify-content:center;pointer-events:auto}
    #zoomBtns .ui-btn:disabled{opacity:.45;cursor:default}`;
  document.head.appendChild(st);
  // Свет/камера 24.11: кнопки зума + / − справа посередине — только в сценах с камерой (кроме Einrichten), не в бою и не в диалоге;
  // ПК — всегда (и колесо), телефон — после касания карты на 4 с (и щипок)
  const zb = document.createElement('div'); zb.id = 'zoomBtns';
  zb.innerHTML = '<button class="ui-btn" data-z="1" title="näher · ближе">+</button><button class="ui-btn" data-z="-1" title="weiter · дальше">−</button>';
  ui.appendChild(zb);
  let zbTouch = 0;
  addEventListener('pointerdown', e => { if (e.target && (e.target.tagName === 'CANVAS' || zb.contains(e.target))) { zbTouch = Date.now(); if (portrait) setTimeout(zbUpd, 0); } }, true);
  const curSc = () => (window.game && game.scene && game.isBooted ? game.scene.getScenes(true).find(s => PAN.includes(s.scene.key) && s.scene.key !== 'Furnish') : null);
  function zbUpd() {
    const sc = curSc(), vis = id => { const e = document.getElementById(id); return e && e.offsetParent && getComputedStyle(e).display !== 'none'; };
    const r = sc && sc.cameras && sc.cameras.main && sc.__base ? zRange(sc) : null;
    const idle = portrait && Date.now() - zbTouch > 4000;           // телефон: кнопки появляются, когда игрок трогает карту, и прячутся через 4 с — мир чистый
    zb.style.display = idle || !r || r[1] - r[0] < 0.01 || sc.talking || vis('cb') || vis('dlg') || vis('loot') ? 'none' : 'flex';
    if (r) { const z = sc.cameras.main.zoom; zb.children[0].disabled = z >= r[1] - 0.001; zb.children[1].disabled = z <= r[0] + 0.001; }
  }
  zb.addEventListener('click', e => { const b = e.target.closest('button'), sc = curSc(); if (!b || !sc) return; e.stopPropagation(); zoomStep(sc, +b.dataset.z); zbUpd(); });
  setInterval(zbUpd, 300);
})();
