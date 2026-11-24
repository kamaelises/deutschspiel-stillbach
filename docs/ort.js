// Места на карте — свои сцены внутри мира (Ort = место). Интерьер — карта художника пака, диалог — настоящая сценка
// главы из приложения (content/chNN/dialogs.json): реплики героя говоришь сам (микрофон), остальные слушаешь.
// Наследует Room: тот же диалог, «Sprechen», «Zauber», монеты. Uses globals from main.js: Room, $, state, store, setCoins, toast, HERO, whereSet.
const ORTE = {
  buergeramt: { img: 'assets_v3/places/buergeramt.png', w: 1008, h: 672, hero: [450, 548], npc: [498, 300], walk: [[335, 470, 650, 566], [110, 330, 300, 466], [290, 420, 340, 482], [455, 404, 586, 478]], exit: [505, 590], ch: 'ch02', dialog: 'ch02_d1', heroRole: 'H', title: 'das Gildenhaus', portrait: 'beamter' },
  baeckerei: { img: 'assets_v3/places/baeckerei.png', w: 624, h: 732, hero: [310, 680], npc: [310, 536], walk: [[135, 625, 490, 694]], exit: [310, 708], ch: 'ch04', dialog: 'ch04_d4', heroRole: 'H', title: 'die Bäckerei', portrait: 'schulz' },   // craftpix workshop = bakery (build_baeckerei_b.py)
  // Код (интерьеры) 24.11: style_pick/interiors/build_cafe.py, build_supermarkt.py (craftpix Guild Hall / Home / Glassblower, x3). Вход — дверь участка A1 (town.js, ступень Gebäude).
  cafe: { img: 'assets_v3/places/cafe.png', w: 768, h: 528, hero: [384, 462], npc: [384, 132], walk: [[216, 252, 540, 492], [108, 420, 216, 492], [540, 216, 720, 264], [540, 408, 672, 492]], exit: [384, 486], ch: 'ch04', dialog: 'ch04_d7', heroRole: 'H', title: 'das Café', portrait: 'schulz' },
  supermarkt: { img: 'assets_v3/places/supermarkt.png', w: 912, h: 528, hero: [456, 468], npc: [300, 297], walk: [[504, 216, 744, 492], [396, 432, 504, 492], [168, 420, 396, 492], [24, 312, 168, 384], [744, 312, 888, 384], [168, 348, 192, 432]], exit: [456, 486], ch: 'ch06', dialog: 'ch06_d3', heroRole: 'H', title: 'der Supermarkt', portrait: 'kassiererin' },
};
class Ort extends Room {
  constructor() { super('Ort'); }
  create(data) {
    const key = (data && data.place) || (() => { try { return localStorage.getItem('ds_proto.ort'); } catch (e) { return null; } })() || 'buergeramt';
    this.hero = null; this.walker = null; this.__grid = null; this.talking = false; this.busy = false;          // a second visit: nothing from the previous place (position, floor grid) may leak in
    const o = this.o = ORTE[key]; this.placeKey = key; this.worldW = o.w; this.worldH = o.h;
    try { localStorage.setItem('ds_proto.ort', key); } catch (e) {}
    this.cameras.main.setBackgroundColor(0x1d130b);
    ['bag', 'bFurn', 'bMap'].forEach(k => $(k).style.display = 'none'); $('goalTxt').textContent = o.title;
    const start = i => {
      this.add.image(0, 0, 'ort_' + key).setOrigin(0, 0).setDepth(-10);
      const lay = this.cache.json.get('lay');
      this.hero = this.add.image(o.hero[0], o.hero[1], 'v3_hero').setOrigin(lay.origin_hero ? lay.origin_hero[0] : 0.5, lay.origin_hero ? lay.origin_hero[1] : 1).setDepth(o.hero[1]);
      this.npc = this.add.zone(o.npc[0], o.npc[1], 40, 60);   // продавец/служащий нарисован художником в интерьере
      this.i = i; this.coinsEarned = 0; if (window.walkSetup) window.walkSetup(this);
      if (i > 0 || !this.waitTalk) { $('dlg').style.display = 'block'; this.talking = true; this.show(); } else this.waitTalk();
      $('bHear').onclick = () => playLine(this.L[this.i]);
      $('bNext').onclick = () => this.next(); $('bSpeak').onclick = () => this.speak(); $('bSkip').onclick = () => this.skip && this.skip();
      this.cameras.main.fadeIn(300); if (window.fitCam) window.fitCam(this);
    };
    const ready = () => fetch('../content/' + o.ch + '/dialogs.json').then(r => r.ok ? r.json() : Promise.reject(r.status)).then(list => {
      const d = list.find(x => x.id === o.dialog) || list[0], names = d.roles || {};
      this.L = (d.lines || []).map(l => ({ role: l.role === o.heroRole ? 'A' : 'B', who: String(names[l.role] || '').replace(/\s*\(.*\)\s*$/, ''), de: l.de, ru: l.ru, audioUrl: l.audio ? '../content/' + o.ch + '/' + l.audio : null }));
      start(data && data.s === 'Ort' && data.i < this.L.length ? data.i : 0);
    }).catch(() => { toast(o.title + ': bald', 1600); this.scene.start('Karte'); });
    if (this.textures.exists('ort_' + key)) ready(); else { this.load.image('ort_' + key, o.img); this.load.once('complete', ready); this.load.start(); }
  }
  show() { super.show(); const l = this.L[this.i]; $('pL').style.display = 'none';   // portrait of the person you talk to (craftpix Free 39 Portraits); dimmed while Max speaks
    const R = $('pR'), pu = window.Portraits && (Portraits.get(l.who) || Portraits.get(this.o.portrait, l.role === 'A' ? 'neutral' : 'talk'));   // Полировка (портреты) 24.11: портрет того, кто говорит (Olga, Frau Becker, Frau Schulz…), portraits.js
    if (pu || this.o.portrait) { R.src = pu || 'assets_v3/portraits/' + this.o.portrait + '.png'; R.style.display = ''; R.style.opacity = l.role === 'A' ? .55 : 1; } else R.style.display = 'none'; if (l.role !== 'A') $('who').textContent = l.who || '…'; }
  finish() {
    const rep = isRepeat(this), bonus = rep ? 0 : 15; whereSet('Karte');
    if (!rep) { setCoins(state.coins + bonus); markPaid(this); }
    endCard(this, { title: this.o.title, coins: rep ? 0 : this.coinsEarned + bonus, backLabel: 'Raus', restartData: { place: this.placeKey },
      back: () => { this.cameras.main.fadeOut(300, 29, 19, 11); this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Yard')); } });
  }

}
window.Ort = Ort; window.ORTE = ORTE;
// Арт (Uhrturm) 24.11: сезонный декор интерьеров по данным assets_v3/places/decor.json (сейчас: der Adventskranz в das Café).
// Время — window.WorldTime (time.js, отладка ?date= / ds_proto.debugDate), иначе дата устройства. Тап по венку: «Zwei Kerzen brennen.»
(function () {
  const DAY = 864e5, d0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = () => { try { const n = window.WorldTime && WorldTime.now(); if (n && n.date) return new Date(n.date); } catch (e) {} return new Date(); };
  const adventN = d => {                                           // сколько воскресений Адвента уже наступило; null — венка ещё/уже нет
    const y = d.getFullYear(); let A = null;
    try { const D = WorldTime.datesOf(y); A = [1, 2, 3, 4].map(k => D['advent_' + k][0]); } catch (e) { const x = new Date(y, 11, 24), a4 = new Date(y, 11, 24 - x.getDay()); A = [3, 2, 1, 0].map(k => new Date(a4.getTime() - k * 7 * DAY)); }
    const t = d0(d).getTime(); if (t < d0(A[0]).getTime() - DAY || t > new Date(y, 11, 26).getTime()) return null;
    return A.filter(a => t >= d0(a).getTime()).length;
  };
  function put(sc, DJ) {
    (DJ[sc.placeKey] || []).forEach(it => {
      const n = it.show === 'advent' ? adventN(today()) : 0; if (n == null) return;
      const go = () => {
        if (!sc.sys.isActive()) return; const k = 'dc_' + it.key, f0 = n * it.flicker;
        const s = sc.add.sprite(it.at[0] - it.cx, it.at[1] - it.foot, k, f0).setOrigin(0, 0).setDepth(it.at[1]); s.decor = { key: it.key, state: n };
        const ak = k + '_' + n; if (!sc.anims.exists(ak)) sc.anims.create({ key: ak, frames: sc.anims.generateFrameNumbers(k, { start: f0, end: f0 + it.flicker - 1 }), frameRate: 5, repeat: -1 });
        if (n > 0) s.play(ak);
        s.setInteractive({ useHandCursor: true }).on('pointerup', () => { if (window.speakDE) speakDE(it.de + '. ' + it.say[n]); if (window.toast) toast(it.de + ' — ' + it.say[n] + ' · ' + it.say_ru[n], 2400); });
      };
      if (sc.textures.exists('dc_' + it.key)) go(); else { sc.load.spritesheet('dc_' + it.key, it.img, { frameWidth: it.frame[0], frameHeight: it.frame[1] }); sc.load.once('complete', go); sc.load.start(); }
    });
  }
  function setup(sc) {
    const t0 = Date.now(), wait = () => { if (!sc.sys.isActive() || Date.now() - t0 > 15000) return; if (!sc.hero) return setTimeout(wait, 100);
      const DJ = sc.cache.json.get('decor'); if (DJ) return put(sc, DJ);
      sc.load.json('decor', 'assets_v3/places/decor.json'); sc.load.once('complete', () => { const J = sc.cache.json.get('decor'); if (J) put(sc, J); }); sc.load.start(); };
    wait();
  }
  (function hook() {
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 50);
    const o = g.scene.getScene('Ort'); if (o) o.events.on('create', () => setup(o));
  })();
})();
