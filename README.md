# Tiny Kingdom

A cute, browser-based mini-RTS designed for a 6–8 year old. Built with Phaser 3 and Vite. Single-player vs. a red AI rival today; 2-player head-to-head with fog of war and minimap is on the roadmap.

<img width="1184" height="767" alt="Screenshot 2026-04-19 at 14 04 45" src="https://github.com/user-attachments/assets/e33f77c2-b1c6-47a1-8592-5c25fc5724bc" />

## Quick start

```bash
npm install
npm run dev       # http://127.0.0.1:8765
npm run build     # production bundle in dist/
npm run preview   # serve the built bundle
```

Requires Node 18+.

## How to play

- **Single left-click** — select a unit, building, or tile.
- **Shift + left-click** — add to selection.
- **Left-drag on empty ground** — box select (shift-drag to add).
- **Double-click** a target with something selected — contextual action (chop / gather / mine / work farm / move / attack).
- **Right-click** — deselect only (right-drag pans the camera).
- **WASD / arrow keys** — scroll the camera. Edge-scroll works too.
- **ESC** — deselect. **SPACE** — pause.

Goal: build a Big Castle and protect it for 60 seconds, or destroy the red Town Center.

## Design pillars

1. Near-instant feedback — every loop resolves in 2–3 seconds.
2. Auto-behavior over micro — idle guards auto-engage within 5 tiles.
3. Kid-friendly language — no harsh loss screens, no violent visuals.
4. Ship ugly placeholders — if the loop is fun, the art can wait.

## Stack

- **Phaser 3.80** + vanilla ES modules
- **Vite 5** dev server (HMR on port 8765)
- No TypeScript, no framework, no bundler config beyond Vite defaults

## Project layout

```
main.js              Phaser game boot
index.html           Canvas mount
scenes/              Boot, Start, Game, UI, Win, Lose
data/                Unit & building classes, constants, gameState, mapgen
systems/             Pathfinding, AI, input, hints, fog of war, audio, chests
assets/              tiles / resources / buildings / characters / items / audio
```

Unit and building classes live in `data/`. Pure systems (pathfinding, AI, fog) live in `systems/`. Runtime constants go in `data/constants.js`; building and unit definitions in `data/buildings.js`.

## Documentation

- **PLAN.md** — single source of truth for the build plan.
- **CHANGELOG.md** — append-only, newest-first, every shipped prompt or decision.
- **DECISIONS.md** — numbered design decisions (D-001, D-002, …) with rationale.
- **BACKLOG.md** — nice-to-haves, v2 ideas, playtest bugs.
- **CLAUDE.md** — orientation for Claude Code sessions.

## Status

Prompts 0–10 shipped: scaffold, procedural world, selection + HUD, animated villagers, BFS pathfinding, gathering loop, buildings (House / Farm / Barracks), training queue, combat (guards, health bars, death anims), red AI rival + tier upgrades, double-click input scheme, polish pass (pause, tooltips, tutorial), 60×60 world with minimap and fog of war.

Next up: Prompt 11 — multiplayer (Node + Socket.IO, 2 players head-to-head).
