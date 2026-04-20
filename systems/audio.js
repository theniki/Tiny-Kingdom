/**
 * AudioManager — single source of truth for all music + SFX playback.
 *
 * Music flow (driven by scheduleMusicCycle):
 *   background-theme → background-theme → crossfade to ambient-layer (loop 60s)
 *     → crossfade back to background-theme → repeat forever.
 *
 * SFX layer:
 *   playSfx(key, opts) — fire-and-forget, supports pitch variation + overlap
 *   caps per category. Upgrade/level-up are unlimited.
 *
 * Persistence:
 *   localStorage['tinyKingdom.audio'] = { musicVolume, sfxVolume, muted }.
 *
 * Autoplay policy:
 *   Browsers block audio until a user gesture. We call `resumeContext()`
 *   from the first click (MainMenu Play button) before `playMusic`.
 */

const LS_KEY = 'tinyKingdom.audio';

const DEFAULTS = {
  musicVolume: 0.5,
  sfxVolume: 0.7,
  muted: false
};

const SFX_LIMITS = {
  'villager-action': 3,
  'guard-action':    4,
  'collect-wood':    3,
  'collect-food':    3
  // upgrade, level-up, collect-gold → unlimited (omit → no cap)
};

const SFX_INTERNAL_VOL = 0.8; // headroom so overlaps don't clip
const FRAME_SFX_THROTTLE = 3; // max sfx triggered per animation frame

const PEACEFUL_KEYS = ['theme-normal', 'ambient-layer'];
const COMBAT_KEY = 'theme-attack';

const PEACEFUL_FADE_IN_MS_INITIAL  = 400;   // first-ever peaceful track
const PEACEFUL_FADE_IN_MS_NATURAL  = 400;   // peaceful → peaceful (track ended)
const FADE_PEACEFUL_TO_COMBAT_MS   = 1500;  // quick: danger approaching
const FADE_COMBAT_TO_PEACEFUL_MS   = 3000;  // slow: relief

class AudioManagerImpl {
  constructor() {
    this.scene = null;                // Phaser scene used for adding sounds/tweens
    this.currentMusic = null;         // { key, sound }
    this.activeSfx = new Map();       // key → array of active Phaser.Sound
    this._framesfxCount = 0;
    this._framesfxFrame = 0;
    this._listeners = new Set();

    this._settings = this._loadSettings();
    this._blurMuted = false;          // auto-muted because tab lost focus
    this._fullyMuted = false;

    // Music state (D-012)
    this._musicState = 'off';         // 'off' | 'peaceful' | 'combat'

    // Selection-aware sfx (D-013)
    this._forceAllSfx = false;        // debug override
  }

  /* ---------------- selection-aware sfx ---------------- */

  /**
   * Fire an sfx tied to a specific unit, but only if that unit is currently
   * in the player's selection. Bypassed when `forceAllSfx` is true.
   *
   * Global "milestone" sfx (level-up, upgrade, chest collect-gold) do NOT
   * go through here — they use playSfx directly so they always fire.
   */
  playSelectionAwareSfx(key, unit, options) {
    if (this._forceAllSfx) { this.playSfx(key, options); return; }
    if (!unit || unit.destroyed) return;
    if (unit.selected) this.playSfx(key, options);
  }

  setForceAllSfx(v) { this._forceAllSfx = !!v; }
  getForceAllSfx()  { return !!this._forceAllSfx; }

  /* ---------------- setup / lifecycle ---------------- */

  attach(scene) {
    // Called from scenes that use audio. Uses the most-recent scene so
    // Phaser's sound system + tweens + time events all run there.
    this.scene = scene;
  }

