/**
 * cameraUtils.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure math utilities for the cinematic camera system.
 * No React, no DOM — purely deterministic functions.
 */

// ─── Easing library ───────────────────────────────────────────────────────────

export const Easing = {
  linear:      t => t,
  easeIn:      t => t * t,
  easeOut:     t => t * (2 - t),
  easeInOut:   t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: t => t * t * t,
  easeOutCubic:t => (--t) * t * t + 1,
  easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  // Cinematic curves — slightly over-shoot then settle
  cinematic:   t => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  // Smooth bezier-like curve used by VideoScribe
  smoothStep:  t => t * t * (3 - 2 * t),
  smootherStep:t => t * t * t * (t * (t * 6 - 15) + 10),
  // Spring-like overshoot
  spring:      t => {
    const c = 2 * Math.PI / 3;
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c) + 1;
  },
};

export const EASING_NAMES = Object.keys(Easing);

/**
 * Resolve an easing name to a function
 * @param {string|Function} easing
 */
export function resolveEasing(easing) {
  if (typeof easing === 'function') return easing;
  return Easing[easing] ?? Easing.easeInOut;
}

// ─── Camera state type ────────────────────────────────────────────────────────

/**
 * @typedef {{ x: number, y: number, zoom: number, rotation: number }} CameraState
 */

/** Default/identity camera state */
export const CAMERA_IDENTITY = { x: 0, y: 0, zoom: 1, rotation: 0 };

// ─── Interpolation ────────────────────────────────────────────────────────────

/**
 * Linearly interpolate between two camera states.
 * @param {CameraState} a
 * @param {CameraState} b
 * @param {number}      t  0–1 raw progress
 * @param {string|Function} easing
 * @returns {CameraState}
 */
export function lerpCamera(a, b, t, easing = 'easeInOut') {
  const easedT = resolveEasing(easing)(Math.max(0, Math.min(1, t)));
  return {
    x:        a.x        + (b.x        - a.x)        * easedT,
    y:        a.y        + (b.y        - a.y)        * easedT,
    zoom:     a.zoom     + (b.zoom     - a.zoom)     * easedT,
    rotation: a.rotation + (b.rotation - a.rotation) * easedT,
  };
}

/**
 * Smooth-damp interpolation — like Unity's SmoothDamp.
 * Returns { value, velocity } for each axis.
 */
export function smoothDamp(current, target, velocity, smoothTime, deltaTime, maxSpeed = Infinity) {
  const omega = 2 / smoothTime;
  const x = omega * deltaTime;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = current - target;
  const originalTo = target;
  const maxChange = maxSpeed * smoothTime;
  change = Math.max(-maxChange, Math.min(maxChange, change));
  const adjustedTarget = current - change;
  const temp = (velocity + omega * change) * deltaTime;
  let newVelocity = (velocity - omega * temp) * exp;
  let output = adjustedTarget + (change + temp) * exp;
  if ((originalTo - current > 0) === (output > originalTo)) {
    output = originalTo;
    newVelocity = (output - originalTo) / deltaTime;
  }
  return { value: output, velocity: newVelocity };
}

// ─── Viewport transform math ──────────────────────────────────────────────────

const CANVAS_W = 800;
const CANVAS_H = 450;

/**
 * Compute the CSS transform string for a given camera state.
 *
 * We treat cam.x / cam.y as "how many world pixels the viewport has panned",
 * and cam.zoom as the magnification centred on the canvas centre.
 *
 * Transform pipeline (applied right-to-left by CSS):
 *   1. translate to bring canvas centre to origin
 *   2. scale
 *   3. rotate
 *   4. translate back + apply camera pan
 *
 * @param {CameraState} cam
 * @returns {string} CSS transform
 */
export function cameraToTransform(cam) {
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  // Translate so the zoom/rotate pivot is at canvas centre,
  // then apply camera pan (negated because panning right moves content left).
  const tx = cx - cam.zoom * (cx + cam.x);
  const ty = cy - cam.zoom * (cy + cam.y);
  if (cam.rotation !== 0) {
    return `translate(${tx}px, ${ty}px) scale(${cam.zoom}) rotate(${cam.rotation}deg)`;
  }
  return `translate(${tx}px, ${ty}px) scale(${cam.zoom})`;
}

/**
 * Convert screen (canvas-relative) coordinates to world coordinates.
 * @param {number} sx screen x
 * @param {number} sy screen y
 * @param {CameraState} cam
 * @returns {{ x: number, y: number }}
 */
export function screenToWorld(sx, sy, cam) {
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  // Inverse of cameraToTransform
  const wx = (sx - cx) / cam.zoom + cx + cam.x;
  const wy = (sy - cy) / cam.zoom + cy + cam.y;
  return { x: wx, y: wy };
}

/**
 * Convert world coordinates to screen (canvas-relative) coordinates.
 * @param {number} wx world x
 * @param {number} wy world y
 * @param {CameraState} cam
 * @returns {{ x: number, y: number }}
 */
