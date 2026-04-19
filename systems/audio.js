/**
 * Audio stub layer. Plan §9 allows SFX stubs until CC0 assets land.
 * When real audio arrives:
 *   1. Load in BootScene: this.load.audio('chop', 'assets/audio/chop.ogg')
 *   2. In audio.js: SFX[key] = scene.sound.add(key)
 *   3. No call-site changes needed — every game event already calls play(key).
 */

const SFX_KEYS = [
  'chop', 'gather', 'build_complete', 'train_complete',
  'attack_hit', 'building_destroyed', 'chest_open',
  'wave_warning', 'victory', 'defeat'
];

let muted = false;
let musicMuted = false;
const sounds = {};     // key → Phaser.Sound instance (null while stubbed)
let musicInstance = null;
const listeners = new Set();

export function registerAudio(scene) {
  // Future: loop over SFX_KEYS and attach scene.sound.add(key) when assets exist.
  // For now, everything stays null and play() logs.
  // Keeping the hook so callers don't need to care.
  for (const k of SFX_KEYS) {
    if (!(k in sounds)) sounds[k] = null;
  }
  return scene;
}

export function play(key) {
  if (muted) return;
  const s = sounds[key];
  if (s && s.play) s.play();
  else if (SFX_KEYS.includes(key)) {
    // Dev log once per key to avoid spam
    if (!_loggedKeys.has(key)) {
      _loggedKeys.add(key);
      console.log(`[sfx stub] ${key} (add assets/audio/${key}.ogg to enable)`);
    }
  } else {
    console.warn(`[sfx] unknown key: ${key}`);
  }
}

const _loggedKeys = new Set();

export function setMuted(m) {
  muted = !!m;
  _emit();
}
export function isMuted() { return muted; }

export function setMusicMuted(m) {
  musicMuted = !!m;
  if (musicInstance && musicInstance.setMute) musicInstance.setMute(musicMuted);
  _emit();
}
export function isMusicMuted() { return musicMuted; }

export function toggleAllMuted() {
  const target = !(muted && musicMuted);
  setMuted(target);
  setMusicMuted(target);
}

export function onMuteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function _emit() {
  for (const fn of listeners) fn({ muted, musicMuted });
}

export { SFX_KEYS };
