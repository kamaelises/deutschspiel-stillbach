# AGENTS.md: DeutschSpiel Stillbach

Rules for Claude Code, Codex and other agents. Based on the shared rules from
[ai-gamedev-starter-kit](https://github.com/Saneety/ai-gamedev-starter-kit) (Anton Ruban, CC BY-NC-SA 4.0), cut down for this project.

## Communication
- Answer the human in Russian, short. Commands, files and code identifiers stay in English.
- Never call something fixed without a before | after frame (`tools/shot_proto.cjs` or a screenshot).

## Start every task
1. Read `design-doc/art-rules.md` (the author's art rules, check every frame against them), then `design-doc/concept-doc.md`, then the chapter of `design-doc/game-design.md` you touch.
2. Check `git status`. Preserve unrelated work.
3. Run the game: `npx serve docs`, open `/?auto=1` for headless runs (speech is skipped).

## Ownership
- The human owns the game: concept, story, characters, German lesson content, art direction, priorities.
  `design-doc/*.md` (except `ai-generated/`) is written by the human; agents only read it.
- Agents own implementation, reversible technical choices, verification and honest reports.
- Build only on an explicit command («сделай», «добавь»). An idea without a command gets a short plan:
  approach, key decisions, open questions. No long specs unless asked.
- Ask until the plan is ~95% clear when behavior, data, scope or acceptance criteria are uncertain.

## Stack and architecture
- `docs/` is the shipped game: plain ES, Phaser 4.2.1 (`docs/phaser.min.js`), no bundler. GitHub Pages serves it.
- One scene per place (`Yard`, `Room`, …). Text UI is DOM over the canvas (readable, tap targets ≥ 48 px).
- Lessons are data: `docs/lesson.json` (`role`, `de`, `ru`, `audio`). Never hardcode lesson text in JS.
- Save state: `localStorage` key `ds_proto`, wrapped in try/catch.
- Planned: rex UI plugins, grid-engine movement, ts-fsrs reviews, Web Speech now / Vosk offline later.

## Content rules
- German must be correct (A1 grammar first). Every line has a Russian translation.
- Characters in relationships are adults (18+). No explicit content.
- Assets: 32 px scale, one palette and outline (recolor to `ui_kit`), free licenses only.
  Log source and license for every pack in `design-doc/ai-generated/assets.md`.
- Do not commit copyrighted textbook text. Only own lines.

## Verify and report
- After a change: run `node tools/shot_proto.cjs`, look at all 6 frames, attach before | after.
- Report in 3–6 lines: what changed, how checked, what is left.

## Skills
- `skills/lesson-scene/`: turn a lesson into a playable scene.
- `skills/flow-check/`: before | after frames of the whole flow.
- `skills/asset-intake/`: pick, recolor and log a free asset.
