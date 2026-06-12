/**
 * CameraViewfinder.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A VideoScribe-style visual camera rectangle overlaid on the canvas in
 * screen space (outside CameraLayer). The rectangle always shows exactly
 * what the camera currently "sees".
 *
 * Interactions:
 *  • Drag the body      → pan camera
 *  • Drag any corner    → resize / zoom the frame (aspect-locked to 16:9)
 *  • "Set Keyframe" btn → stamps the current view into the store at playheadTime
 *  • Escape / ✕         → exits camera-edit mode
 *
 * Coordinate system
 * ─────────────────
 * The outer canvas div is fixed at CANVAS_W × CANVAS_H CSS pixels.
 * `outerRef.getBoundingClientRect()` gives us the DOM rect including any
 * CSS scale the parent applied (e.g. the editor scales the canvas to fit).
 * We use `scaleRatio = CANVAS_W / rect.width` to convert DOM px ↔ canvas px.
 *
 * The viewfinder rect is computed from `getViewportBounds(cam)` which returns
 * world-space coordinates (same space as graphics). To draw it on screen we
 * use `worldToScreen()` from cameraUtils.
 */

import { useEffect, useRef, useState, useCallback, useId } from 'react';
import { cameraEngine } from './cameraEngine';
import { getViewportBounds, screenToWorld } from './cameraUtils';

const CANVAS_W = 800;
const CANVAS_H = 450;
const HANDLE_SIZE = 14; // px, corner handle hit area
const MIN_FRAME_PX = 80; // minimum frame size in canvas pixels
const ACCENT = '#f59e0b';
const ACCENT_DIM = 'rgba(245,158,11,0.18)';

// The 4 corners as [xSide, ySide] — 'min'/'max'
const CORNERS = [
  { id: 'tl', x: 'min', y: 'min', cursor: 'nwse-resize' },
  { id: 'tr', x: 'max', y: 'min', cursor: 'nesw-resize' },
  { id: 'bl', x: 'min', y: 'max', cursor: 'nesw-resize' },
  { id: 'br', x: 'max', y: 'max', cursor: 'nwse-resize' },
];

// Edge midpoints for resize handles
const EDGES = [
  { id: 'tc', x: 'mid', y: 'min', cursor: 'ns-resize'   },
  { id: 'bc', x: 'mid', y: 'max', cursor: 'ns-resize'   },
  { id: 'lc', x: 'min', y: 'mid', cursor: 'ew-resize'   },
  { id: 'rc', x: 'max', y: 'mid', cursor: 'ew-resize'   },
];

/**
 * Given a viewport bounds rect (world px) and a handle descriptor,
 * compute the screen position of that handle.
 */
function handleScreenPos(vp, handle, cam) {
  const wx = handle.x === 'min' ? vp.x
           : handle.x === 'max' ? vp.x + vp.width
           : vp.x + vp.width / 2;
  const wy = handle.y === 'min' ? vp.y
           : handle.y === 'max' ? vp.y + vp.height
           : vp.y + vp.height / 2;
  // worldToScreen already gives canvas-relative screen pixels
  const { x: sx, y: sy } = worldToScreenCam(wx, wy, cam);
  return { sx, sy };
}

// Inline worldToScreen matching cameraUtils (avoids import-cycle risk)
function worldToScreenCam(wx, wy, cam) {
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  return {
    x: (wx - cx - cam.x) * cam.zoom + cx,
    y: (wy - cy - cam.y) * cam.zoom + cy,
  };
}

