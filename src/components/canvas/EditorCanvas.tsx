// @ts-nocheck
import { useRef, useCallback, useEffect, useState } from 'react';
import { useStore } from '../../store';
import GraphicItem from './GraphicItem';
import WhiteboardHand from '../shared/WhiteboardHand';
import { getBoardStyle, getCanvasSize } from '../../utils/animation';
import CameraLayer from '../../camera/CameraLayer';
import CameraControls from '../../camera/CameraControls';
import CameraMiniMap from '../../camera/CameraMiniMap';
import CameraViewfinder from '../../camera/CameraViewfinder';
import { useCameraPlayback, useWheelZoom } from '../../camera/cameraHooks';
import { cameraEngine } from '../../camera/cameraEngine';
import CanvasGrid from './CanvasGrid';

function buildSequentialTimeline(graphics) {
  let cursor = 0;
  return graphics.map(g => {
    const delay = g.delay ?? 0;
    const seqDelay = cursor + delay;
    cursor += delay + g.duration;
    return { ...g, seqDelay };
  });
}

export default function EditorCanvas({ playing = false }) {
  const getSelectedScene   = useStore(s => s.getSelectedScene);
  const selectedGraphicId  = useStore(s => s.selectedGraphicId);
  const selectGraphic      = useStore(s => s.selectGraphic);
  const project            = useStore(s => s.project);
  const { w: CANVAS_W, h: CANVAS_H } = getCanvasSize(project?.canvasSizeKey);
  const selectedSceneId    = useStore(s => s.selectedSceneId);
  const getCameraKeyframes = useStore(s => s.getCameraKeyframes);
  const setCameraKeyframeFromCurrentView = useStore(s => s.setCameraKeyframeFromCurrentView);

  // Grid & snap state
  const showGrid    = useStore(s => s.showGrid);
  const snapToGrid  = useStore(s => s.snapToGrid);
  const gridSize    = useStore(s => s.gridSize);
  const gridType    = useStore(s => s.gridType);
  const toggleGrid  = useStore(s => s.toggleGrid);
  const toggleSnap  = useStore(s => s.toggleSnap);

  const scene           = getSelectedScene();
  const boardStyle      = getBoardStyle(project?.boardType ?? 'whiteboard');
  const timeline        = scene ? buildSequentialTimeline(scene.graphics) : [];
  const cameraKeyframes = getCameraKeyframes(selectedSceneId);

  const [cameraEditMode, setCameraEditMode] = useState(false);
  const [selectedKeyframe, setSelectedKeyframe] = useState(null);
  // playheadTime comes from the store — shared with EditorTimeline.
  // This means scrubbing in the timeline instantly updates the canvas preview.
  const playheadTime = useStore(s => s.playheadTime);

  // Exit camera edit mode with Escape
  useEffect(() => {
    if (!cameraEditMode) return;
    const onKey = (e) => { if (e.key === 'Escape') setCameraEditMode(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cameraEditMode]);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const tipRef       = useRef({ active: false });
  // bleedRef: the inner content div whose getBoundingClientRect() the hand uses
  // It lives inside CameraLayer, so its screen rect IS the camera-transformed position.
  // The hand subtracts this rect's left/top to get canvas-relative coords — correct.
  const bleedRef     = useRef(null);
  const outerRef     = useRef(null);  // 800×450 clip container (for wheel zoom)
  const activeIdRef  = useRef(null);
  const playStartRef = useRef(null);

  useEffect(() => {
    if (playing) playStartRef.current = performance.now();
    else         playStartRef.current = null;
  }, [playing]);

  // Camera playback sync — pass the ref so the hook always reads the live value
  useCameraPlayback(playing, cameraKeyframes, playStartRef);

  // Wheel zoom on the outer 800×450 container
  useWheelZoom(outerRef);

  // ── Alt+drag / middle-mouse pan ──────────────────────────────────────────
  const mmDragRef = useRef(null);

  const onPanMove = useCallback((e) => {
    if (!mmDragRef.current) return;
    const { startX, startY, camX, camY } = mmDragRef.current;
    const cam         = cameraEngine.state;
    const outerRect   = outerRef.current?.getBoundingClientRect();
    const scaleFactor = outerRect ? (CANVAS_W / outerRect.width) : 1;
    const dx = (e.clientX - startX) * scaleFactor / cam.zoom;
    const dy = (e.clientY - startY) * scaleFactor / cam.zoom;
    cameraEngine.set({ ...cam, x: camX - dx, y: camY - dy });
  }, []);

  const onPanUp = useCallback(() => {
    mmDragRef.current = null;
    window.removeEventListener('mousemove', onPanMove);
    window.removeEventListener('mouseup', onPanUp);
  }, [onPanMove]);

  const handleMouseDown = useCallback((e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      const cam = cameraEngine.state;
      mmDragRef.current = { startX: e.clientX, startY: e.clientY, camX: cam.x, camY: cam.y };
      window.addEventListener('mousemove', onPanMove);
      window.addEventListener('mouseup', onPanUp);
    }
  }, [onPanMove, onPanUp]);

  // ── Tip handler ──────────────────────────────────────────────────────────
  // Animators emit viewport-absolute screenX/Y from their own getBoundingClientRect().
  // WhiteboardHand subtracts bleedRef.getBoundingClientRect() to get bleed-div-relative px.
  // Since bleedRef is inside CameraLayer, its rect is already camera-transformed —
  // so the subtraction is always correct regardless of camera state. No conversion needed.
  const makeTipHandler = useCallback((graphicId) => (info) => {
    if (info.active) {
      activeIdRef.current = graphicId;
      tipRef.current = info;  // pass screenX/Y straight through — hand math handles it
    } else if (activeIdRef.current === graphicId) {
      activeIdRef.current = null;
      tipRef.current = { active: false };
    }
  }, []);

  const handleCanvasClick = (e) => {
    if (mmDragRef.current) return;
    const target = e.target;
    if (target === e.currentTarget || target === bleedRef.current) {
      selectGraphic(null);
    }
  };

  const ANIM_BLEED = playing ? 80 : 0;

  // Snap a world-coordinate value to the nearest grid line.
  // Used by GraphicItem drag/resize via the snapToGrid prop.
  const snap = useCallback((v) => {
    if (!snapToGrid || gridSize <= 0) return v;
    return Math.round(v / gridSize) * gridSize;
  }, [snapToGrid, gridSize]);

  return (
    <div
      ref={outerRef}
      style={{
        position:     'relative',
        width:        CANVAS_W,
        height:       CANVAS_H,
        flexShrink:   0,
        cursor:       cameraEditMode ? 'crosshair' : 'default',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Clipped viewport — board, world content, and viewfinder live here */}
      <div style={{
        position:     'absolute',
        inset:        0,
        borderRadius: 6,
        overflow:     'hidden',
        boxShadow:    '0 8px 40px rgba(0,0,0,0.35)',
      }}>
      {/* Board background — outside CameraLayer so it doesn't zoom */}
      <div style={{ position: 'absolute', inset: 0, ...boardStyle, zIndex: 0 }} />

      {/* ── Camera-transformed world space ─────────────────────────────── */}
      <CameraLayer>
        {/* Grid overlay — in world space so it zooms/pans with the camera */}
        <CanvasGrid
          visible={showGrid && !playing}
          gridSize={gridSize}
          gridType={gridType}
          boardType={project?.boardType ?? 'whiteboard'}
          canvasW={CANVAS_W}
          canvasH={CANVAS_H}
        />

        {/*
          bleedRef div:
          - lives inside CameraLayer → its getBoundingClientRect() returns
            the camera-transformed screen position (correct for hand math)
          - offset by ANIM_BLEED so animating objects can enter from outside
            the visible canvas area without being clipped mid-travel
        */}
        <div
          ref={bleedRef}
          style={{
            position: 'absolute',
            top:      -ANIM_BLEED,
            left:     -ANIM_BLEED,
            width:    CANVAS_W + ANIM_BLEED * 2,
            height:   CANVAS_H + ANIM_BLEED * 2,
            paddingTop:  ANIM_BLEED,
            paddingLeft: ANIM_BLEED,
            boxSizing: 'border-box',
          }}
          onClick={handleCanvasClick}
        >
          {timeline.map(g => (
            <GraphicItem
              key={g.id}
              graphic={g}
              isSelected={selectedGraphicId === g.id}
              playing={playing}
              seqDelay={g.seqDelay}
              onTipMove={makeTipHandler(g.id)}
              playStartTime={playStartRef.current}
              snap={snap}
            />
          ))}

          {(!scene || scene.graphics.length === 0) && !playing && (
            <div style={{
              position: 'absolute',
              top: ANIM_BLEED, left: ANIM_BLEED,
              width: CANVAS_W, height: CANVAS_H,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
              color: project?.boardType === 'whiteboard' ? '#d1d5db' : '#3a5a3a',
            }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              <p style={{ marginTop: 12, fontSize: 14, fontFamily: 'Georgia, serif' }}>
                Add items from the Library panel
              </p>
            </div>
          )}
        </div>

        {/*
          Hand is a SIBLING of bleedRef, still inside CameraLayer.
          This means the hand is in the same coordinate space as the graphics,
          so the camera transform moves it too — keeping it visually locked
          to the drawing tip during zoom/pan. bleedRef is used as the reference
          for tip.screenX/Y → canvas-relative conversion.
        */}
        {playing && (
          <WhiteboardHand
            tipRef={tipRef}
            canvasRef={bleedRef}
            handId={project?.handId}
            handConfig={project?.handConfig}
            customHands={project?.customHands}
          />
        )}
      </CameraLayer>

      {/* ── VideoScribe-style camera viewfinder ─────────────────────────── */}
      {cameraEditMode && !playing && (
        <CameraViewfinder
          outerRef={outerRef}
          playheadTime={playheadTime}
          selectedSceneId={selectedSceneId}
          selectedKeyframe={selectedKeyframe}
          onAddKeyframe={(t) => setCameraKeyframeFromCurrentView(selectedSceneId, t)}
          onExit={() => setCameraEditMode(false)}
        />
      )}

      <CameraMiniMap
        graphics={scene?.graphics ?? []}
        visible={!playing}
      />
      </div>

      {/* ── Right-side HUD overlays ────────────────────────────────────── */}
      <CameraControls
        graphics={scene?.graphics ?? []}
        selectedSceneId={selectedSceneId}
        cameraEditMode={cameraEditMode}
        onToggleCameraEdit={() => setCameraEditMode(m => !m)}
        onAddKeyframe={(t) => setCameraKeyframeFromCurrentView(selectedSceneId, t)}
        playheadTime={playheadTime}
        showGrid={showGrid}
        snapToGrid={snapToGrid}
        gridSize={gridSize}
        gridType={gridType}
        onToggleGrid={toggleGrid}
        onToggleSnap={toggleSnap}
        onSetGridSize={useStore(s => s.setGridSize)}
        onSetGridType={useStore(s => s.setGridType)}
      />
    </div>
  );
}