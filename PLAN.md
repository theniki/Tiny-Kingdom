# 🏰 Tiny Kingdom — Main Build Plan

**Single source of truth.** This document supersedes all previous versions (v1, v2, v3, v4, and the separate multiplayer companion). Everything lives here.

A cute, browser-based mini-RTS for a 6–8 year old. Extended to support 2-player head-to-head multiplayer with fog of war and a minimap.

**Stack:** Phaser.js 3 + JavaScript + HTML5 Canvas + Node.js + Socket.IO
**Visual style:** Top-down 2D, tile-based, bright and cheerful
**Target:** Desktop browser, mouse + keyboard
**Session length:** 15–20 minutes
**Design pillar:** Near-instant feedback (2–3 sec per action), long strategic arc

---

## 📊 Progress Tracker

```
[✅] Prompt 0 — Project setup
[✅] Prompt 1 — The World
[✅] Prompt 2 — Selection & HUD
[✅] Prompt 3 — Animated villagers + movement
[✅] Prompt 4 — Gathering loop
[✅] Prompt 5 — Building system + villager training
[✅] Prompt 6 — Combat & Guards
[✅] Prompt 7 — Rival AI + Tier upgrades + Prompt 6 refinements
[✅] Prompt 8 — Treasure chests + Big Castle + Win/Lose
[✅] Prompt 9 — Polish pass
[✅] Prompt 10 — Bigger map + minimap + fog of war
[ ] Prompt 11 — Socket.IO server + multiplayer lobby (YOU ARE HERE)
[ ] Prompt 12 — Network sync + PvP mode
```

---

## 1. Complete Asset Manifest

All files in `assets/`. Every role maps to a real asset or a defined placeholder.

### 🌍 Terrain tiles (`assets/tiles/`)
| File | Role | Notes |
|---|---|---|
| `grass.png` | Base walkable ground | 32×32, default tile |
| `water.png` | Impassable water | 32×32 |
| `mountain.png` | Impassable terrain | 32×32 |
| `decoration.png` | Flower/bush sheet | 9-sprite grid (3×3), scatter for flavor |

### 🌳 Resource nodes (`assets/resources/`)
| File | Role | Interactive? |
|---|---|---|
| `tree_64.png` | Wood source 🪵 | ✅ 50 wood per tree |
| `apple_pile_64.png` | Food source 🍎 | ✅ 30 food per pile |
| `gold.png` | Decorative only | ❌ World flavor |
| `grey-rocks.png` | Decorative only | ❌ World flavor |
| `purple-rocks.png` | Decorative only | ❌ World flavor |
| `minerals.png` | Decorative only | ❌ World flavor |
| `rare-mineral.png` | Decorative only | ❌ World flavor, rare |

### 🏘️ Buildings (`assets/buildings/`)
| File | Role | Footprint |
|---|---|---|
| `camp_l1_64.png` | Town Center T1 (camp) | 2×2 |
| `house_l2_64.png` | House T1 + T2, Town Center T2 | 2×2 |
| `BARRACKS.png` | Barracks (all tiers) | 3×3 |
| `CASTLE.png` | Big Castle (win condition) | 3×3 |
| `box.png` | Storage / decoration (optional) | 1×1 |
| `TREASURE.png` | Treasure chest (random spawn) | 1×1 |

### 👥 Units (`assets/characters/`)
| File | Role | Animation |
|---|---|---|
| `villager_idle_east.png` (from GIF) | Villager idle right | ✅ Spritesheet |
| `villager_idle_west.png` | Villager idle left | ✅ Spritesheet |
| `villager_walk_east.png` | Villager walking right | ✅ 4 frames |
| `villager_walk_west.png` | Villager walking left | ✅ 4 frames |
| `SOLDIER-east.png` | Guard/Knight facing right | ❌ Static + bob |
| `SOLDIER-west.png` | Guard/Knight facing left | ❌ Static + bob |
| `SOLDIER-south_east.png` | Guard/Knight facing down-right | ❌ Static + bob |

### 🎁 Items (`assets/items/`)
| File | Role |
|---|---|
| `RANDOM_SMALL_FINDABLES.png` | Carry-icons + chest rewards (20-sprite sheet) |

