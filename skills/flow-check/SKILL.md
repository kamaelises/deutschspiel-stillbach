---
name: flow-check
description: Use after any change to DeutschSpiel Stillbach code, assets or lessons, and before calling anything fixed: shoot the 6-frame flow and compare before | after.
---

# Flow check

1. Before the change: `node tools/shot_proto.cjs`, then copy `docs/shots/` to `docs/shots_before/`.
2. Make the change.
3. Run it again. Frames: `1_yard`, `2_zoom`, `3_lesson`, `4_spell`, `5_reward`, `6_yard_after`.
4. Open every frame and look at it. Check: no grey placeholder boxes, text readable, no overlap, reward visible in frame 6.
5. Console lines starting with `console:` or `pageerror:` are failures.
6. Report: one before | after pair for the changed frame + one line per problem found.
Never write «fixed» without the pair.
