import { useState, useRef, useCallback, useEffect } from 'react';
import EditorCanvas from './components/canvas/EditorCanvas';
import EditorLibrary from './components/library/EditorLibrary';
import EditorActions from './components/actions/EditorActions';
import EditorTimeline from './components/timeline/EditorTimeline';
import PixabayModal from './components/dialogs/PixabayModal';
import { useStore } from './store';
import { getCanvasSize } from './utils/animation';

// ── Bottom toolbar definition ─────────────────────────────────────────────────
const TOOLS = [
  { id: 'graphics', icon: '👤', label: 'Elements', sheet: 'library' },
  { id: 'shapes',   icon: '⬟',  label: 'Shapes',   sheet: 'library' },
  { id: 'text',     icon: 'T',  label: 'Text',      sheet: 'library' },
  { id: 'images',   icon: '🖼', label: 'Images',    sheet: 'library' },
  { id: 'ai',       icon: '✨', label: 'AI',        sheet: 'library' },
  { id: 'audio',    icon: '♪',  label: 'Audio',     sheet: 'library' },
  { id: 'edit',     icon: '⚡', label: 'Edit',      sheet: 'actions' },
];

const TOOLBAR_H  = 60;
const SHEET_DEFAULT_H = Math.round(window.innerHeight * 0.45);
const SHEET_MIN_H = 140;
const SHEET_MAX_H = Math.round(window.innerHeight * 0.88);
const TIMELINE_H  = 150;