### 🚧 Placeholder strategy
| Need | Placeholder | Upgrade later? |
|---|---|---|
| Farm | Brown 64×64 rect + 6 yellow wheat dots via Phaser Graphics, cached as RenderTexture | When better art found |
| Animated soldier walk | Static sprite + 2px vertical bob (sine wave, 8Hz) | When animated sprites found |
| Enemy (red) team | Runtime `setTint(0xff4444)` + red under-foot team disk | No — tint is fine |

---

## 2. Unit & Building Reference

### Units
| Unit | Sprite | HP | Speed | Attack | Cost | Train time |
|---|---|---|---|---|---|---|
| Villager | adu (animated) | 25 | 3 tiles/sec | — | 25 food | 5 sec |
| Guard (T1) | SOLDIER + blue tint + blue disk | 60 | 2.5 | 10 | 40 food + 20 wood | 8 sec |
| Knight (T2) | SOLDIER + gold glow ellipse | 80 | 3.0 | 18 | researched once at T2 Barracks | — |

### Buildings
| Building | Sprite | HP | Footprint | Cost | Build time |
|---|---|---|---|---|---|
| Town Center T1 | `camp_l1_64.png` | 400 | 2×2 | — (start) | — |
| Town Center T2 | `house_l2_64.png` × 1.5 | 600 | 2×2 | 80w + 80f upgrade | 10 sec |
| House T1 | `camp_l1_64.png` × 0.8 | 100 | 2×2 | 20 wood | 3 sec |
| House T2 | `house_l2_64.png` | 150 | 2×2 | 40w upgrade | 5 sec |
| Barracks T1 | `BARRACKS.png` | 200 | 3×3 | 50 wood | 4 sec |
| Barracks T2 | `BARRACKS.png` + gold glow | 300 | 3×3 | 60w upgrade | 6 sec |
| Farm | Placeholder (brown+wheat) | 75 | 2×2 | 30 wood | 3 sec |
| Big Castle | `CASTLE.png` | 500 | 3×3 | 100w + 100f | 6 sec |

---

## 3. Resource & Progression System

### Starting state
- Wood: 50, Food: 50
- 3 Villagers, 1 Town Center (T1 camp)
- Villager cap: 5 (Camp gives 5; Houses add +4 each)

### Gather rates (2–3 sec loops = near-instant feedback)
| Action | Time | Yield | Rate (solo) |
|---|---|---|---|
| Chop tree | 3 sec | +5 wood | ~100/min |
| Gather apples | 3 sec | +5 food | ~100/min |
| Work a farm | 2 sec | +4 food | ~120/min |

### Map contents (single-player 30×20)
- 30 trees, 10 apple piles
- 12 decorative resource piles (gold/rocks/minerals)
- 40 decoration tiles (flowers/bushes)
- 1 water pond, 1 mountain cluster

### Map contents (multiplayer 60×60, from Prompt 10)
- 120 trees, 40 apple piles
- 48 decorative piles
- 160 decorations
- 2–3 water ponds, 3–4 mountain clusters

### Tier progression effects
- **Camp → T2 TC:** +3 villager cap, +200 HP, unlocks Big Castle
- **House T1 → T2:** cap bonus 4 → 6, HP 100 → 150
- **Barracks T1 → T2:** train speed ×1.25, unlocks Knight research
- **Knight research:** all soldiers (current + future) upgraded to Knights — player-only, never red

### 15–20 min game arc
| Time | Event |
|---|---|
| 0:00 | 3 villagers, camp TC |
| 2:00 | First House built, first chest appears |
| 4:00 | Apples depleting → first Farm built |
| 6:00 | Barracks up, first Guard trained |
| 7:30 | Red wave 1 (1 guard) |
| 9:00 | TC upgrade to T2 |
| 10:30 | Wave 2 (2 guards) |
| 12:00 | Knight research OR rush Big Castle |
| 13:30 | Wave 3 (3 guards) |
| 15:00 | Big Castle built → 60-sec countdown |
| 16:30 | Wave 4 (4 guards) |
| 18:00 | Win or lose |

---

## 4. Treasure Chests 🎁

First chest at 2:00, then every 90–150 sec (random), max 3 on map.
Walk any unit onto a chest → particle burst + jingle → weighted reward:

| Reward | Weight | Effect |
|---|---|---|
| 🪵 +50 wood | 30% | Instant |
| 🍎 +50 food | 30% | Instant |
| 👶 Free villager | 20% | Spawns at TC |
| 💨 Speed boost | 15% | +50% gather for 20 sec |
| ⚔️ Free guard | 5% | Spawns at Barracks (fallback: +50 food) |

