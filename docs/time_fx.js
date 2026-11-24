// Код (время) 24.11 — визуал времени поверх сцен (чужие файлы не трогаем: только хуки events.on('create')).
// 1) День/ночь: прямоугольник MULTIPLY над миром (утро тёплое, вечер оранжевый, ночь синяя, но читаемая). Подписи (Text, контейнеры с Text,
//    картинки-подписи wl_/wsign_, объекты со scrollFactor 0) поднимаются над тонировкой (+UI_BUMP к depth) — они не темнеют.
// 2) Ночью: мягкие световые круги (ADD) у дверей домов, фонарей, костра. 3) Сезоны: тонировка фона (town_bg / welt_map), частицы
//    (снег / листья / лепестки), зимой — иней поверх фона. 4) Праздники: украшения в деревне из паков (assets_v3/world/fest, craftpix), конфетти.
// 5) HUD: #clock «Abend · der Herbst · 20:15», тост праздника один раз в день. Отключить: ?nofx=1. Данные — window.WorldTime (time.js).
(function () {
  if (!window.WorldTime || /[?&]nofx=1/.test(location.search)) return;
  const WT = window.WorldTime, OUT = { Yard: 1, Welt: 1 }, IN = { Room: 1, Ort: 1, Furnish: 1 };
  const OVER_D = 20000, UI_BUMP = 100000;
  const SEASON_TINT = { fruehling: 0xf0fff0, sommer: 0xffffff, herbst: 0xffeec4, winter: 0xdde6ff };
  const lerp = (a, b, t) => a + (b - a) * t, rgb = c => [(c >> 16) & 255, (c >> 8) & 255, c & 255], hex = ([r, g, b]) => (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex([0, 1, 2].map(i => lerp(A[i], B[i], t))); };
  // цвет тонировки по времени: ночь (синяя), день (белый = без эффекта), утро/вечер — тёплые
  function skyColor(n) {
    const L = WT.light(n.date), w = 4 * L * (1 - L), warm = n.phase === 'abend' || (n.phase === 'nacht' && n.hour >= 12) ? 0xffa868 : 0xffdcb4;
    const dayish = mix(0xffffff, warm, Math.min(1, w * 1.25));
    return { L, color: mix(0x5a6cc0, dayish, L) };              // ночь 0x5a6cc0: ~40 % яркости, синий — читаемо
  }
  function indoorColor(n) { const L = WT.light(n.date); return mix(0xffd9a8, 0xffffff, L); }   // в доме ночью — тёплые лампы
  const isUI = o => o && !o.__tfx && (o.type === 'Text' || o.type === 'BitmapText' || (o.type === 'Container' && o.list && o.list.some(c => c.type === 'Text' || (c.type === 'Image' && /^(wl_|wsign_)/.test(c.texture && c.texture.key))))
    || (o.type === 'Image' && /^(wl_|wsign_)/.test(o.texture && o.texture.key)) || o.scrollFactorX === 0);

  // ---- текстуры (процедурные: световой круг, снежинка, листик, лепесток, конфетти — не арт, а свет и частицы)
  function texes(sc) {
    const T = sc.textures;
    if (!T.exists('tfx_glow')) { const c = T.createCanvas('tfx_glow', 128, 128), x = c.getContext(), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,214,140,0.95)'); g.addColorStop(0.35, 'rgba(255,180,90,0.45)'); g.addColorStop(1, 'rgba(255,150,60,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); c.refresh(); }
    const px = (k, w, h, cols) => { if (T.exists(k)) return; const c = T.createCanvas(k, w, h), x = c.getContext(); cols.forEach(([col, X, Y, W, H]) => { x.fillStyle = col; x.fillRect(X, Y, W, H); }); c.refresh(); };
    px('tfx_flake', 6, 6, [['#ffffff', 0, 0, 6, 6], ['#e8f0ff', 3, 3, 3, 3]]);
    px('tfx_leaf', 9, 6, [['#d9822b', 0, 0, 9, 6], ['#b8561c', 0, 3, 9, 3]]);
    px('tfx_petal', 6, 6, [['#f7b6c8', 0, 0, 6, 6], ['#fde1ea', 0, 0, 3, 3]]);
    px('tfx_conf', 6, 6, [['#ffffff', 0, 0, 6, 6]]);
  }

  // ---- точки света (деревня): двери домов и зданий, участки со зданием; в мире — костёр
  function lightSpots(sc) {
    const out = [], key = sc.scene.key;
    if (key === 'Yard') { const T = sc.cache.json.get('town'); if (!T) return out;
      Object.values(T.buildings || {}).forEach(b => out.push([b.door[0], b.door[1] - 30, 1.2]));
      (T.houses || []).filter(h => !h.plot).forEach(h => out.push([h.door[0], h.door[1] - 30, 1]));
      (sc.children.list || []).filter(o => o.type === 'Image' && /^a1_(cafe|supermarkt)$/.test(o.texture && o.texture.key)).forEach(o => out.push([o.x + o.displayWidth / 2, o.y + o.displayHeight - 40, 1.1]));
    }
    if (key === 'Welt' && sc.world && sc.world.camp) out.push([sc.world.camp.x * 3 + 24, sc.world.camp.y * 3 + 30, 2.2]);
    return out;
  }

  // ---- украшения праздников в деревне (арт: assets_v3/world/fest — craftpix, целый ×3, без ресемпла)
  const FEST_ART = { tannenbaum: 'assets_v3/world/fest/tannenbaum.png', laterne: 'assets_v3/world/fest/laterne.png' };
  // места выбраны по кадру town_bg (style_pick/time/_crop.png): Dorfplatz справа от линии «улица → дверь Gildenhaus», над бочкой; фонари — края площади и путь к церкви
  const PLACE = { tannenbaum: [[1710, 486]], laterne: [[1428, 666], [1857, 666], [2031, 666]] };
  const DECOR_OF = { tannenbaum: ['weihnachtsmarkt', 'heiligabend', 'weihnachten'], laterne: ['sankt_martin', 'uhrturmnacht', 'weihnachtsmarkt', 'heiligabend', 'silvester'] };
  function decorate(sc, st) {
    (st.decor || []).forEach(o => o.destroy()); st.decor = [];
    const on = WT.decorOn(WT.now().date), need = Object.keys(DECOR_OF).filter(k => DECOR_OF[k].some(id => on.includes(id)));
    if (!need.length) return;
    const put = () => need.forEach(k => PLACE[k].forEach(([x, y]) => {
      if (!sc.textures.exists('tfx_' + k)) return;
      const im = sc.add.image(x, y, 'tfx_' + k).setOrigin(0, 0).setScale(3); im.__tfx = 1; im.setDepth(y + im.displayHeight); st.decor.push(im);
      if (k === 'laterne') st.lamps.push([x + 48, y + 27, 0.9]);    // фонарь висит на крюке справа
    }));
    const miss = need.filter(k => !sc.textures.exists('tfx_' + k));
    if (!miss.length) return put();
    miss.forEach(k => sc.load.image('tfx_' + k, FEST_ART[k])); sc.load.once('complete', () => { if (sc.sys && sc.sys.isActive()) { put(); apply(sc, st, true); } }); sc.load.start();
  }

  // ---- частицы сезона/праздника, привязаны к видимой части мира
  function weather(sc, st) {
    if (st.em) { st.em.destroy(); st.em = null; }
    const n = WT.now(), fest = n.festivals; let cfg = null;
    if (fest.includes('fasching') || fest.includes('rosenmontag')) cfg = { tex: 'tfx_conf', tint: [0xe24848, 0x3a7be0, 0x2f9a4f, 0xffd23f, 0xb05ad6], freq: 70, speed: [60, 120], sx: [-40, 40], rot: true };
    else if (n.season === 'winter') cfg = { tex: 'tfx_flake', freq: 45, speed: [45, 90], sx: [-18, 18], scale: [0.6, 1.2] };
    else if (n.season === 'herbst') cfg = { tex: 'tfx_leaf', freq: 420, speed: [40, 70], sx: [-50, 10], rot: true };
    else if (n.season === 'fruehling') cfg = { tex: 'tfx_petal', freq: 700, speed: [30, 55], sx: [-30, 30], rot: true };
    if (!cfg) return;
    // рождаются по всему видимому миру (камера ходит за Max — снег всегда на экране), живут 3 с и тают; плотность по площади экрана
    const cam = sc.cameras.main, LIFE = 3000, v = () => cam.worldView, freq = Math.max(4, Math.round(cfg.freq * 960 * 540 / Math.max(1, (v().width || 960) * (v().height || 540)) / 4));
    const em = sc.add.particles(0, 0, cfg.tex, {
      x: { onEmit: () => v().x - 40 + Math.random() * (v().width + 80) }, y: { onEmit: () => v().y - 40 + Math.random() * (v().height + 40) },
      speedY: { min: cfg.speed[0], max: cfg.speed[1] }, speedX: { min: cfg.sx[0], max: cfg.sx[1] },
      lifespan: { min: LIFE * 0.7, max: LIFE * 1.2 }, frequency: freq, quantity: 1,
      scale: cfg.scale ? { min: cfg.scale[0], max: cfg.scale[1] } : 1, rotate: cfg.rot ? { min: 0, max: 360 } : 0, tint: cfg.tint || 0xffffff, alpha: { start: 1, end: 0 } });
    em.__tfx = 1; em.setDepth(OVER_D - 1); st.em = em;              // под тонировкой: ночью снег тоже тёмно-синий
    if (em.emitParticle) { const k = Math.round(LIFE / freq); for (let i = 0; i < k; i++) em.emitParticle(1); }
    if (cfg.tex === 'tfx_conf') em.setBlendMode(Phaser.BlendModes.NORMAL);
  }

  // ---- применить время к сцене
  function apply(sc, st, force) {
    if (!sc.sys || !sc.sys.isActive() || !st.over) return;
    const n = WT.now(), key = sc.scene.key, out = !!OUT[key];
    const W = sc.worldW || 960, H = sc.worldH || 540;
    st.over.setPosition(-6400, -6400).setSize(W + 12800, H + 12800);   // свет/камера 24.11: и фон за краями карты (light.js, зум наружу)
    if (out) {
      const s = skyColor(n); st.L = s.L; st.over.setFillStyle(s.color, 1); st.over.setVisible(s.color !== 0xffffff);
      const glowA = Math.max(0, Math.min(1, (0.75 - s.L) / 0.55));
      if (force || st.glowN !== (st.lamps.length + st.spots.length)) {
        st.glows.forEach(g => g.destroy()); st.glows = [];
        st.spots.concat(st.lamps).forEach(([x, y, k], i) => { const LF = window.LightFX, g = sc.add.image(LF ? Math.round(x / 3) * 3 : x, LF ? Math.round(y / 3) * 3 : y, LF ? LF.glowTex(sc, Math.round(30 * k)) : 'tfx_glow').setBlendMode(Phaser.BlendModes.ADD).setScale(LF ? 3 : 1.6 * k).setDepth(OVER_D + 1); g.__tfx = 1; g.__lamp = i >= st.spots.length; st.glows.push(g); });
        st.glowN = st.lamps.length + st.spots.length;
      }
      const lampA = Math.max(0, Math.min(1, (0.97 - s.L) / 0.45));   // праздничные фонари зажигают раньше окон — уже в сумерках (Sankt Martin в 17 ч)
      st.glows.forEach((g, i) => { const a = g.__lamp ? lampA : glowA; g.setAlpha(a * (window.AnimFX && AnimFX.less() ? 0.92 : [1, 0.9, 1, 0.82, 0.95, 0.88][Math.floor(sc.time.now / 170 + i * 3) % 6])).setVisible(a > 0.02); });   // огонь мерцает ступенями (анимации/свет 24.11)
      if (st.season !== n.season || force) {
        st.season = n.season; const t = SEASON_TINT[n.season];
        (sc.children.list || []).filter(o => o.type === 'Image' && /^(town_bg|v3_yard_bg|welt_map_|lfx_edge_)/.test(o.texture && o.texture.key)).forEach(o => { if (t === 0xffffff) o.clearTint(); else o.setTint(t); });
        if (st.frost) { st.frost.destroy(); st.frost = null; }
        if (n.season === 'winter') { st.frost = sc.add.rectangle(-6400, -6400, W + 12800, H + 12800, 0xffffff, 0.16).setOrigin(0, 0).setDepth(-9); st.frost.__tfx = 1; }
      }
    } else {
      const c = indoorColor(n); st.over.setFillStyle(c, 1); st.over.setVisible(c !== 0xffffff);
    }
    if (st.over.visible) (sc.children.list || []).forEach(o => { if (o.depth < UI_BUMP && isUI(o)) o.setDepth(o.depth + UI_BUMP); });
  }

  function setup(sc) {
    const key = sc.scene.key; if (!OUT[key] && !IN[key]) return;
    texes(sc);
    const st = sc.__tfx = { glows: [], lamps: [], spots: [], decor: [], L: 1 };
    st.over = sc.add.rectangle(0, 0, 10, 10, 0xffffff, 1).setOrigin(0, 0).setDepth(OVER_D).setBlendMode(Phaser.BlendModes.MULTIPLY); st.over.__tfx = 1;
    if (OUT[key]) { st.spots = lightSpots(sc); if (key === 'Yard') decorate(sc, st); weather(sc, st); }
    apply(sc, st, true);
    setTimeout(() => { if (sc.sys && sc.sys.isActive() && sc.__tfx === st) { if (OUT[key]) st.spots = lightSpots(sc); apply(sc, st, true); } }, 900);   // участки A1 и подписи грузятся позже
    const ev = sc.time.addEvent({ delay: 400, loop: true, callback: () => apply(sc, st, false) });
    const offs = [WT.on('season', () => { weather(sc, st); apply(sc, st, true); }), WT.on('festival', () => { if (key === 'Yard') { st.lamps = []; decorate(sc, st); } weather(sc, st); apply(sc, st, true); })];
    sc.events.once('shutdown', () => { offs.forEach(f => f()); ev.remove(); sc.__tfx = null; });
    if (OUT[key]) setTimeout(festToast, 1300);
  }

  // ---- HUD: #clock и тост праздника (раз в день)
  const pad = v => String(v).padStart(2, '0');
  const vert = () => document.body.classList.contains('vert');
  const RU_PH = { morgen: 'утро', tag: 'день', abend: 'вечер', nacht: 'ночь' }, RU_SE = { fruehling: 'весна', sommer: 'лето', herbst: 'осень', winter: 'зима' };
  function clock(n) {
    n = n || WT.now(); const el = document.querySelector('#clock .ui-nameplate'); if (!el) return;
    const se = vert() ? n.seasonDe.replace(/^der /, '') : n.seasonDe;   // телефон вертикально: компактно без артикля (с артиклем — по тапу, в тосте)
    const de = `${n.phaseDe} · ${se} · ${pad(n.hour)}:${pad(n.minute)}`, ru = RU_PH[n.phase] + ' · ' + RU_SE[n.season];
    if (el.dataset.ruFor === de && el.querySelector(':scope > small.ru')) return layoutClock();
    el.textContent = de; el.dataset.ruFor = de;                     // ru_labels.js: строка уже подписана — не трогает
    const s = document.createElement('small'); s.className = 'ru'; s.textContent = ru; el.appendChild(s); layoutClock();
  }
  // Часы видны и на телефоне вертикально (решение главного 24.11; правило responsive.js body.vert #clock{display:none} перекрыто более точным
  // селектором, без !important — inline display:none из боя/карты/арены по-прежнему прячет часы). Место: справа сверху; если задевает
  // #goal (монеты, цель, System, наставник) или плашку героя #cbHero — строкой ниже. Трекер заданий (quests.js) сам встаёт под часы.
  const css = document.createElement('style'); css.id = 'tfxClockCss';
  css.textContent = `body.vert #ui #clock{display:flex} #ui #clock{pointer-events:auto;cursor:pointer}
    body.vert #ui #clock .ui-nameplate{font-size:16px;height:auto;min-height:30px;padding:1px 8px;white-space:nowrap}
    body.vert #ui #clock .ui-nameplate small.ru{font-size:10px}`;
  document.head.appendChild(css);
  function layoutClock() {
    const c = document.getElementById('clock'); if (!c || !c.offsetParent) return;
    c.style.top = '10px'; const others = ['goal', 'cbHero'].map(id => document.getElementById(id)).filter(e => e && e.offsetParent);
    for (let k = 0; k < 3; k++) {
      const r = c.getBoundingClientRect(), s = (c.offsetHeight / r.height) || 1;   // #ui масштабирован: px экрана -> логические px
      const hit = others.find(e => { const q = e.getBoundingClientRect(); return q.left < r.right + 6 && q.right > r.left - 6 && q.top < r.bottom + 4 && q.bottom > r.top - 4; });
      if (!hit) break; c.style.top = Math.round(hit.offsetTop + hit.offsetHeight + 6) + 'px';
    }
  }
  document.getElementById('clock') && document.getElementById('clock').addEventListener('click', () => {
    const n = WT.now(), f = n.festivals.map(id => WT.festival(id)).filter(Boolean)[0];
    const full = `${n.phaseDe} · ${n.seasonDe} · ${pad(n.hour)}:${pad(n.minute)}`;   // по тапу — с артиклем
    if (window.toast) window.toast(vert() ? full : full + ` — ${RU_PH[n.phase]}, ${RU_SE[n.season]}` + (f ? ' · Heute: ' + (f.short || f.de) : ''), 2600);
  });
  addEventListener('resize', () => setTimeout(() => clock(), 60));
  setInterval(() => clock(), 700);                                  // и перестройка при повороте (класс body.vert ставит responsive.js)
  const toastText = f => { const de = 'Heute: ' + (f.short || f.de), all = de + ' — ' + f.ru; return vert() && all.length > 36 ? de : all; };   // телефон: тост в одну строку (nowrap)
  function festToast() {
    const n = WT.now(); if (!n.festivals.length || !window.toast) return;
    WT.ready(() => {
      const day = n.date.getFullYear() + '-' + (n.date.getMonth() + 1) + '-' + n.date.getDate(); let seen = {}; try { seen = JSON.parse(localStorage.getItem('ds_proto.festToast')) || {}; } catch (e) {}
      const len = id => { const r = WT.RULES[id] || {}; return r.untilM ? 99 : (r.days || 1); };   // сначала короткие (Nikolaus), потом долгие (Weihnachtsmarkt)
      const ids = n.festivals.filter(id => seen[id] !== day).sort((a, b) => len(a) - len(b)); if (!ids.length) return;
      const f = WT.festival(ids[0]); if (!f) return;
      ids.forEach(id => { seen[id] = day; }); try { localStorage.setItem('ds_proto.festToast', JSON.stringify(seen)); } catch (e) {}
      window.toast(toastText(f), 3800); window.__festToast = toastText(f);
    });
  }
  WT.on('minute', clock); clock();
  WT.on('festival', () => setTimeout(festToast, 300));

  (function hook() {
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 50);
    Object.keys(OUT).concat(Object.keys(IN)).forEach(k => { const sc = g.scene.getScene(k); if (sc) sc.events.on('create', () => setup(sc)); });
    g.scene.getScenes(true).forEach(sc => { if ((OUT[sc.scene.key] || IN[sc.scene.key]) && !sc.__tfx) setup(sc); });   // уже открытая сцена
  })();
  window.TimeFX = { apply: () => window.game && game.scene.getScenes(true).forEach(sc => sc.__tfx && apply(sc, sc.__tfx, true)), skyColor, isUI, UI_BUMP, OVER_D, festToast, clock };
})();
