// node shot_proto.cjs : serves proto/ and takes a 5-frame flow screenshot (yard -> zoom -> lesson -> spell -> reward -> yard changed) into proto/shots/
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require(path.resolve(__dirname, '../../../app/node_modules/playwright'));
const root = __dirname, out = path.join(root, 'shots'); fs.mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\//, '') || 'index.html'); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' }); s.end(d); } }); });
(async () => {
  await new Promise(r => srv.listen(8099, r));
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] }); const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  p.on('console', m => { if (/error|missing/i.test(m.text())) console.log('console:', m.text()); }); p.on('pageerror', e => console.log('pageerror:', e.message));
  await p.goto('http://localhost:8099/index.html'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(out, '1_yard.png') });
  await p.mouse.click(480, 200); await p.waitForTimeout(2600);
  for (let i = 0; i < 6; i++) { const sp = await p.$('#bSpeak'); if (sp && await sp.isVisible()) break; await p.click('#bNext'); await p.waitForTimeout(500); }
  console.log('SR in browser:', await p.evaluate(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition)));
  await p.click('#bSpeak'); await p.waitForTimeout(9500);
  console.log('help:', await p.evaluate(() => document.getElementById('micHelp').textContent), 'skip visible:', await p.isVisible('#bSkip'));
  await p.screenshot({ path: path.join(out, '8_mic_fail.png') });
  await p.click('#bSkip'); await p.waitForTimeout(800); console.log('after skip coins:', await p.evaluate(() => document.getElementById('coins') ? document.getElementById('coins').textContent : '?'), 'help hidden:', !(await p.isVisible('#micHelp')));
  await b.close(); srv.close();
})().catch(e => { console.error(e); srv.close(); process.exit(1); });