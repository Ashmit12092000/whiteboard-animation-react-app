import { create } from 'zustand';
import { produce } from 'immer';
import { createProject, createScene, createDrawingModel, createTextModel, createImageModel, cloneScene } from '../models';
import { createCameraSlice } from '../camera/cameraStore';
import { cameraEngine } from '../camera/cameraEngine';
import { CAMERA_IDENTITY } from '../camera/cameraUtils';

// ─── Undo/Redo history helpers ────────────────────────────────────────────────
const MAX_HISTORY = 50;

// Smallest allowed duration for any graphic's draw clip. Mirrors MIN_DUR used
// by the timeline track resize handles — kept here so every code path that
// can change a graphic's duration (slider, inputs, timeline drag, split)
// agrees on the same floor.
export const MIN_GRAPHIC_DURATION = 0.1;

function pushHistory(state) {
  const snapshot = JSON.stringify(state.project);
  const newUndo = [...state.undoStack, snapshot].slice(-MAX_HISTORY);
  return { undoStack: newUndo, redoStack: [] };
}

// ─── Persistence helpers ──────────────────────────────────────────────────────
const STORAGE_KEY = 'opendoodler_projects';

function loadPersistedProjects() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistProjects(projects) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch { /* quota exceeded, ignore */ }
}

