// Полировка (локации) 24.11 — ступень «verbessert» (улучшенное) поверх целого здания: ящики с цветами под окнами, фонарь у двери,
// кадки с цветами, вывеска со словом. Решение главного 24.11: (а) Elternhaus (дом Max) — когда выполнены все 3 задачи Restore
// (schild, beet, brunnen); (б) дома деревни — когда глава дома пройдена целиком (ds_proto.app chapters: done >= total), как ступени town.js.
// Арт: assets_v3/town/plus (Calciumtrice «Medieval tileset», CC-BY 3.0, style_pick/ground/build_plus.py, x3) + фонарь restore/brunnen_laterne (craftpix).
// Чужие файлы не правит: только Yard events.on('create') и событие 'ds:restore'. Подписи (depth 6000) и HUD не перекрывает.
// API для проверок: TownPlus.state() -> { elternhaus, laden, gildenhaus, kirche }, TownPlus.items() -> [{ house, key, x, y, w, h }].
(function () {
  const P = 'assets_v3/town/plus/', KEYS = ['box', 'planter', 'planter_long', 'board', 'sign_bag', 'sign_mug'];
  const COL = { der: '#3a7be0', die: '#e24848', das: '#2f9a4f' };
  // [key, x (центр), y]: фасад (box/board/sign) — y = верх, глубина = низ здания; земля (lat/planter*) — y = низ, глубина = y
  const SET = {
    elternhaus: { rest: ['schild', 'beet', 'brunnen'], base: 402, items: [['box', 316, 363], ['box', 396, 363], ['box', 476, 363], ['box', 383, 271], ['box', 445, 271], ['lat', 264, 414, 1], ['planter_long', 336, 426]] },   // фонарь — у левого угла (у двери стоит Herr Schmidt с подписью)
    laden: { ch: 4, base: 714, items: [['box', 1043, 669], ['box', 1189, 669], ['box', 1060, 576], ['box', 1176, 576], ['lat', 1034, 720], ['board', 1116, 600, 'das Brot'], ['sign_bag', 1243, 627]] },   // Идеал (деревня) 24.11: на доске другое слово — «die Bäckerei» уже подпись места
    // Идеал (деревня) 24.11: Café (глава 4) и Supermarkt (глава 6) — «целое» = глава пройдена; «verbessert» = глава пройдена И в следующей главе >= 3 урока (next)
    cafe: { ch: 4, next: 3, base: 2556, items: [['box', 1680, 2490], ['board', 1757, 2412, 'der Kaffee'], ['sign_mug', 1612, 2462], ['planter', 1626, 2583], ['planter', 1878, 2583]] },   // справа от двери фонарь здания — туда ящик не ставим
    supermarkt: { ch: 6, next: 3, base: 1998, items: [['box', 2613, 1812], ['board', 2671, 1862, 'das Obst'], ['lat', 2805, 2013, 1]] },   // ящики/бочки у входа уже в спрайте; фонарь правее ящика
    gildenhaus: { ch: 2, base: 594, items: [['box', 1813, 500], ['box', 1640, 402], ['box', 1697, 402], ['planter', 1617, 606], ['lat', 1728, 600, 1], ['planter', 1782, 606]] },   // левое крыло — das Schwarze Brett с подписью: туда ничего
    kirche: { ch: 5, base: 720, items: [['planter', 2064, 723], ['planter', 2175, 723], ['lat', 2034, 726], ['lat', 2205, 726, 1]] },
  };
  const FACADE = { box: 1, board: 1, sign_bag: 1, sign_mug: 1 };
  const appCh = () => (window.DSMode ? DSMode.chapters() : JSON.parse(localStorage.getItem('ds_proto.app')).chapters || []);   // Три режима: DSMode (mode.js)
  const chDone = n => { try { const c = appCh().find(q => +q.n === n); return !!c && c.total > 0 && c.done >= c.total; } catch (e) { return false; } };
  const restDone = ids => { try { return !!(window.Restore && Restore.info) && ids.every(id => { const i = Restore.info(id); return !!i && i.st === 'done'; }); } catch (e) { return false; } };
  const chN = n => { try { const c = appCh().find(q => +q.n === n); return c ? +c.done || 0 : 0; } catch (e) { return 0; } };
  const state = () => { const s = {}; Object.entries(SET).forEach(([k, v]) => { s[k] = v.rest ? restDone(v.rest) : chDone(v.ch) && (!v.next || chN(v.ch + 1) >= v.next); }); return s; };
  let sc = null, objs = [], list = [];
  const g3 = v => Math.round(v / 3) * 3;                               // на сетку пикселя арта x3
  function clear() { objs.forEach(o => { try { o.destroy(); } catch (e) {} }); objs = []; list = []; }
  function place() {
    if (!sc || !sc.sys || !sc.sys.isActive()) return; clear(); const S = state();
    Object.entries(SET).forEach(([house, v]) => {
      if (!S[house]) return;
      v.items.forEach(([key, x, y, extra]) => {
        const k = key === 'lat' ? 'plus_lat' : 'plus_' + key; if (!sc.textures.exists(k)) return;
        const src = sc.textures.get(k).getSourceImage(), w = src.width, h = src.height, fac = !!FACADE[key];
        const left = g3(x - w / 2), top = fac ? g3(y) : g3(y - h);
        const img = sc.add.image(left, top, k).setOrigin(0, 0).setDepth(fac ? v.base + 0.5 : top + h);
        if (key === 'lat' && extra) img.setFlipX(true);
        img.townPlus = house; objs.push(img); list.push({ house, key, x: left, y: top, w, h });
        if (key === 'board' && typeof extra === 'string') {                // слово на вывеске: артикль в цвете рода, внутри доски
          const [art, ...wd] = extra.split(' '), st = { fontFamily: 'Roboto, sans-serif', fontStyle: 'bold', fontSize: '15px', stroke: '#2a170c', strokeThickness: 3 };
          const ta = sc.add.text(0, 0, art + ' ', { ...st, color: COL[art] || '#fff4dc' }), tw = sc.add.text(0, 0, wd.join(' '), { ...st, color: '#fff4dc' });
          const iw = w - 18, k2 = Math.min(1, iw / (ta.width + tw.width)), cy = top + h * 0.6;
          [ta, tw].forEach(t => t.setScale(k2).setOrigin(0, 0.5).setDepth(v.base + 0.6));
          const x0 = left + w / 2 - (ta.width + tw.width) * k2 / 2; ta.setPosition(Math.round(x0), Math.round(cy)); tw.setPosition(Math.round(x0 + ta.width * k2), Math.round(cy));
          [ta, tw].forEach(t => { t.townPlus = house; objs.push(t); });
        }
      });
    });
  }
  function setup(y) {
    sc = y; objs = []; list = [];
    const go = () => { if (window.Restore && Restore.ready && Restore.ready.then) Restore.ready.then(place, place); else place(); };
    const want = KEYS.map(k => ['plus_' + k, P + k + '.png']).concat([['plus_lat', 'assets_v3/world/restore/brunnen_laterne.png']]).filter(([k]) => !y.textures.exists(k));
    if (!want.length) return go();
    // свой загрузчик через Image -> textures.addImage: не трогает очередь y.load других модулей (restore/album грузят в ту же сцену)
    Promise.all(want.map(([k, u]) => new Promise(res => { const im = new Image(); im.onload = () => { try { if (!y.textures.exists(k)) y.textures.addImage(k, im); } catch (e) {} res(); }; im.onerror = () => res(); im.src = u; }))).then(go);
  }
  addEventListener('ds:restore', e => { if (e.detail && e.detail.t === 'done') setTimeout(place, 50); });
  (function hook() {
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 50);
    const y = g.scene.getScene('Yard'); if (y) y.events.on('create', () => { if (y.textures.exists('town_bg')) setup(y); });
  })();
  window.TownPlus = { state, items: () => list.slice(), refresh: place };
})();
