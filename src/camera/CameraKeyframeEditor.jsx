/**
 * CameraKeyframeEditor.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A timeline track showing camera keyframes as draggable diamond markers.
 * Sits below the scene thumbnails in EditorTimeline.
 *
 * Features:
 *  • Drag keyframes horizontally to change their start time
 *  • Click to select & scrub camera to that position
 *  • Delete button on hover
 *  • Easing picker is surfaced in the Camera action bar (EditorTimeline),
 *    NOT inline here — avoids clipping inside the fixed-height track row.
 */

import { useState, useRef, useCallback } from 'react';
import { cameraEngine } from './cameraEngine';

const TRACK_H  = 36;
const MARKER_W = 12;

export default function CameraKeyframeEditor({
  keyframes,
  totalDurationS,
  pxPerS,
  selectedSceneId,
  onUpdate,
  onDelete,
  onSelect,
  selectedKeyframeId,   // controlled from parent
  onSelectKeyframe,     // controlled from parent
}) {
  const trackRef  = useRef(null);
  const [hoveredId, setHoveredId] = useState(null);
  const dragRef   = useRef(null);

  // Fall back to internal state when parent doesn't control selection
  const [internalSelectedId, setInternalSelectedId] = useState(null);
  const selectedId = selectedKeyframeId !== undefined ? selectedKeyframeId : internalSelectedId;
  const setSelectedId = (id) => {
    setInternalSelectedId(id);
    onSelectKeyframe?.(id);
  };

  const timeToX = useCallback((t) => t * pxPerS, [pxPerS]);

  const xToTime = useCallback((x) => {
    if (totalDurationS <= 0 || !pxPerS) return 0;
    return Math.max(0, Math.min(totalDurationS, x / pxPerS));
  }, [totalDurationS, pxPerS]);

  const handleMarkerMouseDown = useCallback((e, kf) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(kf.id);
    onSelect?.(kf);

    cameraEngine.animateTo(
      { x: kf.x, y: kf.y, zoom: kf.zoom, rotation: kf.rotation },
      0.5,
      'cinematic',
    );

    const startX    = e.clientX;
    const startTime = kf.startTime;

    const onMove = (ev) => {
      const dt      = (ev.clientX - startX) / pxPerS;
      const newTime = Math.max(0, Math.min(totalDurationS, startTime + dt));
      onUpdate?.(selectedSceneId, kf.id, { startTime: newTime });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      dragRef.current = null;
    };
    dragRef.current = kf.id;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [onSelect, onUpdate, selectedSceneId, totalDurationS, pxPerS]);

  const handleTrackClick = useCallback((e) => {
    if (dragRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const t    = xToTime(e.clientX - rect.left);
    cameraEngine.scrubTo(t);
  }, [xToTime]);

  if (!keyframes || keyframes.length === 0) {
    return (
      <div style={{
        height: TRACK_H,
        display: 'flex', alignItems: 'center', paddingLeft: 12,
        color: '#334155', fontSize: 10, userSelect: 'none', letterSpacing: 1,
      }}>
        No keyframes — use Camera Edit mode to add
      </div>
    );
  }

  return (
    <div
      ref={trackRef}
      onClick={handleTrackClick}
      style={{
        height: TRACK_H, position: 'relative',
        background: '#080d16', cursor: 'crosshair',
      }}
    >
      {/* Connector lines between adjacent keyframes */}
      {keyframes.map((kf, i) => {
        if (i === keyframes.length - 1) return null;
        const x1 = timeToX(kf.startTime);
        const x2 = timeToX(keyframes[i + 1].startTime);
        return (
          <div key={kf.id + '_line'} style={{
            position: 'absolute', top: '50%',
            left: x1, width: x2 - x1, height: 1,
            background: 'linear-gradient(90deg,#f59e0b60,#f59e0b40)',
            transform: 'translateY(-50%)', pointerEvents: 'none',
          }} />
        );
      })}

      {/* Keyframe diamonds */}
      {keyframes.map(kf => {
        const x   = timeToX(kf.startTime);
        const sel = selectedId === kf.id;
        const hov = hoveredId === kf.id;
        return (
          <div
            key={kf.id}
            title={`Camera keyframe @ ${kf.startTime.toFixed(2)}s  zoom:${kf.zoom.toFixed(2)}`}
            onMouseDown={e => handleMarkerMouseDown(e, kf)}
            onMouseEnter={() => setHoveredId(kf.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              position:  'absolute',
              left:      x - MARKER_W / 2,
              top:       '50%',
              transform: 'translateY(-50%) rotate(45deg)',
              width:     MARKER_W, height: MARKER_W,
              background: sel ? '#f59e0b' : hov ? '#fbbf24' : '#78350f',
              border:    `2px solid ${sel ? '#fef3c7' : '#f59e0b'}`,
              borderRadius: 2, cursor: 'grab', zIndex: 2,
              boxShadow: sel ? '0 0 8px rgba(245,158,11,0.7)' : undefined,
              transition: 'background 0.1s, border-color 0.1s',
            }}
          >
            {/* Delete button on hover */}
            {hov && (
              <div
                onMouseDown={e => { e.stopPropagation(); onDelete?.(selectedSceneId, kf.id); }}
                title="Delete keyframe"
                style={{
                  position: 'absolute', top: -14, left: '50%',
                  transform: 'translateX(-50%) rotate(-45deg)',
                  width: 14, height: 14, borderRadius: '50%',
                  background: '#ef4444', color: '#fff',
                  fontSize: 9, fontWeight: 900,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', zIndex: 3,
                }}
              >×</div>
            )}
          </div>
        );
      })}
    </div>
  );
}