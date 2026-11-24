// Код (наставник/друг) 24.11 — die Mentorin: Frau Becker (учительница курса, «мастер гильдии» — content/world.json, quests.json npcs.becker).
// Где: das Gildenhaus (Ort buergeramt) — служащая за столом = Frau Becker (как в board.js), «?» слева над столом (зона MENTOR_IN), и кнопка-портрет в верхней плашке HUD (#bMentor, рядом с System).
// Что: «Was jetzt?» — следующий урок по прогрессу приложения (ds_proto.app), задания (Quests/Board), повтор, очки навыков (Skills);
// «Warum?» — грамматика текущей главы ТОЛЬКО из данных уроков (assets_v3/world/mentor_data.json <- style_pick/mentor/build_mf.py из content/chNN:
// why.text + примеры + вопросы «почему» из quiz.json); «Wiederholen» — слова из «Повтора» (ds_proto.review): артикль der/die/das + перевод.
// Без ИИ работает полностью. С ИИ (тот же прокси /ollama и модель, что app/src/core/ai.js: gemma4:12b, keep_alive 30m, think:false; облака здесь нет —
// облачные ключи не копируем) — короткий ответ на «почему?» по-русски; немецкие примеры в ответе обязаны быть из карточек урока, иначе ответ не показывается.
// Звёзды не тратятся, ошибка в тренировке ничего не отнимает. API: Mentor.open(tab), Mentor.close(), Mentor.next(), Mentor.why(), MF (общее для friend.js).
(function () {
  const COL = { der: '#3a7be0', die: '#e24848', das: '#2f9a4f' }, BASE = 'assets_v3/';
  const PTB = () => (window.Portraits && Portraits.get('becker')) || BASE + 'portraits/becker.png';   // Полировка (портреты) 24.11: портрет из portraits.js
  const MENTOR_IN = { box: [400, 222, 525, 302], at: [462, 300], stand: [470, 430] };   // buergeramt.png: Frau Becker = служащая за столом (как в board.js PLACE_NPC/квестах);
                                                                     // «?» наставницы — слева над столом («!» заданий — справа от головы), Max встаёт перед столом
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const artC = s => esc(s).replace(/\b(der|die|das)\b(?=\s+[A-ZÄÖÜ])/g, (m, a) => `<b style="color:${COL[a]}">${a}</b>`);   // артикль перед существительным — в цвете рода
  const ld = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  // ---------- данные уроков и прогресс (общее с friend.js)
  let D = null, NOUNS = null;
  const data = fetch(BASE + 'world/mentor_data.json').then(r => r.json()).then(j => (D = j)).catch(e => { console.warn('Mentor data', e); return null; });
  const nouns = () => NOUNS ? Promise.resolve(NOUNS) : fetch(BASE + 'enemies/nouns.json').then(r => r.json()).then(j => (NOUNS = j)).catch(() => (NOUNS = { chapters: {} }));
  const appCh = () => { const a = ld('ds_proto.app', {}); return (a && a.chapters) || []; };
  const chNums = () => (D ? Object.keys(D.chapters).map(Number).sort((a, b) => a - b) : []);
  function chState(n) { const c = appCh().find(x => +x.n === n), L = D.chapters[n] || []; return { done: Math.min(L.length, c ? +c.done || 0 : 0), total: (c && +c.total) || L.length, title: c && c.title }; }
  function nextLesson() {                                            // первый урок, который ещё не пройден (главы по порядку)
    if (!D) return null;
    for (const n of chNums()) { const s = chState(n), L = D.chapters[n]; if (s.done < Math.min(s.total, L.length)) return { n, i: s.done, num: s.done + 1, total: s.total, les: L[s.done], title: s.title }; }
    return { n: 0, all: true };
  }
  function passedLessons() { const out = []; if (!D) return out; chNums().forEach(n => { const s = chState(n); D.chapters[n].slice(0, s.done).forEach((les, i) => out.push({ n, i, les })); }); return out; }
  function knownWords() {                                            // слова пройденных уроков (ничего не пройдено — первый урок главы 1)
    const P = passedLessons(), set = new Set(); (P.length ? P : D ? [{ les: D.chapters[1][0] }] : []).forEach(p => (p.les.words || []).forEach(w => set.add(w)));
    return set;
  }
  function curChapter() { const nl = nextLesson(); if (!nl) return null; if (nl.all) { const ns = chNums(); return { n: ns[ns.length - 1], upto: D.chapters[ns[ns.length - 1]].length - 1 }; } return { n: nl.n, upto: nl.i }; }
  const reviewList = () => { const r = ld('ds_proto.review', []); return Array.isArray(r) ? r : []; };
  function hero() {                                                  // уровень и возраст героя: правило system.js (главы 1–8 = A1.1, 9–16 = A1.2); A1 — ребёнок (AR 14, 23.11), A2 — подросток (GD §2)
    const full = appCh().filter(c => +c.total > 0 && +c.done >= +c.total).length, level = full < 8 ? 'A1.1' : full < 16 ? 'A1.2' : 'A2.1', child = /^A1/.test(level);
    return { name: 'Max', level, child, age_ru: child ? 'ребёнок' : 'подросток' };
  }

  // ---------- ИИ: тот же путь, что app/src/core/ai.js (route pc|off), без облака
  const AI = { MODEL: 'gemma4:12b', KEEP: '30m', st: null, at: 0, warming: null };
  const tmo = (ms, run) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); return run(c.signal).finally(() => clearTimeout(t)); };
  AI.status = function (force) {
    if (!force && AI.st && Date.now() - AI.at < 30000) return Promise.resolve(AI.st);
    if (window.__mfAiOff) return Promise.resolve(AI.st = { route: 'off', ollama: false, lt: false });
    const o = { route: 'off', ollama: false, lt: false };
    return Promise.all([
      tmo(4000, s => fetch('/ollama/api/tags', { signal: s, cache: 'no-store' })).then(async r => { if (r.ok) { const j = await r.json(); o.ollama = (j.models || []).some(m => m.name === AI.MODEL || m.model === AI.MODEL); } }).catch(() => {}),
      tmo(4000, s => fetch('/lt/v2/languages', { signal: s, cache: 'no-store' })).then(r => { o.lt = r.ok; }).catch(() => {}),
    ]).then(() => { o.route = o.ollama ? 'pc' : 'off'; AI.st = o; AI.at = Date.now(); return o; });
  };
  AI.warm = function () {                                            // как ai.warm(): уже в памяти -> продлить; нет -> загрузить (до ~90 с с HDD)
    if (AI.warming) return AI.warming; const t0 = Date.now();
    AI.warming = tmo(5000, s => fetch('/ollama/api/ps', { signal: s, cache: 'no-store' })).then(r => r.ok ? r.json() : { models: [] }).catch(() => ({ models: [] })).then(j => {
      const body = JSON.stringify({ model: AI.MODEL, keep_alive: AI.KEEP });
      if ((j.models || []).some(m => m.name === AI.MODEL || m.model === AI.MODEL)) { fetch('/ollama/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {}); return { loaded: true, already: true, ms: Date.now() - t0 }; }
      return tmo(180000, s => fetch('/ollama/api/generate', { method: 'POST', signal: s, headers: { 'Content-Type': 'application/json' }, body })).then(r => ({ loaded: r.ok, already: false, ms: Date.now() - t0 })).catch(() => ({ loaded: false, ms: Date.now() - t0 }));
    }).finally(() => setTimeout(() => { AI.warming = null; }, 1000));
    return AI.warming;
  };
  AI.chat = function (messages, ms = 150000, maxTok = 160) {
    return tmo(ms, s => fetch('/ollama/api/chat', { method: 'POST', signal: s, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: AI.MODEL, stream: false, think: false, keep_alive: AI.KEEP, options: { temperature: 0.4, num_predict: maxTok }, messages }) }))
      .then(r => { if (!r.ok) throw new Error('ПК ответил ' + r.status); return r.json(); }).then(j => (j.message && j.message.content) || '');
  };
  AI.lt = function (text) {                                          // LanguageTool (/lt) -> [{message, offset, length, rep[]}] | null (недоступен)
    return tmo(6000, s => fetch('/lt/v2/check', { method: 'POST', signal: s, body: new URLSearchParams({ language: 'de-DE', text }) }))
      .then(r => r.ok ? r.json() : null).then(j => j ? (j.matches || []).map(m => ({ message: m.message, offset: m.offset, length: m.length, rep: (m.replacements || []).slice(0, 2).map(x => x.value) })) : null).catch(() => null);
  };
  AI.LABEL = { pc: 'ИИ: ПК', off: 'ИИ выкл.' };
  const go = h => { if (window.dsGo) return window.dsGo(h); if (window.toast) toast('В приложении: вкладка «Мир» · nur in der App', 1800); };
  window.MF = { data, nouns, nextLesson, passedLessons, knownWords, curChapter, reviewList, appCh, hero, AI, esc, artC, ld, sv, go, COL, D: () => D };

  // ---------- окно наставницы (#mWin) — как окно доски (#qWin): бумажная панель, немецкий крупно, русский мелко
  const css = document.createElement('style');
  css.textContent = `
    #mWin,#fWin{position:absolute;left:12px;right:12px;top:58px;bottom:12px;display:none;flex-direction:column;gap:6px;padding:8px 12px 10px;color:#2e1e12;z-index:72;font-family:Roboto,'Segoe UI',system-ui,sans-serif}
    body:not(.vert) #mWin,body:not(.vert) #fWin{left:50%;right:auto;width:640px;transform:translateX(-50%)}
    body.mfOpen #qTrack,body.mfOpen #cbHero{display:none!important}
    #mWin small.ru,#fWin small.ru{display:none!important}
    #mWin .goal{font-size:12px;color:#6b4a2e;line-height:1.15;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    #mWin .ru,#fWin .ru{display:block;font-size:13px;font-weight:400;color:#6b4a2e;line-height:1.15}
    #mWin .hd,#fWin .hd{display:flex;align-items:center;gap:10px}#mWin .hd .t,#fWin .hd .t{flex:1;min-width:0;font-size:22px;font-weight:800;line-height:1.05}
    #mWin img.pt,#fWin img.pt{width:96px;height:96px;image-rendering:pixelated;border:2px solid #3b2314;border-radius:4px;background:#e8d3a8;flex:0 0 auto}
    #mWin .ai,#fWin .ai{font-size:11px;font-weight:700;color:#5f7a3a}#mWin .ai.off,#fWin .ai.off{color:#9b6a2e}
    #mWin .ui-btn,#fWin .ui-btn{font-family:inherit;color:#2e1e12;height:auto;min-height:44px;padding:2px 12px;font-size:17px;line-height:1.05;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:0 0 auto}
    #mWin .tabs{display:flex;gap:6px}#mWin .tabs .ui-btn{flex:1 1 0;min-width:0;padding:2px 4px;font-size:16px}#mWin .tabs .ui-btn.on{outline:3px solid #ffd23f;outline-offset:-3px}
    #mWin .body,#fWin .body{flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:6px;min-height:0}
    #mWin .row{display:flex;align-items:center;gap:10px;background:rgba(255,248,230,.55);border:2px solid #c9a877;border-radius:6px;padding:4px 8px;min-height:50px}
    #mWin .row .tx{flex:1;min-width:0}#mWin .de{font-size:19px;font-weight:700;line-height:1.15}
    #mWin .card{background:rgba(255,248,230,.6);border:2px solid #c9a877;border-radius:6px;padding:6px 10px}
    #mWin .why{font-size:15px;line-height:1.3;margin-top:4px}#mWin .ex{font-size:16px;margin-top:3px}#mWin .src{font-size:11px;color:#9b6a2e;margin-top:3px}
    #mWin .btns{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
    #mWin .big{font-size:34px;font-weight:800;text-align:center;margin:6px 0}#mWin .opts{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
    #mWin .opts .ui-btn{min-width:96px;font-size:20px}#mWin .opts .ui-btn.ok{box-shadow:0 0 0 3px #5f9a3a}#mWin .opts .ui-btn.no{box-shadow:0 0 0 3px #e24848;opacity:.7}
    #mWin input,#fWin input{flex:1;min-width:0;height:40px;font-size:17px;padding:0 8px;border:2px solid #c9a877;border-radius:6px;background:#fff8e6;color:#2e1e12;font-family:inherit}
    #mWin .ask{display:flex;gap:6px;align-items:center}#mWin .ans{font-size:15px;line-height:1.3}
    #bMentor{height:36px;width:46px;padding:0;display:inline-flex;align-items:center;justify-content:center;pointer-events:auto}
    #bMentor img{height:28px;width:28px;image-rendering:pixelated;border-radius:3px}`;
  document.head.appendChild(css);
  const $ = id => document.getElementById(id);
  const HUD = ['bag', 'bFurn', 'bMap', 'clock'];
  const W = { el: null, tab: 'next', was: {}, sc: null, why: 0, rv: null };
  function scene() { const g = window.game; return g && g.scene ? g.scene.getScenes(true)[0] : null; }
  function winTop() { const g = $('goal'); return g && g.offsetParent ? g.offsetTop + g.offsetHeight + 8 : 58; }   // окно ниже верхней плашки (как System)
  MF.winTop = winTop;
  function el() {
    if (W.el) return W.el; const e = W.el = document.createElement('div'); e.id = 'mWin'; e.className = 'ui ui-panel-paper';
    e.addEventListener('click', onClick); ['pointerdown', 'pointerup', 'touchstart'].forEach(t => e.addEventListener(t, ev => ev.stopPropagation()));
    e.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 'mAsk') { ev.preventDefault(); ask(); } });
    ($('ui') || document.body).appendChild(e); return e;
  }
  function open(tab) {
    if (window.Friend && Friend.isOpen && Friend.isOpen()) Friend.close();
    W.tab = tab || W.tab || 'next'; const e = el();
    HUD.forEach(k => { const h = $(k); if (h && W.was[k] === undefined) { W.was[k] = h.style.display; h.style.display = 'none'; } });
    document.body.classList.add('mfOpen'); W.sc = scene(); if (W.sc) W.sc.busy = true;
    e.style.top = winTop() + 'px'; e.style.display = 'flex'; render();
    if (!D) data.then(() => { if (isOpen()) render(); });           // данные ещё грузятся — дорисовать, когда придут
    AI.status().then(() => { if (isOpen()) head(); });
    return true;
  }
  function close() {
    if (W.el) W.el.style.display = 'none'; document.body.classList.remove('mfOpen');
    HUD.forEach(k => { const h = $(k); if (h && W.was[k] !== undefined) h.style.display = W.was[k]; }); W.was = {};
    if (W.sc) W.sc.busy = false; W.sc = null;
  }
  const isOpen = () => !!W.el && W.el.style.display === 'flex';
  const TABS = [['next', 'Was jetzt?', 'что дальше'], ['why', 'Warum?', 'почему так'], ['rev', 'Wiederholen', 'повтор'], ['tal', 'Talente', 'навыки']];
  function head() {
    const h = W.el && W.el.querySelector('.ai'); if (!h) return; const st = AI.st;
    h.className = 'ai' + (st && st.route === 'pc' ? '' : ' off'); h.textContent = st ? AI.LABEL[st.route] + (st.route === 'off' ? ' — всё работает без ИИ' : '') : 'ИИ: проверяю…';
  }
  function render() {
    const e = el();
    e.innerHTML = `<div class="hd"><img class="pt" src="${PTB()}" alt="Frau Becker"><div class="t"><b style="color:${COL.die}">die</b> Mentorin · Frau Becker<span class="ru">наставница · учительница курса и мастер гильдии</span><span class="ai">ИИ: проверяю…</span></div><button class="ui ui-btn" data-x="1">Zurück<span class="ru">назад</span></button></div>
      <div class="tabs">${TABS.map(([k, de, ru]) => `<button class="ui ui-btn${k === W.tab ? ' on' : ''}" data-tab="${k}">${de}<span class="ru">${ru}</span></button>`).join('')}</div>
      <div class="body" id="mBody"></div>`;
    head();
    const b = $('mBody'); if (!D) { b.innerHTML = '<div class="row"><div class="tx">…</div></div>'; return; }
    ({ next: viewNext, why: viewWhy, rev: viewRev, tal: viewTal })[W.tab](b);
  }

  // ---------- «Was jetzt?»: что делать дальше — по прогрессу приложения и заданиям
  function nextItems() {
    const out = [], Q = window.Quests, nl = nextLesson();
    if (Q && Q.list) Q.list().filter(q => q.giver && Q.ready && Q.ready(q.id)).slice(0, 2).forEach(q => out.push({ k: 'quest', de: '✓ ' + q.title_de, ru: 'готово — сдай: ' + (q.giver === 'board' ? 'доска das Schwarze Brett' : (q.giver_de || q.giver)) }));
    if (nl && nl.all) out.push({ k: 'lesson', de: 'Alle Lektionen geschafft!', ru: 'все уроки пройдены — повторяй и помогай жителям' });
    else if (nl) out.push({ k: 'lesson', les: nl.les.id, de: `Lektion ${nl.num}: ${nl.les.title}`, ru: `глава ${nl.n} · урок ${nl.num} из ${nl.total}`, goal: nl.les.goal, btn: ['Zur Lektion', 'открыть', '#/ch/' + nl.n] });
    const rv = reviewList(); if (rv.length) out.push({ k: 'review', de: `Wiederhole ${rv.length} ${rv.length === 1 ? 'Wort' : 'Wörter'}`, ru: 'слова из «Повтора» — артикль и перевод', act: ['rev', 'Üben', 'тренировка'] });
    const pts = window.Skills && Skills.points ? Skills.points() : 0; if (pts > 0) out.push({ k: 'skills', de: `${pts} ${pts === 1 ? 'Punkt' : 'Punkte'} für Talente`, ru: 'очки навыков за уроки — выбери навык', act: ['skills', 'Talente', 'навыки'] });
    const act = Q && Q.list ? Q.list().filter(q => !(q.giver && Q.ready && Q.ready(q.id))) : [];
    if (act.length) out.push({ k: 'task', de: `Aufgabe: ${act[0].title_de} ${act[0].count || 0}/${act[0].need || 1}`, ru: (act[0].title_ru || 'задание идёт') + (act.length > 1 ? ` · ещё ${act.length - 1}` : '') });
    else if (window.Board && Q) out.push({ k: 'board', de: 'Nimm eine Aufgabe am Schwarzen Brett!', ru: 'возьми задание на доске — у Gildenhaus (с главы 2)' });
    return out;
  }
  function hello() {                                                 // приветствие наставницы — простые слова A1 (Max — ребёнок): «du», 3–5 слов
    const nl = nextLesson(), H = hero();
    if (nl && nl.all) return { de: 'Super, Max! Du kannst viel!', ru: 'Супер, Макс! Ты много умеешь!' };
    return H.child ? { de: 'Hallo, Max! Was machen wir jetzt?', ru: 'Привет, Макс! Что будем делать?' } : { de: 'Hallo, Max! Was machst du jetzt?', ru: 'Привет, Макс! Что ты делаешь дальше?' };
  }
  function viewNext(b) {
    const hi = hello(); W.hi = hi;
    b.innerHTML = `<div class="card" data-k="hi" style="display:flex;align-items:center;gap:8px;border-style:dashed"><div class="tx" style="flex:1"><div class="de">${esc(hi.de)}</div><span class="ru">${esc(hi.ru)}</span></div><button class="ui ui-btn" data-act="hi" style="min-height:36px;width:40px;padding:0">🔊</button></div>`
      + nextItems().map(it => `<div class="row" data-k="${it.k}"${it.les ? ` data-les="${it.les}"` : ''}><div class="tx"><div class="de">${artC(it.de)}</div><span class="ru">${esc(it.ru)}</span>${it.goal ? `<div class="goal">${esc(it.goal)}</div>` : ''}</div>${
      it.btn ? `<button class="ui ui-btn" data-go="${it.btn[2]}">${it.btn[0]}<span class="ru">${it.btn[1]}</span></button>` : it.act ? `<button class="ui ui-btn" data-act="${it.act[0]}">${it.act[1]}<span class="ru">${it.act[2]}</span></button>` : ''}</div>`).join('')
      + `<div class="btns"><button class="ui ui-btn" data-go="#/lessons">Lektionen<span class="ru">уроки</span></button><button class="ui ui-btn" data-go="#/review">Wiederholen<span class="ru">повтор в приложении</span></button></div>`;
  }
  // ---------- «Warum?»: карточки «почему так» текущей главы — только из данных уроков
  function whyCards() {
    const c = curChapter(); if (!c) return []; const L = D.chapters[c.n], out = [];
    for (let i = c.upto; i >= 0; i--) (L[i].why || []).forEach(w => out.push(Object.assign({ n: c.n, li: i, lid: L[i].id, ltitle: L[i].title, quiz: L[i].quiz || [] }, w)));
    return out;
  }
  function viewWhy(b) {
    const C = whyCards(); if (!C.length) { b.innerHTML = '<div class="card">Пока нет карточек «почему так» для этой главы.</div>'; return; }
    const k = ((W.why % C.length) + C.length) % C.length, w = C[k], q = w.quiz[k % Math.max(1, w.quiz.length)];
    b.innerHTML = `<div class="card" data-why="${w.pid}" data-lid="${w.lid}"><span class="ru">Kapitel ${w.n} · Lektion ${w.li + 1}: ${esc(w.ltitle)} · карточка ${k + 1} из ${C.length}</span>
        <div class="de" style="font-size:21px">${artC(w.de)}</div><span class="ru">${esc(w.ru)}</span>
        <div class="why">${artC(w.text)}</div>${w.ex.slice(0, 2).map(x => `<div class="ex">• <b>${artC(x.de)}</b> <span class="ru" style="display:inline">— ${esc(x.ru)}</span></div>`).join('')}
        <div class="src">из урока ${w.lid} (фраза ${w.pid})</div></div>
      ${q ? `<div class="card" data-quiz="${q.id}"><div class="de" style="font-size:16px">${artC(q.q)}</div><div class="ans" id="mQa" style="display:none">${artC(q.a)}</div></div>` : ''}
      <div class="btns"><button class="ui ui-btn" data-act="hear">Hören<span class="ru">слушать</span></button>${q ? '<button class="ui ui-btn" data-act="qa">Antwort<span class="ru">ответ</span></button>' : ''}<button class="ui ui-btn" data-act="whyNext">Noch eins<span class="ru">ещё</span></button></div>
      <div class="ask"><input id="mAsk" lang="ru" placeholder="Спроси «почему…?» по этой карточке" autocomplete="off"><button class="ui ui-btn" data-act="ask">Fragen<span class="ru">спросить</span></button></div>
      <div class="card ans" id="mAns" style="display:none"></div>`;
    W.cur = w;
  }
  function mentorPrompt(H, ctx) {                                   // A1: Max — ребёнок -> как добрая учительница с ребёнком: «ты», очень коротко, простыми словами
    return ['Ты — Frau Becker, добрая учительница немецкого и наставница героя Max в игре-деревне Stillbach.',
      `Max — ${H.age_ru} (уровень ${H.level}), родной язык русский. Говори с ним на «ты», ${H.child ? 'как добрая учительница с ребёнком' : 'как учительница с подростком'}.`,
      `Отвечай ТОЛЬКО по карточкам урока ниже: по-русски, ${H.child ? '1–2 очень коротких предложения (до 12 слов), простыми словами, как ребёнку' : '1–3 коротких предложения'}.`,
      'Без грамматических терминов (не говори «инверсия», «спряжение», «подлежащее», «сказуемое», «порядок слов»): объясняй на примере из карточки.',
      'Немецкие примеры бери только дословно из карточек. Ничего не выдумывай: если в карточках нет ответа — скажи «Этого в уроке нет».',
      'Ласково и весело, без личных вопросов. Вопросы не про немецкий — мягко верни к уроку.', '', 'Карточки урока:', ctx].join('\n');
  }
  const latin = s => (String(s).match(/[A-Za-zÄÖÜäöüß]+(?:[ \-'][A-Za-zÄÖÜäöüß]+)*/g) || []);
  function ask() {
    const inp = $('mAsk'), a = $('mAns'), w = W.cur; if (!inp || !a || !w) return; const q = inp.value.trim().slice(0, 200); if (!q) { inp.focus(); return; }
    const toAns = () => { const bd = $('mBody'); if (bd && a.isConnected) bd.scrollTop = bd.scrollHeight; };   // ответ — последний блок окна: прокрутить к нему, иначе он под краем
    a.style.display = 'block'; a.innerHTML = 'думаю…'; a.dataset.src = 'wait'; toAns();
    const fallback = why => { a.dataset.src = 'data'; a.innerHTML = `<span class="ru" style="display:inline">${esc(why)}</span><br>${artC(w.text)}${w.why_ru ? '<br>' + artC(w.why_ru) : ''}<div class="src">ответ из урока ${w.lid}</div>`; toAns(); };
    AI.status().then(st => {
      if (st.route !== 'pc') return fallback('ИИ выкл. — правило из урока:');
      const cards = whyCards().slice(0, 6), first = [w].concat(cards.filter(c => c.pid !== w.pid)).slice(0, 5);
      const ctx = first.map(c => `Фраза: ${c.de} — ${c.ru}\nПравило: ${c.text}${c.why_ru ? ' ' + c.why_ru : ''}\nПримеры: ${c.ex.map(x => x.de + ' — ' + x.ru).join('; ')}`).join('\n\n');
      const H = hero(), sys = mentorPrompt(H, ctx), maxS = H.child ? 2 : 3;
      const p = AI.warm(); return Promise.race([p, new Promise(r => setTimeout(r, 400))]).then(() => AI.chat([{ role: 'system', content: sys }, { role: 'user', content: q }], 150000, 180)).then(txt => {
        txt = String(txt).replace(/^(RU|DE):\s*/gim, '').replace(/\*\*/g, '').trim(); const ss = txt.split(/(?<=[.!?:])\s+/); let n = Math.min(maxS, ss.length); while (n < ss.length && n < maxS + 2 && /:$/.test(ss[n - 1])) n++;   // фраза с «:» — вместе с примером после неё
        const sents = ss.slice(0, n).join(' ').slice(0, 480);
        const ctxL = ctx.toLowerCase(), bad = latin(sents).filter(x => !ctxL.includes(x.toLowerCase()) && !/^(A1|Max|ok)$/i.test(x));
        if (!sents || bad.length) return fallback(bad.length ? `ИИ взял немецкое не из урока (${bad.slice(0, 2).join(', ')}) — показываю правило урока:` : 'ИИ промолчал — правило урока:');
        a.dataset.src = 'ai'; a.innerHTML = `${artC(sents)}<div class="src">${AI.LABEL.pc} · по карточкам урока ${w.lid}</div>`; toAns();
      });
    }).catch(e => fallback('ИИ не ответил (' + (e && e.name === 'AbortError' ? 'долго' : 'нет связи') + ') — правило урока:'));
  }

  // ---------- «Wiederholen»: слова из «Повтора» (ds_proto.review, туда их кладёт бой) — артикль, потом перевод; оба верно -> слово уходит из «Повтора»
  function nounMap() { const m = {}; Object.values((NOUNS && NOUNS.chapters) || {}).forEach(ls => ls.forEach(l => (l.words || []).forEach(w => { m[w.art + ' ' + w.w] = w.ru; }))); return m; }
  function rvStart() { const list = reviewList().slice(0, 8); W.rv = { list, i: 0, stage: 'art', ok: 0, artOk: false, pick: null }; }
  function viewRev(b) {
    if (!NOUNS) { b.innerHTML = '<div class="card">…</div>'; nouns().then(() => { if (isOpen() && W.tab === 'rev') render(); }); return; }
    if (!W.rv) rvStart(); const R = W.rv;
    if (!R.list.length) { b.innerHTML = `<div class="card" data-rv="empty"><div class="de">Super! Keine Wörter zum Wiederholen.</div><span class="ru">«Повтор» пуст: слова попадают сюда, когда в бою ошибаешься в артикле.</span></div><div class="btns"><button class="ui ui-btn" data-go="#/review">Wiederholen<span class="ru">повтор в приложении</span></button></div>`; return; }
    if (R.i >= R.list.length) { b.innerHTML = `<div class="card" data-rv="end"><div class="de">Fertig! ${R.ok} / ${R.list.length}</div><span class="ru">готово: верно ${R.ok} из ${R.list.length}; верные слова ушли из «Повтора». Ошибки ничего не отнимают.</span></div><div class="btns"><button class="ui ui-btn" data-act="rvAgain">Nochmal<span class="ru">ещё раз</span></button><button class="ui ui-btn" data-go="#/review">Wiederholen<span class="ru">повтор в приложении</span></button></div>`; return; }
    const s = R.list[R.i], [art, ...ws] = s.split(' '), w = ws.join(' '), ru = nounMap()[s], M = nounMap();
    if (R.stage === 'art') {
      b.innerHTML = `<div class="card" data-rv="art" data-word="${esc(s)}"><span class="ru">Wort ${R.i + 1} / ${R.list.length} · какой артикль?</span><div class="big">… ${esc(w)}</div>
        <div class="opts">${['der', 'die', 'das'].map(a => `<button class="ui ui-btn${R.pick ? (a === art ? ' ok' : a === R.pick ? ' no' : '') : ''}" data-art="${a}" style="color:${COL[a]}">${a}</button>`).join('')}</div>
        ${R.pick ? `<div class="de" style="text-align:center;margin-top:6px">${artC(s)} ${R.pick === art ? '✓' : ''}</div>` : ''}</div>${R.pick ? `<div class="btns"><button class="ui ui-btn" data-act="rvNext">Weiter<span class="ru">дальше</span></button></div>` : ''}`;
      return;
    }
    const others = Object.entries(M).filter(([k, v]) => v && v !== ru && k !== s).map(([, v]) => v), opts = [ru];
    let seed = s.length * 7 + R.i; while (opts.length < 3 && others.length) { seed = (seed * 9301 + 49297) % 233280; const v = others[seed % others.length]; if (!opts.includes(v)) opts.push(v); }
    if (!R.order) R.order = opts.sort((x, y) => ((x.length * 31 + seed) % 7) - ((y.length * 31 + seed) % 7));
    b.innerHTML = `<div class="card" data-rv="tr" data-word="${esc(s)}"><span class="ru">Wort ${R.i + 1} / ${R.list.length} · что это значит?</span><div class="big">${artC(s)}</div>
      <div class="opts">${R.order.map(v => `<button class="ui ui-btn${R.pick ? (v === ru ? ' ok' : v === R.pick ? ' no' : '') : ''}" data-tr="${esc(v)}" style="font-size:17px">${esc(v)}</button>`).join('')}</div></div>
      ${R.pick ? `<div class="btns"><button class="ui ui-btn" data-act="rvNext">Weiter<span class="ru">дальше</span></button></div>` : ''}`;
  }
  function rvAnswer(kind, v) {
    const R = W.rv; if (!R || R.pick) return; const s = R.list[R.i], art = s.split(' ')[0], ru = nounMap()[s];
    R.pick = v; if (window.speakDE) speakDE(s);
    if (kind === 'art') R.artOk = v === art;
    else if (v === ru && R.artOk) { R.ok++; sv('ds_proto.review', reviewList().filter(x => x !== s)); if (window.toast) toast('Richtig! · верно', 900); }
    render();
  }
  function rvNext() {
    const R = W.rv; if (!R) return; const s = R.list[R.i], ru = nounMap()[s];
    if (R.stage === 'art' && ru) { R.stage = 'tr'; R.pick = null; R.order = null; }
    else { if (R.stage === 'art' && R.artOk) { R.ok++; sv('ds_proto.review', reviewList().filter(x => x !== s)); } R.i++; R.stage = 'art'; R.pick = null; R.order = null; R.artOk = false; }
    render();
  }
  // ---------- «Talente»: навыки (skills.js) и экраны приложения
  function viewTal(b) {
    const pts = window.Skills && Skills.points ? Skills.points() : 0;
    b.innerHTML = `<div class="row" data-k="skills"><div class="tx"><div class="de">Talente: ${pts} ${pts === 1 ? 'Punkt' : 'Punkte'}</div><span class="ru">очки навыков — только за учёбу: 1 за урок, +3 за главу, +2 за босса</span></div><button class="ui ui-btn" data-act="skills">Öffnen<span class="ru">открыть</span></button></div>
      <div class="row"><div class="tx"><div class="de">Lektionen</div><span class="ru">уроки в приложении</span></div><button class="ui ui-btn" data-go="#/lessons">Öffnen<span class="ru">открыть</span></button></div>
      <div class="row"><div class="tx"><div class="de">Sprechen mit dem Tutor</div><span class="ru">репетитор в приложении (ИИ)</span></div><button class="ui ui-btn" data-go="#/tutor">Öffnen<span class="ru">открыть</span></button></div>`;
  }
  function onClick(ev) {
    const t = ev.target.closest('button'); if (!t) return; ev.stopPropagation(); const d = t.dataset;
    if (d.x) return close();
    if (d.tab) { W.tab = d.tab; if (d.tab === 'rev') W.rv = null; return render(); }
    if (d.go) { close(); return go(d.go); }
    if (d.art) return rvAnswer('art', d.art);
    if (d.tr) return rvAnswer('tr', d.tr);
    switch (d.act) {
      case 'rev': W.tab = 'rev'; W.rv = null; return render();
      case 'rvNext': return rvNext();
      case 'rvAgain': W.rv = null; return render();
      case 'skills': close(); if (window.Skills && Skills.open) Skills.open(); return;
      case 'whyNext': W.why++; return render();
      case 'hear': if (W.cur && window.speakDE) speakDE(W.cur.de); return;
      case 'hi': if (W.hi && window.speakDE) speakDE(W.hi.de); return;
      case 'qa': { const a = $('mQa'); if (a) a.style.display = 'block'; return; }
      case 'ask': return ask();
    }
  }

  // ---------- мир: Frau Becker в Gildenhaus (у правой доски) + кнопка в HUD
  function setupOrt(sc) {
    if (sc.placeKey !== 'buergeramt') return;
    const [x0, y0, x1, y1] = MENTOR_IN.box, cx = MENTOR_IN.at[0], st = { fontFamily: 'Roboto, sans-serif', fontStyle: 'bold', stroke: '#3b2314' };
    const q = sc.add.text(cx, MENTOR_IN.at[1], '?', { ...st, fontSize: '32px', color: '#8fd3ff', strokeThickness: 7 }).setOrigin(0.5, 1).setDepth(7400); q.mentorSign = true;
    sc.tweens.add({ targets: q, y: q.y - 6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const t2 = sc.add.text(cx, q.y - q.height + 2, 'Frau Becker · наставница', { ...st, fontSize: '13px', fontStyle: 'normal', color: '#f3e3c3', strokeThickness: 4 }).setOrigin(0.5, 1).setDepth(6000);
    const ta = sc.add.text(0, 0, 'die ', { ...st, fontSize: '20px', color: COL.die, strokeThickness: 6 }).setOrigin(0, 1).setDepth(6001);
    const tw = sc.add.text(0, 0, 'Mentorin', { ...st, fontSize: '20px', color: '#fff7e0', strokeThickness: 6 }).setOrigin(0, 1).setDepth(6000);
    const xs = cx - (ta.width + tw.width) / 2, yb = t2.y - t2.height + 3; ta.setPosition(xs, yb); tw.setPosition(xs + ta.width, yb);
    [ta, tw, t2].forEach(t => { t.mentorSign = true; });
    const z = sc.add.zone(cx, (y0 + y1) / 2, x1 - x0, y1 - y0 + 30).setInteractive({ useHandCursor: true }); z.mentor = true; sc.__mentorZone = z;
    const tap = () => { if (window.speakDE) speakDE('Frau Becker, die Mentorin'); if (window.walkToScene && window.walkToScene(sc, MENTOR_IN.stand[0], MENTOR_IN.stand[1], () => open('next'))) return; open('next'); };
    z.on('pointerup', () => { if (sc.__dragged || sc.busy || sc.talking) return; tap(); });
    [ta, tw, q].forEach(t => t.setInteractive({ useHandCursor: true }).on('pointerup', () => { if (sc.__dragged || sc.busy || sc.talking) return; tap(); }));
  }
  (function hookHud() {
    const goal = $('goal'); if (!goal || !$('ui')) return setTimeout(hookHud, 100);
    if ($('bMentor')) return; const b = document.createElement('button'); b.id = 'bMentor'; b.className = 'ui ui-btn'; b.title = 'die Mentorin · наставница';
    b.innerHTML = `<img src="${PTB()}" alt="Mentorin">`; b.onclick = e => { e.stopPropagation(); isOpen() ? close() : open('next'); };
    const sys = $('bSys'); if (sys && sys.parentNode === goal) sys.after(b); else goal.appendChild(b);
    if (!$('bSys')) setTimeout(() => { const s = $('bSys'); if (s && s.parentNode === goal && s.nextSibling !== b) s.after(b); }, 600);   // System появится позже — встать после него
  })();
  (function hook() {
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 50);
    const s = g.scene.getScene('Ort'); if (!s) return;
    s.events.on('create', () => setTimeout(() => { if (s.sys.isActive()) setupOrt(s); }, 0));
    s.events.on('shutdown', () => { if (W.sc === s) close(); s.__mentorZone = null; });
    if (s.sys.isActive()) setupOrt(s);
  })();
  window.Mentor = { open, close, isOpen, next: nextItems, nextLesson, why: () => (D ? whyCards() : []), ask, hello, prompt: ctx => mentorPrompt(hero(), ctx || ''), MENTOR_IN, view: () => W };
})();
