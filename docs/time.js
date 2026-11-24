// Код (время) 24.11 — window.WorldTime: настоящее локальное время устройства (как Animal Crossing), фазы дня, сезоны, праздники.
// API (им пользуются задания, рыбалка, огород — менять только с записью в design-doc/time-seasons-events.md):
//   phase: база morgen 5–10 · tag 10–17 · abend 17–21 · nacht 21–5 (Frühling/Herbst); Sommer: tag до 18, abend 18–22; Winter: morgen 6–10, tag 10–16, abend 16–20, nacht 20–6
//   now() -> { date, hour, minute, phase: 'morgen'|'tag'|'abend'|'nacht', phaseDe, isNight, season: 'fruehling'|'sommer'|'herbst'|'winter',
//              seasonDe: 'der Frühling'|…, festivals: [id…] (активные сегодня), weekday: 0–6 (0 = Sonntag), weekdayDe: 'der Sonntag', debug }
//   on('phase'|'season'|'festival'|'minute', fn) -> off(); fn(now, info). festivalsOn(date) -> [id]; seasonOf(date) -> id; phaseOf(date) -> id
//   decorOn(date) -> [id] (праздники, чьи украшения уже/ещё стоят); easter(year) -> Date; datesOf(year) -> { id: [Date…] }
//   festival(id) -> запись calendar.json (или null до загрузки); ready(fn) — когда calendar.json загружен
//   setDebug(isoDate|null) — подмена времени для проверок (тоже ?date=2026-12-06T20:00 и localStorage 'ds_proto.debugDate'); ?speed=60 — время ×60
// Правила дат здесь (синхронно, без ожидания JSON); тексты — в assets_v3/world/calendar.json. checks/time_check.cjs сверяет, что правила совпадают.
(function () {
  const SEASONS = { fruehling: 'der Frühling', sommer: 'der Sommer', herbst: 'der Herbst', winter: 'der Winter' };
  const PHASE_DE = { morgen: 'Morgen', tag: 'Tag', abend: 'Abend', nacht: 'Nacht' };
  const WD = ['der Sonntag', 'der Montag', 'der Dienstag', 'der Mittwoch', 'der Donnerstag', 'der Freitag', 'der Samstag'];
  // rule: fixed {m,d} | easter {off} | nth {m, wd, n} (n = -1 — последний) | advent {n} ; days — длительность; decor [от, до] в днях от начала
  const RULES = {
    neujahr: { type: 'fixed', m: 1, d: 1, days: 1, decor: [-1, 0] },
    heilige_drei_koenige: { type: 'fixed', m: 1, d: 6, days: 1 },
    brezels_geburtstag: { type: 'fixed', m: 2, d: 3, days: 1 },
    valentinstag: { type: 'fixed', m: 2, d: 14, days: 1 },
    fasching: { type: 'easter', off: -52, days: 6 },
    rosenmontag: { type: 'easter', off: -48, days: 1 },
    karfreitag: { type: 'easter', off: -2, days: 1 },
    ostern: { type: 'easter', off: 0, days: 2, decor: [-7, 1] },
    tag_der_arbeit: { type: 'fixed', m: 5, d: 1, days: 1, decor: [-1, 30] },
    muttertag: { type: 'nth', m: 5, wd: 0, n: 2, days: 1 },
    christi_himmelfahrt: { type: 'easter', off: 39, days: 1 },
    pfingsten: { type: 'easter', off: 49, days: 2 },
    sommersonnenwende: { type: 'fixed', m: 6, d: 21, days: 1 },
    hafenfest: { type: 'nth', m: 7, wd: 6, n: 1, days: 2, decor: [-2, 1] },
    brezelfest: { type: 'nth', m: 8, wd: 6, n: 2, days: 2, decor: [-2, 1] },
    apfeltag: { type: 'nth', m: 9, wd: 6, n: 3, days: 1 },
    tag_der_deutschen_einheit: { type: 'fixed', m: 10, d: 3, days: 1 },
    erntedankfest: { type: 'nth', m: 10, wd: 0, n: 1, days: 1, decor: [-2, 0] },
    uhrturmnacht: { type: 'nth', m: 10, wd: 0, n: -1, days: 1 },
    reformationstag: { type: 'fixed', m: 10, d: 31, days: 1 },
    halloween: { type: 'fixed', m: 10, d: 31, days: 1, decor: [-3, 0] },
    sankt_martin: { type: 'fixed', m: 11, d: 11, days: 1, decor: [-1, 0] },
    weihnachtsmarkt: { type: 'advent', n: 1, shift: -6, untilM: 12, untilD: 23 },
    advent_1: { type: 'advent', n: 1, days: 1 },
    nikolaus: { type: 'fixed', m: 12, d: 6, days: 1, decor: [-1, 0] },
    advent_2: { type: 'advent', n: 2, days: 1 },
    advent_3: { type: 'advent', n: 3, days: 1 },
    advent_4: { type: 'advent', n: 4, days: 1 },
    heiligabend: { type: 'fixed', m: 12, d: 24, days: 1, decor: [-24, 13] },
    weihnachten: { type: 'fixed', m: 12, d: 25, days: 2 },
    silvester: { type: 'fixed', m: 12, d: 31, days: 1 },
  };
  const day0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  function easter(y) {                                             // анонимный григорианский алгоритм (Meeus/Jones/Butcher)
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }
  const advent = (y, n) => { const x = new Date(y, 11, 24); return addD(x, -x.getDay() - (4 - n) * 7); };   // 4. Advent — воскресенье ≤ 24.12
  function nth(y, m, wd, n) {
    if (n > 0) { const f = new Date(y, m - 1, 1); return addD(f, ((wd - f.getDay() + 7) % 7) + (n - 1) * 7); }
    const l = new Date(y, m, 0); return addD(l, -((l.getDay() - wd + 7) % 7));
  }
  function startOf(id, y) {
    const r = RULES[id]; if (!r) return null;
    if (r.type === 'fixed') return new Date(y, r.m - 1, r.d);
    if (r.type === 'easter') return addD(easter(y), r.off);
    if (r.type === 'nth') return nth(y, r.m, r.wd, r.n);
    if (r.type === 'advent') return addD(advent(y, r.n), r.shift || 0);
    return null;
  }
  function lenOf(id, y) { const r = RULES[id]; if (r.untilM) return Math.round((new Date(y, r.untilM - 1, r.untilD) - startOf(id, y)) / 864e5) + 1; return r.days || 1; }
  function inWin(id, date, a, b) {                                 // a..b — дни от начала (включительно); проверяем год даты и соседние (декор Weihnachten → январь)
    const t = day0(date);
    for (const y of [t.getFullYear() - 1, t.getFullYear(), t.getFullYear() + 1]) { const s = startOf(id, y); if (s && t >= addD(s, a) && t <= addD(s, b)) return true; }
    return false;
  }
  function festivalsOn(date) { date = date ? new Date(date) : now().date; return Object.keys(RULES).filter(id => inWin(id, date, 0, lenOf(id, date.getFullYear()) - 1)); }
  function decorOn(date) {
    date = date ? new Date(date) : now().date;
    return Object.keys(RULES).filter(id => { const r = RULES[id], n = lenOf(id, date.getFullYear()), dc = r.decor || [0, n - 1]; return inWin(id, date, dc[0], Math.max(dc[1], n - 1)); });
  }
  function datesOf(y) { const o = {}; Object.keys(RULES).forEach(id => { const s = startOf(id, y), n = lenOf(id, y); o[id] = Array.from({ length: n }, (_, i) => addD(s, i)); }); return o; }
  function seasonOf(date) { const m = new Date(date).getMonth() + 1; return m >= 3 && m <= 5 ? 'fruehling' : m >= 6 && m <= 8 ? 'sommer' : m >= 9 && m <= 11 ? 'herbst' : 'winter'; }
  // Фазы: база (Frühling/Herbst) morgen 5–10, tag 10–17, abend 17–21, nacht 21–5. Логика долготы дня (Германия, ~50° с. ш.):
  // летом светло дольше (tag до 18, abend 18–22, nacht с 22), зимой темнеет рано (morgen 6–10, tag 10–16, abend 16–20, nacht 20–6).
  const PH = { fruehling: [5, 10, 17, 21], herbst: [5, 10, 17, 21], sommer: [5, 10, 18, 22], winter: [6, 10, 16, 20] };
  function phaseOf(date) { const d = new Date(date), h = d.getHours(), [m, t, a, n] = PH[seasonOf(d)]; return h >= m && h < t ? 'morgen' : h >= t && h < a ? 'tag' : h >= a && h < n ? 'abend' : 'nacht'; }

  // ---- часы: настоящее время или debug (точка отсчёта + прошедшее реальное время × speed)
  let dbg = null, speed = 1;
  function parseIso(s) { if (!s) return null; s = String(s).trim(); if (/^\d{4}-\d\d-\d\d$/.test(s)) s += 'T12:00'; const d = new Date(s); return isNaN(d) ? null : d; }
  function setDebug(iso, opt) {
    const d = parseIso(iso); dbg = d ? { at: d.getTime(), t0: Date.now() } : null;
    try { if (d) localStorage.setItem('ds_proto.debugDate', iso); else localStorage.removeItem('ds_proto.debugDate'); } catch (e) {}
    if (opt && opt.speed) speed = +opt.speed || 1;
    tick(true); return dbg ? new Date(dbg.at) : null;
  }
  (function init() {
    let q = null; try { const p = new URLSearchParams(location.search); q = p.get('date'); if (p.get('speed')) speed = +p.get('speed') || 1; } catch (e) {}
    let ls = null; try { ls = localStorage.getItem('ds_proto.debugDate'); } catch (e) {}
    const d = parseIso(q || ls); if (d) dbg = { at: d.getTime(), t0: Date.now() };
  })();
  const clockMs = () => dbg ? dbg.at + (Date.now() - dbg.t0) * speed : (speed !== 1 ? boot.at + (Date.now() - boot.at) * speed : Date.now());
  const boot = { at: Date.now() };
  function now() {
    const date = new Date(clockMs()), phase = phaseOf(date), season = seasonOf(date);
    return { date, hour: date.getHours(), minute: date.getMinutes(), phase, phaseDe: PHASE_DE[phase], isNight: phase === 'nacht', season, seasonDe: SEASONS[season],
      festivals: festivalsOn(date), weekday: date.getDay(), weekdayDe: WD[date.getDay()], debug: !!dbg };
  }
  // daylight 0..1 (плавно, по минутам) — для тонировки: 0 ночь, 1 день. Восход/закат — средние для Саксонии (Chemnitz, 50,8° с. ш.)
  // на 15-е число месяца, местное время с летним временем (timeanddate.com); между ними — линейно по дням. 11.11 17:40 — уже сумерки, как на самом деле.
  const SUN = [[8.1, 16.5], [7.5, 17.3], [6.5, 18.2], [6.5, 20.0], [5.6, 20.8], [4.9, 21.5], [5.2, 21.3], [5.9, 20.5], [6.8, 19.4], [7.6, 18.3], [7.4, 16.5], [8.1, 16.0]];
  function sunOf(date) {
    const d = new Date(date), m = d.getMonth(), f = (d.getDate() - 15) / 30, j = f >= 0 ? (m + 1) % 12 : (m + 11) % 12, t = Math.abs(f);
    return [0, 1].map(k => SUN[m][k] + (SUN[j][k] - SUN[m][k]) * t);
  }
  function light(date) {
    date = date ? new Date(date) : now().date; const h = date.getHours() + date.getMinutes() / 60, [r, s] = sunOf(date);
    const keys = [[0, 0], [r - 1, 0], [r, 0.55], [r + 1.5, 1], [s - 1, 1], [s, 0.6], [s + 1, 0.2], [s + 1.8, 0], [24, 0]];
    for (let i = 1; i < keys.length; i++) if (h <= keys[i][0]) { const [h0, v0] = keys[i - 1], [h1, v1] = keys[i], t = (h - h0) / (h1 - h0); return v0 + (v1 - v0) * (t * t * (3 - 2 * t)); }
    return 0;
  }

  // ---- события
  const subs = { phase: [], season: [], festival: [], minute: [] };
  function on(ev, fn) { if (!subs[ev]) return () => {}; subs[ev].push(fn); return () => { subs[ev] = subs[ev].filter(f => f !== fn); }; }
  const emit = (ev, n, info) => subs[ev].slice().forEach(f => { try { f(n, info); } catch (e) { console.error('WorldTime ' + ev, e); } });
  let last = null;
  function tick(force) {
    const n = now(), key = n.date.getFullYear() + '-' + n.date.getMonth() + '-' + n.date.getDate() + ' ' + n.hour + ':' + n.minute;
    if (!last || last.key !== key || force) {
      const p = last; last = { key, phase: n.phase, season: n.season, fest: n.festivals.join(',') };
      emit('minute', n, {});
      if (!p || p.phase !== n.phase) emit('phase', n, { from: p && p.phase });
      if (!p || p.season !== n.season) emit('season', n, { from: p && p.season });
      if (!p || p.fest !== last.fest) { const was = p && p.fest ? p.fest.split(',') : []; emit('festival', n, { added: n.festivals.filter(x => !was.includes(x)), removed: was.filter(x => !n.festivals.includes(x)) }); }
    }
  }
  setInterval(() => tick(false), 1000);

  // ---- calendar.json (тексты, лексика, украшения, реплики)
  let CAL = null; const waiters = [];
  function ready(fn) { if (CAL) fn(CAL); else waiters.push(fn); }
  function festival(id) { return CAL && CAL.festivals ? CAL.festivals.find(f => f.id === id) || null : null; }
  try {
    fetch('assets_v3/world/calendar.json').then(r => r.json()).then(j => { CAL = j; waiters.splice(0).forEach(f => { try { f(j); } catch (e) { console.error(e); } }); }).catch(e => console.warn('calendar.json', e));
  } catch (e) {}

  window.WorldTime = { now, on, festivalsOn, decorOn, seasonOf, phaseOf, setDebug, easter, datesOf, light, festival, ready, RULES, SEASONS, PHASE_DE, PH,
    get calendar() { return CAL; }, setSpeed(s) { speed = +s || 1; } };
  tick(true);
})();
