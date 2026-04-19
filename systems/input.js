/**
 * Lightweight double-click detector.
 *
 * Each pointerup passes through `register(time, key)`:
 *   - `time` is the timestamp of the click (typically `scene.time.now`).
 *   - `key` is a stable identifier for what was clicked (e.g. "unit:v3",
 *     "tile:12,7"). Distinct keys produce distinct single-clicks even if
 *     they fall within the window.
 *
 * Returns `true` if this click completes a double-click (same key as the
 * previous click, within `windowMs`). Returns `false` otherwise.
 *
 * Works with Phaser's pointer events (no MouseEvent coupling) so it stays
 * usable if touch input is added later.
 */
export class DoubleClickDetector {
  constructor({ windowMs = 350 } = {}) {
    this.windowMs = windowMs;
    this._last = null;
  }

  register(time, key) {
    if (!key) { this._last = null; return false; }
    if (this._last && this._last.key === key && (time - this._last.time) <= this.windowMs) {
      this._last = null;
      return true;
    }
    this._last = { time, key };
    return false;
  }

  reset() {
    this._last = null;
  }
}