// ─── Store ────────────────────────────────────────────────────────────────────
export const useStore = create((set, get) => ({
  // ── Camera system ─────────────────────────────────────────────────────────
  ...createCameraSlice(set, get),
  // ── Navigation ──────────────────────────────────────────────────────────────
  view: 'launch', // 'launch' | 'editor'

  // ── Projects list (launch screen) ───────────────────────────────────────────
  recentProjects: loadPersistedProjects(),

  // ── Active editor state ──────────────────────────────────────────────────────
  project: null,
  selectedSceneId: null,
  selectedGraphicId: null,
  selectedCameraKeyframeId: null,
  redoStack: [],

  // ── UI state ─────────────────────────────────────────────────────────────────
  showPreviewModal: false,
  showCanvasPreview: false,
  showNewProjectModal: false,

  // ── Playhead (shared between timeline and canvas) ─────────────────────────
  playheadTime: 0, // seconds

  // ── Grid & snap ───────────────────────────────────────────────────────────────
  // showGrid:   whether the visual grid overlay is visible
  // snapToGrid: whether drag/resize positions are snapped to grid intersections
  // gridSize:   world-space pixels between grid lines (20 | 40 | 80)
  // gridType:   'lines' | 'dots'
  showGrid:   false,
  snapToGrid: false,
  gridSize:   40,
  gridType:   'lines',
  showSceneSettingsModal: false,
  showProjectSettingsModal: false,
  toast: null, // { message, type }

  // ── Derived helpers ──────────────────────────────────────────────────────────
  getSelectedScene() {
    const { project, selectedSceneId } = get();
    if (!project) return null;
    return project.scenes.find(s => s.id === selectedSceneId) ?? project.scenes[0] ?? null;
  },

  getSelectedGraphic() {
    const scene = get().getSelectedScene();
    if (!scene) return null;
    return scene.graphics.find(g => g.id === get().selectedGraphicId) ?? null;
  },

  // ── Navigation ───────────────────────────────────────────────────────────────
  navigateTo(view) {
    set({ view });
  },

  // ── Toast ────────────────────────────────────────────────────────────────────
  showToast(message, type = 'success') {
    set({ toast: { message, type } });
    setTimeout(() => set({ toast: null }), 2500);
  },

  // ── Project CRUD ─────────────────────────────────────────────────────────────
  createNewProject(title, boardType, canvasSizeKey) {
    const p = createProject(title, boardType, canvasSizeKey);
    const updated = [p, ...get().recentProjects];
    persistProjects(updated);
    cameraEngine.set({ ...CAMERA_IDENTITY });
    set({
      recentProjects: updated,
      project: JSON.parse(JSON.stringify(p)),
      selectedSceneId: p.scenes[0].id,
      selectedGraphicId: null,
      undoStack: [],
      redoStack: [],
      view: 'editor',
      showNewProjectModal: false,
    });
  },

  openProject(projectId) {
    const p = get().recentProjects.find(r => r.id === projectId);
    if (!p) return;
    cameraEngine.set({ ...CAMERA_IDENTITY });
    set({
      project: JSON.parse(JSON.stringify(p)),
      selectedSceneId: p.scenes[0]?.id ?? null,
      selectedGraphicId: null,
      undoStack: [],
      redoStack: [],
      view: 'editor',
    });
  },

  deleteRecentProject(projectId) {
    const updated = get().recentProjects.filter(p => p.id !== projectId);
    persistProjects(updated);
    set({ recentProjects: updated });
  },

  saveProject() {
    const { project, recentProjects } = get();
    if (!project) return;
    const saved = { ...project, modifiedOn: new Date().toISOString() };
    const idx = recentProjects.findIndex(p => p.id === saved.id);
    let updated;
    if (idx >= 0) {
      updated = [...recentProjects];
      updated[idx] = saved;
    } else {
      updated = [saved, ...recentProjects];
    }
    persistProjects(updated);
    set({ recentProjects: updated, project: saved });
    get().showToast('Project saved ✓');
  },

  saveProjectAsJson() {
    const { project } = get();
    if (!project) return;
    const saved = { ...project, modifiedOn: new Date().toISOString() };
    const json = JSON.stringify(saved, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${saved.title.replace(/[^a-z0-9]/gi, '_')}.odp.json`;
    a.click();
    URL.revokeObjectURL(url);
    get().showToast('Exported as JSON ✓');
  },

  loadProjectFromJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const project = JSON.parse(e.target.result);
        if (!project.id || !project.scenes) throw new Error('Invalid project file');
        // Merge into recentProjects (replace if same id, otherwise prepend)
        const { recentProjects } = get();
        const idx = recentProjects.findIndex(p => p.id === project.id);
        let updated;
        if (idx >= 0) { updated = [...recentProjects]; updated[idx] = project; }
        else updated = [project, ...recentProjects];
        persistProjects(updated);
        cameraEngine.set({ ...CAMERA_IDENTITY });
        set({
          recentProjects: updated,
          project: JSON.parse(JSON.stringify(project)),
          selectedSceneId: project.scenes[0]?.id ?? null,
          selectedGraphicId: null,
          undoStack: [],
          redoStack: [],
          view: 'editor',
        });
        get().showToast('Project loaded ✓');
      } catch {
        get().showToast('Invalid project file ✗', 'error');
      }
    };
    reader.readAsText(file);
  },

  closeProject() {
    set({ view: 'launch', project: null, selectedSceneId: null, selectedGraphicId: null });
  },

  updateProjectSettings(changes) {
    set(state => produce(state, draft => {
      Object.assign(draft.project, changes);
    }));
  },

  addCustomHand(hand) {
    set(state => produce(state, draft => {
      if (!draft.project.customHands) draft.project.customHands = [];
      draft.project.customHands.push(hand);
    }));
  },

  removeCustomHand(handId) {
    set(state => produce(state, draft => {
      if (!draft.project.customHands) return;
      draft.project.customHands = draft.project.customHands.filter(h => h.id !== handId);
      // Fall back to default hand if the removed one was selected
      if (draft.project.handId === handId) {
        draft.project.handId = 'hand_pencil_svg';
        draft.project.handConfig = { scale: 1, rotation: 0, flipX: false, offsetX: 0, offsetY: 0 };
      }
    }));
  },

  // ── Undo / Redo ──────────────────────────────────────────────────────────────
  _snapshot() {
    const state = get();
    return produce(state, draft => {
      const hist = pushHistory(state);
      draft.undoStack = hist.undoStack;
      draft.redoStack = hist.redoStack;
    });
  },

  undo() {
    const { undoStack, redoStack, project } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    set({
      project: JSON.parse(prev),
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, JSON.stringify(project)],
      selectedGraphicId: null,
    });
  },

  redo() {
    const { undoStack, redoStack, project } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    set({
      project: JSON.parse(next),
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, JSON.stringify(project)],
      selectedGraphicId: null,
    });
  },

  // ── Scene actions ─────────────────────────────────────────────────────────────
  selectScene(sceneId) {
    // Reset camera to default position when switching scenes
    cameraEngine.set({ ...CAMERA_IDENTITY });
    set({ selectedSceneId: sceneId, selectedGraphicId: null });
  },

  addScene() {
    set(state => {
      const hist = pushHistory(state);
      return produce({ ...state, ...hist }, draft => {
        const name = String(draft.project.scenes.length + 1);
        const s = createScene(name);
        draft.project.scenes.push(s);
        draft.selectedSceneId = s.id;
        draft.selectedGraphicId = null;
      });
    });
  },

  deleteScene(sceneId) {
    set(state => {
      if (state.project.scenes.length <= 1) return state;
      const hist = pushHistory(state);
      return produce({ ...state, ...hist }, draft => {
        const idx = draft.project.scenes.findIndex(s => s.id === sceneId);
        draft.project.scenes.splice(idx, 1);
        // Renumber
        draft.project.scenes.forEach((s, i) => { s.name = String(i + 1); });
        draft.selectedSceneId = draft.project.scenes[Math.max(0, idx - 1)]?.id ?? draft.project.scenes[0]?.id;
        draft.selectedGraphicId = null;
      });
    });
  },

  duplicateScene(sceneId) {
    set(state => {
      const hist = pushHistory(state);
      return produce({ ...state, ...hist }, draft => {
        const idx = draft.project.scenes.findIndex(s => s.id === sceneId);
        const clone = cloneScene(draft.project.scenes[idx]);
        draft.project.scenes.splice(idx + 1, 0, clone);
        draft.project.scenes.forEach((s, i) => { s.name = String(i + 1); });
        draft.selectedSceneId = clone.id;
      });
    });
  },

  moveScene(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    
    set(state => {
      const hist = pushHistory(state);
      const result = produce({ ...state, ...hist }, draft => {
        const removed = draft.project.scenes.splice(fromIdx, 1);
        draft.project.scenes.splice(toIdx, 0, removed[0]);
      });
      
      return result;
    });
  },

  updateSceneSettings(sceneId, changes) {
    set(state => {
      const hist = pushHistory(state);
      return produce({ ...state, ...hist }, draft => {
        const scene = draft.project.scenes.find(s => s.id === sceneId);
        if (scene) Object.assign(scene, changes);
      });
    });
  },

  // ── Graphic actions ────────────────────────────────────────────────────────
  selectGraphic(graphicId) {
    set({ selectedGraphicId: graphicId });
  },

  setSelectedCameraKeyframeId(keyframeId) {
    set({ selectedCameraKeyframeId: keyframeId });
  },

  addDrawingGraphic(svgAsset) {
    set(state => {
      const hist = pushHistory(state);
      return produce({ ...state, ...hist }, draft => {
        const scene = draft.project.scenes.find(s => s.id === draft.selectedSceneId)
          ?? draft.project.scenes[0];
        if (!scene) return;
        const g = createDrawingModel(svgAsset.svg, svgAsset.name, {
          x: 60 + Math.random() * 200,
          y: 60 + Math.random() * 100,
          width: 120, height: 120,
        }, svgAsset.paintFill ?? false);
        scene.graphics.push(g);
        draft.selectedGraphicId = g.id;
      });
    });
  },

  addTextGraphic({ rawText, fontFamily, fontStyle, fontWeight, fontSize, color }) {
    set(state => {
      const hist = pushHistory(state);
      return produce({ ...state, ...hist }, draft => {
        const scene = draft.project.scenes.find(s => s.id === draft.selectedSceneId)
          ?? draft.project.scenes[0];
        if (!scene) return;
        const g = createTextModel({ rawText, fontFamily, fontStyle, fontWeight, fontSize, color }, {
          x: 80 + Math.random() * 200,
          y: 100 + Math.random() * 80,
        });
        scene.graphics.push(g);
        draft.selectedGraphicId = g.id;
      });
    });
  },

  addImageGraphic({ src, name, width, height, revealEffect }) {
    set(state => {
      const hist = pushHistory(state);
      return produce({ ...state, ...hist }, draft => {
        const scene = draft.project.scenes.find(s => s.id === draft.selectedSceneId)
          ?? draft.project.scenes[0];
        if (!scene) return;
        const g = createImageModel({ src, name }, {
          x: 60 + Math.random() * 160,
          y: 60 + Math.random() * 80,
          width:  width  ?? 200,
          height: height ?? 150,
        });
        if (revealEffect) g.revealEffect = revealEffect;
        scene.graphics.push(g);
        draft.selectedGraphicId = g.id;
      });
    });
  },

  moveGraphic(graphicId, x, y) {
    set(state => produce(state, draft => {
      for (const scene of draft.project.scenes) {
        const g = scene.graphics.find(g => g.id === graphicId);
        if (g) { g.x = Math.max(0, x); g.y = Math.max(0, y); return; }
      }
    }));
  },

  resizeGraphic(graphicId, width, height, x, y) {
    set(state => produce(state, draft => {
      for (const scene of draft.project.scenes) {
        const g = scene.graphics.find(g => g.id === graphicId);
        if (g) {
          g.width  = Math.max(20, width);
          g.height = Math.max(20, height);
          if (x !== undefined) g.x = Math.max(0, x);
          if (y !== undefined) g.y = Math.max(0, y);
          return;
        }
      }
    }));
  },

  rotateGraphic(graphicId, rotation) {
    set(state => produce(state, draft => {
      for (const scene of draft.project.scenes) {
        const g = scene.graphics.find(g => g.id === graphicId);
        if (g) { g.rotation = rotation; return; }
      }
    }));
  },

  updateGraphicProps(graphicId, changes) {
    set(state => {
      const hist = pushHistory(state);
      return produce({ ...state, ...hist }, draft => {
        for (const scene of draft.project.scenes) {
          const g = scene.graphics.find(g => g.id === graphicId);
          if (g) { Object.assign(g, changes); return; }
        }
      });
    });
  },

  // Central place for any code path that changes a graphic's draw duration
  // (timeline edge-drag, Duration field, split, etc). Re-bases base_duration
  // against the CURRENT hand_speed, so the hand-speed slider keeps scaling
  // correctly from whatever duration was just set, rather than reverting to
  // a stale base_duration the next time hand_speed is touched.
  setGraphicDuration(graphicId, newDuration) {
    set(state => {
      const hist = pushHistory(state);
      return produce({ ...state, ...hist }, draft => {
        for (const scene of draft.project.scenes) {
          const g = scene.graphics.find(g => g.id === graphicId);
          if (g) {
            const hs  = g.hand_speed ?? 1.0;
            const dur = Math.max(MIN_GRAPHIC_DURATION, newDuration);
            g.duration = dur;
            g.base_duration = dur * hs;
            return;
          }
        }
      });
    });
  },

  deleteGraphic(graphicId) {
    set(state => {
      const hist = pushHistory(state);
      return produce({ ...state, ...hist }, draft => {
        const scene = draft.project.scenes.find(s => s.id === draft.selectedSceneId);
        if (!scene) return;
        const idx = scene.graphics.findIndex(g => g.id === graphicId);
        if (idx >= 0) scene.graphics.splice(idx, 1);
        draft.selectedGraphicId = null;
      });
    });
  },

  moveGraphicInList(graphicId, direction) {
    set(state => {
      const hist = pushHistory(state);
      return produce({ ...state, ...hist }, draft => {
        const scene = draft.project.scenes.find(s => s.id === draft.selectedSceneId);
        if (!scene) return;
        const idx = scene.graphics.findIndex(g => g.id === graphicId);
        const to = idx + direction;
        if (to < 0 || to >= scene.graphics.length) return;
        const [g] = scene.graphics.splice(idx, 1);
        scene.graphics.splice(to, 0, g);
      });
    });
  },

  reorderGraphic(fromIdx, toIdx) {
    set(state => {
      const hist = pushHistory(state);
      return produce({ ...state, ...hist }, draft => {
        const scene = draft.project.scenes.find(s => s.id === draft.selectedSceneId);
        if (!scene) return;
        if (fromIdx === toIdx) return;
        if (fromIdx < 0 || fromIdx >= scene.graphics.length) return;
        if (toIdx   < 0 || toIdx   >= scene.graphics.length) return;
        const [g] = scene.graphics.splice(fromIdx, 1);
        scene.graphics.splice(toIdx, 0, g);
      });
    });
  },

  duplicateGraphic(graphicId, opts = {}) {
    const { offset = true } = opts;
    let newId = null;
    set(state => {
      const hist = pushHistory(state);
      return produce({ ...state, ...hist }, draft => {
        const scene = draft.project.scenes.find(s => s.id === draft.selectedSceneId);
        if (!scene) return;
        const idx = scene.graphics.findIndex(g => g.id === graphicId);
        if (idx < 0) return;
        const src = scene.graphics[idx];
        const clone = {
          ...src,
          id: crypto.randomUUID(),
          x: offset ? src.x + 20 : src.x,
          y: offset ? src.y + 20 : src.y,
        };
        scene.graphics.splice(idx + 1, 0, clone);
        draft.selectedGraphicId = clone.id;
        newId = clone.id;
      });
    });
    return newId;
  },

  // Splits a graphic's draw clip into two equal-length consecutive clips.
  // Both halves keep the same hand_speed, with duration/base_duration
  // re-based to the halved length so the speed slider keeps working
  // correctly on either piece afterward.
  //
  // NOTE: this duplicates the whole graphic for the second half — it does
  // NOT yet split the SVG reveal itself into "first half drawn / second half
  // continues", so the second clip will redraw the full artwork again over
  // its (shorter) duration. Treat this as splitting the *timing*, not the
  // stroke-by-stroke reveal — a true reveal-range split would need each
  // renderer to accept a [from, to] progress window.
  splitGraphic(graphicId) {
    set(state => {
      const hist = pushHistory(state);
      return produce({ ...state, ...hist }, draft => {
        const scene = draft.project.scenes.find(s => s.id === draft.selectedSceneId);
        if (!scene) return;
        const idx = scene.graphics.findIndex(g => g.id === graphicId);
        if (idx < 0) return;
        const g  = scene.graphics[idx];
        const hs = g.hand_speed ?? 1.0;
        const half = Math.max(MIN_GRAPHIC_DURATION, g.duration / 2);

        g.duration = half;
        g.base_duration = half * hs;

        const clone = { ...g, id: crypto.randomUUID() };
        scene.graphics.splice(idx + 1, 0, clone);
        draft.selectedGraphicId = clone.id;
      });
    });
  },

  // ── Audio track actions ───────────────────────────────────────────────────────
  addAudioTrack(track) {
    set(state => produce(state, draft => {
      if (!draft.project.audioTracks) draft.project.audioTracks = [];
      // Strip non-serialisable audioBuffer before saving (keep for session use only)
      const { audioBuffer, ...serialisable } = track;
      draft.project.audioTracks.push(serialisable);
      // Re-attach transient buffer so the current session can use it
      draft.project.audioTracks[draft.project.audioTracks.length - 1]._audioBuffer = audioBuffer;
    }));
  },

  addTTSTrack(name, speech, duration) {
    set(state => produce(state, draft => {
      if (!draft.project.audioTracks) draft.project.audioTracks = [];
      draft.project.audioTracks.push({
        id: crypto.randomUUID(),
        name,
        type: 'tts',
        speech, // { text, lang, pitch, rate }
        duration,
        volume: 1, trimStart: 0, trimEnd: 1, fadeIn: 0, fadeOut: 0, filter: 'none', loop: false,
      });
    }));
  },

  removeAudioTrack(trackId) {
    set(state => produce(state, draft => {
      if (!draft.project.audioTracks) return;
      draft.project.audioTracks = draft.project.audioTracks.filter(t => t.id !== trackId);
    }));
  },

  updateAudioTrack(trackId, changes) {
    set(state => produce(state, draft => {
      if (!draft.project.audioTracks) return;
      const track = draft.project.audioTracks.find(t => t.id === trackId);
      if (track) {
        // Keep transient audioBuffer if caller is not trying to update it
        const { audioBuffer, ...safeChanges } = changes;
        Object.assign(track, safeChanges);
        if (audioBuffer !== undefined) track._audioBuffer = audioBuffer;
      }
    }));
  },

  // ── Playhead ──────────────────────────────────────────────────────────────────
  setPlayheadTime(t) { set({ playheadTime: t }); },

  // ── Modal toggles ─────────────────────────────────────────────────────────────
  openPreviewModal() { set({ showPreviewModal: true }); },
  closePreviewModal() { set({ showPreviewModal: false }); },
  openCanvasPreview() { set({ showCanvasPreview: true }); },
  closeCanvasPreview() { set({ showCanvasPreview: false }); },
  openNewProjectModal() { set({ showNewProjectModal: true }); },
  closeNewProjectModal() { set({ showNewProjectModal: false }); },

  // ── Grid & snap actions ───────────────────────────────────────────────────────
  toggleGrid()    { set(s => ({ showGrid: !s.showGrid })); },
  toggleSnap()    { set(s => ({ snapToGrid: !s.snapToGrid })); },
  setGridSize(n)  { set({ gridSize: n }); },
  setGridType(t)  { set({ gridType: t }); },
  openSceneSettings() { set({ showSceneSettingsModal: true }); },
  closeSceneSettings() { set({ showSceneSettingsModal: false }); },
  openProjectSettings() { set({ showProjectSettingsModal: true }); },
  closeProjectSettings() { set({ showProjectSettingsModal: false }); },
}));