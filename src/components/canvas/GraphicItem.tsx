// @ts-nocheck
import { useRef, useState, useEffect } from 'react';
import SvgRenderer from '../shared/SvgRenderer';
import { getEffectiveFontFamily } from '../../services/fontService';
import { getCanvasSize } from '../../utils/animation';
import AnimatedSvgRenderer from '../shared/AnimatedSvgRenderer';
import AnimatedTextReveal from '../shared/AnimatedTextReveal';
import AnimatedImageReveal from '../shared/AnimatedImageReveal';
import ContextMenu, { getEntryEffectStyle, ENTRY_EFFECTS } from './ContextMenu';
import { useStore } from '../../store';
import { useMobile } from '../../hooks/useMobile';

// Eight resize handle positions
const HANDLES = [
  { id: 'nw', cursor: 'nw-resize', top: -5,   left: -5 },
  { id: 'n',  cursor: 'n-resize',  top: -5,   left: '50%', transform: 'translateX(-50%)' },
  { id: 'ne', cursor: 'ne-resize', top: -5,   right: -5 },
  { id: 'e',  cursor: 'e-resize',  top: '50%',right: -5,  transform: 'translateY(-50%)' },
  { id: 'se', cursor: 'se-resize', bottom: -5,right: -5 },
  { id: 's',  cursor: 's-resize',  bottom: -5,left: '50%',transform: 'translateX(-50%)' },
  { id: 'sw', cursor: 'sw-resize', bottom: -5,left: -5 },
  { id: 'w',  cursor: 'w-resize',  top: '50%',left: -5,   transform: 'translateY(-50%)' },
];

