# Архитектура

- `docs/index.html`: холст Phaser + DOM-слой (HUD, диалог, награда).
- `docs/main.js`: сцены `Boot` → `Yard` → `Room`. Поток: тап по дому → `Room` → `finish()` → `Yard` с наградой.
- Данные: `lesson.json` (строки урока), `assets.json` (ключ → картинка), `assets/*.png`, `audio/*.mp3`.
- Сохранение: `localStorage['ds_proto']` = `{ done, coins }`.
- Речь: Web Speech API (`de-DE`); без микрофона или с `?auto=1` фраза засчитывается.
- Проверка: `tools/shot_proto.cjs` (Playwright) снимает 6 кадров потока.
- Дальше: rex UI, grid-engine, ts-fsrs, состояние мира в одном kv-store.
