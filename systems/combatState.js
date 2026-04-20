/**
 * Combat-state detector.
 *
 * Every tick (call from GameScene.update), checks if any of these hold:
 *   1. A soldier is in 'attacking' state with a live target.
 *   2. An entity (unit or building) lost HP since the previous tick.
 *
 * Either signal refreshes `lastCombatEventAt`. When 5 seconds pass without
 * a signal, combat ends.
 *
 * Dispatches 'combat-started' and 'combat-ended' events that audio.js
 * subscribes to.
 */

import { gameState } from '../data/gameState.js';

const COOLDOWN_MS = 5000;

let _isCombat = false;
let _lastCombatAt = -Infinity;
let _forceOverride = null;   // 'peaceful' | 'combat' | null

const _prevHp = new WeakMap();
const _listeners = { started: new Set(), ended: new Set() };

/* ---------------- public API ---------------- */

export function isCombatActive() { return _isCombat; }

export function currentState() { return _isCombat ? 'combat' : 'peaceful'; }

export function onCombatStarted(fn) { _listeners.started.add(fn); return () => _listeners.started.delete(fn); }
export function onCombatEnded  (fn) { _listeners.ended.add  (fn); return () => _listeners.ended.delete  (fn); }

export function forceCombat()   { _forceOverride = 'combat';   }
export function forcePeaceful() { _forceOverride = 'peaceful'; }
export function clearForce()    { _forceOverride = null;       }

export function reset() {
  _isCombat = false;
  _lastCombatAt = -Infinity;
  _forceOverride = null;
  // WeakMap handles itself
}

/**
 * Called every ~250ms by GameScene.
 * @param {number} now - ms timestamp (scene.time.now)
 */
export function tick(now) {
  const forced = _forceOverride;
  const signal = forced != null ? (forced === 'combat') : _detectSignal();

  if (signal) {
    _lastCombatAt = now;
    if (!_isCombat) {
      _isCombat = true;
      _emit('started');
    }
  } else if (_isCombat && (now - _lastCombatAt) >= COOLDOWN_MS) {
    _isCombat = false;
    _emit('ended');
  }

  // Snapshot HPs for next-tick damage detection
  for (const e of _allEntities()) {
    if (!e || e.destroyed) continue;
    if (typeof e.hp !== 'number') continue;
    _prevHp.set(e, e.hp);
  }
}

/* ---------------- internals ---------------- */

function _detectSignal() {
  // 1) Any soldier mid-attack on a live target
  for (const s of gameState.soldiers) {
    if (!s || s.destroyed) continue;
    if (s.state !== 'attacking') continue;
    const t = s.attackTarget;
    if (t && !t.destroyed && (typeof t.hp !== 'number' || t.hp > 0)) return true;
  }
  // 2) Anyone took damage since the last tick
  for (const e of _allEntities()) {
    if (!e || e.destroyed) continue;
    if (typeof e.hp !== 'number') continue;
    const prev = _prevHp.get(e);
    if (prev != null && e.hp < prev) return true;
  }
  return false;
}

function _allEntities() {
  return [
    ...gameState.villagers,
    ...gameState.soldiers,
    ...gameState.buildings
  ];
}

function _emit(type) {
  const set = _listeners[type];
  if (!set) return;
  for (const fn of Array.from(set)) { try { fn(); } catch (e) { console.warn('[combatState]', e); } }
}

/* ---------------- dev debug ---------------- */

if (typeof window !== 'undefined') {
  window.audioDebug = window.audioDebug || {};
  Object.assign(window.audioDebug, {
    forceCombat:   () => forceCombat(),
    forcePeaceful: () => forcePeaceful(),
    clearForce:    () => clearForce(),
    currentState:  () => currentState()
  });
}
