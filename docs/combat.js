// Бой (смешанный, rpg-design §3): по сцене ходишь в реальном времени, враги бродят и замечают Max; при касании — короткий
// пошаговый бой НА МЕСТЕ (камера остаётся в сцене, снизу панель боя). Сила — немецкий: над врагом существительное без артикля,
// der = Eis (синий), die = Feuer (красный), das = Natur (зелёный): верный артикль — сильный удар, неверный — слабый и слово в «Повтор».
// Sprechen — сказать слово в микрофон (SpeechG): урон ×2 и оглушение. Flucht — 60 %. Комбо: 3 верных артикля подряд → следующий удар ×2.
// API:  Combat.spawnEnemies(sc, points, opts)  points = [[x, y], ...] (ноги врага), opts = { types, entry:[x,y], walkable(x,y), onVictory, onDefeat, onFlee }
//       Combat.update(sc, dtMs) — звать из update() сцены (spawnEnemies подписывается и сам, второй вызов за кадр ничего не делает).
// Слова — только из уроков, пройденных в приложении (сообщение {ds:'progress'} → localStorage ds_proto.app): assets_v3/enemies/words.json.
// Глобальные из main.js: state, store, setCoins, toast, speakDE, $.
(function () {
  const BASE = 'assets_v3/enemies/';
  const COL = { der: '#3a7be0', die: '#e24848', das: '#2f9a4f' }, HEX = { der: 0x3a7be0, die: 0xe24848, das: 0x2f9a4f };
  const ELEM = { der: ['Eis', 'лёд'], die: ['Feuer', 'огонь'], das: ['Natur', 'природа'] };
  const FX = { der: [0xdff4ff, 0x8fd0ff, 0x3a7be0], die: [0xffe27a, 0xff8a2a, 0xe24848], das: [0xe3f7a0, 0x8fdc5c, 0x2f9a4f], hit: [0xffffff, 0xffe9b0, 0xd9b77a], voice: [0xffd23f, 0xfff4b0, 0xffffff] };
  const NOTICE = 230, LOSE = 420, TOUCH = 56, WANDER_V = 38, CHASE_V = 100, SCALE = 3;
  const C = { rng: Math.random, meta: null, words: null };
  const FONT = 'Roboto, "Segoe UI", system-ui, sans-serif';

  // ---------- hero stats (state.lvl / state.xp / state.hp in ds_proto) ----------
  // уровень героя — state.level (его же показывает «Held & Talente» в skills.js), опыт — state.xp
  const lvl = () => (state.level = state.level || state.lvl || 1);
  // навыки (skills.js, только за учёбу): Skills.lvl(id) -> 0..max
  const SK = id => (window.Skills && Skills.lvl ? Skills.lvl(id) || 0 : 0);
  const comboNeed = () => (SK('kombo') > 0 ? 2 : 3);                 // Kombo-Meister: серия со 2-го верного артикля
  const elemK = () => 1 + 0.1 * SK('funke');                         // Funke: +10 % урона стихией за уровень
  const hpMax = () => 40 + 8 * (lvl() - 1);
  const power = () => 4 + (lvl() - 1);
  const xpNeed = l => 50 * l;
  function heroHp(v) { if (v !== undefined) { state.hp = Math.max(0, Math.min(hpMax(), v)); store.set(state); } if (typeof state.hp !== 'number') state.hp = hpMax(); return state.hp; }

  // ---------- words: lessons the app reports as done ----------
  function pool() {
    const W = C.words && C.words.chapters; if (!W) return [];
    let ch = []; try { ch = JSON.parse(localStorage.getItem('ds_proto.app')).chapters || []; } catch (e) {}
    let out = [];
    ch.filter(c => c.done > 0).forEach(c => (W[String(c.n)] || []).slice(0, c.done).forEach(l => out.push(...l.words)));
    C.fallback = out.length < 3;
    if (C.fallback) out = [];
    if (C.fallback) (W['1'] || []).forEach(l => out.push(...l.words));   // ещё ничего не пройдено: слова 1-й главы (первые встречи)
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
      if (!w) w = { art: 'der', w: 'Schleim', ru: 'слизь' };
      used.add(w.w); out.push(w);
    }
    return out;
  }

  // ---------- assets ----------
  function preload(sc) {
    if (!sc.cache.json.exists('cb_meta')) sc.load.json('cb_meta', BASE + 'enemies.json');
    if (!sc.cache.json.exists('cb_words')) sc.load.json('cb_words', BASE + 'words.json');
    const m = C.meta || (sc.cache.json.exists('cb_meta') ? sc.cache.json.get('cb_meta') : null);
    if (m) sheets(sc, m); else sc.load.once('filecomplete-json-cb_meta', (k, t, d) => { sheets(sc, d); });
  }
  function sheets(sc, m) {
    Object.entries(m.types).forEach(([t, d]) => Object.entries(d.anims).forEach(([a, v]) => {
      const key = `en_${t}_${a}`; if (!sc.textures.exists(key)) sc.load.spritesheet(key, BASE + v.file, { frameWidth: m.frame, frameHeight: m.frame });
    }));
  }
  function ready(sc, fn) {
    const ok = () => sc.cache.json.exists('cb_meta') && sc.cache.json.exists('cb_words') && Object.entries(sc.cache.json.get('cb_meta').types).every(([t, d]) => Object.keys(d.anims).every(a => sc.textures.exists(`en_${t}_${a}`)));
    if (ok()) return fn();
    preload(sc); sc.load.once('complete', () => { if (!ok()) { preload(sc); sc.load.once('complete', fn); sc.load.start(); } else fn(); }); sc.load.start();
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
    const e = { sc, type, m, spr, word, hp: m.hp, max: m.hp, atk: m.atk, home: [x, y], state: 'wander', dir: 'down', wt: null, wtime: 0, cool: sc.time.now + 2000, stun: 0, rage: 0, dead: false, known: false };
    e.h = (box[3] - box[1]) * SCALE;
    e.label = sc.add.container(x, y - e.h - 8).setDepth(7000);
    e.lt = txt(sc, 0, 0, word.w, { fontSize: '18px' }).setOrigin(0.5, 1);
    e.lbg = sc.add.graphics(); e.lhp = sc.add.graphics();
    e.label.add([e.lbg, e.lt, e.lhp]); frame(e);
    spr.setInteractive({ useHandCursor: true }).on('pointerup', () => { const F = sc.__cb && sc.__cb.fight; if (F && F.list.includes(e) && !e.dead) { F.target = e; mark(sc); } });
    return e;
  }
  function frame(e) {                                                // рамка слова: цвет по ходу боя
    const F = e.sc.__cb && e.sc.__cb.fight, tgt = F && F.target === e;
    const w = Math.max(64, e.lt.width + 18), h = e.lt.height + 4, y0 = -h - 2; e.lbw = w;
    const col = e.known || e.blick ? HEX[e.word.art] : tgt ? 0xffd23f : e.state === 'chase' || (F && F.list.includes(e)) ? 0xff9a3c : 0xc9a46a;
    e.lbg.clear().fillStyle(0x2e1e12, 0.82).fillRoundedRect(-w / 2, y0, w, h, 6).lineStyle(tgt || e.known || e.blick ? 4 : 3, col, 1).strokeRoundedRect(-w / 2, y0, w, h, 6);
    e.lt.setY(-2);
    const bw = w - 10, k = Math.max(0, e.hp / e.max);
    e.lhp.clear().fillStyle(0x2e1e12, 0.9).fillRect(-bw / 2 - 2, 2, bw + 4, 9).fillStyle(k > 0.5 ? 0x6cc04a : k > 0.25 ? 0xffc23c : 0xe24848, 1).fillRect(-bw / 2, 4, bw * k, 5);
  }
  function setPos(e, x, y) { e.spr.setPosition(x, y).setDepth(y); e.label.setPosition(x, y - e.h - 8 - (e.lift || 0)); }
  function face(e, dx, dy) { e.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); }
  function playE(e, a, then) {
    const k = `en-${e.type}-${a}-${e.dir}`; e.spr.play(k, true);
    if (then) e.spr.once('animationcomplete', then);
  }

  function spawnEnemies(sc, points, opts) {
    opts = opts || {}; const list = [];
    sc.__cb = sc.__cb || { enemies: [], fight: null, opts, last: -1 };
    sc.__cb.opts = opts; sc.__cb.entry = opts.entry || (sc.walker ? [sc.walker.x, sc.walker.y] : null);
    ready(sc, () => {
      C.meta = sc.cache.json.get('cb_meta'); C.words = sc.cache.json.get('cb_words'); anims(sc);
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
    S.enemies.forEach(e => { if (!e.dead) { e.label.setPosition(e.spr.x, e.spr.y - e.h - 8 - (e.lift || 0)); } });
    if (S.fight) { const r = S.fight.ring, t = S.fight.target; if (r && t && !t.dead) r.setPosition(t.spr.x, t.spr.y - 2).setDepth(t.spr.y - 1); return; }
    if (sc.busy) return;
    for (const e of S.enemies) {
      if (e.dead) continue;
      const dx = hero.x - e.spr.x, dy = hero.y - e.spr.y, d = Math.hypot(dx, dy);
      const was = e.state;
      if (now > e.cool && d < NOTICE && !sc.talking) e.state = 'chase'; else if (d > LOSE || now <= e.cool) e.state = 'wander';
      if (was !== e.state) frame(e);
      let tx, ty, v;
      if (e.state === 'chase') { tx = hero.x; ty = hero.y; v = CHASE_V; }
      else {
        if (!e.wt || now > e.wtime) { const a = C.rng() * Math.PI * 2, r = 30 + C.rng() * 110; e.wt = [e.home[0] + Math.cos(a) * r, e.home[1] + Math.sin(a) * r * 0.6]; e.wtime = now + 1800 + C.rng() * 2200; if (!ok(...e.wt)) e.wt = e.home.slice(); }
        tx = e.wt[0]; ty = e.wt[1]; v = WANDER_V;
      }
      const ex = tx - e.spr.x, ey = ty - e.spr.y, dist = Math.hypot(ex, ey);
      if (dist > 4) {
        const step = Math.min(dist, v * dt), nx = e.spr.x + ex / dist * step, ny = e.spr.y + ey / dist * step;
        if (ok(nx, ny)) setPos(e, nx, ny); else if (ok(nx, e.spr.y)) setPos(e, nx, e.spr.y); else if (ok(e.spr.x, ny)) setPos(e, e.spr.x, ny); else e.wtime = 0;
        face(e, ex, ey); playE(e, 'walk');
      } else playE(e, 'idle');
      if (e.state === 'chase' && d < TOUCH && !sc.talking) { startFight(sc, e); break; }
    }
  }

  // ---------- the fight ----------
  function startFight(sc, first) {
    const S = sc.__cb, hero = sc.walker || sc.hero, ok = walkFn(sc, S.opts);
    if (S.fight) return;
    const near = S.enemies.filter(e => !e.dead && e !== first && e.state === 'chase' && Math.hypot(e.spr.x - hero.x, e.spr.y - hero.y) < 220).sort((a, b) => Math.hypot(a.spr.x - hero.x, a.spr.y - hero.y) - Math.hypot(b.spr.x - hero.x, b.spr.y - hero.y)).slice(0, 2);
    const F = S.fight = { list: [first, ...near], target: first, combo: 0, turn: 'hero', busy: true, coins: 0, xp: 0, won: [] };
    if (sc.walkTween) { sc.walkTween.stop(); sc.walkTween = null; }
    if (hero.stop) hero.stop();
    sc.talking = true; if (sc.exitMarker) sc.exitMarker.setVisible(false);
    // positions: enemies stand beside Max (free floor cells), facing him
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
    // labels side by side must not touch: lift every label that would overlap its left neighbour
    const byX = F.list.slice().sort((a, b) => a.slot[0] - b.slot[0]);
    byX.forEach((e, i) => { e.lift = 0; const L = byX[i - 1]; if (L && Math.abs(L.slot[1] - e.slot[1]) < 40 && e.slot[0] - L.slot[0] < (L.lbw + e.lbw) / 2 + 8 && !L.lift) e.lift = e.lt.height + 12; });
    const fx = first.spr.x - hero.x; hero.setFrame && hero.setFrame(fx >= 0 ? 7 : 4);
    showPanel(sc); mark(sc); say('Kampf! Welcher Artikel?', 'Бой! Какой артикль у слова?');
    sc.time.delayedCall(300, () => { aim(sc); F.busy = false; buttons(true); });
  }
  function aim(sc) {                                                 // камера: бойцы в свободной части экрана над панелью (без смены сцены)
    const F = sc.__cb.fight, hero = sc.walker || sc.hero, cam = sc.cameras.main; if (!F) return;
    const all = [hero, ...F.list.filter(e => !e.dead).map(e => e.spr)];
    const pos = F.slots || all.map(s => [s.x, s.y]);                // where everybody stands (the tweens may still run)
    const xs = pos.map(p => p[0]), top = Math.min(...pos.map(p => p[1])) - 130, bot = Math.max(...pos.map(p => p[1])) + 14;
    const panel = $('cb').getBoundingClientRect(), hud = Math.max(...['goal', 'cbHero'].map(k => { const el = $(k); return el && el.offsetParent ? el.getBoundingClientRect().bottom : 0; }));
    const sTop = hud + 8, sBot = panel.top - 8, mid = (sTop + sBot) / 2, vh = cam.height;
    const spanX = Math.max(...xs) - Math.min(...xs) + 150, spanY = bot - top;   // + half a label on each side
    let z = Math.min(cam.zoom, cam.width * 0.96 / spanX, (sBot - sTop) / spanY); z = Math.max(2 / 3, Math.floor(z * 3 + 0.02) / 3);   // art is x3: zoom n/3
    if (F.z0 === undefined) F.z0 = cam.zoom;
    if (z < cam.zoom) cam.setZoom(z);
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
    $('cbWord').textContent = t.known ? t.word.art + ' ' + t.word.w : t.word.w; $('cbWord').style.color = t.known || t.blick ? COL[t.word.art] : '';
    $('cbWordRu').textContent = t.word.ru || ' ';
  }
  function alive(F) { return F.list.filter(e => !e.dead); }
  function act(sc, kind) {
    const S = sc.__cb, F = S && S.fight; if (!F || F.busy || F.turn !== 'hero') return false;
    if (!F.target || F.target.dead) F.target = alive(F)[0];
    const t = F.target, hero = sc.walker || sc.hero; F.busy = true; buttons(false);
    const B = power(), w = t.word;
    if (kind === 'flucht') {
      const ok = C.rng() < 0.6;
      if (ok) { say('Geflohen!', 'Удалось сбежать.'); return sc.time.delayedCall(500, () => endFight(sc, 'flee')), true; }
      say('Flucht misslungen!', 'Сбежать не вышло — враги атакуют.'); sc.time.delayedCall(700, () => enemyTurn(sc)); return true;
    }
    if (kind === 'sprechen') return speak(sc, t), true;
    if (kind === 'heilen') return speak(sc, t, true), true;
    if (kind === 'blick') {                                          // Artikelblick: 1 раз за бой цвет артикля на 3 с, ход не тратится
      F.blick = true; t.blick = true; frame(t); mark(sc); $('cbBlick').style.display = 'none';
      say('Artikelblick: die Farbe zeigt den Artikel.', 'Взгляд артикля: цвет рамки = артикль (3 секунды).');
      sc.time.delayedCall(3000, () => { t.blick = false; if (!t.dead) frame(t); if (sc.__cb && sc.__cb.fight === F) mark(sc); });
      F.busy = false; buttons(true); return true;
    }
    let dmg, pal, col, big = false; const ready = F.comboReady, right = kind === w.art;
    if (kind === 'schlag') { dmg = B; pal = FX.hit; col = '#fff7e0'; say('Schlag!', 'Простой удар.'); }
    else {
      if (window.speakDE) speakDE(w.art + ' ' + w.w);
      if (right) { if (!ready) F.combo++; t.known = true; F.konter = true; dmg = Math.round(B * 2.5 * elemK()); pal = FX[kind]; col = COL[kind]; say('Richtig! ' + w.art + ' ' + w.w + ' — ' + ELEM[kind][0] + '!', 'Верно! ' + w.art + ' ' + w.w + (w.ru ? ' — ' + w.ru : '')); }
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
  function speak(sc, t, heal) {                                      // Sprechen (удар ×2 + оглушение) или Heilen (Heilwort: лечит)
    const w = t.word, F = sc.__cb.fight, target = w.w.toLowerCase(), btn = $(heal ? 'cbHeal' : 'cbSpeak');
    if (heal) say('Heilwort: sag das Wort mit Artikel: … ' + w.w, 'Целебное слово: скажи слово с артиклем — лечит.');
    else say('Sag das Wort mit Artikel: … ' + w.w, 'Скажи слово с артиклем в микрофон: … ' + w.w);
    btn.classList.add('rec');
    const done = alts => {
      btn.classList.remove('rec');
      const n = s => s.toLowerCase().replace(/[.,!?;:"'„“]/g, ' ').replace(/\s+/g, ' ').trim();
      const hit = alts.some(a => (' ' + n(a) + ' ').includes(' ' + target + ' ')), art = alts.some(a => (' ' + n(a) + ' ').includes(' ' + w.art + ' ' + target + ' '));
      if (!hit) { say('Nicht erkannt: „' + (alts[0] || '') + '“', 'Не расслышал слово. Нажми ещё раз или выбери артикль.'); F.busy = false; buttons(true); return; }
      if (art) { t.known = true; F.konter = true; }
      if (heal) {
        const hero = sc.walker || sc.hero, add = Math.max(1, Math.round(hpMax() * 0.15 * SK('heilwort')));
        heroHp(heroHp() + add); heroPlate(true); F.lastHeal = add;
        burst(sc, hero.x, hero.y - 50, [0xe3f7a0, 0x8fdc5c, 0xffffff], 18); floatNum(sc, hero.x, hero.y - 92, '+' + add, '#8fdc5c', true);
        say('Geheilt: +' + add, 'Лечение: +' + add + ' здоровья.'); return sc.time.delayedCall(700, () => enemyTurn(sc));
      }
      const ready = F.comboReady; let dmg = Math.round(power() * 2.5) * 2; t.stun = 1;
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
  function afterHero(sc) {
    const F = sc.__cb.fight; if (!F) return;
    F.list.forEach(e => { if (!e.dead && e.hp <= 0) kill(sc, e); });
    if (!alive(F).length) return sc.time.delayedCall(650, () => victory(sc));
    if (F.target.dead) F.target = alive(F)[0]; mark(sc);
    sc.time.delayedCall(250, () => enemyTurn(sc));
  }
  function kill(sc, e) {
    const F = sc.__cb.fight; e.dead = true; e.known = true; F.coins += e.m.coins; F.xp += e.m.xp; F.won.push(e.word);
    e.lt.setText(e.word.art + ' ' + e.word.w).setColor('#fff7e0'); frame(e); e.lhp.clear();
    playE(e, 'death', () => sc.tweens.add({ targets: [e.spr, e.label], alpha: 0, delay: 500, duration: 400, onComplete: () => { e.spr.setVisible(false); e.label.setVisible(false); } }));
    if (F.ring && F.target === e) { F.ring.destroy(); F.ring = null; }
  }
  function enemyTurn(sc) {
    const F = sc.__cb.fight; if (!F) return;
    F.turn = 'enemies'; buttons(false); say('Die Gegner greifen an …', 'Ход врагов.');
    const hero = sc.walker || sc.hero, q = alive(F).slice(), konter = F.konter && SK('konter') > 0; F.konter = false;
    const next = () => {
      if (!sc.__cb || sc.__cb.fight !== F) return;
      const e = q.shift();
      if (!e) {
        if (!alive(F).length) return sc.time.delayedCall(400, () => victory(sc));   // Konter добил последнего
        if (F.target.dead) { F.target = alive(F)[0]; mark(sc); }
        F.turn = 'hero'; F.busy = false; buttons(true); return say('Dein Zug: Welcher Artikel?', 'Твой ход: какой артикль?');
      }
      if (e.dead) return next();
      if (e.stun > 0) { e.stun--; F.stunSkips = (F.stunSkips || 0) + 1; floatNum(sc, e.spr.x, e.spr.y - e.h - 6, 'betäubt', '#fff4b0'); return sc.time.delayedCall(450, next); }
      face(e, hero.x - e.spr.x, 0); const x0 = e.spr.x, dx = Math.sign(hero.x - x0) * 26;
      playE(e, 'attack', () => !e.dead && playE(e, 'idle'));
      sc.tweens.add({ targets: e.spr, x: x0 + dx, duration: 150, yoyo: true, delay: 120, onUpdate: () => setPos(e, e.spr.x, e.spr.y) });
      sc.time.delayedCall(330, () => {
        const dmg = Math.max(1, e.atk + e.rage * 2 + Math.floor(C.rng() * 3) - 1 - SK('schild')); e.rage = 0;   // Schild der Fälle: броня +1 за уровень
        heroHp(heroHp() - dmg); heroPlate(true); flash(hero, 0xff7a7a); floatNum(sc, hero.x, hero.y - 92, '-' + dmg, '#ff6b5a', false);
        burst(sc, hero.x, hero.y - 40, [0xffffff, 0xff9a7a, 0xe24848], 10);
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
  function victory(sc) {
    const F = sc.__cb.fight; F.turn = 'end';
    const coins = F.coins, xp = F.xp, l0 = lvl();
    setCoins(state.coins + coins); state.xp = (state.xp || 0) + xp;
    while (state.xp >= xpNeed(lvl())) { state.xp -= xpNeed(lvl()); state.level = lvl() + 1; }
    const up = lvl() > l0; if (up) state.hp = hpMax(); store.set(state); heroPlate(true);
    const words = F.won.map(w => `<div class="cb-w"><b style="color:${COL[w.art]}">${w.art}</b> ${w.w}<small class="cb-ru">${w.ru || ''}</small></div>`).join('');
    endPanel(`<div class="cb-big">Sieg!</div><small class="cb-ru">победа</small>
      <div class="cb-gain"><img src="assets_v3/icon_coin.png" alt=""> +${coins} Münzen · +${xp} XP${up ? ' · <b>Stufe ' + lvl() + '!</b>' : ''}</div>
      <small class="cb-ru">+${coins} монет · +${xp} опыта${up ? ' · новый уровень' : ''}</small><div class="cb-words">${words}</div>`, 'Weiter', 'дальше', () => endFight(sc, 'win'));
    if (sc.__cb.opts.onVictory) sc.__cb.opts.onVictory({ coins, xp });
  }
  function defeat(sc) {
    const F = sc.__cb.fight; F.turn = 'end';
    const hero = sc.walker || sc.hero; if (hero.setTint) hero.setTint(0x8a8a9a);
    endPanel(`<div class="cb-big">Niederlage</div><small class="cb-ru">поражение</small>
      <div class="cb-gain">Max ist erschöpft. Zurück zum Eingang.</div><small class="cb-ru">Макс устал — назад ко входу. Монеты за этот бой не получены, остальное цело.</small>`, 'Zum Eingang', 'ко входу', () => endFight(sc, 'lose'));
  }
  function endFight(sc, how) {
    const S = sc.__cb, F = S.fight; if (!F) return;
    const hero = sc.walker || sc.hero, now = sc.time.now;
    if (F.ring) F.ring.destroy();
    F.list.forEach(e => { e.lift = 0; if (!e.dead) { e.cool = now + (how === 'lose' ? 2500 : 4500); e.state = 'wander'; e.wt = e.home.slice(); e.wtime = now + 4000; if (how === 'lose') { e.hp = e.max; e.rage = 0; e.stun = 0; } frame(e); } });
    S.fight = null; hidePanel(); sc.talking = false; if (sc.exitMarker) sc.exitMarker.setVisible(true);
    if (how === 'lose') {
      if (hero.clearTint) hero.clearTint(); heroHp(hpMax()); heroPlate(true);
      if (S.opts.onDefeat) return S.opts.onDefeat(sc);
      const p = S.entry || S.opts.entry; if (p) { hero.setPosition(p[0], p[1]).setDepth(p[1]); if (sc.heroShadow) sc.heroShadow.setPosition(p[0], p[1] - 2); }
      if (window.toast) toast('Zurück am Eingang', 1500);
    }
    if (how === 'flee' && S.opts.onFlee) S.opts.onFlee(sc);
    const cam = sc.cameras.main; cam.panEffect && cam.panEffect.reset && cam.panEffect.reset();
    if (F.z0 !== undefined) cam.setZoom(F.z0);
    sc.camFocus = [hero.x, hero.y - 60]; if (window.camTo) window.camTo(sc, hero.x, hero.y - 60);
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
#cb .cb-row .ui-btn{font-family:inherit;color:#2e1e12;display:flex;flex-direction:column;align-items:center;justify-content:center;height:72px;padding:0 4px;line-height:1.05}
#cb .cb-row .ui-btn b{font-size:22px}#cb .cb-row .ui-btn i{font-style:normal;font-size:14px;font-weight:700;margin-top:1px}
#cb .cb-art b{display:inline-block;min-width:62px;padding:1px 8px 3px;border-radius:6px;color:#fff;font-size:26px!important;text-shadow:0 2px 0 rgba(0,0,0,.35);box-shadow:inset 0 -3px 0 rgba(0,0,0,.25)}
#cb .cb-art.der b{background:#3a7be0}#cb .cb-art.die b{background:#e24848}#cb .cb-art.das b{background:#2f9a4f}
#cb .cb-art.der i{color:#2a5fb4}#cb .cb-art.die i{color:#b8322f}#cb .cb-art.das i{color:#247a3d}
#cb .cb-row2 .ui-btn{height:62px}#cb .ui-btn:disabled{opacity:.75}
#cb .cb-row2{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:1fr}#cb .cb-row2.four .ui-btn b{font-size:19px}#cb .cb-row2 .cb-ru{white-space:nowrap}
#cb .cb-blick{display:none;height:46px;min-height:46px;padding:0 8px;font-family:inherit;color:#2e1e12;flex-direction:column;align-items:center;justify-content:center;line-height:1.05;flex:0 0 auto}
#cb .cb-blick b{font-size:16px}#cb .cb-blick.on{display:inline-flex}#cb #cbHeal{display:none}#cb #cbHeal.on{display:flex}
#cb #cbHeal.rec{box-shadow:0 0 0 3px #40b05c}
#cb #cbSpeak.rec{box-shadow:0 0 0 3px #e24848}
#cb .cb-end{display:none;text-align:center;padding:2px 4px}#cb.done .cb-end{display:block}#cb.done .cb-play{display:none}
#cb .cb-big{font-size:30px;font-weight:800;line-height:1.1}#cb .cb-gain{font-size:18px;margin-top:6px}#cb .cb-gain img{height:22px;vertical-align:-4px;image-rendering:pixelated}
#cb .cb-words{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 14px;margin:8px 0 2px;font-size:18px}#cb .cb-w{text-align:center}
#cb .cb-end .ui-btn{font-family:inherit;color:#2e1e12;height:56px;min-width:170px;margin-top:8px;display:inline-flex;flex-direction:column;align-items:center;justify-content:center}
#cb .cb-end .ui-btn b{font-size:21px}
body.vert #cbHero{top:auto;right:12px}body.vert #cbHero{top:var(--cbTop,66px)}
#cbHero{position:absolute;right:12px;top:10px;display:none;align-items:center;gap:8px;height:auto;min-height:40px;padding:2px 10px;font-size:16px}
#cbHero .cb-hp{width:110px;height:14px;background:#2e1e12;border-radius:3px;padding:2px;box-sizing:border-box}
#cbHero .cb-hp i{display:block;height:100%;background:#6cc04a;border-radius:2px;transition:width .3s}
#cbHero .cb-n{display:flex;flex-direction:column;line-height:1.05}#cbHero .cb-n small{font-size:11px;font-weight:500;opacity:.8}
#cbHero .cb-v{font-size:15px;min-width:44px;text-align:right}`;
    document.head.appendChild(st);
    const p = document.createElement('div'); p.id = 'cb'; p.className = 'ui ui-panel-paper';
    const art = a => `<button class="ui ui-btn cb-art ${a}" data-a="${a}"><b>${a}</b><i>${ELEM[a][0]}</i><small class="cb-ru">${ELEM[a][1]}</small></button>`;
    p.innerHTML = `<div class="cb-play"><div class="cb-head"><div class="cb-target"><b id="cbWord"></b><small class="cb-ru" id="cbWordRu"></small></div>
      <button class="ui ui-btn cb-blick" id="cbBlick" data-a="blick"><b>Artikelblick</b><small class="cb-ru">цвет на 3 с</small></button>
      <div class="cb-combo" id="cbCombo"><span>Kombo <span class="dots">○○○</span></span><small class="cb-ru" id="cbComboRu">комбо: 3 верных → ×2</small></div></div>
      <div class="cb-msg"><div id="cbMsg"></div><small class="cb-ru" id="cbMsgRu"></small></div>
      <div class="cb-row">${art('der')}${art('die')}${art('das')}</div>
      <div class="cb-row cb-row2"><button class="ui ui-btn" data-a="schlag"><b>Schlag</b><small class="cb-ru">удар</small></button><button class="ui ui-btn" id="cbSpeak" data-a="sprechen"><b>Sprechen</b><small class="cb-ru">сказать ×2</small></button><button class="ui ui-btn" id="cbHeal" data-a="heilen"><b>Heilen</b><small class="cb-ru">лечить</small></button><button class="ui ui-btn" data-a="flucht"><b>Flucht</b><small class="cb-ru">сбежать 60 %</small></button></div></div>
      <div class="cb-end" id="cbEnd"></div>`;
    $('ui').appendChild(p);
    p.querySelectorAll('.cb-play button').forEach(b => b.onclick = () => { const sc = scene(); if (sc) act(sc, b.dataset.a); });
    const h = document.createElement('div'); h.id = 'cbHero'; h.className = 'ui ui-nameplate hud';
    h.innerHTML = `<span class="cb-n"><span id="cbHeroName">Max · Stufe 1</span><small>уровень · здоровье</small></span><span class="cb-hp"><i id="cbHeroBar"></i></span><span class="cb-v" id="cbHeroHp"></span>`;
    $('ui').appendChild(h);
  }
  function scene() { const g = window.game; return g && g.scene.getScenes(true).find(s => s.__cb); }
  function heroPlate(on) {
    const h = $('cbHero'); if (!h) return; h.style.display = on ? 'flex' : 'none'; if (!on) return;
    const g = $('goal'); if (g && g.offsetParent) h.style.setProperty('--cbTop', (g.offsetTop + g.offsetHeight + 6) + 'px');   // телефон: строкой ниже монет и цели
    const v = heroHp(), m = hpMax(); $('cbHeroName').textContent = 'Max · Stufe ' + lvl(); $('cbHeroHp').textContent = v + '/' + m;
    const b = $('cbHeroBar'); b.style.width = Math.round(100 * v / m) + '%'; b.style.background = v / m > 0.5 ? '#6cc04a' : v / m > 0.25 ? '#ffc23c' : '#e24848';
  }
  function say(de, ru) { if ($('cbMsg')) { $('cbMsg').textContent = de; $('cbMsgRu').textContent = ru || ''; } }
  function combo(F) { const c = $('cbCombo'), n = comboNeed(); if (!c) return; c.querySelector('.dots').textContent = '●'.repeat(Math.min(n, F.combo)) + '○'.repeat(Math.max(0, n - F.combo)); c.classList.toggle('ready', !!F.comboReady); $('cbComboRu').textContent = F.comboReady ? 'следующий удар ×2' : 'комбо: ' + n + ' верных → ×2'; }
  function buttons(on) { document.querySelectorAll('#cb .cb-play button').forEach(b => b.disabled = !on); }
  let hud = null;                                                    // кнопки сцены прячутся на время боя и возвращаются после
  function showPanel(sc) {
    const p = $('cb'); p.classList.remove('done'); p.style.display = 'block'; heroPlate(true);
    $('cbBlick').classList.toggle('on', SK('artikelblick') > 0); $('cbBlick').style.display = '';   // кнопки навыков — только если навык выучен
    $('cbHeal').classList.toggle('on', SK('heilwort') > 0); p.querySelector('.cb-row2').classList.toggle('four', SK('heilwort') > 0); hud = {}; ['bag', 'bFurn', 'bMap', 'clock'].forEach(k => { const el = $(k); if (el) { hud[k] = el.style.display; el.style.display = 'none'; } }); combo(sc.__cb.fight); buttons(false); }
  function hidePanel() { const p = $('cb'); if (p) { p.style.display = 'none'; p.classList.remove('done'); } if (hud) { Object.entries(hud).forEach(([k, v]) => { if ($(k)) $(k).style.display = v; }); hud = null; } }
  function endPanel(html, de, ru, fn) {
    const p = $('cb'), e = $('cbEnd'); e.innerHTML = html + `<div><button class="ui ui-btn" id="cbEndBtn"><b>${de}</b><small class="cb-ru">${ru}</small></button></div>`;
    p.classList.add('done'); $('cbEndBtn').onclick = fn;
  }

  window.Combat = { spawnEnemies, update, preload, act, addReview, review, heroHp, hpMax, pool,
    get rng() { return C.rng; }, set rng(f) { C.rng = f; }, fight: sc => sc.__cb && sc.__cb.fight, enemies: sc => (sc.__cb ? sc.__cb.enemies : []), start: (sc, e) => startFight(sc, e), aim };
})();
