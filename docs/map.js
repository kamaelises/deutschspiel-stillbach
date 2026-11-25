// Karte (map screen): places of Stillbach as cards; open ones lead there, locked ones say from which chapter they open.
// Place art = the pack artists' own exterior maps (craftpix). Uses globals from main.js: $, state, toast, speakDE.
class Karte extends Phaser.Scene {
  constructor() { super('Karte'); }
  preload() { this.load.json('places', 'assets_v3/map/places.json'); }
  create() {
    this.cameras.main.fadeIn(250);
    this.add.image(0, 0, 'v3_yard_bg').setOrigin(0, 0).setTint(0x6b5a48);
    const places = this.cache.json.get('places'), appChapters = (() => { try { return window.DSMode ? DSMode.chapters() : JSON.parse(localStorage.getItem('ds_proto.app')).chapters || []; } catch (e) { return []; } })();   // Три режима: DSMode
    const started = appChapters.filter(c => c.done > 0).map(c => c.n), chapter = Math.max(state.done ? 2 : 1, started.length ? Math.max(...started) + 1 : 1);   // глава открыта, если в прошлой пройден хотя бы урок
    const info = n => appChapters.find(c => c.n === n);
    const col = { der: '#4080e6', die: '#e24848', das: '#40b05c' };
    let m = $('mapPanel'); if (!m) { m = document.createElement('div'); m.id = 'mapPanel'; m.className = 'ui ui-panel-paper'; $('ui').appendChild(m); }
    m.innerHTML = '<div class="mapTitle">Karte von Stillbach</div><div class="mapGrid">' + places.map(p => {
      const open = p.chapter <= chapter, [art, ...w] = p.de.split(' ');
      return `<div class="place ${open ? 'open' : 'locked'}" data-k="${p.key}" data-ch="${p.chapter}"><img src="assets_v3/map/${p.key}${open ? '' : '_locked'}.png"><div class="pl"><b style="color:${col[art]}">${art}</b> ${w.join(' ')}</div><div class="pr">${open ? p.ru + (info(p.chapter) && info(p.chapter).total ? ' · ' + info(p.chapter).done + '/' + info(p.chapter).total : '') : '🔒 ' + (window.DSMode ? DSMode.lock(p.chapter).de : 'ab Kapitel ' + p.chapter)}</div></div>`;
    }).join('') + '</div><button class="ui ui-btn" id="bMapBack">Zum Hof</button>';
    m.style.display = 'block'; ['goal', 'clock', 'bag'].forEach(k => $(k).style.display = 'none'); $('goalTxt').textContent = 'Karte'; $('bFurn').style.display = 'none'; $('bMap').style.display = 'none';
    m.querySelectorAll('.place').forEach(el => el.onclick = () => {
      const p = places.find(q => q.key === el.dataset.k); speakDE(p.de);
      if (el.classList.contains('locked')) return toast(p.de + ': ' + (window.DSMode ? DSMode.lock(p.chapter).de : 'ab Kapitel ' + p.chapter), 1600);
      if (p.key === 'elternhaus') return this.leave();
      if (window.ORTE && window.ORTE[p.key]) { this.cameras.main.fadeOut(250, 29, 19, 11); return this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Ort', { place: p.key })); }
      if (window.dsGo) return window.dsGo('#/ch/' + p.chapter); toast(p.de + ': Kapitel ' + p.chapter, 1400);
    });
    $('bMapBack').onclick = () => this.leave();
    this.events.once('shutdown', () => { m.style.display = 'none'; ['goal', 'clock', 'bag'].forEach(k => $(k).style.display = ''); });
  }
  leave() { this.cameras.main.fadeOut(250, 29, 19, 11); this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Yard')); }
}
window.Karte = Karte;
