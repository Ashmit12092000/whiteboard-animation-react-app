import { useCallback, useRef, useState, useEffect } from 'react';
import { useStore } from '../../store';
import SceneThumbnail from './SceneThumbnail';
import CameraKeyframeEditor from '../../camera/CameraKeyframeEditor';
import { getSceneDuration } from '../../utils/animation';
import { useMobile } from '../../hooks/useMobile';
import { cameraEngine } from '../../camera/cameraEngine';
import VoiceRecorderModal from '../dialogs/VoiceRecorderModal';
import TTSModal from '../dialogs/TTSModal';

// ─── Constants ────────────────────────────────────────────────────────────────
const LABEL_W   = 130;
const TRACK_H   = 32;
const HEADER_H  = 22;
const MIN_DUR   = 0.1;
const RULER_STEP_OPTIONS = [0.5, 1, 2, 5];

// ─── Colour per type ──────────────────────────────────────────────────────────
const TYPE_COLOR = {
  drawing: { bar: '#3b82f6', hover: '#60a5fa', dim: '#1d4ed8' },
  image:   { bar: '#10b981', hover: '#34d399', dim: '#065f46' },
  text:    { bar: '#8b5cf6', hover: '#a78bfa', dim: '#5b21b6' },
  audio:   { bar: '#f59e0b', hover: '#fbbf24', dim: '#b45309' },
  camera:  { bar: '#f59e0b', hover: '#fbbf24', dim: '#b45309' },
};

function typeIcon(type) {
  if (type === 'drawing') return '✏️';
  if (type === 'image')   return '🖼';
  if (type === 'text')    return 'T';
  if (type === 'audio')   return '🎵';
  if (type === 'camera')  return '📷';
  return '◆';
}

// ─── Time ruler ───────────────────────────────────────────────────────────────
function TimeRuler({ totalS, pxPerS }) {
  const step = RULER_STEP_OPTIONS.find(s => s * pxPerS >= 48) ?? 5;
  const ticks = [];
  for (let t = 0; t <= totalS + step; t += step) {
    const x = t * pxPerS;
    ticks.push(
      <g key={t} transform={`translate(${x},0)`}>
        <line x1="0" y1={HEADER_H - 6} x2="0" y2={HEADER_H} stroke="#475569" strokeWidth="1" />
        <text x="3" y={HEADER_H - 8} fill="#64748b" fontSize="9" fontFamily="ui-monospace,monospace">
          {t.toFixed(t < 10 ? 1 : 0)}s
        </text>
      </g>
    );
  }
  return (
    <svg
      width="100%" height={HEADER_H}
      style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}
    >
      <rect width="100%" height={HEADER_H} fill="#0a0f1a" />
      <g>{ticks}</g>
      <line x1="0" y1={HEADER_H} x2="9999" y2={HEADER_H} stroke="#1e293b" strokeWidth="1" />
    </svg>
  );
}

// ─── Context menu (shared render helper) ─────────────────────────────────────
function CtxMenu({ x, y, items, onClose }) {
  // Render above the click point (bottom = distance from top of viewport to click)
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 900 }} onClick={onClose} />
      <div style={{
        position: 'fixed', left: x, bottom: window.innerHeight - y, zIndex: 1000,
        background: '#1f2937', border: '1px solid #374151',
        borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        minWidth: 175, overflow: 'hidden',
        // clamp so it never goes off-screen left
        transform: x > window.innerWidth - 185 ? 'translateX(-100%)' : undefined,
      }}>
        {items.map((item, i) =>
          item.sep ? (
            <div key={i} style={{ height: 1, background: '#374151', margin: '2px 0' }} />
          ) : item.header ? (
            <div key={i} style={{ padding: '5px 12px 3px', fontSize: 10, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {item.header}
            </div>
          ) : (
            <button
              key={i}
              disabled={item.disabled}
              onClick={item.action}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '7px 14px',
                background: 'none', border: 'none',
                color: item.disabled ? '#4b5563' : item.danger ? '#ef4444' : '#e5e7eb',
                fontSize: 12, cursor: item.disabled ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = '#374151'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
            >
              <span style={{ width: 16, textAlign: 'center', fontSize: 13 }}>{item.icon}</span>
              {item.label}
            </button>
          )
        )}
      </div>
    </>
  );
}

