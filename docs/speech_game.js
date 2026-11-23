// Speech recognition for the game (port of app/src/core/speech.js): ask the mic first, then
// on the PC site (ts.net with /asr) record and send to faster-whisper, otherwise Web Speech of the phone.
// SpeechG.hear() -> Promise<string[]> (alternatives) or Error with .code and a Russian help text.
(function () {
  const HELP = {
    denied: 'Нет доступа к микрофону. Android: Настройки → Приложения → браузер → Разрешения → Микрофон → «Разрешить». Потом обнови страницу и нажми «Sprechen».',
    service: 'Распознавание речи выключено в телефоне. Android: Настройки → Google → голосовой ввод — включи и попробуй ещё раз.',
    'no-mic': 'Микрофон не найден.',
    busy: 'Микрофон занят другим приложением (звонок, диктофон). Закрой его и попробуй ещё раз.',
    'audio-capture': 'Микрофон не даёт звук.',
    network: 'Для распознавания нужен интернет.',
    'no-speech': 'Не расслышал. Нажми «Sprechen» и скажи фразу чуть громче.',
    'no-voice': 'Не услышал голоса. Нажми «Sprechen», подожди полсекунды и говори.',
    'no-engine': 'В этом браузере нет распознавания речи. Открой игру в Chrome — или нажми «Ohne Mikro».',
    insecure: 'Микрофон работает только по https. Открой игру по ссылке https://…',
    'pc-timeout': 'Компьютер не ответил. Нажми «Sprechen» ещё раз — послушает телефон.',
    error: 'Не получилось распознать. Нажми «Sprechen» ещё раз.',
  };
  const SR_CODE = { 'not-allowed': 'denied', 'service-not-allowed': 'service', 'audio-capture': 'audio-capture', network: 'network', 'no-speech': 'no-speech', aborted: 'no-speech' };
  const GUM_CODE = { NotAllowedError: 'denied', SecurityError: 'denied', NotFoundError: 'no-mic', OverconstrainedError: 'no-mic', NotReadableError: 'busy', AbortError: 'busy' };
  const fail = (code) => Object.assign(new Error(HELP[code] || code), { code });
  let micOk = false, pc = null;

  async function ensureMic() {
    if (micOk) return;
    if (!window.isSecureContext) throw fail('insecure');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); micOk = true; }
    catch (e) { throw fail(GUM_CODE[e.name] || 'denied'); }
  }
  async function pcAsr() {   // /asr exists only on the PC site (tailscale); cached for the session
    if (pc !== null) return pc;
    const c = new AbortController(), t = setTimeout(() => c.abort(), 1500);
    try { const r = await fetch('/asr/health', { signal: c.signal, cache: 'no-store' }); pc = r.ok && (await r.json()).ok === true; } catch (e) { pc = false; } finally { clearTimeout(t); }
    return pc;
  }
  function webSpeech(ms) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return Promise.reject(fail('no-engine'));
    return new Promise((res, rej) => {
      const r = new SR(); r.lang = 'de-DE'; r.interimResults = false; r.maxAlternatives = 5; r.continuous = false;
      let done = false; const fin = (f, v) => { if (!done) { done = true; clearTimeout(t); try { r.stop(); } catch (e) {} f(v); } };
      const t = setTimeout(() => fin(rej, fail('no-speech')), ms);
      r.onresult = e => fin(res, Array.from(e.results[0]).map(a => a.transcript));
      r.onerror = e => { if (e.error === 'not-allowed') micOk = false; fin(rej, fail(SR_CODE[e.error] || 'error')); };
      r.onend = () => fin(rej, fail('no-speech'));
      try { r.start(); } catch (e) { fin(rej, fail('error')); }
    });
  }
  async function record(maxMs) {   // stop on silence after speech
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).catch(e => { throw fail(GUM_CODE[e.name] || 'denied'); });
    const ctx = new (window.AudioContext || window.webkitAudioContext)(), an = ctx.createAnalyser(); an.fftSize = 1024; ctx.createMediaStreamSource(stream).connect(an);
    const chunks = [], rec = new MediaRecorder(stream); rec.ondataavailable = e => e.data.size && chunks.push(e.data); rec.start(100);
    return new Promise(res => {
      const buf = new Uint8Array(an.fftSize), t0 = performance.now(); let heard = false, last = 0, stopped = false;
      const iv = setInterval(() => {
        an.getByteTimeDomainData(buf); let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        const now = performance.now(); if (peak > 10) { heard = true; last = now; }
        if ((heard && now - last > 900) || now - t0 > maxMs || (!heard && now - t0 > 5000)) stop();
      }, 50);
      function stop() { if (stopped) return; stopped = true; clearInterval(iv); rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); ctx.close().catch(() => {}); res({ blob: new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), heard }); }; try { rec.stop(); } catch (e) { rec.onstop(); } }
    });
  }
  async function hear(ms = 8000) {
    await ensureMic();
    if (window.MediaRecorder && await pcAsr()) {
      const r = await record(ms); if (!r.heard || r.blob.size < 1500) throw fail('no-voice');
      const c = new AbortController(), t = setTimeout(() => c.abort(), 9000);
      try { const j = await (await fetch('/asr/', { method: 'POST', body: r.blob, headers: { 'Content-Type': r.blob.type }, signal: c.signal })).json(); if (!(j.text || '').trim()) throw fail('no-speech'); return [j.text]; }
      catch (e) { if (e.code) throw e; pc = false; throw fail('pc-timeout'); } finally { clearTimeout(t); }
    }
    return webSpeech(ms);
  }
  window.SpeechG = { hear, HELP };
})();
