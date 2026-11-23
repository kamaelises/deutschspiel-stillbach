// Karte (map screen): places of Stillbach as cards; open ones lead there, locked ones say from which chapter they open.
// Place art = the pack artists' own exterior maps (craftpix). Uses globals from main.js: $, state, toast, speakDE.
class Karte extends Phaser.Scene {
  constructor() { super('Karte'); }
  preload() { this.load.json('places', 'assets_v3/map/places.json'); }
  create() {
    this.cameras.main.fadeIn(250);
    this.add.image(0, 0, 'v3_yard_bg').setOrigin(0, 0).setTint(0x6b5a48);
    const places = this.cache.json.get('places'), chapter = state.done ? 2 : 1;   // prototype: lesson 1 done -> chapter 2 opens
    const col = { der: '#4080e6', die: '#e24848', das: '#40b05c' };
    let m = $('mapPanel'); if (!m) { m = document.createElement('div'); m.id = 'mapPanel'; m.className = 'ui ui-panel-paper'; $('ui').appendChild(m); }
    m.innerHTML = '<div class="mapTitle">Karte von Stillbach</div><div class="mapGrid">' + places.map(p => {
      const open = p.chapter <= chapter, [art, ...w] = p.de.split(' ');
      return `<div class="place ${open ? 'open' : 'locked'}" data-k="${p.key}" data-ch="${p.chapter}"><img src="assets_v3/map/${p.key}${open ? '' : '_locked'}.png"><div class="pl"><b style="color:${col[art]}">${art}</b> ${w.join(' ')}</div><div class="pr">${open ? p.ru : '🔒 ab Kapitel ' + p.chapter}</div></div>`;
    }).join('') + '</div><button class="ui ui-btn" id="bMapBack">Zum Hof</button>';
    m.style.display = 'block'; $('goalTxt').textContent = 'Karte'; $('bFurn').style.display = 'none'; $('bMap').style.display = 'none';
    m.querySelectorAll('.place').forEach(el => el.onclick = () => {
      const p = places.find(q => q.key === el.dataset.k); speakDE(p.de);
      if (el.classList.contains('locked')) return toast(p.de + ': ab Kapitel ' + p.chapter, 1600);
      if (p.key === 'elternhaus') return this.leave(); toast(p.de + ' (bald)', 1400);
    });
    $('bMapBack').onclick = () => this.leave();
    this.events.once('shutdown', () => { m.style.display = 'none'; });
  }
  leave() { this.cameras.main.fadeOut(250, 29, 19, 11); this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Yard')); }
}
window.Karte = Karte;