export function worldToScreen(wx, wy, cam) {
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  const sx = (wx - cx - cam.x) * cam.zoom + cx;
  const sy = (wy - cy - cam.y) * cam.zoom + cy;
  return { x: sx, y: sy };
}

// ─── Auto-focus math ──────────────────────────────────────────────────────────

/**
 * Compute camera state to focus on a bounding box with some padding.
 * @param {{ x, y, width, height }} bbox  world-space bounding box
 * @param {number} padding  padding fraction (0–1), default 0.15
 * @returns {CameraState}
 */
export function focusBBox(bbox, padding = 0.15) {
  const padW = bbox.width  * padding;
  const padH = bbox.height * padding;
  const targetW = bbox.width  + padW * 2;
  const targetH = bbox.height + padH * 2;

  const zoomX = CANVAS_W / targetW;
  const zoomY = CANVAS_H / targetH;
  const zoom  = Math.min(zoomX, zoomY, 3); // cap at 3x

  const cx = bbox.x + bbox.width  / 2;
  const cy = bbox.y + bbox.height / 2;

  // Camera offset so world centre maps to canvas centre
  const x = cx - CANVAS_W / 2;
  const y = cy - CANVAS_H / 2;

  return { x, y, zoom, rotation: 0 };
}

/**
 * Compute camera state that fits ALL objects into view.
 * @param {Array<{ x, y, width, height }>} objects
 */
export function fitAllObjects(objects) {
  if (!objects || objects.length === 0) return CAMERA_IDENTITY;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const o of objects) {
    minX = Math.min(minX, o.x);
    minY = Math.min(minY, o.y);
    maxX = Math.max(maxX, o.x + (o.width  ?? 0));
    maxY = Math.max(maxY, o.y + (o.height ?? 0));
  }
  return focusBBox({ x: minX, y: minY, width: maxX - minX, height: maxY - minY }, 0.1);
}

// ─── Keyframe evaluation ──────────────────────────────────────────────────────

/**
 * Evaluate camera position from a list of keyframes at a given time.
 * @param {Array<CameraKeyframe>} keyframes  sorted by startTime
 * @param {number} t  time in seconds
 * @returns {CameraState}
 */
export function evaluateCameraKeyframes(keyframes, t) {
  if (!keyframes || keyframes.length === 0) return CAMERA_IDENTITY;

  // Single keyframe: animate FROM identity TO that keyframe's position.
  // startTime is the arrival time; before it we interpolate from CAMERA_IDENTITY.
  if (keyframes.length === 1) {
    const kf = keyframes[0];
    // If keyframe is at t=0 or we've passed it, just return it
    if (kf.startTime <= 0 || t >= kf.startTime) return kf;
    const segT = t / kf.startTime;
    return lerpCamera(CAMERA_IDENTITY, kf, segT, kf.easing ?? 'cinematic');
  }

  const first = keyframes[0];
  const last  = keyframes[keyframes.length - 1];

  // Before the first keyframe: animate CAMERA_IDENTITY -> first keyframe
  if (t <= first.startTime) {
    if (first.startTime <= 0) return first;
    const segT = t / first.startTime;
    return lerpCamera(CAMERA_IDENTITY, first, segT, first.easing ?? 'cinematic');
  }

  // Past the last keyframe: hold
  if (t >= last.startTime) return last;

  // Between two adjacent keyframes
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (t >= a.startTime && t <= b.startTime) {
      const segDuration = b.startTime - a.startTime;
      const segT = segDuration > 0 ? (t - a.startTime) / segDuration : 1;
      return lerpCamera(a, b, segT, b.easing ?? 'cinematic');
    }
  }

  return last;
}

// ─── Viewport bounds ──────────────────────────────────────────────────────────

/**
 * Compute the visible world-space rectangle for a camera state.
 * @param {CameraState} cam
 * @returns {{ x, y, width, height }}
 */
export function getViewportBounds(cam) {
  const w = CANVAS_W / cam.zoom;
  const h = CANVAS_H / cam.zoom;
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  const worldCX = cx + cam.x;
  const worldCY = cy + cam.y;
  return {
    x:      worldCX - w / 2,
    y:      worldCY - h / 2,
    width:  w,
    height: h,
  };
}

/**
 * Clamp camera so viewport doesn't go too far outside the canvas bounds.
 * @param {CameraState} cam
 * @param {number} margin  extra world-space pixels allowed outside
 */
export function clampCamera(cam, margin = 400) {
  const bounds = getViewportBounds(cam);
  let { x, y } = cam;

  const minWorldX = -margin;
  const minWorldY = -margin;
  const maxWorldX = CANVAS_W + margin - bounds.width;
  const maxWorldY = CANVAS_H + margin - bounds.height;

  if (bounds.x < minWorldX) x += minWorldX - bounds.x;
  if (bounds.y < minWorldY) y += minWorldY - bounds.y;
  if (bounds.x > maxWorldX) x += maxWorldX - bounds.x;
  if (bounds.y > maxWorldY) y += maxWorldY - bounds.y;

  return { ...cam, x, y };
}
