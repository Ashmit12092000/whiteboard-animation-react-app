// @ts-nocheck
import { useState, useRef, useCallback, useEffect } from 'react';
import EditorCanvas from './components/canvas/EditorCanvas';
import EditorLibrary from './components/library/EditorLibrary';
import EditorActions from './components/actions/EditorActions';
import EditorTimeline from './components/timeline/EditorTimeline';
import MobileEditor from './MobileEditor';
import { useMobile } from './hooks/useMobile';
import { useStore } from './store';
import { getCanvasSize } from './utils/animation';

// Desktop timeline panel constraints
const TL_MIN     = 100;
const TL_MAX     = 400;
const TL_DEFAULT = 220;

export default function EditorView() {
  const isMobile = useMobile();
  const project = useStore(s => s.project);
  const { w: CANVAS_W, h: CANVAS_H } = getCanvasSize(project?.canvasSizeKey);

  // ── Desktop: resizable timeline height ────────────────────────────────────
  const [tlHeight, setTlHeight] = useState(TL_DEFAULT);
  const tlDragRef = useRef(null);

  const onTlDividerMouseDown = useCallback((e) => {
    e.preventDefault();
    tlDragRef.current = { startY: e.clientY, startH: tlHeight };
    const onMove = (ev) => {
      const delta = tlDragRef.current.startY - ev.clientY;
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

  // ── Desktop: auto-fit canvas scale ────────────────────────────────────────
  const [canvasScale, setCanvasScale] = useState(1);
  const canvasWrapRef = useRef(null);

  useEffect(() => {
    if (isMobile) return;
    const el = canvasWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      const pad = 32;
      setCanvasScale(Math.min(1, (width - pad) / CANVAS_W, (height - pad) / CANVAS_H));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile, CANVAS_W, CANVAS_H]);

  // ── Mobile: delegate to MobileEditor ─────────────────────────────────────
  if (isMobile) {
    return <MobileEditor />;
  }

  // ── Desktop layout ────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Middle row: library + canvas + actions */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <EditorLibrary />

        <div
          ref={canvasWrapRef}
          style={{
            flex: 1, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: '#0d1526', overflow: 'hidden',
            padding: 16, minWidth: 0,
          }}
        >
          <div style={{
            zoom: canvasScale,
            flexShrink: 0,
            width:  CANVAS_W,
            height: CANVAS_H,
          }}>
            <EditorCanvas />
          </div>
        </div>

        <EditorActions />
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={onTlDividerMouseDown}
        style={{
          height: 6, background: '#0a0f1a',
          borderTop: '1px solid #1e293b',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'ns-resize', flexShrink: 0, userSelect: 'none',
        }}
      >
        <div style={{ width: 36, height: 3, borderRadius: 2, background: '#1e293b' }} />
      </div>

      {/* Timeline */}
      <div style={{ height: tlHeight, flexShrink: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <EditorTimeline />
      </div>
    </div>
  );
}