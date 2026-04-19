# Tiny Kingdom — Claude Orientation

Read this file first every session.

## Project in one sentence
A cute, browser-based mini-RTS for a 6–8 year old. Single-player now; 2-player head-to-head with fog of war and minimap later.

## Stack
Phaser.js 3.80 + vanilla JavaScript (ES modules) + Vite dev server + npm. Node/Socket.IO added in Prompt 11 for multiplayer.

## Current state (2026-04-19)
- **Prompts 0–6 shipped.** Scaffold, procedural world, selection+HUD, animated villagers, BFS pathfinding, gathering loop, buildings (House/Farm/Barracks), training queue, combat (guards, health bars, death anims).
- **Prompt 7 is next** — Rival red AI + tier upgrades + two rough-edge fixes (stronger enemy tint + under-foot team disks, 400ms chase re-path).

## Document index
- `PLAN.md` — single source of truth. Supersedes all earlier plan files. Read it before any build work.
- `CHANGELOG.md` — append-only log, newest on top. Append an entry every time something lands.
- `DECISIONS.md` — numbered design decisions (D-001, D-002, …) with rationale + tradeoffs.
- `BACKLOG.md` — Nice-to-have / v2 ideas / playtest bugs.
- `tiny-kingdom-build-plan-v3.md` — legacy. Superseded by PLAN.md but kept for history.

## Non-negotiable design principles
1. **Near-instant feedback.** Every action resolves in 2–3 seconds. If a loop feels slow, tune numbers, don't add steps.
2. **Auto-behavior over micro.** A 6–8 year old cannot babysit units. When anything feels like busywork, default to auto (e.g., idle guards auto-engage within 5 tiles — D-003).
3. **Kid-friendly language.** No harsh words on loss ("Your kingdom fell! 😢 Try again!" not "GAME OVER"). No violence visuals beyond scale-pulse + rotate-fade.
4. **State cleanup discipline.** Every entity death must remove from `gameState` arrays and emit the right event. Established in Prompt 6 — carry forward.
5. **Ship ugly placeholders.** If the art is weak but the loop is fun, keep shipping.

## Known intentional placeholders
- **Soldier walk animation**: static sprite + 2px vertical bob (8Hz). No animated sprites available — bob fakes life well enough. Plan says replace later; not urgent.
- **Enemy team visuals**: currently `setTint(0xff8888)` on already-red SOLDIER art. Prompt 7 upgrades to `0xff4444` + under-foot team disks (blue/red ellipses). This is the *"current rough edge"*.
- **Farm**: plan calls for brown-rect+wheat-dots placeholder; we shipped real `FARM.png`. Drift from plan but looks better — see DECISIONS D-005.

## Team conventions
- Project root: `/Users/niki/AI/Tiny Kingdom ` (note trailing space in folder name — quote paths).
- Dev server: `npm run dev` → http://127.0.0.1:8765.
- File layout: `scenes/`, `data/`, `systems/`, `assets/{tiles,resources,buildings,characters,items,audio}/`.
- Unit classes live in `data/`; pure functions in `systems/`.
- Use ES module `import`/`export` syntax everywhere.
- New runtime constants go in `data/constants.js`; new building/unit defs in `data/buildings.js`.
- Never commit without the user asking.
- **Always append a CHANGELOG entry** when a Prompt ships or a decision changes.

## Input scheme (D-010)
- **Single left-click**: select a unit / building / tile.
- **Shift + left-click**: multi-select.
- **Left-drag on empty ground**: box-select (drops other selections; shift-drag adds).
- **Double-click** (two clicks within 350ms on the same target): **contextual action** — chop / gather / mine / work farm / move / attack. Target type + selection type decide the action (see `systems/hints.js#_computeAction`).
- **Right-click**: deselect only. Never issues a command.
- **ESC**: deselect.
- Hover over a valid target with units selected → yellow action-preview outline instantly + tooltip after 250ms.
- First-time toasts fire once per game ("💡 Double-click to send your villager to work!") — tracked in `gameState.uiHintsSeen`.

## Workflow when the user says "go"
1. Confirm which Prompt is next (from Progress Tracker in PLAN.md).
2. Read the Prompt section in PLAN.md.
3. Plan the code changes aloud in 2–3 sentences — flag any drift from plan.
4. Implement. Verify Vite HMR shows no errors.
5. Tell the user what to test in the browser.
6. On confirmation: append CHANGELOG entry, mark Prompt ✅ in PLAN.md progress tracker, move on.

## Do NOT
- Add features beyond the current Prompt's scope.
- Use `setTint(0xff8888)` for new enemies — that's being upgraded in Prompt 7.
- Commit, push, or run destructive git commands unless explicitly asked.
- Add emojis to code/comments unless the user asks.
- Create docs without being asked.

## Known drift from plan (flag in conversation when relevant)
- **3 resources (wood/food/gold)** vs plan's 2. See D-001 + BACKLOG.
- **Canvas 1280×832 @ 64px tiles** vs plan's 960×640 @ 32px. See D-009.
- **Farm uses real art** vs plan's placeholder. See D-005.
