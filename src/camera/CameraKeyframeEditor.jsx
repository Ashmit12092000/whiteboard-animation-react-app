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
 *  • Easing picker inline
 */

import { useState, useRef, useCallback } from 'react';
import { cameraEngine } from './cameraEngine';
import { EASING_NAMES } from './cameraUtils';

const TRACK_H = 36;
const MARKER_W = 12;

export default function CameraKeyframeEditor({
  keyframes,
  totalDurationS,
  selectedSceneId,
  onUpdate,
  onDelete,
  onSelect,
}) {
  const trackRef = useRef(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const dragRef = useRef(null);

  const timeToX = useCallback((t) => {
    if (!trackRef.current || totalDurationS <= 0) return 0;
    return (t / totalDurationS) * trackRef.current.clientWidth;
  }, [totalDurationS]);

  const xToTime = useCallback((x) => {
    if (!trackRef.current || totalDurationS <= 0) return 0;
    return Math.max(0, (x / trackRef.current.clientWidth) * totalDurationS);
  }, [totalDurationS]);

  const handleMarkerMouseDown = useCallback((e, kf) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(kf.id);
    onSelect?.(kf);

    // Scrub camera to this keyframe
    cameraEngine.animateTo({ x: kf.x, y: kf.y, zoom: kf.zoom, rotation: kf.rotation }, 0.5, 'cinematic');

    const startX = e.clientX;
    const startTime = kf.startTime;

    const onMove = (ev) => {
      if (!trackRef.current) return;
      const trackRect = trackRef.current.getBoundingClientRect();
      const dx = ev.clientX - startX;
      const dtRatio = dx / trackRect.width;
      const newTime = Math.max(0, Math.min(totalDurationS, startTime + dtRatio * totalDurationS));
      onUpdate?.(selectedSceneId, kf.id, { startTime: newTime });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      dragRef.current = null;
    };

    dragRef.current = kf.id;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [onSelect, onUpdate, selectedSceneId, totalDurationS]);

  const handleTrackClick = useCallback((e) => {
    if (dragRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = xToTime(x);
    cameraEngine.scrubTo(t);
  }, [xToTime]);

  if (!keyframes || keyframes.length === 0) {
    return (
      <div style={{
        height: TRACK_H,
        display: 'flex', alignItems: 'center', paddingLeft: 12,
        color: '#374151', fontSize: 11, userSelect: 'none',
      }}>
        <span style={{ color: '#334155', fontSize: 10, letterSpacing: 1 }}>No keyframes — use Camera Edit mode to add</span>
      </div>
    );
  }

  return (
    <div>
      {/* Track bar area */}
      <div style={{
        height: TRACK_H,
        position: 'relative',
        background: '#080d16',
        cursor: 'crosshair',
      }}
        ref={trackRef}
        onClick={handleTrackClick}
      >
        {/* Hide the old embedded CAM label — parent row shows label now */}

        {/* Connector line */}
        {keyframes.length > 1 && keyframes.map((kf, i) => {
          if (i === keyframes.length - 1) return null;
          const x1 = timeToX(kf.startTime);
          const x2 = timeToX(keyframes[i + 1].startTime);
          return (
            <div key={kf.id + '_line'} style={{
              position: 'absolute',
              top: '50%',
              left: x1,
              width: x2 - x1,
              height: 1,
              background: 'linear-gradient(90deg, #f59e0b60, #f59e0b40)',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
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
                width:     MARKER_W,
                height:    MARKER_W,
                background: sel ? '#f59e0b' : hov ? '#fbbf24' : '#78350f',
                border:    `2px solid ${sel ? '#fef3c7' : '#f59e0b'}`,
                borderRadius: 2,
                cursor:    'grab',
                zIndex:    2,
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
                    position:  'absolute',
                    top: -14, left: '50%', transform: 'translateX(-50%) rotate(-45deg)',
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

      {/* Selected keyframe detail editor */}
      {selectedId && (() => {
        const kf = keyframes.find(k => k.id === selectedId);
        if (!kf) return null;
        return (
          <div style={{
            background: '#0d1526', borderTop: '1px solid #1e293b',
            padding: '6px 12px',
            display: 'flex', gap: 12, alignItems: 'center',
            flexWrap: 'wrap',
          }}>
            <span style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700 }}>
              ⏱ {kf.startTime.toFixed(2)}s
            </span>
            <span style={{ color: '#94a3b8', fontSize: 10 }}>
              zoom {kf.zoom.toFixed(2)}×
            </span>
            <span style={{ color: '#94a3b8', fontSize: 10 }}>
              pan ({Math.round(kf.x)}, {Math.round(kf.y)})
            </span>

            {/* Easing picker */}
            <select
              value={kf.easing ?? 'cinematic'}
              onChange={e => onUpdate?.(selectedSceneId, kf.id, { easing: e.target.value })}
              style={{
                background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155',
                borderRadius: 4, fontSize: 10, padding: '2px 6px', cursor: 'pointer',
              }}
            >
              {EASING_NAMES.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            <button
              onClick={() => setSelectedId(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 12 }}
            >✕</button>
          </div>
        );
      })()}
    </div>
  );
}
