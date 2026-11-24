// der Gemüsegarten — огород героя (слово автора 24.11: «отдельный участок, где можно высаживать, растить, потом пробовать урожай»).
// Место: северная часть бывшего участка der Park напротив дома героя (town.json garden.box = build_town.py GARDEN [58,302,162,384] x3; Park сжат к югу).
// Всё рисуется спрайтами x3 из паков с лицензией (style_pick/life/build_life.py): забор 9-slice из пака дома героя (fence_top/mid/bottom, калитка справа внизу),
// die Saatgutkiste (craftpix farm plants Supplies), das Regenfass (craftpix fishing; лицензированной лейки на диске нет), 6 грядок 2x3, стадии craftpix farm plants.
// Цикл: säen / pflanzen -> gießen (каждая стадия ждёт полива) -> 4 стадии по реальному времени -> ernten -> Rucksack -> probieren (+HP, первый раз — альбом).
// Сезоны (assets_v3/life/crops.json, BZfE): сеять можно только в свои месяцы; зимой на улице ничего не растёт (грядки отдыхают, рост на паузе).
// Время: window.WorldTime.now() (season, date) если есть, иначе дата устройства; отладка — localStorage ds_proto.debugDate (ISO).
// Тест-хук: localStorage ds_proto.gardenSpeed (множитель скорости роста). Хранение: ds_proto.garden2. Событие урожая: window 'ds:harvest' {crop, n}.
// Die Fensterbank (24.11): zimmer Max (Room) — доска под правым окном (craftpix 692491) и 2 глиняные Schalen (пак дома героя): die Kresse и das Radieschen
// круглый год (crops.json indoor: Ökotest/Sternsinger — Kresse ~1 неделя, BMLUK — Radieschen ~1 месяц). Вне сезона на улице меню огорода зовёт на подоконник.
// API: Garden.box(), Garden.beds(), Garden.state(), Garden.sow(i, crop), Garden.water(i), Garden.harvest(i), Garden.tap(i), Garden.probieren(crop),
//      Garden.canSow(crop) -> {ok, why_de, why_ru}, Garden.season(), Garden.bag(), Garden.tick(), Garden.bagHTML() (Rucksack), Garden.CROPS.
(function () {
  const SIL = im => { im.setTint(0x1e2c14); if (window.Phaser && Phaser.TintModes && im.setTintMode) im.setTintMode(Phaser.TintModes.FILL); else if (im.setTintFill) im.setTintFill(0x1e2c14); return im.setAlpha(0.3); };   // тень-силуэт (Phaser 4)
  const KEY = 'ds_proto.garden2', BASE = 'assets_v3/', COL = { der: '#3a7be0', die: '#e24848', das: '#2f9a4f' };
  const CROPS = ['radieschen', 'karotte', 'paprika', 'kuerbis', 'blumenkohl'], INDOOR = ['kresse', 'radieschen'], BAGC = ['kresse', 'radieschen', 'karotte', 'paprika', 'kuerbis', 'blumenkohl'];
  const FB = { sill: [417, 123], pots: [450, 510], base: 144, stand: 296 };   // Room (room_bg 960x540): доска под правым окном (x 462..500), две Schalen, Max стоит ниже на полу
  const COLS = [18, 38, 58], ROWS = [40, 62];                        // грядки внутри забора (px пака x1 от угла участка): 3 колонки x 2 ряда, справа — дорожка к ящику
  const MON = ['', 'Jan', 'Feb', 'März', 'Apr', 'Mai', 'Juni', 'Juli', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  let CJ = null; const cropsReady = fetch(BASE + 'life/crops.json').then(r => r.json()).then(j => (CJ = j)).catch(e => console.warn('Garden crops', e));
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)) || {}; v.beds = v.beds && v.beds.length === 6 ? v.beds : [null, null, null, null, null, null]; v.bag = v.bag || {}; v.tasted = v.tasted || {}; v.pots = v.pots && v.pots.length === 2 ? v.pots : [null, null]; return v; } catch (e) { return { beds: [null, null, null, null, null, null], pots: [null, null], bag: {}, tasted: {} }; } };
  const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };
  const meta = id => window.Album && Album.item(id);
  const C = id => CJ && (CJ.crops[id] || CJ.indoor[id]), CI = id => CJ && CJ.indoor[id];
  const speed = () => { const v = +localStorage.getItem('ds_proto.gardenSpeed'); return v > 0 ? v : 1; };
  const stepMs = (id, inside) => { const c = inside ? CI(id) : C(id); return c ? c.days * CJ.game.secPerDay * 1000 / 3 / speed() : 60000; };   // 3 перехода: gesät -> Keim -> Pflanze -> reif
  function now() {                                                    // дата мира: WorldTime («Код (время)»), иначе debugDate, иначе устройство
    try { if (window.WorldTime && WorldTime.now) { const w = WorldTime.now(); if (w && w.date) return new Date(w.date); } } catch (e) {}
    const d = localStorage.getItem('ds_proto.debugDate'); return d && !isNaN(Date.parse(d)) ? new Date(d) : new Date();
  }
  function season() {
    try { if (window.WorldTime && WorldTime.now) { const s = String(WorldTime.now().season || '').toLowerCase();
      if (/fr|spring/.test(s)) return 'fruehling'; if (/so|summer/.test(s)) return 'sommer'; if (/he|autumn|fall/.test(s)) return 'herbst'; if (/wi/.test(s)) return 'winter'; } } catch (e) {}
    const m = now().getMonth() + 1; return m >= 3 && m <= 5 ? 'fruehling' : m >= 6 && m <= 8 ? 'sommer' : m >= 9 && m <= 11 ? 'herbst' : 'winter';
  }
  function reach() {                                                  // открытые главы (как town.js)
    let ch = []; try { ch = JSON.parse(localStorage.getItem('ds_proto.app')).chapters || []; } catch (e) {}
    const started = ch.filter(c => c.done > 0).map(c => c.n);
    return Math.max(typeof state !== 'undefined' && state.done ? 2 : 1, started.length ? Math.max(...started) + 1 : 1);
  }
  function canSow(id) {
    const c = C(id), it = meta(id); if (!c || !it) return { ok: false, why_de: '…', why_ru: '' };
    if (c.chapter > reach()) return { ok: false, lock: true, why_de: 'ab Kapitel ' + c.chapter, why_ru: 'откроется с главы ' + c.chapter };
    const m = now().getMonth() + 1, win = `${MON[c.sow[0]]}–${MON[c.sow[c.sow.length - 1]]}`;
    if (c.sow.includes(m)) return { ok: true, why_de: c.verb, why_ru: c.verb === 'säen' ? 'посеять' : 'посадить' };
    if (season() === 'winter' || m < c.sow[0] || m >= 9) return { ok: false, cold: true, why_de: 'Jetzt ist es zu kalt', why_ru: 'сейчас слишком холодно · ' + win };
    return { ok: false, late: true, why_de: 'Jetzt ist es zu spät', why_ru: 'уже поздно · сеют ' + win };
  }
  function tick() {                                                   // рост: только политая грядка, не зимой; после стадии снова нужен полив
    const v = load(), t = Date.now(), wint = season() === 'winter'; let ch = false;
    v.beds.forEach(b => { if (!b || b.stage >= 3 || !b.wet) return;
      if (wint) { b.t = t; ch = true; return; }
      if (t - b.t >= stepMs(b.crop)) { b.stage++; b.wet = false; b.t = t; ch = true; } });
    v.pots.forEach(b => { if (!b || b.stage >= 3 || !b.wet) return; if (t - b.t >= stepMs(b.crop, true)) { b.stage++; b.wet = false; b.t = t; ch = true; } });   // drinnen: auch im Winter
    if (ch) save(v); return v;
  }
  function sow(i, id) { const s = canSow(id); if (!s.ok) return s; const v = load(); if (v.beds[i]) return { ok: false }; v.beds[i] = { crop: id, stage: 0, wet: false, t: Date.now() }; save(v); refresh(); return { ok: true }; }
  function water(i) { const v = load(), b = v.beds[i]; if (!b || b.stage >= 3 || b.wet) return false; b.wet = true; b.t = Date.now(); save(v); refresh(); return true; }
  function potSow(i, id) { if (!INDOOR.includes(id)) return { ok: false }; const v = load(); if (v.pots[i]) return { ok: false }; v.pots[i] = { crop: id, stage: 0, wet: false, t: Date.now() }; save(v); refreshRoom(); return { ok: true }; }
  function potWater(i) { const v = load(), b = v.pots[i]; if (!b || b.stage >= 3 || b.wet) return false; b.wet = true; b.t = Date.now(); save(v); refreshRoom(); return true; }
  function potHarvest(i) { const v = load(), b = v.pots[i]; if (!b || b.stage < 3) return null; v.pots[i] = null; v.bag[b.crop] = (v.bag[b.crop] || 0) + 1; save(v); refreshRoom();
    try { window.dispatchEvent(new CustomEvent('ds:harvest', { detail: { crop: b.crop, n: 1, where: 'fensterbank' } })); } catch (e) {} return b.crop; }
  function harvest(i) { const v = load(), b = v.beds[i]; if (!b || b.stage < 3) return null; v.beds[i] = null; v.bag[b.crop] = (v.bag[b.crop] || 0) + 1; save(v); refresh();
    try { window.dispatchEvent(new CustomEvent('ds:harvest', { detail: { crop: b.crop, n: 1 } })); } catch (e) {} return b.crop; }

  // ---------- сцена: забор, ящик, бочка, грядки, вывеска
  let sc = null, view = [], G = null;
  const P = (x, y) => [G.x0 + x * 3, G.y0 + y * 3];
  function refresh() {
    if (!sc || !sc.sys || !sc.sys.isActive() || !view.length) return;
    const v = tick(), wint = season() === 'winter';
    view.forEach((o, i) => {
      const b = v.beds[i], key = b ? `life_${b.crop}_${b.stage}` : 'life_karotte_0';
      if (o.key !== key && sc.textures.exists(key)) { o.img.setTexture(key); o.sh.setTexture(key); o.key = key; place(o); }
      const tag = !b ? '' : b.stage >= 3 ? 'ernten' : wint ? '' : !b.wet ? 'gießen' : '';
      if (o.tagTxt !== tag) { o.tagTxt = tag; o.tag.setText(tag).setColor(tag === 'ernten' ? '#ffd23f' : '#bfe6ff').setVisible(!!tag); }
      o.tag.setPosition(o.cx, o.by - o.img.height * 3 - 4);
    });
    const s = CJ && CJ.seasons[season()]; if (s && G.seasonTxt && G.seasonTxt.text !== s.de + ' · ' + s.ru) G.seasonTxt.setText(s.de + ' · ' + s.ru + (wint ? ' — die Beete ruhen' : ''));
  }
  function place(o) { const x = o.cx - Math.floor(o.img.width / 2) * 3; o.img.setPosition(x, o.by); o.sh.setPosition(x + 6, o.by + 3); }
  function setup(s) {
    const T = s.townMask; if (!T || !T.mask || !T.garden || !CJ || !window.Album || !Album.meta()) return;
    sc = s; view = []; const [x0, y0, x1, y1] = T.garden.box, gp = Album.meta().gardenProps; G = { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
    const Cc = T.cell, block = (ax, ay, bx, by) => { for (let cy = Math.floor(ay / Cc); cy <= Math.floor((by - 1) / Cc); cy++) { let r = T.mask[cy]; if (!r) continue; for (let cx = Math.floor(ax / Cc); cx <= Math.floor((bx - 1) / Cc); cx++) r = r.slice(0, cx) + '0' + r.slice(cx + 1); T.mask[cy] = r; } };
    const fb = gp.fence_bottom.h * 3, gate = [x0 + 70 * 3, x0 + 88 * 3];
    block(x0, y0, x1, y0 + 42); block(x0, y0, x0 + 18, y1); block(x1 - 18, y0, x1, y1);   // забор: верх, бока
    block(x0, y1 - fb + 6, gate[0], y1); block(gate[1], y1 - fb + 6, x1, y1);              // низ — кроме калитки
    G.crate = { x: x0 + 78 * 3, y: y0 + 44 * 3 }; G.fass = { x: x0 + 84 * 3, y: y0 + 62 * 3 };
    block(G.crate.x, G.crate.y - 30, G.crate.x + gp.saatgutkiste.w * 3, G.crate.y); block(G.fass.x, G.fass.y - 24, G.fass.x + gp.regenfass.w * 3, G.fass.y);
    G.gate = [(gate[0] + gate[1]) / 2, y1];
    const keys = ['fence_top', 'fence_mid', 'fence_bottom', 'saatgutkiste', 'regenfass'].map(k => ['life_' + k, gp[k].img]);
    CROPS.forEach(c => [0, 1, 2, 3].forEach(k => keys.push([`life_${c}_${k}`, `life/${c}_${k}.png`])));
    const draw = () => {
      if (!s.sys || !s.sys.isActive() || s !== sc) return;
      const ft = s.add.image(x0, y0, 'life_fence_top').setOrigin(0, 0).setScale(3).setDepth(y0 + 42);
      const fm = s.add.image(x0, y0 + 48, 'life_fence_mid').setOrigin(0, 0).setScale(3).setDepth(y0 + 48);
      const fbm = s.add.image(x0, y1 - fb, 'life_fence_bottom').setOrigin(0, 0).setScale(3).setDepth(y1);
      G.fence = [ft, fm, fbm];
      const prop = (k, p, de, ru, fn) => { const im = s.add.image(p.x, p.y, 'life_' + k).setOrigin(0, 1).setScale(3).setDepth(p.y);
        SIL(s.add.image(p.x + 6, p.y + 3, 'life_' + k).setOrigin(0, 1).setScale(3)).setDepth(p.y - 1);
        const z = s.add.zone(p.x + im.displayWidth / 2, p.y - im.displayHeight / 2, Math.max(60, im.displayWidth + 12), Math.max(60, im.displayHeight + 12)).setInteractive({ useHandCursor: true });
        z.on('pointerup', () => { if (s.__dragged || s.busy) return; const go = () => fn(); if (window.walkToScene) walkToScene(s, x0 + 77 * 3, p.y + 6, go); else go(); });
        return { im, z }; };
      G.crateO = prop('saatgutkiste', G.crate, 'die Saatgutkiste', 'ящик с семенами', () => crateTap());
      G.fassO = prop('regenfass', G.fass, 'das Regenfass', 'бочка с дождевой водой', () => fassTap());
      const st = { fontFamily: 'Roboto, sans-serif', fontStyle: 'bold', stroke: '#3b2314' };
      const t1 = s.add.text(x0 + G.w / 2, y0 - 22, 'der Gemüsegarten', { ...st, fontSize: '21px', color: '#fff7e0', strokeThickness: 6 }).setOrigin(0.5, 1).setDepth(6000);
      s.add.text(t1.x - t1.width / 2, t1.y - t1.height, 'der', { ...st, fontSize: '21px', color: COL.der, strokeThickness: 6 }).setDepth(6001);
      G.sign = t1; G.seasonTxt = s.add.text(x0 + G.w / 2, y0 - 6, '', { fontFamily: 'Roboto, sans-serif', fontSize: '12px', color: '#f3e3c3', stroke: '#3b2314', strokeThickness: 4 }).setOrigin(0.5, 1).setDepth(6000);
      G.ruTxt = s.add.text(x0 + G.w / 2 + t1.width / 2 + 6, y0 - 26, 'огород', { fontFamily: 'Roboto, sans-serif', fontSize: '12px', color: '#f3e3c3', stroke: '#3b2314', strokeThickness: 4 }).setOrigin(0, 1).setDepth(6000);
      ROWS.forEach((ry, r) => COLS.forEach((cxp, c) => {
        const i = r * 3 + c, [cx, by] = P(cxp, ry);
        const sh = SIL(s.add.image(cx, by, 'life_karotte_0').setOrigin(0, 1).setScale(3)).setDepth(by - 1);
        const img = s.add.image(cx, by, 'life_karotte_0').setOrigin(0, 1).setScale(3).setDepth(by);
        const tag = s.add.text(cx, by - 30, '', { ...st, fontSize: '13px', strokeThickness: 4 }).setOrigin(0.5, 1).setDepth(6000).setVisible(false);
        const z = s.add.zone(cx, by - 30, 60, 66).setInteractive({ useHandCursor: true });
        z.on('pointerup', () => { if (s.__dragged || s.busy) return; const go = () => tap(i); if (window.walkToScene) walkToScene(s, cx, by + 8, go); else go(); });
        view[i] = { img, sh, tag, z, cx, by, key: 'life_karotte_0' }; place(view[i]);
      }));
      refresh(); s.time.addEvent({ delay: 500, loop: true, callback: refresh });
    };
    const miss = keys.filter(([k]) => !s.textures.exists(k));
    if (!miss.length) draw(); else { miss.forEach(([k, f]) => s.load.image(k, BASE + f)); s.load.once('complete', draw); s.load.start(); }
  }


  // ---------- die Fensterbank (Room)
  let rs = null, pview = [];
  function refreshRoom() {
    if (!rs || !rs.sys || !rs.sys.isActive() || !pview.length) return;
    const v = tick();
    pview.forEach((o, i) => { const b = v.pots[i], key = b ? `life_pot_${b.crop}_${b.stage}` : 'life_pot_kresse_0';
      if (o.key !== key && rs.textures.exists(key)) { o.img.setTexture(key); o.key = key; o.img.setPosition(o.cx - Math.floor(o.img.width / 2) * 3, FB.base); }
      const tag = !b ? 'säen' : b.stage >= 3 ? 'ernten' : !b.wet ? 'gießen' : '';
      if (o.tagTxt !== tag) { o.tagTxt = tag; o.tag.setText(tag).setColor(tag === 'ernten' ? '#ffd23f' : tag === 'säen' ? '#d9f7b0' : '#bfe6ff').setVisible(!!tag); }
      o.tag.setPosition(o.cx, FB.base - o.img.height * 3 - 2); });
  }
  function setupRoom(s) {
    if (!CJ || !window.Album || !Album.meta()) return; rs = s; pview = [];
    const keys = [['life_fensterbank', 'life/fensterbank.png']]; INDOOR.forEach(c => [0, 1, 2, 3].forEach(k => keys.push([`life_pot_${c}_${k}`, `life/pot_${c}_${k}.png`])));
    const draw = () => {
      if (!s.sys || !s.sys.isActive() || s !== rs) return;
      const sill = s.add.image(FB.sill[0], FB.sill[1], 'life_fensterbank').setOrigin(0, 0).setScale(3).setDepth(FB.sill[1] + 48); G2.sill = sill;
      const st = { fontFamily: 'Roboto, sans-serif', fontStyle: 'bold', stroke: '#3b2314' };
      // подпись под доской по центру (Max встаёт ниже, FB.stand; на телефоне край комнаты обрезан — не слева)
      // -16 px: справа над Herr Schmidt стоит «!» (x 529..544)
      const lb = s.add.text(FB.sill[0] + sill.displayWidth / 2 - 16, FB.sill[1] + sill.displayHeight + 14, 'die Fensterbank', { ...st, fontSize: '16px', color: '#fff7e0', strokeThickness: 5 }).setOrigin(0.5, 1).setDepth(5000);
      s.add.text(lb.x - lb.width / 2, lb.y - lb.height, 'die', { ...st, fontSize: '16px', color: COL.die, strokeThickness: 5 }).setDepth(5001);
      G2.ru = s.add.text(lb.x, lb.y + 15, 'подоконник', { fontFamily: 'Roboto, sans-serif', fontSize: '11px', color: '#f3e3c3', stroke: '#3b2314', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(5000); G2.label = lb;
      FB.pots.forEach((cx, i) => {
        const img = s.add.image(cx, FB.base, 'life_pot_kresse_0').setOrigin(0, 1).setScale(3).setDepth(FB.sill[1] + 49);
        const tag = s.add.text(cx, FB.base - 40, '', { ...st, fontSize: '13px', strokeThickness: 4 }).setOrigin(0.5, 1).setDepth(5002).setVisible(false);
        const z = s.add.zone(cx, FB.base - 24, 60, 64).setInteractive({ useHandCursor: true });
        z.on('pointerup', () => { if (s.__dragged || s.busy || s.talking) return; const go = () => tapPot(i); if (window.walkToScene) walkToScene(s, cx, FB.stand, go); else go(); });
        pview[i] = { img, tag, z, cx, key: '' };
      });
      if (window.__dsFensterbank) { window.__dsFensterbank = false; const a = s.add.triangle(FB.sill[0] + sill.displayWidth / 2, 40, -16, -10, 16, -10, 0, 12, 0xffd23f).setStrokeStyle(3, 0x3b2314).setDepth(5003);
        s.tweens.add({ targets: a, y: a.y + 8, duration: 450, yoyo: true, repeat: 6, onComplete: () => a.destroy() }); if (window.toast) toast('die Fensterbank — hier wächst es auch im Winter', 2200); G2.arrow = a; }
      refreshRoom(); s.time.addEvent({ delay: 500, loop: true, callback: refreshRoom });
    };
    const miss = keys.filter(([k]) => !s.textures.exists(k));
    if (!miss.length) draw(); else { miss.forEach(([k, f]) => s.load.image(k, BASE + f)); s.load.once('complete', draw); s.load.start(); }
  }
  const G2 = {};
  function tapPot(i) {
    const v = tick(), b = v.pots[i];
    if (!b) { cur = { pot: i }; say('die Fensterbank');
      show(`<div class="t"><b style="color:${COL.die}">die</b> Fensterbank — was säst du?<span class="ru">подоконник — что посеем? дома растёт круглый год</span></div>
        <div class="row">${INDOOR.map(c => `<button class="ui ui-btn" data-pc="${c}">${icon(c, 2)}<span class="n">${name(c)}</span><span class="v">säen · ${CI(c).days} Tage</span><span class="ru">посеять · ${c === 'kresse' ? 'около недели' : 'около месяца'}</span></button>`).join('')}
        <button class="ui ui-btn x" data-x="1">Zurück<span class="ru">назад</span></button></div>`);
      return 'menu'; }
    const it = meta(b.crop);
    if (b.stage >= 3) { const c = potHarvest(i); say(`Ich ernte ${it.art === 'der' ? 'den' : it.art} ${it.w}.`); harvestCard(c); return 'harvest'; }
    if (!b.wet) { cur = { pot: i };
      show(`<div class="card">${icon(b.crop, 2)}<div><div class="t">${name(b.crop)} · ${b.stage + 1}/4<span class="ru">${it.ru} · стадия ${b.stage + 1} из 4 — нужна вода</span></div>
        <div class="row" style="margin-top:6px"><button class="ui ui-btn" data-pw="1">gießen<span class="ru">полить</span></button><button class="ui ui-btn x" data-x="1">Zurück<span class="ru">назад</span></button></div></div></div>`);
      return 'thirsty'; }
    const left = Math.max(1, Math.ceil((b.t + stepMs(b.crop, true) - Date.now()) / 1000)); if (window.toast) toast(`${it.art} ${it.w} wächst … noch ${left} s`, 1600); return 'grow';
  }
  function goFensterbank() {                                         // из огорода — домой к подоконнику (дверь дома, сцена Room), стрелка над доской
    window.__dsFensterbank = true; const g = window.game, y = g && g.scene.getScene('Yard');
    if (y && y.sys.isActive() && y.enter) { y.busy = false; y.enter(); } else if (g) g.scene.getScenes(true)[0].scene.start('Room');
  }

  // ---------- окна (там, где нет Max — Album.dock)
  const css = document.createElement('style');
  css.textContent = `
    #gardenBox{position:absolute;left:12px;right:12px;top:58px;display:none;flex-direction:column;gap:6px;padding:8px 12px 10px;color:#2e1e12;z-index:73}
    #gardenBox .t{font-size:21px;font-weight:700;line-height:1.1}
    #gardenBox .ru{display:block;font-size:12px;font-weight:400;color:#6b4a2e;line-height:1.15}
    #gardenBox .row{display:flex;gap:6px;flex-wrap:wrap}
    #gardenBox .ui-btn{font-family:inherit;color:#2e1e12;height:auto;min-height:52px;padding:3px 6px;font-size:17px;line-height:1.05;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1 1 30%;min-width:0}
    #gardenBox .ui-btn img{image-rendering:pixelated;display:block;margin:0 auto 2px}
    #gardenBox .ui-btn .n{white-space:nowrap;font-size:15px}
    #gardenBox .ui-btn .v{font-size:13px;font-weight:800;color:#2f7a2a}
    #gardenBox .ui-btn[disabled] .v{color:#9b2c1c}
    #gardenBox .ui-btn[disabled]{opacity:.62;filter:grayscale(.5)}
    #gardenBox .ui-btn.x{flex:0 0 auto}
    #gardenBox .card{display:flex;gap:12px;align-items:center}
    #gardenBox .card img{image-rendering:pixelated}
    #gardenBox .hp{font-size:18px;font-weight:800;color:#2f7a2a}`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'gardenBox'; box.className = 'ui ui-panel-paper';
  const HUD = ['bag', 'bFurn', 'bMap']; let was = {}, cur = null, busyOwner = null;
  function show(html) { box.innerHTML = html; box.style.display = 'flex'; if (window.Album && Album.dock) Album.dock(box, sc && sc.sys && sc.sys.isActive() ? sc : null);
    HUD.forEach(k => { const e = document.getElementById(k); if (e && was[k] === undefined) { was[k] = e.style.display; e.style.display = 'none'; } });
    const s = game && game.scene.getScenes(true)[0]; if (s) { s.busy = true; busyOwner = s; } }
  function hide() { box.style.display = 'none'; HUD.forEach(k => { const e = document.getElementById(k); if (e && was[k] !== undefined) e.style.display = was[k]; }); was = {}; if (busyOwner) busyOwner.busy = false; busyOwner = null; cur = null; }
  const name = id => { const it = meta(id); return it ? `<b style="color:${COL[it.art]}">${it.art}</b> ${it.w}` : id; };
  const icon = (id, k) => { const g = (Album.meta().garden[id] || Album.meta().pots[id])[3]; return `<img src="${BASE + g.img}" alt="" style="width:${g.w * k}px;height:${g.h * k}px">`; };
  const say = t => { if (window.speakDE) speakDE(t); };
  function tap(i) {
    const v = tick(), b = v.beds[i], wint = season() === 'winter';
    if (!b) {
      cur = { i }; say('das Beet'); const s = CJ.seasons[season()];
      show(`<div class="t"><b style="color:${COL.das}">das</b> Beet — was pflanzt du?<span class="ru">грядка — что посадим? · сейчас ${s.de} (${s.ru})${wint ? ' — зимой на улице ничего не растёт' : ''}</span></div>
        ${CROPS.some(c => { const k = canSow(c); return !k.ok && !k.lock; }) ? `<div class="row fb"><div class="t" style="font-size:16px;flex:1 1 60%">${season() === 'sommer' ? 'Manches ist draußen zu spät' : 'Draußen ist es zu kalt'} — auf der Fensterbank geht es!<span class="ru">на улице не время, а дома на подоконнике растут кресс-салат и редиска — круглый год</span></div><button class="ui ui-btn x" data-fb="1">Zur Fensterbank →<span class="ru">к подоконнику</span></button></div>` : ''}
        <div class="row">${CROPS.map(c => { const k = canSow(c); return `<button class="ui ui-btn" data-c="${c}" ${k.ok ? '' : 'disabled'}>${icon(c, 2)}<span class="n">${name(c)}</span><span class="v">${k.why_de}</span><span class="ru">${k.why_ru}</span></button>`; }).join('')}
        <button class="ui ui-btn x" data-x="1">Zurück<span class="ru">назад</span></button></div>`);
      return 'menu';
    }
    const it = meta(b.crop);
    if (b.stage >= 3) { const c = harvest(i); say(`Ich ernte ${it.art === 'der' ? 'den' : it.art} ${it.w}.`); harvestCard(c); return 'harvest'; }
    if (wint) { if (window.toast) toast('Winter: das Beet ruht', 1800); return 'winter'; }
    if (!b.wet) { cur = { i };
      show(`<div class="card">${icon(b.crop, 2)}<div><div class="t">${name(b.crop)} · ${b.stage + 1}/4<span class="ru">${it.ru} · стадия ${b.stage + 1} из 4 — нужна вода</span></div>
        <div class="row" style="margin-top:6px"><button class="ui ui-btn" data-w="1">gießen<span class="ru">полить</span></button><button class="ui ui-btn x" data-x="1">Zurück<span class="ru">назад</span></button></div></div></div>`);
      return 'thirsty'; }
    const left = Math.max(1, Math.ceil((b.t + stepMs(b.crop) - Date.now()) / 1000)); if (window.toast) toast(`${it.art} ${it.w} wächst … noch ${left} s`, 1600); say(`${it.art} ${it.w} wächst`); return 'grow';
  }
  function harvestCard(c) {
    const v = load(); cur = { crop: c };
    show(`<div class="card">${icon(c, 3)}<div><div class="t">Geerntet! ${name(c)} +1<span class="ru">урожай — в рюкзаке: ×${v.bag[c] || 0}</span></div>
      <div class="row" style="margin-top:6px"><button class="ui ui-btn" data-p="${c}">probieren<span class="ru">попробовать</span></button><button class="ui ui-btn x" data-x="1">Weiter</button></div></div></div>`);
  }
  function probieren(c) {
    const v = load(); if (!(v.bag[c] > 0)) { if (window.toast) toast('Nichts zum Probieren', 1500); return null; }
    const it = meta(c), cr = C(c); v.bag[c]--; const first = !v.tasted[c]; v.tasted[c] = true; save(v);
    let add = 0; if (window.Combat && Combat.heroHp) { const h = Combat.heroHp(), m = Combat.hpMax(); add = Math.min(m - h, Math.max(1, Math.round(m * 0.1))); Combat.heroHp(h + add); }
    if (first && window.Album) Album.add(c, true);
    const Art = it.art[0].toUpperCase() + it.art.slice(1), line = `${Art} ${it.w} ist ${cr.adj[0]} und ${cr.adj[1]}.`; say(line);
    cur = { crop: c };
    show(`<div class="card">${icon(c, 3)}<div><div class="t">Max probiert ${it.art === 'der' ? 'den' : it.art} ${it.w}.<span class="ru">Макс пробует: ${it.ru}</span></div>
      <div class="t" style="font-size:19px"><b style="color:${COL[it.art]}">${Art}</b> ${it.w} ist ${cr.adj[0]} und ${cr.adj[1]}.<span class="ru">${it.ru} — ${cr.adj_ru}</span></div>
      <div class="hp">${add ? `+${add} HP<span class="ru">здоровье</span>` : 'Max ist gesund und satt<span class="ru">здоровье и так полное</span>'}</div>${first ? '<div class="hp">Neu im Album!<span class="ru">новое в альбоме · раздел Pflanzen</span></div>' : ''}
      <div class="row" style="margin-top:4px"><button class="ui ui-btn x" data-x="1">Weiter</button></div></div></div>`);
    return { add, first };
  }
  function crateTap() { say('die Saatgutkiste'); const v = load(), i = v.beds.findIndex(b => !b); if (i >= 0) return tap(i); if (window.toast) toast('die Saatgutkiste: alle Beete sind voll', 1800); }
  function fassTap() {                                                // из бочки поливаем все сухие грядки сразу
    say('das Regenfass'); if (season() === 'winter') { if (window.toast) toast('Winter: das Beet ruht', 1600); return 0; }
    const v = load(); let n = 0; v.beds.forEach((b, i) => { if (b && b.stage < 3 && !b.wet) { water(i); n++; } });
    if (window.toast) toast(n ? `Ich gieße ${n} Beete · полито: ${n}` : 'das Regenfass: alles ist nass', 1700); if (n) say('Ich gieße die Beete.'); return n;
  }
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; e.stopPropagation(); const c = cur;
    if (b.dataset.x) return hide();
    if (b.dataset.c && c && c.i != null) { const id = b.dataset.c, it = meta(id), r = sow(c.i, id); hide(); if (r.ok) { if (window.toast) toast(`${C(id).verb === 'säen' ? 'Gesät' : 'Gepflanzt'}: ${it.art} ${it.w} — jetzt gießen!`, 1800); say(`Ich ${C(id).verb === 'säen' ? 'säe' : 'pflanze'} ${it.art === 'der' ? 'den' : it.art} ${it.w}.`); } return; }
    if (b.dataset.w && c && c.i != null) { const b0 = load().beds[c.i]; water(c.i); hide(); if (b0) { const it = meta(b0.crop); say(`Ich gieße ${it.art === 'der' ? 'den' : it.art} ${it.w}.`); if (window.toast) toast('gegossen · полито', 1200); } return; }
    if (b.dataset.p) { hide(); probieren(b.dataset.p); return; }
    if (b.dataset.fb) { hide(); goFensterbank(); return; }
    if (b.dataset.pc && c && c.pot != null) { const id = b.dataset.pc, it = meta(id), r = potSow(c.pot, id); hide(); if (r.ok) { if (window.toast) toast(`Gesät: ${it.art} ${it.w} — jetzt gießen!`, 1800); say(`Ich säe ${it.art} ${it.w}.`); } return; }
    if (b.dataset.pw && c && c.pot != null) { const b0 = load().pots[c.pot]; potWater(c.pot); hide(); if (b0) { const it = meta(b0.crop); say(`Ich gieße ${it.art} ${it.w}.`); if (window.toast) toast('gegossen · полито', 1200); } return; }
  });
  ['pointerdown', 'pointerup', 'touchstart'].forEach(t => box.addEventListener(t, e => e.stopPropagation()));
  function bagHTML() {                                                // Rucksack -> Beutel: урожай + «probieren»
    if (!CJ || !window.Album || !Album.meta()) return '';
    const v = load(), rows = BAGC.filter(c => v.bag[c] > 0).map(c => `<div class="sk"><span style="flex:0 0 48px;text-align:center">${icon(c, 1)}</span><div class="info"><div class="nm">${name(c)}<span class="ru">${meta(c).ru} · урожай</span></div></div><div class="nm" style="min-width:44px;text-align:right">× ${v.bag[c]}</div><button class="ui ui-btn" data-probe="${c}">probieren<span class="ru">попробовать</span></button></div>`).join('');
    return `<div class="stat"><b>die Ernte</b><span class="ru">урожай с огорода — попробуй: +HP, первая проба открывает карточку в альбоме</span></div>${rows || '<span class="ru">пока пусто — посади что-нибудь в огороде (der Gemüsegarten)</span>'}`;
  }
  window.Garden = { CROPS, box: () => G && [G.x0, G.y0, G.x1, G.y1], gate: () => G && G.gate, beds: () => view, state: load, sow, water, harvest, tap, probieren, canSow, season, now, tick, refresh,
    bag: () => load().bag, bagHTML, close: hide, crateTap, fassTap, ready: cropsReady, stepMs, INDOOR, potSow, potWater, potHarvest, tapPot, goFensterbank, pots: () => pview, fensterbank: () => G2, refreshRoom, props: () => G && { crate: G.crate, fass: G.fass, sign: G.sign } };
  (function hook() {
    const ui = document.getElementById('ui'), g = window.game;
    if (!ui || !g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 80);
    ui.appendChild(box);
    const y = g.scene.getScene('Yard'); if (y) y.events.on('create', () => { hide(); view = []; Promise.all([cropsReady, window.Album ? Album.ready : null]).then(() => setup(y)); });
    const r = g.scene.getScene('Room'); if (r) r.events.on('create', () => { hide(); pview = []; Promise.all([cropsReady, window.Album ? Album.ready : null]).then(() => setupRoom(r)); });
  })();
})();
