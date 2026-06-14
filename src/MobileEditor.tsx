// @ts-nocheck
import { useState, useRef, useCallback, useEffect } from 'react';
import EditorCanvas from './components/canvas/EditorCanvas';
import EditorLibrary from './components/library/EditorLibrary';
import EditorTimeline from './components/timeline/EditorTimeline';
import PixabayModal from './components/dialogs/PixabayModal';
import LoadJsonButton from './components/shared/LoadJsonButton';
import { useStore } from './store';
import { getCanvasSize } from './utils/animation';

// ─── Constants ─────────────────────────────────────────────────────────────────
const TOPBAR_H    = 46;
const TOOLBAR_H   = 56;   // bottom tool tabs
const DIVIDER_H   = 18;   // drag-handle between canvas and timeline
const TIMELINE_MIN = 120;
const TIMELINE_MAX_FRAC = 0.72; // max fraction of remaining space

// ─── Style helpers ─────────────────────────────────────────────────────────────
const iconBtnStyleBase = {
  width: 34, height: 34,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: '1px solid transparent',
  color: '#94a3b8', fontSize: 18, cursor: 'pointer',
  borderRadius: 7, flexShrink: 0,
  touchAction: 'manipulation',
};
const iconBtnStyle = { ...iconBtnStyleBase, fontSize: 16 };

