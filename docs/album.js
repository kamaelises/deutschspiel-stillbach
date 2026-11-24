// Sammelalbum — альбом находок (слово автора 23.11): 8 разделов (Fische, Muscheln, Steine, Gemüse, Pilze, Blumen, Schmetterlinge — «bald», Bestiarium),
// редкость häufig / selten / sehr selten / legendär. Каталог и картинки — assets_v3/life/album.json (style_pick/life/build_life.py, только паки craftpix с лицензией).
// Находка (рыба, урожай, гриб, цветок, камень) — карточка: картинка, слово без артикля, выбор der/die/das. Верно — артикль в цвете рода и ✓ в альбоме;
// неверно — слово всё равно в альбоме (поражение без потерь), слово уходит в «Повтор» (Combat.addReview). Всё по-немецки, мелко по-русски.
// API: Album.ready (Promise), Album.meta(), Album.item(id), Album.pick(sec), Album.add(id, artOk), Album.has(id), Album.count(sec),
//      Album.card(id, {title_de, title_ru, onDone}), Album.onDefeat(type, word), Album.render(el) — вкладка «Album» в Rucksack (skills.js),
//      Album.spawnFinds(sc) — грибы, цветы, камни в Welt (сам цепляется к сцене Welt). Хранение: localStorage ds_proto.album.
(function () {
  const SIL = im => { im.setTint(0x1e2c14); if (window.Phaser && Phaser.TintModes && im.setTintMode) im.setTintMode(Phaser.TintModes.FILL); else if (im.setTintFill) im.setTintFill(0x1e2c14); return im.setAlpha(0.3); };   // тень-силуэт (Phaser 4: setTintMode FILL)
  const KEY = 'ds_proto.album', BASE = 'assets_v3/';
  const COL = { der: '#3a7be0', die: '#e24848', das: '#2f9a4f' };
  const RCOL = { h: '#7d6b52', s: '#b0701a', ss: '#8e4fc4', l: '#c98a00' }, RSTAR = { h: '●', s: '★', ss: '★★', l: '★★★' };
  let META = null;
  const ready = fetch(BASE + 'life/album.json').then(r => r.json()).then(m => (META = m)).catch(e => { console.warn('Album', e); return null; });
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)) || {}; v.items = v.items || {}; v.kills = v.kills || {}; v.words = v.words || {}; return v; } catch (e) { return { items: {}, kills: {}, words: {} }; } };
  const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };
  const item = id => META && META.items[id];
  const ids = sec => META ? Object.keys(META.items).filter(k => META.items[k].sec === sec) : [];
  const has = id => !!load().items[id];
  const count = sec => { const v = load(); const L = ids(sec); return { got: L.filter(k => v.items[k]).length, all: L.length }; };
  function pick(sec, rnd) {                                         // случайная находка раздела по весу редкости
    const L = ids(sec); if (!L.length) return null; const R = rnd || Math.random;
    const w = L.map(k => META.rarity[META.items[k].rar][2]), sum = w.reduce((a, b) => a + b, 0); let r = R() * sum;
    for (let i = 0; i < L.length; i++) { r -= w[i]; if (r < 0) return L[i]; } return L[L.length - 1];
  }
  function add(id, artOk) {
    const v = load(), o = v.items[id] || { n: 0, art: false, t: Date.now() }, isNew = !v.items[id];
    o.n++; o.art = o.art || !!artOk; v.items[id] = o; save(v); return { isNew, n: o.n };
  }
  function onDefeat(type, word) {                                   // combat.js kill(): бестиарий — сколько побеждено и какими словами
    const v = load(); v.kills[type] = (v.kills[type] || 0) + 1;
    if (word && word.w) { const t = (word.art ? word.art + ' ' : '') + word.w; const L = v.words[type] = (v.words[type] || []).filter(x => x !== t); L.push(t); if (L.length > 6) L.shift(); }
    const id = 'monster_' + type; const o = v.items[id] || { n: 0, art: true, t: Date.now() }; o.n++; v.items[id] = o; save(v);
  }
  const fit = (px, bw, bh, kmax) => { const k = Math.max(1, Math.min(kmax || 4, Math.floor(Math.min(bw / px[0], bh / px[1])))); return `width:${px[0] * k}px;height:${px[1] * k}px`; };   // только целый масштаб

  // ---------- карточка находки (вверху экрана, не закрывает Max; немецкий крупно, русский мелко)
  const css = document.createElement('style');
  css.textContent = `
    #lifeCard{position:absolute;left:12px;right:12px;top:58px;display:none;gap:12px;align-items:center;padding:8px 12px 10px;color:#2e1e12;z-index:72}
    #lifeCard .pic{flex:0 0 132px;height:110px;display:flex;align-items:center;justify-content:center}
    #lifeCard .pic img,#album img{image-rendering:pixelated;display:block}
    #lifeCard .body{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:4px}
    #lifeCard .t{font-size:22px;font-weight:700;line-height:1.05}
    #lifeCard .ru,#album .ru{display:block;font-size:13px;font-weight:400;color:#6b4a2e;line-height:1.15}
    #lifeCard .q{font-size:26px;font-weight:700;line-height:1.1}
    #lifeCard .q .gap{display:inline-block;min-width:54px;border-bottom:3px solid #6b4a2e;margin-right:6px;text-align:center}
    #lifeCard .rar{font-size:14px;font-weight:700}
    #lifeCard .row{display:flex;gap:8px;flex-wrap:wrap}
    #lifeCard .ui-btn{font-family:inherit;color:#2e1e12;height:auto;min-height:50px;padding:2px 14px;font-size:22px;line-height:1.05;display:flex;flex-direction:column;align-items:center;justify-content:center}
    #lifeCard .ui-btn.art{min-width:78px;font-size:24px;font-weight:800}
    #lifeCard .msg{font-size:17px;font-weight:700;line-height:1.15}
    #lifeCard .new{font-size:16px;font-weight:800;color:#2f7a2a}`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'lifeCard'; box.className = 'ui ui-panel-paper';
  const HUD = ['bag', 'bFurn', 'bMap', 'cbHero']; let cur = null, was = {};
  const scene = () => { const g = window.game; return g && g.scene ? g.scene.getScenes(true)[0] : null; };
  function dock(el, sc) {                                            // окно там, где нет Max: Max в верхней половине экрана — окно внизу, иначе вверху
    el.style.top = '58px'; el.style.bottom = 'auto'; sc = sc || scene(); const h = sc && (sc.walker || sc.hero); if (!h || !window.game || !game.canvas) return;
    const cam = sc.cameras.main, cv = game.canvas.getBoundingClientRect(), k = cv.width / game.scale.width, ui = document.getElementById('ui').getBoundingClientRect();
    const hb = h.getBounds(), mid = cv.top + ((hb.centerY - cam.worldView.y) * cam.zoom + cam.y) * k;
    if (mid < ui.top + ui.height / 2) { el.style.top = 'auto'; el.style.bottom = '12px'; }
  }
  function show(html) { box.innerHTML = html; box.style.display = 'flex'; dock(box, cur && cur.sc); HUD.forEach(k => { const e = document.getElementById(k); if (e && was[k] === undefined) { was[k] = e.style.display; e.style.display = 'none'; } }); }
  function hide() { box.style.display = 'none'; HUD.forEach(k => { const e = document.getElementById(k); if (e && was[k] !== undefined) e.style.display = was[k]; }); was = {}; }
  const rarLine = it => `<div class="rar" style="color:${RCOL[it.rar]}">${RSTAR[it.rar]} ${META.rarity[it.rar][0]}<span class="ru">${META.rarity[it.rar][1]}</span></div>`;
  function card(id, o) {
    o = o || {}; const it = item(id); if (!it) { if (o.onDone) o.onDone(); return false; }
    const sc = o.scene || scene(); if (sc) sc.busy = true; cur = { id, it, o, sc };
    if (window.speakDE) speakDE(it.w);
    show(`<div class="pic"><img src="${BASE + it.img}" alt="" style="${fit(it.px, 132, 110, 4)}"></div><div class="body">
      <div class="t">${o.title_de || 'Gefunden!'}<span class="ru">${o.title_ru || 'находка'} · какой артикль?</span></div>
      <div class="q"><span class="gap">?</span>${it.w}<span class="ru">${it.ru}</span></div>${rarLine(it)}
      <div class="row">${['der', 'die', 'das'].map(a => `<button class="ui ui-btn art" data-a="${a}" style="color:${COL[a]}">${a}</button>`).join('')}</div></div>`);
    return true;
  }
  function answer(a) {
    const { id, it, o } = cur, ok = a === it.art || a === it.alt, r = add(id, ok), w = it.art + ' ' + it.w;
    if (!ok && window.Combat && Combat.addReview) Combat.addReview({ art: it.art, w: it.w, ru: it.ru });
    if (window.speakDE) speakDE(w);
    const sameNote = ok && it.alt && it.note ? `<span class="ru">${it.note}</span>` : '';
    show(`<div class="pic"><img src="${BASE + it.img}" alt="" style="${fit(it.px, 132, 110, 4)}"></div><div class="body">
      <div class="q"><b style="color:${COL[it.art]}">${it.art}</b> ${it.w}<span class="ru">${it.ru}</span></div>
      <div class="msg">${ok ? 'Richtig! ✓<span class="ru">верно — в альбоме отмечено ✓</span>' : `Fast! Richtig ist: <b style="color:${COL[it.art]}">${it.art}</b> ${it.w}<span class="ru">почти — находка всё равно твоя, слово ушло в «Повтор»</span>`}${sameNote}</div>
      ${r.isNew ? '<div class="new">Neu im Album!<span class="ru">новое в альбоме</span></div>' : `<div class="rar">Im Album: ×${r.n}<span class="ru">уже в альбоме</span></div>`}
      <div class="row"><button class="ui ui-btn" data-x="1">Weiter</button></div></div>`);
  }
  function done() { const c = cur; cur = null; hide(); if (c && c.sc) c.sc.busy = false; if (c && c.o.onDone) c.o.onDone(c.id); }
  box.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || !cur) return; e.stopPropagation(); if (b.dataset.a) answer(b.dataset.a); else if (b.dataset.x) done(); });
  ['pointerdown', 'pointerup', 'touchstart'].forEach(t => box.addEventListener(t, e => e.stopPropagation()));

  // ---------- альбом (вкладка в Rucksack): разделы, счёт, карточки; не найдено — силуэт и «???»
  const css2 = document.createElement('style');
  css2.textContent = `
    #album .secs{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 6px}
    #album .secs .ui-btn{flex:1 1 23%;min-width:0;height:auto;min-height:50px;padding:2px 3px;font-size:14px;line-height:1.05;font-family:inherit;color:#2e1e12;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow-wrap:anywhere}
    #album .secs .ui-btn.on{outline:3px solid #ffd23f;outline-offset:-3px}
    #album .secs .ui-btn .ru{font-size:11px}
    #album .head{font-size:15px;line-height:1.25;margin:2px 0 6px}
    #album .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:6px}
    #album .ac{border:2px solid #c9a877;border-radius:6px;padding:4px 4px 5px;display:flex;flex-direction:column;align-items:center;text-align:center;min-width:0;background:rgba(255,248,226,.35)}
    #album .ac .im{height:66px;display:flex;align-items:center;justify-content:center}
    #album .ac.miss .im img{filter:brightness(0);opacity:.28}
    #album .ac .nm{font-size:16px;font-weight:700;line-height:1.1;overflow-wrap:anywhere}
    #album .ac .rb{font-size:12px;font-weight:700;margin-top:2px}
    #album .ac .n{font-size:12px;color:#6b4a2e}
    #album .soon{font-size:18px;line-height:1.35;padding:18px 8px;text-align:center}`;
  document.head.appendChild(css2);
  let sec = 'fische';
  function render(el) {
    if (!el) return;
    if (!META) { el.innerHTML = '<div class="stat">…</div>'; ready.then(() => render(el)); return; }
    const v = load(), all = Object.keys(META.items).length, got = Object.keys(META.items).filter(k => v.items[k]).length;
    const chips = META.sections.map(s => { const c = count(s.id); return `<button class="ui ui-btn${s.id === sec ? ' on' : ''}" data-asec="${s.id}">${s.de.replace(/^(der|die|das) /, '')}<span class="ru">${s.soon ? 'скоро' : c.got + '/' + c.all}</span></button>`; }).join('');
    const S = META.sections.find(s => s.id === sec);
    let body;
    if (S.soon) body = `<div class="soon"><b>${S.de}</b> — bald!<span class="ru">${S.ru} появятся позже</span></div>`;
    else body = '<div class="grid">' + ids(sec).map(k => {
      const it = META.items[k], o = v.items[k], kills = it.type ? v.kills[it.type] || 0 : 0;
      const name = o ? `<b style="color:${COL[it.art]}">${it.art}</b> ${it.w}` : '???';
      const extra = !o ? '<span class="ru">ещё не найдено</span>' : it.type ? `<div class="n">besiegt ×${kills}${(v.words[it.type] || []).length ? '<br>' + v.words[it.type].slice(-2).map(t => { const [a, ...w] = t.split(' '); return COL[a] ? `<b style="color:${COL[a]}">${a}</b> ${w.join(' ')}` : t; }).join(', ') : ''}</div>` : `<div class="n">×${o.n}${o.cm ? ' · max ' + o.cm + ' cm' : ''}${o.art ? ' · ✓ Artikel' : ''}</div>`;   // cm — рекорд улова (fishing.js)
      return `<div class="ac ${o ? 'found' : 'miss'}" data-id="${k}"><div class="im"><img src="${BASE + it.img}" alt="" style="${fit(it.px, 100, 66, 3)}"></div>
        <div class="nm">${name}</div>${o ? `<span class="ru">${it.ru}</span>` : ''}<div class="rb" style="color:${RCOL[it.rar]}">${RSTAR[it.rar]} ${META.rarity[it.rar][0]}</div>${extra}</div>`;
    }).join('') + '</div>';
    el.innerHTML = `<div id="album"><div class="head"><b>Sammelalbum</b> · ${got}/${all}<span class="ru">альбом находок · ${S.de}: ${S.where}</span></div><div class="secs">${chips}</div>${body}</div>`;
    el.onclick = e => { const b = e.target.closest('button[data-asec]'); if (!b) return; e.stopPropagation(); sec = b.dataset.asec; render(el); };
  }

  // ---------- находки в мире Wiesenland: грибы, цветы, камни на свободной траве (каждый заход — новые)
  const FIND = [['blumen', 40], ['pilze', 35], ['steine', 25]];
  function spawnFinds(sc) {
    const d = sc.world, W = window.WELT; if (!d || !W || !META) return;
    const { MW, MH, T, SC, CELL } = W, R = Math.random, M = d.mask, X = v => v * SC;
    const cellOk = (cx, cy) => cy >= 0 && cy < M.length && cx >= 0 && cx < M[0].length && M[cy][cx] === '1';
    const busy = [].concat((sc.pois || []).map(p => [p.x, p.y]), (sc.npcs || []).map(n => [n.x, n.y]), (sc.chests || []).map(c => [c.x, c.y]), (sc.spawns || []).map(s => [s.x, s.y]), [[sc.hero ? sc.hero.x : 0, sc.hero ? sc.hero.y : 0]], (sc.__fishSpots || []).flatMap(s => [[s.x, s.y], [s.x, s.y + 60], [s.bx, s.by]]));   // у места рыбалки — свободно (Max стоит, бочка, подпись)
    const out = []; let tries = 0;
    const hx = Math.floor((sc.hero ? sc.hero.x : 0) / X(T)), hy = Math.floor((sc.hero ? sc.hero.y : 0) / X(T));
    while (out.length < 40 && tries++ < 6000) {                     // мир 5760x7680 px экрана: ~40 находок; первые 2 — рядом с входом, чтобы их сразу было видно
      const near = out.length < 2 && tries < 1500, rx = near ? 9 : MW, ry = near ? 7 : MH;
      const tx = near ? hx - rx + Math.floor(R() * 2 * rx) : 2 + Math.floor(R() * (MW - 4)), ty = near ? hy - ry + Math.floor(R() * 2 * ry) : 2 + Math.floor(R() * (MH - 4)), i = ty * MW + tx;
      if (tx < 2 || ty < 2 || tx >= MW - 2 || ty >= MH - 2) continue;
      if (d.tm[i] || d.kind[i] || d.biome[i] === 3) continue;        // не вода/берег/песок, не дорога и не постройка
      const cx = tx * (T / CELL), cy = ty * (T / CELL); let ok = true;
      for (let yy = -1; yy <= 2 && ok; yy++) for (let xx = -1; xx <= 2 && ok; xx++) ok = cellOk(cx + xx, cy + yy);   // клетка тайла + рамка: вокруг свободно
      if (!ok) continue;
      const x = X(tx * T + T / 2), y = X(ty * T + T - 2);
      if (busy.some(([bx, by]) => Math.hypot(bx - x, by - y) < 110) || out.some(o => Math.hypot(o.x - x, o.y - y) < 170)) continue;
      let r = R() * 100, s = FIND[0][0]; for (const [k, w] of FIND) { r -= w; if (r < 0) { s = k; break; } }
      out.push({ x, y, id: pick(s) });
    }
    const keys = out.map(o => 'life_' + o.id).filter((k, i, a) => a.indexOf(k) === i && !sc.textures.exists(k));
    const draw = () => {
      if (!sc.sys || !sc.sys.isActive()) return;
      sc.__finds = out.map(o => {
        const lx = o.x - Math.floor(sc.textures.get('life_' + o.id).getSourceImage().width / 2) * SC;   // левый край на сетке x3
        const sh = SIL(sc.add.image(lx + 6, o.y + 3, 'life_' + o.id).setOrigin(0, 1).setScale(SC)).setDepth(o.y - 1);   // тень вправо-вниз, как у всех
        const im = sc.add.image(lx, o.y, 'life_' + o.id).setOrigin(0, 1).setScale(SC).setDepth(o.y);
        const zw = Math.max(66, im.displayWidth + 16), zh = Math.max(66, im.displayHeight + 16);
        const z = sc.add.zone(o.x, o.y - im.displayHeight / 2, zw, zh).setInteractive({ useHandCursor: true });
        o.im = im; o.sh = sh; o.z = z;
        z.on('pointerup', () => {
          if (sc.__dragged || sc.busy || o.taken) return;
          const go = () => { if (o.taken) return; o.taken = true; im.destroy(); sh.destroy(); z.destroy(); card(o.id, { title_de: 'Gefunden!', title_ru: 'находка', scene: sc }); };
          if (window.walkToScene) walkToScene(sc, o.x - 40, o.y + 6, go); else go();
        });
        return o;
      });
    };
    if (!keys.length) draw(); else { keys.forEach(k => sc.load.image(k, BASE + META.items[k.slice(5)].img)); sc.load.once('complete', draw); sc.load.start(); }
  }
  window.Album = { ready, meta: () => META, item, ids, pick, add, has, count, card, onDefeat, render, spawnFinds, load, COL, dock, close: () => { if (cur) done(); } };
  (function hook() {
    const ui = document.getElementById('ui'), g = window.game;
    if (!ui || !g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 80);
    ui.appendChild(box);
    const w = g.scene.getScene('Welt'); if (w) w.events.on('create', () => ready.then(() => spawnFinds(w)));
  })();
})();
