// Код (наставник/друг) 24.11 — ИИ-друг: der Freund / die Freundin. Пол и имя выбирает игрок при первой встрече (в Stillbach рядом с Max, «!»),
// сменить — кнопка «Einstellungen» в окне чата. Спутник ходит за Max (Yard / Ort / Welt; в подземелье и бою не ходит) по следу Max:
// точки следа — места, где Max уже стоял (проходимые), поэтому друг не идёт сквозь стены и не застревает; отстал > 420 px — встаёт рядом.
// Друг в отряде: state.party (как задумано для собаки Brezel) — открывает Gruppenheilung в бою.
// Решения автора: «гарем — к B1» -> на A1/A2 только дружба (в промпте запрет романтики/флирта); звёзды не тратятся; ошибки ничего не отнимают.
// Разговор: только по-немецки на уровне игрока — словарь пройденных уроков (MF.knownWords из mentor_data.json), 1–2 короткие фразы, RU мелко по кнопке «RU»,
// мягкое исправление (TIPP по-русски + LanguageTool, как tutor.js), темы мира (WorldTime: сезон/время суток/праздник, огород, рыбалка, задания), голос speakDE, микрофон SpeechG.
// ИИ: MF.AI (mentor.js) — тот же /ollama и модель, что app/src/core/ai.js. Ответ длиннее 2 фраз — обрезается; фраза со словами вне уровня или с ошибкой LT — выкидывается;
// ничего не осталось — готовая реплика из уроков. ИИ выкл. (route off) — офлайн: реплики уроков (DE+RU) и мини-диалоги глав (content dialogs).
// Арт: craftpix pixel_characters_4dir 1 / 3 (как Max), портреты reodesuxz dwarf / hero_girl (style_pick/mentor/build_mf.py). API: Friend.*
(function () {
  const BASE = 'assets_v3/', KEY = 'ds_proto.friend', COL = { der: '#3a7be0', die: '#e24848', das: '#2f9a4f' };
  const SCENES = ['Yard', 'Ort', 'Welt'], LAG = 64, SPEED = 330, FAR = 420;
  const ld = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
  const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} syncParty(v); };
  const NAMES = { m: ['Ahmad', 'Lukas', 'Taras'], f: ['Olga', 'Lena', 'Maria'] };   // Ahmad, Olga, Maria, Taras — люди курса из книги (world.json, CHARACTERS_v3)
  const cleanName = (s, g) => { s = String(s || '').replace(/[^A-Za-zÄÖÜäöüßА-Яа-яЁё' -]/g, '').trim().slice(0, 14); return s.length >= 2 ? s[0].toUpperCase() + s.slice(1) : NAMES[g || 'f'][0]; };
  const noun = g => (g === 'm' ? { art: 'der', w: 'Freund', ru: 'друг', my: 'mein Freund' } : { art: 'die', w: 'Freundin', ru: 'подруга', my: 'meine Freundin' });
  function syncParty(v) {
    if (typeof state === 'undefined' || !state) return;
    const p = (Array.isArray(state.party) ? state.party : []).filter(x => x && x.id !== 'friend');
    if (v && v.met) p.push({ id: 'friend', name: v.name, g: v.g }); state.party = p; try { store.set(state); } catch (e) {}
  }
  let META = null; const meta = fetch(BASE + 'world/friend.json').then(r => r.json()).then(j => (META = j)).catch(() => (META = { frame: 144, sheets: { m: { origin_y: 0.667 }, f: { origin_y: 0.667 } } }));

  // ---------- спутник в сцене
  function walkable(sc, x, y) {
    if (sc.townMask && window.townWalkable) { const t = townWalkable(sc, x, y); if (t !== null) return t; }
    if (sc.o && sc.o.walk) return sc.o.walk.some(([a, b, c, e]) => x >= a && x <= c && y >= b && y <= e);
    return true;
  }
  function anims(sc, g) {
    const key = 'friend_' + g; if (sc.anims.exists('fw-' + g + '-down')) return;
    ['down', 'left', 'right', 'up'].forEach((d, k) => sc.anims.create({ key: 'fw-' + g + '-' + d, frames: sc.anims.generateFrameNumbers(key, { frames: [k * 3, k * 3 + 1, k * 3 + 2, k * 3 + 1] }), frameRate: 8, repeat: -1 }));
  }
  const STAND = { down: 1, left: 4, right: 7, up: 10 };
  function spawnPoint(sc, w) {
    for (const [dx, dy] of [[-48, 6], [48, 6], [0, 40], [-40, -24], [40, -24], [0, -40], [-80, 0], [80, 0]]) if (walkable(sc, w.x + dx, w.y + dy)) return [w.x + dx, w.y + dy];
    return [w.x, w.y];
  }
  function attach(sc) {
    const F = ld(); if (sc.__friend || !sc.walker) return;
    if (!F || !F.met) { if (sc.scene.key === 'Yard') meetSpot(sc); return; }
    const key = 'friend_' + F.g, put = () => {
      if (!sc.sys.isActive() || !sc.walker || sc.__friend) return; anims(sc, F.g);
      const [x, y] = spawnPoint(sc, sc.walker), oy = (META && META.sheets[F.g] && META.sheets[F.g].origin_y) || 0.667;
      const s = sc.add.sprite(x, y, key, 1).setOrigin(0.5, oy).setDepth(y); s.friend = F.g; sc.__friend = s;
      s.shadow = sc.add.ellipse(x, y - 2, 34, 10, 0x0f1c08, 0.3).setDepth(y - 1);
      s.trail = [[sc.walker.x, sc.walker.y]]; s.facing = 'down';
      s.setInteractive({ useHandCursor: true, pixelPerfect: false }).on('pointerup', () => { if (sc.__dragged || sc.busy || sc.talking) return; open(); });
      sc.events.on('update', s.__upd = (t, dt) => follow(sc, s, dt));
    };
    if (sc.textures.exists(key)) put(); else { sc.load.spritesheet(key, BASE + 'world/friend_' + F.g + '_walk.png', { frameWidth: 144, frameHeight: 144 }); sc.load.once('complete', put); sc.load.start(); }
  }
  function detach(sc) { const s = sc.__friend; if (!s) return; if (s.__upd) sc.events.off('update', s.__upd); if (s.shadow) s.shadow.destroy(); s.destroy(); sc.__friend = null; }
  function follow(sc, s, dt) {
    const w = sc.walker; if (!w || !s.active) return; dt = Math.min(dt || 16, 60) / 1000;
    const T = s.trail, last = T[T.length - 1];
    if (Math.hypot(w.x - last[0], w.y - last[1]) > 6) { T.push([w.x, w.y]); if (T.length > 400) T.splice(0, T.length - 400); }
    if (Math.hypot(w.x - s.x, w.y - s.y) > FAR) { const [x, y] = spawnPoint(sc, w); s.setPosition(x, y); s.trail = [[w.x, w.y]]; return; }   // сцена сменилась / прыжок — встать рядом
    let rest = 0; for (let i = T.length - 1; i > 0; i--) rest += Math.hypot(T[i][0] - T[i - 1][0], T[i][1] - T[i - 1][1]);   // длина следа от первой точки до Max
    rest += Math.hypot(T[0][0] - s.x, T[0][1] - s.y);
    let step = SPEED * dt * (rest > LAG * 2.5 ? 1.4 : 1), moved = false, dir = s.facing;
    while (rest > LAG && step > 0 && T.length) {
      const [tx, ty] = T[0], dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy);
      if (d <= step) { s.setPosition(tx, ty); step -= d; rest -= d; if (T.length > 1) T.shift(); else break; }
      else { s.setPosition(s.x + dx / d * step, s.y + dy / d * step); rest -= step; step = 0; }
      if (d > 0.5) { dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); moved = true; }
    }
    if (moved) { if (!s.anims.isPlaying || s.anims.currentAnim.key !== 'fw-' + s.friend + '-' + dir) s.play('fw-' + s.friend + '-' + dir, true); s.facing = dir; }
    else if (s.anims.isPlaying) { s.stop(); s.setFrame(STAND[s.facing] || 1); }
    s.setDepth(s.y - 0.5); if (s.shadow) s.shadow.setPosition(s.x, s.y - 2).setDepth(s.y - 1.5);
  }
  // первая встреча: друг ждёт рядом с Max в Stillbach («!» + «Hallo!»), тап -> выбор пола и имени
  function meetSpot(sc) {
    if (sc.__friendMeet) return; const g0 = 'f', key = 'friend_' + g0;
    const put = () => {
      if (!sc.sys.isActive() || !sc.walker || sc.__friendMeet) return; anims(sc, g0);
      const [x, y] = spawnPoint(sc, sc.walker), s = sc.add.sprite(x, y, key, 1).setOrigin(0.5, 0.667).setDepth(y).setAlpha(0.92); s.friendMeet = true; sc.__friendMeet = s;
      const m = sc.add.text(x, y - 92, '!', { fontFamily: 'Roboto, sans-serif', fontSize: '30px', fontStyle: 'bold', color: '#ffd23f', stroke: '#3b2314', strokeThickness: 6 }).setOrigin(0.5, 1).setDepth(7400);
      const h = sc.add.text(x, y - 66, 'Hallo!', { fontFamily: 'Roboto, sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#fff7e0', stroke: '#3b2314', strokeThickness: 5 }).setOrigin(0.5, 1).setDepth(7400);
      sc.tweens.add({ targets: m, y: m.y - 8, duration: 450, yoyo: true, repeat: -1 }); s.marks = [m, h];
      const tap = () => { if (sc.__dragged || sc.busy || sc.talking) return; if (window.speakDE) speakDE('Hallo!'); setupWin(true); };
      s.setInteractive({ useHandCursor: true }).on('pointerup', tap); h.setInteractive({ useHandCursor: true }).on('pointerup', tap); m.setInteractive({ useHandCursor: true }).on('pointerup', tap);
    };
    if (sc.textures.exists(key)) put(); else { sc.load.spritesheet(key, BASE + 'world/friend_' + g0 + '_walk.png', { frameWidth: 144, frameHeight: 144 }); sc.load.once('complete', put); sc.load.start(); }
  }
  function meetDone(sc) { const s = sc && sc.__friendMeet; if (!s) return; (s.marks || []).forEach(m => m.destroy()); s.destroy(); sc.__friendMeet = null; }

  // ---------- уровень: только слова пройденных уроков (+ служебные слова A1, имена, слова мира, которые игра сама показывает)
  const BASEW = 'ich du er sie es wir ihr ist bin bist sind seid hat habe hast haben und oder aber ja nein nicht kein keine auch gut sehr schön danke bitte hallo tschüss wie was wo wer wann woher wohin heute jetzt hier da das der die den dem ein eine einen einem mit für in im am an auf zu von nach mein meine dein deine gern gerne oh ah so noch mal mir dir mich dich toll super prima okay ok'.split(' ');
  const toks = s => (String(s).toLowerCase().match(/[a-zäöüß]+/g) || []);
  const stem = w => (w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 3)));
  function lexicon(extra) {
    const K = new Set(BASEW), S = new Set(); (window.MF ? MF.knownWords() : new Set()).forEach(w => K.add(w)); (extra || []).forEach(w => toks(w).forEach(t => K.add(t)));
    K.forEach(w => S.add(stem(w))); return { has: w => K.has(w) || S.has(stem(w)) || /^\d+$/.test(w), list: [...K] };
  }
  function levelFilter(de, lex) {                                    // <= 2 фразы; фраза с > 1 словом вне уровня или длиннее 10 слов — выкинуть
    const sents = String(de).split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean), kept = [], dropped = [];
    sents.forEach(s => { const u = toks(s).filter(w => !lex.has(w)); (kept.length < 2 && u.length <= 1 && toks(s).length <= 10 ? kept : dropped).push({ s, u }); });
    return { kept, dropped, cut: sents.length > 2 };
  }
  function worldCtx() {                                              // темы из мира: время/сезон/праздник (WorldTime), огород, рыбалка, задания
    const out = { de: [], ru: [] };
    try { const n = window.WorldTime && WorldTime.now(); if (n) { out.de.push(n.seasonDe, n.phaseDe); out.ru.push(`сейчас ${n.seasonDe} (${n.season}), ${n.phaseDe}, ${String(n.hour).padStart(2, '0')}:${String(n.minute).padStart(2, '0')}`);
      (n.festivals || []).forEach(f => { const c = WorldTime.festival ? WorldTime.festival(f) : null; if (c && c.de) { out.de.push(c.de); out.ru.push('сегодня праздник: ' + c.de + (c.ru ? ' (' + c.ru + ')' : '')); } }); } } catch (e) {}
    if (window.Garden) out.ru.push('у Max есть огород (der Garten) в Stillbach');
    if (window.Fishing || document.getElementById('fishBox') !== null) out.ru.push('в Stillbach можно рыбачить (angeln) на мостках');
    try { const Q = window.Quests && Quests.list(); if (Q && Q.length) { out.ru.push('задание сейчас: ' + Q[0].title_de); out.de.push(Q[0].title_de); } } catch (e) {}
    return out;
  }
  const TOPICS = {                                                   // чипы тем: для ИИ — подсказка, офлайн — поиск реплики урока по словам
    wetter: { de: 'Wetter', ru: 'погода', ask: 'погода и время года сейчас', kw: ['wetter', 'sonne', 'regen', 'kalt', 'warm', 'schnee', 'winter', 'sommer', 'herbst', 'frühling', 'heute'] },
    fest: { de: 'Fest', ru: 'праздник', ask: 'праздник сегодня (если есть) или выходные', kw: ['fest', 'feiern', 'geburtstag', 'party', 'wochenende', 'samstag', 'sonntag'] },
    garten: { de: 'Garten', ru: 'огород', ask: 'огород Max: что растёт', kw: ['garten', 'gemüse', 'obst', 'apfel', 'tomate', 'kartoffel', 'blume'] },
    angeln: { de: 'Angeln', ru: 'рыбалка', ask: 'рыбалка в Stillbach', kw: ['fisch', 'wasser', 'see', 'meer', 'angeln'] },
    aufgabe: { de: 'Aufgaben', ru: 'задания', ask: 'задания жителей и доска в Gildenhaus', kw: ['arbeit', 'machen', 'helfen', 'bitte', 'aufgabe'] },
  };
  function pool() {                                                  // реплики уроков (DE+RU): короткие фразы и строки мини-диалогов пройденных уроков
    const P = window.MF ? MF.passedLessons() : [], D = window.MF && MF.D(); const src = P.length ? P.map(p => p.les) : D ? [D.chapters[1][0]] : [];
    const out = []; src.forEach(l => { (l.say || []).forEach(x => out.push({ de: x.de, ru: x.ru, lid: l.id })); (l.dlg || []).forEach(d => d.lines.forEach((x, i) => out.push({ de: x.de, ru: x.ru, lid: l.id, dlg: d, i }))); });
    return out.filter(x => x.de && toks(x.de).length <= 8 && friendOk(x));
  }
  // 24.11 Код (Max/Olga): отбор реплик под друга. Годится, если нет чужих имён/фамилий (роли диалогов уроков + список), себя друг называет только своим
  // именем (по умолчанию Olga), её имя в чужих устах (обращение к ней) — нет; нет «Sie/Ihr/Ihnen» и «Herr/Frau X»; нет взрослых тем (работа, адрес,
  // телефон, e-mail, бланки, приём/термин, аренда, алкоголь, брак, отель). Проверка — app\checks\olga_lines_check.cjs.
  const ADULT = /arbeit|beruf|firma|büro|\bchef|kolleg|\bstelle\b|erfahrung|lagerist|gehalt|\blohn|\bjob|bewerb|adress|straße|hausnummer|postleitzahl|telefon|handy|nummer|e-?mail|@|\d{3,}|termin|miete|versicher|konto|\bbank|formular|anmeld|vorname|familienname|nachname|verheiratet|\bledig|geschieden|\bbier|\bwein|zigarett|rechnung|reservier|rezeption|doppelzimmer|elternabend|hotel|nachtportier|elektroniker|steuer|visum|ausweis|pass\b/i;
  const NAME0 = ['Schmidt', 'Becker', 'Wagner', 'Schulz', 'Müller', 'Weber', 'Anna', 'Maria', 'Sofia', 'Ahmad', 'Artem', 'Adita', 'Nico', 'Petrenko', 'Kai', 'Lena', 'Lukas', 'Taras', 'Jonas', 'Tom', 'Olga'];
  let NAMESET = null;
  const nameSet = () => { if (NAMESET) return NAMESET; const s = new Set(NAME0), D = window.MF && MF.D(); if (!D) return s;
    Object.values(D.chapters).forEach(c => c.forEach(l => (l.dlg || []).forEach(d => Object.values(d.roles || {}).forEach(v => String(v).split(/\s+|und/).forEach(w => {
      if (/^[A-ZÄÖÜ][a-zäöüß]{2,}$/.test(w) && !/^(Herr|Frau|Max|Verkäuferin|Kassiererin|Gastgeberin|Apothekerin|Reporterin)$/.test(w)) s.add(w); })))));
    return (NAMESET = s); };
  const sieForm = s => /\b(Ihre?[mnrs]?|Ihnen)\b/.test(s) || /\b(Herr|Frau|Dr\.)\s+[A-ZÄÖÜ]/.test(s)
    || [...s.matchAll(/(^|[.!?:]\s*)?\bSie\b\s*([A-Za-zäöüß]*)/g)].some(m => !(m[1] !== undefined || m.index === 0) || /(en|sind)$/.test(m[2]) || !m[2]);   // «Sie ist/hat…» в начале = «она» — можно
  function friendOk(x) {
    const s = x.de || '', me = (ld() || {}).name || 'Olga', N = nameSet(), sp = x.dlg && x.dlg.lines[x.i] ? (x.dlg.roles || {})[x.dlg.lines[x.i].r] : null;
    if (!kidOk(s) || sieForm(s) || ADULT.test(s)) return false;
    for (const m of s.matchAll(/\b[A-ZÄÖÜ][a-zäöüß]+\b/g)) { const w = m[0];
      if (w === me) { if (sp && sp !== me) return false; continue; }               // «Das ist Olga.» говорит Max — не её реплика
      if (w === 'Max') { if (/(bin|heiße|heisse|ist)\s+Max\b/.test(s)) return false; continue; }   // «Ich bin Max.» — друг так себя не называет
      if (N.has(w)) return false; }
    return true;
  }
  // друг — ровесник-ребёнок: реплики уроков на «Sie» (Ihre/Ihnen, Sie не в начале фразы) и вопросы о личных данных (номер, адрес, e-mail) ему не подходят
  const kidOk = s => !/\b(Ihre?[mnrs]?|Ihnen)\b/.test(s) && !/[^.!?\s]\s+Sie\b/.test(s) && !/nummer|adresse|e-?mail|telefon/i.test(s);
  function canned(topic, said) {
    const P = pool(); if (!P.length) return { de: 'Hallo!', ru: 'Привет!' };
    if (said) {                                                      // ответ на фразу игрока: та же строка мини-диалога -> следующая строка; иначе — похожая фраза
      const t = new Set(toks(said)); let best = null, bs = 0;
      P.forEach(x => { const s = toks(x.de).filter(w => t.has(w)).length / Math.max(1, toks(x.de).length); if (s > bs) { bs = s; best = x; } });
      if (best && bs >= 0.5 && best.dlg && best.dlg.lines[best.i + 1] && friendOk({ de: best.dlg.lines[best.i + 1].de, dlg: best.dlg, i: best.i + 1 })) { const n = best.dlg.lines[best.i + 1]; return { de: n.de, ru: n.ru, lid: best.lid }; }
    }
    const kw = topic && TOPICS[topic] ? TOPICS[topic].kw : null, hit = kw ? P.filter(x => toks(x.de).some(w => kw.some(k => w.startsWith(k)))) : [];
    const L = hit.length ? hit : P, k = Math.floor(Math.random() * L.length); return L[k];
  }
  const redact = s => { let hit = false; const r = String(s).replace(/\S+@\S+\.\S+/g, () => { hit = true; return '…'; }).replace(/\+?\d[\d\s\-\/]{4,}\d/g, () => { hit = true; return '…'; }); return { text: r, hit }; };

  // ---------- окно чата (#fWin; общий стиль с #mWin — mentor.js)
  const css = document.createElement('style');
  css.textContent = `
    #fWin .log{flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:5px;min-height:0;padding-right:2px}
    #fWin .m{max-width:86%;border:2px solid #c9a877;border-radius:8px;padding:4px 9px;background:rgba(255,248,230,.7);position:relative}
    #fWin .m.fr{align-self:flex-start}#fWin .m.me{align-self:flex-end;background:rgba(214,232,250,.8);border-color:#8aa9cf}#fWin .m.sys{align-self:center;max-width:96%;background:transparent;border:0;padding:0 4px}
    #fWin .m .de{font-size:19px;font-weight:700;line-height:1.2}#fWin .m .ru{display:none}#fWin.ru .m .ru{display:block}#fWin .m.sys .ru,#fWin .m .tip .ru{display:block}
    #fWin .m .tip{font-size:13px;color:#7a4f12;font-weight:600;margin-top:2px}#fWin .m .src{font-size:10px;color:#9b6a2e}
    #fWin .m .hr{float:right;margin:0 0 2px 8px;width:32px;height:30px;min-height:0;padding:0;font-size:14px}
    #fWin .chips{display:flex;gap:5px;flex-wrap:nowrap;overflow-x:auto;flex:0 0 auto;padding-bottom:2px}#fWin .chips .ui-btn{min-height:38px;font-size:15px;padding:1px 8px}#fWin .chips .ui-btn .ru{font-size:10px}
    #fWin .hd img.pt{width:96px;height:96px}body.vert #fWin .hd img.pt{width:48px;height:48px}#fWin .hd .t{font-size:20px}#fWin .turn{display:flex;gap:6px;justify-content:flex-end;margin-top:4px}#fWin .turn .ui-btn{min-height:34px;font-size:15px;padding:1px 10px}
    #fWin .inp{display:flex;gap:6px;align-items:center}#fWin .inp .ui-btn{min-height:42px}#fWin .ui-btn.rec{box-shadow:0 0 0 3px #e24848}
    #fWin .hd .ui-btn{min-height:40px;padding:1px 9px;font-size:15px}#fWin .ui-btn.on{outline:3px solid #ffd23f;outline-offset:-3px}
    #fWin .set{display:flex;flex-direction:column;gap:8px}#fWin .set .opts{display:flex;gap:8px;flex-wrap:wrap}#fWin .set .opts .ui-btn{font-size:19px;min-width:130px}`;
  document.head.appendChild(css);
  const $ = id => document.getElementById(id), esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const artC = s => esc(s).replace(/\b(der|die|das)\b(?=\s+[A-ZÄÖÜ])/g, (m, a) => `<b style="color:${COL[a]}">${a}</b>`);
  const HUD = ['bag', 'bFurn', 'bMap', 'clock'];
  const W = { el: null, was: {}, sc: null, hist: [], busy: false, ru: false, dlg: null, setup: false, draft: null };
  function scene() { const g = window.game; return g && g.scene ? g.scene.getScenes(true)[0] : null; }
  function el() {
    if (W.el) return W.el; const e = W.el = document.createElement('div'); e.id = 'fWin'; e.className = 'ui ui-panel-paper';
    e.addEventListener('click', onClick); ['pointerdown', 'pointerup', 'touchstart'].forEach(t => e.addEventListener(t, ev => ev.stopPropagation()));
    e.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 'fIn') { ev.preventDefault(); send($('fIn').value); } });
    ($('ui') || document.body).appendChild(e); return e;
  }
  const isOpen = () => !!W.el && W.el.style.display === 'flex';
  function show() {
    if (window.Mentor && Mentor.isOpen && Mentor.isOpen()) Mentor.close();
    const e = el(); HUD.forEach(k => { const h = $(k); if (h && W.was[k] === undefined) { W.was[k] = h.style.display; h.style.display = 'none'; } });
    document.body.classList.add('mfOpen'); W.sc = scene(); if (W.sc) W.sc.busy = true; e.style.top = (MF.winTop ? MF.winTop() : 58) + 'px'; e.style.display = 'flex'; return e;
  }
  function close() {
    if (W.el) W.el.style.display = 'none'; document.body.classList.remove('mfOpen'); W.dlg = null;
    HUD.forEach(k => { const h = $(k); if (h && W.was[k] !== undefined) h.style.display = W.was[k]; }); W.was = {};
    if (W.sc) W.sc.busy = false; W.sc = null; if (W.rec) { W.rec = false; }
  }
  // выбор пола и имени (первая встреча и «Einstellungen»)
  function setupWin(first) {
    const F = ld() || {}, e = show(); W.setup = true; W.first = !!first; W.draft = { g: F.g || 'f', name: F.name || '' };
    const pt = g => (window.Portraits && Portraits.get('friend_' + g)) || `${BASE}portraits/friend_${g}_neutral.png`;   // Полировка (портреты) 24.11
    const draw = () => {
      const g = W.draft.g, n = noun(g);
      e.innerHTML = `<div class="hd"><img class="pt" src="${pt(g)}" alt=""><div class="t">${first ? 'Hallo! Wie heißt du?' : 'Einstellungen'}<span class="ru">${first ? 'Привет! Как тебя зовут? — выбери, кто будет твоим другом в Stillbach' : 'настройки друга: пол и имя'}</span></div>${first ? '' : '<button class="ui ui-btn" data-x="1">Zurück<span class="ru">назад</span></button>'}</div>
        <div class="body set"><div class="opts">${['m', 'f'].map(k => { const q = noun(k); return `<button class="ui ui-btn${k === g ? ' on' : ''}" data-g="${k}"><span><b style="color:${COL[q.art]}">${q.art}</b> ${q.w}</span><span class="ru">${q.ru}</span></button>`; }).join('')}</div>
          <div><b>Name</b><span class="ru">имя (можно своё)</span></div><div class="inp"><input id="fName" maxlength="14" value="${esc(W.draft.name)}" placeholder="${NAMES[g][0]}" autocomplete="off"></div>
          <div class="opts">${NAMES[g].map(x => `<button class="ui ui-btn" data-nm="${x}" style="min-width:90px;font-size:17px">${x}</button>`).join('')}</div>
          <span class="ru">Только дружба: друг говорит по-немецки на твоём уровне, помогает и подсказывает. Личные данные не спрашивает.</span>
          <div class="btns" style="display:flex;justify-content:flex-end"><button class="ui ui-btn" data-ok="1">Fertig!<span class="ru">готово</span></button></div></div>`;
    };
    W.draw = draw; draw();
  }
  function setupOk() {
    const inp = $('fName'), g = W.draft.g, name = cleanName(inp && inp.value.trim() ? inp.value : NAMES[g][0], g), prev = ld();
    const F = { g, name, met: true, at: (prev && prev.at) || Date.now() }; save(F); W.setup = false;
    const sc = scene(); if (sc) { meetDone(sc); detach(sc); setTimeout(() => attach(sc), 0); }
    W.hist = []; open(); const n = noun(g);
    say({ de: `Hallo, Max! Ich heiße ${name}.`, ru: `Привет, Макс! Меня зовут ${name}.`, src: 'заготовка (урок 1: Ich heiße …)' });
    if (W.first) sys(`${n.my[0].toUpperCase() + n.my.slice(1)} ${name} — ${n.ru}. Тапни по ${g === 'm' ? 'нему' : 'ней'} в мире, чтобы поговорить.`);
  }

  function open() {
    const F = ld(); if (!F || !F.met) return setupWin(true);
    const e = show(); W.setup = false; const n = noun(F.g);
    e.className = 'ui ui-panel-paper' + (W.ru ? ' ru' : '');
    e.innerHTML = `<div class="hd"><img class="pt" src="${(window.Portraits && Portraits.get('friend_' + F.g, 'happy')) || BASE + 'portraits/friend_' + F.g + '_happy.png'}" alt=""><div class="t">${esc(F.name)} <span style="font-size:16px"><b style="color:${COL[n.art]}">${n.art}</b> ${n.w}</span><span class="ru">${n.ru} · немецкий на твоём уровне</span><span class="ai" id="fAi">ИИ: проверяю…</span></div>
        <button class="ui ui-btn${W.ru ? ' on' : ''}" data-ru="1">RU<span class="ru">перевод</span></button><button class="ui ui-btn" data-set="1">⚙<span class="ru">настр.</span></button><button class="ui ui-btn" data-x="1">Tschüss<span class="ru">пока</span></button></div>
      <div class="log" id="fLog"></div>
      <div class="chips">${Object.entries(TOPICS).map(([k, t]) => `<button class="ui ui-btn" data-topic="${k}">${t.de}<span class="ru">${t.ru}</span></button>`).join('')}<button class="ui ui-btn" data-dlg="1">Mini-Dialog<span class="ru">сценка урока</span></button></div>
      <div class="inp"><input id="fIn" lang="de" placeholder="Schreib auf Deutsch… · напиши по-немецки" autocomplete="off"><button class="ui ui-btn" data-mic="1" id="fMic">🎤<span class="ru">сказать</span></button><button class="ui ui-btn" data-send="1">Senden<span class="ru">отправить</span></button></div>`;
    const log = $('fLog'); (W.log || []).forEach(h => log.appendChild(h)); log.scrollTop = 1e6;
    if (!(W.log || []).length) { const g = canned(null); say({ de: 'Hallo, Max!', ru: 'Привет, Макс!', src: 'заготовка' }); if (g && g.de && g.de !== 'Hallo!') say({ de: g.de, ru: g.ru, src: 'реплика урока ' + (g.lid || '') }); }
    MF.AI.status().then(st => { aiBadge(st); if (st.route === 'pc') MF.AI.warm(); });
    return true;
  }
  function aiBadge(st) { const b = $('fAi'); if (!b) return; b.className = 'ai' + (st.route === 'pc' ? '' : ' off'); b.textContent = st.route === 'pc' ? 'ИИ: ПК — свободный разговор' : 'ИИ выкл. — реплики уроков'; b.dataset.route = st.route; }
  function add(cls, html) { const d = document.createElement('div'); d.className = 'm ' + cls; d.innerHTML = html; (W.log = W.log || []).push(d); if (W.log.length > 60) W.log.shift(); const log = $('fLog'); if (log) { log.appendChild(d); log.scrollTop = 1e6; } return d; }
  function say(o) {                                                  // реплика друга: DE крупно, RU мелко (кнопка RU), намёк, источник, 🔊
    const d = add('fr', `<button class="ui ui-btn hr" data-hear="1" title="Hören">🔊</button><div class="de" lang="de">${artC(o.de)}</div><span class="ru">${esc(o.ru || '')}</span>${o.tip ? `<div class="tip">Tipp: <span class="ru" style="display:inline">${esc(o.tip)}</span></div>` : ''}<div class="src">${esc(o.src || '')}</div>`);
    d.dataset.de = o.de; d.dataset.src = o.kind || (/ИИ/.test(o.src || '') ? 'ai' : 'canned');
    if (window.speakDE && !window.__mfMute) speakDE(o.de); return d;
  }
  const sys = t => add('sys', `<span class="ru">${esc(t)}</span>`);
  async function ltTip(text) {                                       // мягкое исправление: первое замечание LanguageTool по фразе игрока
    const F = ld() || {}, names = ['max', 'stillbach', String(F.name || '').toLowerCase()];
    const iss = await MF.AI.lt(text); if (!iss) return null;
    const m = iss.find(x => !names.includes(text.substr(x.offset, x.length).toLowerCase())); if (!m) return '';
    const bad = text.substr(m.offset, m.length); return `проверь «${bad}»${m.rep[0] ? ' — может, «' + m.rep[0] + '»?' : ''}`;
  }
  function sysPrompt(F, lex, ctx) {
    const n = noun(F.g), H = (window.MF && MF.hero) ? MF.hero() : { level: 'A1.1', child: true, age_ru: 'ребёнок' };   // A1: Max — ребёнок (AR 14), друг — ровесник
    return [`Ты — ${F.name}, ${F.g === 'm' ? 'друг' : 'подруга'} (${n.art} ${n.w}) героя Max в игре-деревне Stillbach. Max — ${H.age_ru}, ты тоже ${H.age_ru}: вы ровесники. Родной язык Max — русский, он учит немецкий, уровень ${H.level}.`,
      `Говори по-немецки ТОЛЬКО 1–2 короткие простые фразы (${H.child ? '3–6' : '3–7'} слов), на «du», только словами из списка ниже (и имена). Часто задавай короткий вопрос.`,
      H.child ? 'Говори как ребёнок с ребёнком: просто и весело — про игры, животных, еду, погоду, деревню, огород, рыбалку, задания. Никаких взрослых тем (работа, деньги, офис).'
        : 'Говори как подросток с подростком: просто и весело — про школу, игры, друзей, деревню.',
      'Ты друг: дружелюбно и весело. Никакой романтики, флирта, комплиментов внешности и свиданий — только дружба.',
      'Не говори об опасном и взрослом (насилие, оружие, наркотики, алкоголь, болезни и лекарства, политика, религия, деньги и кредиты, секс). Если просят — мягко предложи тему из мира игры.',
      'Не спрашивай и не повторяй личные данные (настоящее имя, фамилия, адрес, телефон, e-mail, где живёт в реальности).',
      'Если в немецкой фразе Max ошибка — в TIPP мягкий намёк по-русски (какое слово проверить), готовый ответ не давай. Нет ошибки — TIPP пустой.',
      'Мир сейчас: ' + (ctx.ru.join('; ') || 'обычный день в деревне') + '.',
      'Слова, которые Max знает: ' + lex.list.slice(0, 260).join(', ') + '.',
      'Формат строго, без лишнего текста:', 'DE: <твоя реплика>', 'RU: <перевод реплики на русский>', 'TIPP: <намёк по-русски или пусто>'].join('\n');
  }
  async function reply(userText, topic) {                            // один ход: ИИ (если есть) -> фильтр уровня + LanguageTool -> иначе реплика урока
    const F = ld(); if (!F) return; W.busy = true; const wait = add('fr', '<div class="de">…</div><span class="ru" style="display:block">думаю…</span>');
    let tip = null; const done = o => { wait.remove(); W.log = (W.log || []).filter(x => x !== wait); say(o); W.busy = false; };
    try {
      if (userText) tip = await ltTip(userText);
      const st = await MF.AI.status(); aiBadge(st);
      if (st.route !== 'pc') { const c = canned(topic, userText); return done({ de: c.de, ru: c.ru, tip, src: 'без ИИ · реплика урока ' + (c.lid || ''), kind: 'canned' }); }
      const ctx = worldCtx(), lex = lexicon(ctx.de.concat([F.name, 'Max', 'Stillbach']));
      const msgs = [{ role: 'system', content: sysPrompt(F, lex, ctx) }].concat(W.hist.slice(-8));
      msgs.push({ role: 'user', content: topic ? `(Тема: ${TOPICS[topic].ask}. Начни об этом одной короткой фразой.)` : userText });
      const p = MF.AI.warm(); const slow = setTimeout(() => { const r = wait.querySelector('.ru'); if (r) r.textContent = 'думаю… (модель на ПК загружается — до 2 минут)'; }, 1500);
      await Promise.race([p, new Promise(r => setTimeout(r, 300))]);
      const txt = await MF.AI.chat(msgs, 150000, 120); clearTimeout(slow);
      const line = k => ((txt.match(new RegExp('^\\s*' + k + ':\\s*(.*)$', 'im')) || [])[1] || '').replace(/\*\*/g, '').trim();
      let de = line('DE') || (txt.split('\n')[0] || '').trim(), ru = line('RU'), aiTip = line('TIPP');
      const f = levelFilter(de, lex); let kept = f.kept.map(x => x.s);
      if (kept.length && st.lt !== false) {                         // каждая немецкая строка ИИ — через LanguageTool, фраза с ошибкой выкидывается
        const iss = await MF.AI.lt(kept.join(' ')); if (iss && iss.length) { const nm = [String(F.name).toLowerCase(), 'max', 'stillbach']; let pos = 0;
          kept = kept.filter(s => { const a = pos, b = pos + s.length; pos = b + 1; return !iss.some(m => m.offset >= a && m.offset < b && !nm.includes(kept.join(' ').substr(m.offset, m.length).toLowerCase())); }); }
      }
      if (userText) W.hist.push({ role: 'user', content: userText }); else W.hist.push({ role: 'user', content: '(тема: ' + TOPICS[topic].ask + ')' });
      if (!kept.length) { const c = canned(topic, userText); W.hist.push({ role: 'assistant', content: 'DE: ' + c.de + '\nRU: ' + c.ru }); return done({ de: c.de, ru: c.ru, tip: tip || aiTip || null, src: 'ИИ ответил выше уровня — реплика урока ' + (c.lid || ''), kind: 'canned' }); }
      const outDe = kept.join(' '), allS = f.kept.concat(f.dropped).map(x => x.s);
      if (kept.length < allS.length) {                              // выкинутые фразы -> и из перевода (по порядку фраз; не сходится — первые k фраз перевода)
        const rs = String(ru).split(/(?<=[.!?])\s+/).filter(Boolean), sents = String(de).split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
        ru = rs.length === sents.length ? sents.map((s, i) => (kept.includes(s) ? rs[i] : null)).filter(Boolean).join(' ') : rs.slice(0, kept.length).join(' ');
      }
      W.hist.push({ role: 'assistant', content: 'DE: ' + outDe + '\nRU: ' + ru });
      done({ de: outDe, ru, tip: tip || aiTip || null, src: MF.AI.LABEL.pc + (f.dropped.length || f.cut ? ' · упрощено до уровня' : ''), kind: 'ai' });
    } catch (e) { const c = canned(topic, userText); done({ de: c.de, ru: c.ru, tip, src: 'ИИ не ответил — реплика урока ' + (c.lid || ''), kind: 'canned' }); }
  }
  function send(text) {
    text = String(text || '').trim().slice(0, 160); if (!text || W.busy) return; const inp = $('fIn'); if (inp) inp.value = '';
    if (W.dlg) return dlgHeard([text]);
    const r = redact(text); add('me', `<div class="de" lang="de">${esc(r.text)}</div>`); if (r.hit) sys('Личные данные (номер, e-mail) не отправляю — заменил на «…».');
    reply(r.text, null);
  }

  // ---------- мини-диалог: сценка пройденного урока (content dialogs через mentor_data.json); друг читает другую роль, Max — свою (микрофон или «Weiter»)
  function dlgStart() {
    const P = window.MF ? MF.passedLessons() : [], D = MF.D(); const L = (P.length ? P.map(p => p.les) : D ? [D.chapters[1][0]] : []).filter(l => (l.dlg || []).length);
    if (!L.length) return sys('Сценок пока нет — пройди первый урок.');
    W.dlgK = (W.dlgK || 0) + 1; const l = L[(L.length - 1 + W.dlgK) % L.length], d = l.dlg[W.dlgK % l.dlg.length];
    const me = Object.keys(d.roles).find(k => /max/i.test(d.roles[k])) || d.lines[0].r;
    W.dlg = { d, i: 0, me, lid: l.id }; sys(`Mini-Dialog: ${d.title || d.id} · урок ${l.id} · ты — ${d.roles[me] || 'Max'}`); dlgStep();
  }
  const norm = s => toks(s);
  function dlgStep() {
    const G = W.dlg; if (!G) return; const ln = G.d.lines[G.i];
    if (!ln) { W.dlg = null; say({ de: 'Super, Max!', ru: 'Супер, Макс!', src: 'конец сценки ' + G.d.id, kind: 'canned' }); return; }
    if (ln.r !== G.me) { say({ de: ln.de, ru: ln.ru, src: (G.d.roles[ln.r] || '') + ' · ' + G.d.id, kind: 'dlg' }); G.i++; return setTimeout(dlgStep, 900); }
    const d = add('me', `<div class="de" lang="de">${artC(ln.de)}</div><span class="ru" style="display:block">${esc(ln.ru)} — скажи 🎤 или напиши</span><div class="turn"><button class="ui ui-btn" data-dmic="1">🎤 Sag es</button><button class="ui ui-btn" data-dskip="1">→ Weiter</button></div>`);
    d.dataset.turn = G.i;
  }
  function dlgHeard(alts) {
    const G = W.dlg; if (!G) return; const ln = G.d.lines[G.i], t = norm(ln.de);
    const sc = Math.max(0, ...alts.map(a => { const h = norm(a); return t.filter(w => h.includes(w)).length / Math.max(1, t.length); }));
    if (sc >= 0.6) { sys('✓ ' + ln.de); G.i++; return dlgStep(); }
    sys(`Fast! Услышал: «${alts[0] || '…'}». Ещё раз: «${ln.de}» — или «Weiter».`);
  }
  function mic(forDlg) {
    if (W.rec) return; if (!window.SpeechG) return sys('Микрофон здесь недоступен — напиши текстом.');
    const b = $('fMic'); W.rec = true; if (b) b.classList.add('rec'); if (window.toast) toast('Sprich jetzt!', 2500);
    SpeechG.hear().then(alts => { alts = (alts || []).filter(Boolean); if (!alts.length) return sys('Не услышал — скажи ещё раз или напиши.'); if (forDlg || W.dlg) dlgHeard(alts); else send(alts[0]); })
      .catch(e => sys((e && e.message) || 'Микрофон: нет звука — напиши текстом.')).finally(() => { W.rec = false; if (b) b.classList.remove('rec'); });
  }
  function onClick(ev) {
    const t = ev.target.closest('button'); if (!t) return; ev.stopPropagation(); const d = t.dataset;
    if (d.x) { if (W.setup && !ld()) return; return W.setup && ld() && !W.first ? open() : close(); }
    if (W.setup) {
      if (d.g) { const i = $('fName'); W.draft.name = i ? i.value : ''; W.draft.g = d.g; return W.draw(); }
      if (d.nm) { const i = $('fName'); if (i) i.value = d.nm; return; }
      if (d.ok) return setupOk();
      return;
    }
    if (d.ru) { W.ru = !W.ru; W.el.classList.toggle('ru', W.ru); t.classList.toggle('on', W.ru); const lg = $('fLog'); if (lg) lg.scrollTop = 1e6; return; }   // перевод удлиняет реплики — последняя остаётся видна
    if (d.set) return setupWin(false);
    if (d.hear) { const m = t.closest('.m'); if (m && window.speakDE) speakDE(m.dataset.de); return; }
    if (d.topic) { if (W.busy) return; W.dlg = null; add('me', `<div class="de">· ${TOPICS[d.topic].de} ·</div><span class="ru">${TOPICS[d.topic].ru}</span>`); return reply(null, d.topic); }
    if (d.dlg) { if (W.busy) return; return dlgStart(); }
    if (d.dmic) return mic(true);
    if (d.dskip) { if (W.dlg) { W.dlg.i++; dlgStep(); } return; }
    if (d.mic) return mic(false);
    if (d.send) return send(($('fIn') || {}).value);
  }
  (function hook() {
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 50);
    syncParty(ld());
    SCENES.forEach(k => { const s = g.scene.getScene(k); if (!s) return;
      const tryAttach = (n = 0) => { if (!s.sys.isActive()) return; if (s.walker) return meta.then(() => attach(s)); if (n < 60) setTimeout(() => tryAttach(n + 1), 50); };
      s.events.on('create', () => { s.__friend = null; s.__friendMeet = null; setTimeout(() => tryAttach(), 0); });
      s.events.on('shutdown', () => { if (s.__friend && s.__friend.__upd) s.events.off('update', s.__friend.__upd); s.__friend = null; s.__friendMeet = null; if (W.sc === s) close(); });
      if (s.sys.isActive()) tryAttach();
    });
  })();
  window.Friend = { open, close, isOpen, setup: () => setupWin(!ld()), get: ld, set: (g, name) => { const F = { g, name: cleanName(name, g), met: true, at: Date.now() }; save(F); const sc = scene(); if (sc) { meetDone(sc); detach(sc); attach(sc); } return F; },
    reset: () => { try { localStorage.removeItem(KEY); } catch (e) {} syncParty(null); const sc = scene(); if (sc) { detach(sc); attach(sc); } },
    sprite: () => { const sc = scene(); return sc ? sc.__friend || sc.__friendMeet || null : null; }, send, reply, levelFilter, lexicon, prompt: () => { const F = ld() || { g: 'f', name: 'Olga' }, ctx = worldCtx(); return sysPrompt(F, lexicon(ctx.de), ctx); }, canned, pool, redact, dlgStart, view: () => W, TOPICS };
})();