export default function CameraViewfinder({
  outerRef,          // ref to the 800×450 outer container
  playheadTime,      // current playhead time in seconds
  selectedSceneId,
  onAddKeyframe,     // (timeS) => void  — stamps keyframe into store
  onExit,            // () => void       — exit camera edit mode
  selectedKeyframe,  // CameraKeyframe | null — keyframe being edited (highlights in gold)
}) {
  // Live camera state for re-rendering the rect
  const [cam, setCam] = useState(() => ({ ...cameraEngine.state }));
  // Ref to the viewfinder box div for direct DOM updates during drag (no React re-render lag)
  const boxRef  = useRef(null);
  const svgRef  = useRef(null);
  const zoomRef = useRef(null);

  // Unique id per instance so the SVG mask never collides if component mounts twice
  const uid = useId().replace(/:/g, '');
  const maskId = `vf-mask-${uid}`;

  useEffect(() => {
    // Guard flag: set to false during cleanup so the RAF-driven subscriber
    // never touches React-managed DOM nodes after they've been removed.
    // Without this, animateTo() keeps firing _notify() via RAF while React
    // is tearing down refs, causing "removeChild: node is not a child" crashes.
    let mounted = true;

    const unsub = cameraEngine.subscribe(s => {
      if (!mounted) return;   // key guard: skip all DOM work after unmount
      setCam({ ...s });
      // Also imperatively update the box position so it tracks instantly
      // (React batching can cause 1-frame lag during fast drag)
      const vp   = getViewportBounds(s);
      const tl   = worldToScreenCam(vp.x,            vp.y,             s);
      const br   = worldToScreenCam(vp.x + vp.width, vp.y + vp.height, s);
      const rL   = tl.x;
      const rT   = tl.y;
      const rW   = br.x - tl.x;
      const rH   = br.y - tl.y;
      if (boxRef.current) {
        boxRef.current.style.left   = `${rL}px`;
        boxRef.current.style.top    = `${rT}px`;
        boxRef.current.style.width  = `${rW}px`;
        boxRef.current.style.height = `${rH}px`;
      }
      if (zoomRef.current) {
        zoomRef.current.textContent = `${Math.round(s.zoom * 100)}%`
          + (s.x !== 0 || s.y !== 0 ? `  ${s.x > 0 ? '→' : '←'}${s.y > 0 ? '↓' : '↑'}` : '');
      }
      if (svgRef.current) {
        const maskRect = svgRef.current.querySelector(`#${maskId} rect:last-child`);
        if (maskRect) {
          maskRect.setAttribute('x',      String(Math.max(0, rL)));
          maskRect.setAttribute('y',      String(Math.max(0, rT)));
          maskRect.setAttribute('width',  String(Math.min(CANVAS_W - Math.max(0, rL), rW)));
          maskRect.setAttribute('height', String(Math.min(CANVAS_H - Math.max(0, rT), rH)));
        }
      }
    });
    cameraEngine.start();
    return () => {
      mounted = false;  // mark unmounted BEFORE unsubscribing so any in-flight RAF tick is a no-op
      unsub();
    };
  }, [maskId]);

  // ── Compute viewfinder rect in screen space ──────────────────────────────
  const vp = getViewportBounds(cam);

  // Top-left and bottom-right in canvas-pixel screen coords
  const tl = worldToScreenCam(vp.x,            vp.y,             cam);
  const br = worldToScreenCam(vp.x + vp.width, vp.y + vp.height, cam);

  // Clamp visible rect for rendering (may extend outside canvas — that's fine)
  const rectLeft   = tl.x;
  const rectTop    = tl.y;
  const rectWidth  = br.x - tl.x;
  const rectHeight = br.y - tl.y;

  // ── Drag state ────────────────────────────────────────────────────────────
  const dragRef = useRef(null); // { type: 'body'|corner/edge id, startClientX, startClientY, startCam, startVp }

  // Convert DOM delta px → canvas delta px (accounts for CSS scaling)
  const domToCanvas = useCallback((domDx, domDy) => {
    const rect = outerRef.current?.getBoundingClientRect();
    if (!rect) return { dx: domDx, dy: domDy };
    const ratio = CANVAS_W / rect.width;
    return { dx: domDx * ratio, dy: domDy * ratio };
  }, [outerRef]);

  const startDrag = useCallback((e, type) => {
    e.preventDefault();
    e.stopPropagation();
    const vp0 = getViewportBounds(cameraEngine.state);
    dragRef.current = {
      type,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCam:     { ...cameraEngine.state },
      startVp:      { ...vp0 },
    };

    const onMove = (ev) => {
      if (!dragRef.current) return;
      const { type, startClientX, startClientY, startCam, startVp } = dragRef.current;
      const { dx, dy } = domToCanvas(ev.clientX - startClientX, ev.clientY - startClientY);

      if (type === 'body') {
        // Pan: shift camera so viewport moves with pointer
        // Dragging right (+dx in screen) means viewport moves right → cam.x increases
        const newX = startCam.x + dx / startCam.zoom;
        const newY = startCam.y + dy / startCam.zoom;
        cameraEngine.set({ ...startCam, x: newX, y: newY });
        return;
      }

      // Resize handle — compute new viewport bounds
      let { x: vpX, y: vpY, width: vpW, height: vpH } = startVp;
      const aspectRatio = CANVAS_W / CANVAS_H; // 16:9, lock aspect

      if (type === 'br' || type === 'tr' || type === 'rc') {
        // Right side moving → change width
        const rawW = Math.max(MIN_FRAME_PX, vpW + dx / startCam.zoom);
        vpW = rawW;
        if (type !== 'rc') vpH = vpW / aspectRatio;
      }
      if (type === 'bl' || type === 'tl' || type === 'lc') {
        // Left side moving → change x and width
        const rawDx = dx / startCam.zoom;
        const rawW  = Math.max(MIN_FRAME_PX, vpW - rawDx);
        vpX = vpX + (vpW - rawW);
        vpW = rawW;
        if (type !== 'lc') vpH = vpW / aspectRatio;
      }
      if (type === 'bc' || type === 'bl' || type === 'br') {
        // Bottom moving → change height only (no aspect lock for edge drags)
        vpH = Math.max(MIN_FRAME_PX / aspectRatio, vpH + dy / startCam.zoom);
      }
      if (type === 'tc' || type === 'tl' || type === 'tr') {
        // Top moving → change y and height
        const rawDy = dy / startCam.zoom;
        const rawH  = Math.max(MIN_FRAME_PX / aspectRatio, vpH - rawDy);
        vpY = vpY + (vpH - rawH);
        vpH = rawH;
      }

      // Convert new viewport bounds back to camera state
      // zoom = CANVAS_W / vpW
      // cam.x = vpCentreX - CANVAS_W/2
      const newZoom = Math.max(0.15, Math.min(5, CANVAS_W / vpW));
      const vpCX    = vpX + vpW / 2;
      const vpCY    = vpY + vpH / 2;
      const newX    = vpCX - CANVAS_W / 2;
      const newY    = vpCY - CANVAS_H / 2;
      cameraEngine.set({ ...startCam, x: newX, y: newY, zoom: newZoom });
    };

    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [domToCanvas]);

  // ── "Set Keyframe" button ────────────────────────────────────────────────
  const handleSetKeyframe = useCallback((e) => {
    e.stopPropagation();
    onAddKeyframe(playheadTime ?? 0);
  }, [onAddKeyframe, playheadTime]);

  // ── Render ────────────────────────────────────────────────────────────────
  // The viewfinder is positioned absolutely inside the 800×450 outer div.
  const isAtIdentity = cam.zoom === 1 && cam.x === 0 && cam.y === 0;

  return (
    <>
      {/* Dark vignette outside the viewfinder rect */}
      <svg
        ref={svgRef}
        style={{
          position: 'absolute', inset: 0,
          width: CANVAS_W, height: CANVAS_H,
          pointerEvents: 'none',
          zIndex: 20,
        }}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <mask id={maskId}>
            <rect width={CANVAS_W} height={CANVAS_H} fill="white" />
            <rect
              x={Math.max(0, rectLeft)} y={Math.max(0, rectTop)}
              width={Math.min(CANVAS_W - Math.max(0, rectLeft), rectWidth)}
              height={Math.min(CANVAS_H - Math.max(0, rectTop), rectHeight)}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width={CANVAS_W} height={CANVAS_H}
          fill="rgba(0,0,0,0.45)"
          mask={`url(#${maskId})`}
        />
      </svg>

      {/* The viewfinder box itself */}
      <div
        ref={boxRef}
        style={{
          position:     'absolute',
          left:         rectLeft,
          top:          rectTop,
          width:        rectWidth,
          height:       rectHeight,
          border:       `2px solid ${ACCENT}`,
          boxSizing:    'border-box',
          zIndex:       21,
          cursor:       'move',
          pointerEvents: 'all',
          // Subtle inner glow
          boxShadow:    `0 0 0 1px rgba(245,158,11,0.25) inset, 0 0 16px rgba(245,158,11,0.12)`,
        }}
        onMouseDown={e => startDrag(e, 'body')}
      >
        {/* Rule-of-thirds grid lines */}
        {[1, 2].map(i => (
          <div key={`h${i}`} style={{
            position:   'absolute',
            left: 0, right: 0,
            top:        `${(i / 3) * 100}%`,
            height:     1,
            background: 'rgba(245,158,11,0.18)',
            pointerEvents: 'none',
          }} />
        ))}
        {[1, 2].map(i => (
          <div key={`v${i}`} style={{
            position:    'absolute',
            top: 0, bottom: 0,
            left:        `${(i / 3) * 100}%`,
            width:       1,
            background:  'rgba(245,158,11,0.18)',
            pointerEvents: 'none',
          }} />
        ))}

        {/* Centre crosshair */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 20, height: 20, pointerEvents: 'none',
        }}>
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(245,158,11,0.4)', transform: 'translateY(-50%)' }} />
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(245,158,11,0.4)', transform: 'translateX(-50%)' }} />
        </div>

        {/* "Set Keyframe" label + button — top bar */}
        <div style={{
          position:    'absolute',
          top:         -32,
          left:        '50%',
          transform:   'translateX(-50%)',
          display:     'flex',
          alignItems:  'center',
          gap:         6,
          pointerEvents: 'all',
          whiteSpace:  'nowrap',
        }}>
          {/* Zoom readout */}
          <span ref={zoomRef} style={{
            background:   'rgba(15,23,42,0.92)',
            border:       `1px solid rgba(245,158,11,0.35)`,
            color:        '#94a3b8',
            fontSize:     10,
            fontWeight:   700,
            padding:      '3px 7px',
            borderRadius: 4,
            fontFamily:   'ui-monospace, monospace',
            letterSpacing: 0.5,
            userSelect:   'none',
          }}>
            {Math.round(cam.zoom * 100)}%
            {cam.x !== 0 || cam.y !== 0
              ? `  ${cam.x > 0 ? '→' : '←'}${cam.y > 0 ? '↓' : '↑'}`
              : ''}
          </span>

          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={handleSetKeyframe}
            style={{
              background:   'rgba(245,158,11,0.9)',
              border:       'none',
              color:        '#0f172a',
              fontSize:     11,
              fontWeight:   800,
              padding:      '4px 10px',
              borderRadius: 4,
              cursor:       'pointer',
              display:      'flex',
              alignItems:   'center',
              gap:          4,
              letterSpacing: 0.3,
              boxShadow:    '0 2px 8px rgba(245,158,11,0.4)',
            }}
          >
            <DiamondIcon /> Set Keyframe
          </button>
        </div>

        {/* Corner handles */}
        {CORNERS.map(h => {
          const isLeft  = h.x === 'min';
          const isTop   = h.y === 'min';
          return (
            <div
              key={h.id}
              onMouseDown={e => startDrag(e, h.id)}
              style={{
                position:  'absolute',
                [isLeft  ? 'left'   : 'right']:  -(HANDLE_SIZE / 2),
                [isTop   ? 'top'    : 'bottom']: -(HANDLE_SIZE / 2),
                width:     HANDLE_SIZE,
                height:    HANDLE_SIZE,
                background: ACCENT,
                borderRadius: 2,
                cursor:    h.cursor,
                zIndex:    22,
                boxShadow: '0 0 0 2px rgba(15,23,42,0.6)',
              }}
            />
          );
        })}

        {/* Edge midpoint handles */}
        {EDGES.map(h => {
          const isHoriz = h.x === 'mid'; // top/bottom edge — horizontal bar
          return (
            <div
              key={h.id}
              onMouseDown={e => startDrag(e, h.id)}
              style={{
                position:  'absolute',
                ...(h.x === 'mid'
                  ? { left: '50%', transform: h.y === 'min' ? 'translate(-50%, -50%)' : 'translate(-50%, 50%)' }
                  : { top: '50%',  transform: h.x === 'min' ? 'translate(-50%, -50%)' : 'translate(50%, -50%)' }),
                ...(h.y === 'min' ? { top: 0 } : h.y === 'max' ? { bottom: 0 } : {}),
                ...(h.x === 'min' ? { left: 0 } : h.x === 'max' ? { right: 0 } : {}),
                width:     isHoriz ? HANDLE_SIZE * 2 : HANDLE_SIZE / 2,
                height:    isHoriz ? HANDLE_SIZE / 2 : HANDLE_SIZE * 2,
                background: 'rgba(245,158,11,0.7)',
                borderRadius: 2,
                cursor:    h.cursor,
                zIndex:    22,
              }}
            />
          );
        })}
      </div>

      {/* Exit camera edit mode — top-left badge */}
      <div style={{
        position:      'absolute',
        top:           10,
        left:          '50%',
        transform:     'translateX(-50%)',
        zIndex:        25,
        display:       'flex',
        alignItems:    'center',
        gap:           8,
        pointerEvents: 'all',
      }}>
        <div style={{
          background:     'rgba(245,158,11,0.15)',
          border:         '1px solid rgba(245,158,11,0.5)',
          color:          '#fbbf24',
          fontSize:       11,
          fontWeight:     700,
          padding:        '4px 12px',
          borderRadius:   20,
          backdropFilter: 'blur(4px)',
          letterSpacing:  0.5,
          userSelect:     'none',
        }}>
          🎥 Camera Edit — drag frame to pan · drag corners to zoom
        </div>
        <button
          onClick={onExit}
          title="Exit camera edit mode (Escape)"
          style={{
            background:   'rgba(15,23,42,0.88)',
            border:       '1px solid rgba(255,255,255,0.12)',
            color:        '#94a3b8',
            borderRadius: 4,
            width:        22, height: 22,
            cursor:       'pointer',
            fontSize:     13,
            display:      'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)',
          }}
        >×</button>
      </div>
    </>
  );
}

function DiamondIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <path d="M5 0L10 5L5 10L0 5Z" />
    </svg>
  );
}