Show reward icon from `RANDOM_SMALL_FINDABLES.png` + toast notification.

---

## 5. Tech Setup

### Project structure (client)
```
tiny-kingdom/
  index.html
  main.js
  scenes/
    BootScene.js      ← asset preload
    MainMenuScene.js  ← [from Prompt 11] title + mode select
    StartScene.js     ← legacy (single-player entry)
    NameEntryScene.js ← [from Prompt 11]
    CreateRoomScene.js← [from Prompt 11]
    JoinRoomScene.js  ← [from Prompt 11]
    GameScene.js      ← core gameplay
    UIScene.js        ← HUD overlay (incl. minimap from Prompt 10)
    WinScene.js
    LoseScene.js
  data/
    units.js
    buildings.js
    tiers.js
    chests.js
  systems/
    pathfinding.js
    gather.js
    combat.js
    ai.js             ← single-player rival
    network.js        ← [from Prompt 11] Socket.IO client wrapper
    fogOfWar.js       ← [from Prompt 10]
    minimap.js        ← [from Prompt 10]
  assets/
    tiles, resources, buildings, characters, items, audio
```

### Project structure (server, from Prompt 11)
```
tiny-kingdom-server/
  package.json
  server.js
  lib/
    Room.js
    Player.js
    Simulation.js    ← [Prompt 12] authoritative game state
```

### Critical pre-work (before Prompt 0)
Phaser cannot load `.gif` files. Convert each character GIF to a sprite sheet:
1. Go to **ezgif.com/split**, upload each of the 4 character GIFs.
2. Choose "Output as: sprite sheet (horizontal)".
3. Save as `villager_idle_east.png`, `villager_idle_west.png`, `villager_walk_east.png`, `villager_walk_west.png`.
4. Note frame dimensions (probably 32×32) — you'll tell the AI coding assistant during Prompt 0.

