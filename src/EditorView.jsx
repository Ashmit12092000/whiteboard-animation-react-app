import { useState, useRef, useCallback, useEffect } from 'react';
import EditorCanvas from './components/canvas/EditorCanvas';
import EditorLibrary from './components/library/EditorLibrary';
import EditorActions from './components/actions/EditorActions';
import EditorTimeline from './components/timeline/EditorTimeline';
import { useMobile } from './hooks/useMobile';
import { useStore } from './store';
import { getCanvasSize } from './utils/animation';

const PANEL_MIN = 120;   // px — minimum bottom panel height (mobile)
const PANEL_MAX = 520;   // px — maximum bottom panel height (mobile)
const PANEL_DEFAULT = Math.round(window.innerHeight * 0.38);

// Desktop timeline panel
const TL_MIN = 100;      // px — minimum timeline height (desktop)
const TL_MAX = 400;      // px — maximum timeline height (desktop)
const TL_DEFAULT = 220;  // px — default timeline height (desktop)

export default function EditorView() {
  const isMobile = useMobile();
  const project = useStore(s => s.project);
  const { w: CANVAS_W, h: CANVAS_H } = getCanvasSize(project?.canvasSizeKey);
  const [mobilePanel, setMobilePanel] = useState('library');

  // ── Resizable panel height ────────────────────────────────────────────────
  const [panelHeight, setPanelHeight] = useState(PANEL_DEFAULT);
  const dragRef = useRef(null); // { startY, startH }

  const onDividerMouseDown = useCallback((e) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: panelHeight };
    const onMove = (ev) => {
      const delta = dragRef.current.startY - ev.clientY; // drag up → increase height
      setPanelHeight(Math.min(PANEL_MAX, Math.max(PANEL_MIN, dragRef.current.startH + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [panelHeight]);

  const onDividerTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    dragRef.current = { startY: touch.clientY, startH: panelHeight };
    const onMove = (ev) => {
      ev.preventDefault();
      const delta = dragRef.current.startY - ev.touches[0].clientY;
      setPanelHeight(Math.min(PANEL_MAX, Math.max(PANEL_MIN, dragRef.current.startH + delta)));
    };
    const onEnd = () => {
      dragRef.current = null;
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }, [panelHeight]);

  // ── Desktop timeline resizable height ─────────────────────────────────────
  const [tlHeight, setTlHeight] = useState(TL_DEFAULT);
  const tlDragRef = useRef(null);

  const onTlDividerMouseDown = useCallback((e) => {
    e.preventDefault();
    tlDragRef.current = { startY: e.clientY, startH: tlHeight };
    const onMove = (ev) => {
      const delta = tlDragRef.current.startY - ev.clientY; // drag up → taller
      setTlHeight(Math.min(TL_MAX, Math.max(TL_MIN, tlDragRef.current.startH + delta)));
    };
    const onUp = () => {
      tlDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [tlHeight]);

  if (isMobile) {
    // ── Pinch-to-zoom on canvas wrapper ──────────────────────────────────────
    const [canvasScale, setCanvasScale] = useState(1);
    const pinchRef = useRef(null); // { startDist, startScale }

    const onCanvasTouchStart = useCallback((e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchRef.current = { startDist: Math.hypot(dx, dy), startScale: canvasScale };
      }
    }, [canvasScale]);

    const onCanvasTouchMove = useCallback((e) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault(); // block scroll during pinch
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const ratio = dist / pinchRef.current.startDist;
        const next = Math.min(3, Math.max(0.2, pinchRef.current.startScale * ratio));
        setCanvasScale(next);
      }
    }, []);

    const onCanvasTouchEnd = useCallback((e) => {
      if (e.touches.length < 2) pinchRef.current = null;
    }, []);

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Canvas area — pinch-zoomable wrapper */}
        <div
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#0d1526', overflow: 'hidden', padding: 8,
            touchAction: 'none', // hand ALL touch to our handlers
          }}
          onTouchStart={onCanvasTouchStart}
          onTouchMove={onCanvasTouchMove}
          onTouchEnd={onCanvasTouchEnd}
        >
          {/* Scale wrapper — sits around the fixed-size 800×450 canvas */}
          <div style={{
            transform: `scale(${canvasScale})`,
            transformOrigin: 'center center',
            flexShrink: 0,
          }}>
            <EditorCanvas />
          </div>
        </div>

        {/* Timeline */}
        <EditorTimeline />

        {/* ── Drag handle ── */}
        <div
          onMouseDown={onDividerMouseDown}
          onTouchStart={onDividerTouchStart}
          style={{
            height: 20, background: '#0f172a',
            borderTop: '1px solid #1e293b',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'ns-resize', flexShrink: 0, userSelect: 'none',
            touchAction: 'none',
          }}
        >
          {/* Pill indicator */}
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#334155' }} />
        </div>

        {/* Bottom panel */}
        <div style={{ height: panelHeight, background: '#111827', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
          {/* Tab selector */}
          <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
            {[{ id: 'library', label: '📚 Library' }, { id: 'actions', label: '⚡ Actions' }].map(t => (
              <button
                key={t.id}
                onClick={() => setMobilePanel(t.id)}
                style={{
                  flex: 1, padding: '8px 0', background: 'none', border: 'none',
                  color: mobilePanel === t.id ? '#f59e0b' : '#6b7280',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  borderBottom: mobilePanel === t.id ? '2px solid #f59e0b' : '2px solid transparent',
                  touchAction: 'manipulation',
                }}
              >{t.label}</button>
            ))}
          </div>
          {/* Panel content */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {mobilePanel === 'library' ? <EditorLibrary /> : <EditorActions />}
          </div>
        </div>
      </div>
    );
  }

  // ── Scale canvas to fit available space ─────────────────────────────────
  const canvasWrapRef = useRef(null);
  const [canvasScale, setCanvasScale] = useState(1);

  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      const pad = 32; // 16px each side
      const scaleX = (width  - pad) / CANVAS_W;
      const scaleY = (height - pad) / CANVAS_H;
      setCanvasScale(Math.min(1, scaleX, scaleY)); // never upscale
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [CANVAS_W, CANVAS_H]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Middle row: library + canvas + actions */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <EditorLibrary />

        {/* Canvas area - centred, scales to fit so HUD buttons are always visible */}
        <div
          ref={canvasWrapRef}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0d1526',
            overflow: 'hidden',
            padding: 16,
            minWidth: 0,
          }}
        >
          <div style={{
            transform: `scale(${canvasScale})`,
            transformOrigin: 'center center',
            flexShrink: 0,
            // Reserve the scaled visual footprint so the parent centres correctly
            width:  CANVAS_W * canvasScale,
            height: CANVAS_H * canvasScale,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <EditorCanvas />
          </div>
        </div>

        <EditorActions />
      </div>

      {/* Drag handle between canvas and timeline */}
      <div
        onMouseDown={onTlDividerMouseDown}
        style={{
          height: 6,
          background: '#0a0f1a',
          borderTop: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'ns-resize',
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        <div style={{ width: 36, height: 3, borderRadius: 2, background: '#1e293b' }} />
      </div>

      {/* Bottom: timeline — height-constrained and resizable */}
      <div style={{ height: tlHeight, flexShrink: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <EditorTimeline />
      </div>
    </div>
  );
}