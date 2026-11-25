// DeutschSpiel vertical slice: Yard -> tap house (zoom) -> lesson inside the scene -> spell (speech) -> reward visible in yard.
const W = 960, H = 540, HERO = 'Max';
const $ = (id) => document.getElementById(id);
// 24.11 главный: один ключ картинки грузится один раз. Несколько модулей (garden/album/anim) ставят в очередь те же life_* в одной сцене
// до окончания загрузки -> Phaser «Texture key already in use». Уже есть в текстурах или уже в очереди/загрузке — пропуск (complete всё равно придёт).
(function () {
  // 24.11 23:35: load.image ставится Phaser'ом на КАЖДЫЙ экземпляр загрузчика (патч прототипа LoaderPlugin не работал).
  // Правка на уровне файла-картинки: если такая текстура уже есть (её успела загрузить другая сцена/модуль) — вторая копия
  // просто не добавляется, без console.error. Прочие повторы ключей (addCanvas и т.п.) по-прежнему пишут ошибку.
  const IF = Phaser.Loader.FileTypes.ImageFile.prototype, add = IF.addToCache;
  IF.addToCache = function () { if (this.type === 'image' && !this.linkFile && this.cache && this.cache.exists && this.cache.exists(this.key)) return; return add.call(this); };
  const SF = Phaser.Loader.FileTypes.SpriteSheetFile && Phaser.Loader.FileTypes.SpriteSheetFile.prototype;   // 25.11: то же для спрайт-листов (rs_arbeiter в restore.js)
  if (SF) { const addS = SF.addToCache; SF.addToCache = function () { if (!this.linkFile && this.cache && this.cache.exists && this.cache.exists(this.key)) return; return addS.call(this); }; }
})();
const store = { get() { try { return JSON.parse(localStorage.getItem('ds_proto')) || { done: false, coins: 0 }; } catch (e) { return { done: false, coins: 0 }; } },
  set(v) { try { localStorage.setItem('ds_proto', JSON.stringify(v)); } catch (e) {} } };
let state = store.get(), lesson = null, assetKeys = {};
function fit() { const s = Math.min(innerWidth / W, innerHeight / H); const st = $('stage'); st.style.transform = `scale(${s})`; st.style.left = (innerWidth - W * s) / 2 + 'px'; st.style.top = (innerHeight - H * s) / 2 + 'px'; }
addEventListener('resize', () => window.fit()); fit();
function setCoins(n) { state.coins = n; store.set(state); $('coins').textContent = n; }
function toast(t, ms = 1500) { const e = $('toast'); e.textContent = t; e.style.display = 'block'; toastPlace(e); clearTimeout(toast.t); clearInterval(toast.iv);
  toast.iv = setInterval(() => { if (e.style.display === 'none') clearInterval(toast.iv); else toastPlace(e); }, 250);   // часы переставляются раз в 700 мс (time_fx) — тост следом
  toast.t = setTimeout(() => { e.style.display = 'none'; clearInterval(toast.iv); }, ms); }