// ─── Graphic track context menu ───────────────────────────────────────────────
function TrackContextMenu({ x, y, graphic, scene, onClose }) {
  const duplicateGraphic   = useStore(s => s.duplicateGraphic);
  const splitGraphic       = useStore(s => s.splitGraphic);
  const deleteGraphic      = useStore(s => s.deleteGraphic);
  const moveGraphicInList  = useStore(s => s.moveGraphicInList);
  const updateGraphicProps = useStore(s => s.updateGraphicProps);

  const idx      = scene.graphics.findIndex(g => g.id === graphic.id);
  const isFirst  = idx === 0;
  const isLast   = idx === scene.graphics.length - 1;
  const canSplit = graphic.duration / 2 >= MIN_DUR;

  // Type-specific items inserted before the delete separator
  const typeItems = [];
  if (graphic.type === 'text') {
    typeItems.push(
      { sep: true },
      { header: 'Text' },
      { label: 'Bold toggle',   icon: 'B', action: () => { updateGraphicProps(graphic.id, { bold:   !graphic.bold   }); onClose(); } },
      { label: 'Italic toggle', icon: 'I', action: () => { updateGraphicProps(graphic.id, { italic: !graphic.italic }); onClose(); } },
    );
  }
  if (graphic.type === 'image') {
    typeItems.push(
      { sep: true },
      { header: 'Image' },
      { label: 'Flip horizontal', icon: '↔', action: () => { updateGraphicProps(graphic.id, { flipX: !graphic.flipX }); onClose(); } },
      { label: 'Flip vertical',   icon: '↕', action: () => { updateGraphicProps(graphic.id, { flipY: !graphic.flipY }); onClose(); } },
    );
  }
  if (graphic.type === 'drawing') {
    typeItems.push(
      { sep: true },
      { header: 'Drawing' },
      { label: 'Speed ×0.5',  icon: '🐢', action: () => { updateGraphicProps(graphic.id, { hand_speed: 0.5  }); onClose(); } },
      { label: 'Speed ×1',    icon: '▶',  action: () => { updateGraphicProps(graphic.id, { hand_speed: 1.0  }); onClose(); } },
      { label: 'Speed ×2',    icon: '⚡', action: () => { updateGraphicProps(graphic.id, { hand_speed: 2.0  }); onClose(); } },
    );
  }

  const items = [
    { header: `${typeIcon(graphic.type)} ${graphic.type.charAt(0).toUpperCase() + graphic.type.slice(1)} Track` },
    { sep: true },
    { label: 'Move Earlier', icon: '↑', disabled: isFirst, action: () => { moveGraphicInList(graphic.id, -1); onClose(); } },
    { label: 'Move Later',   icon: '↓', disabled: isLast,  action: () => { moveGraphicInList(graphic.id,  1); onClose(); } },
    { sep: true },
    { label: 'Duplicate',    icon: '⧉', action: () => { duplicateGraphic(graphic.id); onClose(); } },
    { label: 'Split at midpoint', icon: '✂', disabled: !canSplit, action: () => { if (!canSplit) return; splitGraphic(graphic.id); onClose(); } },
    ...typeItems,
    { sep: true },
    { label: 'Delete', icon: '🗑', danger: true, action: () => { deleteGraphic(graphic.id); onClose(); } },
  ];

  return <CtxMenu x={x} y={y} items={items} onClose={onClose} />;
}

// ─── Audio track context menu ─────────────────────────────────────────────────
function AudioTrackContextMenu({ x, y, track, onClose }) {
  const removeAudioTrack  = useStore(s => s.removeAudioTrack);
  const updateAudioTrack  = useStore(s => s.updateAudioTrack);
  const isTTS = track.type === 'tts';

  const vol     = track.volume  ?? 1;
  const loop    = track.loop    ?? false;
  const fadeIn  = track.fadeIn  ?? 0;
  const fadeOut = track.fadeOut ?? 0;

  const items = [
    { header: isTTS ? '🔊 TTS Track' : '🎙 Voice Track' },
    { sep: true },
    // Volume steps
    { label: 'Volume 100%', icon: '🔊', action: () => { updateAudioTrack(track.id, { volume: 1.0 }); onClose(); } },
    { label: 'Volume 75%',  icon: '🔉', action: () => { updateAudioTrack(track.id, { volume: 0.75 }); onClose(); } },
    { label: 'Volume 50%',  icon: '🔉', action: () => { updateAudioTrack(track.id, { volume: 0.5 }); onClose(); } },
    { label: 'Volume 25%',  icon: '🔈', action: () => { updateAudioTrack(track.id, { volume: 0.25 }); onClose(); } },
    { sep: true },
    // Fade
    { label: fadeIn  > 0 ? 'Remove Fade In'  : 'Fade In (0.5s)',  icon: '↗', action: () => { updateAudioTrack(track.id, { fadeIn:  fadeIn  > 0 ? 0 : 0.5 }); onClose(); } },
    { label: fadeOut > 0 ? 'Remove Fade Out' : 'Fade Out (0.5s)', icon: '↘', action: () => { updateAudioTrack(track.id, { fadeOut: fadeOut > 0 ? 0 : 0.5 }); onClose(); } },
    { sep: true },
    // Loop (voice only — TTS is regenerated each time)
    ...(!isTTS ? [{ label: loop ? 'Disable Loop' : 'Enable Loop', icon: '🔁', action: () => { updateAudioTrack(track.id, { loop: !loop }); onClose(); } }, { sep: true }] : []),
    { label: 'Delete', icon: '🗑', danger: true, action: () => { removeAudioTrack(track.id); onClose(); } },
  ];

  return <CtxMenu x={x} y={y} items={items} onClose={onClose} />;
}

