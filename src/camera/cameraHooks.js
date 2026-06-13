/**
 * cameraHooks.js
 * ─────────────────────────────────────────────────────────────────────────────
 * React hooks that bridge the CameraEngine singleton to React components.
 * Designed to minimise re-renders — state is kept in refs where possible.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { cameraEngine } from './cameraEngine';
import { focusBBox, fitAllObjects, CAMERA_IDENTITY, cameraToTransform } from './cameraUtils';

const CANVAS_W = 800;
const CANVAS_H = 450;

// ─── useCamera ────────────────────────────────────────────────────────────────

/**
 * Subscribe to the camera engine and get the current camera state.
 * Re-renders on every frame — use only in the camera transform layer.
 */
export function useCameraState() {
  const [state, setState] = useState(() => ({ ...cameraEngine.state }));

  useEffect(() => {
    // Subscribe to engine updates
    const unsub = cameraEngine.subscribe(newState => setState({ ...newState }));
    // Ensure loop is running
    cameraEngine.start();
    return () => {
      unsub();
    };
  }, []);

  return state;
}

/**
 * Get the CSS transform string directly — avoids object allocation in render.
 * Writes the transform to a ref instead of triggering re-renders.
 */
export function useCameraTransform(layerRef) {
  useEffect(() => {
    let mounted = true;
    const unsub = cameraEngine.subscribe(state => {
      // Guard: skip if unmounted or if ref has been detached
      if (!mounted || !layerRef.current) return;
      layerRef.current.style.transform       = cameraToTransform(state);
      layerRef.current.style.transformOrigin = '0 0'; // math already handles pivot
    });
    cameraEngine.start();
    return () => {
      mounted = false;
      unsub();
    };
  }, [layerRef]);
}

// ─── useCameraControls ────────────────────────────────────────────────────────

/**
 * Exposes the full camera control API to components.
 */
export function useCameraControls() {
  const animateTo = useCallback((target, duration, easing) => {
    cameraEngine.animateTo(target, duration, easing);
  }, []);

  const set = useCallback((state) => {
    cameraEngine.set(state);
  }, []);

  const resetCamera = useCallback(() => {
    cameraEngine.animateTo(CAMERA_IDENTITY, 0.6, 'easeInOut');
  }, []);

  const zoomIn = useCallback(() => {
    const next = Math.min(cameraEngine.state.zoom * 1.25, 4);
    cameraEngine.animateTo({ ...cameraEngine.state, zoom: next }, 0.3, 'easeOut');
  }, []);

  const zoomOut = useCallback(() => {
    const next = Math.max(cameraEngine.state.zoom / 1.25, 0.2);
    cameraEngine.animateTo({ ...cameraEngine.state, zoom: next }, 0.3, 'easeOut');
  }, []);

  const focusObject = useCallback((graphic, padding = 0.2) => {
    const cam = focusBBox(
      { x: graphic.x, y: graphic.y, width: graphic.width ?? 120, height: graphic.height ?? 120 },
      padding
    );
    cameraEngine.animateTo(cam, 0.7, 'cinematic');
  }, []);

  const fitScene = useCallback((graphics) => {
    if (!graphics || graphics.length === 0) {
      cameraEngine.animateTo(CAMERA_IDENTITY, 0.6, 'easeInOut');
      return;
    }
    const cam = fitAllObjects(graphics);
    cameraEngine.animateTo(cam, 0.7, 'easeInOut');
  }, []);

  const pan = useCallback((dx, dy) => {
    cameraEngine.set({
      ...cameraEngine.state,
      x: cameraEngine.state.x + dx / cameraEngine.state.zoom,
      y: cameraEngine.state.y + dy / cameraEngine.state.zoom,
    });
  }, []);

  return { animateTo, set, resetCamera, zoomIn, zoomOut, focusObject, fitScene, pan };
}

// ─── useCameraKeyframes ────────────────────────────────────────────────────────

/**
 * Manages scene-level camera keyframes in sync with the project store.
 */
export function useCameraKeyframes(keyframes) {
  useEffect(() => {
    cameraEngine.setKeyframes(keyframes ?? []);
  }, [keyframes]);

  const play = useCallback((startTimeS = 0) => {
    cameraEngine.playKeyframes(cameraEngine._keyframes, startTimeS);
  }, []);

  const pause = useCallback(() => {
    cameraEngine.pauseKeyframes();
  }, []);

  const stop = useCallback(() => {
    cameraEngine.stopKeyframes();
    cameraEngine.animateTo(CAMERA_IDENTITY, 0.4, 'easeOut');
  }, []);

  const scrub = useCallback((timeS) => {
    cameraEngine.scrubTo(timeS);
  }, []);

  return { play, pause, stop, scrub };
}

// ─── useCameraPlayback ────────────────────────────────────────────────────────

/**
 * Synchronise camera playback with the overall animation playing state.
 * @param {boolean}              playing          — global playing flag
 * @param {CameraKeyframe[]}     keyframes        — from scene/store
 * @param {React.MutableRefObject} playStartRef   — ref whose .current is performance.now() when play began
 */
export function useCameraPlayback(playing, keyframes, playStartRef) {
  const wasPlayingRef = useRef(false);

  useEffect(() => {
    if (playing && !wasPlayingRef.current) {
      wasPlayingRef.current = true;
      if (keyframes && keyframes.length > 0) {
        // Always start from t=0 — the playStartRef marks when play began,
        // so we compute how far into the animation we already are.
        // Use a tiny clamp to avoid negative offsets due to scheduling lag.
        const playStartTime = playStartRef?.current ?? performance.now();
        const offsetS = Math.max(0, (performance.now() - playStartTime) / 1000);
        cameraEngine.playKeyframes(keyframes, offsetS);
      } else {
        // No keyframes — reset camera so preview starts from a clean state
        cameraEngine.set(CAMERA_IDENTITY);
      }
    } else if (!playing && wasPlayingRef.current) {
      wasPlayingRef.current = false;
      cameraEngine.stopKeyframes();
      cameraEngine.set(CAMERA_IDENTITY);   // snap back instantly so next play starts fresh
    }
  }, [playing, keyframes, playStartRef]);
}

// ─── useWheelZoom ─────────────────────────────────────────────────────────────

/**
 * Attach mouse-wheel zoom + pan to a container element.
 * Zoom is centred on the cursor position.
 */
export function useWheelZoom(containerRef) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e) => {
      e.preventDefault();

      const rect  = el.getBoundingClientRect();
      const cam   = cameraEngine.state;

      // Cursor in canvas space (unscaled)
      const scaleRatio = CANVAS_W / rect.width;
      const cursorX    = (e.clientX - rect.left) * scaleRatio;
      const cursorY    = (e.clientY - rect.top)  * scaleRatio;

      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 30) {
        // Zoom — centred on cursor
        const zoomDelta = e.deltaY < 0 ? 1.1 : 0.9;
        const newZoom   = Math.max(0.15, Math.min(5, cam.zoom * zoomDelta));

        // Adjust pan so the point under cursor stays fixed
        const wx = cursorX / cam.zoom + cam.x;
        const wy = cursorY / cam.zoom + cam.y;
        const newX = wx - cursorX / newZoom;
        const newY = wy - cursorY / newZoom;

        cameraEngine.set({ x: newX, y: newY, zoom: newZoom, rotation: cam.rotation });
      } else {
        // Pan
        const panX = e.deltaX / cam.zoom;
        const panY = e.deltaY / cam.zoom;
        cameraEngine.set({ ...cam, x: cam.x + panX, y: cam.y + panY });
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [containerRef]);
}