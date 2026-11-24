// Truhen & Belohnungen. Сундук открывается верным ответом: «Как по-немецки <страница>?» — 3 варианта (верный артикль+слово,
// то же слово с чужим артиклем, другое слово). Ошибка: сундук остаётся закрытым, слово уходит в «Повтор», можно попробовать снова.
// Награда: монеты, карточка слова, зелье, материал для зданий деревни. Сундук босса — больше.
// Инвентарь: localStorage ds_proto.inv = { potions: {heil: n}, mats: {holz, stein, mehl, eisen}, cards: ['die Seite', ...] }.
// Код (анимации) 24.11 — редкость сундука (DESIGN_DIGEST §7, M §20.1–20.2): häufig / selten / sehr selten / legendär = 60/28/10/2 %;
// от качества ответов (последние 10 попыток у сундуков, ds_proto.lootAcc): ≥ 90 % — 45/35/17/3, 70–89 % — 60/30/9/1, ниже — 80/18/2/0
// (меньше 3 попыток — базовые 60/28/10/2). Легенда — сюжетная и один раз: der Rubin в Album (ds_proto.legend); второй раз -> sehr selten.
// Редкость видна только ПОСЛЕ открытия: кадры открытия, затем свет её цвета (anim.js AnimFX.chestOpen), предметы вылетают, потом панель.
// Карточка слова: вопрос сначала берёт слова, которых ещё нет в карточках (два сундука подряд не дают одну и ту же карточку).
(function () {
  const KEY = 'ds_proto.inv';
  const MATS = { holz: ['das Holz', 'дерево'], stein: ['der Stein', 'камень'], mehl: ['das Mehl', 'мука'], eisen: ['das Eisen', 'железо'] };
  const POTS = { heil: ['der Heiltrank', 'зелье лечения'], blick: ['der Artikeltrank', 'зелье артикля'] };
  const ICON = k => 'assets_v3/items/' + k + '.png';               // craftpix 994534 icons (x4) + craftpix 48 magic potions
  const inv = () => { try { const v = JSON.parse(localStorage.getItem(KEY)) || {}; v.potions = v.potions || {}; v.mats = v.mats || {}; v.cards = v.cards || []; return v; } catch (e) { return { potions: {}, mats: {}, cards: [] }; } };
  const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };
  const rnd = n => Math.floor(Math.random() * n), pick = a => a[rnd(a.length)];
  function words() { const P = (window.Combat && Combat.pool && Combat.pool()) || []; return P.length >= 3 ? P : P.concat([{ art: 'die', w: 'Truhe', ru: 'сундук' }, { art: 'der', w: 'Schlüssel', ru: 'ключ' }, { art: 'das', w: 'Gold', ru: 'золото' }]); }
  function question() {
    const all = words(), have = inv().cards, fresh = all.filter(x => !have.includes(x.art + ' ' + x.w)), P = all;
    const w = pick(fresh.length ? fresh : all), arts = ['der', 'die', 'das'].filter(a => a !== w.art), other = pick(P.filter(x => x.w !== w.w)) || P[0];
    const opts = [{ t: w.art + ' ' + w.w, ok: true }, { t: pick(arts) + ' ' + w.w, ok: false }, { t: other.art + ' ' + other.w, ok: false }].sort(() => Math.random() - 0.5);
    return { w, opts };
  }
  // ---- редкость
  const RAR = { h: ['Häufig', 'обычный сундук', '#7d6b52', '●'], s: ['Selten', 'редкий сундук', '#b0701a', '★'], ss: ['Sehr selten', 'очень редкий сундук', '#8e4fc4', '★★'], l: ['Legendär', 'легендарный сундук', '#c98a00', '★★★'] };
  const TABLE = { base: [60, 28, 10, 2], hi: [45, 35, 17, 3], mid: [60, 30, 9, 1], lo: [80, 18, 2, 0] }, ORDER = ['h', 's', 'ss', 'l'];
  const ACC = 'ds_proto.lootAcc', LEG = 'ds_proto.legend';
  const accList = () => { try { return JSON.parse(localStorage.getItem(ACC)) || []; } catch (e) { return []; } };
  function rec(ok) { const a = accList(); a.push(ok ? 1 : 0); while (a.length > 10) a.shift(); try { localStorage.setItem(ACC, JSON.stringify(a)); } catch (e) {} }
  function quality() { const a = accList(); return a.length < 3 ? null : a.reduce((s, v) => s + v, 0) / a.length; }
  function table(q) { return q == null ? TABLE.base : q >= 0.9 ? TABLE.hi : q >= 0.7 ? TABLE.mid : TABLE.lo; }
  let forced = null;
  function rarity(tier) {
    const f = forced; forced = null; let r = f;                     // f — только для проверок (Loot.__force)
    if (!r) { const T = table(quality()); let x = Math.random() * 100; r = ORDER[ORDER.length - 1]; for (let i = 0; i < 4; i++) { x -= T[i]; if (x < 0) { r = ORDER[i]; break; } } }
    if (tier === 'boss' && r === 'h') r = 's';                       // сундук босса — не ниже «selten»
    if (r === 'l' && !f && localStorage.getItem(LEG)) r = 'ss';      // легенда уже выдана -> sehr selten
    return r;
  }
  const MUL = { h: 1, s: 1.5, ss: 2.2, l: 3 };
  function roll(tier, rar) {
    rar = rar || 'h'; const big = tier === 'boss', m = MUL[rar] || 1, r = { coins: Math.round(((big ? 40 : 12) + rnd(big ? 30 : 10)) * m), items: [], rar };
    const nm = (big ? 3 : 1 + rnd(2)) + (rar === 'h' ? 0 : 1); for (let i = 0; i < nm; i++) { const k = pick(Object.keys(MATS)); r.items.push({ kind: 'mat', k, n: 1 + rnd(big ? 3 : 2) + (rar === 'ss' || rar === 'l' ? 1 : 0) }); }
    if (big || rar !== 'h' || Math.random() < 0.45) r.items.push({ kind: 'pot', k: rar === 'ss' || rar === 'l' ? 'blick' : Math.random() < 0.7 ? 'heil' : 'blick', n: rar === 'l' ? 2 : 1 });
    if (rar === 'l') r.items.push({ kind: 'legend', k: 'rubin', n: 1 });   // сюжетная легенда: der Rubin (Album, ★★★), один раз
    return r;
  }
  function give(r, card) {
    const v = inv(); r.items.forEach(it => {
      if (it.kind === 'legend') { try { localStorage.setItem(LEG, it.k + ':' + Date.now()); } catch (e) {} if (window.Album && Album.add) Album.add(it.k, true); return; }
      const bag = it.kind === 'mat' ? v.mats : v.potions; bag[it.k] = (bag[it.k] || 0) + it.n; });
    if (card && !v.cards.includes(card)) v.cards.push(card); save(v);
    if (typeof setCoins === 'function' && typeof state !== 'undefined') setCoins(state.coins + r.coins);
  }
  // ---------- UI (in #ui: German big, Russian small; wooden buttons; nothing overlaps)
  const css = document.createElement('style');
  css.textContent = `#loot{position:absolute;left:24px;right:24px;top:50%;transform:translateY(-50%);display:none;flex-direction:column;align-items:stretch;gap:8px;padding:14px 14px 16px;color:#2e1e12;z-index:70;text-align:center}
    #loot .t{font-size:26px;font-weight:700;line-height:1.1}#loot .ru{display:block;font-size:14px;font-weight:400;color:#6b4a2e}
    #loot .q{font-size:20px;line-height:1.25;margin:2px 0 4px}
    #loot .ui-btn{height:auto;min-height:54px;font-size:22px;font-family:inherit;color:#2e1e12;padding:4px 10px;line-height:1.1}
    #loot .rw{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 14px;font-size:19px;line-height:1.2}
    #loot .rw div{min-width:120px;display:flex;flex-direction:column;align-items:center}#loot .bad{color:#9b2c1c;font-size:18px}
    #loot .rw img,#skills .ico{height:40px;image-rendering:pixelated;display:block;margin:0 auto 2px;filter:drop-shadow(2px 2px 0 rgba(59,35,20,.35))}
    #skills .ico{height:36px;width:36px;object-fit:contain;margin:0;flex:0 0 36px}`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'loot'; box.className = 'ui ui-panel-paper';
  let cur = null;
  const hud = ['bag', 'bFurn', 'bMap', 'cbHero']; let was = {};
  function show(html) { box.innerHTML = html; box.style.display = 'flex'; hud.forEach(k => { const e = document.getElementById(k); if (e && was[k] === undefined) { was[k] = e.style.display; e.style.display = 'none'; } }); }
  function hide() { box.style.display = 'none'; hud.forEach(k => { const e = document.getElementById(k); if (e && was[k] !== undefined) e.style.display = was[k]; }); was = {}; if (cur && cur.sc) cur.sc.busy = false; cur = null; }
  function ask(msg) {
    const q = cur.q = question();
    show(`<div class="t">Die Truhe ist zu!<span class="ru">сундук заперт — ответь, чтобы открыть</span></div>
      <div class="q">Wie heißt <b>«${q.w.ru}»</b> auf Deutsch?<span class="ru">как это по-немецки?</span></div>
      ${msg ? `<div class="bad">${msg}</div>` : ''}
      ${q.opts.map((o, i) => `<button class="ui ui-btn" data-i="${i}">${o.t}</button>`).join('')}
      <button class="ui ui-btn" data-x="1" style="min-height:46px;font-size:18px">Später<span class="ru">позже</span></button>`);
  }
  const LEGEND = { rubin: ['der Rubin', 'рубин — легенда Stillbach, бывает один раз', 'assets_v3/life/rubin.png'] };
  function reward() {
    const c = cur, rar = rarity(c.tier), r = roll(c.tier, rar), card = c.q.w.art + ' ' + c.q.w.w; give(r, card);
    const anim = !!(window.AnimFX && c.chest && c.chest.img && c.sc && c.sc.sys && c.sc.sys.isActive());
    if (c.chest) { c.chest.opened = true; if (!anim && c.chest.img && c.chest.img.setTint) c.chest.img.setTint(0xb8a890); if (c.onOpen) c.onOpen(c.chest, r); }
    try { const o = JSON.parse(localStorage.getItem('ds_proto.opened')) || []; if (c.chest && c.chest.id) { o.push(c.chest.id); localStorage.setItem('ds_proto.opened', JSON.stringify(o)); } } catch (e) {}
    const R = RAR[rar] || RAR.h, it = r.items.map(x => { const n = x.kind === 'legend' ? LEGEND[x.k] : (x.kind === 'mat' ? MATS : POTS)[x.k];
      return `<div${x.kind === 'legend' ? ` style="color:${R[2]}"` : ''}><img src="${x.kind === 'legend' ? n[2] : ICON(x.k)}" alt="">${x.n} × ${n[0]}<span class="ru">${n[1]}</span></div>`; }).join('');
    let shown = false;
    const panel = () => {
      if (shown || cur !== c) return; shown = true; if (window.speakDE) speakDE(card);
      show(`<div class="t">${c.tier === 'boss' ? 'Große Belohnung!' : 'Belohnung!'}<span class="ru">${c.tier === 'boss' ? 'большая награда' : 'награда'}</span></div>
      <div class="rar" data-rar="${rar}" style="font-size:19px;font-weight:800;color:${R[2]}">${R[3]} ${R[0]}<span class="ru">${R[1]}</span></div>
      <div class="rw"><div><img src="assets_v3/icon_coin.png" alt="">+${r.coins} Münzen<span class="ru">монеты</span></div>${it}<div><img src="${ICON('karte')}" alt="">Wortkarte: ${card}<span class="ru">карточка слова · ${c.q.w.ru}</span></div></div>
      <button class="ui ui-btn" data-x="1">Super!<span class="ru">отлично</span></button>`);
    };
    if (!anim) return panel();
    box.style.display = 'none';                                      // панель уходит: виден сундук — кадры открытия, свет редкости, предметы
    const icons = ['coin'].concat(r.items.map(x => x.k));
    AnimFX.chestOpen(c.sc, c.chest, rar, icons, panel);
    setTimeout(panel, 4000);                                         // запас: сцена ушла посреди анимации -> панель всё равно появится
  }
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !cur) return;
    if (b.dataset.x) return hide();
    const o = cur.q.opts[+b.dataset.i]; if (!o) return;
    if (!box.querySelector('button[data-i]') || box.style.display === 'none') return;   // идёт открытие — повторный тап не считается
    rec(o.ok);
    if (o.ok) reward(); else { if (window.Combat && Combat.addReview) Combat.addReview(cur.q.w); ask(`Nicht ganz: ${cur.q.w.art} ${cur.q.w.w}. Noch einmal!<span class="ru">почти — слово ушло в «Повтор», попробуй ещё</span>`); }
  });
  function open(sc, chest, opts) {
    opts = opts || {}; if (chest && chest.opened) { if (window.toast) toast('Die Truhe ist leer', 1200); return; }
    if (sc) sc.busy = true; cur = { sc, chest, tier: opts.tier || (chest && chest.tier) || 'normal', onOpen: opts.onOpen }; ask();
    if (window.AnimFX && sc && sc.load) AnimFX.preloadIcons(sc, ['coin', 'rubin', 'karte'].concat(Object.keys(MATS), Object.keys(POTS)));   // иконки для вылета — пока игрок думает
  }
  window.Loot = { open, close: hide, inv, MATS, POTS, roll, question, ICON, RAR, TABLE, rarity, quality, table,
    __force(r) { forced = { common: 'h', rare: 's', epic: 'ss', legendary: 'l' }[r] || r; },   // для проверок/кадров: следующая награда этой редкости
    use(k) { const v = inv(); if (!v.potions[k]) return false; v.potions[k]--; save(v); return true; } };
  (function hook() { const ui = document.getElementById('ui'); if (!ui) return setTimeout(hook, 100); ui.appendChild(box); })();
})();
