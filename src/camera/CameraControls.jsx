/**
 * CameraControls.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Floating HUD controls overlaid on the canvas:
 *  • Zoom in / out
 *  • Fit scene
 *  • Reset
 *  • Current zoom readout
 *  • "Add keyframe at playhead" button (when in camera-edit mode)
 */

import { useState, useEffect } from 'react';
import { cameraEngine } from './cameraEngine';
import { useCameraControls } from './cameraHooks';

const BTN = {
  background: 'rgba(15,23,42,0.88)',
  border:     '1px solid rgba(255,255,255,0.1)',
  color:      '#e2e8f0',
  borderRadius: 6,
  cursor:     'pointer',
  fontSize:   13,
  fontWeight: 600,
  lineHeight: 1,
  display:    'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding:    '0 9px',
  height:     30,
  backdropFilter: 'blur(8px)',
  transition: 'background 0.12s, border-color 0.12s',
  flexShrink: 0,
  userSelect: 'none',
  gap: 5,
};

const BTN_HOVER = {
  background:   'rgba(30,41,59,0.95)',
  borderColor:  'rgba(255,255,255,0.22)',
};

function HudButton({ onClick, title, children, active, style: extra }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        ...BTN,
        ...(hovered ? BTN_HOVER : {}),
        ...(active ? { borderColor: '#f59e0b', color: '#f59e0b' } : {}),
        ...extra,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </button>
  );
}

export default function CameraControls({
  graphics,
  selectedSceneId,
  cameraEditMode,
  onToggleCameraEdit,
  onAddKeyframe,
  playheadTime,
}) {
  const { zoomIn, zoomOut, resetCamera, fitScene } = useCameraControls();
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const unsub = cameraEngine.subscribe(s => setZoom(s.zoom));
    return unsub;
  }, []);

  const pct = Math.round(zoom * 100);

  return (
    <div style={{
      position:   'absolute',
      bottom:     12,
      right:      12,
      display:    'flex',
      flexDirection: 'column',
      gap:        6,
      zIndex:     30,
      pointerEvents: 'none',
    }}>
      {/* Camera edit mode toggle only — keyframe capture is in the viewfinder */}
      <div style={{ display: 'flex', gap: 6, pointerEvents: 'all', justifyContent: 'flex-end' }}>
        <HudButton
          onClick={onToggleCameraEdit}
          title={cameraEditMode ? 'Exit camera edit mode (Escape)' : 'Camera edit mode — drag frame to set view'}
          active={cameraEditMode}
          style={{ minWidth: 36 }}
        >
          <CameraIcon />
          {cameraEditMode ? ' Editing' : ' Camera'}
        </HudButton>
      </div>

      {/* Zoom controls */}
      <div style={{ display: 'flex', gap: 4, pointerEvents: 'all', justifyContent: 'flex-end' }}>
        <HudButton onClick={() => fitScene(graphics)} title="Fit all objects in view">
          <FitIcon />
        </HudButton>
        <HudButton onClick={resetCamera} title="Reset camera (100%)">
          <ResetIcon />
        </HudButton>

        <div style={{
          ...BTN,
          background: 'rgba(15,23,42,0.88)',
          pointerEvents: 'none',
          minWidth: 52,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
        }}>
          {pct}%
        </div>

        <HudButton onClick={zoomOut} title="Zoom out">
          <MinusIcon />
        </HudButton>
        <HudButton onClick={zoomIn} title="Zoom in">
          <PlusIcon />
        </HudButton>
      </div>
    </div>
  );
}

// ─── Icons ─────────────────────────────────────────────────────────────────────
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="7" y1="2" x2="7" y2="12" /><line x1="2" y1="7" x2="12" y2="7" />
    </svg>
  );
}
function MinusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="2" y1="7" x2="12" y2="7" />
    </svg>
  );
}
function ResetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 7a5 5 0 1 0 1.2-3.2" /><polyline points="2,2 2,6 6,6" />
    </svg>
  );
}
function FitIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <line x1="1" y1="1" x2="4" y2="4" /><line x1="13" y1="1" x2="10" y2="4" />
      <line x1="1" y1="13" x2="4" y2="10" /><line x1="13" y1="13" x2="10" y2="10" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 7L16 12l7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}
function KeyframeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <path d="M6 1L11 6L6 11L1 6Z" />
    </svg>
  );
}
