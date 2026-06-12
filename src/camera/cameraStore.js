/**
 * cameraStore.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Zustand store slice for camera keyframe data.
 * Import and spread into the main store, or use standalone.
 *
 * Camera keyframes are stored per-scene: project.scenes[i].cameraKeyframes
 *
 * Each keyframe:
 * {
 *   id:        string,
 *   startTime: number,   // seconds from scene start
 *   x:         number,
 *   y:         number,
 *   zoom:      number,
 *   rotation:  number,
 *   easing:    string,   // easing name
 *   label?:    string,
 * }
 */

import { produce } from 'immer';
import { CAMERA_IDENTITY } from './cameraUtils';
import { cameraEngine } from './cameraEngine';

const uid = () => crypto.randomUUID();

export function createCameraKeyframe(overrides = {}) {
  return {
    id:        uid(),
    startTime: 0,
    ...CAMERA_IDENTITY,
    easing:    'cinematic',
    label:     '',
    ...overrides,
  };
}

/**
 * Returns the camera store actions/selectors to be spread into useStore.
 * @param {Function} set — Zustand set
 * @param {Function} get — Zustand get
 */
export function createCameraSlice(set, get) {
  return {
    // ── Selectors ────────────────────────────────────────────────────────────
    getCameraKeyframes(sceneId) {
      const { project } = get();
      if (!project) return [];
      const sid = sceneId ?? get().selectedSceneId;
      const scene = project.scenes.find(s => s.id === sid);
      return scene?.cameraKeyframes ?? [];
    },

    // ── Mutations ─────────────────────────────────────────────────────────────
    addCameraKeyframe(sceneId, keyframe) {
      set(state => produce(state, draft => {
        const scene = draft.project.scenes.find(s => s.id === sceneId);
        if (!scene) return;
        if (!scene.cameraKeyframes) scene.cameraKeyframes = [];
        const kf = createCameraKeyframe(keyframe);
        scene.cameraKeyframes.push(kf);
        scene.cameraKeyframes.sort((a, b) => a.startTime - b.startTime);
      }));
    },

    updateCameraKeyframe(sceneId, keyframeId, changes) {
      set(state => produce(state, draft => {
        const scene = draft.project.scenes.find(s => s.id === sceneId);
        if (!scene?.cameraKeyframes) return;
        const kf = scene.cameraKeyframes.find(k => k.id === keyframeId);
        if (kf) Object.assign(kf, changes);
        scene.cameraKeyframes.sort((a, b) => a.startTime - b.startTime);
      }));
    },

    deleteCameraKeyframe(sceneId, keyframeId) {
      set(state => produce(state, draft => {
        const scene = draft.project.scenes.find(s => s.id === sceneId);
        if (!scene?.cameraKeyframes) return;
        scene.cameraKeyframes = scene.cameraKeyframes.filter(k => k.id !== keyframeId);
      }));
    },

    setCameraKeyframeFromCurrentView(sceneId, timeS, label = '') {
      const camState = cameraEngine.state;
      set(s => produce(s, draft => {
        const scene = draft.project.scenes.find(sc => sc.id === sceneId);
        if (!scene) return;
        if (!scene.cameraKeyframes) scene.cameraKeyframes = [];
        const existing = scene.cameraKeyframes.find(k => Math.abs(k.startTime - timeS) < 0.05);
        if (existing) {
          Object.assign(existing, { x: camState.x, y: camState.y, zoom: camState.zoom, rotation: camState.rotation, label });
        } else {
          const kf = createCameraKeyframe({ startTime: timeS, ...camState, label });
          scene.cameraKeyframes.push(kf);
          scene.cameraKeyframes.sort((a, b) => a.startTime - b.startTime);
        }
      }));
    },

    clearCameraKeyframes(sceneId) {
      set(state => produce(state, draft => {
        const scene = draft.project.scenes.find(s => s.id === sceneId);
        if (scene) scene.cameraKeyframes = [];
      }));
    },
  };
}
