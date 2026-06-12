/**
 * CameraControls.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Floating HUD controls overlaid on the canvas:
 *  • Zoom in / out / fit / reset
 *  • Camera edit mode toggle
 *  • Grid toggle + settings popover (size, type)
 *  • Snap-to-grid toggle
 */

import { useState, useEffect, useRef } from 'react';
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

// ── Grid settings popover ────────────────────────────────────────────────────

const GRID_SIZES = [20, 40, 80];

function GridSettingsPopover({ gridSize, gridType, onSetGridSize, onSetGridType, onClose }) {
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const optionStyle = (active) => ({
    flex: 1,
    padding: '5px 0',
    background: active ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
    border: active ? '1px solid rgba(99,102,241,0.6)' : '1px solid rgba(255,255,255,0.1)',
    color: active ? '#a5b4fc' : '#94a3b8',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 700,
    textAlign: 'center',
    transition: 'all 0.1s',
    userSelect: 'none',
  });

  return (
    <div
      ref={ref}
      style={{
        position:      'absolute',
        bottom:        36,
        right:         0,
        width:         182,
        background:    'rgba(13,21,38,0.97)',
        border:        '1px solid rgba(99,102,241,0.3)',
        borderRadius:  10,
        padding:       '10px 12px',
        zIndex:        50,
        boxShadow:     '0 8px 32px rgba(0,0,0,0.6)',
        backdropFilter:'blur(12px)',
      }}
    >
      {/* Size row */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ color: '#64748b', fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 5 }}>
          GRID SIZE
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {GRID_SIZES.map(s => (
            <button key={s} onClick={() => onSetGridSize(s)} style={optionStyle(gridSize === s)}>
              {s}px
            </button>
          ))}
        </div>
      </div>

      {/* Type row */}
      <div>
        <div style={{ color: '#64748b', fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 5 }}>
          GRID TYPE
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => onSetGridType('lines')} style={optionStyle(gridType === 'lines')}>
            Lines
          </button>
          <button onClick={() => onSetGridType('dots')} style={optionStyle(gridType === 'dots')}>
            Dots
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CameraControls({
  graphics,
  selectedSceneId,
  cameraEditMode,
  onToggleCameraEdit,
  onAddKeyframe,
  playheadTime,
  // Grid & snap
  showGrid,
  snapToGrid,
  gridSize,
  gridType,
  onToggleGrid,
  onToggleSnap,
  onSetGridSize,
  onSetGridType,
}) {
  const { zoomIn, zoomOut, resetCamera, fitScene } = useCameraControls();
  const [zoom, setZoom] = useState(1);
  const [showGridSettings, setShowGridSettings] = useState(false);

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
      {/* Camera edit mode toggle */}
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

      {/* Grid & snap controls */}
      <div style={{ display: 'flex', gap: 4, pointerEvents: 'all', justifyContent: 'flex-end', position: 'relative' }}>
        {/* Snap toggle */}
        <HudButton
          onClick={onToggleSnap}
          title={snapToGrid ? 'Snap to grid: ON — click to disable' : 'Snap to grid: OFF — click to enable'}
          active={snapToGrid}
          style={{ minWidth: 36, gap: 4 }}
        >
          <MagnetIcon />
          Snap
        </HudButton>

        {/* Grid toggle */}
        <HudButton
          onClick={onToggleGrid}
          title={showGrid ? 'Hide grid' : 'Show grid'}
          active={showGrid}
          style={{ minWidth: 36, gap: 4 }}
        >
          <GridIcon />
          Grid
        </HudButton>

        {/* Grid settings chevron — only visible when grid is on */}
        {showGrid && (
          <div style={{ position: 'relative' }}>
            <HudButton
              onClick={() => setShowGridSettings(v => !v)}
              title="Grid settings"
              active={showGridSettings}
              style={{ padding: '0 7px', minWidth: 28 }}
            >
              <ChevronIcon up={showGridSettings} />
            </HudButton>

            {showGridSettings && (
              <GridSettingsPopover
                gridSize={gridSize}
                gridType={gridType}
                onSetGridSize={(s) => { onSetGridSize(s); }}
                onSetGridType={(t) => { onSetGridType(t); }}
                onClose={() => setShowGridSettings(false)}
              />
            )}
          </div>
        )}
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
function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="12" height="12" rx="1" />
      <line x1="1" y1="5.67" x2="13" y2="5.67" />
      <line x1="1" y1="9.33" x2="13" y2="9.33" />
      <line x1="5.67" y1="1" x2="5.67" y2="13" />
      <line x1="9.33" y1="1" x2="9.33" y2="13" />
    </svg>
  );
}
function MagnetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 15A6 6 0 0 0 18 15" />
      <line x1="6"  y1="15" x2="6"  y2="4" />
      <line x1="18" y1="15" x2="18" y2="4" />
      <line x1="3"  y1="4"  x2="9"  y2="4" />
      <line x1="15" y1="4"  x2="21" y2="4" />
    </svg>
  );
}
function ChevronIcon({ up }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {up
        ? <polyline points="2,7 5,3 8,7" />
        : <polyline points="2,3 5,7 8,3" />
      }
    </svg>
  );
}