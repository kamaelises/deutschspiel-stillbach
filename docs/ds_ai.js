// ИИ публично (25.11): слои ИИ-беседы, которые работают и без ПК (GitHub Pages). Порядок, игрок видит, кто отвечает:
//  (а) pc      — Ollama на ПК автора (/ollama, только если отвечает; в публичной сборке __mfAiOff → не стучимся);
//  (б) key     — СВОЙ бесплатный ключ игрока: Google Gemini (из браузера, generativelanguage.googleapis.com), запас Groq / OpenRouter;
//                ключ только в localStorage этого устройства (ds_ai.key), уходит только в выбранный сервис; кнопка «Удалить ключ»;
//  (в) browser — ИИ в браузере (@mlc-ai/web-llm, WebGPU): модель качается ТОЛЬКО по кнопке с согласия, только простые реплики;
//  (г) off     — готовые реплики уроков (их показывает вызывающий: friend.js/mentor.js/tutor.js).
// Сложные диалоги (complex: «почему», длинные, A2+) — только (а)/(б); на (в) — ошибка code 'simple' → плашка «упрощённый режим».
// Один файл на приложение (app/src/core/ds_ai.js — import ради побочного эффекта) и мир (tasks/world_v2/proto/ds_ai.js — копия 1:1,
// сверка в checks/ai_layers_check.cjs). Мир в iframe приложения берёт экземпляр родителя: один ключ, одна модель в памяти.
// Cloudflare-воркер (app/workers/ai-proxy) по умолчанию ВЫКЛЮЧЕН: G.DSAI_CFG.proxy пусто.
(function (G) {
  'use strict';
  if (G.DSAI) return;
  try { if (G.parent && G.parent !== G && G.parent.DSAI && G.parent.location.origin === G.location.origin) { G.DSAI = G.parent.DSAI; return; } } catch (e) { /* чужой родитель */ }
  const ls = {
    get(k) { try { return JSON.parse(G.localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { G.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* приватный режим */ } },
    del(k) { try { G.localStorage.removeItem(k); } catch (e) { /* нет */ } },
  };
  const K = { key: 'ds_ai.key', later: 'ds_ai.later', web: 'ds_ai.web' };
  let _fetch = (...a) => G.fetch(...a);
  const tmo = (ms, run) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); return Promise.resolve().then(() => run(c.signal)).finally(() => clearTimeout(t)); };
  function lang() {
    try { const l = G.location || {}, q = /[?&]lang=(en|ru)\b/.exec((l.search || '') + (l.hash || '')); if (q) return q[1]; const v = G.localStorage.getItem('ds_lang'); if (v === 'en' || v === 'ru') return v; } catch (e) { /* нет */ }
    return G.__DS_LANG_DEFAULT || 'ru';
  }
  // RU/EN: словарь приложения (window.t, tasks\en\app_ai.tsv / game_ai.tsv) — главный; встроенный en — запас (мир без приложения)
  const L = (ru, en) => { if (lang() !== 'en') return ru; try { const v = typeof G.t === 'function' ? G.t(ru, ru) : ru; if (v && v !== ru && !/[\u0400-\u04FF]/.test(v)) return v; } catch (e) { /* нет словаря */ } return en; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const err = (code, msg) => Object.assign(new Error(msg || code), { code });
  const S = { st: null, at: 0, keyDown: null };
  function changed() { S.st = null; try { G.dispatchEvent(new G.CustomEvent('dsai-change')); } catch (e) { /* нет DOM */ } }

  // ---------- (а) ПК автора: Ollama + LanguageTool (как было в mentor.js / core/ai.js)
  const PC = { MODEL: 'gemma4:12b', KEEP: '30m', warming: null };
  PC.off = () => !!G.__mfAiOff;
  PC.status = () => PC.off() ? Promise.resolve({ ok: false, lt: false }) : Promise.all([
    tmo(4000, s => _fetch('/ollama/api/tags', { signal: s, cache: 'no-store' })).then(async r => r.ok && ((await r.json()).models || []).some(m => m.name === PC.MODEL || m.model === PC.MODEL)).catch(() => false),
    tmo(4000, s => _fetch('/lt/v2/languages', { signal: s, cache: 'no-store' })).then(r => !!r.ok).catch(() => false),
  ]).then(([ok, lt]) => ({ ok, lt }));
  PC.warm = function () {                                            // уже в памяти -> продлить; нет -> загрузить (до ~90 с с HDD)
    if (PC.off()) return Promise.resolve({ loaded: false, ms: 0 });
    if (PC.warming) return PC.warming; const t0 = Date.now(), body = JSON.stringify({ model: PC.MODEL, keep_alive: PC.KEEP });
    PC.warming = tmo(5000, s => _fetch('/ollama/api/ps', { signal: s, cache: 'no-store' })).then(r => r.ok ? r.json() : { models: [] }).catch(() => ({ models: [] })).then(j => {
      if ((j.models || []).some(m => m.name === PC.MODEL || m.model === PC.MODEL)) { _fetch('/ollama/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {}); return { loaded: true, already: true, ms: Date.now() - t0 }; }
      return tmo(180000, s => _fetch('/ollama/api/generate', { method: 'POST', signal: s, headers: { 'Content-Type': 'application/json' }, body })).then(r => ({ loaded: r.ok, already: false, ms: Date.now() - t0 })).catch(() => ({ loaded: false, ms: Date.now() - t0 }));
    }).finally(() => setTimeout(() => { PC.warming = null; }, 1000));
    return PC.warming;
  };
  PC.chat = (messages, o) => tmo(o.ms || 150000, s => _fetch('/ollama/api/chat', { method: 'POST', signal: s, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: PC.MODEL, stream: false, think: false, keep_alive: PC.KEEP, options: { temperature: 0.4, num_predict: o.maxTok || 160 }, messages }) }))
    .then(r => { if (!r.ok) throw err('busy', 'ПК ответил ' + r.status); return r.json(); }).then(j => (j.message && j.message.content) || '');
  PC.lt = text => PC.off() ? Promise.resolve(null) : tmo(6000, s => _fetch('/lt/v2/check', { method: 'POST', signal: s, body: new URLSearchParams({ language: 'de-DE', text }) }))
    .then(r => r.ok ? r.json() : null).then(j => j ? (j.matches || []).map(m => ({ message: m.message, offset: m.offset, length: m.length, rep: (m.replacements || []).slice(0, 2).map(x => x.value) })) : null).catch(() => null);

  // ---------- (б) свой ключ игрока. Модель выбирается по списку моделей ключа (имена у Google меняются) — первая из pref, что есть и отвечает.
  const PROXY = String((G.DSAI_CFG && G.DSAI_CFG.proxy) || '').replace(/\/$/, '');   // по умолчанию пусто = прокси выключен (app/workers/ai-proxy)
  const GEM = PROXY ? PROXY + '/gemini/v1beta/' : 'https://generativelanguage.googleapis.com/v1beta/';
  const PROV = {
    gemini: { name: 'Google', re: /^AIza[\w-]{30,}$/, url: 'https://aistudio.google.com/apikey',
      pref: ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'] },
    groq: { name: 'Groq', re: /^gsk_\w{20,}$/, base: 'https://api.groq.com/openai/v1',
      pref: [/^llama-3\.3-70b-versatile$/, /^meta-llama\/llama-4-maverick/, /^meta-llama\/llama-4-scout/, /^openai\/gpt-oss-120b$/, /^qwen\/qwen3-32b$/, /^llama-3\.1-8b-instant$/] },
    openrouter: { name: 'OpenRouter', re: /^sk-or-[\w-]{20,}$/, base: 'https://openrouter.ai/api/v1',
      pref: [/gemma-3-27b.*:free$/, /llama-3\.3-70b.*:free$/, /llama-4.*:free$/, /mistral-small.*:free$/, /qwen.*:free$/, /:free$/] },
  };
  const SAFE = ['HARASSMENT', 'HATE_SPEECH', 'SEXUALLY_EXPLICIT', 'DANGEROUS_CONTENT'].map(c => ({ category: 'HARM_CATEGORY_' + c, threshold: 'BLOCK_LOW_AND_ABOVE' }));
  const clean = k => String(k || '').trim().replace(/^["'\s]+|["'\s]+$/g, '');
  const detect = k => { k = clean(k); return Object.keys(PROV).find(p => PROV[p].re.test(k)) || null; };
  const keyInfo = () => { const c = ls.get(K.key); return c && PROV[c.p] ? { p: c.p, name: PROV[c.p].name, model: c.model, at: c.at } : null; };
  const keyDown = () => (S.keyDown && Date.now() < S.keyDown.until ? S.keyDown.code : null);
  function clearKey() { ls.del(K.key); S.keyDown = null; changed(); }
  function httpErr(s, m) {
    m = String(m || '');
    if (/location is not supported|not available in your (country|region)|unsupported_country/i.test(m)) return err('region', m);
    if (s === 429 || s === 402 || /quota|rate.?limit|RESOURCE_EXHAUSTED|credits/i.test(m)) return err('quota', m);
    if (s === 401 || s === 403 || (s === 400 && /api.?key|API_KEY/i.test(m))) return err('bad-key', m);
    if (s === 404) return err('model', m);
    return err('busy', s + ' ' + m);
  }
  async function gem(c, messages, o, signal) {
    const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n'), contents = [];
    messages.filter(m => m.role !== 'system').forEach(m => { const role = m.role === 'assistant' ? 'model' : 'user', last = contents[contents.length - 1];
      if (last && last.role === role) last.parts[0].text += '\n' + m.content; else contents.push({ role, parts: [{ text: String(m.content) }] }); });
    if (!contents.length || contents[0].role !== 'user') contents.unshift({ role: 'user', parts: [{ text: '(начало разговора)' }] });
    const gc = { temperature: 0.5, maxOutputTokens: c.noThink ? 1500 : Math.max(60, (o.maxTok || 160) * 2) };
    if (!c.noThink) gc.thinkingConfig = { thinkingBudget: 0 };               // ответы короткие: «размышление» модели не нужно
    const body = { contents, generationConfig: gc, safetySettings: SAFE }; if (sys) body.systemInstruction = { parts: [{ text: sys }] };
    const r = await _fetch(GEM + 'models/' + encodeURIComponent(c.model) + ':generateContent', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.k }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const m = (j.error && j.error.message) || ''; if (!c.noThink && r.status === 400 && /thinking/i.test(m)) { c.noThink = true; return gem(c, messages, o, signal); } throw httpErr(r.status, m); }
    const cand = (j.candidates || [])[0], text = cand && cand.content ? (cand.content.parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim() : '';
    if (!text && ((j.promptFeedback && j.promptFeedback.blockReason) || (cand && /SAFETY|PROHIBITED|BLOCK/.test(cand.finishReason || '')))) throw err('safety');
    return text;
  }
  async function oa(c, messages, o, signal) {
    const P = PROV[c.p], h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.k }; if (c.p === 'openrouter') h['X-Title'] = 'DeutschSpiel';
    const r = await _fetch(P.base + '/chat/completions', { method: 'POST', signal, headers: h, body: JSON.stringify({ model: c.model, messages, max_tokens: Math.max(60, (o.maxTok || 160) * 2), temperature: 0.5 }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw httpErr(r.status, (j.error && (j.error.message || j.error)) || '');
    return String((((j.choices || [])[0] || {}).message || {}).content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }
  const keyCall = (c, messages, o) => tmo(o.ms || 45000, s => (c.p === 'gemini' ? gem : oa)(c, messages, o, s))
    .catch(e => { throw e && e.code ? e : err(e && e.name === 'AbortError' ? 'slow' : 'net', e && e.message); });
  async function models(p, k) {                                      // кандидаты моделей ключа по порядку предпочтения
    const get = async (url, h) => { const r = await tmo(15000, s => _fetch(url, { signal: s, headers: h || {} })).catch(e => { throw err(e && e.name === 'AbortError' ? 'slow' : 'net'); });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw httpErr(r.status, (j.error && (j.error.message || j.error)) || ''); return j; };
    const pick = (ids, pref) => { const out = []; pref.forEach(x => ids.filter(id => (typeof x === 'string' ? id === x : x.test(id))).forEach(id => { if (!out.includes(id)) out.push(id); })); return out; };
    if (p === 'gemini') {
      const ids = ((await get(GEM + 'models?pageSize=1000', { 'x-goog-api-key': k })).models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => String(m.name).replace(/^models\//, ''));
      const out = pick(ids, PROV.gemini.pref); ids.filter(id => /flash/.test(id) && !/image|tts|live|audio|embed|vision|exp/.test(id)).forEach(id => { if (!out.includes(id)) out.push(id); });
      return out.length ? out : ['gemini-flash-latest'];
    }
    if (p === 'groq') return pick(((await get(PROV.groq.base + '/models', { Authorization: 'Bearer ' + k })).data || []).map(m => m.id), PROV.groq.pref);
    await get(PROV.openrouter.base + '/key', { Authorization: 'Bearer ' + k });        // ключ живой?
    return pick(((await get(PROV.openrouter.base + '/models')).data || []).map(m => m.id), PROV.openrouter.pref);
  }
  async function testKey(k) {                                        // мгновенная проверка: список моделей + один короткий ответ; удачный ключ сохраняется
    k = clean(k); const p = detect(k); if (!p) return { ok: false, code: 'format' };
    let last = err('model');
    try {
      const list = (await models(p, k)).slice(0, 3);
      for (const model of list) {
        const c = { p, k, model, at: Date.now() };
        try { await keyCall(c, [{ role: 'system', content: 'Antworte mit einem Wort.' }, { role: 'user', content: 'Sag: Hallo' }], { maxTok: 20, ms: 25000 }); ls.set(K.key, c); S.keyDown = null; changed(); return { ok: true, p, name: PROV[p].name, model }; }
        catch (e) { last = e; if (!/quota|model|busy|slow/.test(e.code)) break; }   // лимит 0 у этой модели / нет модели — следующая
      }
    } catch (e) { last = e; }
    return { ok: false, code: last.code || 'net', msg: last.message };
  }
  async function keyChat(messages, o) {
    const c = ls.get(K.key); if (!c || !PROV[c.p]) throw err('nokey');
    const was = !!c.noThink;
    try { return await keyCall(c, messages, o); }
    catch (e) { if (/quota|bad-key|region/.test(e.code)) S.keyDown = { code: e.code, until: Date.now() + (e.code === 'quota' ? 30 * 60000 : 864e5) }; throw e; }
    finally { if (!!c.noThink !== was) ls.set(K.key, c); }
  }

  // ---------- (в) ИИ в браузере: @mlc-ai/web-llm (WebGPU). Библиотека — vendor/web-llm-<версия>.js (копия из node_modules при сборке, не в предкэше).
  // Модель Gemma 3 1B (≈0,7 ГБ, многоязычная — лучший немецкий среди моделей ≤1 ГБ в списке web-llm); без shader-f16 — Llama 3.2 1B (f32).
  const WEB = { LIB: 'web-llm-0.2.89.js', WORKER: 'web-llm-worker-0.2.89.js', MODEL: 'gemma3-1b-it-q4f16_1-MLC', ALT: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
    SIZE: '0,7', eng: null, state: 'none', pct: 0, text: '', loading: null, f16: null, subs: [] };
  WEB.url = f => { const c = G.DSAI_CFG || {}; if (c.vendor) return c.vendor + f; const inWorld = /\/stillbach\//.test(G.location.pathname); return new URL((inWorld ? '../' : '') + 'vendor/' + f, G.location.href).href; };
  WEB.gpu = async () => { try { if (!G.navigator || !G.navigator.gpu) return false; const a = await G.navigator.gpu.requestAdapter(); if (!a) return false; WEB.f16 = !!(a.features && a.features.has('shader-f16')); return true; } catch (e) { return false; } };
  WEB.hasGpu = () => !!(G.navigator && G.navigator.gpu);
  WEB.model = () => (WEB.f16 === false ? WEB.ALT : WEB.MODEL);
  WEB.consented = () => !!ls.get(K.web);
  WEB.lib = () => WEB._lib || (WEB._lib = import(/* @vite-ignore */ WEB.url(WEB.LIB)).catch(e => { WEB._lib = null; throw err('nolib', e && e.message); }));
  WEB.load = function (onP, consent) {                               // consent=true — только из кнопки «Скачать»; иначе — лишь то, что уже скачано с согласия
    if (WEB.eng) return Promise.resolve(WEB.eng);
    if (onP) WEB.subs.push(onP); if (WEB.loading) return WEB.loading;
    WEB.state = 'loading'; WEB.pct = 0;
    WEB.loading = (async () => {
      if (!(await WEB.gpu())) throw err('nogpu');
      const lib = await WEB.lib(), model = WEB.model();
      if (!consent && !(await lib.hasModelInCache(model).catch(() => false))) { ls.del(K.web); throw err('webgone'); }   // кэш стёрт — без согласия не качаем
      const prog = r => { WEB.pct = r.progress || 0; WEB.text = r.text || ''; WEB.subs.forEach(f => { try { f(r); } catch (e) { /* UI */ } }); };
      let eng;
      try { eng = await lib.CreateWebWorkerMLCEngine(new Worker(WEB.url(WEB.WORKER), { type: 'module' }), model, { initProgressCallback: prog }); }
      catch (e) { if (e && /memory|device|gpu|adapter/i.test(e.message || '')) throw e; eng = await lib.CreateMLCEngine(model, { initProgressCallback: prog }); }
      ls.set(K.web, { model, at: Date.now() }); WEB.eng = eng; WEB.state = 'ready'; changed(); return eng;
    })().catch(e => { WEB.state = 'error'; WEB.err = e; throw e.code ? e : err('webfail', e && e.message); }).finally(() => { WEB.loading = null; WEB.subs = []; });
    return WEB.loading;
  };
  WEB.remove = async function () {
    const m = (ls.get(K.web) || {}).model || WEB.model(); ls.del(K.web);
    try { if (WEB.eng && WEB.eng.unload) await WEB.eng.unload(); } catch (e) { /* уже выгружен */ }
    WEB.eng = null; WEB.state = 'none';
    try { const lib = await WEB.lib(); await lib.deleteModelAllInfoInCache(m); } catch (e) { /* библиотеки нет — кэша тоже */ }
    changed();
  };
  WEB.chat = async function (messages, o) {                          // маленькая модель: system — внутрь первой реплики игрока, последние 6 реплик
    const eng = await WEB.load(); const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const rest = messages.filter(m => m.role !== 'system').slice(-6); while (rest.length && rest[0].role !== 'user') rest.shift();
    if (!rest.length) rest.push({ role: 'user', content: 'Hallo!' });
    rest[0] = { role: 'user', content: (sys ? sys + '\n\n' : '') + rest[0].content };
    const r = await eng.chat.completions.create({ messages: rest, max_tokens: Math.min(o.maxTok || 120, 160), temperature: 0.4 });
    return String((((r.choices || [])[0] || {}).message || {}).content || '').trim();
  };

  // ---------- язык объяснений (25.11, главный): при English — объяснения/подсказки/переводы по-английски, через английский; немецкие реплики — как есть
  const isEn = () => lang() === 'en';
  const langLine = () => (isEn() ? 'LANGUAGE: the learner uses the app in English. Write ALL explanations, hints, tips and translations (also the "RU:" and "TIPP:" lines) in simple English, never in Russian. '
    + 'Explain through English: compare with English grammar where it helps and point out typical mistakes of English speakers (verb in 2nd position, verb at the end, der/die/das, du/Sie, false friends like bekommen ≠ become). '
    + 'Put every German word or example in «…». German lines of the characters stay German.' : '');

  // ---------- заземление (25.11, главный): значения слов — из словаря УРОКОВ (public/ai_lex.json <- scripts/build_ai_lex.py: de.wiktionary + фразы уроков).
  // До ответа: ИИ получает значения слов из запроса и обязан опираться на них. После: пары «немецкое слово — перевод» в ответе сверяются со словарём;
  // явное расхождение -> пометка «⚠ Проверь» (или onBad:'flag' — вызывающий заменяет ответ объяснением из урока).
  const LEX = { p: null, d: null };
  const STOP = new Set('ich du er sie es wir ihr der die das den dem des ein eine einen einem einer und oder aber nicht ja nein ist bin bist sind war hat habe hast haben mit zu in im am an auf für von aus bei nach um wie was wo wer max'.split(' '));
  LEX.url = () => { const c = G.DSAI_CFG || {}; if (c.lex) return c.lex; const inWorld = /\/stillbach\//.test(G.location.pathname); return new URL((inWorld ? '../' : '') + 'ai_lex.json', G.location.href).href; };
  LEX.load = () => LEX.p || (LEX.p = Promise.resolve().then(() => tmo(15000, s => _fetch(LEX.url(), { signal: s }))).then(r => (r.ok ? r.json() : null))
    .then(j => (LEX.d = j && j.w && j.f ? j : null)).catch(() => (LEX.d = null)));
  const lemmaOf = (d, w) => { const k = String(w).toLowerCase(); return (d.f[k] && d.w[d.f[k]]) ? d.f[k] : d.w[w] ? w : null; };
  async function ground(text, en) {
    const d = await LEX.load(); if (!d) return { ctx: '', words: [] };
    const seen = new Set(), lines = [];
    for (const w of String(text || '').match(/[A-Za-zÄÖÜäöüß]{3,}/g) || []) {
      if (STOP.has(w.toLowerCase())) continue; const l = lemmaOf(d, w); if (!l || seen.has(l)) continue;
      const [ru, eng, pos] = d.w[l], g = en ? eng : ru; if (!g) continue; seen.add(l);
      const ex = d.ex[l]; lines.push(`${l}${pos ? ' (' + pos + ')' : ''}: ${g}${ex ? (en ? ` — in the lessons: «${ex[0]}»` : ` — в уроке: «${ex[0]}» = «${ex[1]}»`) : ''}`);
      if (lines.length >= 10) break;
    }
    return { words: [...seen], ctx: lines.length ? (en ? 'Course dictionary (word meanings — use ONLY these, do not invent other meanings):\n' : 'Словарь уроков (значения слов бери ТОЛЬКО отсюда, не выдумывай других):\n') + lines.join('\n') : '' };
  }
  // не перевод, а роль слова в объяснении («kommen — действие №2», «Woher — вопрос-слово») — такие пары не сверяем
  const RU_STOP = /^(может|это|так|как|тут|здесь|правильн|верн|ошибк|слов|глагол|вагон|мест|значит|то$|же$|а$|и$|не$|он$|она$|они$|мы$|вы$|ты$|я$|вопрос|действ|пульт|хвост|кто$|когда$|где$|част|форм|конец|конц|начал|втор|перв|трет|приставк|окончан|существ|прилагат|род$|числ|падеж|порядок|правил|пример|ответ|намёк|подсказк|артикл|номер|связк|отделяем)/i;
  function pairs(text, en) {                                         // «kommen — приходить», «kommen» как «…», «приходить (kommen)»; EN: kommen means "to come", "to come" (kommen)
    const out = [], s = String(text || '').replace(/\*\*/g, ''), D = '([A-Za-zÄÖÜäöüß]{3,})', Q = '[«"„“\']?', QE = '[»"“”\']?';
    const W = en ? '(?:to\\s+)?([A-Za-z]{2,}(?:\\s[A-Za-z]{2,})?)' : '([а-яё]{2,}(?:\\s[а-яё]{2,})?)';
    [new RegExp(Q + D + QE + '\\s*(?:—|–|=|:|' + (en ? 'means|translates as' : 'значит|означает|переводится как|это') + ')\\s*' + Q + W, 'gi'),
      new RegExp(Q + D + QE + '\\s+(?:' + (en ? 'as' : 'как|в значении') + ')\\s+[«"„“\']' + W, 'gi'),
      new RegExp('[«"„“\']' + W + QE + '\\s*\\(\\s*' + D + '\\s*\\)', 'gi')].forEach((r, i) => { let m; while ((m = r.exec(s))) out.push(i === 2 ? { de: m[2], tr: m[1] } : { de: m[1], tr: m[2] }); });
    return out;
  }
  const stemOk = (a, b) => { a = a.toLowerCase(); b = b.toLowerCase(); if (!a || !b) return false; if (a === b || (b.length > 3 && a.includes(b)) || (a.length > 3 && b.includes(a))) return true; let n = 0; while (n < a.length && a[n] === b[n]) n++; return n >= 3; };
  async function verify(text, en) {
    const d = await LEX.load(); if (!d) return { ok: true, bad: [], checked: 0 };
    const bad = []; let checked = 0;
    for (const p of pairs(text, en)) {
      if (STOP.has(p.de.toLowerCase())) continue; const l = lemmaOf(d, p.de); if (!l) continue;
      const first = p.tr.trim().split(/\s+/)[0]; if (!en && RU_STOP.test(first)) continue; if (en && /^(the|a|an|it|this|that|in|on|at|to|is|be|word|verb|question|action|subject|position|article|noun|ending|prefix|second|first|last|example|rule|answer|part|form|separable)$/i.test(first)) continue;
      const gl = (en ? d.w[l][1] : d.w[l][0]) || ''; if (!gl) continue; checked++;
      const ex = d.ex[l], ok = gl.split(/[;,]\s*/).concat(ex && !en ? ex[1].split(/[^А-Яа-яЁё]+/) : []).flatMap(g => g.replace(/^to\s+/i, '').split(/\s+/)).filter(x => x.length > 2);
      if (!ok.some(g => stemOk(first, g))) bad.push({ de: p.de, lemma: l, said: p.tr.trim(), expected: gl.split('; ').slice(0, 2).join(', '), ex: ex ? ex[0] : '' });
    }
    return { ok: !bad.length, bad, checked };
  }
  const badNote = (bad, en) => bad.map(b => (en ? `⚠ Check: «${b.de}» in the course means “${b.expected}” (the AI wrote “${b.said}”)${b.ex ? ', e.g. «' + b.ex + '»' : ''}.`
    : `⚠ Проверь: «${b.de}» в уроках — «${b.expected}» (ИИ написал «${b.said}»)${b.ex ? ', пример: «' + b.ex + '»' : ''}.`)).join('\n');
  async function prep(messages, o) {                                 // язык объяснений + словарь уроков -> в системную инструкцию
    const en = isEn(), add = []; if (en) add.push(langLine());
    if (o.ground !== false) { const u = [...messages].reverse().find(m => m.role === 'user'); const g = await ground((u ? u.content : '') + ' ' + (o.groundText || ''), en); if (g.ctx) add.push(g.ctx); }
    if (!add.length) return messages;
    const i = messages.findIndex(m => m.role === 'system'), extra = add.join('\n\n');
    return i >= 0 ? messages.map((m, k) => (k === i ? { role: 'system', content: m.content + '\n\n' + extra } : m)) : [{ role: 'system', content: extra }, ...messages];
  }

  // ---------- общее: кто отвечает, один ход, память, сложность, безопасность
  function labels() {
    const k = keyInfo();
    return { pc: L('ИИ: ПК', 'AI: PC'), cloud: L('ИИ: облако', 'AI: cloud'), key: L('ИИ: твой ключ', 'AI: your key') + (k ? ' · ' + k.name : ''),
      browser: L('ИИ в телефоне', 'AI on this device'), off: L('ИИ выкл.', 'AI off') };
  }
  async function status(force) {
    if (!force && S.st && Date.now() - S.at < 30000) return S.st;
    const pc = await PC.status(), k = keyInfo(), web = WEB.eng ? 'ready' : WEB.consented() && WEB.hasGpu() ? 'cached' : 'none';
    const route = pc.ok ? 'pc' : k && !keyDown() ? 'key' : web !== 'none' ? 'browser' : 'off';
    S.st = { route, pc: pc.ok, ollama: pc.ok, lt: pc.lt, key: k, keyDown: keyDown(), web, label: labels()[route] }; S.at = Date.now();
    return S.st;
  }
  const UNSAFE = /\b(waffen?|pistolen?|gewehre?|töten|tötet|umbringen|erschießen|drogen?|kokain|heroin|sex|sexy|nackt|selbstmord|blut)\b|оружи|пистолет|убий|убить|наркот|секс|голы[йе]|самоубий|суицид/i;
  const UNSAFE_CHILD = /\b(alkohol|bier|wein|schnaps|wodka|zigaretten?|rauchen|betrunken|küssen|kuss|heiraten)\b|алкогол|пиво|водк|сигарет|курить|поцел/i;
  const unsafe = (t, child) => UNSAFE.test(t || '') || (!!child && UNSAFE_CHILD.test(t || ''));
  const isComplex = (text, o) => { o = o || {}; text = String(text || '');
    return !!o.complex || text.length > 140 || /почему|зачем|объясни|правило|правила|warum|wieso|weshalb|erklär|why|explain|grammar|граммат/i.test(text) || (o.turns || 0) > 16 || /^(A2|B1|B2)/.test(o.level || ''); };
  function memo(hist, n) {                                           // память беседы: краткая выжимка старых реплик + последние n
    n = n || 6; hist = (hist || []).filter(m => m && m.content && m.role !== 'system');
    if (hist.length <= n) return { summary: '', recent: hist.slice() };
    const pick = m => { const s = String(m.content), de = (s.match(/^DE:\s*(.+)$/im) || [])[1]; return (m.role === 'user' ? 'Max: ' : '') + String(de || (m.role === 'user' ? s : '')).slice(0, 70); };
    const lines = hist.slice(0, -n).map(pick).filter(x => x && x !== 'Max: ');
    return { summary: lines.length ? 'Кратко, о чём говорили раньше: ' + lines.slice(-8).join(' / ').slice(0, 420) : '', recent: hist.slice(-n) };
  }
  async function chat(messages, o) {                                 // → {text, route, label}; ошибки: code off | simple | quota | bad-key | net | safety …
    o = Object.assign({ maxTok: 160 }, o || {});
    const st = await status(o.force), order = o.only ? [o.only] : ['pc', 'key', 'browser']; let last = null;
    const msgs = await prep(messages, o), en = isEn();
    for (const r of order) {
      if (r === 'pc' && !st.pc) continue;
      if (r === 'key' && (!st.key || keyDown())) continue;
      if (r === 'browser') { if (st.web === 'none') continue; if (o.complex) { last = err('simple'); continue; } }
      try {
        let text = r === 'pc' ? await PC.chat(msgs, o) : r === 'key' ? await keyChat(msgs, o) : await WEB.chat(msgs, o), bad = [];
        if (unsafe(text, o.child)) throw err('safety');
        if (r !== st.route) S.st = null;                             // ответил запасной слой — статус пересчитать
        if (o.verify !== false) { const v = await verify(text, en); bad = v.bad; if (bad.length && o.onBad !== 'flag') text += '\n' + badNote(bad, en); }
        return { text, route: r, label: labels()[r], simple: r === 'browser', bad };
      } catch (e) { last = e; if (e.code === 'safety') break; if (r === 'browser' && e.code === 'webgone') S.st = null; }
    }
    throw last || err('off');
  }

  // ---------- тексты (RU/EN; без терминов: «ключ», «умный собеседник»)
  const T = {
    title: () => L('Умный собеседник', 'Smart chat partner'), sub: () => L('бесплатно · 1 минута', 'free · 1 minute'),
    why: who => L(`Чтобы ${who} отвечали как живые, подключи свой бесплатный ключ Google. Без ключа — готовые реплики уроков.`, `Connect your own free Google key so ${who} can really talk with you. Without a key you get lesson lines.`),
    steps: () => [L('Получить ключ', 'Get a key'), L('Вставить', 'Paste'), L('Работает ✓', 'Works ✓')],
    hint1: () => L('Откроется страница Google (войди в свой аккаунт). Нажми <span class="dsai-pill">Create API key</span>, потом <span class="dsai-pill">Copy</span> — и вернись сюда.',
      'A Google page opens (sign in). Tap <span class="dsai-pill">Create API key</span>, then <span class="dsai-pill">Copy</span> — and come back here.'),
    hint2: () => L('Ключ скопирован? Нажми «Вставить» — проверю сразу.', 'Copied the key? Tap “Paste” — I check it right away.'),
    field: () => L('вставь ключ сюда', 'paste the key here'), check: () => L('Проверить', 'Check'), checking: () => L('Проверяю ключ…', 'Checking the key…'),
    noclip: () => L('Не вижу ключ. Вставь его в поле ниже (долгое нажатие → «Вставить»).', 'I can’t see the key. Paste it into the field below (long press → Paste).'),
    ok: name => L(`Работает ✓ Теперь отвечает умный собеседник (${name}).`, `Works ✓ The smart partner (${name}) is answering now.`),
    later: () => L('Умный собеседник выключен — отвечают реплики уроков.', 'Smart partner is off — lesson lines answer.'),
    connect: () => L('Подключить', 'Connect'), del: () => L('Удалить ключ', 'Delete key'), deleted: () => L('Ключ удалён с этого устройства.', 'The key was deleted from this device.'),
    keyOn: name => L(`Ключ: ${name} ✓`, `Key: ${name} ✓`), keyOff: () => L('Ключ не подключён', 'No key yet'),
    webBtn: () => L(`Без ключа: ИИ в телефоне (≈0,7 ГБ)`, `No key: AI on this device (≈0.7 GB)`),
    webAsk: () => L(`Скачать умного собеседника в это устройство? Один раз ≈0,7 ГБ — лучше по Wi-Fi. Потом работает без интернета, но понимает только простые короткие фразы.`,
      `Download a smart partner to this device? Once, ≈0.7 GB — better on Wi-Fi. Then it works offline, but only for short simple phrases.`),
    webGo: () => L('Скачать', 'Download'), back: () => L('Назад', 'Back'), webLoad: p => L(`Скачиваю… ${p} %`, `Downloading… ${p} %`),
    webOk: () => L('Готово ✓ ИИ в телефоне включён (простые фразы).', 'Done ✓ On-device AI is on (simple phrases).'),
    webOn: () => L('ИИ в телефоне: скачан ✓', 'On-device AI: downloaded ✓'), webDel: () => L('Удалить', 'Delete'),
    privacy: () => L('🔒 Ключ хранится только на этом устройстве. Бесплатный ключ: Google может читать сообщения, чтобы улучшать свои сервисы, — не пиши личное (адрес, телефон, фамилию).',
      '🔒 The key stays only on this device. Free keys: Google may read messages to improve its services — don’t write anything personal (address, phone, surname).'),
    simple: () => L('Упрощённый режим: ИИ в телефоне понимает только короткие простые фразы. Для «почему?» и длинных разговоров подключи ключ.',
      'Simple mode: on-device AI only handles short simple phrases. For “why?” questions and long talks connect a key.'),
  };
  const ERR = {
    format: () => L('Это не похоже на ключ. Нужна строка, которая начинается с AIza…', 'This doesn’t look like a key. It starts with AIza…'),
    'bad-key': () => L('Ключ не подошёл. Скопируй его ещё раз целиком.', 'This key didn’t work. Copy it again in full.'),
    quota: () => L('Лимит бесплатного ключа на сегодня исчерпан — позже снова заработает. Пока отвечают реплики уроков.', 'The free key’s limit is used up for now — it will work again later.'),
    region: () => L('Google не даёт бесплатный ключ в этой стране. Можно ИИ в телефоне.', 'Google doesn’t offer free keys in this country. Try on-device AI.'),
    net: () => L('Нет связи с интернетом — проверь и нажми ещё раз.', 'No internet connection — check it and try again.'),
    slow: () => L('Сервис долго не отвечает — попробуй ещё раз.', 'The service is slow — try again.'),
    busy: () => L('Сервис занят — попробуй через минуту.', 'The service is busy — try again in a minute.'),
    model: () => L('Для этого ключа нет подходящей модели — попробуй другой ключ.', 'No suitable model for this key — try another key.'),
    nogpu: () => L('Это устройство не умеет запускать ИИ в браузере (нужен WebGPU). Подключи ключ.', 'This device can’t run AI in the browser (needs WebGPU). Connect a key.'),
    nolib: () => L('Не удалось загрузить ИИ в телефоне — проверь интернет.', 'Couldn’t load on-device AI — check the internet.'),
    webfail: () => L('ИИ в телефоне не запустился (мало памяти?). Подключи ключ.', 'On-device AI didn’t start (low memory?). Connect a key.'),
  };
  const errText = code => (ERR[code] || ERR.busy)();
  const later = () => { ls.set(K.later, Date.now()); };
  async function shouldOffer() {                                     // мастер — в момент ИИ-беседы, если никто не отвечает; «Позже» — не чаще раза в день
    const st = await status(); if (st.route !== 'off') return false;
    const t = ls.get(K.later); return !(t && Date.now() - t < 864e5);
  }
  const CSS = `.dsai{font-size:15px;line-height:1.3;color:inherit;border:2px dashed rgba(47,154,79,.8);border-radius:10px;padding:8px 10px;margin:6px 0;background:rgba(127,127,127,.08);display:flex;flex-direction:column;gap:6px;max-width:100%;box-sizing:border-box;overflow-wrap:anywhere;text-align:left;font-family:inherit}
.dsai *{box-sizing:border-box}.dsai [hidden]{display:none!important}
.dsai-h{font-weight:800;font-size:16px}.dsai-h small{font-weight:400;opacity:.75;margin-left:6px;font-size:12px}
.dsai-steps{display:flex;gap:4px;margin:0;padding:0;list-style:none;flex-wrap:wrap}
.dsai-steps li{flex:1 1 88px;display:flex;align-items:center;gap:5px;padding:3px 6px;border-radius:8px;border:1px solid rgba(127,127,127,.5);font-size:13px;opacity:.6;min-width:0}
.dsai-steps li.on{opacity:1;border-color:#2f9a4f;box-shadow:0 0 0 2px rgba(47,154,79,.35)}.dsai-steps li.ok{opacity:1}
.dsai-steps b{display:inline-flex;width:20px;height:20px;border-radius:50%;align-items:center;justify-content:center;background:#2f9a4f;color:#fff;font-size:12px;flex:0 0 auto}
.dsai-row{display:flex;gap:6px;flex-wrap:wrap}
.dsai-b{font:inherit;font-size:15px;min-height:40px;padding:4px 12px;border-radius:8px;border:2px solid #2f9a4f;background:transparent;color:inherit;cursor:pointer;flex:1 1 auto;line-height:1.1}
.dsai-b.main{background:#2f9a4f;color:#fff}.dsai-b.ghost{border-color:rgba(127,127,127,.6);flex:0 1 auto}
.dsai-b.small{min-height:34px;font-size:13px;padding:2px 10px;flex:0 0 auto}
.dsai-hint{font-size:13px}.dsai-pill{display:inline-block;padding:0 6px;border-radius:12px;border:1px solid currentColor;font-size:12px;white-space:nowrap}
.dsai-in{display:flex;gap:6px}.dsai-in input{flex:1;min-width:0;height:40px;font:inherit;font-size:14px;padding:0 8px;border-radius:8px;border:2px solid rgba(127,127,127,.6);background:#fffdf6;color:#222}
.dsai-msg{font-size:14px;font-weight:700}.dsai-msg:empty{display:none}.dsai-msg.ok{color:#2f9a4f}.dsai-msg.bad{color:#c0392b}
.dsai-priv{font-size:11.5px;opacity:.8}.dsai-line{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px}
.dsai-bar{height:8px;border-radius:4px;background:rgba(127,127,127,.3);overflow:hidden}.dsai-bar i{display:block;height:100%;background:#2f9a4f;width:0}`;
  function css(doc) { if (!doc || doc.getElementById('dsai-css')) return; const s = doc.createElement('style'); s.id = 'dsai-css'; s.textContent = CSS; (doc.head || doc.documentElement).appendChild(s); }

  // ---------- мастер ключа (3 шага, ≤ 4 нажатий: «Получить ключ» → «Вставить» → проверка сама) и панель «ключ / ИИ в телефоне»
  // card(host, {mode:'wiz'|'panel', who, onDone(st), onLater(), onChange()}) — карточка ВНУТРИ окна беседы (не поверх): ничего не перекрывает.
  function card(host, o) {
    o = o || {}; const doc = host.ownerDocument || G.document; css(doc);
    const box = doc.createElement('div'), panel = o.mode === 'panel'; box.className = 'dsai ' + (panel ? 'dsai-panel' : 'dsai-wiz'); host.appendChild(box);
    const V = { view: panel ? 'panel' : keyInfo() ? 'done' : 'wiz', step: keyInfo() ? 4 : 1, field: false, val: '', msg: '', cls: '', clicks: 0, pct: 0, gpu: WEB.hasGpu(), back: null };
    if (V.view === 'done') { V.msg = T.ok(keyInfo().name); V.cls = 'ok'; }
    const who = o.who || L('собеседники', 'your partners');
    const B = (a, txt, cls) => `<button type="button" class="dsai-b${cls ? ' ' + cls : ''}" data-a="${a}">${esc(txt)}</button>`;
    const steps = () => `<ol class="dsai-steps">${T.steps().map((s, i) => `<li data-s="${i + 1}" class="${i + 1 < V.step ? 'ok' : i + 1 === V.step ? 'on' : ''}"><b>${i + 1 < V.step ? '✓' : i + 1}</b>${esc(s)}</li>`).join('')}</ol>`;
    const msg = () => `<div class="dsai-msg ${V.cls}" aria-live="polite">${esc(V.msg)}</div>`;
    const priv = () => `<div class="dsai-priv">${esc(T.privacy())}</div>`;
    const webRow = () => !V.gpu ? '' : (WEB.consented() || WEB.eng) ? `<div class="dsai-line">📱 ${esc(T.webOn())} ${B('webdel', T.webDel(), 'small ghost')}</div>` : `<div class="dsai-line">${B('web', '📱 ' + (keyInfo() ? L(`ИИ в телефоне, без интернета (≈0,7 ГБ)`, `On-device AI, works offline (≈0.7 GB)`) : T.webBtn()), 'small ghost')}</div>`;
    function draw() {
      box.dataset.view = V.view; box.dataset.step = String(V.step); const k = keyInfo();
      if (V.view === 'wiz') box.innerHTML = `<div class="dsai-h">✨ ${esc(T.title())}<small>${esc(T.sub())}</small></div><div>${esc(T.why(who))}</div>${steps()}
        <div class="dsai-hint">${V.step < 2 ? T.hint1() : esc(T.hint2())}</div>
        <div class="dsai-row">${B('get', T.steps()[0], V.step < 2 ? 'main' : '')}${B('paste', '📋 ' + T.steps()[1], V.step >= 2 ? 'main' : '')}${B('later', L('Позже', 'Later'), 'ghost')}</div>
        <div class="dsai-in"${V.field ? '' : ' hidden'}><input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(T.field())}" aria-label="${esc(T.field())}" value="${esc(V.val)}">${B('check', T.check(), 'small main')}</div>
        ${msg()}${(WEB.consented() || WEB.eng) ? '' : webRow()}${priv()}`;
      else if (V.view === 'done') box.innerHTML = `<div class="dsai-h">✨ ${esc(T.title())}</div>${steps()}${msg()}<div class="dsai-line">${B('del', T.del(), 'small ghost')}</div>${priv()}`;
      else if (V.view === 'later') box.innerHTML = `<div class="dsai-line">💤 ${esc(T.later())} ${B('open', T.connect(), 'small')}</div>`;
      else if (V.view === 'web') box.innerHTML = `<div class="dsai-h">📱 ${esc(L('ИИ в телефоне', 'On-device AI'))}</div><div>${esc(T.webAsk())}</div><div class="dsai-row">${B('webgo', T.webGo(), 'main')}${B('back', T.back(), 'ghost')}</div>${msg()}`;
      else if (V.view === 'webload') box.innerHTML = `<div class="dsai-h">📱 ${esc(L('ИИ в телефоне', 'On-device AI'))}</div><div class="dsai-bar"><i style="width:${V.pct}%"></i></div><div class="dsai-msg">${esc(T.webLoad(V.pct))}</div>`;
      else if (V.view === 'webdone') box.innerHTML = `<div class="dsai-h">📱 ${esc(L('ИИ в телефоне', 'On-device AI'))}</div>${msg()}<div class="dsai-hint">${esc(T.simple())}</div>`;
      else box.innerHTML = `<div class="dsai-line">🔑 ${k ? esc(T.keyOn(k.name)) + ' ' + B('del', T.del(), 'small ghost') : esc(T.keyOff()) + ' ' + B('open', T.connect(), 'small main')}</div>${webRow()}${msg()}${priv()}`;
      const inp = box.querySelector('.dsai-in input');
      if (inp) { const auto = () => setTimeout(() => { V.val = clean(inp.value); if (detect(V.val) && !V.busy) check(); }, 0); inp.addEventListener('paste', auto); inp.addEventListener('input', () => { V.val = inp.value; if (detect(clean(inp.value)) && !V.busy) auto(); }); }
    }
    const focus = () => { const i = box.querySelector('.dsai-in input'); if (i) try { i.focus(); } catch (e) { /* нет */ } };
    async function check() {
      if (!detect(V.val)) { V.field = true; V.msg = ERR.format(); V.cls = 'bad'; draw(); return focus(); }
      V.busy = true; V.msg = T.checking(); V.cls = ''; V.step = Math.max(V.step, 2); draw();
      const r = await testKey(V.val); V.busy = false;
      if (r.ok) { V.step = 4; V.view = panel ? 'panel' : 'done'; V.val = ''; V.field = false; V.msg = T.ok(r.name); V.cls = 'ok'; draw(); if (o.onDone) o.onDone(await status(true)); return; }
      V.field = true; V.msg = errText(r.code); V.cls = 'bad'; draw();
    }
    async function act(a) {
      if (a === 'get') { try { G.open(PROV.gemini.url, '_blank', 'noopener'); } catch (e) { /* окно не открылось */ } V.step = Math.max(V.step, 2); V.msg = ''; return draw(); }
      if (a === 'paste') {
        V.step = Math.max(V.step, 2); let t = '';
        try { t = clean(await G.navigator.clipboard.readText()); } catch (e) { t = ''; }   // нет разрешения (iframe, Firefox) — поле ввода
        if (!detect(t)) { V.field = true; V.val = t || V.val; V.msg = t ? ERR.format() : T.noclip(); V.cls = t ? 'bad' : ''; draw(); return focus(); }
        V.val = t; return check();
      }
      if (a === 'check') { const i = box.querySelector('.dsai-in input'); V.val = clean(i ? i.value : V.val); return check(); }
      if (a === 'later') { later(); V.view = 'later'; draw(); return o.onLater && o.onLater(); }
      if (a === 'open') { V.view = 'wiz'; V.step = 1; V.msg = ''; V.cls = ''; return draw(); }
      if (a === 'del') { clearKey(); V.view = panel ? 'panel' : 'wiz'; V.step = 1; V.msg = T.deleted(); V.cls = ''; draw(); return o.onChange && o.onChange(); }
      if (a === 'web') { V.back = V.view; V.view = 'web'; V.msg = ''; V.cls = ''; return draw(); }
      if (a === 'back') { V.view = V.back || (panel ? 'panel' : 'wiz'); return draw(); }
      if (a === 'webdel') { await WEB.remove(); V.msg = ''; draw(); return o.onChange && o.onChange(); }
      if (a === 'webgo') {
        V.view = 'webload'; V.pct = 0; draw();
        try {
          await WEB.load(r => { const p = Math.round((r.progress || 0) * 100); if (p === V.pct) return; V.pct = p; const i = box.querySelector('.dsai-bar i'), m = box.querySelector('.dsai-msg'); if (i) i.style.width = p + '%'; if (m) m.textContent = T.webLoad(p); }, true);
          V.view = V.back === 'panel' ? 'panel' : 'webdone'; V.msg = T.webOk(); V.cls = 'ok'; draw(); if (o.onDone) o.onDone(await status(true));
        } catch (e) { V.view = 'web'; V.msg = errText(e.code); V.cls = 'bad'; draw(); }
      }
    }
    box.addEventListener('click', ev => { const b = ev.target.closest('button[data-a]'); if (!b || !box.contains(b)) return; ev.stopPropagation(); ev.preventDefault(); V.clicks++; act(b.dataset.a); });
    box.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { ev.preventDefault(); V.clicks++; act('check'); } });
    ['pointerdown', 'pointerup', 'touchstart', 'keyup'].forEach(t => box.addEventListener(t, ev => ev.stopPropagation()));
    draw();
    return { el: box, view: () => V.view, clicks: () => V.clicks, remove: () => box.remove() };
  }

  G.DSAI = { version: 1, status, chat, ground, verify, badNote, langLine, isEn, lex: () => LEX.load(), _setLex: d => { LEX.d = d; LEX.p = Promise.resolve(d); }, labels, memo, isComplex, unsafe, testKey, detect, keyInfo, keyDown, clearKey, shouldOffer, later, card, errText,
    simple: () => T.simple(), privacy: () => T.privacy(), L, pc: PC, web: WEB, PROV, _setFetch: f => { _fetch = f; S.st = null; }, _reset: () => { S.st = null; S.keyDown = null; } };
})(typeof window !== 'undefined' ? window : globalThis);