// ─── Camera track context menu ────────────────────────────────────────────────
function CameraTrackContextMenu({ x, y, sceneId, keyframes, onClose }) {
  const setCameraKeyframeFromCurrentView = useStore(s => s.setCameraKeyframeFromCurrentView);
  const deleteCameraKeyframe             = useStore(s => s.deleteCameraKeyframe);
  const playheadTime = useStore(s => s.playheadTime);

  const hasKeyframes = keyframes.length > 0;

  const items = [
    { header: '📷 Camera Track' },
    { sep: true },
    { label: 'Add Keyframe Here',      icon: '◆', action: () => { setCameraKeyframeFromCurrentView(sceneId, playheadTime); onClose(); } },
    { sep: true },
    { label: 'Delete All Keyframes', icon: '🗑', danger: true, disabled: !hasKeyframes,
      action: () => { keyframes.forEach(kf => deleteCameraKeyframe(sceneId, kf.id)); onClose(); } },
  ];

  return <CtxMenu x={x} y={y} items={items} onClose={onClose} />;
}
function TrackBar({ graphic, startX, width, pxPerS, isSelected, onSelect, onContextMenu, onDurationChange }) {
  const colors  = TYPE_COLOR[graphic.type] ?? TYPE_COLOR.drawing;
  const [hovered, setHovered] = useState(false);

  const onRightEdgeDown = useCallback((e) => {
    e.stopPropagation(); e.preventDefault();
    const startX0 = e.clientX, startDur = graphic.duration;
    const onMove = (ev) => {
      const newDur = Math.max(MIN_DUR, startDur + (ev.clientX - startX0) / pxPerS);
      onDurationChange?.(newDur);
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [graphic.duration, pxPerS, onDurationChange]);

  return (
    <div
      style={{
        position: 'absolute', left: startX, width: Math.max(6, width),
        top: 4, height: TRACK_H - 8, borderRadius: 4,
        background: isSelected ? colors.hover : hovered ? colors.hover : colors.bar,
        border: `1.5px solid ${isSelected ? '#fff' : 'rgba(255,255,255,0.18)'}`,
        boxSizing: 'border-box', cursor: 'pointer', overflow: 'hidden',
        display: 'flex', alignItems: 'center', transition: 'background 0.1s',
        boxShadow: isSelected ? '0 0 0 2px rgba(255,255,255,0.25)' : undefined,
        userSelect: 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); onSelect?.(); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e); }}
    >
      <span style={{ position: 'absolute', left: 10, right: 10, fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.92)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>
        {graphic.name || graphic.rawText || graphic.type}
      </span>
      <div onMouseDown={onRightEdgeDown} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'ew-resize', background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
        <div style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.6)', borderRadius: 1 }} />
      </div>
    </div>
  );
}

// ─── Track label ──────────────────────────────────────────────────────────────
function TrackLabel({ graphic, isSelected, onSelect, onContextMenu }) {
  const colors = TYPE_COLOR[graphic.type] ?? TYPE_COLOR.drawing;
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onSelect}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e); }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={graphic.name || graphic.rawText}
      style={{
        width: LABEL_W, height: TRACK_H, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px',
        cursor: 'pointer',
        background: isSelected ? 'rgba(255,255,255,0.06)' : hov ? 'rgba(255,255,255,0.03)' : 'transparent',
        borderRight: '1px solid #1e293b', borderBottom: '1px solid #111827',
        userSelect: 'none', transition: 'background 0.1s',
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: isSelected ? colors.hover : colors.bar, flexShrink: 0, boxShadow: isSelected ? `0 0 6px ${colors.hover}` : undefined }} />
      <span style={{ fontSize: 10, fontWeight: 600, color: isSelected ? '#e2e8f0' : '#64748b', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flex: 1 }}>
        {typeIcon(graphic.type)} {graphic.name || graphic.rawText || graphic.type}
      </span>
    </div>
  );
}

