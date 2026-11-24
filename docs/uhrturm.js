// Арт (Uhrturm) 24.11 — der Uhrturm на 3-й ступени участка uhrturm (все уроки главы 5): вместо стройки — башня с часами.
// town.js не трогаем (там ступени и A1R): только хук events.on('create') сцены Yard, как time_fx.js. Ступень берём из window.plotStage.
// Арт — style_pick/uhrturm/build_uhrturm.py (craftpix Chapel Exterior x3): assets_v3/town/a1/uhrturm.png + uhrturm_hands.png + uhrturm.json.
// Стрелки — отдельный слой (2 спрайта), идут по времени игры window.WorldTime (time.js), иначе по часам устройства; тап по башне — «Es ist … Uhr».
// Стена (маска ходьбы) — только низ башни (foot) внутри участка; стройка и колышки 3-й ступени убираются, их стены возвращаются из T.__mask0.
// Вывеска der Uhrturm — над навершием; вывеска der Erinnerungskeller переезжает влево от люка (иначе легла бы на башню).
(function () {
  const B = 'assets_v3/town/a1/', CX = 1860, HF = 69;   // HF = кадр стрелок (23 px пака x3, uhrturm.json hands.frame)                     // центр башни по x (px деревни): справа от люка, левее церкви
  const now = () => { try { if (window.WorldTime && WorldTime.now) { const n = WorldTime.now(); if (n && n.hour != null) return [n.hour, n.minute]; } } catch (e) {} const d = new Date(); return [d.getHours(), d.getMinutes()]; };
  function build(sc, p, U) {
    const L = sc.children.list, T = sc.cache.json.get('town'), [x0, y0, x1, y1] = p.box, C = T.cell;
    const bau = L.find(o => o.type === 'Image' && o.texture && o.texture.key === 'a1_uhrturm_bau'); if (!bau) return false;
    const unwall = (x, y, w, h) => { const M0 = T.__mask0 || T.mask; for (let r = Math.floor(y / C); r <= Math.floor((y + h - 1) / C); r++) { const row = T.mask[r], r0 = M0[r]; if (!row || !r0) continue;
      const q0 = Math.max(0, Math.floor(x / C)), q1 = Math.min(row.length - 1, Math.floor((x + w - 1) / C)); if (q1 >= q0) T.mask[r] = row.slice(0, q0) + r0.slice(q0, q1 + 1) + row.slice(q1 + 1); } };
    const wall = (x, y, w, h) => { for (let r = Math.floor(y / C); r <= Math.floor((y + h - 1) / C); r++) { const row = T.mask[r]; if (!row) continue;
      const q0 = Math.max(0, Math.floor(x / C)), q1 = Math.min(row.length - 1, Math.floor((x + w - 1) / C)); if (q1 >= q0) T.mask[r] = row.slice(0, q0) + '0'.repeat(q1 - q0 + 1) + row.slice(q1 + 1); } };
    unwall(bau.x, bau.y, bau.width, bau.height); bau.destroy();
    L.filter(o => o.type === 'Image' && o.texture && o.texture.key === 'a1_stake' && o.x >= x0 - 1 && o.x <= x1 && o.y >= y0 - 1 && o.y <= y1).forEach(s => { unwall(s.x, s.y, 21, 45); s.destroy(); });
    const old = L.find(o => o.a1 && o.a1.key === 'uhrturm'); if (old) old.destroy();
    const tx = Math.round((CX - U.w / 2) / 3) * 3, ty = y1 - U.h, dep = y1;
    const img = sc.add.image(tx, ty, 'a1_uhrturm').setOrigin(0, 0).setDepth(dep); img.a1tower = 1;
    wall(tx + U.body[0], Math.max(y0, y1 - U.foot), U.body[1] - U.body[0], Math.min(U.foot, y1 - y0));
    const hx = tx + U.clock[0], hy = ty + U.clock[1];
    const hm = sc.add.sprite(hx, hy, 'a1_uhrturm_hands', 0).setDepth(dep + 0.2), hh = sc.add.sprite(hx, hy, 'a1_uhrturm_hands', U.hands.hour).setDepth(dep + 0.1);
    const set = () => { const [h, m] = now(); hm.setFrame(m % 60); hh.setFrame(U.hands.hour + (h % 12) * 4 + Math.floor(m / 15)); hm.uhr = [h, m]; };
    set(); let off = null; if (window.WorldTime && WorldTime.on) off = WorldTime.on('minute', set);
    const iv = setInterval(() => { if (!hm.scene) return clearInterval(iv); set(); }, 20000);   // запасной ход, если WorldTime молчит
    sc.events.once('shutdown', () => { clearInterval(iv); if (off) off(); });
    window.UHRTURM = { x: tx, y: ty, w: U.w, h: U.h, clock: [hx, hy], hands: () => [hm.frame.name, hh.frame.name], time: () => hm.uhr };
    // вывески
    const lab = de => L.filter(o => o.type === 'Text' && o.a1sign === de);
    const relayout = (tx3, x, yb, right) => { const [t2, ta, tw] = tx3, cx = right ? x - Math.max(t2.width, ta.width + tw.width) / 2 : x;
      t2.setPosition(cx, yb); const y = yb - t2.height + 4, xa = cx - (ta.width + tw.width) / 2; ta.setPosition(xa, y); tw.setPosition(xa + ta.width, y); };
    const u = lab('der Uhrturm'); if (u.length === 3) { u[0].setText(p.ru); relayout(u, tx + U.w / 2, ty - 4); }
    const k = lab('der Erinnerungskeller'); if (k.length === 3 && window.ERINNERUNG_HATCH) relayout(k, ERINNERUNG_HATCH.x - 30, k[0].y, true);
    const z = sc.add.zone(tx + U.w / 2, ty + U.h / 2, U.w, U.h).setInteractive({ useHandCursor: true }); z.a1 = { key: 'uhrturm', stage: 3, art: 'uhrturm' };
    z.on('pointerup', () => {
      if (sc.__dragged || sc.busy) return; const [h, m] = now(), t = h + ':' + String(m).padStart(2, '0');
      if (window.speakDE) speakDE('der Uhrturm. Es ist ' + h + ' Uhr' + (m ? ' ' + m : '') + '.');
      if (window.toast) toast('der Uhrturm — Es ist ' + t + ' Uhr.', 2200);
    });
    return true;
  }
  function setup(sc) {
    const T = sc.cache.json.get('town'); if (!T || !T.plots) return; const p = T.plots.find(q => q.key === 'uhrturm'); if (!p) return;
    let n = 0; const t0 = Date.now();
    const go = () => {
      if (!sc.sys.isActive() || Date.now() - t0 > 8000) return;
      const z = sc.children.list.find(o => o.a1 && o.a1.key === 'uhrturm');
      if (typeof window.plotStage !== 'function' || !z) return setTimeout(go, 100);
      if (z.a1.stage !== 3 || z.a1.art === 'uhrturm') return;
      const U = sc.cache.json.get('a1ut');
      if (U && sc.textures.exists('a1_uhrturm') && sc.textures.exists('a1_uhrturm_hands')) { if (!build(sc, p, U) && n++ < 20) setTimeout(go, 100); return; }
      if (n++ > 3) return;                                          // файлы не грузятся — остаётся стройка (без ошибок)
      if (!U) sc.load.json('a1ut', B + 'uhrturm.json');
      if (!sc.textures.exists('a1_uhrturm')) sc.load.image('a1_uhrturm', B + 'uhrturm.png');
      if (!sc.textures.exists('a1_uhrturm_hands')) sc.load.spritesheet('a1_uhrturm_hands', B + 'uhrturm_hands.png', { frameWidth: HF, frameHeight: HF });
      sc.load.once('complete', go); sc.load.start();
    };
    go();
  }
  (function hook() {
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 50);
    const y = g.scene.getScene('Yard'); if (y) y.events.on('create', () => setup(y));
  })();
})();