  /** Browsers block audio until a user gesture. Resume context if needed. */
  async resumeContext() {
    const s = this.scene || (typeof window !== 'undefined' && window.game
      ? window.game.scene.scenes.find(sc => sc.sys.settings.active)
      : null);
    if (!s) return false;
    const ctx = s.sound && s.sound.context;
    if (!ctx) return true;
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch (e) { /* ignore */ }
    }
    return ctx.state === 'running';
  }

  /* ---------------- settings ---------------- */

  getSettings() { return { ...this._settings }; }

  setMusicVolume(v) {
    this._settings.musicVolume = _clamp01(v);
    this._saveSettings();
    this._applyMusicVolume();
    this._emit();
  }

  setSfxVolume(v) {
    this._settings.sfxVolume = _clamp01(v);
    this._saveSettings();
    this._emit();
  }

  muteAll()   { this._settings.muted = true;  this._saveSettings(); this._applyMute(); this._emit(); }
  unmuteAll() { this._settings.muted = false; this._saveSettings(); this._applyMute(); this._emit(); }
  isMuted()   { return !!this._settings.muted; }

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

  _emit() { for (const fn of this._listeners) { try { fn(this.getSettings()); } catch(e){} } }

  _loadSettings() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw);
      return {
        musicVolume: _clamp01(parsed.musicVolume ?? DEFAULTS.musicVolume),
        sfxVolume:   _clamp01(parsed.sfxVolume   ?? DEFAULTS.sfxVolume),
        muted:       !!parsed.muted
      };
    } catch { return { ...DEFAULTS }; }
  }

  _saveSettings() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(this._settings)); } catch {}
  }

  _effectiveMusicVolume() {
    if (this._fullyMuted || this._blurMuted || this._settings.muted) return 0;
    return this._settings.musicVolume;
  }
  _effectiveSfxVolume() {
    if (this._fullyMuted || this._blurMuted || this._settings.muted) return 0;
    return this._settings.sfxVolume * SFX_INTERNAL_VOL;
  }

  _applyMusicVolume() {
    if (this.currentMusic && this.currentMusic.sound && !this.currentMusic.fading) {
      this.currentMusic.sound.setVolume(this._effectiveMusicVolume());
    }
  }

  _applyMute() {
    const vol = this._effectiveMusicVolume();
    if (this.currentMusic && this.currentMusic.sound) {
      this.currentMusic.sound.setVolume(vol);
    }
    // Active sfx volumes aren't retroactively changed (they're short).
  }

  /* ---------------- pause integration ---------------- */

  pauseAll() {
    if (this.currentMusic && this.currentMusic.sound && this.currentMusic.sound.isPlaying) {
      this.currentMusic.sound.pause();
      this.currentMusic._pausedExternally = true;
    }
    for (const list of this.activeSfx.values()) {
      for (const s of list) if (s.isPlaying) { try { s.pause(); } catch {} }
    }
  }

  resumeAll() {
    if (this.currentMusic && this.currentMusic.sound && this.currentMusic._pausedExternally) {
      this.currentMusic.sound.resume();
      this.currentMusic._pausedExternally = false;
    }
    for (const list of this.activeSfx.values()) {
      for (const s of list) if (s.isPaused) { try { s.resume(); } catch {} }
    }
  }

  /* ---------------- tab blur ---------------- */

  onBlur() {
    this._blurMuted = true;
    this._applyMute();
  }
  onFocus() {
    this._blurMuted = false;
    this._applyMute();
  }

  /* ---------------- music ---------------- */

  /** Play a music track. Optional fades + loop override. */
  playMusic(key, opts = {}) {
    const s = this.scene;
    if (!s || !s.sound || !s.cache.audio.exists(key)) {
      console.warn(`[audio] music '${key}' not available`);
      return null;
    }
    const { loop = false, fadeInMs = 0, fadeOutMs = 0, volume } = opts;
    const targetVol = volume != null ? _clamp01(volume) : this._effectiveMusicVolume();

    const startNew = () => {
      const sound = s.sound.add(key, { loop, volume: fadeInMs > 0 ? 0 : targetVol });
      try { sound.play(); } catch (e) { console.warn(`[audio] playback failed for ${key}`, e); return; }
      this.currentMusic = { key, sound, fading: fadeInMs > 0 };
      if (fadeInMs > 0) {
        s.tweens.add({
          targets: sound,
          volume: targetVol,
          duration: fadeInMs,
          onComplete: () => { if (this.currentMusic) this.currentMusic.fading = false; }
        });
      }
    };

    if (this.currentMusic && this.currentMusic.sound && this.currentMusic.sound.isPlaying) {
      if (fadeOutMs > 0) {
        const old = this.currentMusic.sound;
        this.currentMusic.fading = true;
        s.tweens.add({
          targets: old,
          volume: 0,
          duration: fadeOutMs,
          onComplete: () => { try { old.stop(); old.destroy(); } catch {} }
        });
        this.currentMusic = null;
        startNew();
      } else {
        try { this.currentMusic.sound.stop(); this.currentMusic.sound.destroy(); } catch {}
        this.currentMusic = null;
        startNew();
      }
    } else {
      startNew();
    }
    return this.currentMusic ? this.currentMusic.sound : null;
  }

  /** Smooth A→B crossfade. Both tracks overlap during the fade window. */
  crossfade(fromKey, toKey, durationMs = 2000, { toLoop = false } = {}) {
    const s = this.scene;
    if (!s) return;
    const targetVol = this._effectiveMusicVolume();

    // Fade existing music out
    if (this.currentMusic && this.currentMusic.sound && this.currentMusic.sound.isPlaying) {
      const old = this.currentMusic.sound;
      this.currentMusic.fading = true;
      s.tweens.add({
        targets: old,
        volume: 0,
        duration: durationMs,
        onComplete: () => { try { old.stop(); old.destroy(); } catch {} }
      });
    }

    // Start new music at 0 and ramp up
    if (!s.cache.audio.exists(toKey)) {
      console.warn(`[audio] crossfade target '${toKey}' missing`);
      return;
    }
    const newSound = s.sound.add(toKey, { loop: toLoop, volume: 0 });
    try { newSound.play(); } catch (e) { console.warn('[audio] crossfade play failed', e); return; }
    this.currentMusic = { key: toKey, sound: newSound, fading: true };
    s.tweens.add({
      targets: newSound,
      volume: targetVol,
      duration: durationMs,
      onComplete: () => { if (this.currentMusic && this.currentMusic.sound === newSound) this.currentMusic.fading = false; }
    });
  }

  stopMusic(fadeOutMs = 0) {
    this._musicState = 'off';
    if (!this.currentMusic || !this.currentMusic.sound) return;
    const old = this.currentMusic.sound;
    this.currentMusic = null;
    if (!this.scene || fadeOutMs <= 0) {
      try { old.stop(); old.destroy(); } catch {}
      return;
    }
    this.scene.tweens.add({
      targets: old,
      volume: 0,
      duration: fadeOutMs,
      onComplete: () => { try { old.stop(); old.destroy(); } catch {} }
    });
  }

  /* ---------------- music state machine (D-012) ---------------- */

  /** 'off' | 'peaceful' | 'combat' */
  getMusicState() { return this._musicState; }

  /**
   * Transition the music to a new state. Crossfade durations follow the
   * D-012 contract: peaceful→combat is 1500ms (urgent), combat→peaceful
   * is 3000ms (relieving). Peaceful→peaceful doesn't go through here —
   * _startPeacefulTrack handles natural end-of-track rollover.
   */
  setMusicState(next) {
    if (!this.scene) return;
    if (next === this._musicState) return;
    const prev = this._musicState;
    this._musicState = next;

    if (next === 'peaceful') {
      const fadeMs = prev === 'combat' ? FADE_COMBAT_TO_PEACEFUL_MS : 0;
      this._startPeacefulTrack(fadeMs);
    } else if (next === 'combat') {
      this._startCombatTrack(prev === 'peaceful' ? FADE_PEACEFUL_TO_COMBAT_MS : 1500);
    } else if (next === 'off') {
      this.stopMusic(0);
    }
  }

  _startPeacefulTrack(fadeMs) {
    const pick = PEACEFUL_KEYS[Math.floor(Math.random() * PEACEFUL_KEYS.length)];
    if (fadeMs > 0) {
      this.crossfade(null, pick, fadeMs, { toLoop: false });
    } else {
      this.playMusic(pick, { loop: false, fadeInMs: PEACEFUL_FADE_IN_MS_INITIAL });
    }
    const sound = this.currentMusic ? this.currentMusic.sound : null;
    if (!sound) return;
    sound.once('complete', () => {
      // Natural end of a peaceful track — pick another if still peaceful.
      if (this._musicState !== 'peaceful') return;
      if (this.currentMusic && this.currentMusic.sound !== sound) return;
      this._rollPeaceful();
    });
  }

  _rollPeaceful() {
    // Peaceful → peaceful (no crossfade; short fade-in for smoothness)
    const pick = PEACEFUL_KEYS[Math.floor(Math.random() * PEACEFUL_KEYS.length)];
    this.playMusic(pick, { loop: false, fadeInMs: PEACEFUL_FADE_IN_MS_NATURAL });
    const sound = this.currentMusic ? this.currentMusic.sound : null;
    if (!sound) return;
    sound.once('complete', () => {
      if (this._musicState !== 'peaceful') return;
      if (this.currentMusic && this.currentMusic.sound !== sound) return;
      this._rollPeaceful();
    });
  }

  _startCombatTrack(fadeMs) {
    if (fadeMs > 0) {
      this.crossfade(null, COMBAT_KEY, fadeMs, { toLoop: true });
    } else {
      this.playMusic(COMBAT_KEY, { loop: true, fadeInMs: 400 });
    }
  }

  /* ---------------- sfx ---------------- */

  playSfx(key, opts = {}) {
    const s = this.scene;
    if (!s || !s.sound || !s.cache.audio.exists(key)) {
      if (key) console.warn(`[audio] sfx '${key}' unavailable`);
      return;
    }

    // Per-frame throttle across all sfx
    const currentFrame = s.game && s.game.loop ? s.game.loop.frame : 0;
    if (currentFrame !== this._framesfxFrame) {
      this._framesfxFrame = currentFrame;
      this._framesfxCount = 0;
    }
    if (this._framesfxCount >= FRAME_SFX_THROTTLE) return;
    this._framesfxCount++;

    // Per-key simultaneity cap
    const cap = SFX_LIMITS[key];
    const list = this.activeSfx.get(key) || [];
    // Drop any already-finished
    for (let i = list.length - 1; i >= 0; i--) {
      const si = list[i];
      if (!si.isPlaying && !si.isPaused) {
        try { si.destroy(); } catch {}
        list.splice(i, 1);
      }
    }
    if (cap && list.length >= cap) {
      const oldest = list.shift();
      try { oldest.stop(); oldest.destroy(); } catch {}
    }

    const pitch = opts.pitch != null ? opts.pitch : 1;
    const vol = opts.volume != null ? opts.volume : this._effectiveSfxVolume();
    const sound = s.sound.add(key, {
      volume: vol,
      rate: pitch
    });
    try { sound.play(); } catch (e) { console.warn('[audio] sfx play failed', e); return; }

    list.push(sound);
    this.activeSfx.set(key, list);

    sound.once('complete', () => {
      const idx = list.indexOf(sound);
      if (idx >= 0) list.splice(idx, 1);
      try { sound.destroy(); } catch {}
    });
  }
}

