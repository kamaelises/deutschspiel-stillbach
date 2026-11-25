// Код (задания) 24.11 — das Schwarze Brett (доска гильдии) и задания жителей. Слово автора: «задания от жителей, NPC, сюжетных персонажей
// и брать задание от гильдии там, где табличка». Шаблоны — assets_v3/world/quests.json; счёт и трекер — quests.js (Quests).
// Доска: на площади у das Gildenhaus (слева от ступеней, табличка der/die/das в цвете рода + RU мелко) и внутри (Ort buergeramt — нарисованная доска слева).
// Каждый день 3 задания (seed = дата; WorldTime.now().date, иначе часы устройства / ds_proto.debugDate): 1 сезонное + разные виды (огород, рыбалка,
// Keller, материалы, разговор, находка для альбома); в день праздника (WorldTime festivals) — ещё одно праздничное, только в этот день.
// Жители (Welt: Bauer Jonas, Frau Weber, Herr Taras) — бытовые задания, раз в день; сюжетные (Herr Schmidt у дома героя, Frau Becker в Gildenhaus,
// Frau Schulz в пекарне) — цепочки 2–3 шага, шаг открывается, когда глава пройдена (ds_proto.app chapters: done >= total).
// «!» над тем, у кого есть задание; «✓» — можно сдать. Сдача — у того, кто дал, или у доски. Награда: монеты + опыт; без потерь.
// API: Board.open('board'|npcId), Board.close(), Board.take(i), Board.turnIn(qid), Board.offers(), Board.npcState(id), Board.interact(sc, id), Board.today().
(function () {
  const COL = { der: '#3a7be0', die: '#e24848', das: '#2f9a4f' }, BASE = 'assets_v3/';
  const BOARD_OUT = { x: 1536, y: 612, stand: [1614, 626] };        // ноги столбов доски на площади Gildenhaus (дверь [1668,594]): слева от ступеней, над колодцем;
                                                                     // справа площадь занимают ёлка/фонари праздников (time_fx.js PLACE), туда не ставим
  const BOARD_IN = { box: [68, 228, 188, 372], stand: [140, 400] }; // нарисованная доска в интерьере buergeramt.png (слева), где встаёт Max
  let Q = null;
  const ready = fetch(BASE + 'world/quests.json').then(r => r.json()).then(j => (Q = j)).catch(e => { console.warn('Board', e); return null; });
  const SKEY = 'ds_proto.board', NKEY = 'ds_proto.npcq';
  const ld = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }, sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const WT = () => (window.WorldTime && typeof WorldTime.now === 'function' ? WorldTime : null);
  const pad = n => String(n).padStart(2, '0');
  function nowDate() {
    const W = WT(); if (W) { try { return new Date(W.now().date); } catch (e) {} }
    let s = null; try { s = localStorage.getItem('ds_proto.debugDate'); } catch (e) {}   // тот же ключ, что у WorldTime.setDebug
    if (s) { const d = new Date(/^\d{4}-\d\d-\d\d$/.test(s) ? s + 'T12:00' : s); if (!isNaN(d)) return d; }
    return new Date();
  }
  const today = () => { const d = nowDate(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  function season() { const W = WT(); if (W) { try { return W.now().season; } catch (e) {} } const m = nowDate().getMonth() + 1; return m >= 3 && m <= 5 ? 'fruehling' : m <= 8 && m >= 6 ? 'sommer' : m >= 9 && m <= 11 ? 'herbst' : 'winter'; }
  function fests() { const W = WT(); if (!W) return []; try { return W.now().festivals || []; } catch (e) { return []; } }
  const chapters = () => { try { return window.DSMode ? DSMode.chapters() : JSON.parse(localStorage.getItem('ds_proto.app')).chapters || []; } catch (e) { return []; } };   // Три режима: DSMode (mode.js)
  function passed(n) { if (!n) return true; const c = chapters().find(c => +c.n === +n); if (c && c.total > 0 && c.done >= c.total) return true; return +n === 1 && typeof state !== 'undefined' && !!state.done; }
  function reach() { const started = chapters().filter(c => c.done > 0).map(c => +c.n); return Math.max(typeof state !== 'undefined' && state.done ? 2 : 1, started.length ? Math.max(...started) + 1 : 1); }   // как town.js
  const boardOpen = () => reach() >= 2;                              // das Gildenhaus открыто с главы 2 (town.js HOUSES)
  function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const Qs = () => window.Quests;

  // ---------- доска: 3 задания в день + праздник
  function gen(day) {
    const R = rng(hash('board' + day)), out = [], grp = new Set();
    const S = ((Q.season || {})[season()] || []).filter(t => passed(t.chapter));
    if (S.length) { const t = S[Math.floor(R() * S.length)]; out.push(t); grp.add(t.grp); }
    const pool = Q.board.templates.filter(t => passed(t.chapter));
    while (out.length < (Q.board.per_day || 3) && pool.length) { const t = pool.splice(Math.floor(R() * pool.length), 1)[0]; if (grp.has(t.grp)) continue; grp.add(t.grp); out.push(t); }
    return out.map(t => ({ qid: 'b_' + day + '_' + t.id, t }));
  }
  function festOffer(day) {
    const on = fests(); if (!on.length || !Q.festivals) return null;
    for (const f of Q.festivals.list || []) {
      if (!on.includes(f.fest)) continue;
      let de = f.de, ru = f.ru;
      if (f.cal) { const c = WT() && WorldTime.festival ? WorldTime.festival(f.fest) : null; if (!c || !c.quest) continue; de = c.quest.de; ru = c.quest.ru; }
      const c = WT() && WorldTime.festival ? WorldTime.festival(f.fest) : null;
      return { qid: 'f_' + day + '_' + f.fest, fest: f.fest, festDe: c ? c.de : f.fest, t: Object.assign({}, f, { id: f.fest, de, ru }) };
    }
    return null;
  }
  function expire(day) { const A = Qs() ? Qs().list() : []; A.forEach(q => { if (q.fest && q.day && q.day !== day) Qs().drop(q.id); }); }   // праздник прошёл — задание уходит без потерь
  function ensureDay() {
    if (!Q || !Qs()) return null; const day = today(); let st = ld(SKEY, {});
    expire(day);
    if (st.day !== day || !Array.isArray(st.offers)) { st = { day, offers: gen(day) }; sv(SKEY, st); }
    if (!st.offers.some(o => o.fest)) { const f = festOffer(day); if (f) { st.offers.push(f); sv(SKEY, st); } }
    return st;
  }
  function toQuest(t, qid, giver, giverDe, extra) {
    return Object.assign({ id: qid, title_de: t.title || t.de, title_ru: t.ru, kind: t.kind, sec: t.sec, item: t.item, mat: t.mat, npc: t.npc, distinct: t.distinct,
      need: t.need || 1, count: 0, reward: (t.rw || {}).c || 10, xp: (t.rw || {}).xp || 0, giver, giver_de: giverDe }, extra || {});
  }
  function offers() { const st = ensureDay(); if (!st) return []; const F = Qs().finished(); return st.offers.map(o => Object.assign({}, o, { taken: !!Qs().get(o.qid), done: F.includes(o.qid) })); }
  function take(i) {
    const st = ensureDay(); const o = st && st.offers[i]; if (!o) return false;
    const ok = Qs().add(toQuest(o.t, o.qid, 'board', 'das Schwarze Brett', o.fest ? { fest: o.fest, day: st.day } : null));
    if (ok && window.speakDE) speakDE(o.t.de); if (W.mode === 'board') view(); return ok;
  }
  function boardState() {
    if (!Q || !Qs() || !boardOpen()) return null;
    if (Qs().list().some(q => q.giver === 'board' && Qs().ready(q.id))) return 'ready';
    return offers().some(o => !o.taken && !o.done) ? 'offer' : null;
  }

  // ---------- жители и сюжетные персонажи
  const NPC = () => (Q && Q.npcs) || {};
  const idByName = name => Object.keys(NPC()).find(k => NPC()[k].name === name) || null;
  function npcOffer(id) {
    const n = NPC()[id]; if (!n || !Qs()) return null; const st = ld(NKEY, { chain: {}, rep: {} }); st.chain = st.chain || {}; st.rep = st.rep || {};
    if (Qs().list().some(q => q.giver === id)) return null;           // у жителя одно задание за раз
    if (n.chain) { const k = st.chain[id] || 0, s = n.chain[k]; if (s) return passed(s.chapter) ? { qid: 'c_' + id + '_' + k, t: s, step: k } : null; }
    if (n.repeat) {
      if (n.after && !Qs().finished().includes(n.after)) return null;
      const day = today(); if (st.rep[id] === day) return null;
      return { qid: 'r_' + id + '_' + day, t: n.repeat[hash(id + day) % n.repeat.length], rep: true };
    }
    return null;
  }
  const npcReady = id => (Qs() ? Qs().list().find(q => q.giver === id && Qs().ready(q.id)) : null) || null;
  function npcState(id) { if (!Q) return null; return npcReady(id) ? 'ready' : npcOffer(id) ? 'offer' : null; }
  function accept(id) {
    const n = NPC()[id], off = npcOffer(id); if (!off) return false;
    const ok = Qs().add(toQuest(off.t, off.qid, id, n.name, { title_de: off.t.title || off.t.de, title_ru: off.t.title ? 'задание: ' + n.ru : off.t.ru }));
    if (ok && off.rep) { const st = ld(NKEY, { chain: {}, rep: {} }); st.rep = st.rep || {}; st.rep[id] = today(); sv(NKEY, st); }
    return ok;
  }
  function thanksOf(q) {
    const m = /^c_(\w+)_(\d+)$/.exec(q.id), n = m && NPC()[m[1]], s = n && n.chain && n.chain[+m[2]];
    return s && s.thanks ? s.thanks : { de: 'Danke schön!', ru: 'большое спасибо!' };
  }
  function onDone(q) {                                               // цепочка: следующий шаг; задание с доски — засчитать «сдай задание с доски»
    const m = /^c_(\w+)_(\d+)$/.exec(q.id);
    if (m) { const st = ld(NKEY, { chain: {}, rep: {} }); st.chain = st.chain || {}; st.chain[m[1]] = Math.max(st.chain[m[1]] || 0, +m[2] + 1); sv(NKEY, st); }
    if (q.giver === 'board' && q.kind !== 'board' && Qs()) setTimeout(() => Qs().boardDone(), 0);
  }
  function turnIn(qid) {
    const q = Qs().get(qid); if (!q) return false; const got = Qs().turnIn(qid); if (!got) return false;
    if (window.toast) toast(`Danke! +${got.coins} Münzen${got.xp ? ' · +' + got.xp + ' XP' : ''}`, 1800);
    if (window.speakDE) speakDE(thanksOf(q).de);
    return Object.assign({ q }, got);
  }

  // ---------- окно (доска / разговор) — вверху экрана, не закрывает Max
  const css = document.createElement('style');
  css.textContent = `
    #qWin{position:absolute;left:12px;right:12px;top:58px;display:none;flex-direction:column;gap:5px;padding:8px 12px 10px;color:#2e1e12;z-index:71;max-height:468px;overflow:auto;font-family:Roboto,'Segoe UI',system-ui,sans-serif}
    #qWin .hd{display:flex;align-items:center;gap:10px}#qWin .hd .t{flex:1;font-size:24px;font-weight:800;line-height:1.05}
    #qWin .ru{display:block;font-size:13px;font-weight:400;color:#6b4a2e;line-height:1.15}
    #qWin .row{display:flex;align-items:center;gap:10px;background:rgba(255,248,230,.55);border:2px solid #c9a877;border-radius:6px;padding:3px 8px;min-height:52px}
    #qWin .row.fest{border-color:#e0a400;background:rgba(255,232,160,.72)}#qWin .row.rd{border-color:#5f9a3a;background:rgba(214,240,190,.75)}
    #qWin .row .tx{flex:1;min-width:0}#qWin .row .de{font-size:19px;font-weight:700;line-height:1.1}
    #qWin .row .rw{font-size:12px;color:#7a4f12;font-weight:600}#qWin .row .st{font-size:15px;font-weight:700;color:#5f7a3a;white-space:nowrap}
    #qWin .ui-btn{font-family:inherit;color:#2e1e12;height:auto;min-height:48px;padding:2px 14px;font-size:19px;line-height:1.05;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:0 0 auto}
    #qWin .say{font-size:22px;font-weight:700;line-height:1.2;padding:2px 2px 0}#qWin .btns{display:flex;gap:8px;justify-content:flex-end}
    #qWin img.pt{width:64px;height:64px;image-rendering:pixelated;border:2px solid #3b2314;border-radius:4px;background:#e8d3a8}
    #qWin .tag{display:inline-block;font-size:12px;font-weight:800;color:#fff;background:#c98a00;border-radius:3px;padding:0 4px;margin-right:4px;vertical-align:middle}`;
  document.head.appendChild(css);
  const W = { el: null, mode: null, sc: null, was: {} };
  const HUD = ['bag', 'bFurn', 'bMap'];
  const art = de => { const [a, ...w] = String(de).split(' '); return COL[a] ? `<b style="color:${COL[a]}">${a}</b> ${w.join(' ')}` : de; };
  const rwTxt = t => { const c = (t.rw || {}).c || t.reward || 0, x = (t.rw || {}).xp || t.xp || 0; return `+${c} Münzen${x ? ' · +' + x + ' XP' : ''}<span class="ru" style="display:inline"> · +${c} монет${x ? ' · +' + x + ' опыта' : ''}</span>`; };
  function el() {
    if (W.el) return W.el; const e = W.el = document.createElement('div'); e.id = 'qWin'; e.className = 'ui ui-panel-paper';
    e.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return; ev.stopPropagation();
      if (b.dataset.x) return close();
      if (b.dataset.alltag) { close(); return window.Alltag && Alltag.open(); }   // Задания в жизни 25.11: текущее задание из приложения
      if (b.dataset.take != null) return take(+b.dataset.take);
      if (b.dataset.turn) { turnIn(b.dataset.turn); return view(); }
      if (b.dataset.acc) { accept(W.mode); const q = Qs().list().find(x => x.giver === W.mode); if (q && window.speakDE) speakDE(q.title_de); return close(); }
    });
    ['pointerdown', 'pointerup', 'touchstart'].forEach(t => e.addEventListener(t, ev => ev.stopPropagation()));
    const ui = document.getElementById('ui'); (ui || document.body).appendChild(e); return e;
  }
  function activeScene() { const g = window.game; return g && g.scene ? g.scene.getScenes(true)[0] : null; }
  function show(html) {
    const e = el(); e.innerHTML = html; e.style.display = 'flex';
    HUD.forEach(k => { const h = document.getElementById(k); if (h && W.was[k] === undefined) { W.was[k] = h.style.display; h.style.display = 'none'; } });
    W.sc = activeScene(); if (W.sc) W.sc.busy = true;
  }
  function close() {
    if (W.el) W.el.style.display = 'none';
    HUD.forEach(k => { const h = document.getElementById(k); if (h && W.was[k] !== undefined) h.style.display = W.was[k]; }); W.was = {};
    if (W.sc) W.sc.busy = false; W.sc = null; W.mode = null;
  }
  function view() {
    if (W.mode === 'board') {
      const st = ensureDay(); if (!st) return;
      const rd = Qs().list().filter(q => q.giver && Qs().ready(q.id));
      const rows = rd.map(q => `<div class="row rd"><div class="tx"><div class="de">✓ ${q.title_de}</div><div class="rw">${q.giver === 'board' ? 'fertig! · готово' : 'von ' + q.giver_de + ' · можно сдать здесь'} · ${rwTxt(q)}</div></div><button class="ui ui-btn" data-turn="${q.id}">Abgeben<span class="ru">сдать</span></button></div>`)
        .concat(offers().filter(o => !rd.some(q => q.id === o.qid)).map(o => {
          const i = st.offers.findIndex(x => x.qid === o.qid), act = o.taken ? Qs().get(o.qid) : null;
          const btn = o.done ? '<span class="st">✓ erledigt</span>' : act ? `<span class="st">${act.count}/${act.need} · läuft</span>` : `<button class="ui ui-btn" data-take="${i}">Nehmen<span class="ru">взять</span></button>`;
          return `<div class="row${o.fest ? ' fest' : ''}"><div class="tx"><div class="de">${o.fest ? '<span class="tag">' + (o.festDe || 'Fest') + '</span>' : ''}${o.t.de} <span style="color:#9b6a2e">×${o.t.need}</span></div><div class="ru">${o.t.ru}</div><div class="rw">${rwTxt(o.t)}</div></div>${btn}</div>`;
        }));
      show(`<div class="hd"><div class="t">${art('das Schwarze Brett')}<span class="ru">доска заданий гильдии · 3 задания в день · сдать можно здесь</span></div><button class="ui ui-btn" data-x="1">Zurück<span class="ru">назад</span></button></div>${window.Alltag ? Alltag.boardRow() : ''}${rows.join('')}`);
      return;
    }
    const id = W.mode, n = NPC()[id]; if (!n) return close();
    const pu = window.Portraits && (Portraits.get(n.name) || Portraits.get(n.portrait)), pt = pu ? `<img class="pt" src="${pu}" alt="">` : n.portrait ? `<img class="pt" src="${BASE}portraits/${n.portrait}.png" alt="">` : '';   // Полировка (портреты) 24.11
    const hd = `<div class="hd">${pt}<div class="t">${n.name}<span class="ru">${n.ru}</span></div></div>`;
    if (W.thanks) { const t = W.thanks; W.thanks = null; return show(`${hd}<div class="say">${t.de}<span class="ru">${t.ru}</span></div><div class="rw" style="font-size:16px;font-weight:700;color:#7a4f12">+${t.coins} Münzen${t.xp ? ' · +' + t.xp + ' XP' : ''} <span class="ru" style="display:inline">· награда</span></div><div class="btns"><button class="ui ui-btn" data-x="1">Weiter<span class="ru">дальше</span></button></div>`); }
    const off = npcOffer(id); if (!off) return close();
    show(`${hd}<div class="say">${off.t.de}<span class="ru">${off.t.ru}</span></div><div class="rw">${off.t.title ? off.t.title + ' · ' : ''}×${off.t.need} · ${rwTxt(off.t)}</div>
      <div class="btns"><button class="ui ui-btn" data-acc="1">Ja, gern!<span class="ru">да, с радостью</span></button><button class="ui ui-btn" data-x="1">Später<span class="ru">потом</span></button></div>`);
    if (window.speakDE) speakDE(off.t.de);
  }
  function open(mode) {
    if (!Q || !Qs()) return false;
    if (mode === 'board') { if (!boardOpen()) { if (window.toast) toast('das Schwarze Brett: ' + (window.DSMode ? DSMode.lock(2).de : 'ab Kapitel 2'), 1800); return false; } W.mode = 'board'; if (window.speakDE) speakDE('das Schwarze Brett'); view(); return true; }
    return interact(activeScene(), mode);
  }
  function interact(sc, id) {                                         // житель: сдать готовое или предложить новое; нет ни того, ни другого -> false (обычная реплика)
    if (!Q || !Qs() || !NPC()[id]) return false;
    Qs().talk(id);
    const r = npcReady(id);
    if (r) { const got = turnIn(r.id); if (!got) return false; W.mode = id; W.thanks = Object.assign({}, thanksOf(r), got); view(); return true; }
    if (!npcOffer(id)) return false;
    W.mode = id; view(); return true;
  }

  // ---------- мир: «!» над тем, у кого задание; доска на площади и в Gildenhaus
  function marker(sc, x, y, getState, onTap, cap) {
    const c = cap ? sc.add.text(x, y + 2, cap, { fontFamily: 'Roboto, sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#fff7e0', stroke: '#3b2314', strokeThickness: 5 }).setOrigin(0.5, 1).setDepth(7500) : null;   // кто даёт (если его не видно на карте)
    if (c) y -= c.height - 2;
    const t = sc.add.text(x, y, '!', { fontFamily: 'Roboto, sans-serif', fontSize: '34px', fontStyle: 'bold', color: '#ffd23f', stroke: '#3b2314', strokeThickness: 7 }).setOrigin(0.5, 1).setDepth(7500);
    t.qmark = true; t.setInteractive({ useHandCursor: true }).on('pointerup', () => { if (sc.__dragged || sc.busy || sc.talking) return; onTap(); });
    sc.tweens.add({ targets: t, y: y - 8, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const upd = () => { if (!t.active) return; const s = getState(); t.setVisible(!!s); if (c) c.setVisible(!!s); if (t.input) t.input.enabled = !!s; if (s) { t.setText(s === 'ready' ? '✓' : '!'); t.setColor(s === 'ready' ? '#8fdc5c' : '#ffd23f'); } t.qstate = s; };
    upd(); sc.time.addEvent({ delay: 400, loop: true, callback: upd }); (sc.__qMarks = sc.__qMarks || []).push(t); return t;
  }
  function label(sc, x, yb, de, sub, fs) {                            // вывеска: der/die/das в цвете рода + слово, под ней мелко по-русски
    const [a, ...w] = de.split(' '), st = { fontFamily: 'Roboto, sans-serif', fontStyle: 'bold', stroke: '#3b2314' };
    const t2 = sc.add.text(x, yb, sub, { ...st, fontSize: Math.round(fs * 0.62) + 'px', fontStyle: 'normal', color: '#f3e3c3', strokeThickness: 4 }).setOrigin(0.5, 1).setDepth(6000);
    const ta = sc.add.text(0, 0, a + ' ', { ...st, fontSize: fs + 'px', color: COL[a] || '#fff7e0', strokeThickness: 6 }).setOrigin(0, 1).setDepth(6001);
    const tw = sc.add.text(0, 0, w.join(' '), { ...st, fontSize: fs + 'px', color: '#fff7e0', strokeThickness: 6 }).setOrigin(0, 1).setDepth(6000);
    const x0 = x - (ta.width + tw.width) / 2, y1 = yb - t2.height + 4; ta.setPosition(x0, y1); tw.setPosition(x0 + ta.width, y1);
    [ta, tw, t2].forEach(t => { t.qsign = de; }); return { top: y1 - ta.height, parts: [ta, tw, t2] };
  }
  const go = (sc, x, y, fn) => { if (window.walkToScene && window.walkToScene(sc, x, y, fn)) return; fn(); };
  function setupYard(sc) {
    const T = sc.townMask; if (!T) return;
    const draw = () => {
      if (!sc.sys || !sc.sys.isActive()) return;
      const B = BOARD_OUT, img = sc.add.image(B.x - 57, B.y, 'q_board').setOrigin(0, 1).setScale(3).setDepth(B.y); img.qboard = 'out';   // 38x34 px x3, левый край на сетке x3
      const c = T.cell; for (let r = Math.floor((B.y - 15) / c); r <= Math.floor((B.y - 1) / c); r++) { const row = T.mask[r]; if (!row) continue;   // столбы непроходимы
        const q0 = Math.floor((B.x - 57) / c), q1 = Math.floor((B.x + 56) / c); T.mask[r] = row.slice(0, q0) + '0'.repeat(q1 - q0 + 1) + row.slice(q1 + 1); }
      const L = label(sc, B.x, B.y - 102 - 2, 'das Schwarze Brett', 'доска заданий гильдии', 18);
      const tap = () => go(sc, B.stand[0], B.stand[1], () => open('board'));
      img.setInteractive({ useHandCursor: true }).on('pointerup', () => { if (sc.__dragged || sc.busy) return; if (window.speakDE) speakDE('das Schwarze Brett'); tap(); });
      marker(sc, B.x, L.top - 2, boardState, tap).qfor = 'board';
      const H = sc.lay && sc.lay.house, dx = H ? H[0] + 96 : null;                         // Herr Schmidt — у двери дома героя (Yard.enter: дверь = house + 96)
      if (H) marker(sc, dx, H[1] - 84, () => npcState('schmidt'), () => go(sc, dx, H[1] + 24, () => interact(sc, 'schmidt')), 'Herr Schmidt').qfor = 'schmidt';   // над дверью, с именем
    };
    sc.time.delayedCall(0, () => { if (sc.textures.exists('q_board')) draw(); else { sc.load.image('q_board', BASE + 'world/board.png'); sc.load.once('complete', draw); sc.load.start(); } });
  }
  const PLACE_NPC = { buergeramt: 'becker', baeckerei: 'schulz' };
  const MARK_AT = { buergeramt: [36, -8], baeckerei: [0, -58] };   // «!» от центра служащего (ORTE.npc): в Gildenhaus справа от головы, не на флаге
  function setupOrt(sc) {
    const key = sc.placeKey, o = window.ORTE && ORTE[key], who = PLACE_NPC[key]; if (!o) return;
    sc.time.addEvent({ delay: 300, loop: true, callback: () => { if (sc.talking && !sc.__qTalked && who) { sc.__qTalked = true; if (Qs()) Qs().talk(who); } } });   // разговор в месте = «Sprich mit …»
    const ma = MARK_AT[key] || [0, -58];
    if (who) marker(sc, o.npc[0] + ma[0], o.npc[1] + ma[1], () => npcState(who), () => interact(sc, who)).qfor = who;
    if (key === 'buergeramt') {
      const [x0, y0, x1, y1] = BOARD_IN.box, cx = (x0 + x1) / 2, L = label(sc, cx, y0 - 2, 'das Schwarze Brett', 'доска заданий', 15);
      const z = sc.add.zone(cx, (y0 + y1) / 2, x1 - x0, y1 - y0).setInteractive({ useHandCursor: true }); z.qboard = 'in';
      const tap = () => go(sc, BOARD_IN.stand[0], BOARD_IN.stand[1], () => open('board'));
      z.on('pointerup', () => { if (sc.__dragged || sc.busy || sc.talking) return; if (window.speakDE) speakDE('das Schwarze Brett'); tap(); });
      marker(sc, cx, L.top - 2, boardState, tap).qfor = 'board';
    }
  }
  function setupWelt(sc) {
    const S = window.WELT && WELT.SC, N = sc.world && sc.world.npcs; if (!S || !N) return; const seen = {};
    N.forEach((n, i) => {
      const id = idByName(n.name); if (!id || seen[id] !== undefined) return; seen[id] = i;
      const x = Math.round((n.x + n.w / 2) * S), y = Math.round(n.y * S) - 4;
      marker(sc, x, y, () => (sc.bubble ? null : npcState(id)), () => go(sc, x, Math.round((n.y + n.h) * S) + 18, () => sc.say(i))).qfor = id;
    });
  }
  function wrapWelt() {
    const Wc = window.Welt; if (!Wc || !Wc.prototype.say || Wc.prototype.say.__q) return;
    const orig = Wc.prototype.say;
    const say = function (i) {
      const n = this.world && this.world.npcs[i], id = n && idByName(n.name);
      if (id) { const first = this.world.npcs.findIndex(m => m.name === n.name) === i; if (first && interact(this, id)) return; if (Qs()) Qs().talk(id); }
      return orig.call(this, i);
    };
    say.__q = true; Wc.prototype.say = say;
  }
  (function hook() {
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length || !window.Quests) return setTimeout(hook, 50);
    wrapWelt(); Quests.onDone(onDone);
    const on = (key, fn) => {                                        // сцена та же при повторном входе — старые «!» не тянем
      const s = g.scene.getScene(key); if (!s) return;
      s.events.on('create', () => { s.__qMarks = []; ready.then(() => fn(s)); });
      s.events.on('shutdown', () => { s.__qMarks = []; if (W.sc === s) close(); });
      if (s.sys.isActive()) ready.then(() => fn(s));
    };
    on('Yard', setupYard); on('Ort', setupOrt); on('Welt', setupWelt);
  })();
  window.Board = { ready, open, close, take, turnIn, offers, npcState, npcOffer, interact, accept, today, ensureDay, boardState, BOARD_OUT, BOARD_IN, data: () => Q, view: () => W };
})();
