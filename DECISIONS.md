# Design Decisions

Numbered log of design decisions with rationale. Format:
- **Decision** — the choice made
- **Alternatives considered** — what else was on the table
- **Why** — the reason this choice won
- **Tradeoffs accepted** — what we gave up

---

## D-001 — Two resources only (wood + food)
- **Decision**: The economy uses only wood and food. Gold, stone, rare-mineral are visual flavor (decoratives on the map) until a future version.
- **Alternatives considered**: 4-resource economy (wood/food/gold/stone) from day one.
- **Why**: A 6–8 year old can hold ~2 meters in their head. More resources means more UI, more decisions, more stalling. The whole game is about near-instant feedback (D-010 principle) — extra resources slow the loop without adding fun for the target age.
- **Tradeoffs accepted**: Gold/stone/minerals sit on the map as eye-candy only. Tech tree stays shallow. Late-game variety comes from tier upgrades instead of resource variety.
- **Known drift**: Gold was added on 2026-04-18 off-plan. See BACKLOG "Drift from plan" — the game currently has 3 resources. Either roll back or update plan.

## D-002 — Tier system for buildings and units
- **Decision**: Two visible tiers (T1, T2) per building and unit type. T2 unlocks via an Upgrade button, costs additional wood/food, visibly beefier sprite.
- **Alternatives considered**: Flat progression (no tiers); 3+ tiers like Age of Empires.
- **Why**: Tiers create a visible "my stuff got cooler" moment — the core reward for a kid who's been patient. Two tiers is the smallest number that delivers this feeling without exploding content scope.
- **Tradeoffs accepted**: Less depth than a full tech tree. T3+ goes to v2 (BACKLOG).

## D-003 — Idle guards auto-engage enemies within 5 tiles
- **Decision**: Any idle blue guard that sees a red unit within Chebyshev distance 5 automatically assigns it as attack target.
- **Alternatives considered**: Hold-position stance (guards only attack when told); RTS-style stance buttons (aggressive/defensive/hold).
- **Why**: Micro-management is impossible for a 6–8 year old. If the kid builds guards and places them by the base, they should defend the base without further input. This establishes a broader principle: *when a task feels like babysitting, default to auto-behavior.*
- **Tradeoffs accepted**: Experienced RTS players lose fine control. Guards may engage something the player wanted to ignore. Accepted because the target audience outweighs the edge case.

## D-004 — Under-foot team-colored disks (not sprite tinting alone)
- **Decision**: Every unit renders a colored ellipse beneath its feet — blue for player, red for enemy — in addition to sprite tint.
- **Alternatives considered**: Tint only (current state in Prompt 6); full team-colored outfits via sprite variants (no art available).
- **Why**: The SOLDIER sprites are already reddish, so blue tint reads OK on player but enemy `0xff8888` tint barely changes anything visually. Disks give an unambiguous team signal at any zoom level — kids parse shape + color faster than tint.
- **Tradeoffs accepted**: Extra sprite per unit (6px tall ellipse). Minor rendering cost. To be implemented in Prompt 7 Part A.

## D-005 — Farm uses real art (not Graphics placeholder)
- **Decision**: `FARM.png` asset is used for the Farm building.
- **Alternatives considered**: Plan's brown-rect-with-wheat-dots via Phaser Graphics API.
- **Why**: The art already exists in `assets/buildings/FARM.png` and looks better than anything a programmatic placeholder would produce. No reason to generate a worse version.
- **Tradeoffs accepted**: Drift from plan text. The plan's placeholder instruction was written before the asset existed. PLAN.md should be updated next revision; noted in BACKLOG.

## D-006 — Static soldier sprites with 2px vertical bob
- **Decision**: Soldiers use a single static sprite per facing (east/west/south_east) with a yoyo tween that bobs the sprite ±2px at 8Hz while walking.
- **Alternatives considered**: Commission/source animated sprite sheets; walk-cycle faked by tiny rotation.
- **Why**: No animated soldier art is available. 2px bob at 8Hz reads as "marching" in peripheral vision — brain fills in the animation. Good enough; ship it.
- **Tradeoffs accepted**: Soldier walks look stiffer than villagers. Accepted until better sprites are found. If replaced, swap the single image for a spritesheet and add `this.anims.create(...)` — ~20 lines of change per direction.