export const AudioManager = new AudioManagerImpl();

if (typeof window !== 'undefined') {
  window.audioDebug = window.audioDebug || {};
  Object.defineProperty(window.audioDebug, 'forceAllSfx', {
    get() { return AudioManager.getForceAllSfx(); },
    set(v) { AudioManager.setForceAllSfx(!!v); },
    enumerable: true,
    configurable: true
  });
}

/* ---------------- back-compat shim (Prompt 9 stub API) ---------------- */

/** Legacy: `audio.play(key)` — routes to the new playSfx. */
export function play(key)          { AudioManager.playSfx(key); }
export function registerAudio(s)   { AudioManager.attach(s); }
export function setMuted(m)        { m ? AudioManager.muteAll() : AudioManager.unmuteAll(); }
export function isMuted()          { return AudioManager.isMuted(); }
export function setMusicMuted(m)   { /* no-op: unified mute now */ m ? AudioManager.muteAll() : AudioManager.unmuteAll(); }
export function isMusicMuted()     { return AudioManager.isMuted(); }
export function toggleAllMuted()   { AudioManager.isMuted() ? AudioManager.unmuteAll() : AudioManager.muteAll(); }
export function onMuteChange(fn)   { return AudioManager.onChange(fn); }

/* ---------------- util ---------------- */

function _clamp01(v) {
  if (typeof v !== 'number' || Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