// 24.11 Код (Max/Olga): тост («Heute: der Weihnachtsmarkt», time_fx.js) не налезает на верхний HUD — часы #clock, плашку героя #cbHero, цель #goal, кнопки:
// при пересечении опускается под нижний край задетого элемента (+6 px). #ui масштабирован: px экрана -> логические px, как time_fx.js clock().
function toastPlace(e) {
  e.style.top = ''; const ids = ['clock', 'cbHero', 'goal', 'qTrack', 'coins', 'bMap', 'bMentor'];
  for (let k = 0; k < 4; k++) {
    const r = e.getBoundingClientRect(), s = (e.offsetHeight / r.height) || 1;
    const hit = ids.map(id => $(id)).filter(x => x && x.offsetParent && getComputedStyle(x).visibility !== 'hidden').map(x => x.getBoundingClientRect())
      .filter(q => q.width > 2 && q.left < r.right + 4 && q.right > r.left - 4 && q.top < r.bottom + 2 && q.bottom > r.top - 2);
    if (!hit.length) break; e.style.top = Math.round(e.offsetTop + (Math.max(...hit.map(q => q.bottom)) - r.top) * s + 6) + 'px';
  }
}
function setPortraits(heroE, npcE, heroActive) { const L = $('pL'), R = $('pR'); L.onerror = () => { L.style.display = 'none'; }; L.style.display = ''; L.src = 'assets_v3/portraits/max_' + (heroE === 'talk' ? 'happy' : 'neutral') + '.png';   /* Max: reodesuxz hero_boy 64x64 (Код Max); нет файла — портрет скрыт */ R.src = 'assets_v3/portraits/schmidt_' + npcE + '.png'; L.style.opacity = heroActive ? 1 : .55; R.style.opacity = heroActive ? .55 : 1; }
function speakDE(text) { try { const u = new SpeechSynthesisUtterance(text); u.lang = 'de-DE'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {} }
const audioEl = new Audio();
function playLine(l) { if (l.audio || l.audioUrl) { audioEl.src = l.audioUrl || ('audio/' + l.audio); audioEl.play().catch(() => speakDE(l.de)); } else speakDE(l.de); }
function norm(s) { return s.toLowerCase().replace(/[.,!?;:"']/g, '').split(/\s+/).filter(Boolean); }
function sceneSprite(sc, key, x, y, h, fallbackColor, label) {
  if (sc.textures.exists(key) && sc.textures.get(key).key !== '__MISSING') { const s = sc.add.image(x, y, key).setOrigin(0.5, 1); s.setScale(h / s.height); s.setDepth(y); return s; }
  const g = sc.add.rectangle(x, y, h * 0.7, h, fallbackColor).setOrigin(0.5, 1).setDepth(y); sc.add.text(x, y - h / 2, label, { fontSize: '14px', color: '#fff' }).setOrigin(0.5).setDepth(y + 1); return g;
}
const V3 = ['v3_yard_bg', 'v3_light_overlay', 'v3_house', 'v3_hero', 'v3_npc', 'v3_brezel', 'v3_reward_flowers', 'v3_room_bg'];
function v3(sc, key, xy, depth, org) { const s = sc.add.image(xy[0], xy[1], key).setOrigin(org ? org[0] : 0.5, org ? org[1] : 1); s.setDepth(depth === undefined ? xy[1] : depth); return s; }
function foot(sc, xy, w) { return sc.add.ellipse(xy[0] + w * 0.15, xy[1] - 2, w, w * 0.28, 0x0f1c08, 0.35).setDepth(xy[1] - 1); }
// ---- Код (Max) 24.11: Max растёт вместе с курсом — kid (главы A1 1–16), teen (A2 17–32), adult (B1+, 33…). Листы: style_pick/max_kid/build_max_ages.py
// (craftpix pixel_characters_4dir/2, ряды туловища/ног вырезаны, без ресемпла). Лист ступени подменяет текстуру hero_walk; нет файла — остаётся hero_walk.png.
function maxAge() { let n = 0; try { (window.DSMode ? DSMode.chapters() : JSON.parse(localStorage.getItem('ds_proto.app')).chapters || []).forEach(c => { if (+c.done > 0) n = Math.max(n, +c.n); }); } catch (e) {} return n >= 33 ? 'adult' : n >= 17 ? 'teen' : 'kid'; }
window.maxAge = maxAge;
window.MAX_SHEETS = true;    // 24.11 главный выбрал вид: листы craftpix + лицо по пикселям (style_pick/max_kid/add_face.py, Код Max/Olga); false — снова только hero_walk.png
function maxGrow(sc, noLoad) {
  const st = maxAge(), key = 'hero_walk_' + st, tm = sc.textures;
  const apply = () => {
    if (!tm.exists(key)) return;
    if (tm.exists('hero_walk')) tm.remove('hero_walk');
    tm.addSpriteSheet('hero_walk', tm.get(key).getSourceImage(), { frameWidth: 96, frameHeight: 96 }); window.__maxAge = st;
    ['down', 'left', 'right', 'up'].forEach((d, k) => { if (sc.anims.exists('w-' + d)) sc.anims.remove('w-' + d);   // те же анимации, что walk.js anims()
      sc.anims.create({ key: 'w-' + d, frames: sc.anims.generateFrameNumbers('hero_walk', { frames: [k * 3, k * 3 + 1, k * 3 + 2, k * 3 + 1] }), frameRate: 8, repeat: -1 }); });
    if (window.game) game.scene.scenes.forEach(s => { if (s.walker && s.walker.scene && s.walker.setTexture) { s.walker.anims.stop(); s.walker.setTexture('hero_walk', (s.walker.frame && +s.walker.frame.name) || 1); } });
    let prev = null; try { prev = localStorage.getItem('ds_proto.maxAge'); localStorage.setItem('ds_proto.maxAge', st); } catch (e) {}
    if (prev && prev !== st) setTimeout(() => toast('Max ist gewachsen! · Макс подрос!', 2600), 1200);
  };
  if (tm.exists(key)) apply(); else if (!noLoad && window.MAX_SHEETS) { sc.load.image(key, 'assets_v3/hero_walk_' + st + '.png'); sc.load.once('complete', apply); sc.load.start(); }
}
addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.ds === 'progress') setTimeout(() => { const sc = window.game && game.scene && game.isBooted && game.scene.getScenes(true)[0]; if (sc && maxAge() !== window.__maxAge) maxGrow(sc); }, 50); });
class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    const keys = Object.keys(window.__assets);
    keys.forEach(k => this.load.image(k, 'assets/' + k + '.png'));
    V3.forEach(k => this.load.image(k, 'assets_v3/' + k.slice(3) + '.png')); this.load.json('lay', 'assets_v3/layout_v3.json'); this.load.image('town_bg', 'assets_v3/town/town_bg.png'); this.load.json('town', 'assets_v3/town/town.json'); this.load.spritesheet('hero_walk', 'assets_v3/hero_walk.png', { frameWidth: 96, frameHeight: 96 }); if (window.MAX_SHEETS) this.load.image('hero_walk_' + maxAge(), 'assets_v3/hero_walk_' + maxAge() + '.png'); this.load.json('fur', 'assets_v3/furnish/furnish.json');
    [['dun_tiles', 'tileset'], ['dun_obj', 'objects'], ['dun_anim', 'anim'], ['dun_det', 'details']].forEach(([k, f]) => this.load.image(k, 'assets_v3/dungeon/' + f + '.png'));   // подземелье Keller (craftpix 436971)
    this.load.image('world_atlas', 'assets_v3/world/atlas.png'); this.load.json('world_atlas_json', 'assets_v3/world/atlas.json');   // континент Wiesenland (overworld.js)
    ['panel_paper'].forEach(k => this.load.image(k, 'assets/' + k + '.png'));
    this.load.on('loaderror', (f) => console.warn('missing', f.key));
  }
  create() { maxGrow(this, true); $('icoCoin').src = 'assets_v3/icon_coin.png'; $('icoCoin').onerror = function () { this.style.display = 'none'; }; setCoins(state.coins); const w = window.whereGet ? whereGet() : null; this.scene.start(w && ['Room', 'Karte', 'Furnish', 'Ort'].includes(w.s) ? w.s : 'Yard', w || {}); }
}
class Yard extends Phaser.Scene {
  constructor() { super('Yard'); }
  create() {
    this.cameras.main.setBackgroundColor(0x5f8c46); this.cameras.main.setZoom(1).centerOn(W / 2, H / 2); this.cameras.main.fadeIn(300);
    const lay = this.cache.json.get('lay'); this.lay = lay;
    const town = this.textures.exists('town_bg'); this.add.image(0, 0, town ? 'town_bg' : 'v3_yard_bg').setOrigin(0, 0).setDepth(-10); if (!town) this.add.image(0, 0, 'v3_light_overlay').setOrigin(0, 0).setDepth(2000);   // деревня — одна карта
    this.house = v3(this, 'v3_house', lay.house);
    this.hero = v3(this, 'v3_hero', lay.hero, undefined, lay.origin_hero);
    this.brezel = v3(this, 'v3_brezel', lay.brezel, undefined, lay.origin_brezel);
    this.tweens.add({ targets: this.brezel, scaleY: this.brezel.scaleY * 1.04, duration: 700, yoyo: true, repeat: -1 });
    if (state.done) { this.reward = this.lay.reward.map(xy => v3(this, 'v3_reward_flowers', xy)); $('goalTxt').textContent = 'Ziel: Bäckerei (bald)'; }
    else { this.arrow = this.add.triangle(480, 40, 0, 0, 36, 0, 18, 26, 0xffd23f).setDepth(999).setStrokeStyle(3, 0x3b2314); this.tweens.add({ targets: this.arrow, y: 56, duration: 500, yoyo: true, repeat: -1 }); $('goalTxt').textContent = 'Ziel: Elternhaus'; }
    this.house.setInteractive({ useHandCursor: true }).on('pointerup', () => { if (!this.__dragged) this.enter(); });
    this.brezel.setInteractive({ useHandCursor: true }).on('pointerup', () => { if (this.__dragged) return; toast('Wuff!'); this.tweens.add({ targets: this.brezel, y: this.brezel.y - 26, duration: 150, yoyo: true }); });
    $('dlg').style.display = 'none'; $('bag').style.display = ''; $('goal').style.display = ''; $('clock').style.display = ''; $('bMap').style.display = ''; $('bMap').onclick = () => { $('bMap').style.display = 'none'; $('bFurn').style.display = 'none'; this.cameras.main.fadeOut(250, 29, 19, 11); this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Karte')); }; $('bFurn').style.display = ''; $('bFurn').onclick = () => { $('bFurn').style.display = 'none'; $('bMap').style.display = 'none'; this.cameras.main.fadeOut(250, 29, 19, 11); this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Furnish')); };
    if (state.done && this.registry.get('justDone')) { this.registry.set('justDone', false); this.rewardPop(); }
  }
  rewardPop() { (this.reward || []).forEach((r, i) => { const sx = r.scaleX || 1, sy = r.scaleY || 1; r.setScale(0); this.tweens.add({ targets: r, scaleX: sx, scaleY: sy, duration: 500, delay: 300 + i * 250, ease: 'Back.easeOut' }); }); toast('Die Blumen sind da!', 2500); this.tweens.add({ targets: this.brezel, y: this.brezel.y - 40, duration: 200, yoyo: true, repeat: 3 }); }
  enter() {
    if (this.busy) return; this.busy = true; $('bFurn').style.display = 'none'; $('bMap').style.display = 'none'; if (this.arrow) this.arrow.destroy();
    this.tweens.add({ targets: this.hero, x: this.lay.house[0] + 96, y: this.lay.house[1] + 6, duration: 700 });
    const cam = this.cameras.main; cam.pan(this.lay.house[0] + 96, this.lay.house[1] - 60, 800, 'Sine.easeInOut'); cam.zoomTo(2.2, 800, 'Sine.easeInOut');
    this.time.delayedCall(700, () => cam.fadeOut(300, 29, 19, 11));
    cam.once('camerafadeoutcomplete', () => this.scene.start('Room'));
  }
}