export default function MobileEditor() {
  const project           = useStore(s => s.project);
  const selectedGraphicId = useStore(s => s.selectedGraphicId);
  const undo              = useStore(s => s.undo);
  const redo              = useStore(s => s.redo);
  const undoStack         = useStore(s => s.undoStack);
  const redoStack         = useStore(s => s.redoStack);
  const saveProject       = useStore(s => s.saveProject);
  const openPreviewModal  = useStore(s => s.openPreviewModal);
  const closeProject      = useStore(s => s.closeProject);

  const { w: CANVAS_W, h: CANVAS_H } = getCanvasSize(project?.canvasSizeKey);

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTool,   setActiveTool]   = useState(null); // tool id or null
  const [sheetHeight,  setSheetHeight]  = useState(SHEET_DEFAULT_H);
  const [showTimeline, setShowTimeline] = useState(false);
  const [canvasScale,  setCanvasScale]  = useState(1);
  const [pixabayOpen,  setPixabayOpen]  = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const canvasWrapRef = useRef(null);
  const pinchRef      = useRef(null);
  const sheetDragRef  = useRef(null);

  // ── Auto-scale canvas to fill available space ─────────────────────────────
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      const pad = 12;
      const s   = Math.min((width - pad) / CANVAS_W, (height - pad) / CANVAS_H);
      setCanvasScale(Math.min(1, Math.max(0.1, s)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [CANVAS_W, CANVAS_H]);

  // ── Pinch-to-zoom ─────────────────────────────────────────────────────────
  const onCanvasTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { startDist: Math.hypot(dx, dy), startScale: canvasScale };
    }
  }, [canvasScale]);

  const onCanvasTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const dx   = e.touches[0].clientX - e.touches[1].clientX;
      const dy   = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const next = Math.min(3, Math.max(0.1, pinchRef.current.startScale * (dist / pinchRef.current.startDist)));
      setCanvasScale(next);
    }
  }, []);

  const onCanvasTouchEnd = useCallback((e) => {
    if (e.touches.length < 2) pinchRef.current = null;
  }, []);

  // ── Bottom sheet drag handle ──────────────────────────────────────────────
  const onSheetHandleDrag = useCallback((e) => {
    const startY  = e.touches ? e.touches[0].clientY : e.clientY;
    const startH  = sheetHeight;
    sheetDragRef.current = true;

    const onMove = (ev) => {
      const cy    = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const delta = startY - cy;
      setSheetHeight(Math.min(SHEET_MAX_H, Math.max(SHEET_MIN_H, startH + delta)));
    };
    const onEnd = () => {
      sheetDragRef.current = false;
      window.removeEventListener('mousemove',  onMove);
      window.removeEventListener('mouseup',    onEnd);
      window.removeEventListener('touchmove',  onMove);
      window.removeEventListener('touchend',   onEnd);
    };
    window.addEventListener('mousemove',  onMove);
    window.addEventListener('mouseup',    onEnd);
    window.addEventListener('touchmove',  onMove, { passive: false });
    window.addEventListener('touchend',   onEnd);
  }, [sheetHeight]);

  // ── Tool tap ──────────────────────────────────────────────────────────────
  const handleToolTap = (toolId) => {
    if (activeTool === toolId) {
      setActiveTool(null);
    } else {
      setActiveTool(toolId);
      setSheetHeight(SHEET_DEFAULT_H);
    }
  };

  const sheetOpen = activeTool !== null;
  const activeToolDef = TOOLS.find(t => t.id === activeTool);

  // Library initial tab: same as tool id for library tools
  const libraryTab = activeToolDef?.sheet === 'library' ? activeTool : 'graphics';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#060c18', position: 'relative' }}>

      {/* ── Compact mobile top bar ──────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 10px', height: 46,
        background: '#0f172a', borderBottom: '1px solid #1e293b',
        flexShrink: 0, userSelect: 'none',
      }}>
        {/* Home */}
        <button onClick={closeProject} style={iconBtnStyle} title="Home">🏠</button>

        {/* Project title */}
        <span style={{ flex: 1, textAlign: 'center', color: '#f59e0b', fontFamily: 'Georgia, serif', fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {project?.title || 'Untitled'}
        </span>

        {/* Save */}
        <button onClick={saveProject} style={iconBtnStyle} title="Save">💾</button>
        {/* Preview */}
        <button onClick={openPreviewModal} style={{ ...iconBtnStyle, color: '#10b981' }} title="Preview">▶</button>
        {/* Undo */}
        <button onClick={undo} disabled={undoStack.length === 0} style={{ ...iconBtnStyle, opacity: undoStack.length === 0 ? 0.3 : 1 }} title="Undo">↩</button>
        {/* Redo */}
        <button onClick={redo} disabled={redoStack.length === 0} style={{ ...iconBtnStyle, opacity: redoStack.length === 0 ? 0.3 : 1 }} title="Redo">↪</button>
        {/* Pixabay */}
        <button onClick={() => setPixabayOpen(true)} style={{ ...iconBtnStyle, color: '#60a5fa' }} title="Pixabay">🔍</button>
      </div>

      {/* ── Canvas area ────────────────────────────────────────────────────── */}
      <div
        ref={canvasWrapRef}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0d1526', overflow: 'hidden',
          touchAction: 'none', minHeight: 0,
        }}
        onTouchStart={onCanvasTouchStart}
        onTouchMove={onCanvasTouchMove}
        onTouchEnd={onCanvasTouchEnd}
      >
        <div style={{
          transform: `scale(${canvasScale})`,
          transformOrigin: 'center center',
          flexShrink: 0,
          width: CANVAS_W, height: CANVAS_H,
        }}>
          <EditorCanvas />
        </div>
      </div>

      {/* ── Timeline strip (toggle) ─────────────────────────────────────────── */}
      {showTimeline && (
        <div style={{ height: TIMELINE_H, flexShrink: 0, borderTop: '1px solid #1e293b', overflow: 'hidden', background: '#0a0f1a' }}>
          <EditorTimeline />
        </div>
      )}

      {/* ── Bottom toolbar ──────────────────────────────────────────────────── */}
      <div className="mobile-safe-bottom" style={{
        height: TOOLBAR_H, background: '#0f172a',
        borderTop: '1px solid #1e293b',
        display: 'flex', alignItems: 'stretch',
        overflowX: 'auto', flexShrink: 0,
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}>
        {TOOLS.map(tool => {
          const isActive = activeTool === tool.id;
          const showDot  = tool.id === 'edit' && !!selectedGraphicId;
          return (
            <button
              key={tool.id}
              onClick={() => handleToolTap(tool.id)}
              style={{
                flex: '0 0 auto', minWidth: 62,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 3,
                padding: '0 6px',
                background: 'none', border: 'none',
                color: isActive ? '#f59e0b' : '#6b7280',
                cursor: 'pointer', position: 'relative',
                transition: 'color 0.15s',
                touchAction: 'manipulation',
              }}
            >
              {showDot && (
                <div style={{ position: 'absolute', top: 7, right: 10, width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', border: '1.5px solid #0f172a' }} />
              )}
              <span style={{ fontSize: tool.id === 'text' ? 18 : 20, lineHeight: 1 }}>{tool.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.2, whiteSpace: 'nowrap' }}>{tool.label}</span>
              {isActive && (
                <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 28, height: 2, background: '#f59e0b', borderRadius: 1 }} />
              )}
            </button>
          );
        })}

        {/* Divider */}
        <div style={{ width: 1, background: '#1e293b', margin: '10px 2px', flexShrink: 0 }} />

        {/* Timeline toggle */}
        <button
          onClick={() => setShowTimeline(p => !p)}
          style={{
            flex: '0 0 auto', minWidth: 62,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 3,
            padding: '0 6px', background: 'none', border: 'none',
            color: showTimeline ? '#f59e0b' : '#6b7280',
            cursor: 'pointer', position: 'relative',
            touchAction: 'manipulation', transition: 'color 0.15s',
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1 }}>⏱</span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.2 }}>Timeline</span>
          {showTimeline && (
            <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 28, height: 2, background: '#f59e0b', borderRadius: 1 }} />
          )}
        </button>
      </div>

      {/* ── Bottom sheet ────────────────────────────────────────────────────── */}
      {sheetOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setActiveTool(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, touchAction: 'none' }}
          />

          {/* Sheet */}
          <div className="mobile-sheet-enter" style={{
            position: 'fixed',
            bottom: TOOLBAR_H,
            left: 0, right: 0,
            height: sheetHeight,
            background: '#111827',
            borderRadius: '16px 16px 0 0',
            borderTop: '1px solid #334155',
            zIndex: 301,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 -12px 40px rgba(0,0,0,0.6)',
            willChange: 'transform',
          }}>
            {/* Drag handle */}
            <div
              onMouseDown={onSheetHandleDrag}
              onTouchStart={onSheetHandleDrag}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: 32, flexShrink: 0, cursor: 'ns-resize', touchAction: 'none',
              }}
            >
              <div style={{ width: 36, height: 4, background: '#334155', borderRadius: 2 }} />
            </div>

            {/* Sheet label */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 16px 8px', flexShrink: 0,
            }}>
              <span style={{ fontSize: 16 }}>{activeToolDef?.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>
                {activeToolDef?.label}
              </span>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => setActiveTool(null)}
                style={{ background: 'none', border: 'none', color: '#475569', fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
              >✕</button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {activeToolDef?.sheet === 'library' && (
                <EditorLibrary initialTab={libraryTab} />
              )}
              {activeToolDef?.sheet === 'actions' && (
                <EditorActions />
              )}
            </div>
          </div>
        </>
      )}

      {/* Pixabay modal */}
      {pixabayOpen && <PixabayModal onClose={() => setPixabayOpen(false)} />}
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────
const iconBtnStyle = {
  width: 34, height: 34,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none',
  color: '#94a3b8', fontSize: 16, cursor: 'pointer',
  borderRadius: 7, flexShrink: 0,
  touchAction: 'manipulation',
};