// ─── Overflow menu (⋮) ────────────────────────────────────────────────────────
function MobileOverflowMenu({ items }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="More options"
        style={{
          ...iconBtnStyleBase,
          color: open ? '#f59e0b' : '#94a3b8',
          background: open ? '#1e293b' : 'none',
          border: open ? '1px solid #334155' : '1px solid transparent',
        }}
      >
        {open ? '✕' : '⋮'}
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 400 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'fixed', top: TOPBAR_H + 4, right: 8, zIndex: 401,
            background: '#1e293b', border: '1px solid #334155',
            borderRadius: 12, minWidth: 220, overflow: 'hidden',
            boxShadow: '0 16px 50px rgba(0,0,0,0.7)',
          }}>
            {items.map((item, i) =>
              item === '---' ? (
                <div key={i} style={{ height: 1, background: '#334155', margin: '3px 0' }} />
              ) : (
                <button
                  key={i}
                  onClick={() => { item.action(); setOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', padding: '12px 16px',
                    background: 'none', border: 'none', textAlign: 'left',
                    color: item.danger ? '#ef4444' : '#e2e8f0',
                    fontSize: 14, cursor: 'pointer',
                  }}
                  onTouchStart={e => (e.currentTarget.style.background = '#334155')}
                  onTouchEnd={e => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── FAB Edit actions (shown inside canvas area, bottom-right) ────────────────
// This is rendered OUTSIDE the canvas div so it positions relative to
// the overall column layout, always sitting just above the divider.
function EditFAB({ selectedGraphicId, bottomOffset }) {
  const [open, setOpen] = useState(false);
  const deleteGraphic     = useStore(s => s.deleteGraphic);
  const duplicateGraphic  = useStore(s => s.duplicateGraphic);
  const moveGraphicInList = useStore(s => s.moveGraphicInList);
  const splitGraphic      = useStore(s => s.splitGraphic);
  const getSelectedScene  = useStore(s => s.getSelectedScene);

  const scene   = getSelectedScene();
  const graphic = scene?.graphics.find(g => g.id === selectedGraphicId);

  // Auto-close when selection disappears
  useEffect(() => { if (!selectedGraphicId) setOpen(false); }, [selectedGraphicId]);

  if (!selectedGraphicId || !graphic) return null;

  const idx     = scene.graphics.findIndex(g => g.id === selectedGraphicId);
  const isFirst = idx === 0;
  const isLast  = idx === scene.graphics.length - 1;

  const actions = [
    { icon: '↑', label: 'Move Up',   disabled: isFirst, action: () => moveGraphicInList(selectedGraphicId, -1) },
    { icon: '↓', label: 'Move Down', disabled: isLast,  action: () => moveGraphicInList(selectedGraphicId,  1) },
    { icon: '⧉', label: 'Duplicate', action: () => duplicateGraphic(selectedGraphicId) },
    { icon: '✂', label: 'Split',     action: () => splitGraphic(selectedGraphicId) },
    { icon: '🗑', label: 'Delete',    danger: true, action: () => { deleteGraphic(selectedGraphicId); setOpen(false); } },
  ];

  return (
    <>
      {/* Dismiss overlay behind pills */}
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 299 }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* FAB container — fixed to bottom-right of screen, above divider */}
      <div style={{
        position: 'fixed',
        right: 12,
        bottom: bottomOffset + 10,
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
        pointerEvents: 'none', // let through to canvas when closed
      }}>
        {/* Action pills */}
        {open && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-end',
            pointerEvents: 'auto',
          }}>
            {actions.map((a, i) => (
              <button
                key={i}
                onClick={() => { if (!a.disabled) { a.action(); if (a.danger) {} } }}
                disabled={a.disabled}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 16px',
                  background: a.danger ? 'rgba(127,29,29,0.95)' : 'rgba(15,23,42,0.95)',
                  border: `1px solid ${a.danger ? '#ef444466' : '#3b82f655'}`,
                  borderRadius: 24,
                  color: a.disabled ? '#374151' : a.danger ? '#fca5a5' : '#e2e8f0',
                  fontSize: 13, fontWeight: 600,
                  cursor: a.disabled ? 'not-allowed' : 'pointer',
                  backdropFilter: 'blur(12px)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                  opacity: a.disabled ? 0.35 : 1,
                  whiteSpace: 'nowrap',
                  touchAction: 'manipulation',
                  animation: `fabPillIn 0.15s ${i * 0.04}s both ease-out`,
                }}
              >
                <span style={{ fontSize: 16 }}>{a.icon}</span>
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Main FAB button */}
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            width: 44, height: 44,
            borderRadius: '50%',
            background: open ? 'rgba(239,68,68,0.92)' : 'rgba(59,130,246,0.92)',
            border: `2px solid ${open ? '#ef4444' : '#3b82f6'}`,
            color: '#fff',
            fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 20px ${open ? 'rgba(239,68,68,0.45)' : 'rgba(59,130,246,0.45)'}`,
            cursor: 'pointer',
            touchAction: 'manipulation',
            backdropFilter: 'blur(8px)',
            transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
            pointerEvents: 'auto',
          }}
        >
          {open ? '✕' : '⚡'}
        </button>
      </div>
    </>
  );
}

// ─── Bottom tool tabs (Library only — no Edit) ─────────────────────────────────
const TOOLS = [
  { id: 'graphics', icon: '👤', label: 'Elements' },
  { id: 'shapes',   icon: '⬟',  label: 'Shapes'   },
  { id: 'text',     icon: 'T',  label: 'Text'      },
  { id: 'images',   icon: '🖼', label: 'Images'    },
  { id: 'ai',       icon: '✨', label: 'AI'        },
  { id: 'audio',    icon: '♪',  label: 'Audio'     },
];

// ─── Main MobileEditor ────────────────────────────────────────────────────────
export default function MobileEditor() {
  const project             = useStore(s => s.project);
  const selectedGraphicId   = useStore(s => s.selectedGraphicId);
  const undo                = useStore(s => s.undo);
  const redo                = useStore(s => s.redo);
  const undoStack           = useStore(s => s.undoStack);
  const redoStack           = useStore(s => s.redoStack);
  const saveProject         = useStore(s => s.saveProject);
  const saveProjectAsJson   = useStore(s => s.saveProjectAsJson);
  const loadProjectFromJson = useStore(s => s.loadProjectFromJson);
  const openPreviewModal    = useStore(s => s.openPreviewModal);
  const openProjectSettings = useStore(s => s.openProjectSettings);
  const openSceneSettings   = useStore(s => s.openSceneSettings);
  const openHandPanel       = useStore(s => s.openHandPanel);
  const closeProject        = useStore(s => s.closeProject);

  const { w: CANVAS_W, h: CANVAS_H } = getCanvasSize(project?.canvasSizeKey);

  // Total usable height for canvas + divider + timeline
  const totalContentH = window.innerHeight - TOPBAR_H - TOOLBAR_H;
  const TIMELINE_DEFAULT = Math.round(totalContentH * 0.38);

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTool,    setActiveTool]    = useState(null);
  const [sheetHeight,   setSheetHeight]   = useState(Math.round(window.innerHeight * 0.45));
  const [canvasScale,   setCanvasScale]   = useState(1);
  const [pixabayOpen,   setPixabayOpen]   = useState(false);
  const [timelineH,     setTimelineH]     = useState(TIMELINE_DEFAULT);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const canvasWrapRef  = useRef(null);
  const pinchRef       = useRef(null);
  const sheetDragRef   = useRef(null);
  const dividerDragRef = useRef(null);

  const SHEET_MIN_H   = 140;
  const SHEET_MAX_H   = Math.round(window.innerHeight * 0.88);
  const SHEET_DEFAULT_H = Math.round(window.innerHeight * 0.45);

  // ── Auto-scale canvas to fill available space ─────────────────────────────
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      const pad = 12;
      const s = Math.min((width - pad) / CANVAS_W, (height - pad) / CANVAS_H);
      setCanvasScale(Math.min(1, Math.max(0.1, s)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [CANVAS_W, CANVAS_H]);

  // ── Pinch-to-zoom on canvas ──────────────────────────────────────────────
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
      setCanvasScale(Math.min(3, Math.max(0.1, pinchRef.current.startScale * (dist / pinchRef.current.startDist))));
    }
  }, []);
  const onCanvasTouchEnd = useCallback((e) => {
    if (e.touches.length < 2) pinchRef.current = null;
  }, []);

  // ── Divider drag — resizes canvas ↕ timeline ─────────────────────────────
  const onDividerDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const startY   = e.touches ? e.touches[0].clientY : e.clientY;
    const startH   = timelineH;
    const maxH     = Math.round(totalContentH * TIMELINE_MAX_FRAC);

    const onMove = (ev) => {
      const cy    = ev.touches ? ev.touches[0].clientY : ev.clientY;
      // Dragging UP increases timeline height; DOWN decreases it
      const delta = startY - cy;
      const next  = Math.min(maxH, Math.max(TIMELINE_MIN, startH + delta));
      setTimelineH(next);
    };
    const onEnd = () => {
      window.removeEventListener('mousemove',  onMove);
      window.removeEventListener('mouseup',    onEnd);
      window.removeEventListener('touchmove',  onMove);
      window.removeEventListener('touchend',   onEnd);
    };
    window.addEventListener('mousemove',  onMove);
    window.addEventListener('mouseup',    onEnd);
    window.addEventListener('touchmove',  onMove, { passive: false });
    window.addEventListener('touchend',   onEnd);
  }, [timelineH, totalContentH]);

  // ── Bottom sheet drag handle ──────────────────────────────────────────────
  const onSheetHandleDrag = useCallback((e) => {
    const startY = e.touches ? e.touches[0].clientY : e.clientY;
    const startH = sheetHeight;
    const onMove = (ev) => {
      const cy    = ev.touches ? ev.touches[0].clientY : ev.clientY;
      setSheetHeight(Math.min(SHEET_MAX_H, Math.max(SHEET_MIN_H, startH + (startY - cy))));
    };
    const onEnd = () => {
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
    setActiveTool(prev => prev === toolId ? null : toolId);
    if (activeTool !== toolId) setSheetHeight(SHEET_DEFAULT_H);
  };

  const sheetOpen = activeTool !== null;

  // FAB sits just above the divider: bottom = timelineH + TOOLBAR_H + DIVIDER_H
  const fabBottomOffset = timelineH + TOOLBAR_H + DIVIDER_H;

  const overflowMenuItems = [
    { icon: '🎬', label: 'Scene Settings',   action: openSceneSettings },
    { icon: '⚙',  label: 'Project Settings', action: openProjectSettings },
    { icon: '✋', label: 'Hand Panel',        action: openHandPanel },
    '---',
    { icon: '📄', label: 'Save as JSON',      action: saveProjectAsJson },
    '---',
    { icon: '🏠', label: 'Back to Home',      action: closeProject },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#060c18', position: 'relative' }}>

      {/* ── Compact top bar ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '0 8px', height: TOPBAR_H,
        background: '#0f172a', borderBottom: '1px solid #1e293b',
        flexShrink: 0, userSelect: 'none',
      }}>
        <button onClick={closeProject} style={iconBtnStyle} title="Home">🏠</button>
        <span style={{
          flex: 1, textAlign: 'center', color: '#f59e0b',
          fontFamily: 'Georgia, serif', fontSize: 13, fontWeight: 700,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px',
        }}>
          {project?.title || 'Untitled'}
        </span>
        <button onClick={saveProject}      style={iconBtnStyle} title="Save">💾</button>
        <button onClick={openPreviewModal} style={{ ...iconBtnStyle, color: '#10b981' }} title="Preview">▶</button>
        <button onClick={undo} disabled={undoStack.length === 0} style={{ ...iconBtnStyle, opacity: undoStack.length === 0 ? 0.3 : 1 }} title="Undo">↩</button>
        <button onClick={redo} disabled={redoStack.length === 0} style={{ ...iconBtnStyle, opacity: redoStack.length === 0 ? 0.3 : 1 }} title="Redo">↪</button>
        <button onClick={() => setPixabayOpen(true)} style={{ ...iconBtnStyle, color: '#60a5fa' }} title="Pixabay">🔍</button>
        <div style={{ flexShrink: 0 }}>
          <LoadJsonButton onLoad={loadProjectFromJson} compact />
        </div>
        <MobileOverflowMenu items={overflowMenuItems} />
      </div>

      {/* ── Canvas area — grows to fill space above divider ──────────────────── */}
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

      {/* ── Drag divider ─────────────────────────────────────────────────────── */}
      {/* Dragging this up/down resizes canvas vs timeline */}
      <div
        onMouseDown={onDividerDrag}
        onTouchStart={onDividerDrag}
        style={{
          height: DIVIDER_H,
          flexShrink: 0,
          background: '#0a0f1a',
          borderTop:    '1px solid #1e293b',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'ns-resize',
          touchAction: 'none',
          userSelect: 'none',
          zIndex: 10,
        }}
      >
        {/* Pill grip */}
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          background: '#334155',
          boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
        }} />
      </div>

      {/* ── Always-visible Timeline panel ────────────────────────────────────── */}
      <div style={{
        height: timelineH,
        flexShrink: 0,
        background: '#0a0f1a',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <EditorTimeline />
      </div>

      {/* ── Bottom tool tabs ─────────────────────────────────────────────────── */}
      <div className="mobile-safe-bottom" style={{
        height: TOOLBAR_H, background: '#0f172a',
        borderTop: '1px solid #1e293b',
        display: 'flex', alignItems: 'stretch',
        flexShrink: 0,
      }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'stretch',
          overflowX: 'auto', minWidth: 0,
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}>
          {TOOLS.map(tool => {
            const isActive = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => handleToolTap(tool.id)}
                style={{
                  flex: '0 0 auto', minWidth: 56,
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
                <span style={{ fontSize: tool.id === 'text' ? 18 : 20, lineHeight: 1 }}>{tool.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.2, whiteSpace: 'nowrap' }}>{tool.label}</span>
                {isActive && (
                  <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 28, height: 2, background: '#f59e0b', borderRadius: 1 }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── FAB (fixed, always above the timeline) ──────────────────────────── */}
      <EditFAB selectedGraphicId={selectedGraphicId} bottomOffset={fabBottomOffset} />

      {/* ── Library bottom sheet ────────────────────────────────────────────── */}
      {sheetOpen && (
        <>
          <div
            onClick={() => setActiveTool(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500, touchAction: 'none' }}
          />
          <div style={{
            position: 'fixed',
            bottom: TOOLBAR_H,
            left: 0, right: 0,
            height: sheetHeight,
            background: '#111827',
            borderRadius: '16px 16px 0 0',
            borderTop: '1px solid #334155',
            zIndex: 501,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 -12px 40px rgba(0,0,0,0.6)',
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

            {/* Sheet header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 16px 8px', flexShrink: 0,
            }}>
              <span style={{ fontSize: 16 }}>{TOOLS.find(t => t.id === activeTool)?.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>
                {TOOLS.find(t => t.id === activeTool)?.label}
              </span>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => setActiveTool(null)}
                style={{ background: 'none', border: 'none', color: '#475569', fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
              >✕</button>
            </div>

            {/* Library content */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <EditorLibrary initialTab={activeTool} />
            </div>
          </div>
        </>
      )}

      {pixabayOpen && <PixabayModal onClose={() => setPixabayOpen(false)} />}

      <style>{`
        @keyframes fabPillIn {
          from { opacity: 0; transform: translateY(10px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
      `}</style>
    </div>
  );
}