// ─── Playhead needle ──────────────────────────────────────────────────────────
function Playhead({ playheadX, trackCount, cameraRowH, onScrubStart }) {
  const totalH = HEADER_H + (trackCount * TRACK_H) + (cameraRowH ?? 34) + 34;
  return (
    <div
      onMouseDown={onScrubStart}
      style={{
        position: 'absolute',
        left: playheadX,
        top: 0,
        width: 18,
        height: totalH,
        background: 'transparent',
        cursor: 'ew-resize',
        zIndex: 20,
        transform: 'translateX(-9px)',
        userSelect: 'none',
      }}
    >
      {/* Visible line centred in the hit zone */}
      <div style={{
        position: 'absolute',
        left: 8,
        top: 0,
        width: 2,
        height: '100%',
        background: 'rgba(251,191,36,0.9)',
        boxShadow: '0 0 6px rgba(251,191,36,0.5)',
        pointerEvents: 'none',
      }} />
      {/* Diamond head */}
      <div style={{
        position: 'absolute',
        top: HEADER_H - 6,
        left: '50%',
        transform: 'translateX(-50%) rotate(45deg)',
        width: 10,
        height: 10,
        background: '#fbbf24',
        boxShadow: '0 0 6px rgba(251,191,36,0.9)',
        pointerEvents: 'none',
      }} />
    </div>
  );
}

