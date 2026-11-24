// Деревня Stillbach — одна бесшовная карта (assets_v3/town): двор героя + улица + дома. Max идёт куда тапнули,
// тап по дому — идёт к двери и входит (Gildenhaus — сцена внутри мира; закрытые дома говорят, с какой главы).
// Над домами — вывески с артиклем в цвете (der синий, die красный, das зелёный). Город растёт по главам (заглушки — «bald»).
(function () {
  const HOUSES = {
    laden: { de: 'die Bäckerei', ru: 'пекарня', chapter: 4, ort: 'baeckerei' },
    gildenhaus: { de: 'das Gildenhaus', ru: 'дом гильдии', chapter: 2, ort: 'buergeramt' },
    kirche: { de: 'die Kirche', ru: 'церковь', chapter: 5, ort: null },
  };
  const COL = { der: '#3a7be0', die: '#e24848', das: '#2f9a4f' };
  window.WELT_GATE = { x: 50, y: 456 };                             // край леса у дома героя: «Hinaus in die Welt»
  window.WELT_ON = true;                                             // континент Wiesenland готов: checks/overworld_check.cjs PASS (23.11)
  window.KELLER_HATCH = { x: 696, y: 440 };                          // люк в подвал (центр, px деревни); Dungeon возвращает Max сюда
  function reach() {
    let ch = []; try { ch = JSON.parse(localStorage.getItem('ds_proto.app')).chapters || []; } catch (e) {}
    const started = ch.filter(c => c.done > 0).map(c => c.n);
    return Math.max(typeof state !== 'undefined' && state.done ? 2 : 1, started.length ? Math.max(...started) + 1 : 1);
  }
  function setupTown(sc) {
    const T = sc.cache.json.get('town'); if (!T || !sc.textures.exists('town_bg')) return;
    sc.worldW = T.w; sc.worldH = T.h; sc.viewW = 960; sc.viewH = 540; sc.townMask = T;
    const open = reach();
    Object.entries(T.buildings).forEach(([key, b]) => {
      const h = HOUSES[key]; if (!h) return;
      const [x0, y0, x1, y1] = b.box, zone = sc.add.zone((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0).setInteractive({ useHandCursor: true });
      const [art, ...w] = h.de.split(' '), locked = h.chapter > open;
      const sign = sc.add.text((x0 + x1) / 2, y0 - 6, `${art} ${w.join(' ')}${locked ? '  🔒' : ''}`, { fontFamily: 'Roboto, sans-serif', fontSize: '22px', fontStyle: 'bold', color: '#fff7e0', stroke: '#3b2314', strokeThickness: 6 }).setOrigin(0.5, 1).setDepth(6000);
      sign.setTint(0xffffff); sign.setColor('#fff7e0'); sc.add.text(sign.x - sign.width / 2 + 2, sign.y - sign.height + 6, art, { fontFamily: 'Roboto, sans-serif', fontSize: '22px', fontStyle: 'bold', color: COL[art], stroke: '#3b2314', strokeThickness: 6 }).setDepth(6001);
      zone.on('pointerup', () => {
        if (sc.__dragged || sc.busy) return;
        if (window.speakDE) speakDE(h.de);
        const go = () => {
          if (locked) return toast(h.de + ': ab Kapitel ' + h.chapter, 1800);
          if (!h.ort || !(window.ORTE && ORTE[h.ort])) return toast(h.de + ' — bald', 1600);
          sc.registry.set('spawnAt', [b.door[0], b.door[1] + 40]); sc.busy = true;
          sc.cameras.main.fadeOut(250, 29, 19, 11); sc.cameras.main.once('camerafadeoutcomplete', () => sc.scene.start('Ort', { place: h.ort }));
        };
        if (window.walkToScene) window.walkToScene(sc, b.door[0], b.door[1] + 30, go); else go();
      });
    });
    // ---- Код A1 24.11: ступени участков (design-doc/town-plan.md): 1 Bauplatz (глава закрыта) -> 2 Baustelle (глава открыта) -> 3 Gebäude (все уроки главы).
    // Арт — style_pick/a1/build_a1_stages.py (craftpix 504452). Здания есть у das Café и der Supermarkt; остальные участки на 3-й ступени пока стройка.
    const A1R = { cafe: { art: 'cafe' }, supermarkt: { art: 'supermarkt' }, uhrturm: { art: 'uhrturm', keller: true, dx: 82 } };   // колышки этих участков рисует игра (build_town.py A1_RUNTIME)
    // Арт (Uhrturm, правка) 24.11: der Uhrturm рисует town.js (был хук uhrturm.js): uhrturm.png 117x252 (style_pick/uhrturm/build_uhrturm.py, x3), метрики uhrturm.json (a1ut);
    // башня справа от люка Erinnerungskeller (dx — сдвиг центра от середины участка), глубина = низ башни, вывески — поверх (depth 6000).
    const uhrNow = () => { try { const n = window.WorldTime && WorldTime.now && WorldTime.now(); if (n && n.hour != null) return [n.hour, n.minute]; } catch (e) {} const d = new Date(); return [d.getHours(), d.getMinutes()]; };
    const clockOf = (img, ox, oy, U) => {                            // стрелки (uhrturm_hands.png: кадр m — минутная, 60+(h%12)*4+m//15 — часовая) = время игры WorldTime
      img.a1tower = 1; const dep = oy + U.h, hx = ox + U.clock[0] + 0.5, hy = oy + U.clock[1] + 0.5;   // +0.5: центр пикселя пака, край кадра 69 px — на сетке x3
      const hm = sc.add.sprite(hx, hy, 'a1_uhrturm_hands', U.hands.min).setDepth(dep + 0.2), hh = sc.add.sprite(hx, hy, 'a1_uhrturm_hands', U.hands.hour).setDepth(dep + 0.1);
      const set = () => { const [h, m] = uhrNow(); hm.setFrame(U.hands.min + m % 60); hh.setFrame(U.hands.hour + (h % 12) * 4 + Math.floor(m / 15)); hm.uhr = [h, m]; };
      set(); const off = window.WorldTime && WorldTime.on ? WorldTime.on('minute', set) : null, iv = setInterval(() => (hm.scene ? set() : clearInterval(iv)), 20000);
      sc.events.once('shutdown', () => { clearInterval(iv); if (off) off(); });
      window.UHRTURM = { x: ox, y: oy, w: U.w, h: U.h, clock: [hx, hy], hands: () => [hm.frame.name, hh.frame.name], time: () => hm.uhr };
    };
    if (!T.__mask0) T.__mask0 = T.mask.slice(); T.mask = T.__mask0.slice();   // маска заново при каждом входе: ступени только добавляют стены
    const chOf = n => { try { return (JSON.parse(localStorage.getItem('ds_proto.app')).chapters || []).find(c => +c.n === n) || null; } catch (e) { return null; } };
    const plotStage = p => { if (p.chapter > open) return 1; const c = chOf(p.chapter); return c && c.total > 0 && c.done >= c.total ? 3 : 2; };
    window.plotStage = plotStage;
    const wall = (x, y, w, h) => { const c = T.cell; for (let r = Math.floor(y / c); r <= Math.floor((y + h - 1) / c); r++) { const row = T.mask[r]; if (!row) continue;
      const q0 = Math.max(0, Math.floor(x / c)), q1 = Math.min(row.length - 1, Math.floor((x + w - 1) / c)); if (q1 >= q0) T.mask[r] = row.slice(0, q0) + '0'.repeat(q1 - q0 + 1) + row.slice(q1 + 1); } };
    const label = (x, yb, de, sub, fs = 22) => {                   // вывеска: der/die/das в цвете рода + слово, под ней мелко по-русски
      const [art, ...w] = de.split(' '), st = { fontFamily: 'Roboto, sans-serif', fontStyle: 'bold', stroke: '#3b2314' };
      const t2 = sc.add.text(x, yb, sub, { ...st, fontSize: Math.round(fs * 0.6) + 'px', fontStyle: 'normal', color: '#f3e3c3', strokeThickness: 4 }).setOrigin(0.5, 1).setDepth(6000);
      const ta = sc.add.text(0, 0, art + ' ', { ...st, fontSize: fs + 'px', color: COL[art] || '#fff7e0', strokeThickness: 6 }).setOrigin(0, 1).setDepth(6001);
      const tw = sc.add.text(0, 0, w.join(' '), { ...st, fontSize: fs + 'px', color: '#fff7e0', strokeThickness: 6 }).setOrigin(0, 1).setDepth(6000);
      const x0 = x - (ta.width + tw.width) / 2, y1 = yb - t2.height + 4; ta.setPosition(x0, y1); tw.setPosition(x0 + ta.width, y1);
      [ta, tw, t2].forEach(t => { t.a1sign = de; }); return [ta, tw, t2];
    };
    const stakesOf = p => { const [x0, y0, x1, y1] = p.box; [[x0, y0], [x1 - 21, y0], [x0, y1 - 45], [x1 - 21, y1 - 45]].forEach(([x, y]) => { sc.add.image(x, y, 'a1_stake').setOrigin(0, 0).setDepth(y + 45); wall(x, y, 21, 45); }); };
    const keller = (p, tx) => {                                     // вход в Erinnerungskeller (подземелье повтора) у Uhrturm: люк craftpix 436971, как у «der Keller»; tx — левый край башни (3-я ступень)
      const [x0, y0] = p.box, hx = x0 + 27, hy = y0 + 3; window.ERINNERUNG_HATCH = { x: hx + 25, y: y0 + 14 };
      const put = () => {
        const tex = sc.textures.get('dun_anim'); if (!tex.has('hatch')) tex.add('hatch', 0, 160, 159, 17, 17);
        const img = sc.add.image(hx, hy, 'dun_anim', 'hatch').setOrigin(0, 0).setScale(3).setDepth(1).setInteractive({ useHandCursor: true }); img.a1 = 'erinnerungskeller';
        if (!tx) label(hx + 51 + 90, hy + 48, 'der Erinnerungskeller', 'подвал памяти', 16);   // справа от люка, между колышками
        else { const lb = label(hx + 25, hy + 51 + 40, 'der Erinnerungskeller', 'подвал памяти', 16);   // башня стоит: под люком, между левым краем участка и башней
          const R = Math.max(...lb.map(t => t.getBounds().right)), Lf = Math.min(...lb.map(t => t.getBounds().x));
          let sh = Math.min(0, tx - 6 - R); if (Lf + sh < x0 + 2) sh = x0 + 2 - Lf; if (sh) lb.forEach(t => { t.x += sh; }); }
        img.on('pointerup', () => {
          if (sc.__dragged || sc.busy) return; if (window.speakDE) speakDE('der Erinnerungskeller');
          const day = Math.floor(Date.now() / 864e5), go = () => { sc.busy = true; sc.cameras.main.fadeOut(250, 24, 20, 37); sc.cameras.main.once('camerafadeoutcomplete', () => sc.scene.start('Dungeon', { from: 'Uhrturm', seed: (day * 7919 + 5) >>> 0 })); };
          if (window.walkToScene) window.walkToScene(sc, ERINNERUNG_HATCH.x, ERINNERUNG_HATCH.y, go); else go();
        });
      };
      if (sc.textures.exists('dun_anim')) put(); else { sc.load.image('dun_anim', 'assets_v3/dungeon/anim.png'); sc.load.once('complete', put); sc.load.start(); }
    };
    const stagePlot = (p, stg) => {
      const S = sc.cache.json.get('a1st'), [x0, y0, x1, y1] = p.box, cx = (x0 + x1) / 2, A = A1R[p.key] || {}, UT = sc.cache.json.get('a1ut');
      const key = stg === 3 && A.art && (A.art !== 'uhrturm' || (UT && sc.textures.exists('a1_uhrturm') && sc.textures.exists('a1_uhrturm_hands'))) ? A.art : (p.key === 'uhrturm' ? 'uhrturm_bau' : (y1 - y0 >= S.baustelle.h + 60 ? 'baustelle' : 'baustelle_s'));
      const built = key === A.art, m = key === 'uhrturm' ? UT : S[key], ox = Math.round((cx + (built && A.dx || 0) - m.w / 2) / 3) * 3, oy = y1 - m.h - (built ? 0 : 6);
      const img = sc.add.image(ox, oy, 'a1_' + key).setOrigin(0, 0).setDepth(oy + m.h); wall(ox, oy, m.w, m.h);
      if (key === 'uhrturm') clockOf(img, ox, oy, m);
      if (A1R[p.key] && !built) stakesOf(p);
      label(built ? ox + m.w / 2 : cx, oy - 56 >= y0 ? oy - 6 : Math.min(oy, y0) - 6, p.de, (built ? '' : 'Baustelle · ') + p.ru);   // внутри участка над стройкой, если влезает; иначе над участком
      const z = sc.add.zone(ox + m.w / 2, oy + m.h / 2, m.w, m.h).setInteractive({ useHandCursor: true }); z.a1 = { key: p.key, stage: stg, art: key };
      z.on('pointerup', () => {
        if (sc.__dragged || sc.busy) return;
        if (key === 'uhrturm') { const [h, mi] = uhrNow(); if (window.speakDE) speakDE('der Uhrturm. Es ist ' + h + ' Uhr' + (mi ? ' ' + mi : '') + '.'); return toast('der Uhrturm — Es ist ' + h + ':' + String(mi).padStart(2, '0') + ' Uhr.', 2200); }   // интерьера нет: башня говорит время
        if (window.speakDE) speakDE(p.de);
        if (!built) return toast(p.de + ' — Baustelle · Kapitel ' + p.chapter, 1800);
        const dx = ox + S.door[key], dy = y1 + 30, ort = window.ORTE && ORTE[key] ? key : null;   // Код (интерьеры) 24.11: дверь -> Ort (place 'cafe' / 'supermarkt'); нет интерьера -> «bald»
        const go = () => {
          if (!ort) return toast(p.de + ' — bald', 1600);
          const w = sc.walker, near = w && Math.hypot(w.x - dx, w.y - dy) < 60;   // «Raus» вернёт Max к этой двери (там, где он стоял)
          sc.registry.set('spawnAt', near ? [Math.round(w.x), Math.round(w.y)] : [dx, dy]); sc.busy = true;
          sc.cameras.main.fadeOut(250, 29, 19, 11); sc.cameras.main.once('camerafadeoutcomplete', () => sc.scene.start('Ort', { place: ort }));
        };
        if (window.walkToScene) window.walkToScene(sc, dx, dy, go); else go();
      });
      if (A.keller) keller(p, built ? ox : 0);
    };
    const PS = T.plot_sign;                                         // будущие места: пиксельная доска «Bauplatz» (доска craftpix, town/plot_sign.png), текст строго внутри рамки
    const signs = () => (T.plots || []).forEach(p => {
      if (!PS || !p.sign) return;
      const stg = sc.cache.json.get('a1st') && p.key !== 'hafen' ? plotStage(p) : 1;
      if (stg > 1) return stagePlot(p, stg);
      if (A1R[p.key] && sc.textures.exists('a1_stake')) stakesOf(p);
      const [sx, sy] = p.sign, [ix0, iy0, ix1, iy1] = PS.inner, iw = ix1 - ix0 - 8, ih = iy1 - iy0 - 2, cx = sx + (ix0 + ix1) / 2, dep = sy + PS.h;
      const board = sc.add.image(sx, sy, 'plot_sign').setOrigin(0, 0).setDepth(dep);
      const [art, ...w] = p.de.split(' '), st = { fontFamily: 'Roboto, sans-serif', stroke: '#2a170c', strokeThickness: 3 };
      const t1 = sc.add.text(0, 0, 'Bauplatz', { ...st, fontSize: '13px', fontStyle: 'bold', color: '#f3d9a4' });
      const ta = sc.add.text(0, 0, art + ' ', { ...st, fontSize: '19px', fontStyle: 'bold', color: COL[art] || '#fff4dc' });
      const tw = sc.add.text(0, 0, w.join(' '), { ...st, fontSize: '19px', fontStyle: 'bold', color: '#fff4dc' });
      const t3 = sc.add.text(0, 0, 'ab Kapitel ' + p.chapter + ' · ' + p.ru, { ...st, fontSize: '12px', color: '#f3d9a4', strokeThickness: 2 });
      const rows = [[t1], [ta, tw], [t3]], wid = r => r.reduce((s, t) => s + t.width, 0), hei = r => Math.max(...r.map(t => t.height));
      let k = Math.min(1, ih / rows.reduce((s, r) => s + hei(r), 0)); rows.forEach(r => { k = Math.min(k, iw / wid(r)); });
      let y = sy + iy0 + 1 + (ih - rows.reduce((s, r) => s + hei(r) * k, 0)) / 2;
      rows.forEach(r => { let x = cx - wid(r) * k / 2; r.forEach(t => { t.setScale(k).setPosition(x, y).setDepth(dep + 1); x += t.width * k; }); y += hei(r) * k; });
      board.setInteractive({ useHandCursor: true }).on('pointerup', () => { if (sc.__dragged) return; if (window.speakDE) speakDE(p.de); toast(p.de + ' — ab Kapitel ' + p.chapter, 1800); });
    });
    const A1K = ['baustelle', 'baustelle_s', 'uhrturm_bau', 'cafe', 'supermarkt', 'stake', 'uhrturm'];   // ступени (Код A1) + der Uhrturm (Арт)
    if (sc.textures.exists('plot_sign') && sc.cache.json.get('a1st') && sc.cache.json.get('a1ut') && sc.textures.exists('a1_uhrturm_hands') && A1K.every(k => sc.textures.exists('a1_' + k))) signs();
    else {
      if (!sc.textures.exists('plot_sign')) sc.load.image('plot_sign', 'assets_v3/town/plot_sign.png');
      A1K.forEach(k => { if (!sc.textures.exists('a1_' + k)) sc.load.image('a1_' + k, 'assets_v3/town/a1/' + k + '.png'); });
      if (!sc.cache.json.get('a1st')) sc.load.json('a1st', 'assets_v3/town/a1/a1.json');
      if (!sc.cache.json.get('a1ut')) sc.load.json('a1ut', 'assets_v3/town/a1/uhrturm.json');
      if (!sc.textures.exists('a1_uhrturm_hands')) sc.load.spritesheet('a1_uhrturm_hands', 'assets_v3/town/a1/uhrturm_hands.png', { frameWidth: 69, frameHeight: 69 });   // кадр = uhrturm.json hands.frame
      sc.load.once('complete', signs); sc.load.start();
    }
    const K = window.KELLER_HATCH;                                  // временный вход в подземелье (rpg-design шаг 1): люк «der Keller» у дома героя
    const hatch = () => {
      const tex = sc.textures.get('dun_anim'); if (!tex.has('hatch')) tex.add('hatch', 0, 160, 159, 17, 17);   // craftpix 436971: деревянный люк с кольцом
      const img = sc.add.image(Math.round((K.x - 25) / 3) * 3, Math.round((K.y - 25) / 3) * 3, 'dun_anim', 'hatch').setOrigin(0, 0).setScale(3).setDepth(1).setInteractive({ useHandCursor: true });   // на сетке пикселей арта ×3
      const sign = sc.add.text(K.x, K.y - 30, 'der Keller', { fontFamily: 'Roboto, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#fff7e0', stroke: '#3b2314', strokeThickness: 6 }).setOrigin(0.5, 1).setDepth(6000);
      sc.add.text(sign.x - sign.width / 2, sign.y - sign.height, 'der', { fontFamily: 'Roboto, sans-serif', fontSize: '20px', fontStyle: 'bold', color: COL.der, stroke: '#3b2314', strokeThickness: 6 }).setDepth(6001);
      img.on('pointerup', () => {
        if (sc.__dragged || sc.busy) return; if (window.speakDE) speakDE('der Keller');
        const go = () => { sc.busy = true; sc.cameras.main.fadeOut(250, 24, 20, 37); sc.cameras.main.once('camerafadeoutcomplete', () => sc.scene.start('Dungeon', {})); };
        if (window.walkToScene) window.walkToScene(sc, K.x, K.y + 50, go); else go();
      });
    };
    if (window.Dungeon && K) { if (sc.textures.exists('dun_anim')) hatch(); else { sc.load.image('dun_anim', 'assets_v3/dungeon/anim.png'); sc.load.once('complete', hatch); sc.load.start(); } }
    const WG = window.WELT_GATE;                                    // тропа в лес у дома героя (запад) -> континент Wiesenland (сцена Welt)
    if (window.Welt && WG && window.WELT_ON) {                     // выход открыт флагом WELT_ON (выше); выключить — false
      const g = sc.add.container(WG.x, WG.y).setDepth(5000);
      const arrow = sc.add.triangle(0, 0, 10, -16, 10, 16, -12, 0, 0xffd23f).setStrokeStyle(3, 0x3b2314);
      const st = { fontFamily: 'Roboto, sans-serif', fontStyle: 'bold', stroke: '#3b2314' };
      const t1 = sc.add.text(-4, -34, 'Hinaus in die Welt', { ...st, fontSize: '18px', color: '#ffe9b0', strokeThickness: 5 }).setOrigin(0, 1);
      const t2 = sc.add.text(-4, -18, 'в мир', { ...st, fontSize: '12px', color: '#f3e3c3', strokeThickness: 3 }).setOrigin(0, 1);
      g.add([arrow, t1, t2]); g.setSize(90, 80); g.setInteractive({ useHandCursor: true });
      sc.tweens.add({ targets: arrow, x: -6, duration: 500, yoyo: true, repeat: -1 });
      g.on('pointerup', () => {
        if (sc.__dragged || sc.busy) return; if (window.speakDE) speakDE('Hinaus in die Welt');
        const go = () => { sc.busy = true; sc.cameras.main.fadeOut(260, 29, 19, 11); sc.cameras.main.once('camerafadeoutcomplete', () => sc.scene.start('Welt', {})); };
        if (window.walkToScene) window.walkToScene(sc, WG.x + 6, WG.y + 10, go); else go();
      });
    }
    const sp = sc.registry.get('spawnAt');                         // назад из дома — у его двери
    if (sp) { sc.registry.set('spawnAt', null); sc.camFocus = [sp[0], sp[1] - 60]; sc.__spawn = sp; }
  }
  (function hook() {
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 50);
    const y = g.scene.getScene('Yard'); if (y) y.events.on('create', () => setupTown(y));
  })();
  window.townWalkable = (sc, x, y) => { const T = sc.townMask; if (!T) return null; const row = T.mask[Math.floor(y / T.cell)]; return !!row && row[Math.floor(x / T.cell)] === '1'; };
})();