## D-007 — Phaser.js 3 + vanilla JavaScript stack
- **Decision**: Phaser 3.80 for rendering/scenes/input/audio/tweens; no framework layer; ES modules; Vite dev server.
- **Alternatives considered**: PixiJS + custom scene manager (more flexible, more boilerplate); Three.js (overkill for 2D); DOM-based (limited for particle systems and sprite batching); React + canvas (state model mismatch).
- **Why**: Phaser hits the sweet spot — batteries included (tilemaps, physics, tweens, particles, input, audio, scenes) but light enough for a single-file scene layout a hobbyist can read. Zero build step needed for v1 (Vite added later for DX).
- **Tradeoffs accepted**: Phaser's API is "all there" — harder to strip down if the project ever needs to shrink. Migrating to Pixi or raw canvas later would be a significant rewrite.

## D-008 — Server-authoritative multiplayer model (Prompt 12)
- **Decision**: When multiplayer lands (Prompt 12), the Node.js server runs the authoritative simulation at 10Hz and broadcasts filtered snapshots to each client. Clients render + predict their own actions only.
- **Alternatives considered**: Peer-to-peer via WebRTC (lower latency, but fog of war becomes unenforceable); lockstep deterministic simulation (hard to make truly deterministic in JS).
- **Why**: Kids' environments vary wildly (spotty WiFi, shared machines). Server authority + per-client fog filtering means: (a) cheat-proof fog of war (server literally omits unseen entities from the payload), (b) any client can drop out without desyncing the game, (c) easier to reason about — one simulation, many views.
- **Tradeoffs accepted**: Requires a server to run (cost, complexity, deployment). Free tiers on Railway/Render/Fly suffice. Latency > P2P. If Prompt 12 gets stuck, fallback is turn-based multiplayer (see PLAN §8).

## D-010 — Double-click for unit commands (instead of right-click)
- **Decision**: All unit commands (gather, work farm, move, attack) are issued by **double-clicking** the target within 350ms. Right-click is reserved for deselect only. Single-click is pure selection.
- **Alternatives considered**: (a) keep RTS-standard right-click-to-command; (b) left-click-on-tile-to-move with separate attack-move hotkey; (c) a dedicated "action" key the player holds while clicking.
- **Why**: 6–8 year olds do not have strong right-click intuition on desktop — many kids ride the trackpad with one finger. Double-click is a gesture they already know from launching desktop apps. Coupling it with (1) a yellow action-preview outline on hover and (2) a tooltip after 250ms of steady hover ("Double-click to chop 🪵") makes the mapping discoverable without a tutorial. The first-time toast closes the loop the first time a unit is selected.
- **Tradeoffs accepted**: Veteran RTS players lose muscle memory. Mitigated by BACKLOG note for a future settings toggle. Accidental selection-then-double-click of a resource near where you were clicking is possible, but the 350ms window plus same-target requirement keeps false positives rare.
- **Scope boundary**: No gameplay logic changed. Combat, AI, gather loop, tier system, auto-engage — all identical. Only the input layer + a hover hint system + first-time toasts.
- **Refinement 2026-04-19**: Single-click on any selectable target (unit **or** building) always *replaces* the current selection — standard RTS behavior. Previously we preserved unit selection when clicking a building to protect the double-click-for-action flow, but it forced an extra right-click-to-deselect step. Instead, `onPointerUp` snapshots `selectedUnits` **before** the single-click resolves; if a second click on the same target arrives within 350ms, the action executes against that snapshot (not the now-switched selection). User sees the building selected at the end of a double-click-on-their-own-farm — the villagers perform the work under the hood. Cleaner selection UX at the cost of a small "selection after action" quirk we consider acceptable.

## D-009 — Canvas 1280×832 @ 64px tiles (drift from plan's 960×640 @ 32px)
- **Decision**: Game canvas is 1280×832 pixels with 20×13 tiles at 64px each.
- **Alternatives considered**: Plan's 960×640 @ 32px (30×20 tiles); 960×640 @ 64px (15×10 — too cramped for plan's content density).
- **Why**: The supplied art assets are 64–128px native. Running at 32px would require aggressive downscaling that reads poorly for a young child. 64px tiles keep art at native-ish scale and feel clearly readable. Bumping canvas to 1280×832 preserves plan's content density (roughly 260 tiles vs plan's 600, but ratio of features-to-space similar).
- **Tradeoffs accepted**: Drift from plan numbers. Any plan section citing "30×20" or "32×32" is outdated and should be re-checked before referencing. Bigger canvas = more pixels to draw (negligible for this game). Map feels smaller in absolute tile count; balanced by larger per-tile art.

---

## Adding a decision

When you make a decision that constrains future work, add it here with a fresh `D-NNN`. Keep Alternatives / Why / Tradeoffs short — aim for 4–8 lines per decision. Reference decisions by ID in CHANGELOG and CLAUDE.md.
