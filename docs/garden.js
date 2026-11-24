// Garten — огород героя (Yard, деревня Stillbach): 2 грядки «das Beet» рядом, на лугу через улицу напротив дома героя
// (B1 [234,852,306,900], B2 [354,852,426,900] — style_pick/life/_bed_spot2.py + _bed_pairs.py: маска walk=1, без спрайтов фона и над грядкой,
// не на дорожке, не на собаке Brezel, старте Max, цветах награды и люке; 24.11: прежние B1 [588,570] / [432,471] отменены — растения заслоняли
// друг друга, под грядкой папоротник фона, на [432,471] лежит собака Brezel).
// Овощи (решение автора): die Karotte, das Radieschen, die Paprika — стадии роста craftpix farm plants (assets_v3/life/<овощ>_0..3.png, x3).
// Тап по грядке: пустая — выбрать, что посадить; растёт — сколько осталось; созрела — урожай -> карточка Album.card (выбор артикля, без потерь).
// Рост по реальному времени: 3 стадии по STEP мс (по умолчанию 40 с; localStorage ds_proto.gardenStep — для проверок). Хранение: ds_proto.garden.
// API: Garden.BEDS, Garden.state(), Garden.stage(i), Garden.plant(i, crop), Garden.harvest(i), Garden.tap(i), Garden.CROPS.
(function () {
  const SIL = im => { im.setTint(0x1e2c14); if (window.Phaser && Phaser.TintModes && im.setTintMode) im.setTintMode(Phaser.TintModes.FILL); else if (im.setTintFill) im.setTintFill(0x1e2c14); return im.setAlpha(0.3); };   // тень-силуэт (Phaser 4: setTintMode FILL)
  const KEY = 'ds_proto.garden', BASE = 'assets_v3/', COL = { der: '#3a7be0', die: '#e24848', das: '#2f9a4f' };
  const BEDS = [[234, 852, 306, 900], [354, 852, 426, 900]];       // рядом по горизонтали: растения не заслоняют друг друга и не стоят на спрайтах фона
  const CROPS = ['karotte', 'radieschen', 'paprika'];
  const step = () => { const v = +localStorage.getItem('ds_proto.gardenStep'); return v > 0 ? v : 40000; };
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)) || {}; v.beds = v.beds || [null, null]; return v; } catch (e) { return { beds: [null, null] }; } };
  const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };
  const stage = i => { const b = load().beds[i]; if (!b) return -1; return Math.min(3, Math.floor((Date.now() - b.t0) / step())); };
  const meta = id => window.Album && Album.item(id);
  function plant(i, crop) { if (!CROPS.includes(crop)) return false; const v = load(); if (v.beds[i]) return false; v.beds[i] = { crop, t0: Date.now() }; save(v); refresh(); return true; }
  function harvest(i) { const v = load(), b = v.beds[i]; if (!b || stage(i) < 3) return null; v.beds[i] = null; save(v); refresh(); return b.crop; }
  let sc = null, view = [];
  function refresh() {
    if (!sc || !sc.sys || !sc.sys.isActive()) return;
    const v = load();
    BEDS.forEach((bd, i) => {
      const o = view[i]; if (!o) return; const b = v.beds[i], st = stage(i), key = b ? `life_${b.crop}_${st}` : 'life_karotte_0';
      if (o.key !== key && sc.textures.exists(key)) { o.img.setTexture(key); o.sh.setTexture(key); o.key = key; place(o); }
      const it = b && meta(b.crop), ripe = st >= 3;
      const de = !b ? ['das', 'Beet'] : [it ? it.art : '', it ? it.w : b.crop], ru = !b ? 'грядка' : ripe ? 'собери урожай!' : `растёт · ${st + 1}/4`;
      const sig = de.join(' ') + '|' + ru;
      if (o.sig !== sig) { o.sig = sig; o.ta.setText(de[0] + ' ').setColor(COL[de[0]] || '#fff7e0'); o.tw.setText(de[1]).setColor(ripe ? '#ffd23f' : '#fff7e0'); o.tr.setText(ru);
        const w = o.ta.width + o.tw.width, x0 = Math.round(o.cx - w / 2); o.ta.setX(x0); o.tw.setX(x0 + o.ta.width); o.tr.setX(o.cx); }
    });
  }
  function place(o) {                                                // левый край на сетке x3: каждый пиксель арта — целые 3x3 px экрана
    const x = o.cx - Math.floor(o.img.width / 2) * 3; o.img.setPosition(x, o.by); o.sh.setPosition(x + 6, o.by + 3);
  }
  function setup(s) {
    const T = s.townMask; if (!T || !T.mask) return; sc = s; view = [];
    const C = T.cell;                                                // грядка непроходима (Max обходит, а не топчет)
    BEDS.forEach(([x0, y0, x1, y1]) => { for (let cy = Math.floor(y0 / C); cy <= Math.floor((y1 - 1) / C); cy++) { let r = T.mask[cy]; for (let cx = Math.floor(x0 / C); cx <= Math.floor((x1 - 1) / C); cx++) r = r.slice(0, cx) + '0' + r.slice(cx + 1); T.mask[cy] = r; } });
    const keys = []; CROPS.forEach(c => [0, 1, 2, 3].forEach(k => keys.push(`life_${c}_${k}`)));
    const draw = () => {
      if (!s.sys || !s.sys.isActive() || s !== sc) return;
      const st = { fontFamily: 'Roboto, sans-serif', fontStyle: 'bold', stroke: '#3b2314' };
      BEDS.forEach(([x0, y0, x1, y1], i) => {
        const cx = Math.round((x0 + x1) / 2 / 3) * 3, by = y1 - 9;  // на сетке пикселей арта x3, ноги растения у нижнего края грядки
        const sh = SIL(s.add.image(cx + 6, by + 3, 'life_karotte_0').setOrigin(0, 1).setScale(3)).setDepth(by - 1);
        const img = s.add.image(cx, by, 'life_karotte_0').setOrigin(0, 1).setScale(3).setDepth(by);
        const lx = cx, ly = y1 + 14;                                // подпись под грядкой (над ней — растение)
        const ta = s.add.text(lx, ly, '', { ...st, fontSize: '15px', strokeThickness: 5 }).setOrigin(0, 1).setDepth(6000);
        const tw = s.add.text(lx, ly, '', { ...st, fontSize: '15px', strokeThickness: 5, color: '#fff7e0' }).setOrigin(0, 1).setDepth(6000);
        const tr = s.add.text(lx, ly + 13, '', { fontFamily: 'Roboto, sans-serif', fontSize: '11px', color: '#f3e3c3', stroke: '#3b2314', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(6000);
        const z = s.add.zone((x0 + x1) / 2, (y0 + y1) / 2 - 18, x1 - x0 + 10, y1 - y0 + 36).setInteractive({ useHandCursor: true });
        z.on('pointerup', () => { if (s.__dragged || s.busy) return; const go = () => tap(i); if (window.walkToScene) walkToScene(s, cx, y0 - 14, go); else go(); });   // Max подходит с улицы
        view[i] = { img, sh, ta, tw, tr, z, lx, cx, by, key: 'life_karotte_0' }; place(view[i]);
      });
      refresh(); s.time.addEvent({ delay: 500, loop: true, callback: refresh });
    };
    const miss = keys.filter(k => !s.textures.exists(k));
    if (!miss.length) draw(); else { miss.forEach(k => s.load.image(k, BASE + 'life/' + k.slice(5) + '.png')); s.load.once('complete', draw); s.load.start(); }
  }

  // ---------- окно «что посадить?» (вверху, как карточка находки)
  const css = document.createElement('style');
  css.textContent = `
    #gardenBox{position:absolute;left:12px;right:12px;top:58px;display:none;flex-direction:column;gap:6px;padding:8px 12px 10px;color:#2e1e12;z-index:71}
    #gardenBox .t{font-size:22px;font-weight:700;line-height:1.05}
    #gardenBox .ru{display:block;font-size:13px;font-weight:400;color:#6b4a2e;line-height:1.15}
    #gardenBox .row{display:flex;gap:8px;flex-wrap:wrap}
    #gardenBox .ui-btn{font-family:inherit;color:#2e1e12;height:auto;min-height:52px;padding:3px 10px;font-size:20px;line-height:1.05;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1 1 0;min-width:0}
    #gardenBox .ui-btn img{image-rendering:pixelated;display:block;margin:0 auto 2px}
    #gardenBox .ui-btn.x{flex:0 0 auto}`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'gardenBox'; box.className = 'ui ui-panel-paper';
  const HUD = ['bag', 'bFurn', 'bMap']; let was = {}, cur = null;
  function show(html) { box.innerHTML = html; box.style.display = 'flex'; if (window.Album && Album.dock) Album.dock(box, sc); HUD.forEach(k => { const e = document.getElementById(k); if (e && was[k] === undefined) { was[k] = e.style.display; e.style.display = 'none'; } }); if (sc) sc.busy = true; }
  function hide() { box.style.display = 'none'; HUD.forEach(k => { const e = document.getElementById(k); if (e && was[k] !== undefined) e.style.display = was[k]; }); was = {}; if (sc) sc.busy = false; cur = null; }
  function tap(i) {
    const b = load().beds[i], st = stage(i);
    if (!b) {
      cur = i; if (window.speakDE) speakDE('das Beet');
      show(`<div class="t"><b style="color:${COL.das}">das</b> Beet — was pflanzt du?<span class="ru">грядка — что посадим? созреет за ${step() * 3 >= 90000 ? Math.round(step() * 3 / 60000) + ' мин' : Math.round(step() * 3 / 1000) + ' с'}</span></div>
        <div class="row">${CROPS.map(c => { const it = meta(c), g = Album.meta().garden[c][3], k = 2;                                    // все три овоща одним целым масштабом x2
          return `<button class="ui ui-btn" data-c="${c}"><img src="${BASE + g.img}" alt="" style="width:${g.w * k}px;height:${g.h * k}px"><span><b style="color:${COL[it.art]}">${it.art}</b> ${it.w}</span><span class="ru">${it.ru}</span></button>`; }).join('')}
          <button class="ui ui-btn x" data-x="1">Zurück<span class="ru">назад</span></button></div>`);
      return 'menu';
    }
    const it = meta(b.crop);
    if (st < 3) { const left = Math.max(1, Math.ceil((b.t0 + 3 * step() - Date.now()) / 1000)); if (window.toast) toast(`${it.art} ${it.w} wächst … noch ${left} s`, 1600); if (window.speakDE) speakDE(`${it.art} ${it.w} wächst`); return 'grow'; }
    const crop = harvest(i); if (crop && window.Album) Album.card(crop, { title_de: 'Geerntet!', title_ru: 'урожай', scene: sc });
    return 'harvest';
  }
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; e.stopPropagation();
    if (b.dataset.x) return hide();
    if (b.dataset.c != null && cur != null) { const i = cur, c = b.dataset.c, it = meta(c); hide(); if (plant(i, c)) { if (window.toast) toast(`Gepflanzt: ${it.art} ${it.w}`, 1500); if (window.speakDE) speakDE(`Ich pflanze ${it.art === 'das' ? 'das' : it.art === 'der' ? 'den' : 'die'} ${it.w}.`); } }
  });
  ['pointerdown', 'pointerup', 'touchstart'].forEach(t => box.addEventListener(t, e => e.stopPropagation()));
  window.Garden = { BEDS, CROPS, state: load, stage, plant, harvest, tap, refresh, close: hide, view: () => view };
  (function hook() {
    const ui = document.getElementById('ui'), g = window.game;
    if (!ui || !g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 80);
    ui.appendChild(box);
    const y = g.scene.getScene('Yard'); if (y) y.events.on('create', () => { hide(); if (window.Album) Album.ready.then(() => setup(y)); else setup(y); });
  })();
})();