// ─── Main timeline ─────────────────────────────────────────────────────────────
export default function EditorTimeline() {
  const isMobile          = useMobile();
  const project           = useStore(s => s.project);
  const selectedSceneId   = useStore(s => s.selectedSceneId);
  const selectedGraphicId = useStore(s => s.selectedGraphicId);
  const addScene          = useStore(s => s.addScene);
  const moveScene         = useStore(s => s.moveScene);
  const selectGraphic     = useStore(s => s.selectGraphic);
  const setGraphicDuration        = useStore(s => s.setGraphicDuration);
  const getCameraKeyframes       = useStore(s => s.getCameraKeyframes);
  const updateCameraKeyframe     = useStore(s => s.updateCameraKeyframe);
  const deleteCameraKeyframe     = useStore(s => s.deleteCameraKeyframe);
  const setCameraKeyframeFromCurrentView = useStore(s => s.setCameraKeyframeFromCurrentView);
  const setSharedPlayheadTime    = useStore(s => s.setPlayheadTime);
  const setSelectedCameraKeyframeId = useStore(s => s.setSelectedCameraKeyframeId);
  const openCanvasPreview  = useStore(s => s.openCanvasPreview);
  const closeCanvasPreview = useStore(s => s.closeCanvasPreview);

  // ── Voice recorder / TTS modals ──────────────────────────────────────────
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showTTSModal, setShowTTSModal] = useState(false);
  const [audioCtxMenu, setAudioCtxMenu] = useState(null);

  const scene           = project?.scenes.find(s => s.id === selectedSceneId);
  const cameraKeyframes = getCameraKeyframes(selectedSceneId);
  const totalDurationS  = scene ? Math.max(getSceneDuration(scene), 1) : 4;

  // ── Context menu ─────────────────────────────────────────────────────────
  const [ctxMenu,       setCtxMenu]       = useState(null);
  const [cameraCtxMenu, setCameraCtxMenu] = useState(null);

  // ── Scene strip drag ─────────────────────────────────────────────────────
  const dragFromIdx = useRef(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  // ── Track area width ──────────────────────────────────────────────────────
  const trackAreaRef = useRef(null);
  const [trackAreaW, setTrackAreaW] = useState(600);
  useEffect(() => {
    if (!trackAreaRef.current) return;
    const ro = new ResizeObserver(entries => setTrackAreaW(entries[0].contentRect.width));
    ro.observe(trackAreaRef.current);
    return () => ro.disconnect();
  }, []);

  const MIN_VISIBLE_S = 6;
  const pxPerS = Math.min(
    Math.max(60, (trackAreaW - 16) / totalDurationS),
    Math.max(60, (trackAreaW - 16) / MIN_VISIBLE_S)
  );

  // ── Playback state ────────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying]     = useState(false);
  // playheadTime lives in the store — single source of truth for both
  // the timeline needle and EditorCanvas preview.
  const playheadTime    = useStore(s => s.playheadTime);
  const rafRef          = useRef(null);
  const playStartRef    = useRef(null);
  const pauseTimeRef    = useRef(0); // seconds elapsed when paused
  const isScrubbing     = useRef(false);

  // syncPlayhead updates both local store (so EditorCanvas reacts) and the
  // camera engine (so camera scrubs in real time).
  const syncPlayhead = useCallback((t) => {
    setSharedPlayheadTime(t);
    cameraEngine.scrubTo(t);
  }, [setSharedPlayheadTime]);

  const stopPlayback = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setIsPlaying(false);
    rafRef.current = null;
  }, []);

  const startPlayback = useCallback(() => {
    const offset = pauseTimeRef.current;
    playStartRef.current = performance.now() - offset * 1000;
    setIsPlaying(true);

    const tick = () => {
      const elapsed = (performance.now() - playStartRef.current) / 1000;
      if (elapsed >= totalDurationS) {
        syncPlayhead(totalDurationS);
        pauseTimeRef.current = 0;
        setIsPlaying(false);
        closeCanvasPreview();
        return;
      }
      syncPlayhead(elapsed);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [totalDurationS, syncPlayhead]);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      pauseTimeRef.current = playheadTime;
      stopPlayback();
    } else {
      // If at end, restart from 0
      if (playheadTime >= totalDurationS) {
        pauseTimeRef.current = 0;
        syncPlayhead(0);
      }
      openCanvasPreview();
      // Small delay to let preview mount before animation begins
      setTimeout(() => startPlayback(), 30);
    }
  }, [isPlaying, playheadTime, totalDurationS, stopPlayback, startPlayback, syncPlayhead]);

  const handleStop = useCallback(() => {
    stopPlayback();
    syncPlayhead(0);
    pauseTimeRef.current = 0;
    closeCanvasPreview();
  }, [stopPlayback, closeCanvasPreview, syncPlayhead]);

  // ── Scrub: click or drag anywhere on the track area / ruler ──────────────
  const xToTime = useCallback((clientX) => {
    if (!scrollRef.current) return 0;
    const rect = scrollRef.current.getBoundingClientRect();
    const x = clientX - rect.left + scrollRef.current.scrollLeft;
    return Math.max(0, Math.min(totalDurationS, x / pxPerS));
  }, [pxPerS, totalDurationS]);

  const handleScrubStart = useCallback((e) => {
    if (isPlaying) {
      // Pause playback while scrubbing
      pauseTimeRef.current = playheadTime;
      stopPlayback();
    }
    isScrubbing.current = true;
    const t = xToTime(e.clientX);
    syncPlayhead(t);
    pauseTimeRef.current = t;

    const onMove = (ev) => {
      if (!isScrubbing.current) return;
      const newT = xToTime(ev.clientX);
      syncPlayhead(newT);
      pauseTimeRef.current = newT;
    };
    const onUp = () => {
      isScrubbing.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [isPlaying, playheadTime, stopPlayback, xToTime, syncPlayhead]);

  // Sync playhead scroll into view
  const scrollRef = useRef(null);
  useEffect(() => {
    if (!scrollRef.current || !isPlaying) return;
    const x = playheadTime * pxPerS;
    const el = scrollRef.current;
    const { scrollLeft, clientWidth } = el;
    if (x > scrollLeft + clientWidth - 40) {
      el.scrollLeft = x - clientWidth / 2;
    }
  }, [playheadTime, pxPerS, isPlaying]);

  // Cleanup on unmount
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ── Sequential track data ─────────────────────────────────────────────────
  let cursor = 0;
  const tracksWithTime = (scene?.graphics ?? []).map(g => {
    const startS = cursor;
    cursor += g.duration;
    return { graphic: g, startS };
  });

  const playheadX = playheadTime * pxPerS;
  const formattedTime = `${Math.floor(playheadTime / 60).toString().padStart(2, '0')}:${(playheadTime % 60).toFixed(1).padStart(4, '0')}`;
  const audioTracks = project?.audioTracks ?? [];

  // ── Scene drag handlers ───────────────────────────────────────────────────
  const handleDragStart  = useCallback((idx) => (e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/scene-index', String(idx)); dragFromIdx.current = idx; setTimeout(() => { if (e.currentTarget) e.currentTarget.style.opacity = '0.4'; }, 0); }, []);
  const handleDragOver   = useCallback((idx) => (e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; if (dragOverIdx !== idx) setDragOverIdx(idx); }, [dragOverIdx]);
  const handleDrop       = useCallback((toIdx) => (e) => { e.preventDefault(); e.stopPropagation(); setDragOverIdx(null); const fromIdx = Number(e.dataTransfer.getData('application/scene-index')); if (isNaN(fromIdx) || fromIdx === toIdx) return; moveScene(fromIdx, toIdx); }, [moveScene]);
  const handleDragEnd    = useCallback((e) => { if (e.currentTarget) e.currentTarget.style.opacity = '1'; dragFromIdx.current = null; setDragOverIdx(null); }, []);
  const handleDragLeave  = useCallback((idx) => (e) => { if (!e.currentTarget.contains(e.relatedTarget)) { setDragOverIdx(prev => prev === idx ? null : prev); } }, []);

  if (!project) return null;
  const scenes = project.scenes;

  return (
    <>
      <div style={{ background: '#0a0f1a', borderTop: '1px solid #1e293b', flexShrink: 0, display: 'flex', flexDirection: 'column', userSelect: 'none', height: '100%', overflow: 'hidden' }}>

        {/* ── Scene strip ──────────────────────────────────────────────────── */}
        <div style={{ height: isMobile ? 76 : 96, display: 'flex', alignItems: 'center', padding: isMobile ? '0 8px' : '0 12px', gap: isMobile ? 6 : 8, overflowX: 'auto', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
          {!isMobile && (
            <div style={{ color: '#334155', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, flexShrink: 0, writingMode: 'vertical-rl', transform: 'rotate(180deg)', paddingBottom: 4 }}>Scenes</div>
          )}
          {scenes.map((sc, idx) => (
            <SceneThumbnail key={sc.id} scene={sc} index={idx} totalScenes={scenes.length} isSelected={sc.id === selectedSceneId} isDragOver={dragOverIdx === idx} onDragStart={handleDragStart(idx)} onDragOver={handleDragOver(idx)} onDrop={handleDrop(idx)} onDragEnd={handleDragEnd} onDragLeave={handleDragLeave(idx)} />
          ))}
          <button onClick={addScene} title="Add Scene" style={{ width: isMobile ? 44 : 64, height: isMobile ? 44 : 64, background: '#0f172a', border: '2px dashed #1e293b', borderRadius: 8, color: '#334155', fontSize: 22, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.color = '#f59e0b'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#334155'; }}>+</button>
        </div>

        {/* ── Camera keyframe action bar ──────────────────────────────────── */}
        {!isMobile && scene && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderBottom: '1px solid #1e293b', flexShrink: 0, background: '#080d16' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>📷 Camera</span>
            <button onClick={() => setCameraKeyframeFromCurrentView(selectedSceneId, playheadTime)} title="Add camera keyframe at current playhead time" style={{ background: '#1a2236', border: '1px solid #f59e0b44', borderRadius: 4, color: '#f59e0b', fontSize: 10, fontWeight: 700, cursor: 'pointer', padding: '3px 8px', lineHeight: 1, display: 'flex', alignItems: 'center', gap: 4, transition: 'background 0.1s, border-color 0.1s' }} onMouseEnter={e => { e.currentTarget.style.background = '#243048'; e.currentTarget.style.borderColor = '#f59e0b'; }} onMouseLeave={e => { e.currentTarget.style.background = '#1a2236'; e.currentTarget.style.borderColor = '#f59e0b44'; }}>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor"><path d="M4.5 0L9 4.5L4.5 9L0 4.5Z"/></svg>
              Add Keyframe
            </button>
          </div>
        )}

        {/* ── Track panel (desktop) ─────────────────────────────────────────── */}
        {!isMobile && scene && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

            {/* Track header row: label col + playback controls + ruler */}
            <div style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid #1e293b', alignItems: 'stretch' }}>

              {/* Left label header — with play controls */}
              <div style={{ width: LABEL_W, flexShrink: 0, height: HEADER_H + 10, borderRight: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 8, paddingRight: 6, background: '#080d16' }}>

                {/* Play / Pause */}
                <button
                  onClick={handlePlayPause}
                  title={isPlaying ? 'Pause' : 'Play'}
                  style={{
                    width: 22, height: 22, borderRadius: 4, border: 'none',
                    background: isPlaying ? 'rgba(251,191,36,0.15)' : 'rgba(16,185,129,0.15)',
                    color: isPlaying ? '#fbbf24' : '#10b981',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, flexShrink: 0, padding: 0,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = isPlaying ? 'rgba(251,191,36,0.28)' : 'rgba(16,185,129,0.28)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isPlaying ? 'rgba(251,191,36,0.15)' : 'rgba(16,185,129,0.15)'; }}
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>

                {/* Stop */}
                <button
                  onClick={handleStop}
                  title="Stop"
                  style={{
                    width: 22, height: 22, borderRadius: 4, border: 'none',
                    background: 'rgba(100,116,139,0.15)', color: '#64748b',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, flexShrink: 0, padding: 0, transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(100,116,139,0.3)'; e.currentTarget.style.color = '#94a3b8'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(100,116,139,0.15)'; e.currentTarget.style.color = '#64748b'; }}
                >
                  ⏹
                </button>

                {/* Timecode */}
                <span style={{ fontSize: 9, fontFamily: 'ui-monospace, monospace', color: isPlaying ? '#fbbf24' : '#475569', letterSpacing: '0.03em', flexShrink: 0, marginLeft: 2 }}>
                  {formattedTime}
                </span>
              </div>

              {/* Ruler */}
              <div ref={trackAreaRef} style={{ flex: 1, overflow: 'hidden', background: '#080d16' }}>
                <div style={{ paddingTop: 5 }}>
                  <TimeRuler totalS={totalDurationS} pxPerS={pxPerS} />
                </div>
              </div>
            </div>

            {/* ── Scrollable track rows ────────────────────────────────────── */}
            <div style={{ display: 'flex', flex: 1, minHeight: 0, overflowY: 'auto' }}>

              {/* Sticky label column */}
              <div style={{ width: LABEL_W, flexShrink: 0, background: '#080d16', borderRight: '1px solid #1e293b' }}>
                {tracksWithTime.length === 0 && (
                  <div style={{ padding: '18px 0', textAlign: 'center', color: '#334155', fontSize: 11 }}>—</div>
                )}
                {tracksWithTime.map(({ graphic }) => (
                  <TrackLabel
                    key={graphic.id}
                    graphic={graphic}
                    isSelected={selectedGraphicId === graphic.id}
                    onSelect={() => selectGraphic(graphic.id)}
                    onContextMenu={(e) => setCtxMenu({ x: e.clientX, y: e.clientY, graphic })}
                  />
                ))}

                {/* Camera row label */}
                <div
                  onContextMenu={(e) => { e.preventDefault(); setCameraCtxMenu({ x: e.clientX, y: e.clientY }); }}
                  style={{ width: LABEL_W, borderTop: '1px solid #1e293b', borderRight: '1px solid #1e293b', background: '#080d16', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', height: 34, boxSizing: 'border-box', cursor: 'context-menu' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>📷 Cam</span>
                </div>


                {/* Audio row label */}
                <div style={{ width: LABEL_W, borderTop: '1px solid #1e293b', borderRight: '1px solid #1e293b', background: '#080d16', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', height: 34, boxSizing: 'border-box' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>🎵 Audio</span>
                  <button onClick={() => setShowVoiceRecorder(true)} title="Record voice" style={{ width: 20, height: 20, background: '#1a2236', border: '1px solid #ef444444', borderRadius: 4, color: '#f87171', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.1s, border-color 0.1s' }} onMouseEnter={e => { e.currentTarget.style.background = '#243048'; e.currentTarget.style.borderColor = '#ef4444'; }} onMouseLeave={e => { e.currentTarget.style.background = '#1a2236'; e.currentTarget.style.borderColor = '#ef444444'; }}>
                    🎙
                  </button>
                  <button onClick={() => setShowTTSModal(true)} title="Text to speech" style={{ width: 20, height: 20, background: '#1a2236', border: '1px solid #3b82f644', borderRadius: 4, color: '#60a5fa', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.1s, border-color 0.1s' }} onMouseEnter={e => { e.currentTarget.style.background = '#243048'; e.currentTarget.style.borderColor = '#3b82f6'; }} onMouseLeave={e => { e.currentTarget.style.background = '#1a2236'; e.currentTarget.style.borderColor = '#3b82f644'; }}>
                    🔊
                  </button>
                </div>
              </div>

              {/* Scrollable bar area */}
              <div
                ref={scrollRef}
                onMouseDown={handleScrubStart}
                style={{ flex: 1, overflowX: 'auto', overflowY: 'visible', position: 'relative', cursor: 'crosshair' }}
              >
                {/* Inner container — sized to full timeline width */}
                <div style={{ minWidth: totalDurationS * pxPerS + 32, position: 'relative' }}>

                  {tracksWithTime.length === 0 && (
                    <div style={{ padding: '18px 0', textAlign: 'center', color: '#334155', fontSize: 11 }}>
                      No items on this scene yet — add from the Library
                    </div>
                  )}

                  {tracksWithTime.map(({ graphic, startS }, rowIdx) => {
                    const isSelected = selectedGraphicId === graphic.id;
                    const barLeft    = startS * pxPerS;
                    const barWidth   = graphic.duration * pxPerS;
                    return (
                      <div key={graphic.id} style={{ height: TRACK_H, position: 'relative', background: rowIdx % 2 === 0 ? '#0a0f1a' : '#080d16', borderBottom: '1px solid #111827' }} onClick={() => selectGraphic(graphic.id)}>
                        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.02)', pointerEvents: 'none' }} />
                        <TrackBar
                          graphic={graphic}
                          startX={barLeft}
                          width={barWidth}
                          pxPerS={pxPerS}
                          isSelected={isSelected}
                          onSelect={() => selectGraphic(graphic.id)}
                          onContextMenu={(e) => setCtxMenu({ x: e.clientX, y: e.clientY, graphic })}
                          onDurationChange={(dur) => setGraphicDuration(graphic.id, parseFloat(dur.toFixed(2)))}
                        />
                      </div>
                    );
                  })}

                  {/* Camera track bar area */}
                  <div
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCameraCtxMenu({ x: e.clientX, y: e.clientY }); }}
                    style={{ height: 34, background: '#080d16', borderTop: '1px solid #1e293b', position: 'relative' }}>
                    <CameraKeyframeEditor
                      keyframes={cameraKeyframes}
                      totalDurationS={totalDurationS}
                      pxPerS={pxPerS}
                      selectedSceneId={selectedSceneId}
                      onUpdate={updateCameraKeyframe}
                      onDelete={deleteCameraKeyframe}
                      onSelect={(kf) => setSelectedCameraKeyframeId(kf?.id ?? null)}
                    />
                  </div>

                  {/* Audio track bar area */}
                  <div style={{ height: 34, background: '#080d16', borderTop: '1px solid #1e293b', position: 'relative', overflow: 'hidden' }}>
                    {audioTracks.map((track) => {
                      const dur   = track.duration ?? 1;
                      const width = dur * pxPerS;
                      const isTTS = track.type === 'tts';
                      return (
                        <div
                          key={track.id}
                          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setAudioCtxMenu({ x: e.clientX, y: e.clientY, track }); }}
                          title={track.name}
                          style={{
                            position: 'absolute', left: 0, top: 4, width: Math.max(6, width), height: 26,
                            borderRadius: 4, boxSizing: 'border-box', overflow: 'hidden',
                            background: isTTS ? '#1d4ed8' : '#b45309',
                            border: '1.5px solid rgba(255,255,255,0.18)',
                            display: 'flex', alignItems: 'center', cursor: 'context-menu', userSelect: 'none',
                          }}
                        >
                          <span style={{ position: 'absolute', left: 6, right: 6, fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.92)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>
                            {isTTS ? '🔊' : '🎙'} {track.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>


                  {/* Playhead needle — draggable */}
                  <Playhead
                    playheadX={playheadX}
                    trackCount={tracksWithTime.length}
                    cameraRowH={34}
                    onScrubStart={handleScrubStart}
                  />
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Context menu */}
        {ctxMenu && scene && (
          <TrackContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            graphic={ctxMenu.graphic}
            scene={scene}
            onClose={() => setCtxMenu(null)}
          />
        )}

        {/* Camera track context menu */}
        {cameraCtxMenu && (
          <CameraTrackContextMenu
            x={cameraCtxMenu.x}
            y={cameraCtxMenu.y}
            sceneId={selectedSceneId}
            keyframes={cameraKeyframes}
            onClose={() => setCameraCtxMenu(null)}
          />
        )}

        {/* Audio track context menu */}
        {audioCtxMenu && (
          <AudioTrackContextMenu
            x={audioCtxMenu.x}
            y={audioCtxMenu.y}
            track={audioCtxMenu.track}
            onClose={() => setAudioCtxMenu(null)}
          />
        )}
      </div>

      {/* Voice recorder modal */}
      {showVoiceRecorder && (
        <VoiceRecorderModal onClose={() => setShowVoiceRecorder(false)} />
      )}

      {/* TTS modal */}
      {showTTSModal && (
        <TTSModal onClose={() => setShowTTSModal(false)} />
      )}
    </>
  );
}