export default function GraphicItem({ graphic, isSelected, playing, onTipMove, seqDelay, playStartTime, snap }) {
  const isMobile           = useMobile();
  const moveGraphic        = useStore(s => s.moveGraphic);
  const resizeGraphic      = useStore(s => s.resizeGraphic);
  const rotateGraphic      = useStore(s => s.rotateGraphic);
  const selectGraphic      = useStore(s => s.selectGraphic);
  const commitHistory      = useStore(s => s.commitHistory);
  const updateGraphicProps = useStore(s => s.updateGraphicProps);

  const snapVal = snap ?? (v => v);

  const dragState      = useRef(null);
  const pinchState     = useRef(null);
  const containerRef   = useRef(null);
  const longPressTimer = useRef(null);
  const longPressFired = useRef(false);

  const [contextMenu, setContextMenu] = useState(null);
  const [previewKey,  setPreviewKey]  = useState(0);
  const [isEditing,   setIsEditing]   = useState(false);
  const textareaRef    = useRef(null);
  const originalTextRef = useRef('');

  // ─── Right-click context menu ─────────────────────────────────────────────
  const handleContextMenu = (e) => {
    if (playing) return;
    e.preventDefault();
    e.stopPropagation();
    selectGraphic(graphic.id);
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleEffectPreview = () => setPreviewKey(k => k + 1);

  // ─── Double-click → inline text edit ─────────────────────────────────────
  const handleDoubleClick = (e) => {
    if (playing || graphic.type !== 'text') return;
    e.stopPropagation();
    e.preventDefault();
    selectGraphic(graphic.id);
    originalTextRef.current = graphic.rawText ?? '';
    commitHistory();
    setIsEditing(true);
    setTimeout(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
    }, 0);
  };

  const commitTextEdit = () => setIsEditing(false);

  const cancelTextEdit = () => {
    updateGraphicProps(graphic.id, { rawText: originalTextRef.current });
    setIsEditing(false);
  };

  // ─── Mouse drag to move ───────────────────────────────────────────────────
  const handleMouseDown = (e) => {
    if (playing) return;
    if (e.button === 2) return;
    e.stopPropagation();
    selectGraphic(graphic.id);
    dragState.current = { startX: e.clientX - graphic.x, startY: e.clientY - graphic.y };
    let committed = false;
    const onMove = (ev) => {
      if (!dragState.current) return;
      if (!committed) { committed = true; commitHistory(); }
      moveGraphic(graphic.id,
        snapVal(ev.clientX - dragState.current.startX),
        snapVal(ev.clientY - dragState.current.startY),
      );
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ─── Touch drag to move ───────────────────────────────────────────────────
  const handleTouchStart = (e) => {
    if (playing) return;
    if (e.touches.length === 2) return;
    e.stopPropagation();
    selectGraphic(graphic.id);
    longPressFired.current = false;
    const t = e.touches[0];
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      dragState.current = null;
      setContextMenu({ x: t.clientX, y: t.clientY });
      if (navigator.vibrate) navigator.vibrate(40);
    }, 500);
    dragState.current = { startX: t.clientX - graphic.x, startY: t.clientY - graphic.y };
    let committed = false;
    const onMove = (ev) => {
      if (ev.touches.length !== 1) return;
      const touch = ev.touches[0];
      if (Math.hypot(touch.clientX - t.clientX, touch.clientY - t.clientY) > 6) {
        clearTimeout(longPressTimer.current);
      }
      if (!dragState.current || longPressFired.current) return;
      if (!committed) { committed = true; commitHistory(); }
      moveGraphic(graphic.id,
        snapVal(touch.clientX - dragState.current.startX),
        snapVal(touch.clientY - dragState.current.startY),
      );
    };
    const onEnd = () => {
      clearTimeout(longPressTimer.current);
      dragState.current = null;
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  };

  // ─── Mobile pinch-to-resize ───────────────────────────────────────────────
  const handlePinchStart = (e) => {
    if (playing || e.touches.length < 2) return;
    e.stopPropagation();
    selectGraphic(graphic.id);
    const t1 = e.touches[0], t2 = e.touches[1];
    const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    pinchState.current = { startDist: dist, startW: graphic.width, startH: graphic.height, aspect: graphic.height / graphic.width };
    let committed = false;
    const onMove = (ev) => {
      if (!pinchState.current || ev.touches.length < 2) return;
      ev.preventDefault();
      const a = ev.touches[0], b = ev.touches[1];
      const newDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const scale = newDist / pinchState.current.startDist;
      const newW = Math.max(30, pinchState.current.startW * scale);
      if (!committed) { committed = true; commitHistory(); }
      resizeGraphic(graphic.id, newW, newW * pinchState.current.aspect);
    };
    const onEnd = () => {
      pinchState.current = null;
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  };

  // ─── Mouse resize handle ──────────────────────────────────────────────────
  const handleResizeDown = (handleId) => (e) => {
    if (playing) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const startW = graphic.width, startH = graphic.height;
    const startGX = graphic.x, startGY = graphic.y;
    let committed = false;
    const onMove = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      let newW = startW, newH = startH, newX = startGX, newY = startGY;
      if (handleId.includes('e')) newW = Math.max(30, snapVal(startW + dx));
      if (handleId.includes('w')) { newW = Math.max(30, snapVal(startW - dx)); newX = snapVal(startGX + (startW - newW)); }
      if (handleId.includes('s')) newH = Math.max(20, snapVal(startH + dy));
      if (handleId.includes('n')) { newH = Math.max(20, snapVal(startH - dy)); newY = snapVal(startGY + (startH - newH)); }
      if (!committed) { committed = true; commitHistory(); }
      resizeGraphic(graphic.id, newW, newH, newX, newY);
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ─── Rotate handle ────────────────────────────────────────────────────────
  const handleRotateDown = (e) => {
    if (playing) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const startAngle = (graphic.rotation ?? 0);
    const startPointerAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    let committed = false;
    const onMove = (ev) => {
      const pointerAngle = Math.atan2(ev.clientY - cy, ev.clientX - cx) * (180 / Math.PI);
      if (!committed) { committed = true; commitHistory(); }
      rotateGraphic(graphic.id, startAngle + (pointerAngle - startPointerAngle));
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const activeDelay = seqDelay ?? graphic.delay;
  const rotation    = graphic.rotation ?? 0;
  const flipX       = graphic.flipX ?? false;
  const flipY       = graphic.flipY ?? false;
  const flipScale   = `${flipX ? -1 : 1}, ${flipY ? -1 : 1}`;
  const entryEffect = graphic.entryEffect ?? 'none';

  const effectStyle = playing
    ? getEntryEffectStyle(entryEffect, Math.min(graphic.duration * 0.6, 1.0))
    : {};
  const previewStyle = !playing && previewKey > 0
    ? getEntryEffectStyle(entryEffect, 0.7)
    : {};

  return (
    <>
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={(e) => { if (e.touches.length >= 2) handlePinchStart(e); else handleTouchStart(e); }}
        key={previewKey}
        style={{
          position: 'absolute',
          left: graphic.x, top: graphic.y,
          // While editing: let the container grow with the textarea (overflow visible)
          // so the blue border follows the textarea size, not the original graphic size.
          width:  isEditing ? 'auto' : graphic.width,
          height: isEditing ? 'auto' : graphic.height,
          transform: `rotate(${rotation}deg) scale(${flipScale})`,
          transformOrigin: 'center center',
          cursor: playing ? 'default' : isEditing ? 'text' : 'move',
          outline: !playing && isSelected && !isEditing ? '2px solid #3b82f6' : 'none',
          outlineOffset: 1,
          boxSizing: 'border-box',
          userSelect: 'none',
          touchAction: 'none',
          ...effectStyle,
          ...previewStyle,
        }}
      >
        {/* ── Content ── */}
        {graphic.type === 'drawing' ? (
          playing ? (
            <AnimatedSvgRenderer
              key={`${graphic.id}-playing`}
              svg={graphic.svgText}
              style={{ width: '100%', height: '100%', display: 'block' }}
              playing={playing}
              duration={graphic.duration}
              delay={activeDelay}
              onTipMove={onTipMove}
            />
          ) : <SvgRenderer svg={graphic.svgText} style={{ width: '100%', height: '100%', display: 'block' }} />
        ) : graphic.type === 'image' ? (
          playing ? (
            <AnimatedImageReveal
              key={`${graphic.id}-playing`}
              src={graphic.src}
              playing={playing}
              duration={graphic.duration}
              delay={activeDelay}
              revealEffect={graphic.revealEffect}
              onTipMove={onTipMove}
            />
          ) : (
            (() => {
              const cr = graphic.cropRect;
              const cr_rot = graphic.cropRotation ?? 0;
              if (!cr || (cr.x === 0 && cr.y === 0 && cr.w === 1 && cr.h === 1 && cr_rot === 0)) {
                return (
                  <img src={graphic.src} alt={graphic.name} draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', userSelect: 'none' }} />
                );
              }
              const scaleX = 1 / cr.w;
              const scaleY = 1 / cr.h;
              return (
                <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
                  <img src={graphic.src} alt={graphic.name} draggable={false}
                    style={{
                      position: 'absolute',
                      width:  `${scaleX * 100}%`,
                      height: `${scaleY * 100}%`,
                      left:  `${-cr.x * scaleX * 100}%`,
                      top:   `${-cr.y * scaleY * 100}%`,
                      transform: `rotate(${cr_rot}deg)`,
                      transformOrigin: `${(cr.x + cr.w / 2) * scaleX * 100}% ${(cr.y + cr.h / 2) * scaleY * 100}%`,
                      objectFit: 'contain',
                      display: 'block',
                      userSelect: 'none',
                      maxWidth: 'none',
                    }}
                  />
                </div>
              );
            })()
          )
        ) : playing ? (
          <AnimatedTextReveal
            key={`${graphic.id}-playing`}
            graphic={graphic}
            playing={playing}
            duration={graphic.duration}
            delay={activeDelay}
            onTipMove={onTipMove}
            playStartTime={playStartTime}
          />
        ) : isEditing ? (
          <InlineTextEditor
            graphic={graphic}
            textareaRef={textareaRef}
            onCommit={commitTextEdit}
            onCancel={cancelTextEdit}
            onLiveChange={(text) => updateGraphicProps(graphic.id, { rawText: text })}
          />
        ) : <StaticText graphic={graphic} />}

        {/* ── Selection handles ── */}
        {isSelected && !playing && (
          <>
            <div
              onMouseDown={handleRotateDown}
              title="Rotate"
              style={{
                position: 'absolute',
                top: isMobile ? -44 : -32,
                left: '50%',
                transform: 'translateX(-50%)',
                width: isMobile ? 32 : 20,
                height: isMobile ? 32 : 20,
                background: '#8b5cf6', border: '2px solid #fff',
                borderRadius: '50%', cursor: 'grab', zIndex: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                touchAction: 'none',
              }}>
              <svg width={isMobile ? 15 : 11} height={isMobile ? 15 : 11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6"/>
                <path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/>
              </svg>
            </div>
            <div style={{ position: 'absolute', top: isMobile ? -14 : -12, left: '50%', transform: 'translateX(-50%)', width: 1, height: isMobile ? 14 : 12, background: '#3b82f6', pointerEvents: 'none' }} />

            {!isMobile && HANDLES.map(h => (
              <div key={h.id} onMouseDown={handleResizeDown(h.id)}
                style={{
                  position: 'absolute',
                  top: h.top, left: h.left, bottom: h.bottom, right: h.right,
                  transform: h.transform,
                  width: 10, height: 10,
                  background: '#3b82f6', border: '2px solid #fff',
                  borderRadius: 2, cursor: h.cursor, zIndex: 5,
                }} />
            ))}

            {isMobile && (
              <div style={{
                position: 'absolute', bottom: -26, left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(59,130,246,0.85)', color: '#fff',
                fontSize: 9, padding: '2px 7px', borderRadius: 10,
                whiteSpace: 'nowrap', pointerEvents: 'none',
                fontFamily: 'system-ui', fontWeight: 600, letterSpacing: 0.3,
              }}>pinch to resize</div>
            )}

            <div style={{
              position: 'absolute', top: isMobile ? -20 : -22, left: 0,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <div style={{
                background: '#3b82f6', color: '#fff',
                fontSize: isMobile ? 9 : 10, padding: '2px 6px', borderRadius: 4,
                whiteSpace: 'nowrap', pointerEvents: 'none',
                fontFamily: 'system-ui', fontWeight: 600,
              }}>{graphic.name}</div>
              {entryEffect !== 'none' && (
                <div style={{
                  background: '#7c3aed', color: '#fff',
                  fontSize: isMobile ? 9 : 10, padding: '2px 5px', borderRadius: 4,
                  whiteSpace: 'nowrap', pointerEvents: 'none',
                  fontFamily: 'system-ui', fontWeight: 600,
                }}>
                  {ENTRY_EFFECTS.find(e => e.id === entryEffect)?.icon} {ENTRY_EFFECTS.find(e => e.id === entryEffect)?.label}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          graphicId={graphic.id}
          onClose={() => {
            setContextMenu(null);
            handleEffectPreview();
          }}
        />
      )}
    </>
  );
}

function StaticText({ graphic }) {
  const effectiveFont = getEffectiveFontFamily(graphic.fontFamily);
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center',
      overflow: 'hidden', whiteSpace: 'pre-wrap',
      fontFamily: effectiveFont, fontWeight: graphic.fontWeight,
      fontStyle: graphic.fontStyle, fontSize: graphic.fontSize,
      lineHeight: 1.2,
      color: graphic.color || '#1a1a1a',
    }}>{graphic.rawText}</div>
  );
}

// ─── Inline text editor ───────────────────────────────────────────────────────
// Strategy: the textarea is UNCONTROLLED for sizing purposes.
// - It is NOT driven by graphic.width/height in its style — React never
//   overrides the DOM dimensions we set manually.
// - On every input event we directly manipulate ta.style.width / ta.style.height
//   via a syncSize() function (no useEffect, no re-render needed for sizing).
// - We write to the store (onLiveChange) for sidebar sync, but guard against
//   writing width/height back to the store during typing to avoid render loops.
//   Width/height are only committed to the store on blur/confirm.
function InlineTextEditor({ graphic, textareaRef, onCommit, onCancel, onLiveChange }) {
  const effectiveFont      = getEffectiveFontFamily(graphic.fontFamily);
  const updateGraphicProps = useStore(s => s.updateGraphicProps);
  const canvasSizeKey      = useStore(s => s.project?.canvasSizeKey);
  const { w: canvasW }     = getCanvasSize(canvasSizeKey);

  // Max available width from graphic's left edge to canvas right edge
  const maxW = canvasW - graphic.x;

  // Ref to avoid stale closure over maxW inside syncSize
  const maxWRef = useRef(maxW);
  useEffect(() => { maxWRef.current = maxW; }, [maxW]);

  // syncSize: directly mutates DOM — no React state, no re-render, no loop.
  const syncSize = () => {
    const ta = textareaRef?.current;
    if (!ta) return;

    // 1. Expand to maxW so scrollWidth reflects the full natural content width
    ta.style.width  = maxWRef.current + 'px';
    ta.style.height = '0px';

    // 2. Read natural width (widest line) and height (all lines)
    const newW = Math.min(Math.max(ta.scrollWidth + 2, 40), maxWRef.current);
    const newH = ta.scrollHeight;

    // 3. Apply directly to DOM — React style prop is NOT set for width/height
    //    so React will never clobber these values on re-render
    ta.style.width  = newW + 'px';
    ta.style.height = newH + 'px';

    return { newW, newH };
  };

  // Run once on mount to size the textarea for the initial text value
  useEffect(() => {
    syncSize();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // On unmount (blur/confirm/cancel), write final dimensions to store
  // so selection handles and sidebar size display are accurate
  const commitSize = () => {
    const ta = textareaRef?.current;
    if (!ta) return;
    const w = Math.round(parseFloat(ta.style.width)  || graphic.width);
    const h = Math.round(parseFloat(ta.style.height) || graphic.height);
    updateGraphicProps(graphic.id, { width: w, height: h });
  };

  return (
    <textarea
      ref={textareaRef}
      // defaultValue = uncontrolled — React won't touch the DOM value after mount.
      // onLiveChange keeps the store (and sidebar) in sync on every keystroke.
      defaultValue={graphic.rawText ?? ''}
      onChange={e => {
        onLiveChange(e.target.value);   // sync store → sidebar updates
        syncSize();                      // resize DOM immediately, no re-render
      }}
      onBlur={() => {
        commitSize();
        onCommit();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          commitSize();
          onCancel();
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          commitSize();
          onCommit();
        }
        // After Enter/Backspace/Delete: resize on next frame when DOM has updated
        if (['Enter', 'Backspace', 'Delete'].includes(e.key)) {
          requestAnimationFrame(syncSize);
        }
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{
        display:      'block',
        // ── DO NOT set width/height here ──
        // syncSize() controls them directly on the DOM node.
        // If we set them via React style, React overwrites our DOM mutations
        // on every re-render (e.g. when store updates from onLiveChange).
        minWidth:     40,
        minHeight:    graphic.height,
        overflow:     'hidden',
        background:   'rgba(59,130,246,0.08)',
        border:       '2px solid #3b82f6',
        borderRadius: 4,
        outline:      'none',
        resize:       'none',
        padding:      0,
        margin:       0,
        boxSizing:    'border-box',
        fontFamily:   effectiveFont,
        fontWeight:   graphic.fontWeight,
        fontStyle:    graphic.fontStyle,
        fontSize:     graphic.fontSize,
        lineHeight:   1.2,
        color:        graphic.color || '#1a1a1a',
        cursor:       'text',
        caretColor:   graphic.color || '#1a1a1a',
        // pre = only wrap at explicit \n (Enter key), never auto word-wrap
        whiteSpace:   'pre',
        wordBreak:    'normal',
      }}
    />
  );
}