// конец разговора: карточка «Geschafft!» — фразы Max, монеты (только в первый раз), «Nochmal», дорога назад
function endCard(sc, o) {
  const r = $('reward'), mine = sc.L.filter(l => l.role === 'A');
  r.innerHTML = `<div style="font-size:26px;font-weight:800">Geschafft!</div><div style="font-size:15px;opacity:.8;margin-bottom:6px">${o.title}</div>
    <div style="text-align:left;max-height:190px;overflow:auto;margin:4px 6px 8px;font-size:16px;line-height:1.3">${mine.map(l => `<div style="margin:3px 0"><b>${l.de.replace('{hero_name}', HERO)}</b><br><span style="font-size:13px;opacity:.75">${(l.ru || '').replace('{hero_name}', HERO)}</span></div>`).join('')}</div>
    <div style="font-size:18px;margin:4px 0">${o.coins ? '<img src="assets_v3/icon_coin.png" style="height:26px;vertical-align:middle"> +' + o.coins + ' Münzen' : 'Schon geübt — Münzen gibt es nur beim ersten Mal'}</div>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:8px"><button class="ui ui-btn" id="bAgain" style="font-size:18px;height:46px;padding:0 14px">Nochmal</button><button class="ui ui-btn" id="bBack" style="font-size:18px;height:46px;padding:0 14px">${o.backLabel}</button></div>`;
  r.style.display = 'block';
  const close = () => { r.style.display = 'none'; };
  $('bAgain').onclick = () => { close(); whereSet(sc.scene.key, 0); sc.scene.restart(o.restartData || {}); };
  $('bBack').onclick = () => { close(); o.back(); };
}
function paidKey(sc) { return sc.scene.key === 'Ort' ? 'ort:' + sc.placeKey : 'room1'; }
function isRepeat(sc) { return !!(state.paid && state.paid[paidKey(sc)]); }
function markPaid(sc) { state.paid = state.paid || {}; state.paid[paidKey(sc)] = true; store.set(state); }
function linePaid(sc) { return !!(state.paidLines && state.paidLines[paidKey(sc) + ':' + sc.i]); }   // Антифарм 25.11: +5 за реплику — один раз (выйти до конца и войти снова больше не платит)
function markLine(sc) { state.paidLines = state.paidLines || {}; state.paidLines[paidKey(sc) + ':' + sc.i] = 1; store.set(state); }
class Room extends Phaser.Scene {
  constructor(k) { super(k || 'Room'); }
  create(data) {
    this.cameras.main.setBackgroundColor(0x2b1a10); this.cameras.main.fadeIn(300);
    const lay = this.cache.json.get('lay'); this.add.image(0, 0, 'v3_room_bg').setOrigin(0, 0).setDepth(-10);
    this.hero = v3(this, 'v3_hero', lay.room_hero, undefined, lay.origin_hero); this.npc = v3(this, 'v3_npc', lay.room_npc, undefined, lay.origin_npc);
    ['bag', 'bFurn', 'bMap'].forEach(k => $(k).style.display = 'none'); this.L = lesson.lines; this.i = data && data.s === 'Room' && data.i < this.L.length ? data.i : 0; this.coinsEarned = 0; if (this.i > 0 || !this.waitTalk) { $('dlg').style.display = 'block'; this.talking = true; this.show(); } else this.waitTalk();   // диалог — после тапа по жителю
    $('bHear').onclick = () => playLine(this.L[this.i]);
    $('bNext').onclick = () => this.next(); $('bSpeak').onclick = () => this.speak(); $('bSkip').onclick = () => this.skip && this.skip();
  }
  show() {
    whereSet(this.scene.key, this.i); const l = this.L[this.i], mine = l.role === 'A';
    $('who').textContent = mine ? HERO : 'Herr Schmidt'; $('de').textContent = ''; const txt = l.de.replace('{hero_name}', HERO); let n = 0;
    clearInterval(this.tw); this.tw = setInterval(() => { $('de').textContent = txt.slice(0, ++n); if (n >= txt.length) clearInterval(this.tw); }, 28);
    $('ru').textContent = l.ru.replace('{hero_name}', HERO); setPortraits(mine ? 'talk' : 'calm', mine ? 'calm' : 'talk', mine); $('bSpeak').style.display = mine ? '' : 'none'; $('bNext').style.display = mine ? 'none' : '';
    if (!mine) { this.tweens.add({ targets: this.npc, y: this.npc.y - 10, duration: 160, yoyo: true }); setTimeout(() => playLine(l), 250); }
  }
  speak() {
    const l = this.L[this.i], target = norm(l.de.replace('{hero_name}', HERO));
    const ok = () => { $('micHelp').style.display = 'none'; $('bSkip').style.display = 'none'; this.spell(); setTimeout(() => this.next(), 900); };
    this.skip = ok;
    if (/[?&]auto/.test(location.search)) { toast('Test: zählt als gesagt', 1200); return ok(); }
    if (this.listening) return; this.listening = true; $('bSpeak').classList.add('rec'); $('micHelp').style.display = 'none'; toast('Sprich jetzt!', 3000);
    SpeechG.hear().then(alts => {
      const score = Math.max(...alts.map(a => { const h = norm(a); return target.filter(w => h.includes(w)).length / target.length; }));
      if (score >= 0.6) return ok();
      toast('Fast! Nochmal', 2000); this.help('Услышал: «' + alts[0] + '». Скажи ещё раз: «' + l.de.replace('{hero_name}', HERO) + '»');
    }).catch(e => this.help(e.message)).finally(() => { this.listening = false; $('bSpeak').classList.remove('rec'); });
  }
  help(t) { const h = $('micHelp'); h.textContent = t; h.style.display = 'block'; $('bSkip').style.display = ''; }
  spell() {
    const cx = this.hero.x, cy = this.hero.y - 120;
    for (let k = 0; k < 24; k++) { const d = this.add.circle(cx, cy, 5, k % 2 ? 0xffd23f : 0xffffff).setDepth(999), a = k / 24 * Math.PI * 2, r = 80 + Math.random() * 90;
      this.tweens.add({ targets: d, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r - 20, alpha: 0, duration: 800, onComplete: () => d.destroy() }); }
    this.tweens.add({ targets: this.npc, y: this.npc.y - 18, duration: 150, yoyo: true, repeat: 1 }); if (isRepeat(this) || linePaid(this)) toast('Zauber!', 1000); else { markLine(this); this.coinsEarned += 5; setCoins(state.coins + 5); toast('Zauber! +5', 1100); } setPortraits('smile', 'smile', true);
  }
  next() {
    clearInterval(this.tw); this.i++;
    if (this.i >= this.L.length) { this.i = this.L.length - 1; $('bNext').style.display = 'none'; $('bSpeak').style.display = 'none'; $('bSkip').style.display = 'none'; if (this.ending) return; this.ending = true; return setTimeout(() => { $('dlg').style.display = 'none'; this.ending = false; this.finish(); }, 1300); }   // последняя реплика видна до конца
    this.show();
  }
  finish() {
    const rep = isRepeat(this), bonus = rep ? 0 : 20; whereSet('Yard');
    if (!rep) { setCoins(state.coins + bonus); markPaid(this); }
    state.done = true; store.set(state);
    endCard(this, { title: 'Herr Schmidt · das Elternhaus', coins: rep ? 0 : this.coinsEarned + bonus, backLabel: 'Zum Hof',
      back: () => { this.registry.set('justDone', !rep); this.cameras.main.fadeOut(300, 29, 19, 11); this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Yard')); } });
  }

}
$('reset').onclick = () => { store.set({ done: false, coins: 0 }); location.reload(); };
Promise.all([fetch('lesson.json').then(r => r.json()), fetch('assets.json').then(r => r.json())]).then(([l, a]) => {
  lesson = l; window.__assets = {};
  window.game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: W, height: H, backgroundColor: '#5f8c46', scene: [Boot, Yard, Room].concat(window.Furnish ? [window.Furnish] : [], window.Karte ? [window.Karte] : [], window.Ort ? [window.Ort] : [], window.Dungeon ? [window.Dungeon] : [], window.Welt ? [window.Welt] : []), pixelArt: true, render: { antialias: false, roundPixels: true }, audio: { noAudio: true } });
});