### index.html skeleton
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Tiny Kingdom</title>
  <style>
    body { margin: 0; background: #222; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif; }
    #game { box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
  </style>
</head>
<body>
  <div id="game"></div>
  <script src="https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js"></script>
  <!-- Add for Prompt 11+: -->
  <!-- <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script> -->
  <script type="module" src="main.js"></script>
</body>
</html>
```

---

## 6. Build Log — What's Already Shipped (Prompts 0–6)

### Core systems working
- Phaser 3 project scaffold, 6 scenes, full asset pipeline
- 30×20 procedural tile map (grass, water, mountain, trees, apples, decoratives, flowers)
- Selection: click, shift-click, box-drag, deselect
- Top + bottom HUD (live resources, population, timer)
- Animated villagers (4-frame walk east/west + idle breathing)
- BFS pathfinding (avoids water/mountain/resources/buildings)
- Gathering loop: chop/gather → carry → deposit → auto-repeat
- Build placement mode: House T1, Farm (placeholder), Barracks T1
- Villager training queue at Town Center
- Guard unit with directional SOLDIER sprites (east/west/south_east)
- 2px bob tween fakes walking animation
- Team tinting (blue player, red enemy via setTint)
- Combat: auto-attack, melee range, 1s cooldown, scale-pulse
- Health bars (green → yellow → red) appear below 50% HP
- Death animations: rotate-fade (units), shake + smoke + fade (buildings)
- Debug hotkey `E`: spawns red enemy guard at cursor

### Improvements beyond spec (KEEP THESE)
1. **Auto-engage idle guards within 5-tile radius** — essential for the age group. Establishes the design pattern: *wherever a task feels like babysitting, default to auto-behavior.*
2. **Building death via yoyo tween** — simpler and cleaner than random jitter. Keep it.
3. **State cleanup discipline** — soldier death removes from `gameState.soldiers`, villager death emits `populationChanged`. Apply same rigor to buildings in Prompt 7.
4. **Villagers take combat damage** — correct call. Teaches "protect your workers" naturally.

### Rough edges (addressed in Prompt 7 below)
- **Enemy tint washed out** vs. red-heavy SOLDIER art → switch to stronger red + under-foot team disks.
- **Chase pathfinding lag** (100ms tick = attacker arrives at empty tile) → separate 400ms re-path timer while chasing.

---

# 7. The Build Prompts

Hand each prompt to your AI coding assistant one at a time. Verify it works before moving on.

## 🟩 Prompt 0 — Project Setup ✅ DONE

*(See Build Log above — completed.)*

## 🟩 Prompt 1 — The World ✅ DONE

## 🖱️ Prompt 2 — Selection & HUD ✅ DONE

## 🚶 Prompt 3 — Animated Villagers + Movement ✅ DONE

## 🌲 Prompt 4 — Gathering Loop ✅ DONE

## 🏠 Prompt 5 — Building System + Villager Training ✅ DONE

## ⚔️ Prompt 6 — Combat & Guards ✅ DONE

---

## 🤖 Prompt 7 — Rival AI + Tier Upgrades + Prompt 6 Refinements (CURRENT)

```
Building on Prompt 6, add the rival red kingdom AI, tier upgrade system, AND fix two rough edges from Prompt 6.

PART A — Team visual clarity (rough edge fix):
- Replace enemy setTint(0xff8888) with setTint(0xff4444) (stronger red).
- Add under-foot team indicators: for every unit (villager, guard, future knight), draw a colored ellipse beneath their feet (blue #4488ff for team='blue', red #ff4444 for team='red'), 16px wide × 6px tall, alpha 0.6. Render BEFORE the unit sprite so sprite sits on top. Anchor to unit position every frame.
- Also add under-building colored ribbons: 24px × 4px rectangle at building's bottom edge, same team colors.

PART B — Chase pathfinding fix (rough edge fix):
- When soldier is in 'attacking' state and target is moving, re-path every 400ms (separate from the 100ms combat tick).
- On re-path, target the tile enemy is CURRENTLY on (not predicted).
- If target has moved more than 1 tile since last path, interrupt current walk, fresh path.

PART C — Rival kingdom (red AI):
- Spawn red Town Center (camp_l1_64.png + setTint(0xff4444) + red ribbon) in opposite corner of map from player.
- Red team state: separate from player — redState = { wood: 50, food: 50, villagers: [], buildings: [], soldiers: [], villagerCap: 5 }.
- Red starts with 3 red villagers (red team disk under feet).
- AI tick every 10 seconds (systems/ai.js):
  * If redState.wood < 100 AND idle red villager: send to nearest tree.
  * Else if redState.food < 100 AND idle villager: send to nearest apple pile or farm.
  * If redState.wood >= 80 AND no red House: build House on open tile near red TC.
  * If redState.wood >= 80 AND has House AND no red Barracks: build Barracks.
  * Red gathers at 80% rate (extend gather time or reduce yield — pick one consistently).
- Wave schedule:
  * Every 90 sec of game time: trigger wave.
  * Wave N size = min(N, 4) red guards.
  * 5 sec before wave: UI warning "⚠️ Red army approaches!" (top-center toast, 5s). Red dashed path line from red TC to player TC. wave_warning sfx placeholder.
  * Wave units spawn at red Barracks (or TC if none). Target: player TC. Auto-engage anything in their 5-tile radius (reuses Prompt 6 logic — your auto-engage decision pays off here!).

PART D — Tier 2 upgrades:
- Every Tier-1 building, selected AND not training, gets "⬆️ Upgrade" button in bottom bar:
  * Town Center T1 → T2: 80 wood + 80 food, 10 sec. On complete:
    - Swap sprite to house_l2_64.png scaled 1.5×.
    - HP 400 → 600 (preserve damage %: if at 80% HP before, stay 80% after).
    - villagerCap += 3.
    - Set building.tier = 2 — unlocks Big Castle (Prompt 8).
    - Emit 'buildingUpgraded' event.
    - Sparkle particle burst (yellow/white, 25 particles, 700ms).
  * House T1 → T2: 40 wood, 5 sec. Sprite to house_l2_64.png (no scale change). villagerCap delta +2 (from this house's contribution). HP 100→150.
  * Barracks T1 → T2: 60 wood, 6 sec. Same sprite + golden glow (Phaser postFX.addGlow(), yellow #ffdd44, outerStrength 2). Train speed ×1.25 (Guard train time 8s → 6s). Unlocks "Research Knight".
- T2 Barracks selected → "⚔️ Research Knight" button: 60 wood + 60 food, 15 sec. One-time per barracks. On complete:
  * All current player soldiers become Knights: HP = max(currentHP + 20, 80), attack 10 → 18, speed 2.5 → 3.
  * Future soldiers trained at ANY player barracks spawn as Knights.
  * Visual: gold glow ellipse (yellow #ffdd88, alpha 0.3) behind each Knight's sprite, beneath team disk.
  * Player-only. Red never researches — they stay Guards. (Keeps challenge manageable.)
- Upgrade progress bar: thin yellow bar above building during upgrade.

PART E — State cleanup discipline (carry forward your Prompt 6 pattern):
- On building destruction: remove from gameState.buildings (and redState.buildings). If House, reduce villagerCap + emit 'populationChanged'. If all Barracks lost, player can't train more Guards (real consequence).
- If last Town Center destroyed: console.log "Team X loses" and freeze remaining units. (Prompt 8 handles real win/lose scenes.)

Deliverable: Breathing red opponent with telegraphed waves, clear team visuals, smooth chase combat, satisfying "stuff gets stronger" upgrades for buildings AND units.
```

---

## 🎁 Prompt 8 — Treasure Chests + Big Castle + Win/Lose

```
Add delight (chests) and endgame (castle + win/lose scenes).

PART A — Treasure chests:
- First chest at elapsedTime >= 120 sec. Then every 90–150 sec (random), max 3 on map.
- Chest: TREASURE.png on random walkable grass tile. Pulsing glow (scale tween 1.0 ↔ 1.1, yoyo, 1500ms).
- Any unit walking onto chest tile collects it:
  * Open animation: scale 1.3 + fade alpha 1→0, 200ms, then destroy.
  * Particle burst: 20 yellow/white sparkles, 800ms lifespan.
  * Weighted random reward:
    - 30% +50 wood
    - 30% +50 food
    - 20% Free villager (spawns at collector's TC)
    - 15% Speed boost (+50% gather for 20 sec, collector's team only)
    - 5% Free guard at Barracks (fallback: +50 food)
  * Float reward icon from RANDOM_SMALL_FINDABLES.png rising 40px over 1 sec, fading.
  * Toast notification top-center: "🎉 Found 50 wood!" — slide down, 2 sec, slide up.
- Red collects → apply silently to red team, no toast.

PART B — Big Castle (win condition):
- Requires Tier 2 Town Center.
- T2 TC selected → "🏰 Build Big Castle" button: 100w + 100f, 6 sec, 3×3 footprint.
- Sprite: CASTLE.png. 500 HP.
- On built, start 60-second countdown. Display as big yellow numbers above castle, updating each second.
- If destroyed before 0: countdown cancels. Player can rebuild (one castle at a time).
- Countdown reaches 0 → WIN.

PART C — Win / Lose conditions:
- WIN: castle countdown hits 0, OR red TC destroyed. Transition to WinScene with stats.
- LOSE: player TC destroyed. Transition to LoseScene with stats.

PART D — WinScene:
- "🎉 You Win!" banner (48px gold, centered).
- Stats: "Time played: X:XX", "Villagers trained: N", "Enemies defeated: M", "Chests opened: K".
- "▶ Play Again" → StartScene.
- Continuous confetti particles.

PART E — LoseScene:
- "Your kingdom fell! 😢" banner.
- Subtitle: "Don't give up — try again!"
- Same stats panel.
- "▶ Try Again" → StartScene.
- Muted colors, kind language.

Deliverable: complete single-player game loop.
```

---

## 🎨 Prompt 9 — Polish Pass

```
Final polish for single-player.

- PAUSE: SPACE toggles. Translucent black overlay + "⏸ Paused" (48px). Timer and all tweens pause.
- SFX (stub with console.log if no files yet; find CC0 on freesound.org / kenney.nl):
  chop, gather, build_complete, train_complete, attack_hit, building_destroyed, chest_open, wave_warning, victory, defeat.
- MUSIC: one looping medieval-flute track (incompetech.com, kenney.nl). Speaker icon 🔊/🔇 top-right toggles mute.
- PARTICLES (verify all implemented): sparkles on build complete, hearts on villager trained, dust puffs when units walk, stars/confetti on chest, smoke on building destroyed, flag flutter on Big Castle.
- TOOLTIPS: hover UI button 500ms → tooltip with description + cost, fades in.
- TUTORIAL OVERLAY: "❓ How to Play" on StartScene. 4-panel slideshow with prev/next:
  1. "Click a villager, right-click a tree — they'll chop wood!"
  2. "Build Houses for more villagers. Build Farms for endless food."
  3. "Train Guards at the Barracks to protect your kingdom!"
  4. "Build the Big Castle and hold it for 60 seconds to WIN!"
- TITLE SCREEN: 2–3 idle villagers wander in background (random paths, loop forever).
- Team rim-light: subtle blue glow on player buildings, red on enemy buildings.

Deliverable: polished single-player game.
```

---

## 🗺️ Prompt 10 — Bigger Map + Minimap + Fog of War

```
Expand map, add camera scrolling, minimap, fog of war. Still single-player.

PART A — Bigger map:
- Map: 30×20 → 60×60 tiles. Canvas stays 960×640 (30×20 tiles visible).
- Camera scrolls across the 60×60 world.
- Controls: WASD/arrows scroll (8 tiles/sec). Edge-scroll: mouse within 40px of edge auto-scrolls. Middle-click drag panning. Clamp to map edges.
- Scale up generation: 120 trees, 40 apples, 4× decoratives, 2-3 water ponds, 3-4 mountain clusters.
- Player TC in one corner quadrant; red TC opposite corner.

PART B — Minimap:
- Add to UIScene, bottom-right, 180×180 px. Semi-transparent bg (#000a, alpha 0.7), 2px white border.
- Renders 60×60 map as 3×3 pixel cells.
- Colors: grass #2d5c2d, water #1e4a8a, mountain #555, trees #4a8a3c, apples #b23a3a, buildings by team (blue #4488ff, red #ff4444), units 2×2 team-colored dots.
- Camera viewport rectangle drawn in white outline on minimap.
- Click minimap → camera jumps. Click-drag → camera follows cursor.
- Update every 250ms (not per-frame).

PART C — Fog of war (systems/fogOfWar.js):
- Three states per team per tile: UNSEEN (never explored) | EXPLORED (seen before, not now) | VISIBLE (currently seen).
- Data: fogOfWar[team][y][x] = 0 | 1 | 2.
- Vision radius: Villager 5, Guard/Knight 6, TC 8, House/Farm 3, Barracks 5, Castle 10.
- Compute every 250ms: for each unit/building on team, mark tiles within Chebyshev ≤ radius as VISIBLE. Anything VISIBLE last tick but not now → EXPLORED.
- Render fog as overlay canvas on top of game layer:
  * UNSEEN: solid black.
  * EXPLORED: 60% black overlay.
  * VISIBLE: no overlay.
- Minimap obeys fog too: UNSEEN black, EXPLORED desaturated.
- Enemy units in EXPLORED tiles hidden. Enemy buildings show "last seen HP" frozen until re-seen.
- Starting fog: everything UNSEEN except 10-tile radius around player TC (VISIBLE).

PART D — Debug keys:
- 'F': toggle fog on/off.
- 'M': reveal entire map.

Deliverable: 60×60 scrollable world, working minimap, real fog of war. Your kid will instinctively send a guard "scouting" — that emergent behavior is the whole point.
```

---

## 🌐 Prompt 11 — Socket.IO Server + Multiplayer Lobby

```
Build Node.js server + lobby flow. NO game sync yet (that's Prompt 12).

PART A — Server (new folder `tiny-kingdom-server/` alongside `tiny-kingdom/`):
- Structure: package.json, server.js, lib/Room.js, lib/Player.js.
- Dependencies: express, socket.io, uuid.
- server.js:
  * Express serves client folder on port 3000.
  * Socket.IO same port.
  * Rooms tracked in memory: Map<roomCode, Room>.
  * Events:
    - 'create-room' (playerName) → generates 4-letter code ("BEAR"), creates Room, returns code.
    - 'join-room' (roomCode, playerName) → validates room exists + not full, adds player, broadcasts 'player-joined'.
    - 'leave-room' → removes player, notifies other, destroys empty rooms.
    - 'start-game' (host only) → broadcasts 'game-start' with mapSeed (timestamp).
    - 'disconnect' → auto-leave.
- Room: { code, host, players[], status: 'waiting'|'playing'|'ended', mapSeed }. Methods: addPlayer, removePlayer, isFull, startGame.
- Player: { socketId, name, team: 'blue'|'red' } (1st joiner = blue, 2nd = red).

PART B — Client lobby UI (replace StartScene flow):
1. MainMenuScene: "🏰 Tiny Kingdom" + 3 buttons:
   - "🎮 Single Player" → existing flow (AI rival).
   - "👥 Create Multiplayer Game" → NameEntry → CreateRoom.
   - "🔑 Join Multiplayer Game" → NameEntry → JoinRoom.
2. NameEntryScene: "Enter your name:" input (max 12 chars, letters only), "Continue".
3. CreateRoomScene: connects to Socket.IO, emits 'create-room', displays big room code "CODE: BEAR", player list, "Waiting for player 2...", "Start Game" button (host-only, enabled at 2 players), "Cancel" → back.
4. JoinRoomScene: "Enter code:" input (4 letters), "Join" → emits 'join-room'. On success: same view (no start button). On fail: error.
5. On 'game-start': store mapSeed, team, opponent in registry. Transition to GameScene + UIScene. GameScene uses mapSeed via seeded PRNG (seedrandom library) so both clients generate identical maps.

PART C — Network foundation:
- Add socket.io-client CDN to index.html.
- Create systems/network.js singleton:
  * connect(serverUrl)
  * createRoom(playerName, callback)
  * joinRoom(roomCode, playerName, callback)
  * leaveRoom()
  * sendCommand(type, payload) — for Prompt 12.
  * onEvent(event, handler).
- Registry: { playerName, team, roomCode, opponent, mapSeed }.

PART D — Running locally (add README):
```bash
cd tiny-kingdom-server
npm install
npm start
# http://localhost:3000 — both players open this
# Different machines same LAN: http://[host-ip]:3000
```

Deliverable: two browsers find each other via room code. Host sees Start button light up at 2 players. Click Start → both clients load GameScene with identical maps. Game still runs client-side (no sync yet — Prompt 12 adds that).
```

---

## ⚔️ Prompt 12 — Network Sync + PvP Mode

```
Wire real-time sync. The biggest prompt in the project — budget a full weekend.

PART A — Command pattern:
Player actions → commands → server validates → broadcasts.

Commands:
- { type: 'MOVE_UNIT', unitId, targetX, targetY }
- { type: 'GATHER', unitId, resourceId }
- { type: 'BUILD', villagerId, buildingType, gridX, gridY }
- { type: 'TRAIN', buildingId, unitType }
- { type: 'UPGRADE', buildingId }
- { type: 'RESEARCH', buildingId, techName }
- { type: 'ATTACK', unitId, targetId }

Server validation: does player own this? Is action legal (resources, valid target, exists)? If yes → apply + broadcast. If no → 'command-rejected' to sender with reason.

PART B — Server authoritative simulation:
- Move all sim logic to server. server.js runs game tick at 10Hz (100ms).
- Simulation covers: unit movement, gather timers, combat (cooldown + damage), building construction, training queues, farm generation, treasure chest spawning.
- Server broadcasts snapshots every 200ms:
  { units[], buildings[], resources: { blue: {w,f}, red: {w,f} }, chests[], time }
- PER-CLIENT FOG FILTERING: client 'blue' only receives blue-visible entities + blue's own state. Client 'red' similar. Server literally omits unseen entities from payload → fog of war is cheat-proof.

PART C — Client interpolation:
- Client renders, doesn't simulate.
- On snapshot: tween entity positions to new pos over 200ms (matching tick rate).
- Local prediction for OWN player's actions only:
  * Click to move → animate immediately, don't wait for server round-trip.
  * Server response differs → rubber-band correction (tween to authoritative position over 300ms).
- Opposing player's units: pure interpolation from snapshots (no prediction).

PART D — Replace red AI with human player:
- GameScene reads game mode from registry.
- If 'multiplayer': skip AI, treat red team as opponent via network. Fog computed per-team, server filters data.
- If 'singleplayer': existing Prompt 7 AI flow.

PART E — End game:
- Win/lose same conditions as single-player.
- Server detects, broadcasts 'game-over' with winner team.
- Both clients → WinScene or LoseScene based on own team vs winner.

PART F — Disconnect handling:
- Mid-game disconnect → server pauses room, broadcasts 'opponent-disconnected'.
- Remaining player: "⏸ Waiting for opponent to reconnect... (30s)".
- 30-sec reconnect window. Disconnected player rejoins with room code.
- Timer expires → remaining player wins with "Opponent left" message.

PART G — Deployment:
- Option 1 (local network): run server on host laptop, other kid opens [host-ip]:3000. No internet needed.
- Option 2 (cloud): Railway.app, Render.com, or Fly.io free tiers. One-click deploy from GitHub. Share URL (e.g. tiny-kingdom.up.railway.app). Include .env.example with PORT.

Deliverable: two kids on different computers playing real head-to-head Tiny Kingdom. Fog of war keeps them guessing. Minimap shows sprawl. Server arbitrates everything.
```

---

## 8. Multiplayer Design Notes

**Scale:** 2 players max (you + kid, or kid + friend).
**Mode:** head-to-head competitive (first to win condition wins).
**Fog of war:** full AoE-style — unexplored = black, explored unseen = dim, visible = bright.
**Trust model:** trusted clients (no anti-cheat). Fine for kids playing friends.

### Testing multiplayer without a second kid
Open two browser windows side-by-side — one normal, one incognito (different socket connections). Create room in one, join with other. Play both sides yourself for dev/debug.

### Critical gotchas
- **Map seed must produce identical results on both clients.** Use `seedrandom` library client AND server. Any `Math.random()` in map gen = desync = pain.
- **Display serverTime in UI, not local performance.now()** — both players see same timer.
- **Fog is server-enforced.** Do NOT send full entity list and filter client-side — any kid with dev tools can peek. Server omits unseen entities from per-client payload.
- **Test with artificial lag.** Chrome DevTools → Network → "Slow 3G". If unplayable at 300ms ping, add more client-side prediction.

### If Prompt 12 gets too painful
Fallback: **turn-based multiplayer.** Each player takes a 30-second turn to issue commands, then the other goes. Removes all real-time networking complexity. Perfectly playable for kids.

---

## 9. Sequel Roadmap (post-launch)

Your decorative assets already hint at v2 features:
- 🪙 **Gold** as a third resource — mined from gold.png, unlocks Market + trading.
- 🪨 **Stone** economy — grey-rocks.png mineable, used for walls and towers.
- 💎 **Rare minerals** unlock Tier 3 elite units.
- 📦 **Storage boxes** (box.png) as secondary dropoff points for faster gathering.
- ❄️ **Biomes**: snow, desert maps.
- 👁️ **Spectator mode:** parent watches both kids with full map vision.
- 🤝 **2v2 team mode** once 2-player works.
- 🎨 **Sandbox mode:** no combat, just build and decorate.
- 💾 **Saved games** — persist room state to disk.
- 🎥 **Replay system** — server logs commands, client plays back.

---

## 10. Working With AI Coding Assistants — Tips

1. **Paste Section 1 (asset manifest) at top of every prompt.** AI needs to know filenames.
2. **Convert GIFs first.** Without sprite sheets, animation doesn't work.
3. **Test after every prompt.** If broken, fix before moving on.
4. **Version control always.** `git init` at start, commit after each successful prompt. If Prompt N breaks everything, `git reset --hard` to previous.
5. **Playtest early.** After Prompt 4, gathering is already a toy. Show your kid, adjust downstream prompts based on reaction.
6. **Prompt 7 AI is hard.** If struggling, simplify: just timed wave spawns from red corner, skip simulated economy. Kid won't notice.
7. **Prompt 12 is the hardest.** Budget more time than you think. If it gets stuck, fall back to turn-based multiplayer (see Section 8).
8. **Ugly placeholders force shipping.** Farm looking weird? Ship it. Replace art once game is fun.
9. **Finish single-player before multiplayer.** Prompts 7, 8, 9 first. A polished single-player + optional multiplayer > half-baked multiplayer that doesn't work alone.

---

## 11. Estimated Time Per Prompt (for AI coding assistants)

| Prompt | Scope | Iterations |
|---|---|---|
| 0–6 | Already done ✅ | — |
| 7 | Medium-large (AI + tiers + fixes) | 2–4 |
| 8 | Medium (chests + castle + scenes) | 2–3 |
| 9 | Medium (polish) | 2–3 |
| 10 | Large (map scaling + minimap + fog) | 3–5 |
| 11 | Medium (server + lobby) | 2–3 |
| 12 | **Largest** (network sync + PvP) | 5–10, budget a full weekend |

---

Happy building. 🏰
