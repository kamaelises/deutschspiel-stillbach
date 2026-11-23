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
    const PS = T.plot_sign;                                         // будущие места: пиксельная доска «Bauplatz» (доска craftpix, town/plot_sign.png), текст строго внутри рамки
    const signs = () => (T.plots || []).forEach(p => {
      if (!PS || !p.sign) return;
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
    if (sc.textures.exists('plot_sign')) signs();
    else { sc.load.image('plot_sign', 'assets_v3/town/plot_sign.png'); sc.load.once('complete', signs); sc.load.start(); }
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
    const sp = sc.registry.get('spawnAt');                         // назад из дома — у его двери
    if (sp) { sc.registry.set('spawnAt', null); sc.camFocus = [sp[0], sp[1] - 60]; sc.__spawn = sp; }
  }
  (function hook() {
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 50);
    const y = g.scene.getScene('Yard'); if (y) y.events.on('create', () => setupTown(y));
  })();
  window.townWalkable = (sc, x, y) => { const T = sc.townMask; if (!T) return null; const row = T.mask[Math.floor(y / T.cell)]; return !!row && row[Math.floor(x / T.cell)] === '1'; };
})();
