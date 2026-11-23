// Места на карте — свои сцены внутри мира (Ort = место). Интерьер — карта художника пака, диалог — настоящая сценка
// главы из приложения (content/chNN/dialogs.json): реплики героя говоришь сам (микрофон), остальные слушаешь.
// Наследует Room: тот же диалог, «Sprechen», «Zauber», монеты. Uses globals from main.js: Room, $, state, store, setCoins, toast, HERO, whereSet.
const ORTE = {
  buergeramt: { img: 'assets_v3/places/buergeramt.png', w: 1008, h: 672, hero: [396, 612], npc: [498, 300], ch: 'ch02', dialog: 'ch02_d1', heroRole: 'H', title: 'das Gildenhaus' },
};
class Ort extends Room {
  constructor() { super('Ort'); }
  create(data) {
    const key = (data && data.place) || (() => { try { return localStorage.getItem('ds_proto.ort'); } catch (e) { return null; } })() || 'buergeramt';
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
  show() { super.show(); $('pL').style.display = 'none'; $('pR').style.display = 'none'; const l = this.L[this.i]; if (l.role !== 'A') $('who').textContent = l.who || '…'; }
  finish() {
    const rep = isRepeat(this), bonus = rep ? 0 : 15; whereSet('Karte');
    if (!rep) { setCoins(state.coins + bonus); markPaid(this); }
    endCard(this, { title: this.o.title, coins: rep ? 0 : this.coinsEarned + bonus, backLabel: 'Raus', restartData: { place: this.placeKey },
      back: () => { this.cameras.main.fadeOut(300, 29, 19, 11); this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Yard')); } });
  }

}
window.Ort = Ort; window.ORTE = ORTE;
