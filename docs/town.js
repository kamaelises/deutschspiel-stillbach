// Деревня Stillbach — одна бесшовная карта (assets_v3/town): двор героя + улица + дома. Max идёт куда тапнули,
// тап по дому — идёт к двери и входит (Gildenhaus — сцена внутри мира; закрытые дома говорят, с какой главы).
// Над домами — вывески с артиклем в цвете (der синий, die красный, das зелёный). Город растёт по главам (заглушки — «bald»).
(function () {
  const HOUSES = {
    laden: { de: 'die Bäckerei', ru: 'пекарня', chapter: 4, ort: null },
    gildenhaus: { de: 'das Gildenhaus', ru: 'дом гильдии', chapter: 2, ort: 'buergeramt' },
    kirche: { de: 'die Kirche', ru: 'церковь', chapter: 5, ort: null },
  };
  const COL = { der: '#3a7be0', die: '#e24848', das: '#2f9a4f' };
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
    (T.plots || []).forEach(p => {                                  // будущие места: табличка «Bauplatz» — дом появится с его главой
      const [x0, y0, x1, y1] = p.box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, [art, ...w] = p.de.split(' ');
      const post = sc.add.rectangle(cx, cy + 34, 8, 60, 0x6b3f22).setStrokeStyle(2, 0x3b2314).setDepth(cy + 30);
      const board = sc.add.rectangle(cx, cy, 240, 80, 0xe8d0a0).setStrokeStyle(4, 0x6b3f22).setDepth(cy + 31);
      const t1 = sc.add.text(cx, cy - 22, 'Bauplatz', { fontFamily: 'Roboto, sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#6b3f22' }).setOrigin(0.5, 0.5).setDepth(cy + 32);
      const t2 = sc.add.text(cx, cy + 2, p.de, { fontFamily: 'Roboto, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#2e1e12' }).setOrigin(0.5, 0.5).setDepth(cy + 32);
      const t3 = sc.add.text(cx, cy + 24, 'ab Kapitel ' + p.chapter + ' · ' + p.ru, { fontFamily: 'Roboto, sans-serif', fontSize: '12px', color: '#6b5640' }).setOrigin(0.5, 0.5).setDepth(cy + 32);
      t2.setColor(COL[art] || '#2e1e12');
      board.setInteractive({ useHandCursor: true }).on('pointerup', () => { if (sc.__dragged) return; if (window.speakDE) speakDE(p.de); toast(p.de + ' — ab Kapitel ' + p.chapter, 1800); });
    });
    const sp = sc.registry.get('spawnAt');                         // назад из дома — у его двери
    if (sp) { sc.registry.set('spawnAt', null); sc.camFocus = [sp[0], sp[1] - 60]; sc.__spawn = sp; }
  }
  (function hook() {
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 50);
    const y = g.scene.getScene('Yard'); if (y) y.events.on('create', () => setupTown(y));
  })();
  window.townWalkable = (sc, x, y) => { const T = sc.townMask; if (!T) return null; const row = T.mask[Math.floor(y / T.cell)]; return !!row && row[Math.floor(x / T.cell)] === '1'; };
})();
