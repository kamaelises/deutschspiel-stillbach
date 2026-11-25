// restore.js - window.Restore: restoration of Stillbach like Gardenscapes (Код экономика 24.11). Tasks: assets_v3/world/restore.json, prices: economy.json (Eco).
// A1 = Max is a child: small things he does himself (das Namensschild, das Blumenbeet, cleaning der Brunnen) for a few coins (das Taschengeld),
// big objects (der Uhrturm) - he only helps the adults (Bauarbeiter) and gets coins. Stars are a threshold only (never spent). A timer runs, the scene
// shows the work (dust, shaking, the worker's animation, a bar «noch 0:12»); the timer goes on while Max is away. After «Fertig» the look can be changed free.
// API: Restore.ready, tasks(), info(id) -> {st: none|work|done, v, left, cost, need, helped}, can(id) -> {ok, why, de, ru}, start(id, variant), setVariant(id, v),
//      done(id), helped(), tap(id) (walk + panel), close(), secOf(t), variants(id); skills: Skills.fx('restore.speed') (-0.15 = 15 % faster), fx('restore.variants') (+1 look).
//      Event: window 'ds:restore' {t: start|done|look, id}. Test hook: Restore._finishNow(id).
(function () {
  const COL = { der: '#3a7be0', die: '#e24848', das: '#2f9a4f' };
  const LK = 'ds_proto.restore', HUD = ['bag', 'bFurn', 'bMap'];
  let RJ = { tasks: [], img: 'assets_v3/world/restore/', variants_base: 3 }, sc = null, objs = {}, was = {}, busyOwner = null, openId = null;
  const ready = fetch('assets_v3/world/restore.json').then(r => r.json()).then(j => { RJ = j; return j; }).catch(() => RJ);
  function load() { let v = null; try { v = JSON.parse(localStorage.getItem(LK)); } catch (e) {} v = v && typeof v === 'object' ? v : {}; v.t = v.t || {}; v.help = v.help || { n: 0 }; return v; }
  const save = v => { try { localStorage.setItem(LK, JSON.stringify(v)); } catch (e) {} };
  const task = id => RJ.tasks.find(t => t.id === id);
  const fx = k => { try { return window.Skills && typeof Skills.fx === 'function' ? +Skills.fx(k) || 0 : 0; } catch (e) { return 0; } };
  const secOf = t => Math.max(5, Math.round(t.sec * Math.max(0.4, 1 + fx('restore.speed'))));
  const helpPay = () => (window.Eco ? Eco.price('earn', 'help', 2) : 2);
  const costOf = t => (t.kind === 'help' ? 0 : window.Eco ? Eco.price('restore', t.id, t.cost_fb) : t.cost_fb);
  const variantsOf = t => (t.variants || []).slice(0, (RJ.variants_base || 3) + Math.max(0, Math.round(fx('restore.variants'))));
  const stars = () => (window.Eco ? Eco.stars() : 0), coins = () => (window.Eco ? Eco.coins() : 0);
  const fire = (t, id) => { try { dispatchEvent(new CustomEvent('ds:restore', { detail: { t, id } })); } catch (e) {} };
  const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function plotOf(t) {
    if (!t.plot) return null; const g = window.game, T = g && g.cache && g.cache.json.get('town'); const p = T && (T.plots || []).find(q => q.key === t.plot);
    return p ? { p, stage: typeof window.plotStage === 'function' ? window.plotStage(p) : 1 } : null;
  }
  function tick() {                                               // finish what is over (also while Max was away)
    const v = load(), now = Date.now(), fin = [];
    Object.keys(v.t).forEach(id => { const s = v.t[id], t = task(id); if (!t || s.st !== 'work' || s.end > now) return;
      if (t.kind === 'help') { delete v.t[id]; v.help.n = (v.help.n || 0) + 1; } else s.st = 'done'; fin.push(t); });
    if (fin.length) { save(v); fin.forEach(t => { const paid = t.kind === 'help' && window.Eco ? Eco.earn(helpPay(), 'help ' + t.id, 'help') : 0; fire('done', t.id); finished(t, paid); }); }
    return v;
  }
  function info(id) {
    const t = task(id); if (!t) return null; const v = tick(), s = v.t[id] || {};
    return { st: s.st || 'none', v: s.v || null, left: s.st === 'work' ? Math.max(0, s.end - Date.now()) : 0, end: s.end || 0, cost: costOf(t), need: t.stars || 0, sec: secOf(t), helped: v.help.n || 0, kind: t.kind };
  }
  function can(id) {
    const t = task(id); if (!t) return { ok: false, why: 'none', de: '?', ru: 'нет такой задачи' };
    const v = tick(), s = v.t[id] || {};
    if (s.st === 'work') return { ok: false, why: 'work', de: 'Max arbeitet schon daran.', ru: 'Max уже над этим работает.' };
    if (s.st === 'done') return { ok: false, why: 'done', de: 'Fertig!', ru: 'уже готово' };
    const other = Object.keys(v.t).find(k => v.t[k].st === 'work');
    if (other) { const o = task(other); return { ok: false, why: 'busy', de: 'Max ist beschäftigt: ' + (o ? o.de : other) + '.', ru: 'Max уже занят другим делом — подожди, пока закончит.' }; }
    if (t.kind === 'help') {
      const P = plotOf(t); if (!P || P.stage < (t.min_stage || 2)) return { ok: false, why: 'stage', de: 'Die Baustelle beginnt ' + (P && window.DSMode ? DSMode.lock(P.p.chapter).de : 'ab Kapitel ' + (P ? P.p.chapter : '?')) + '.', ru: 'стройка начнётся ' + (P && window.DSMode ? DSMode.lock(P.p.chapter).ru : 'с главы ' + (P ? P.p.chapter : '?')) };
      if (window.Eco && Eco.capLeft('help') <= 0) return { ok: false, why: 'tired', de: 'Max ist müde. Morgen wieder!', ru: 'на сегодня хватит — Max устал, завтра снова' };
    }
    const need = (t.stars || 0) - stars();
    if (need > 0 && window.DSMode && DSMode.starsWhy(need)) return Object.assign({ ok: false, why: 'stars' }, DSMode.starsWhy(need));   // Три режима: в «Только игра» ★ от Stufe
    if (need > 0) return { ok: false, why: 'stars', de: 'Noch ' + need + ' ★ — lerne in der App.', ru: 'нужно ещё ' + need + ' ★: пройди уроки в приложении (звёзды не тратятся)' };
    const miss = costOf(t) - coins();
    if (miss > 0) return { ok: false, why: 'coins', de: 'Noch ' + miss + ' Münzen.', ru: 'не хватает ' + miss + ' монет: урок, помощь на стройке, продажа урожая' };
    return { ok: true };
  }
  function start(id, vid) {
    const t = task(id), c = can(id); if (!c.ok) return c;
    if (t.kind !== 'help' && !variantsOf(t).some(x => x.id === vid)) return { ok: false, why: 'variant' };
    if (costOf(t) && !(window.Eco && Eco.spend(costOf(t), 'restore ' + id))) return { ok: false, why: 'coins' };
    const v = load(), now = Date.now(), sec = secOf(t); v.t[id] = { st: 'work', v: vid || null, start: now, end: now + sec * 1000 }; save(v);
    fire('start', id); redraw(id); return { ok: true, sec };
  }
  function setVariant(id, vid) {
    const t = task(id), v = load(), s = v.t[id]; if (!t || !s || s.st !== 'done' || !variantsOf(t).some(x => x.id === vid)) return { ok: false };
    s.v = vid; save(v); fire('look', id); redraw(id); puffs(id, 6); return { ok: true };
  }
  // ---------- scene (Yard = the town): objects, work animation, bars
  const alive = () => sc && sc.sys && sc.sys.isActive() && sc.sys.displayList;
  const K = img => 'rs_' + img;
  function clear(id) { const o = objs[id]; if (!o) return; [...o.imgs, o.hint, o.bar, o.txt].forEach(x => { if (x && x.destroy) x.destroy(); }); (o.tw || []).forEach(w => w.stop && w.stop()); delete objs[id]; }
  function img(t, name, at, id, wall) {                        // wall: hangs on the house of Max -> drawn over the house sprite
    const d = wall && t.over === 'house' && sc.house ? Math.max(at[1], sc.house.depth + 1) : at[1];
    const s = sc.add.image(at[0], at[1], K(name)).setOrigin(0.5, 1).setDepth(d).setInteractive({ useHandCursor: true });
    s.restore = id; s.on('pointerup', () => tap(id)); return s;
  }
  function redraw(id) {
    if (!alive()) return; const t = task(id); if (!t) return; clear(id);
    const s = load().t[id] || {}, o = objs[id] = { imgs: [], tw: [] };
    if (t.kind === 'help') {
      const P = plotOf(t); if (!P || P.stage < (t.min_stage || 2)) { delete objs[id]; return; }
      const W = t.worker, w = sc.add.sprite(W.at[0], W.at[1], K(W.img), 0).setOrigin(0.5, W.foot / W.frame).setDepth(W.at[1]).setInteractive({ useHandCursor: true });
      w.restore = id; w.on('pointerup', () => tap(id)); o.imgs.push(w);
      if (s.st === 'work') w.play('rs_arbeiter_work'); else w.setFrame(0);
      o.top = [W.at[0], W.at[1] - W.foot + 34];
    } else if (s.st === 'done') {
      const vv = variantsOf(t).find(x => x.id === s.v) || (t.variants || []).find(x => x.id === s.v) || t.variants[0];
      o.imgs.push(img(t, vv.img, t.at, id, true)); o.top = [t.at[0], t.at[1] - sc.textures.get(K(vv.img)).getSourceImage().height];
    } else {
      t.before.forEach(b => o.imgs.push(img(t, b.img, b.at, id)));
      const b0 = t.before[0]; o.top = [b0.at[0], b0.at[1] - sc.textures.get(K(b0.img)).getSourceImage().height];
      if (s.st === 'work') o.imgs.forEach(m => o.tw.push(sc.tweens.add({ targets: m, angle: { from: -2.5, to: 2.5 }, duration: 160, yoyo: true, repeat: -1 })));
    }
    if (s.st === 'work') {
      o.bar = sc.add.graphics().setDepth(6500); o.txt = sc.add.text(o.top[0], o.top[1] - 20, '', { fontFamily: 'Roboto, sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#fff7e0', stroke: '#3b2314', strokeThickness: 4 }).setOrigin(0.5, 1).setDepth(6501);
      bar(id);
    } else if (s.st !== 'done' && can(id).ok) {              // a yellow «!» over a task Max can start now (like the quest marks)
      o.hint = sc.add.text(o.top[0], o.top[1] - 4, '!', { fontFamily: 'Roboto, sans-serif', fontSize: '26px', fontStyle: 'bold', color: '#ffd23f', stroke: '#3b2314', strokeThickness: 5 }).setOrigin(0.5, 1).setDepth(6000);
      o.hint.restore = id; o.tw.push(sc.tweens.add({ targets: o.hint, y: o.hint.y - 6, duration: 420, yoyo: true, repeat: -1 }));
    }
  }
  function bar(id) {
    const o = objs[id], s = load().t[id]; if (!o || !o.bar || !s || s.st !== 'work') return;
    const k = Math.min(1, (Date.now() - s.start) / Math.max(1, s.end - s.start)), W = 72, x = o.top[0] - W / 2, y = o.top[1] - 16;
    o.bar.clear(); o.bar.fillStyle(0x3b2314, 0.9).fillRect(x - 2, y - 2, W + 4, 12); o.bar.fillStyle(0x6fcf4a, 1).fillRect(x, y, Math.round(W * k), 8);
    o.txt.setText('noch ' + fmt(s.end - Date.now()));
  }
  function puffs(id, n) {
    const o = objs[id]; if (!alive() || !o || !o.imgs[0]) return; const m = o.imgs[0], b = m.getBounds();
    for (let i = 0; i < n; i++) {
      const x = b.x + Math.random() * b.width, y = b.bottom - Math.random() * Math.min(30, b.height), c = sc.add.circle(x, y, 3 + Math.random() * 4, 0xeadfc4, 0.9).setDepth(b.bottom + 2);
      sc.tweens.add({ targets: c, y: y - 18 - Math.random() * 14, alpha: 0, scale: 1.8, duration: 550 + Math.random() * 300, onComplete: () => c.destroy() });
    }
  }
  function finished(t, paid) {
    if (!alive()) return; redraw(t.id); puffs(t.id, 12);
    if (window.speakDE) speakDE(t.kind === 'help' ? 'Danke, Max!' : 'Fertig! ' + t.de);
    if (window.toast) toast(t.kind === 'help' ? 'Danke, Max! +' + paid + ' Münzen' : 'Fertig! ' + t.de, 2000);
  }
  function step() {                                               // every 250 ms: bars, dust, finish
    Object.keys(objs).forEach(id => { const s = load().t[id]; if (s && s.st === 'work') { bar(id); if (Math.random() < 0.35) puffs(id, 2); } });
    if (Object.values(load().t).some(s => s.st === 'work' && s.end <= Date.now())) tick();
    if (openId) { const e = box.querySelector('[data-left]'), i = info(openId); if (e && i) { if (i.st === 'work') e.textContent = fmt(i.left); else panel(openId); } }
  }
  function setup(y) {
    sc = y; objs = {}; const T = y.cache.json.get('town'); if (!T || !y.textures.exists('town_bg')) return;
    const need = new Set(); RJ.tasks.forEach(t => { (t.before || []).forEach(b => need.add(b.img)); (t.variants || []).forEach(v => need.add(v.img)); });
    let n = 0; need.forEach(k => { if (!y.textures.exists(K(k))) { y.load.image(K(k), RJ.img + k + '.png'); n++; } });
    const W = (RJ.tasks.find(t => t.worker) || {}).worker;
    if (W && !y.textures.exists(K(W.img))) { y.load.spritesheet(K(W.img), RJ.img + W.img + '.png', { frameWidth: W.frame, frameHeight: W.frame }); n++; }
    const go = () => {
      if (sc !== y || !alive()) return;
      if (W && !y.anims.exists('rs_arbeiter_work')) y.anims.create({ key: 'rs_arbeiter_work', frames: y.anims.generateFrameNumbers(K(W.img), { start: 0, end: W.frames - 1 }), frameRate: 8, repeat: -1 });
      tick(); RJ.tasks.forEach(t => redraw(t.id)); y.time.addEvent({ delay: 250, loop: true, callback: step });
    };
    if (n) { y.load.once('complete', go); y.load.start(); } else go();
  }
  // ---------- panel (paper, like the garden panel): what Max can do here
  const css = document.createElement('style');
  css.textContent = `
    #restoreBox{position:absolute;left:12px;right:12px;top:58px;display:none;flex-direction:column;gap:6px;padding:8px 12px 10px;color:#2e1e12;z-index:73}
    #restoreBox .t{font-size:21px;font-weight:700;line-height:1.1}
    #restoreBox .d{font-size:16px;line-height:1.15}
    #restoreBox .why{font-size:16px;font-weight:700;color:#9b2c1c;line-height:1.15}
    #restoreBox .ru{display:block;font-size:12px;font-weight:400;color:#6b4a2e;line-height:1.15}
    #restoreBox .row{display:flex;gap:6px;flex-wrap:wrap}
    #restoreBox .ui-btn{font-family:inherit;color:#2e1e12;height:auto;min-height:52px;padding:3px 6px;font-size:16px;line-height:1.05;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1 1 22%;min-width:0}
    #restoreBox .ui-btn img{image-rendering:pixelated;display:block;margin:0 auto 2px;max-height:56px;max-width:100%}
    #restoreBox .ui-btn .n{white-space:nowrap;font-size:14px}
    #restoreBox .ui-btn .v{font-size:13px;font-weight:800;color:#2f7a2a}
    #restoreBox .ui-btn[disabled]{opacity:.62;filter:grayscale(.5)}
    #restoreBox .ui-btn.on{outline:3px solid #2f7a2a}
    #restoreBox .ui-btn.x{flex:0 0 auto}`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'restoreBox'; box.className = 'ui ui-panel-paper';
  const nm = de => { const [a, ...w] = de.split(' '); return `<b style="color:${COL[a] || '#2e1e12'}">${a}</b> ${w.join(' ')}`; };
  const COIN = '<img src="assets_v3/icon_coin.png" alt="" style="height:18px;vertical-align:-3px;display:inline;margin:0">';
  function show(html) {
    box.innerHTML = html; box.style.display = 'flex';
    HUD.forEach(k => { const e = document.getElementById(k); if (e && was[k] === undefined) { was[k] = e.style.display; e.style.display = 'none'; } });
    const s = window.game && game.scene.getScenes(true)[0]; if (s) { s.busy = true; busyOwner = s; }
  }
  function hide() {
    box.style.display = 'none'; openId = null; HUD.forEach(k => { const e = document.getElementById(k); if (e && was[k] !== undefined) e.style.display = was[k]; }); was = {};
    if (busyOwner) busyOwner.busy = false; busyOwner = null;
  }
  function panel(id) {
    const t = task(id); if (!t) return; const i = info(id), c = can(id); openId = id;
    let h = `<div class="t">${nm(t.de)}<span class="ru">${t.ru}</span></div><div class="d">${t.do_de}<span class="ru">${t.do_ru}</span></div>`;
    if (i.st === 'work') h += `<div class="d">Max arbeitet … noch <b data-left>${fmt(i.left)}</b><span class="ru">Max работает — можно погулять, всё доделается само</span></div>`;
    else if (t.kind === 'help') {
      h += c.ok ? `<div class="row"><button class="ui ui-btn" data-help>Helfen · ${fmt(i.sec * 1000)}<span class="v">+${helpPay()} ${COIN}</span><span class="ru">помочь строителям</span></button></div>` : `<div class="why">${c.de}<span class="ru">${c.ru}</span></div>`;
      h += `<span class="ru">Max hat ${i.helped}× geholfen · уже помог ${i.helped} раз. Башню строят взрослые — она растёт с главами.</span>`;
    } else {
      const done = i.st === 'done', open = c.ok || c.why === 'coins';
      if (done) h += `<div class="d">Fertig! Ein anderes Aussehen?<span class="ru">готово! поменять вид — бесплатно</span></div>`;
      else if (open) h += `<div class="d">Wie soll es aussehen? · ${i.cost ? i.cost + ' ' + COIN : 'gratis'} · ${fmt(i.sec * 1000)}<span class="ru">выбери вид: ${i.cost ? i.cost + ' монет(ы)' : 'бесплатно'}, ${i.sec} с работы</span></div>`;
      if (!done && !c.ok) h += `<div class="why">${c.de}<span class="ru">${c.ru}</span></div>`;
      if (done || open) h += '<div class="row">' + variantsOf(t).map(v => `<button class="ui ui-btn${done && i.v === v.id ? ' on' : ''}" data-v="${v.id}"${(!done && !c.ok) || (done && i.v === v.id) ? ' disabled' : ''}><img src="${RJ.img + v.img}.png" alt=""><span class="n">${nm(v.de)}</span><span class="ru">${v.ru}</span></button>`).join('') + '</div>';
    }
    h += '<div class="row"><button class="ui ui-btn x" data-close>Schließen<span class="ru">закрыть</span></button></div>';
    show(h);
    box.querySelectorAll('[data-v]').forEach(b => { b.onclick = () => { const r = info(id).st === 'done' ? setVariant(id, b.dataset.v) : start(id, b.dataset.v); if (r.ok && window.speakDE) speakDE((task(id).variants.find(x => x.id === b.dataset.v) || {}).de || ''); hide(); }; });
    const hb = box.querySelector('[data-help]'); if (hb) hb.onclick = () => { const r = start(id); if (r.ok && window.speakDE) speakDE('Max hilft.'); hide(); };
    box.querySelector('[data-close]').onclick = hide;
  }
  function tap(id) {
    const t = task(id); if (!t || !alive() || sc.__dragged || sc.busy) return;
    if (window.speakDE) speakDE(t.de);
    const st = t.stand; if (window.walkToScene && st) window.walkToScene(sc, st[0], st[1], () => panel(id)); else panel(id);
  }
  window.Restore = {
    ready, tasks: () => RJ.tasks.slice(), task, info, can, start, setVariant, tap, panel, close: hide, secOf: t => secOf(typeof t === 'string' ? task(t) : t),
    variants: id => variantsOf(task(id)), done: id => { const t = task(id); return !!t && (t.kind === 'help' ? (load().help.n || 0) > 0 : (load().t[id] || {}).st === 'done'); },
    helped: () => load().help.n || 0, objects: () => objs,
    _finishNow: id => { const v = load(), s = v.t[id]; if (s && s.st === 'work') { s.end = Date.now() - 1; save(v); tick(); } return info(id); }
  };
  (function hook() {
    const ui = document.getElementById('ui'), g = window.game;
    if (!ui || !g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 80);
    ui.appendChild(box);
    const y = g.scene.getScene('Yard'); if (y) { y.events.on('create', () => { hide(); ready.then(() => setup(y)); }); y.events.on('shutdown', () => { hide(); objs = {}; }); }
  })();
})();
