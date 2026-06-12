/**
 * cameraEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A zero-React, zero-DOM cinematic camera engine built around requestAnimationFrame.
 *
 * Design principles:
 *  • All mutation happens via imperative calls — no React state updates in the loop
 *  • The loop runs at 60 fps; callers subscribe to get notified each tick
 *  • Supports: keyframe playback, smooth target-following, free manual control
 */

import {
  CAMERA_IDENTITY,
  lerpCamera,
  evaluateCameraKeyframes,
  smoothDamp,
  clampCamera,
} from './cameraUtils';

export class CameraEngine {
  constructor() {
    // ── Current rendered state ───────────────────────────────────────────────
    this.state = { ...CAMERA_IDENTITY };

    // ── Animation target (for smooth-follow mode) ────────────────────────────
    this._target    = { ...CAMERA_IDENTITY };
    this._velocity  = { x: 0, y: 0, zoom: 0, rotation: 0 };

    // ── Keyframe playback ────────────────────────────────────────────────────
    this._keyframes   = [];          // sorted CameraKeyframe[]
    this._playStartMs = null;        // performance.now() when play started
    this._playOffsetS = 0;           // seconds offset (for resume / scrub)
    this._isPlaying   = false;

    // ── RAF ──────────────────────────────────────────────────────────────────
    this._rafId      = null;
    this._lastFrameMs = null;

    // ── Subscribers ──────────────────────────────────────────────────────────
    this._listeners  = new Set();

    // ── Mode: 'free' | 'follow' | 'keyframe' ────────────────────────────────
    this._mode = 'free';

    // ── Smooth-follow settings ───────────────────────────────────────────────
    this._smoothTime = 0.35; // seconds — lower = snappier
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Subscribe to per-frame camera state updates */
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /** Start the animation loop */
  start() {
    if (this._rafId !== null) return;
    this._lastFrameMs = performance.now();
    this._tick();
  }

  /** Stop the animation loop */
  stop() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /** Immediately set camera state (no animation) */
  set(state) {
    this.state      = { ...this.state, ...state };
    this._target    = { ...this.state };
    this._velocity  = { x: 0, y: 0, zoom: 0, rotation: 0 };
    // Cancel any in-progress animation so the tick loop doesn't overwrite this state
    this._mode      = 'free';
    this._animFrom  = null;
    this._animStartMs = null;
    this._notify();
  }

  /** Smoothly animate to a target state */
  animateTo(target, durationS = 0.8, easing = 'cinematic') {
    this._mode = 'follow';
    this._target = { ...this.state, ...target };
    this._animFrom     = { ...this.state };
    this._animDuration = durationS;
    this._animEasing   = easing;
    this._animStartMs  = performance.now();
    this._velocity = { x: 0, y: 0, zoom: 0, rotation: 0 };
  }

  /** Begin keyframe playback from a given time offset */
  playKeyframes(keyframes, startTimeS = 0) {
    this._keyframes   = [...keyframes].sort((a, b) => a.startTime - b.startTime);
    this._playOffsetS = startTimeS;
    this._playStartMs = performance.now();
    this._isPlaying   = true;
    this._mode        = 'keyframe';
  }

  /** Pause keyframe playback */
  pauseKeyframes() {
    if (!this._isPlaying) return;
    this._isPlaying   = false;
    this._playOffsetS = this._currentPlayTimeS();
    this._playStartMs = null;
  }

  /** Stop and reset keyframe playback */
  stopKeyframes() {
    this._isPlaying   = false;
    this._keyframes   = [];
    this._playStartMs = null;
    this._playOffsetS = 0;
    this._mode = 'free';
  }

  /** Scrub to a specific time without playing */
  scrubTo(timeS) {
    if (this._keyframes.length === 0) return;
    this._playOffsetS = timeS;
    this._playStartMs = this._isPlaying ? performance.now() : null;
    const state = evaluateCameraKeyframes(this._keyframes, timeS);
    this.state   = { ...state };
    this._target = { ...state };
    this._notify();
  }

  /** Update smooth-follow time constant (lower = snappier) */
  setSmoothTime(t) {
    this._smoothTime = Math.max(0.05, t);
  }

  /** Set keyframes without starting playback (for editing) */
  setKeyframes(keyframes) {
    this._keyframes = [...keyframes].sort((a, b) => a.startTime - b.startTime);
  }

  /** Get current playback time in seconds */
  getCurrentTimeS() {
    return this._currentPlayTimeS();
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  _currentPlayTimeS() {
    if (!this._isPlaying || this._playStartMs === null) return this._playOffsetS;
    return this._playOffsetS + (performance.now() - this._playStartMs) / 1000;
  }

  _tick() {
    const now    = performance.now();
    const dtMs   = now - (this._lastFrameMs ?? now);
    const dtS    = Math.min(dtMs / 1000, 0.05); // cap at 50ms to avoid jumps
    this._lastFrameMs = now;

    switch (this._mode) {
      case 'keyframe':
        this._tickKeyframe();
        break;
      case 'follow':
        this._tickFollow(now, dtS);
        break;
      default:
        break;
    }

    this._rafId = requestAnimationFrame(() => this._tick());
  }

  _tickKeyframe() {
    if (!this._isPlaying && this._keyframes.length === 0) return;
    const t     = this._currentPlayTimeS();
    const state = evaluateCameraKeyframes(this._keyframes, t);
    this.state  = clampCamera(state);
    this._notify();
  }

  _tickFollow(now, dtS) {
    if (!this._animFrom || !this._animStartMs) {
      // Legacy smooth-damp path
      const { value: nx, velocity: vx } = smoothDamp(this.state.x,    this._target.x,    this._velocity.x,    this._smoothTime, dtS);
      const { value: ny, velocity: vy } = smoothDamp(this.state.y,    this._target.y,    this._velocity.y,    this._smoothTime, dtS);
      const { value: nz, velocity: vz } = smoothDamp(this.state.zoom, this._target.zoom, this._velocity.zoom, this._smoothTime, dtS);
      const { value: nr, velocity: vr } = smoothDamp(this.state.rotation, this._target.rotation, this._velocity.rotation, this._smoothTime, dtS);
      this._velocity = { x: vx, y: vy, zoom: vz, rotation: vr };
      this.state = clampCamera({ x: nx, y: ny, zoom: nz, rotation: nr });
      this._notify();
      return;
    }

    // Duration-based lerp with easing
    const elapsed = (now - this._animStartMs) / 1000;
    const t       = Math.min(elapsed / (this._animDuration ?? 0.8), 1);
    this.state    = clampCamera(lerpCamera(this._animFrom, this._target, t, this._animEasing));
    this._notify();

    if (t >= 1) {
      this._animFrom    = null;
      this._animStartMs = null;
      this._mode        = 'free';
    }
  }

  _notify() {
    for (const fn of this._listeners) fn({ ...this.state });
  }

  destroy() {
    this.stop();
    this._listeners.clear();
  }
}

// Singleton instance shared across the app (one canvas, one camera)
export const cameraEngine = new CameraEngine();