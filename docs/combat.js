// Бой (смешанный, rpg-design §3): по сцене ходишь в реальном времени, враги бродят и замечают Max; при касании — короткий
// пошаговый бой НА МЕСТЕ (камера остаётся в сцене, снизу панель боя). Сила — немецкий: над врагом существительное из пройденных уроков
// с артиклем в цвете рода (der синий, die красный, das зелёный) и мелко по-русски. der = Eis, die = Feuer, das = Natur:
// верный артикль — сильный удар (×2) и +1 мана, неверный — слабый и слово в «Повтор». Sprechen — слово в микрофон: ×2 и оглушение.
// Zauber — фраза из пройденного голосом (≥90 % сильно, 70–89 средне, <70 слабо, провала нет) или из плиток без микрофона (средне).
// Числа: Stufe 1–50 от опыта; HP = 30 + 6×Stufe; удар = 4 + Stufe; мана = 10 + 1 за каждые 20 слов; Flucht 60 % (навык Flucht 85 %).
// Поражение: Max просыпается дома (Yard у дома героя), найденное остаётся, в подвале теряется только текущий этаж.
// API:  Combat.spawnEnemies(sc, points, opts)  points = [[x, y], ...] (ноги врага), opts = { types, entry:[x,y], walkable(x,y), onVictory, onDefeat, onFlee, defeat:'entry'|'home' }
//       Combat.update(sc, dtMs) — звать из update() сцены (spawnEnemies подписывается и сам, второй вызов за кадр ничего не делает).
// Слова — assets_v3/enemies/nouns.json (style_pick/build_nouns.py из content/chNN); пройденное — localStorage ds_proto.app ({ds:'progress'} от приложения).
// Глобальные из main.js: state, store, setCoins, toast, speakDE, $.
(function () {
  const BASE = 'assets_v3/enemies/';
  const COL = { der: '#3a7be0', die: '#e24848', das: '#2f9a4f' }, HEX = { der: 0x3a7be0, die: 0xe24848, das: 0x2f9a4f };
  const LCOL = { der: '#7fb2ff', die: '#ff7a72', das: '#6fd38a' };   // артикль над врагом: те же цвета рода, светлее — читается на тёмной плашке
  const ELEM = { der: ['Eis', 'лёд'], die: ['Feuer', 'огонь'], das: ['Natur', 'природа'] };
  const FX = { der: [0xdff4ff, 0x8fd0ff, 0x3a7be0], die: [0xffe27a, 0xff8a2a, 0xe24848], das: [0xe3f7a0, 0x8fdc5c, 0x2f9a4f], hit: [0xffffff, 0xffe9b0, 0xd9b77a], voice: [0xffd23f, 0xfff4b0, 0xffffff], heal: [0xe3f7a0, 0x8fdc5c, 0xffffff], mana: [0xcfe0ff, 0x7aa8ff, 0xffffff] };
  const NOTICE = 230, LOSE = 420, TOUCH = 56, WANDER_V = 38, CHASE_V = 100, SCALE = 3, GAP = 48;
  const C = { rng: Math.random, srng: Math.random, meta: null, words: null, nouns: null };
  const FONT = 'Roboto, "Segoe UI", system-ui, sans-serif';
  fetch(BASE + 'nouns.json').then(r => r.json()).then(j => { C.nouns = C.nouns || j; }).catch(() => {});

  // ---------- hero stats (ds_proto: state.level / state.xp / state.hp / state.mana) ----------
  const MAXLVL = 50;
  const lvl = () => (state.level = Math.min(MAXLVL, state.level || state.lvl || 1));
  const SK = id => (window.Skills && Skills.lvl ? Skills.lvl(id) || 0 : 0);   // навыки (skills.js, только за учёбу)
  const comboNeed = () => (SK('kombo') > 0 ? 2 : 3);                 // Kombo-Meister: серия со 2-го верного артикля
  const elemK = () => 1 + 0.1 * SK('funke');                         // Funke: +10 % урона стихией за уровень
  const hpMax = () => 30 + 6 * lvl();
  const power = () => 4 + lvl();
  const xpNeed = l => 50 * l;
  const fleeChance = () => (SK('flucht') > 0 ? 0.85 : 0.6);
  function heroHp(v) { if (v !== undefined) { state.hp = Math.max(0, Math.min(hpMax(), v)); store.set(state); } if (typeof state.hp !== 'number' || state.hp > hpMax()) state.hp = hpMax(); return state.hp; }

  // ---------- what the player passed (ds_proto.app) ----------
  function appCh() { try { return JSON.parse(localStorage.getItem('ds_proto.app')).chapters || []; } catch (e) { return []; } }
  function nounsJson() { return C.nouns || C.words; }
  function passedLessons() {                                         // [{ch, i, les}] of lessons the app reports as done
    const W = nounsJson() && nounsJson().chapters, out = []; if (!W) return out;
    appCh().filter(c => c.done > 0).forEach(c => (W[String(c.n)] || []).slice(0, c.done).forEach((les, i) => out.push({ ch: +c.n, i: i + 1, les })));
    return out;
  }
  function vocab() {                                                 // «слов знаю»: слова пройденных уроков + карточки из сундуков
    let n = passedLessons().reduce((a, p) => a + (p.les.vocab || p.les.words.length), 0);
    try { n += (JSON.parse(localStorage.getItem('ds_proto.inv')) || {}).cards.length || 0; } catch (e) {}
    return n;
  }
  const manaMax = () => 10 + Math.floor(vocab() / 20);
  function mana(v) { if (v !== undefined) { state.mana = Math.max(0, Math.min(manaMax(), v)); store.set(state); } if (typeof state.mana !== 'number' || state.mana > manaMax()) state.mana = manaMax(); return state.mana; }
  const passed = (ch, l) => appCh().some(c => +c.n === ch && c.done >= l);

  // ---------- words: nouns of the lessons the app reports as done ----------
  function pool() {
    const W = nounsJson() && nounsJson().chapters; if (!W) return [];
    let out = []; passedLessons().forEach(p => out.push(...p.les.words));
    C.fallback = out.length < 3;
    if (C.fallback) { out = []; ['1', '2'].forEach(k => (W[k] || []).forEach(l => out.push(...l.words))); }   // ещё ничего не пройдено: существительные глав 1–2
    return out;
  }
  function review() { try { return JSON.parse(localStorage.getItem('ds_proto.review')) || []; } catch (e) { return []; } }
  function addReview(w) { const r = review(), s = w.art + ' ' + w.w; if (!r.includes(s)) { r.push(s); try { localStorage.setItem('ds_proto.review', JSON.stringify(r)); } catch (e) {} } }
  function pickWords(n) {
    const P = pool(), rv = review(), used = new Set(), out = [];
    const fromReview = P.filter(w => rv.includes(w.art + ' ' + w.w));
    for (let i = 0; i < n; i++) {
      const src = fromReview.length && C.rng() < 0.4 ? fromReview : P; let w = null;
      for (let k = 0; k < 30 && (!w || used.has(w.w)); k++) w = src[Math.floor(C.rng() * src.length)];
      if (!w || used.has(w.w)) w = P.find(x => !used.has(x.w)) || P[0];
      if (!w) w = { art: 'der', w: 'Tag', ru: 'день' };
      used.add(w.w); out.push(w);
    }
    return out;
  }

  // ---------- spells (Zauber): a phrase of the lessons passed; open with the lesson that teaches it ----------
  const SPELLS = [
    { id: 'heilwort', de: 'Heilwort', ru: 'лечит сразу', cost: 3, ch: 1, l: 2, ph: ['Danke, gut.', 'Спасибо, хорошо.'] },
    { id: 'erholung', de: 'Erholung', ru: 'лечит 3 хода', cost: 3, ch: 1, l: 2, ph: ['Gute Nacht!', 'Спокойной ночи!'] },
    { id: 'schutz', de: 'Schutz', ru: 'щит на удар', cost: 2, ch: 1, l: 1, ph: ['Ich bin Max.', 'Я Макс.'] },
    { id: 'reinigung', de: 'Reinigung', ru: 'снять яд', cost: 2, ch: 1, l: 1, ph: ['Noch einmal, bitte.', 'Ещё раз, пожалуйста.'] },
    { id: 'halt', de: 'Halt!', ru: 'оглушить', cost: 3, ch: 3, l: 5, ph: ['Hören Sie bitte.', 'Послушайте, пожалуйста.'] },   // Imperativ (гл. 3, урок 5)
    { id: 'feuer', de: 'Feuer', ru: 'die · горение', cost: 2, ch: 1, l: 1, elem: 'die' },
    { id: 'eis', de: 'Eis', ru: 'der · замедление', cost: 2, ch: 1, l: 1, elem: 'der' },
    { id: 'natur', de: 'Natur', ru: 'das · опутать', cost: 2, ch: 1, l: 1, elem: 'das' },
    { id: 'gruppe', de: 'Gruppenheilung', ru: 'лечит отряд', cost: 5, ch: 1, l: 3, ph: ['Wie geht es dir?', 'Как у тебя дела?'], party: true },
  ];
  const party = () => (Array.isArray(state.party) ? state.party : []).filter(Boolean);   // спутники (Brezel …): пока никто не ходит с Max
  const spellOpen = s => passed(s.ch, s.l) && (!s.party || party().length > 0);
  const BAND = s => (s >= 90 ? { k: 1.5, de: 'stark', ru: 'сильно' } : s >= 70 ? { k: 1, de: 'mittel', ru: 'средне' } : { k: 0.6, de: 'schwach', ru: 'слабо' });
  function similar(a, b) {                                           // 0..100: насколько сказанное похоже на фразу (Левенштейн по буквам)
    const n = s => String(s || '').toLowerCase().replace(/[.,!?;:"'„“«»]/g, ' ').replace(/\s+/g, ' ').trim();
    a = n(a); b = n(b); if (!a || !b) return 0; if (a === b) return 100;
    const d = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } }
    return Math.max(0, Math.round(100 * (1 - d[b.length] / Math.max(a.length, b.length))));
  }

  // ---------- assets ----------
  function preload(sc) {
    if (!sc.cache.json.exists('cb_meta')) sc.load.json('cb_meta', BASE + 'enemies.json');
    if (!sc.cache.json.exists('cb_nouns')) sc.load.json('cb_nouns', BASE + 'nouns.json');
    const m = C.meta || (sc.cache.json.exists('cb_meta') ? sc.cache.json.get('cb_meta') : null);
    if (m) sheets(sc, m); else sc.load.once('filecomplete-json-cb_meta', (k, t, d) => { sheets(sc, d); });
  }
  const QUEUED = new Set();                                          // листы врагов, которые уже грузятся (любой сценой): второй раз не ставить — иначе «Texture key already in use»
  function sheets(sc, m) {
    const mine = [];
    Object.entries(m.types).forEach(([t, d]) => Object.entries(d.anims).forEach(([a, v]) => {
      const key = `en_${t}_${a}`; if (sc.textures.exists(key) || QUEUED.has(key)) return;
      QUEUED.add(key); mine.push(key); sc.load.spritesheet(key, BASE + v.file, { frameWidth: m.frame, frameHeight: m.frame });
    }));
    if (mine.length) { const free = () => mine.splice(0).forEach(k => QUEUED.delete(k)); sc.load.once('complete', free); sc.events.once('shutdown', free); }
  }
  function ready(sc, fn, n) {                                         // n: попытки подождать листы, которые грузит другая сцена (≈ 6 с)
    const ok = () => sc.cache.json.exists('cb_meta') && sc.cache.json.exists('cb_nouns') && Object.entries(sc.cache.json.get('cb_meta').types).every(([t, d]) => Object.keys(d.anims).every(a => sc.textures.exists(`en_${t}_${a}`)));
    if (ok() || (n || 0) > 60) return fn();
    preload(sc); sc.load.once('complete', () => { if (ok()) fn(); else sc.time.delayedCall(100, () => ready(sc, fn, (n || 0) + 1)); }); sc.load.start();
  }
  function anims(sc) {
    const m = C.meta;
    Object.entries(m.types).forEach(([t, d]) => Object.entries(d.anims).forEach(([a, v]) => m.rows.forEach((dir, r) => {
      const k = `en-${t}-${a}-${dir}`; if (sc.anims.exists(k)) return;
      const once = a === 'attack' || a === 'hurt' || a === 'death';
      sc.anims.create({ key: k, frames: sc.anims.generateFrameNumbers(`en_${t}_${a}`, { start: r * v.frames, end: r * v.frames + v.frames - 1 }), frameRate: a === 'walk' ? 10 : a === 'idle' ? 6 : 12, repeat: once ? 0 : -1 });
    })));
  }

  // ---------- small canvas helpers ----------
  function txt(sc, x, y, s, st) {
    const t = sc.add.text(x, y, s, Object.assign({ fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#fff7e0', stroke: '#2a170c', strokeThickness: 5 }, st || {}));
    if (t.setResolution) t.setResolution(2); if (t.texture && t.texture.setFilter && Phaser.Textures && Phaser.Textures.FilterMode) t.texture.setFilter(Phaser.Textures.FilterMode.LINEAR); return t;
  }
  function floatNum(sc, x, y, s, color, big) {
    const t = txt(sc, x, y, s, { fontSize: big ? '34px' : '26px', color, strokeThickness: 6 }).setOrigin(0.5, 1).setDepth(9500);
    sc.tweens.add({ targets: t, y: y - 56, duration: 380, ease: 'Cubic.easeOut' });
    sc.tweens.add({ targets: t, alpha: 0, delay: 650, duration: 350, onComplete: () => t.destroy() });
  }
  function burst(sc, x, y, pal, n) {
    for (let k = 0; k < (n || 16); k++) {
      const s = 4 + Math.floor(C.rng() * 3) * 2, d = sc.add.rectangle(x, y, s, s, pal[k % pal.length]).setDepth(9400), a = C.rng() * Math.PI * 2, r = 30 + C.rng() * 50;
      sc.tweens.add({ targets: d, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.7 - 16, angle: 90, alpha: 0, duration: 520 + C.rng() * 200, ease: 'Cubic.easeOut', onComplete: () => d.destroy() });
    }
  }
  function ring(sc, x, y, color) {
    const c = sc.add.circle(x, y, 10).setStrokeStyle(4, color).setDepth(9400);
    sc.tweens.add({ targets: c, radius: 56, alpha: 0, duration: 550, onUpdate: () => c.setRadius && c.setRadius(c.radius), onComplete: () => c.destroy() });
  }
  function flash(spr, color) { if (!spr || !spr.setTint) return; spr.setTint(color); spr.scene.time.delayedCall(140, () => spr.active && spr.clearTint()); }

  // ---------- enemies ----------
  function walkFn(sc, opts) {
    if (opts && opts.walkable) return opts.walkable;
    if (sc.townMask && window.townWalkable) return (x, y) => window.townWalkable(sc, x, y);
    if (sc.o && sc.o.walk) return (x, y) => sc.o.walk.some(([a, b, c, e]) => x >= a && x <= c && y >= b && y <= e);
    return () => true;
  }
  function makeEnemy(sc, type, x, y, word) {
    const m = C.meta.types[type], box = m.box;
    const spr = sc.add.sprite(x, y, `en_${type}_idle`, 0).setScale(SCALE).setOrigin(0.5, (box[3] - 1) / C.meta.frame).setDepth(y);
    spr.play(`en-${type}-idle-down`);
    const e = { sc, type, m, spr, word, hp: m.hp, max: m.hp, atk: m.atk, home: [x, y], state: 'wander', dir: 'down', wt: null, wtime: 0, cool: sc.time.now + 2000, stun: 0, rage: 0, dead: false, known: true, burn: null, slow: 0, tangle: 0, dl: 0, shown: false };
    e.h = (box[3] - box[1]) * SCALE;
    e.label = sc.add.container(x, y - e.h - 8).setDepth(7000);
    e.la = txt(sc, 0, 0, '', { fontSize: '18px', color: '#fff7e0' }).setOrigin(0, 1);   // артикль пуст до ответа (reveal): иначе выбор der/die/das — подсказка
    e.lt = txt(sc, 0, 0, word.w, { fontSize: '18px' }).setOrigin(0, 1);
    e.lru = txt(sc, 0, 0, word.ru || '', { fontSize: '12px', fontStyle: 'normal', color: '#f3e3c3', strokeThickness: 3 }).setOrigin(0.5, 1);
    e.lst = txt(sc, 0, 13, '', { fontSize: '12px', color: '#ffe9b0', strokeThickness: 3 }).setOrigin(0.5, 0);   // статусы врага: brennt / langsam / umrankt / betäubt
    e.lbg = sc.add.graphics(); e.lhp = sc.add.graphics();
    e.label.add([e.lbg, e.la, e.lt, e.lru, e.lhp, e.lst]); frame(e);
    spr.setInteractive({ useHandCursor: true }).on('pointerup', () => { const F = sc.__cb && sc.__cb.fight; if (F && F.list.includes(e) && !e.dead) { F.target = e; mark(sc); } });
    return e;
  }
  function frame(e) {                                                // плашка слова: «der Hund» + мелко «собака», рамка по ходу боя, полоска здоровья
    const F = e.sc.__cb && e.sc.__cb.fight, tgt = F && F.target === e;
    const aw = e.la.text ? e.la.width + 5 : 0, row = aw + e.lt.width, ruH = e.lru.text ? e.lru.height - 2 : 0, wh = e.lt.height;
    const w = Math.max(64, Math.max(row, e.lru.width) + 16), h = wh + ruH + 2, y0 = -h - 2; e.lbw = w; e.lbh = h + 26;
    e.la.setPosition(-row / 2, -2 - ruH); e.lt.setPosition(-row / 2 + aw, -2 - ruH); e.lru.setPosition(0, -1);
    const col = e.blick ? HEX[e.word.art] : tgt ? 0xffd23f : e.state === 'chase' || (F && F.list.includes(e)) ? 0xff9a3c : e.shown ? HEX[e.word.art] : 0xc9a46a;   // цвет рода — только Artikelblick или после ответа
    e.lcol = col;
    e.lbg.clear().fillStyle(0x2e1e12, 0.84).fillRoundedRect(-w / 2, y0, w, h, 6).lineStyle(tgt ? 4 : 3, col, 1).strokeRoundedRect(-w / 2, y0, w, h, 6);
    const bw = w - 10, k = Math.max(0, e.hp / e.max);
    e.lhp.clear().fillStyle(0x2e1e12, 0.9).fillRect(-bw / 2 - 2, 2, bw + 4, 9).fillStyle(k > 0.5 ? 0x6cc04a : k > 0.25 ? 0xffc23c : 0xe24848, 1).fillRect(-bw / 2, 4, bw * k, 5);
    const st = [e.burn && e.burn.n > 0 ? 'brennt' : '', e.slow > 0 ? 'langsam' : '', e.tangle > 0 ? 'umrankt' : '', e.stun > 0 ? 'betäubt' : ''].filter(Boolean).join(' · ');
    if (e.lst.text !== st) e.lst.setText(st);
  }
  function reveal(e) {                                               // после ответа (артикль, голос, стихия) или победы: «der» в цвете рода
    if (!e || e.shown) return; e.shown = true;
    e.la.setText(e.word.art).setColor(LCOL[e.word.art] || '#fff7e0'); frame(e);
  }
  const labelY = e => e.spr.y - e.h - 8 - (e.lift || 0);
  function setPos(e, x, y) { e.spr.setPosition(x, y).setDepth(y); e.label.setPosition(x, labelY(e) - (e.dl || 0)); }
  function face(e, dx, dy) { e.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); }
  function playE(e, a, then) {
    const k = `en-${e.type}-${a}-${e.dir}`; e.spr.play(k, true);
    if (then) e.spr.once('animationcomplete', then);
  }
  function unclutter(S) {                                            // подписи не налезают друг на друга: верхняя уходит выше (плавно)
    const L = S.enemies.filter(e => !e.dead && e.label.visible).map(e => ({ e, x: e.spr.x, b: labelY(e), w: e.lbw || 80, h: e.lbh || 50 })).sort((a, b) => b.b - a.b);
    const placed = [];
    L.forEach(o => {
      let bot = o.b;
      for (let k = 0; k < 8; k++) {
        const hit = placed.find(p => Math.abs(p.x - o.x) < (p.w + o.w) / 2 + 4 && bot > p.top - 2 && bot - o.h < p.bot + 2);
        if (!hit) break; bot = hit.top - 4;
      }
      placed.push({ x: o.x, w: o.w, bot, top: bot - o.h });
      const want = o.b - bot; o.e.dl = Math.abs(want - (o.e.dl || 0)) < 1 ? want : (o.e.dl || 0) + (want - (o.e.dl || 0)) * 0.4;
      o.e.label.setPosition(o.e.spr.x, o.b - o.e.dl);
    });
  }
  function apart(S, e, ok) {                                         // бродячие враги держат дистанцию ≥ 48 px
    for (const o of S.enemies) {
      if (o === e || o.dead) continue;
      let dx = e.spr.x - o.spr.x, dy = e.spr.y - o.spr.y, d = Math.hypot(dx, dy);
      if (d >= GAP) continue;
      if (d < 0.5) { const a = C.rng() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); d = 1; }
      const push = GAP - d + 0.5, nx = e.spr.x + dx / d * push, ny = e.spr.y + dy / d * push;
      if (ok(nx, ny)) setPos(e, nx, ny); else if (ok(nx, e.spr.y)) setPos(e, nx, e.spr.y); else if (ok(e.spr.x, ny)) setPos(e, e.spr.x, ny);
      else { const ox = o.spr.x - dx / d * push, oy = o.spr.y - dy / d * push; if (ok(ox, oy)) setPos(o, ox, oy); }
    }
  }

  function spawnEnemies(sc, points, opts) {
    opts = opts || {}; const list = [];
    sc.__cb = sc.__cb || { enemies: [], fight: null, opts, last: -1 };
    sc.__cb.opts = opts; sc.__cb.entry = opts.entry || (sc.walker ? [sc.walker.x, sc.walker.y] : null);
    ready(sc, () => {
      C.meta = sc.cache.json.get('cb_meta'); C.nouns = sc.cache.json.get('cb_nouns') || C.nouns; anims(sc);
      const types = opts.types || ['slime1', 'slime2', 'orc1'], words = pickWords(points.length);
      points.forEach((p, i) => { const e = makeEnemy(sc, types[i % types.length], p[0], p[1], words[i]); list.push(e); sc.__cb.enemies.push(e); });
      if (!sc.__cb.hooked) { const S = sc.__cb; S.hooked = (t, dt) => update(sc, dt); sc.events.on('update', S.hooked); sc.events.once('shutdown', () => { sc.events.off('update', S.hooked); teardown(sc); }); }
      ui(); heroPlate(true); setTimeout(() => sc.__cb && heroPlate(true), 120);   // ещё раз после подписей ru_labels (плашка цели становится выше)
      if (opts.onReady) opts.onReady(list);
    });
    return list;
  }

  function update(sc, dt) {
    const S = sc.__cb; if (!S || !C.meta) return;
    const now = sc.time.now; if (S.last === now) return; S.last = now; dt = Math.min(dt || 16, 50) / 1000;
    const hero = sc.walker || sc.hero; if (!hero) return;
    const ok = walkFn(sc, S.opts);
    if (S.fight) { unclutter(S); const r = S.fight.ring, t = S.fight.target; if (r && t && !t.dead) r.setPosition(t.spr.x, t.spr.y - 2).setDepth(t.spr.y - 1); return; }
    if (sc.busy) { unclutter(S); return; }
    for (const e of S.enemies) {
      if (e.dead) continue;
      const dx = hero.x - e.spr.x, dy = hero.y - e.spr.y, d = Math.hypot(dx, dy);
      const was = e.state;
      if (now > e.cool && d < NOTICE && !sc.talking) e.state = 'chase'; else if (d > LOSE || now <= e.cool) e.state = 'wander';
      if (was !== e.state) frame(e);
      let tx, ty, v;
      if (e.state === 'chase') { tx = hero.x; ty = hero.y; v = CHASE_V; }
      else {
        if (!e.wt || now > e.wtime) {
          for (let k = 0; k < 4; k++) { const a = C.rng() * Math.PI * 2, r = 30 + C.rng() * 110; e.wt = [e.home[0] + Math.cos(a) * r, e.home[1] + Math.sin(a) * r * 0.6]; if (ok(...e.wt) && !S.enemies.some(o => o !== e && !o.dead && Math.hypot(o.spr.x - e.wt[0], o.spr.y - e.wt[1]) < GAP)) break; }
          e.wtime = now + 1800 + C.rng() * 2200; if (!ok(...e.wt)) e.wt = e.home.slice();
        }
        tx = e.wt[0]; ty = e.wt[1]; v = WANDER_V;
      }
      const ex = tx - e.spr.x, ey = ty - e.spr.y, dist = Math.hypot(ex, ey);
      if (dist > 4) {
        const step = Math.min(dist, v * dt), nx = e.spr.x + ex / dist * step, ny = e.spr.y + ey / dist * step;
        if (ok(nx, ny)) setPos(e, nx, ny); else if (ok(nx, e.spr.y)) setPos(e, nx, e.spr.y); else if (ok(e.spr.x, ny)) setPos(e, e.spr.x, ny); else e.wtime = 0;
        face(e, ex, ey); playE(e, 'walk');
      } else playE(e, 'idle');
      apart(S, e, ok);
      if (e.state === 'chase' && d < TOUCH && !sc.talking) { startFight(sc, e); break; }
    }
    unclutter(S);
  }

  // ---------- the fight ----------
  function startFight(sc, first) {
    const S = sc.__cb, hero = sc.walker || sc.hero, ok = walkFn(sc, S.opts);
    if (S.fight) return;
    const near = S.enemies.filter(e => !e.dead && e !== first && e.state === 'chase' && Math.hypot(e.spr.x - hero.x, e.spr.y - hero.y) < 220).sort((a, b) => Math.hypot(a.spr.x - hero.x, a.spr.y - hero.y) - Math.hypot(b.spr.x - hero.x, b.spr.y - hero.y)).slice(0, 2);
    const F = S.fight = { list: [first, ...near], target: first, combo: 0, turn: 'hero', busy: true, coins: 0, xp: 0, won: [], hero: { poison: 0, stun: 0, regen: null, shield: null } };
    if (sc.walkTween) { sc.walkTween.stop(); sc.walkTween = null; }
    if (hero.stop) hero.stop();
    sc.talking = true; if (sc.exitMarker) sc.exitMarker.setVisible(false);
    const side = first.spr.x >= hero.x ? 1 : -1;
    // one row with Max (labels side by side, nothing above anyone's head); then rows a little higher/lower if the floor is narrow
    const slots = [[side * 112, 0], [-side * 112, 0], [side * 230, 0], [-side * 230, 0], [side * 112, -48], [side * 112, 48], [-side * 112, -48], [-side * 112, 48], [side * 230, -48], [side * 230, 48], [-side * 230, 48], [-side * 230, -48]];
    const taken = [];
    F.list.forEach(e => {
      let best = null;
      for (const [ox, oy] of slots) { const x = hero.x + ox, y = hero.y + oy; if (taken.some(t => Math.abs(t[0] - x) < 100 && Math.abs(t[1] - y) < 60)) continue; if (ok(x, y) && ok((x + hero.x) / 2, (y + hero.y) / 2)) { best = [x, y]; break; } }
      if (!best) best = [e.spr.x, e.spr.y];
      taken.push(best); face(e, hero.x - best[0], 0); playE(e, 'walk');
      sc.tweens.add({ targets: e.spr, x: best[0], y: best[1], duration: 260, onUpdate: () => setPos(e, e.spr.x, e.spr.y), onComplete: () => playE(e, 'idle') });
      frame(e); e.slot = best;
    });
    F.slots = [[hero.x, hero.y], ...taken];
    const byX = F.list.slice().sort((a, b) => a.slot[0] - b.slot[0]);   // labels side by side must not touch: lift the right one
    byX.forEach((e, i) => { e.lift = 0; const L = byX[i - 1]; if (L && Math.abs(L.slot[1] - e.slot[1]) < 40 && e.slot[0] - L.slot[0] < (L.lbw + e.lbw) / 2 + 8 && !L.lift) e.lift = (e.lbh || 50) + 6; });
    const fx = first.spr.x - hero.x; hero.setFrame && hero.setFrame(fx >= 0 ? 7 : 4);
    showPanel(sc); mark(sc); say('Kampf! Welcher Artikel?', 'Бой! Какой артикль у слова?');
    sc.time.delayedCall(300, () => { aim(sc); F.busy = false; buttons(true); });
  }
  function aim(sc) {                                                 // камера: бойцы в свободной части экрана над панелью (без смены сцены)
    const F = sc.__cb.fight, hero = sc.walker || sc.hero, cam = sc.cameras.main; if (!F) return;
    const all = [hero, ...F.list.filter(e => !e.dead).map(e => e.spr)];
    const pos = F.slots || all.map(s => [s.x, s.y]);
    const xs = pos.map(p => p[0]), top = Math.min(...pos.map(p => p[1])) - 150, bot = Math.max(...pos.map(p => p[1])) + 14;
    const panel = $('cb').getBoundingClientRect(), hud = Math.max(...['goal', 'cbHero'].map(k => { const el = $(k); return el && el.offsetParent ? el.getBoundingClientRect().bottom : 0; }));
    const sTop = hud + 8, sBot = panel.top - 8, mid = (sTop + sBot) / 2, vh = cam.height;
    const spanX = Math.max(...xs) - Math.min(...xs) + 150, spanY = bot - top;
    let z = Math.min(F.z0 !== undefined ? F.z0 : cam.zoom, cam.width * 0.96 / spanX, (sBot - sTop) / spanY); z = Math.max(2 / 3, Math.floor(z * 3 + 0.02) / 3);   // art is x3: zoom n/3
    if (F.z0 === undefined) F.z0 = cam.zoom;
    if (z !== cam.zoom) cam.setZoom(z);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (top + bot) / 2 - (mid - cam.y - vh / 2) / cam.zoom;
    cam.pan(cx, cy, 280, 'Sine.easeInOut');
  }
  function mark(sc) {
    const F = sc.__cb.fight; if (!F) return;
    F.list.forEach(e => frame(e));
    if (F.ring) F.ring.destroy();
    const t = F.target; if (!t || t.dead) return;
    F.ring = sc.add.ellipse(t.spr.x, t.spr.y - 2, 64, 20).setStrokeStyle(3, 0xffd23f).setDepth(t.spr.y - 1);
    sc.tweens.add({ targets: F.ring, alpha: 0.4, duration: 500, yoyo: true, repeat: -1 });
    $('cbWord').innerHTML = t.shown ? `<span style="color:${COL[t.word.art]}">${t.word.art}</span> ${t.word.w}` : `<span style="color:#b9a888">…</span> ${t.word.w}`;
    $('cbWordRu').textContent = t.word.ru || ' ';
  }
  function alive(F) { return F.list.filter(e => !e.dead); }
  function gainMana(n, sc) { const m0 = mana(); mana(m0 + n); if (mana() > m0) { heroPlate(true); const h = sc && (sc.walker || sc.hero); if (h) floatNum(sc, h.x + 34, h.y - 70, '+' + (mana() - m0) + ' Mana', '#9cc2ff', false); } }
  function act(sc, kind) {
    const S = sc.__cb, F = S && S.fight; if (!F || F.busy || F.turn !== 'hero') return false;
    if (kind === 'zauber') return magic(true), true;
    if (kind === 'zurueck') return magic(false), true;
    if (!F.target || F.target.dead) F.target = alive(F)[0];
    const t = F.target; F.busy = true; buttons(false);
    const B = power(), w = t.word;
    if (kind === 'flucht') {
      const ok = C.rng() < fleeChance();
      if (ok) { say('Geflohen!', 'Удалось сбежать.'); return sc.time.delayedCall(500, () => endFight(sc, 'flee')), true; }
      say('Flucht misslungen!', 'Сбежать не вышло — враги атакуют.'); sc.time.delayedCall(700, () => enemyTurn(sc)); return true;
    }
    if (kind === 'sprechen') return speak(sc, t), true;
    if (kind === 'heilen') return speak(sc, t, true), true;
    if (kind === 'blick') {                                          // Artikelblick: 1 раз за бой подсветка артикля на 3 с, ход не тратится
      F.blick = true; t.blick = true; frame(t); mark(sc); $('cbBlick').style.display = 'none';
      say('Artikelblick: die Farbe zeigt den Artikel.', 'Взгляд артикля: цвет рамки = артикль (3 секунды).');
      sc.time.delayedCall(3000, () => { t.blick = false; if (!t.dead) frame(t); if (sc.__cb && sc.__cb.fight === F) mark(sc); });
      F.busy = false; buttons(true); return true;
    }
    let dmg, pal, col, big = false; const ready = F.comboReady, right = kind === w.art;
    if (kind === 'schlag') { dmg = B; pal = FX.hit; col = '#fff7e0'; say('Schlag!', 'Простой удар.'); }
    else {
      reveal(t); if (window.speakDE) speakDE(w.art + ' ' + w.w);
      if (right) { if (!ready) F.combo++; F.konter = true; dmg = Math.round(B * 2 * elemK()); pal = FX[kind]; col = COL[kind]; gainMana(1, sc); say('Richtig! ' + w.art + ' ' + w.w + ' — ' + ELEM[kind][0] + '!', 'Верно! ' + w.art + ' ' + w.w + (w.ru ? ' — ' + w.ru : '') + ' · +1 мана'); }
      else { F.combo = 0; F.comboReady = false; dmg = Math.max(1, Math.round(B * 0.5)); pal = FX[kind]; col = '#d8d0c0'; t.rage++; addReview(w); say('Falsch — ' + w.art + ' ' + w.w + '.', 'Неверно: ' + w.art + ' ' + w.w + (w.ru ? ' (' + w.ru + ')' : '') + '. Слово ушло в «Повтор».'); }
    }
    if (ready && (kind === 'schlag' || right)) { dmg *= 2; big = true; F.comboReady = false; F.combo = 0; F.comboHits = (F.comboHits || 0) + 1; floatNum(sc, t.spr.x, t.spr.y - t.h - 70, 'Kombo ×2!', '#ffd23f', false); }
    else if (F.combo >= comboNeed()) { F.comboReady = true; F.combo = comboNeed(); }
    F.lastDmg = dmg; combo(F);
    strike(sc, t, dmg, pal, col, big, () => afterHero(sc));
    return true;
  }
  function strike(sc, t, dmg, pal, col, big, done) {
    const hero = sc.walker || sc.hero, dx = Math.sign(t.spr.x - hero.x) || 1;
    sc.tweens.add({ targets: hero, x: hero.x + dx * 22, duration: 110, yoyo: true, onUpdate: () => sc.heroShadow && sc.heroShadow.setPosition(hero.x, hero.y - 2) });
    sc.time.delayedCall(120, () => {
      burst(sc, t.spr.x, t.spr.y - t.h / 2, pal, big ? 26 : 16); flash(t.spr, pal[1]);
      t.hp = Math.max(0, t.hp - dmg); floatNum(sc, t.spr.x, t.spr.y - t.h - 6, '-' + dmg, col, big); frame(t);
      if (t.hp > 0) playE(t, 'hurt', () => !t.dead && playE(t, 'idle'));
      sc.cameras.main.shake(big ? 140 : 80, big ? 0.006 : 0.003);
      sc.time.delayedCall(520, done);
    });
  }
  function speak(sc, t, heal) {                                      // Sprechen (удар ×2 + оглушение) или Heilen (навык Heilwort: лечит)
    const w = t.word, F = sc.__cb.fight, target = w.w.toLowerCase(), btn = $(heal ? 'cbHeal' : 'cbSpeak');
    if (heal) say('Heilwort: sag das Wort mit Artikel: … ' + w.w, 'Целебное слово: скажи слово с артиклем — лечит.');
    else say('Sag das Wort mit Artikel: … ' + w.w, 'Скажи слово с артиклем в микрофон: … ' + w.w);
    btn.classList.add('rec');
    const done = alts => {
      btn.classList.remove('rec');
      const n = s => s.toLowerCase().replace(/[.,!?;:"'„“]/g, ' ').replace(/\s+/g, ' ').trim();
      const hit = alts.some(a => (' ' + n(a) + ' ').includes(' ' + target + ' ')), art = alts.some(a => (' ' + n(a) + ' ').includes(' ' + w.art + ' ' + target + ' '));
      if (!hit) { say('Nicht erkannt: „' + (alts[0] || '') + '“', 'Не расслышал слово. Нажми ещё раз или выбери артикль.'); F.busy = false; buttons(true); return; }
      reveal(t); if (art) { F.konter = true; }
      if (heal) {
        const hero = sc.walker || sc.hero, add = Math.max(1, Math.round(hpMax() * 0.15 * SK('heilwort')));
        heroHp(heroHp() + add); heroPlate(true); F.lastHeal = add;
        burst(sc, hero.x, hero.y - 50, FX.heal, 18); floatNum(sc, hero.x, hero.y - 92, '+' + add, '#8fdc5c', true);
        say('Geheilt: +' + add, 'Лечение: +' + add + ' здоровья.'); return sc.time.delayedCall(700, () => enemyTurn(sc));
      }
      const ready = F.comboReady; let dmg = Math.round(power() * 2) * 2; t.stun = Math.max(t.stun, 1);
      if (ready) { dmg *= 2; F.comboReady = false; F.combo = 0; F.comboHits = (F.comboHits || 0) + 1; }
      else if (art) { F.combo++; if (F.combo >= comboNeed()) { F.combo = comboNeed(); F.comboReady = true; } }
      F.lastDmg = dmg;
      const echo = SK('echo') > 0; if (echo) alive(F).forEach(e => { e.stun = Math.max(e.stun, 1); });   // Echo-Schrei: оглушает всех рядом
      combo(F); say('Gesprochen! ' + w.art + ' ' + w.w + ' — betäubt!', echo ? 'Сказано! Урон ×2, эхо оглушило всех врагов на ход.' : 'Сказано! Урон ×2, враг оглушён на ход.');
      ring(sc, t.spr.x, t.spr.y - t.h / 2, 0xffd23f); if (echo) alive(F).forEach(e => e !== t && ring(sc, e.spr.x, e.spr.y - e.h / 2, 0xffd23f));
      strike(sc, t, dmg, FX.voice, '#ffd23f', true, () => { if (!t.dead && t.hp > 0) floatNum(sc, t.spr.x, t.spr.y - t.h - 40, 'betäubt', '#fff4b0'); afterHero(sc); });
    };
    if (/[?&]auto/.test(location.search) || window.__cbAutoSpeech) return setTimeout(() => done([w.art + ' ' + w.w]), 300);
    if (!window.SpeechG) return done([]);
    SpeechG.hear().then(done).catch(e => { btn.classList.remove('rec'); say('Mikrofon: kein Ergebnis', e.message || 'Нет звука.'); F.busy = false; buttons(true); });
  }

  // ---------- Zauber: menu of spells + potions (a potion is a turn) ----------
  const NOMIC = ['no-engine', 'insecure', 'denied', 'no-mic', 'service', 'audio-capture', 'busy'];
  function magic(on) {
    const p = $('cb'); if (!p) return; p.classList.toggle('magic', !!on); p.classList.remove('casting');
    if (on) renderMagic(); const sc = scene(); if (sc && sc.__cb && sc.__cb.fight) setTimeout(() => aim(sc), 30);
  }
  function renderMagic() {
    const box = $('cbMagic'), m = mana(), inv = window.Loot ? Loot.inv() : { potions: {} };
    const sp = SPELLS.filter(s => !s.party || party().length > 0);   // Gruppenheilung — только если в отряде есть спутник
    const btn = s => {
      const open = spellOpen(s), cls = s.elem ? ' cb-art ' + s.elem : '';
      return `<button class="ui ui-btn cb-sp${cls}" data-sp="${s.id}" ${open && m >= s.cost ? '' : 'disabled'}><b>${s.de}</b><i>${open ? s.cost + ' Mana' : 'Kap. ' + s.ch + '.' + s.l}</i><small class="cb-ru">${open ? s.ru : 'откроется'}</small></button>`;
    };
    const pot = (k, de, ru) => `<button class="ui ui-btn cb-pot" data-pot="${k}" ${(inv.potions[k] || 0) > 0 ? '' : 'disabled'}><img src="assets_v3/items/${k}.png" alt=""><span><b>${de}</b> ×${inv.potions[k] || 0}<small class="cb-ru">${ru}</small></span></button>`;
    box.innerHTML = `<div class="cb-mhead"><b>Zauber</b> · Mana <b id="cbMagMana">${m}/${manaMax()}</b><small class="cb-ru">магия: скажи фразу из уроков · без микрофона — собери из плиток</small></div>
      <div class="cb-mgrid">${sp.map(btn).join('')}</div>
      <div class="cb-mpots">${pot('heil', 'Heiltrank', 'зелье: +50 % здоровья')}${pot('blick', 'Artikeltrank', 'зелье: следующий удар ×2')}<button class="ui ui-btn cb-back" data-a="zurueck"><b>Zurück</b><small class="cb-ru">назад</small></button></div>`;
    box.querySelectorAll('button').forEach(b => b.onclick = () => { const sc = scene(); if (!sc) return; if (b.dataset.sp) cast(sc, b.dataset.sp); else if (b.dataset.pot) potion(sc, b.dataset.pot); else act(sc, b.dataset.a); });
  }
  function potion(sc, k) {
    const F = sc.__cb.fight; if (!F || F.busy || F.turn !== 'hero' || !window.Loot || !Loot.use(k)) return false;
    F.busy = true; buttons(false); magic(false); const hero = sc.walker || sc.hero; F.lastPotion = k;
    if (k === 'heil') { const add = Math.round(hpMax() * 0.5); heroHp(heroHp() + add); F.lastHeal = add; burst(sc, hero.x, hero.y - 50, FX.heal, 18); floatNum(sc, hero.x, hero.y - 92, '+' + add, '#8fdc5c', true); say('Heiltrank: +' + add, 'Зелье лечения: +' + add + ' здоровья.'); }
    else { F.comboReady = true; F.combo = comboNeed(); combo(F); burst(sc, hero.x, hero.y - 50, FX.voice, 14); say('Artikeltrank: der nächste Treffer ×2!', 'Зелье артикля: следующий верный удар ×2.'); }
    heroPlate(true); sc.time.delayedCall(700, () => enemyTurn(sc)); return true;
  }
  function cast(sc, id, forced) {                                    // forced = { score } (проверки) — иначе голос или плитки
    const F = sc.__cb.fight, s = SPELLS.find(x => x.id === id); if (!F || !s || F.busy || F.turn !== 'hero') return false;
    if (!spellOpen(s)) return say(s.de + ': ab Kapitel ' + s.ch, 'Это заклинание откроется после урока ' + s.ch + '.' + s.l + '.'), false;
    if (mana() < s.cost) return say('Zu wenig Mana', 'Мало маны: верный артикль даёт +1, после боя — полная.'), false;
    if (!F.target || F.target.dead) F.target = alive(F)[0];
    const t = F.target, phrase = s.elem ? [s.elem + ' ' + t.word.w, t.word.ru || ''] : s.ph;
    F.busy = true; buttons(false); F.casting = { s, phrase };
    const fin = (score, how) => { if (!sc.__cb || sc.__cb.fight !== F || !F.casting) return; F.casting = null; effect(sc, s, score, how); };
    if (forced && typeof forced.score === 'number') return fin(forced.score, 'test'), true;
    if (typeof window.__cbSpellScore === 'number') return setTimeout(() => fin(window.__cbSpellScore, 'test'), 200), true;
    const box = $('cbMagic'); $('cb').classList.add('casting');
    box.innerHTML = `<div class="cb-cast"><div class="cb-ph" id="cbPh">${phrase[0]}</div><small class="cb-ru">${phrase[1]} · ${s.de} (${s.cost} Mana)</small>
      <div class="cb-tiles" id="cbTiles"></div><div class="cb-built" id="cbBuilt"></div>
      <div class="cb-crow"><button class="ui ui-btn" id="cbSay"><b>Sprechen</b><small class="cb-ru">сказать фразу</small></button><button class="ui ui-btn" id="cbNoMic"><b>Ohne Mikro</b><small class="cb-ru">собрать из плиток</small></button><button class="ui ui-btn" id="cbCastBack"><b>Zurück</b><small class="cb-ru">отмена</small></button></div></div>`;
    say(s.de + ': sag „' + phrase[0] + '“', 'Скажи фразу в микрофон: ≥90 % — сильно, 70–89 — средне, меньше — слабо. Провала нет.');
    if (window.speakDE) speakDE(phrase[0]);
    const tiles = () => {                                            // без микрофона: собрать фразу из плиток по порядку — сила средняя
      const words = phrase[0].split(/\s+/), built = []; let k = 0;
      $('cbSay').style.display = 'none'; $('cbNoMic').style.display = 'none';
      const order = words.map((w, i) => i).sort(() => C.rng() - 0.5);
      $('cbTiles').innerHTML = order.map(i => `<button class="ui ui-btn cb-tile" data-i="${i}">${words[i]}</button>`).join('');
      say('Bau den Satz: ' + phrase[1], 'Нажимай плитки по порядку фразы.');
      $('cbTiles').querySelectorAll('button').forEach(b => b.onclick = () => {
        if (+b.dataset.i !== k && words[+b.dataset.i] !== words[k]) { b.classList.add('bad'); setTimeout(() => b.classList.remove('bad'), 300); return; }
        built.push(words[k]); k++; b.disabled = true; b.style.visibility = 'hidden'; $('cbBuilt').textContent = built.join(' ');
        if (k >= words.length) setTimeout(() => fin(80, 'tiles'), 250);
      });
    };
    $('cbCastBack').onclick = () => { F.casting = null; F.busy = false; magic(true); buttons(true); say('Dein Zug.', 'Твой ход.'); };
    $('cbNoMic').onclick = tiles;
    $('cbSay').onclick = () => {
      if (window.__cbAutoSpeech || /[?&]auto/.test(location.search)) return fin(100, 'voice');
      if (window.__cbNoMic || !window.SpeechG) return tiles();
      $('cbSay').classList.add('rec');
      SpeechG.hear().then(alts => fin(Math.max(0, ...alts.map(a => similar(a, phrase[0]))), 'voice'))
        .catch(e => { $('cbSay') && $('cbSay').classList.remove('rec'); if (NOMIC.includes(e.code)) tiles(); else fin(0, 'voice'); });   // не расслышал — заклинание слабое, но срабатывает
    };
    if (window.__cbNoMic) tiles();
    return true;
  }
  function effect(sc, s, score, how) {                               // заклинание сработало: сила по проценту совпадения
    const F = sc.__cb.fight, hero = sc.walker || sc.hero, b = how === 'tiles' ? BAND(80) : BAND(score), H = F.hero, t = F.target;
    mana(mana() - s.cost); magic(false); heroPlate(true);
    F.lastSpell = { id: s.id, score, band: b.de, k: b.k, how };
    const tag = ` (${how === 'tiles' ? 'Plättchen' : score + ' %'} · ${b.de})`, tagRu = ` — ${b.ru}${how === 'tiles' ? ', из плиток' : ', ' + score + ' %'}`;
    ring(sc, hero.x, hero.y - 50, s.elem ? HEX[s.elem] : 0x7aa8ff);
    if (s.id === 'heilwort' || s.id === 'gruppe') {
      const add = Math.max(1, Math.round(hpMax() * (s.id === 'gruppe' ? 0.2 : 0.3) * b.k)); heroHp(heroHp() + add); F.lastHeal = add;
      burst(sc, hero.x, hero.y - 50, FX.heal, 18); floatNum(sc, hero.x, hero.y - 92, '+' + add, '#8fdc5c', true);
      say(s.de + ': +' + add + tag, (s.id === 'gruppe' ? 'Лечение отряда' : 'Лечение') + ': +' + add + tagRu);
    } else if (s.id === 'erholung') {
      H.regen = { n: 3, v: Math.max(1, Math.round(hpMax() * 0.1 * b.k)) }; burst(sc, hero.x, hero.y - 50, FX.heal, 12);
      say('Erholung: 3 Züge +' + H.regen.v + tag, 'Отдых: 3 хода по +' + H.regen.v + tagRu);
    } else if (s.id === 'schutz') {
      H.shield = { f: b.k >= 1.5 ? 1 : b.k >= 1 ? 0.7 : 0.4 }; burst(sc, hero.x, hero.y - 50, FX.mana, 14);
      say('Schutz: ' + Math.round(H.shield.f * 100) + ' % vom nächsten Schlag' + tag, 'Щит: гасит ' + Math.round(H.shield.f * 100) + ' % следующего удара' + tagRu);
    } else if (s.id === 'reinigung') {
      const had = H.poison > 0 || H.stun > 0; H.poison = 0; H.stun = 0; if (b.k >= 1.5) heroHp(heroHp() + Math.round(hpMax() * 0.1));
      burst(sc, hero.x, hero.y - 50, FX.mana, 14); say('Reinigung: ' + (had ? 'Gift und Betäubung weg' : 'alles sauber') + tag, 'Очищение: ' + (had ? 'яд и оглушение сняты' : 'и так чисто') + tagRu);
    } else if (s.id === 'halt') {
      t.stun = Math.max(t.stun, b.k >= 1.5 ? 2 : 1); frame(t); ring(sc, t.spr.x, t.spr.y - t.h / 2, 0xffd23f); floatNum(sc, t.spr.x, t.spr.y - t.h - 40, 'Halt!', '#fff4b0');
      say('Halt! ' + t.word.w + ' ist betäubt' + tag, 'Стоп! Враг оглушён на ' + t.stun + ' ход.' + tagRu);
    } else if (s.elem) {                                             // удар стихией: верная стихия артикля — ×2 и эффект, неверная — слабо
      const w = t.word, right = s.elem === w.art; reveal(t);
      let dmg = right ? Math.round(power() * 2 * elemK() * b.k) : Math.max(1, Math.round(power() * 0.5));
      if (right) {
        if (s.elem === 'die') t.burn = { n: 3, v: Math.max(1, Math.round(power() * 0.5 * b.k)) };
        if (s.elem === 'der') t.slow = 3;
        if (s.elem === 'das') t.tangle = b.k >= 1.5 ? 2 : 1;
        gainMana(1, sc); F.konter = true; if (F.comboReady) { dmg *= 2; F.comboReady = false; F.combo = 0; F.comboHits = (F.comboHits || 0) + 1; } else { F.combo++; if (F.combo >= comboNeed()) { F.combo = comboNeed(); F.comboReady = true; } }
        say(s.de + '-Zauber! ' + w.art + ' ' + w.w + ' — ' + { die: 'brennt', der: 'wird langsam', das: 'ist umrankt' }[s.elem] + tag, 'Стихия рода: ' + { die: 'горит 3 хода', der: 'замедлен 3 хода (бьёт вдвое слабее)', das: 'опутан — пропустит ход' }[s.elem] + tagRu);
      } else { F.combo = 0; F.comboReady = false; addReview(w); say('Falsches Element — ' + w.art + ' ' + w.w, 'Не та стихия: ' + w.art + ' ' + w.w + '. Слово ушло в «Повтор».'); }
      F.lastDmg = dmg; combo(F);
      return strike(sc, t, dmg, FX[s.elem], right ? COL[s.elem] : '#d8d0c0', right && b.k >= 1.5, () => { frame(t); afterHero(sc); });
    }
    heroPlate(true); sc.time.delayedCall(700, () => afterHero(sc));
  }

  function afterHero(sc) {
    const F = sc.__cb && sc.__cb.fight; if (!F) return;
    F.list.forEach(e => { if (!e.dead && e.hp <= 0) kill(sc, e); });
    if (!alive(F).length) return sc.time.delayedCall(650, () => victory(sc));
    if (F.target.dead) F.target = alive(F)[0]; mark(sc);
    sc.time.delayedCall(250, () => enemyTurn(sc));
  }
  function kill(sc, e) {
    const F = sc.__cb.fight; e.dead = true; F.coins += e.m.coins; F.xp += e.m.xp; F.won.push(e.word);
    e.burn = null; e.slow = 0; e.tangle = 0; e.stun = 0; reveal(e); frame(e); e.lhp.clear();
    try { if (window.Album) Album.onDefeat(e.type, e.word); } catch (err) { console.warn('Album', err); }   // бестиарий альбома (album.js): тип врага + слово с артиклем
    playE(e, 'death', () => sc.tweens.add({ targets: [e.spr, e.label], alpha: 0, delay: 500, duration: 400, onComplete: () => { e.spr.setVisible(false); e.label.setVisible(false); } }));
    if (F.ring && F.target === e) { F.ring.destroy(); F.ring = null; }
  }
  function enemyTurn(sc) {
    const F = sc.__cb && sc.__cb.fight; if (!F) return;
    F.turn = 'enemies'; buttons(false); say('Die Gegner greifen an …', 'Ход врагов.');
    const hero = sc.walker || sc.hero, q = alive(F).slice(), konter = F.konter && SK('konter') > 0, H = F.hero; F.konter = false;
    const next = () => {
      if (!sc.__cb || sc.__cb.fight !== F) return;
      const e = q.shift();
      if (!e) {
        if (!alive(F).length) return sc.time.delayedCall(400, () => victory(sc));   // Konter / горение добили последнего
        if (F.target.dead) { F.target = alive(F)[0]; mark(sc); }
        return heroTurn(sc);
      }
      if (e.dead) return next();
      if (e.burn && e.burn.n > 0) {                                  // Feuer: горит, урон в начале своего хода
        const v = e.burn.v; e.burn.n--; e.hp = Math.max(0, e.hp - v); F.burnTicks = (F.burnTicks || 0) + 1;
        burst(sc, e.spr.x, e.spr.y - e.h / 2, FX.die, 10); floatNum(sc, e.spr.x, e.spr.y - e.h - 6, '-' + v + ' brennt', '#ff8a2a'); frame(e);
        if (e.hp <= 0) { kill(sc, e); return sc.time.delayedCall(450, next); }
      }
      if (e.tangle > 0) { e.tangle--; F.tangleSkips = (F.tangleSkips || 0) + 1; frame(e); floatNum(sc, e.spr.x, e.spr.y - e.h - 30, 'umrankt', '#8fdc5c'); return sc.time.delayedCall(450, next); }
      if (e.stun > 0) { e.stun--; F.stunSkips = (F.stunSkips || 0) + 1; frame(e); floatNum(sc, e.spr.x, e.spr.y - e.h - 6, 'betäubt', '#fff4b0'); return sc.time.delayedCall(450, next); }
      face(e, hero.x - e.spr.x, 0); const x0 = e.spr.x, dx = Math.sign(hero.x - x0) * 26;
      playE(e, 'attack', () => !e.dead && playE(e, 'idle'));
      sc.tweens.add({ targets: e.spr, x: x0 + dx, duration: 150, yoyo: true, delay: 120, onUpdate: () => setPos(e, e.spr.x, e.spr.y) });
      sc.time.delayedCall(330, () => {
        let dmg = Math.max(1, e.atk + e.rage * 2 + Math.floor(C.rng() * 3) - 1 - SK('schild')); e.rage = 0;   // Schild der Fälle: броня +1 за уровень
        if (e.slow > 0) { dmg = Math.max(1, Math.floor(dmg / 2)); e.slow--; F.slowHits = (F.slowHits || 0) + 1; frame(e); }   // Eis: замедлен — бьёт вдвое слабее
        if (H.shield) { const cut = Math.round(dmg * H.shield.f); dmg -= cut; F.shieldCut = cut; H.shield = null; ring(sc, hero.x, hero.y - 50, 0x7aa8ff); floatNum(sc, hero.x - 30, hero.y - 120, 'Schutz', '#9cc2ff'); }
        F.lastHit = dmg;
        if (dmg > 0) { heroHp(heroHp() - dmg); flash(hero, 0xff7a7a); floatNum(sc, hero.x, hero.y - 92, '-' + dmg, '#ff6b5a', false); burst(sc, hero.x, hero.y - 40, [0xffffff, 0xff9a7a, 0xe24848], 10); }
        if (e.type === 'slime1' && C.srng() < 0.15) { H.poison = 3; floatNum(sc, hero.x + 30, hero.y - 120, 'Gift', '#9be35a'); }   // зелёный слизень: яд (3 хода)
        if (e.type === 'orc1' && C.srng() < 0.1) { H.stun = 1; floatNum(sc, hero.x + 30, hero.y - 120, 'betäubt', '#fff4b0'); }   // орк: оглушение (Max пропускает ход)
        heroPlate(true);
        if (heroHp() <= 0) return sc.time.delayedCall(500, () => defeat(sc));
        if (konter) {                                                // Konter: после верного ответа — ответный удар атаковавшему
          const k = Math.max(1, Math.round(power() * 0.5 * SK('konter'))); F.konterHits = (F.konterHits || 0) + 1;
          return sc.time.delayedCall(260, () => strike(sc, e, k, FX.hit, '#fff7e0', false, () => { if (e.hp <= 0 && !e.dead) kill(sc, e); next(); }));
        }
        sc.time.delayedCall(420, next);
      });
    };
    sc.time.delayedCall(300, next);
  }
  function heroTurn(sc) {                                            // начало хода Max: Erholung лечит, яд жжёт, оглушение — пропуск
    const F = sc.__cb && sc.__cb.fight; if (!F) return; const H = F.hero, hero = sc.walker || sc.hero;
    if (H.regen && H.regen.n > 0) { H.regen.n--; heroHp(heroHp() + H.regen.v); F.regenTicks = (F.regenTicks || 0) + 1; floatNum(sc, hero.x, hero.y - 92, '+' + H.regen.v, '#8fdc5c', false); if (!H.regen.n) H.regen = null; }
    if (H.poison > 0) { H.poison--; const v = 1 + Math.floor(lvl() / 10); heroHp(heroHp() - v); F.poisonTicks = (F.poisonTicks || 0) + 1; floatNum(sc, hero.x + 20, hero.y - 70, '-' + v + ' Gift', '#9be35a', false); }
    heroPlate(true);
    if (heroHp() <= 0) return sc.time.delayedCall(500, () => defeat(sc));
    if (H.stun > 0) { H.stun--; F.heroSkips = (F.heroSkips || 0) + 1; heroPlate(true); say('Max ist betäubt …', 'Макс оглушён и пропускает ход. «Reinigung» снимает оглушение.'); return sc.time.delayedCall(700, () => enemyTurn(sc)); }
    F.turn = 'hero'; F.busy = false; buttons(true); say('Dein Zug: Welcher Artikel?', 'Твой ход: какой артикль?');
  }
  function victory(sc) {
    const F = sc.__cb.fight; F.turn = 'end';
    const coins = F.coins, xp = F.xp, l0 = lvl();
    setCoins(state.coins + coins); state.xp = (state.xp || 0) + xp;
    while (lvl() < MAXLVL && state.xp >= xpNeed(lvl())) { state.xp -= xpNeed(lvl()); state.level = lvl() + 1; }
    const up = lvl() > l0; if (up) state.hp = hpMax(); mana(manaMax()); store.set(state); heroPlate(true);
    const words = F.won.map(w => `<div class="cb-w"><b style="color:${COL[w.art]}">${w.art}</b> ${w.w}<small class="cb-ru">${w.ru || ''}</small></div>`).join('');
    endPanel(`<div class="cb-big">Sieg!</div><small class="cb-ru">победа</small>
      <div class="cb-gain"><img src="assets_v3/icon_coin.png" alt=""> +${coins} Münzen · +${xp} XP${up ? ' · <b>Stufe ' + lvl() + '!</b>' : ''}</div>
      <small class="cb-ru">+${coins} монет · +${xp} опыта${up ? ' · новый уровень' : ''} · мана снова полная</small><div class="cb-words">${words}</div>`, 'Weiter', 'дальше', () => endFight(sc, 'win'));
    if (sc.__cb.opts.onVictory) sc.__cb.opts.onVictory({ coins, xp });
  }
  function defeat(sc) {
    const F = sc.__cb.fight; F.turn = 'end';
    const hero = sc.walker || sc.hero; if (hero.setTint) hero.setTint(0x8a8a9a);
    const home = (sc.__cb.opts.defeat || (sc.scene.key === 'Arena' ? 'entry' : 'home')) === 'home';
    endPanel(`<div class="cb-big">Niederlage</div><small class="cb-ru">поражение</small>
      <div class="cb-gain">${home ? 'Max ist erschöpft und schläft ein …' : 'Max ist erschöpft. Zurück zum Eingang.'}</div><small class="cb-ru">${home ? 'Макс выбился из сил. Он проснётся дома — всё найденное при нём, штрафа нет.' : 'Макс устал — назад ко входу. Монеты за этот бой не получены, остальное цело.'}</small>`,
      home ? 'Weiter' : 'Zum Eingang', home ? 'дальше' : 'ко входу', () => endFight(sc, 'lose'));
  }
  function endFight(sc, how) {
    const S = sc.__cb, F = S && S.fight; if (!F) return;
    const hero = sc.walker || sc.hero, now = sc.time.now;
    if (F.ring) F.ring.destroy();
    F.list.forEach(e => { e.lift = 0; if (!e.dead) { e.cool = now + (how === 'lose' ? 2500 : 4500); e.state = 'wander'; e.wt = e.home.slice(); e.wtime = now + 4000; e.burn = null; e.slow = 0; e.tangle = 0; if (how === 'lose') { e.hp = e.max; e.rage = 0; e.stun = 0; } frame(e); } });
    S.fight = null; hidePanel(); sc.talking = false; if (sc.exitMarker) sc.exitMarker.setVisible(true);
    mana(manaMax()); heroPlate(true);                                // мана — полная после любого боя
    if (how === 'lose') {
      if (hero.clearTint) hero.clearTint(); heroHp(hpMax()); heroPlate(true);
      if (S.opts.onDefeat) return S.opts.onDefeat(sc);
      if ((S.opts.defeat || (sc.scene.key === 'Arena' ? 'entry' : 'home')) === 'home') return wakeHome(sc);
      const p = S.entry || S.opts.entry; if (p) { hero.setPosition(p[0], p[1]).setDepth(p[1]); if (sc.heroShadow) sc.heroShadow.setPosition(p[0], p[1] - 2); }
      sc.time.delayedCall(150, () => floatNum(sc, hero.x, hero.y - 100, 'Zurück am Eingang', '#fff4b0', false));
    }
    if (how === 'flee' && S.opts.onFlee) S.opts.onFlee(sc);
    const cam = sc.cameras.main; cam.panEffect && cam.panEffect.reset && cam.panEffect.reset();
    if (F.z0 !== undefined) cam.setZoom(F.z0);
    sc.camFocus = [hero.x, hero.y - 60]; if (window.camTo) window.camTo(sc, hero.x, hero.y - 60);
  }
  function wakeHome(sc) {                                            // поражение: «Max wacht zu Hause auf» — двор у дома героя, без штрафов
    const key = sc.scene.key, dun = key === 'Dungeon';
    if (dun) try { localStorage.setItem('ds_proto.dunResume', JSON.stringify({ floor: sc.floorNo | 0, from: sc.from || null, seed: sc.from === 'Welt' ? sc.seed : null })); } catch (e) {}   // теряется только этот этаж
    const lay = sc.cache.json.get('lay'), home = lay && lay.house ? [lay.house[0] + 96, lay.house[1] + 30] : null;
    sc.registry.set('spawnAt', home); sc.registry.set('wokeHome', { from: key, floor: dun ? (sc.floorNo | 0) + 1 : 0, t: Date.now() });
    if (window.whereSet) whereSet('Yard');
    sc.busy = true; sc.cameras.main.fadeOut(450, 0, 0, 0);
    sc.cameras.main.once('camerafadeoutcomplete', () => sc.scene.start('Yard'));
  }
  function wakeCard(info) {                                          // короткая плашка по-немецки + мелко по-русски, сама исчезает
    let w = $('cbWake'); if (!w) { w = document.createElement('div'); w.id = 'cbWake'; w.className = 'ui ui-panel-paper'; $('ui').appendChild(w); w.onclick = () => { w.style.display = 'none'; }; }
    w.innerHTML = `<div class="cb-big">Max wacht zu Hause auf.</div><small class="cb-ru">Макс просыпается дома. Монеты, зелья, материалы и карточки — при нём${info && info.floor ? '; в подвале потерян только этаж ' + info.floor : ''}.</small>`;
    w.style.display = 'block'; clearTimeout(wakeCard.t); wakeCard.t = setTimeout(() => { w.style.display = 'none'; }, 4000);
  }
  function teardown(sc) { if (sc.__cb && sc.__cb.fight) { sc.__cb.fight = null; } hidePanel(); heroPlate(false); sc.__cb = null; }

  // ---------- DOM: panel (bottom) + hero plate (top) ----------
  function ui() {
    if ($('cb')) return;
    const st = document.createElement('style'); st.id = 'cbStyle';
    st.textContent = `
#cb{position:absolute;left:10px;right:10px;bottom:10px;display:none;padding:4px 8px 8px;z-index:20;color:#2e1e12}
body:not(.vert) #cb{left:50%;right:auto;width:600px;transform:translateX(-50%)}
#cb .cb-ru{display:block;font-size:13px;font-weight:500;opacity:.8;line-height:1.1;margin-top:1px}
#cb .cb-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;min-height:40px}
#cb .cb-target b{font-size:24px;line-height:1.05}#cb .cb-combo{text-align:right;font-size:16px;white-space:nowrap}
#cb .cb-combo .dots{letter-spacing:2px;color:#b08a52}#cb .cb-combo.ready .dots{color:#e0a400}
#cb .cb-msg{min-height:44px;margin:2px 0 6px;font-size:17px;line-height:1.2}
#cb .cb-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:6px}
#cb .cb-row .ui-btn,#cb .cb-mgrid .ui-btn{font-family:inherit;color:#2e1e12;display:flex;flex-direction:column;align-items:center;justify-content:center;height:72px;padding:0 4px;line-height:1.05}
#cb .cb-row .ui-btn b{font-size:22px}#cb .cb-row .ui-btn i,#cb .cb-mgrid .ui-btn i{font-style:normal;font-size:14px;font-weight:700;margin-top:1px}
#cb .cb-art b{display:inline-block;min-width:62px;padding:1px 8px 3px;border-radius:6px;color:#fff;font-size:26px!important;text-shadow:0 2px 0 rgba(0,0,0,.35);box-shadow:inset 0 -3px 0 rgba(0,0,0,.25)}
#cb .cb-art.der b{background:#3a7be0}#cb .cb-art.die b{background:#e24848}#cb .cb-art.das b{background:#2f9a4f}
#cb .cb-art.der i{color:#2a5fb4}#cb .cb-art.die i{color:#b8322f}#cb .cb-art.das i{color:#247a3d}
#cb .cb-row2 .ui-btn{height:62px}#cb .ui-btn:disabled{opacity:.6}
#cb .cb-row2{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:1fr}#cb .cb-row2 .ui-btn b{font-size:19px}#cb .cb-row2.five .ui-btn b{font-size:17px}#cb .cb-row2 .cb-ru{white-space:nowrap;font-size:12px}
#cb .cb-blick{display:none;height:46px;min-height:46px;padding:0 8px;font-family:inherit;color:#2e1e12;flex-direction:column;align-items:center;justify-content:center;line-height:1.05;flex:0 0 auto}
#cb .cb-blick b{font-size:16px}#cb .cb-blick.on{display:inline-flex}#cb #cbHeal{display:none}#cb #cbHeal.on{display:flex}
#cb #cbHeal.rec,#cb #cbSay.rec{box-shadow:0 0 0 3px #40b05c}
#cb #cbSpeak.rec{box-shadow:0 0 0 3px #e24848}
#cb #cbZauber b{color:#3f4fb5}
#cb .cb-magic{display:none}#cb.magic .cb-magic{display:block}#cb.magic .cb-main{display:none}
#cb .cb-mhead{font-size:17px;margin:2px 0 4px}#cb .cb-mhead b{font-size:18px}
#cb .cb-mgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}#cb.casting .cb-mgrid,#cb.casting .cb-mpots,#cb.casting .cb-mhead{display:none}
#cb .cb-mgrid .ui-btn{height:64px}#cb .cb-mgrid .ui-btn b{font-size:17px;white-space:nowrap}#cb .cb-mgrid .cb-ru{font-size:11px;white-space:nowrap}
#cb .cb-mgrid .cb-art b{font-size:17px!important;min-width:0;padding:0 8px 2px}
#cb .cb-mpots{display:grid;grid-template-columns:1fr 1fr 96px;gap:6px;margin-top:6px}
#cb .cb-mpots .ui-btn{font-family:inherit;color:#2e1e12;height:58px;padding:0 6px;display:flex;align-items:center;justify-content:center;gap:6px;line-height:1.05;text-align:left}
#cb .cb-mpots img{height:32px;image-rendering:pixelated}#cb .cb-mpots b{font-size:15px}#cb .cb-mpots .cb-ru{font-size:11px}
#cb .cb-mpots .cb-back{flex-direction:column;text-align:center}#cb .cb-mpots .cb-back b{font-size:17px}
#cb .cb-cast{text-align:center}#cb .cb-ph{font-size:26px;font-weight:800;line-height:1.15;margin:2px 0}
#cb .cb-tiles{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:6px 0 2px;min-height:4px}
#cb .cb-tile{font-family:inherit;color:#2e1e12;font-size:20px;height:50px;padding:0 14px}#cb .cb-tile.bad{box-shadow:0 0 0 3px #e24848}
#cb .cb-built{min-height:24px;font-size:20px;font-weight:700;color:#3f4fb5}
#cb .cb-crow{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:4px}
#cb .cb-crow .ui-btn{font-family:inherit;color:#2e1e12;height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.05}#cb .cb-crow b{font-size:18px}
#cb .cb-end{display:none;text-align:center;padding:2px 4px}#cb.done .cb-end{display:block}#cb.done .cb-play{display:none}
#cb .cb-big,#cbWake .cb-big{font-size:30px;font-weight:800;line-height:1.1}#cb .cb-gain{font-size:18px;margin-top:6px}#cb .cb-gain img{height:22px;vertical-align:-4px;image-rendering:pixelated}
#cb .cb-words{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 14px;margin:8px 0 2px;font-size:18px}#cb .cb-w{text-align:center}
#cb .cb-end .ui-btn{font-family:inherit;color:#2e1e12;height:56px;min-width:170px;margin-top:8px;display:inline-flex;flex-direction:column;align-items:center;justify-content:center}
#cb .cb-end .ui-btn b{font-size:21px}
#cbWake{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);width:440px;max-width:86%;display:none;text-align:center;padding:10px 14px 12px;color:#2e1e12;z-index:65}
#cbWake .cb-ru{display:block;font-size:15px;font-weight:500;opacity:.85;margin-top:4px;line-height:1.25}
body.vert #cbHero{top:var(--cbTop,66px);right:12px}
#cbHero{position:absolute;right:12px;top:10px;display:none;align-items:center;gap:8px;height:auto;min-height:40px;padding:3px 10px;font-size:16px}
#cbHero .cb-bars{display:flex;flex-direction:column;gap:3px}
#cbHero .cb-hp,#cbHero .cb-mp{width:110px;height:14px;background:#2e1e12;border-radius:3px;padding:2px;box-sizing:border-box}#cbHero .cb-mp{height:11px}
#cbHero .cb-hp i,#cbHero .cb-mp i{display:block;height:100%;background:#6cc04a;border-radius:2px;transition:width .3s}#cbHero .cb-mp i{background:#4f86e8}
#cbHero .cb-n{display:flex;flex-direction:column;line-height:1.05}#cbHero .cb-n small{font-size:11px;font-weight:500;opacity:.8}
#cbHero .cb-v{display:flex;flex-direction:column;font-size:15px;min-width:44px;text-align:right;line-height:1.05}#cbHero .cb-v .mp{font-size:12px;color:#2f5cb0}
#cbHero .cb-st{font-size:11px;color:#7a3b1c;font-weight:700}`;
    document.head.appendChild(st);
    const p = document.createElement('div'); p.id = 'cb'; p.className = 'ui ui-panel-paper';
    const art = a => `<button class="ui ui-btn cb-art ${a}" data-a="${a}"><b>${a}</b><i>${ELEM[a][0]}</i><small class="cb-ru">${ELEM[a][1]}</small></button>`;
    p.innerHTML = `<div class="cb-play"><div class="cb-head"><div class="cb-target"><b id="cbWord"></b><small class="cb-ru" id="cbWordRu"></small></div>
      <button class="ui ui-btn cb-blick" id="cbBlick" data-a="blick"><b>Artikelblick</b><small class="cb-ru">цвет на 3 с</small></button>
      <div class="cb-combo" id="cbCombo"><span>Kombo <span class="dots">○○○</span></span><small class="cb-ru" id="cbComboRu">комбо: 3 верных → ×2</small></div></div>
      <div class="cb-msg"><div id="cbMsg"></div><small class="cb-ru" id="cbMsgRu"></small></div>
      <div class="cb-main"><div class="cb-row">${art('der')}${art('die')}${art('das')}</div>
      <div class="cb-row cb-row2"><button class="ui ui-btn" data-a="schlag"><b>Schlag</b><small class="cb-ru">удар</small></button><button class="ui ui-btn" id="cbSpeak" data-a="sprechen"><b>Sprechen</b><small class="cb-ru">сказать ×2</small></button><button class="ui ui-btn" id="cbZauber" data-a="zauber"><b>Zauber</b><small class="cb-ru">магия · зелья</small></button><button class="ui ui-btn" id="cbHeal" data-a="heilen"><b>Heilen</b><small class="cb-ru">лечить</small></button><button class="ui ui-btn" data-a="flucht"><b>Flucht</b><small class="cb-ru" id="cbFleeRu">сбежать 60 %</small></button></div></div>
      <div class="cb-magic" id="cbMagic"></div></div>
      <div class="cb-end" id="cbEnd"></div>`;
    $('ui').appendChild(p);
    p.querySelectorAll('.cb-main button, .cb-head button').forEach(b => b.onclick = () => { const sc = scene(); if (sc) act(sc, b.dataset.a); });
    const h = document.createElement('div'); h.id = 'cbHero'; h.className = 'ui ui-nameplate hud';
    h.innerHTML = `<span class="cb-n"><span id="cbHeroName">Max · Stufe 1</span><small>здоровье · мана</small><span class="cb-st" id="cbHeroSt"></span></span><span class="cb-bars"><span class="cb-hp"><i id="cbHeroBar"></i></span><span class="cb-mp"><i id="cbHeroMpBar"></i></span></span><span class="cb-v"><span id="cbHeroHp"></span><span class="mp" id="cbHeroMp"></span></span>`;
    $('ui').appendChild(h);
  }
  function scene() { const g = window.game; return g && g.scene.getScenes(true).find(s => s.__cb); }
  function heroPlate(on) {
    const h = $('cbHero'); if (!h) return; h.style.display = on ? 'flex' : 'none'; if (!on) return;
    const g = $('goal'); if (g && g.offsetParent) h.style.setProperty('--cbTop', (g.offsetTop + g.offsetHeight + 6) + 'px');   // телефон: строкой ниже монет и цели
    const v = heroHp(), m = hpMax(), mp = mana(), mm = manaMax(); $('cbHeroName').textContent = 'Max · Stufe ' + lvl(); $('cbHeroHp').textContent = v + '/' + m; $('cbHeroMp').textContent = mp + '/' + mm + ' Mana';
    const b = $('cbHeroBar'); b.style.width = Math.round(100 * v / m) + '%'; b.style.background = v / m > 0.5 ? '#6cc04a' : v / m > 0.25 ? '#ffc23c' : '#e24848';
    $('cbHeroMpBar').style.width = Math.round(100 * mp / mm) + '%';
    const sc = scene(), F = sc && sc.__cb && sc.__cb.fight, H = F && F.hero;
    $('cbHeroSt').textContent = H ? [H.poison > 0 ? 'Gift ' + H.poison : '', H.stun > 0 ? 'betäubt' : '', H.shield ? 'Schutz' : '', H.regen ? 'Erholung ' + H.regen.n : ''].filter(Boolean).join(' · ') : '';
    const mm2 = $('cbMagMana'); if (mm2) mm2.textContent = mp + '/' + mm;
  }
  function say(de, ru) { if ($('cbMsg')) { $('cbMsg').textContent = de; $('cbMsgRu').textContent = ru || ''; } }
  function combo(F) { const c = $('cbCombo'), n = comboNeed(); if (!c) return; c.querySelector('.dots').textContent = '●'.repeat(Math.min(n, F.combo)) + '○'.repeat(Math.max(0, n - F.combo)); c.classList.toggle('ready', !!F.comboReady); $('cbComboRu').textContent = F.comboReady ? 'следующий удар ×2' : 'комбо: ' + n + ' верных → ×2'; }
  function buttons(on) { document.querySelectorAll('#cb .cb-main button, #cb .cb-head button').forEach(b => b.disabled = !on); if ($('cb') && $('cb').classList.contains('magic') && !$('cb').classList.contains('casting') && on) renderMagic(); }
  let hud = null;                                                    // кнопки сцены прячутся на время боя и возвращаются после
  function showPanel(sc) {
    const p = $('cb'); p.classList.remove('done', 'magic', 'casting'); p.style.display = 'block'; heroPlate(true);
    $('cbBlick').classList.toggle('on', SK('artikelblick') > 0); $('cbBlick').style.display = '';   // кнопки навыков — только если навык выучен
    $('cbHeal').classList.toggle('on', SK('heilwort') > 0); p.querySelector('.cb-row2').classList.toggle('five', SK('heilwort') > 0);
    $('cbFleeRu').textContent = 'сбежать ' + Math.round(fleeChance() * 100) + ' %';
    hud = {}; ['bag', 'bFurn', 'bMap', 'clock', 'qTrack'].forEach(k => { const el = $(k); if (el) { hud[k] = el.style.display; el.style.display = 'none'; } }); combo(sc.__cb.fight); buttons(false); }
  function hidePanel() { const p = $('cb'); if (p) { p.style.display = 'none'; p.classList.remove('done', 'magic', 'casting'); } if (hud) { Object.entries(hud).forEach(([k, v]) => { if ($(k)) $(k).style.display = v; }); hud = null; } }
  function endPanel(html, de, ru, fn) {
    const p = $('cb'), e = $('cbEnd'); p.classList.remove('magic', 'casting'); e.innerHTML = html + `<div><button class="ui ui-btn" id="cbEndBtn"><b>${de}</b><small class="cb-ru">${ru}</small></button></div>`;
    p.classList.add('done'); $('cbEndBtn').onclick = fn;
  }
  (function hook() {                                                 // после поражения: Yard у дома героя + плашка «Max wacht zu Hause auf»
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 50);
    const y = g.scene.getScene('Yard'); if (y) y.events.on('create', () => { const w = y.registry.get('wokeHome'); if (w) { y.registry.set('wokeHome', null); setTimeout(() => wakeCard(w), 350); } });
  })();

  window.Combat = { spawnEnemies, update, preload, act, addReview, review, heroHp, hpMax, pool, mana, manaMax, vocab, power, lvl, xpNeed, SPELLS, spellOpen, cast, potion, similar, passedLessons, magic,
    get rng() { return C.rng; }, set rng(f) { C.rng = f; }, get srng() { return C.srng; }, set srng(f) { C.srng = f; }, fleeChance,
    fight: sc => sc.__cb && sc.__cb.fight, enemies: sc => (sc.__cb ? sc.__cb.enemies : []), start: (sc, e) => startFight(sc, e), aim, wakeHome };
})();
