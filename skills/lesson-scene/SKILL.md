---
name: lesson-scene
description: Use when adding or changing a German lesson in DeutschSpiel Stillbach: turn lesson lines into a playable scene with an NPC, speech check and a world reward.
---

# Lesson → scene

1. Ask the human for the lesson goal, NPC and reward if not given. Never invent lesson content.
2. Write lines to `docs/lesson.json`: `{ "lines": [{ "role": "A|B", "de": "...", "ru": "...", "audio": "file.mp3?" }] }`.
   `A` = hero (spoken by the player, may use `{hero_name}`), `B` = NPC.
3. Check German: A1 word order, articles, capitalized nouns, punctuation. Each line has `ru`.
4. Audio is optional; without it the game uses Web Speech `de-DE`.
5. The reward must appear in the world (`Yard.create` → `state.done` branch), not only as a number.
6. Run `skills/flow-check`. Done = 6 frames, frame 5 shows the reward, frame 6 shows the item in the yard.
