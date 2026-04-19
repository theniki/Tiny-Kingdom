# Backlog

Things to do later. Organized by priority bucket. Graduate items into the active PLAN or a new Prompt when they're ready to work on.

---

## Drift from plan (resolve before Prompt 10)

- [ ] **Disable debug `E` hotkey before Prompt 11 (multiplayer)** — set `DEBUG_ENEMY_SPAWN = false` in `data/constants.js`. Multiplayer is server-authoritative; any client-side unit spawn is a cheat vector. The flag already gates the handler; just flip it (or branch on game mode if single-player retains the hotkey after MP lands).
- [x] ~~**Prompt 9 tutorial text must reference double-click (D-010)**~~ — done in Prompt 9 shipped 2026-04-19.
- [ ] **Gold as 3rd resource** — shipped on 2026-04-18, conflicts with PLAN.md §3 (2 resources only) and D-001. Decide: (a) update PLAN.md to reflect 3 resources and add downstream mechanics (market? gold sink?), or (b) roll back gold to decorative-only. Recommended: keep and update plan, since gold already works and kid likely enjoys the yellow sparkle particles.
- [ ] **Farm placeholder vs real art** — PLAN.md §1 and §2 describe Farm as a brown rect + wheat dots placeholder; we shipped real `FARM.png`. D-005 accepts this; update PLAN.md on next revision.
- [ ] **Canvas size** — PLAN.md specifies 960×640 @ 32px throughout. We run 1280×832 @ 64px (D-009). Find+replace plan references or add a note at the top of §1 saying "see D-009 for actual runtime values."

## Nice to have (small polish, not blocking)

- [ ] **Settings toggle: right-click vs double-click for actions** — classic RTS players may prefer right-click. Expose in a future settings menu. (D-010 defaulted to double-click for the target age group.)
- [ ] Villager idle breathing animation occasionally plays random "look around" frame (spritesheet already has 4 frames; currently just loops them at 4fps).
- [ ] Tooltips on HUD resource counters ("🪵 Wood: 50" → hover → "Used to build and train").
- [ ] Hotkey cheatsheet overlay on `?` or `H` key.
- [ ] Minimum build spacing — prevent placing two 2×2 buildings so close they visually clip. Currently only tile-occupancy is checked.
- [ ] Villager name labels use themed names (Oak, Pip, Mossy) instead of `v1`, `v2`.
- [ ] Sound effect for every resource deposit (currently silent — Prompt 9).
- [ ] Dust puff particles when villagers walk on grass (Prompt 9 lists this).
- [ ] Team-colored under-foot disks mentioned in D-004 (scheduled for Prompt 7 Part A).

## Playtest bugs / rough edges noted

- [ ] **Chase pathfinding lag** — soldiers arriving at target's last-known tile while target kept walking. Scheduled fix in Prompt 7 Part B (separate 400ms re-path timer while `state === 'attacking'`).
- [ ] **Enemy tint washed out** — already-red SOLDIER art + `0xff8888` tint looks almost identical to blue player tint. Scheduled fix in Prompt 7 Part A (`0xff4444` + team disks).
- [ ] Villager selection ring sometimes clips under the TC sprite at certain angles (z-fighting on depth 50 vs 40). Low priority — rings still visible.
- [ ] If the last villager dies mid-build, the half-built building stays forever as a "ghost" occupant. Need to either (a) clear occupant on builder death, or (b) decay the building if no builder reassigned within N seconds.
- [ ] Box-drag rectangle doesn't update if pointer leaves the canvas. Minor — works on release anyway.
- [ ] Training queue dots above TC are occluded when TC is near the top row of the map (row 0). Low priority.

## Ideas for v2 (post-launch)

Pulled from PLAN.md §9 (Sequel Roadmap). Extending with new ideas:

- [ ] 🪙 **Gold** becomes a real resource with a Market building (trade 2:1 with other resources).
- [ ] 🪨 **Stone** economy — grey-rocks mineable, used for Walls (decorative defensive structure) and Towers (static ranged units).
- [ ] 💎 **Rare minerals** unlock Tier-3 elite units (Paladin? Mage?).
- [ ] 📦 **Storage boxes** (`box.png`) as secondary dropoff points — villagers deposit at nearest depot, not always TC. Shortens gather trips.
- [ ] ❄️ **Biomes** — snow map (frozen rivers instead of water), desert map (cacti instead of trees). Reuse grass.png palette swap for cheap variety.
- [ ] 👁️ **Spectator mode** — parent watches both kids' full maps (bypasses fog). Useful for refereeing fights.
- [ ] 🤝 **2v2 team mode** — requires 4-player lobby. Defer until 2-player is rock solid.
- [ ] 🎨 **Sandbox mode** — no combat, no enemy, endless resources. Just build and decorate. Great for the youngest players.
- [ ] 💾 **Saved games** — persist room/game state to disk on server. Let kids resume tomorrow.
- [ ] 🎥 **Replay system** — server logs the command stream; client can play back. Perfect for kids showing off wins to parents.
- [ ] 🧙 **Random encounters** — neutral animals (wolves, bears) spawn occasionally, attack nearest unit. Steals attention away from red rival, adds chaos.
- [ ] 🎵 **Per-biome music** — different looping track for winter/desert/default.
- [ ] 🏆 **Achievement stamps** — "Built 5 farms", "Won without losing a guard", "Collected 3 chests in one game". Shown on WinScene.

## Ideas rejected (for the record)

- ❌ **Fog of war in single-player**: rejected — too disorienting for a 6–8 year old, and plan's 30×20 map is small enough that full visibility is fine. Fog arrives only when multiplayer does (Prompt 10).
- ❌ **Diagonal unit movement**: considered for smoother paths. Rejected — current 4-directional BFS pathing reads clean, and diagonals introduce tricky corner-clipping edge cases.
- ❌ **Right-click to deselect** (original Prompt 3 spec): overridden in Prompt 4 because right-click now issues commands. ESC is the deselect key. Documented implicitly via the plan's Prompt 4 text.
