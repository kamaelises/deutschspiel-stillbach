// Полировка (портреты) 24.11 — портреты NPC для окон диалога: window.Portraits.get(id, emotion) -> URL картинки.
// Готовые портреты как есть (без перерисовки): обрезка по сетке листа + целое увеличение NEAREST до 96x96
// (style_pick/portraits/build_portraits.py -> assets_v3/portraits/por/*.png, метрики por/portraits.json).
// Источники: CharlesGabriel «48x48 Faces 1st/2nd Sheet» (OGA, CC-BY 3.0), CobraLad «32x32 Fantasy portrait set» (OGA, CC-BY 3.0);
// Herr Schmidt — прежний craftpix medieval-npc-avatars (3 эмоции, сравнение style_pick/portraits/_cmp_sheet.png). Лицензии: app/CREDITS.md.
// У новых портретов одна эмоция: get() с любой emotion отдаёт её; у Schmidt — calm/smile/talk (радость = smile).
(function () {
  const B = 'assets_v3/portraits/';
  const P = {
    becker: 'por/becker', olga: 'por/olga', ahmad: 'por/ahmad', beamter: 'por/beamter', schulz: 'por/schulz',
    kassiererin: 'por/kassiererin', jonas: 'por/jonas', taras: 'por/taras', weber: 'por/weber',
    schmidt: { neutral: 'schmidt_calm', calm: 'schmidt_calm', happy: 'schmidt_smile', smile: 'schmidt_smile', talk: 'schmidt_talk', surprised: 'schmidt_talk' },
  };
  const ALIAS = { friend_f: 'olga', friend_m: 'ahmad', 'frau becker': 'becker', mentorin: 'becker', olga: 'olga', ahmad: 'ahmad',
    'frau schulz': 'schulz', kassiererin: 'kassiererin', 'herr schmidt': 'schmidt', 'bauer jonas': 'jonas', 'frau weber': 'weber', 'herr taras': 'taras',
    schmidt_smile: 'schmidt', schmidt_calm: 'schmidt', schmidt_talk: 'schmidt' };
  const idOf = s => { s = String(s || '').toLowerCase().replace(/\s*\(.*\)\s*$/, '').trim(); return P[s] ? s : (ALIAS[s] || null); };
  function get(id, emotion) {
    const k = idOf(id); if (!k) return null; const v = P[k];
    if (typeof v === 'string') return B + v + '.png';
    return B + (v[emotion] || v.neutral) + '.png';
  }
  window.Portraits = { get, has: id => !!idOf(id), idOf, list: () => Object.keys(P) };
})();
