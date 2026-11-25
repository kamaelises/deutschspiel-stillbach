// markt.js - window.Markt: der Wochenmarkt (Epoch-2 «Markt» 25.11, tasks\EPOCH_STUDY.md §2/§3/§5 п.4-6). ONLY behind the flag ?markt=1
// (own URL or the parent app URL); without the flag the file returns at once and changes nothing.
// A1 = Max is a child: a stall of Frau Berger in front of the plot «der Markt» (ch. 16). Buying = German: «Was kostet ein Apfel?» (ein/eine),
// the price heard as a word -> the digit (Zahlen), Verhandlung «Können Sie es billiger machen, bitte?» (Sie) vs «Kannst du…» (du -> Ruf minus),
// «Ich nehme zwei Äpfel» (Akkusativ einen/eine/ein, Plural), «Bitte schön» when paying.
// Price breathes (idea of 0 A.D. Barter, own code): base (markt.json) + mood of the day (Angebot -1 / teurer +1) + pressure (+1 per purchase,
// back -1 every pressure_back_min min) - haggle (-1 once a day per item), never below floor.
// Ruf (idea of Unciv diplomacy, own code): the sum of reasons with text («Du warst höflich: +2»), each reason fades 1 per day; gains <= ruf_gain_day.
// ANTIFARM (tasks\ANTIFARM.md): the market gives coins ONLY as the change (das Wechselgeld) of Mama's shopping list: one list a day,
// change <= antifarm.change_cap_day via Rewards.coins(…,'markt'); practice purchases cost and give 0 coins; haggling only lowers spending.
// UI juice (flag only, EPOCH_STUDY §3): buttons squash, coins fly to/from the counter (ds:eco), the counter pops; off with «Weniger Animation».
// Own files: markt.js, assets_v3/world/markt.json, tasks/en/game_markt.tsv. Others: only Yard events + Eco/Rewards API; window.t is NOT set.
// API: Markt.ready, cfg(), price(id), mood(id), pressure(id), list(), purse(), state(), ruf(), level(), reasons(), open(), close(), tap(), step(),
//      objects(), zahl(n), _reset(), _age(id, min), _rufAge(days). Event: window 'ds:markt' {t: buy|haggle|ruf|zettel, ...}.
(function () {
  const RX = /[?&]markt=1(?:&|#|$)/;
  // 25.11 главный: по умолчанию ВКЛ; выключатель ?markt=0 (в игре или в приложении-родителе)
  const RX0 = /[?&]markt=0(?:&|#|$)/;
  const ON = (() => { try { if (RX0.test(location.search)) return false; } catch (e) {} try { if (window.parent !== window && RX0.test(window.parent.location.search)) return false; } catch (e) {} return true; })();
  if (!ON) return;
  const LK = 'ds_proto.markt', HUD = ['bag', 'bFurn', 'bMap'], COL = { der: '#3a7be0', die: '#e24848', das: '#2f9a4f' };
  let M = null, sc = null, objs = null, was = {}, busyOwner = null, st = { step: 'off' }, talkEv = null;
  const ready = fetch('assets_v3/world/markt.json').then(r => r.json()).then(j => { M = j; return j; }).catch(() => null);
  const day = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const hash = s => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const good = id => M && M.goods.find(g => g.id === id);
  const fire = (t, d) => { try { dispatchEvent(new CustomEvent('ds:markt', { detail: Object.assign({ t }, d) })); } catch (e) {} };
  const less = () => { try { return !!(window.AnimFX && AnimFX.less && AnimFX.less()); } catch (e) { return false; } };
  const say = t => { try { if (window.speakDE) speakDE(t); } catch (e) {} talk(); };
  // ---------- German: numbers, articles
  const ONES = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
  const TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];
  const zahl = n => (n < 20 ? ONES[n] : (n % 10 ? (n % 10 === 1 ? 'ein' : ONES[n % 10]) + 'und' : '') + TENS[Math.floor(n / 10)]);
  const money = n => (n === 1 ? 'eine Münze' : zahl(n) + ' Münzen');
  const NOM = { der: 'ein', die: 'eine', das: 'ein' }, ACC = { der: 'einen', die: 'eine', das: 'ein' };
  const NOM_X = { der: 'eine', die: 'ein', das: 'eine' }, ACC_X = { der: 'ein', die: 'einen', das: 'einen' }, POSS = { der: 'dein', die: 'deine', das: 'dein' };
  const Cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const menge = (g, q) => (q === 1 ? ACC[g.art] + ' ' + g.sg : zahl(q) + ' ' + g.pl);
  const nm = g => `<b style="color:${COL[g.art]}">${g.art}</b> ${g.sg}`;
  function numOpts(n) {
    const s = new Set([n]);
    [n < 10 ? n + 10 : n < 20 ? (n - 10) * 10 : n - 10, n + 1, n > 1 ? n - 1 : n + 2, n + 2, n + 3].forEach(x => { if (s.size < 4 && x > 0 && x < 100) s.add(x); });
    return shuffle([...s]);
  }
  // ---------- state
  function load() {
    let v = null; try { v = JSON.parse(localStorage.getItem(LK)); } catch (e) {}
    v = v && typeof v === 'object' ? v : {}; v.ruf = v.ruf || []; v.press = v.press || {};
    if (v.day !== day()) { v.day = day(); v.list = null; v.purse = 0; v.spent = 0; v.paid = null; v.hag = {}; v.gain = 0; v.greet = 0; }
    v.hag = v.hag || {}; return v;
  }
  const save = v => { try { localStorage.setItem(LK, JSON.stringify(v)); } catch (e) {} };
  function mood(id) {
    if (!M) return 0; const G = M.goods, d = day(), a = hash(d + ':a') % G.length; let b = hash(d + ':b') % G.length; if (b === a) b = (b + 1) % G.length;
    return G[a].id === id ? M.price.mood.angebot : G[b].id === id ? M.price.mood.teuer : 0;
  }
  function pressure(id, v) { const p = (v || load()).press[id]; if (!p) return 0; return Math.max(0, p.v - Math.floor((Date.now() - p.t) / (M.price.pressure_back_min * 60000))); }
  function price(id) { const g = good(id); if (!g) return 0; const v = load(); return Math.max(M.price.floor, g.base + mood(id) + pressure(id, v) - (v.hag[id] ? 1 : 0)); }
  // an item of Mama's list: Frau Berger knows the list, the price never goes over what Mama gave (base + purse_extra) — practice never makes Mama's shopping dearer
  function priceFor(id) { const v = load(), p = price(id); return listItem(v, id) ? Math.min(p, good(id).base + M.list.purse_extra_per_piece - (v.hag[id] ? 1 : 0)) : p; }
  function ensureList(v) {
    if (v.list) return v.list; const G = M.goods, d = day(), ids = []; let k = 0;
    while (ids.length < Math.min(M.list.items, G.length) && k < 50) { const id = G[hash(d + ':L' + k++) % G.length].id; if (!ids.includes(id)) ids.push(id); }
    v.list = ids.map((id, i) => ({ id, q: 1 + hash(d + ':Q' + i) % M.list.qty_max, done: 0 }));
    v.purse = v.list.reduce((s, it) => s + (good(it.id).base + M.list.purse_extra_per_piece) * it.q, 0); v.spent = 0; save(v); fire('zettel', { list: v.list, purse: v.purse }); return v.list;
  }
  const listItem = (v, id) => (v.list || []).find(it => it.id === id && !it.done);
  // ---------- Ruf
  const modNow = (m, now) => Math.sign(m.v) * Math.max(0, Math.abs(m.v) - Math.floor((now - m.t) / 86400000) * (M.ruf.decay_per_day || 1));
  function ruf(v) { v = v || load(); const now = Date.now(); return v.ruf.reduce((s, m) => s + modNow(m, now), 0); }
  function level(n) { if (n === undefined) n = ruf(); let L = M.ruf.levels[0]; M.ruf.levels.forEach(l => { if (n >= l.min) L = l; }); return L; }
  function addRuf(key) {
    const w = M.ruf.why[key], v = load(); if (!w) return 0; let val = w.v;
    if (val > 0) { val = Math.min(val, Math.max(0, M.antifarm.ruf_gain_day - (v.gain || 0))); if (!val) return 0; v.gain = (v.gain || 0) + val; }
    const now = Date.now(); v.ruf = v.ruf.filter(m => modNow(m, now) !== 0).slice(-60); v.ruf.push({ k: key, v: val, t: now }); save(v); fire('ruf', { key, v: val, ruf: ruf(v) }); return val;
  }
  function reasons() { const v = load(), now = Date.now(); return v.ruf.map(m => ({ k: m.k, v: modNow(m, now) })).filter(m => m.v).slice(-3).reverse().map(m => Object.assign({ v: m.v }, M.ruf.why[m.k] ? { de: M.ruf.why[m.k].de, ru: M.ruf.why[m.k].ru } : {})); }
  // ---------- own pixel art (drawn here, 1 px of art = 3 px of the screen, no smoothing)
  const PAL = { k: '#3b2314', r: '#c8402e', R: '#9e2f22', w: '#f2e6c8', W: '#d8c8a2', b: '#8a5a32', B: '#5e3a1e', l: '#b07a46', s: '#f0c8a0', h: '#6b3a1e',
    c: '#3a6ea8', p: '#efe6d2', a: '#d83a2a', A: '#9c2418', g: '#5f9e34', y: '#f0d040', Y: '#c9a020', t: '#e0502a', T: '#a8341a', e: '#f4eee0', E: '#cfc4ae',
    n: '#c98a4a', N: '#9a6232', q: '#b8c840', Q: '#869a28', o: '#fff6e6' };
  const ICON = {
    apfel: ['....g...', '...gk...', '.aaakaa.', 'aaaaaaoa', 'aaaaaaaa', 'aaaaaaaA', '.aaaaaA.', '..aAAA..'],
    banane: ['......kY', '.....yy.', '....yyy.', '...yyyy.', '..yyyyY.', 'yyyyyY..', 'YyyyY...', '.YYY....'],
    tomate: ['..g.g...', '...gg...', '.ttttt..', 'tttttot.', 'ttttttt.', 'tttttTt.', '.tTTTt..', '........'],
    birne: ['....k...', '...qq...', '...qq...', '..qqqq..', '.qqqqoq.', '.qqqqqq.', '.qqqqQq.', '..QQQQ..'],
    ei: ['........', '...ee...', '..eeee..', '.eeeoee.', '.eeeeee.', '.eeeeeE.', '..eEEE..', '........'],
    brot: ['........', '..nnnn..', '.nNnNnn.', 'nnnnnnnn', 'nNnNnNnn', 'nnnnnnnN', '.NNNNNN.', '........']
  };
  function grid(rows, k) { const c = document.createElement('canvas'), H = rows.length, W = rows[0].length; c.width = W * k; c.height = H * k; const x = c.getContext('2d');
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(i * k, j * k, k, k); } })); return c; }
  const iconUrl = {}; const icon = id => iconUrl[id] || (iconUrl[id] = ICON[id] ? grid(ICON[id], 4).toDataURL() : '');
  function stallRows(talk) {                                            // 40 x 34: awning, posts, Frau Berger, counter with crates
    const W = 40, H = 34, g = Array.from({ length: H }, () => Array(W).fill('.')), P = (ch, x, y, w = 1, h = 1) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (g[j] && i >= 0 && i < W) g[j][i] = ch; };
    P('b', 3, 6, 2, 28); P('B', 4, 6, 1, 28); P('b', 35, 6, 2, 28); P('B', 36, 6, 1, 28);               // posts
    P('k', 2, 0, 36, 1); for (let y = 1; y <= 8; y++) { P('k', 1, y); P('k', 38, y); for (let x = 2; x < 38; x++) P(((x - 2) >> 2) % 2 ? 'w' : 'r', x, y); }
    for (let x = 2; x < 38; x++) { const red = !(((x - 2) >> 2) % 2); P(red ? 'R' : 'W', x, 8); if ((x - 2) % 4 === 1 || (x - 2) % 4 === 2) P(red ? 'R' : 'W', x, 9); }
    P('h', 17, 11, 6, 2); P('h', 17, 13, 1, 3); P('h', 22, 13, 1, 3); P('s', 18, 13, 4, 4); P('k', 19, 14); P('k', 21, 14);   // Frau Berger: hair, face, eyes
    if (talk) P('A', 19, 16, 3, 1); else P('T', 20, 16, 2, 1);                                              // mouth: open when she talks
    P('c', 16, 17, 8, 4); P('p', 18, 18, 4, 3); if (talk) { P('c', 24, 14, 2, 4); P('s', 25, 12, 2, 2); }     // dress, apron, waving hand
    P('B', 5, 15, 10, 1); P('l', 5, 16, 10, 4); P('B', 5, 16, 1, 4); P('B', 14, 16, 1, 4);                   // left crate: apples
    [[6, 13], [8, 13], [10, 13], [12, 13], [7, 14], [9, 14], [11, 14], [13, 14]].forEach(([x, y]) => { P('a', x, y, 2, 2); P('A', x + 1, y + 1); });
    P('B', 26, 15, 10, 1); P('l', 26, 16, 10, 4); P('B', 26, 16, 1, 4); P('B', 35, 16, 1, 4);                // right crate: bananas + tomatoes
    P('y', 27, 13, 4, 1); P('y', 26, 14, 5, 1); P('Y', 27, 14, 1); P('t', 31, 13, 2, 2); P('t', 33, 13, 2, 2); P('T', 32, 14); P('T', 34, 14);
    P('B', 1, 20, 38, 1); P('b', 2, 21, 36, 6); P('l', 2, 21, 36, 1); [10, 20, 30].forEach(x => P('B', x, 22, 1, 5)); P('B', 2, 27, 36, 1);   // counter
    P('n', 16, 19, 3, 1); P('N', 16, 20, 3, 1); P('e', 21, 19, 2, 1); P('e', 23, 19, 1, 1);                   // bread and eggs on the edge
    return g.map(r => r.join(''));
  }
  // ---------- Yard: the stall
  const alive = () => sc && sc.sys && sc.sys.isActive() && sc.sys.displayList;
  function talk() {
    if (!alive() || !objs || !objs.stall) return; if (talkEv) { talkEv.remove(); talkEv = null; }
    if (less()) return; let n = 0; const s = objs.stall;
    talkEv = sc.time.addEvent({ delay: 180, repeat: 7, callback: () => { n++; if (s.scene) s.setTexture(n % 2 && n < 8 ? 'mk_stall_1' : 'mk_stall_0'); } });
  }
  // mk2 (решение главного 25.11): стенд с главы from_chapter (4: Zahlen/Akkusativ/Plural — Linie 1 гл. 3–6), как участки town.js reach():
  // глава открыта = начата предыдущая; «Только игра» — те же главы из Stufe (DSMode.chapters). После главы 16 стенд остаётся.
  function reach() {
    let ch = []; try { ch = window.DSMode ? DSMode.chapters() : JSON.parse(localStorage.getItem('ds_proto.app')).chapters || []; } catch (e) {}
    const started = (ch || []).filter(c => +c.done > 0).map(c => +c.n);
    return Math.max(typeof state !== 'undefined' && state && state.done ? 2 : 1, started.length ? Math.max(...started) + 1 : 1);
  }
  const plotOk = () => reach() >= (M.stall.from_chapter || 1);
  function setup(y) {
    if (objs) { [objs.stall, objs.shadow, ...objs.label].forEach(o => { try { o.destroy(); } catch (e) {} }); }
    sc = y; objs = null; if (!M || !y.textures.exists('town_bg') || !plotOk()) return;
    ['mk_stall_0', 'mk_stall_1'].forEach((k, i) => { if (!y.textures.exists(k)) y.textures.addCanvas(k, grid(stallRows(i), 3)); });
    const { x, y: by } = M.stall, sh = y.add.ellipse(x, by - 3, 126, 18, 0x2a1a0c, 0.22).setDepth(by - 2);
    const stall = y.add.image(Math.round((x - 60) / 3) * 3, by - 102, 'mk_stall_0').setOrigin(0, 0).setDepth(by).setInteractive({ useHandCursor: true });
    stall.on('pointerup', tap);
    const ST = { fontFamily: 'Roboto, sans-serif', fontStyle: 'bold', stroke: '#2a170c' };
    const la = y.add.text(0, 0, 'der ', { ...ST, fontSize: '20px', color: COL.der, strokeThickness: 6 }).setOrigin(0, 1).setDepth(6000);
    const lw = y.add.text(0, 0, 'Wochenmarkt', { ...ST, fontSize: '20px', color: '#fff7e0', strokeThickness: 6 }).setOrigin(0, 1).setDepth(6000);
    const x0 = Math.round(x - (la.width + lw.width) / 2), ly = by - 126; la.setPosition(x0, ly); lw.setPosition(x0 + la.width, ly);
    const sub = y.add.text(x, ly + 2, 'уличный рынок', { fontFamily: 'Roboto, sans-serif', fontSize: '12px', color: '#f3e3c3', stroke: '#2a170c', strokeThickness: 4 }).setOrigin(0.5, 0).setDepth(6000);
    objs = { stall, shadow: sh, label: [la, lw, sub] };
  }
  function tap() {
    if (!alive() || sc.__dragged || sc.busy) return; say('Guten Tag!');
    const s = M.stall.stand; if (window.walkToScene && s) window.walkToScene(sc, s[0], s[1], open); else open();
  }
  // ---------- panel (paper, like restore/garden)
  const css = document.createElement('style');
  css.textContent = `
    #marktBox{position:absolute;left:12px;right:12px;top:58px;display:none;flex-direction:column;gap:6px;padding:8px 12px 10px;color:#2e1e12;z-index:73;max-height:calc(100% - 70px);overflow-y:auto}
    #marktBox .t{font-size:21px;font-weight:700;line-height:1.1}
    #marktBox .say{font-size:18px;line-height:1.2;background:rgba(255,248,230,.55);border:2px solid #b89a6a;padding:5px 8px;display:flex;gap:8px;align-items:center}
    #marktBox .say>div{flex:1}
    #marktBox .d{font-size:16px;line-height:1.15}
    #marktBox .why{font-size:16px;font-weight:700;color:#9b2c1c;line-height:1.15}
    #marktBox .good{font-size:16px;font-weight:700;color:#2f7a2a;line-height:1.15}
    #marktBox .ru{display:block;font-size:12px;font-weight:400;color:#6b4a2e;line-height:1.15}
    #marktBox .row{display:flex;gap:6px;flex-wrap:wrap}
    #marktBox .ui-btn{font-family:inherit;color:#2e1e12;height:auto;min-height:48px;padding:3px 6px;font-size:16px;line-height:1.1;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1 1 40%;min-width:0}
    #marktBox .opt .ui-btn{flex:1 1 100%;align-items:flex-start;text-align:left;padding:4px 10px}
    #marktBox .num .ui-btn{flex:1 1 20%;font-size:26px;font-weight:800}
    #marktBox .goods .ui-btn{flex:1 1 30%;min-height:84px}
    #marktBox .ui-btn img{image-rendering:pixelated;display:block;margin:0 auto 2px;height:32px}
    #marktBox .ui-btn .p{font-size:14px;font-weight:800;color:#2f7a2a}
    #marktBox .ui-btn .tag{font-size:11px;font-weight:700;color:#9b2c1c}
    #marktBox .ui-btn.x{flex:0 0 auto}
    #marktBox .ui-btn.hear{flex:0 0 auto;min-height:40px;font-size:13px}
    #marktBox .zet{font-size:15px;line-height:1.2;background:#fffaf0;border:2px dashed #b89a6a;padding:4px 8px}
    #marktBox .zet s{color:#2f7a2a}
    #marktBox .ruf{font-size:13px;line-height:1.2;color:#4a3420}
    #marktBox .mk-ok{outline:3px solid #2f7a2a}
    @keyframes mkPress{0%{transform:scale(1)}30%{transform:scale(.93,.9)}70%{transform:scale(1.04,1.05)}100%{transform:scale(1)}}
    @keyframes mkNo{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
    @keyframes mkPop{0%{transform:scale(1)}50%{transform:scale(1.4)}100%{transform:scale(1)}}
    .mk-press{animation:mkPress .2s steps(4,end)}
    .mk-no{animation:mkNo .24s steps(4,end)}
    .mk-pop{animation:mkPop .3s steps(3,end);display:inline-block}
    .mk-coin{position:fixed;width:18px;height:18px;image-rendering:pixelated;z-index:200;pointer-events:none}`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'marktBox'; box.className = 'ui ui-panel-paper';
  const COIN = '<img src="assets_v3/icon_coin.png" alt="" style="height:16px;vertical-align:-3px;display:inline;margin:0">';
  const vendor = () => (M ? M.vendor.de : 'Frau Berger');
  function show(html) {
    box.innerHTML = html; box.style.display = 'flex';
    HUD.forEach(k => { const e = document.getElementById(k); if (e && was[k] === undefined) { was[k] = e.style.display; e.style.display = 'none'; } });
    const s = window.game && game.scene.getScenes(true)[0]; if (s) { s.busy = true; busyOwner = s; }
  }
  function close() {
    box.style.display = 'none'; st = { step: 'off' };
    HUD.forEach(k => { const e = document.getElementById(k); if (e && was[k] !== undefined) e.style.display = was[k]; }); was = {};
    if (busyOwner) busyOwner.busy = false; busyOwner = null;
  }
  const btn = (o, i) => `<button class="ui ui-btn" data-o="${i}"${o.ok ? ' data-ok="1"' : ''}>${o.html || o.de}${o.ru ? `<span class="ru">${o.ru}</span>` : ''}</button>`;
  function head() {
    const v = load(), L = level(), R = ruf(v), rs = reasons();
    let h = `<div class="t">${vendor()} · <b style="color:${COL.der}">der</b> Wochenmarkt<span class="ru">${M.vendor.ru}</span></div>`;
    if (v.list) {
      const left = v.purse - v.spent, done = v.list.every(it => it.done);
      h += `<div class="zet" data-zettel>Mamas Zettel: Kauf bitte ${v.list.map(it => { const s = menge(good(it.id), it.q); return it.done ? `<s>${s} ✓</s>` : `<b>${s}</b>`; }).join(' und ')}.`
        + (done ? `<span class="ru">список выполнен — дальше можно покупать для практики (без монет)</span>` : ` · Einkaufsgeld: <b data-purse>${left}</b> ${COIN}<span class="ru">мамин список и деньги на покупки</span>`) + '</div>';
    }
    h += `<div class="ruf" data-ruf>Ruf: <b>${L.de}</b> (${R > 0 ? '+' : ''}${R})${rs.length ? ' · ' + rs.map(r => `${r.de}: ${r.v > 0 ? '+' : ''}${r.v}`).join(' · ') : ''}<span class="ru">отношение продавщицы: ${L.ru}</span></div>`;
    return h;
  }
  const sayBox = (de, ru) => `<div class="say"><div><b>${vendor()}:</b> ${de}${ru ? `<span class="ru">${ru}</span>` : ''}</div><button class="ui ui-btn hear" data-hear>Hören</button></div>`;
  function render(note) {
    if (!M) return; const s = st; let h = head();
    if (s.say) h += sayBox(s.say.de, s.say.ru);
    if (note) h += `<div class="${note.good ? 'good' : 'why'}" data-note>${note.de}<span class="ru">${note.ru}</span></div>`;
    if (s.task) h += `<div class="d">${s.task.de}<span class="ru">${s.task.ru}</span></div>`;
    if (s.step === 'goods') {
      h += '<div class="row goods">' + M.goods.map(g => { const p = priceFor(g.id), m = mood(g.id), pr = pressure(g.id);
        const tag = m < 0 ? 'Angebot!' : m > 0 ? 'heute teurer' : pr > 0 ? 'gefragt ↑' : '';
        return `<button class="ui ui-btn" data-g="${g.id}"><img src="${icon(g.id)}" alt=""><span>${nm(g)}</span><span class="p">${p} ${COIN}</span>${tag ? `<span class="tag">${tag}</span>` : ''}<span class="ru">${g.ru}</span></button>`; }).join('') + '</div>';
    } else if (s.opts) h += `<div class="row ${s.cls || 'opt'}">` + s.opts.map(btn).join('') + '</div>';
    h += '<div class="row"><button class="ui ui-btn x" data-close>Auf Wiedersehen!<span class="ru">до свидания (закрыть)</span></button>'
      + (s.step !== 'goods' && s.step !== 'greet' ? '<button class="ui ui-btn x" data-back>Zurück<span class="ru">к товарам</span></button>' : '') + '</div>';
    show(h);
    box.querySelectorAll('[data-o]').forEach(b => { b.onclick = () => pick(+b.dataset.o, b); });
    box.querySelectorAll('[data-g]').forEach(b => { b.onclick = () => ask(b.dataset.g); });
    box.querySelector('[data-close]').onclick = () => { say('Auf Wiedersehen!'); close(); };
    const bb = box.querySelector('[data-back]'); if (bb) bb.onclick = () => goods();
    const hb = box.querySelector('[data-hear]'); if (hb) hb.onclick = () => { if (st.say) say(st.say.de); };
  }
  function nope(b, hint) {                                        // a wrong choice: no penalty, a hint, try again
    if (b && !less()) { b.classList.remove('mk-no'); void b.offsetWidth; b.classList.add('mk-no'); }
    const n = box.querySelector('[data-note]'); const html = `${hint.de}<span class="ru">${hint.ru}</span>`;
    if (n) { n.className = 'why'; n.innerHTML = html; } else { const d = document.createElement('div'); d.className = 'why'; d.dataset.note = '1'; d.innerHTML = html; const r = box.querySelector('.row'); box.insertBefore(d, r); }
    st.miss = (st.miss || 0) + 1;
  }
  function pick(i, b) { const o = st.opts && st.opts[i]; if (!o) return; if (!o.ok) { if (o.act) o.act(b); else nope(b, o.hint || { de: 'Noch einmal!', ru: 'попробуй ещё раз' }); return; } if (b) b.classList.add('mk-ok'); o.go(); }
  // ---------- the talk, step by step
  function open() {
    if (!M) return; st = { step: 'greet', say: { de: 'Guten Tag! Was darf es sein?', ru: 'Добрый день! Что тебе дать?' },
      task: { de: 'Grüß Frau Berger.', ru: 'поздоровайся с продавщицей' },
      opts: shuffle([
        { de: 'Guten Tag, Frau Berger!', ru: 'добрый день, фрау Бергер!', ok: 1, go: () => { const v = load(); if (!v.greet) { v.greet = 1; save(v); addRuf('gruss'); } ensureList(load()); goods(); } },
        { de: 'Gute Nacht, Frau Berger!', ru: 'спокойной ночи, фрау Бергер!', hint: { de: '«Gute Nacht» sagt man vor dem Schlafen.', ru: '«Gute Nacht» говорят перед сном — днём «Guten Tag»' } },
        { de: 'Tschüss, Frau Berger!', ru: 'пока, фрау Бергер!', hint: { de: '«Tschüss» sagt man zum Abschied.', ru: '«Tschüss» — это «пока» при прощании' } }]) };
    render(); say(st.say.de);
  }
  function goods(note) {
    const v = load(), done = v.list && v.list.every(it => it.done);
    st = { step: 'goods', say: done ? { de: 'Noch etwas? Wir können üben.', ru: 'ещё что-нибудь? можно потренироваться' } : { de: 'Was möchtest du?', ru: 'что ты хочешь?' },
      task: { de: 'Tipp auf eine Ware.', ru: 'нажми на товар' } };
    render(note);
  }
  function ask(id) {
    const g = good(id); if (!g) return; const qv = Math.random() < 0.5 ? 'Was kostet' : 'Wie viel kostet';
    st = { step: 'ask', id, say: { de: 'Ja, bitte?', ru: 'да, пожалуйста?' }, task: { de: 'Frag nach dem Preis.', ru: 'спроси, сколько это стоит' },
      opts: shuffle([
        { html: `${qv} ${NOM[g.art]} ${g.sg}?`, ru: 'сколько стоит …?', ok: 1, go: () => priceStep(id) },
        { html: `${qv} ${NOM_X[g.art]} ${g.sg}?`, ru: 'сколько стоит …?', hint: { de: `${g.art} ${g.sg} → ${NOM[g.art]} ${g.sg}`, ru: `род: ${g.art} → ${NOM[g.art]}` } },
        { html: `Wo ist ${NOM[g.art]} ${g.sg}?`, ru: 'где …?', hint: { de: '«Wo?» fragt nach dem Ort.', ru: '«Wo?» — это «где?», а нужно спросить цену' } }]) };
    render(); say(st.say.de);
  }
  function priceStep(id) {
    const g = good(id), unit = priceFor(id), line = `${Cap(NOM[g.art])} ${g.sg} kostet ${money(unit)}.`;
    st = { step: 'price', id, unit, say: { de: line, ru: '' }, task: { de: 'Wie viel? Tipp die Zahl.', ru: 'сколько? выбери число' }, cls: 'num',
      opts: numOpts(unit).map(n => (n === unit ? { de: String(n), ok: 1, go: () => haggle(id, unit) } : { de: String(n), hint: { de: 'Hör noch einmal zu.', ru: 'послушай ещё раз (кнопка «Hören»)' } })) };
    render(); say(line);
  }
  function why(id) {
    const m = mood(id), p = pressure(id), v = load();
    if (v.hag[id]) return { de: 'Für dich schon billiger.', ru: 'для тебя уже со скидкой' };
    if (m < 0) return { de: 'Heute im Angebot!', ru: 'сегодня скидка' };
    if (m > 0) return { de: 'Heute ist es teurer.', ru: 'сегодня дороже обычного' };
    if (p > 0) return { de: 'Viele kaufen das gerade.', ru: 'это сейчас много покупают — цена подросла (скоро вернётся)' };
    return null;
  }
  function haggle(id, unit, note) {
    const g = good(id), w = why(id);
    st = { step: 'haggle', id, unit, say: w ? { de: `${w.de} ${Cap(money(unit))} pro Stück.`, ru: w.ru } : { de: `${Cap(money(unit))} pro Stück.`, ru: 'цена за штуку' },
      task: { de: 'Handeln? Aber höflich!', ru: 'можно поторговаться — но вежливо' },
      opts: shuffle([
        { de: 'Können Sie das billiger machen, bitte?', ru: 'вы не могли бы дешевле, пожалуйста? (Sie — вежливо)', ok: 1, go: () => polite(id) },
        { de: 'Kannst du das billiger machen?', ru: 'можешь дешевле? (du)', act: b => { if (!st.du) { st.du = 1; addRuf('du'); } fire('haggle', { id, r: 'du' });
          nope(b, { de: 'Wie bitte? Zu Erwachsenen sagt man «Sie»!', ru: 'незнакомым взрослым говорят «Sie», а не «du» — отношение испортилось' }); const r = box.querySelector('[data-ruf]'); if (r) r.outerHTML = head().match(/<div class="ruf"[\s\S]*<\/div>$/)[0]; } },
        { de: 'Gut, das nehme ich.', ru: 'хорошо, беру', ok: 1, go: () => qty(id, unit) }]) };
    render(note); if (!note) say(st.say.de);
  }
  function polite(id) {
    const v = load(), g = good(id), R = ruf(v); let r, n;
    if (R < 0) { r = 'ruf'; n = { de: 'Hm … nein. Heute nicht.', ru: 'продавщица ещё сердится (было «du»): скидки нет — со временем пройдёт' }; }
    else if (v.hag[id]) { r = 'again'; n = { de: 'Noch billiger? Heute nicht, tut mir leid.', ru: 'дважды за день на один товар скидку не дают' }; }
    else if (priceFor(id) <= M.price.floor) { r = 'floor'; n = { de: 'Billiger geht es nicht.', ru: 'дешевле уже нельзя' }; }
    else { v.hag[id] = 1; save(v); addRuf('hoeflich'); r = 'ok'; n = { de: `Na gut — für dich ${money(priceFor(id))}!`, ru: 'ладно — для тебя дешевле!', good: 1 }; }
    fire('haggle', { id, r }); say(n.de); qty(id, priceFor(id), n);
  }
  function qty(id, unit, note) {
    const g = good(id), v = load(), it = listItem(v, id), wrongQ = it ? (it.q === 1 ? 2 : it.q) : 2;
    const wrong = wrongQ === 1 ? `Ich nehme ${ACC_X[g.art]} ${g.sg}, bitte.` : `Ich nehme ${zahl(wrongQ)} ${g.sg}, bitte.`;
    const hint = g.pl === g.sg ? { de: 'Noch einmal!', ru: 'попробуй ещё раз' } : { de: `${zahl(wrongQ)} ${g.pl}`, ru: wrongQ === 1 ? `${g.art} → ${ACC[g.art]} (Akkusativ)` : 'после числа — множественное число' };
    const opts = [1, 2, 3].map(q => ({ html: `Ich nehme ${menge(g, q)}, bitte. <span class="p">= ${unit * q} ${COIN}</span>`, ok: 1,
      go: () => { if (it && q !== it.q) return nope(null, { de: `Mama: «${zahl(it.q)}»!`, ru: 'на мамином листке другое количество' }); pay(id, unit, q); } }));
    opts.push({ html: wrong, hint });
    st = { step: 'qty', id, unit, say: { de: 'Wie viele?', ru: 'сколько штук?' }, task: it ? { de: `Mamas Zettel: ${menge(g, it.q)}.`, ru: 'возьми столько, сколько на мамином листке' } : { de: 'Übung: Nimm so viele, wie du willst.', ru: 'тренировка: сколько хочешь (монеты не тратятся)' }, opts: shuffle(opts) };
    render(note); if (!note) say(st.say.de);
  }
  function pay(id, unit, q) {
    const v = load(), it = listItem(v, id), total = unit * q, own = it ? Math.max(0, total - (v.purse - v.spent)) : 0;
    st = { step: 'pay', id, unit, q, say: { de: `Das macht ${money(total)}.`, ru: it ? 'с тебя столько (из маминых денег)' : 'тренировка: монеты не тратятся' },
      task: own ? { de: `Das Einkaufsgeld reicht nicht. Du legst ${own === 1 ? 'eine Münze' : own + ' Münzen'} dazu.`, ru: 'маминых денег не хватает — добавишь свои или подожди, пока цена вернётся' } : { de: 'Gib ihr das Geld.', ru: 'отдай деньги' },
      opts: shuffle([
        { de: 'Bitte schön!', ru: 'пожалуйста! (когда даёшь)', ok: 1, go: () => paid(id, unit, q) },
        { de: 'Danke schön!', ru: 'спасибо!', hint: { de: '«Bitte schön» sagt man beim Geben.', ru: '«Bitte schön» — когда даёшь, «Danke» — когда получаешь' } }]) };
    render(); say(st.say.de);
  }
  function paid(id, unit, q) {
    const v = load(), g = good(id), it = listItem(v, id), total = unit * q;
    if (it) {
      const own = Math.max(0, total - (v.purse - v.spent));
      if (own && !(window.Eco && Eco.spend(own, 'Markt dazu'))) return nope(null, { de: 'Nicht genug Münzen. Warte — der Preis sinkt wieder.', ru: 'не хватает монет — подожди, цена вернётся' });
      v.spent += total - own; it.done = 1; fly(box.querySelector('[data-purse]') || box, box.querySelector('.say') || box, Math.min(6, total - own));
    }
    const cur = pressure(id, v); v.press[id] = { v: Math.min(M.price.pressure_max, cur + 1), t: Date.now() }; save(v);
    fire('buy', { id, q, total, list: !!it }); say(`Danke! ${q === 1 ? 'Hier ist ' + POSS[g.art] + ' ' + g.sg : 'Hier sind deine ' + g.pl}.`);
    const fin = it ? finish() : null;
    goods(fin || { de: it ? `${Cap(menge(g, q))} — gekauft!` : `${Cap(menge(g, q))} — gut geübt!`, ru: it ? 'куплено для мамы' : 'тренировка — монеты не тратятся', good: 1 });
  }
  function finish() {                                             // Mama's list done: the change once a day, capped (ANTIFARM)
    const v = load(); if (!v.list || !v.list.every(it => it.done) || v.paid != null) return null;
    const change = Math.max(0, v.purse - v.spent), pay = Math.min(change, M.antifarm.change_cap_day);
    const got = pay && window.Rewards ? Rewards.coins(pay, 'Wechselgeld Markt', 'markt') : 0;
    const v2 = load(); v2.paid = got; save(v2); addRuf('zettel'); fire('zettel', { done: 1, change, got });
    return { de: `Alles gekauft! Mama: «Danke! Den Rest darfst du behalten.» +${got}` + (change > got ? ` (${change - got} ${change - got === 1 ? 'bleibt' : 'bleiben'} bei Mama)` : ''), ru: 'всё куплено — мама разрешила оставить сдачу себе', good: 1 };
  }
  // ---------- UI juice (flag only): squash of buttons, coins fly (3 px steps), the counter pops; «Weniger Animation» -> only the number changes
  const rectOf = el => { const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null; return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 }; };
  const coinEl = () => document.getElementById('coins');
  function pop(el) { if (!el || less()) return; el.classList.remove('mk-pop'); void el.offsetWidth; el.classList.add('mk-pop'); }
  let flying = 0;
  function fly(from, to, n) {                                     // from/to: elements (null = the coin counter)
    const a = rectOf(from || coinEl()), b = rectOf(to || coinEl()); if (less() || !n) { pop(coinEl()); return 0; }
    n = Math.min(6, n); if (flying > 18) return 0;
    for (let i = 0; i < n; i++) {
      const im = document.createElement('img'); im.src = 'assets_v3/icon_coin.png'; im.className = 'mk-coin'; im.alt = ''; document.body.appendChild(im); flying++;
      const t0 = performance.now() + i * 70, dur = 420, dx = (i - n / 2) * 6;
      const f = now => { const k = Math.max(0, Math.min(1, (now - t0) / dur)), e = k * k * (3 - 2 * k);
        const x = Math.round((a.x + dx * (1 - k) + (b.x - a.x) * e - 9) / 3) * 3, y = Math.round((a.y + (b.y - a.y) * e - 70 * Math.sin(Math.PI * k) - 9) / 3) * 3;
        im.style.transform = `translate(${x}px,${y}px)`; im.style.left = '0'; im.style.top = '0'; im.style.opacity = now < t0 ? '0' : '1';
        if (k < 1) requestAnimationFrame(f); else { im.remove(); flying--; if (!to) pop(coinEl()); } };
      requestAnimationFrame(f);
    }
    return n;
  }
  addEventListener('ds:eco', e => { const d = e.detail || {}; if (!d.n) return; const src = box.style.display === 'flex' ? box : null;
    if (d.t === 'earn') fly(src, null, d.n); else if (d.t === 'spend') fly(null, src, d.n); });
  document.addEventListener('pointerdown', e => { const b = e.target && e.target.closest && e.target.closest('.ui-btn'); if (!b || less()) return; b.classList.remove('mk-press'); void b.offsetWidth; b.classList.add('mk-press'); }, true);
  document.addEventListener('animationend', e => { const c = e.target && e.target.classList; if (c && (e.animationName === 'mkPress' || e.animationName === 'mkNo' || e.animationName === 'mkPop')) c.remove('mk-press', 'mk-no', 'mk-pop'); }, true);
  // ---------- hook into the game (Yard events only)
  window.Markt = {
    ready, on: true, cfg: () => M, price, priceFor, mood, pressure: id => pressure(id), list: () => (load().list || []).slice(), purse: () => { const v = load(); return v.purse - v.spent; },
    state: () => load(), reach, visible: () => !!(objs && objs.stall && objs.stall.scene), ruf: () => ruf(), level: () => level(), reasons, open: () => ready.then(open), close, tap, step: () => st.step, objects: () => objs, zahl, money, flying: () => flying,
    _reset() { try { localStorage.removeItem(LK); } catch (e) {} },
    _age(id, min) { const v = load(); Object.keys(v.press).forEach(k => { if (!id || k === id) v.press[k].t -= min * 60000; }); save(v); },
    _rufAge(days) { const v = load(); v.ruf.forEach(m => { m.t -= days * 86400000; }); save(v); }
  };
  (function hook() {
    const ui = document.getElementById('ui'), g = window.game;
    if (!ui || !g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 80);
    ui.appendChild(box);
    const y = g.scene.getScene('Yard');
    if (y) {
      y.events.on('create', () => { close(); ready.then(() => { if (y.sys.isActive()) setup(y); }); });
      y.events.on('shutdown', () => { close(); objs = null; if (talkEv) { talkEv.remove(); talkEv = null; } });
      if (y.sys.isActive() && y.textures.exists('town_bg')) ready.then(() => setup(y));   // Yard already running (late script)
    }
  })();
})();
