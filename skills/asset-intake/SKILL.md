---
name: asset-intake
description: Use when bringing a sprite, tileset or icon into DeutschSpiel Stillbach: check license, fit to 32 px and the shared palette, log the source.
---

# Asset intake

1. Free only. Read the license; skip "no derivatives". Mark "non-commercial" and "credit required".
2. Scale: 32 px tiles (16 px packs ×2 with nearest-neighbor). Characters: chibi or normal proportions, both allowed.
3. Recolor to the palette in `docs/ui_kit.css`, one outline color. Mix packs only after recoloring.
4. Save as `docs/assets/<key>.png`, register `<key>` in `docs/assets.json`.
5. Add a row to `design-doc/ai-generated/assets.md`: key, pack, author, URL, license.
6. Run `skills/flow-check` and show the asset in place, before | after.
AI generation only for unique objects (e.g. Elternhaus), never for whole character sets.
