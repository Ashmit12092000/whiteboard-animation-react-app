// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../store';
import { useMobile } from '../../hooks/useMobile';

export const ENTRY_EFFECTS = [
  { id: 'none',         label: 'No Effect',     icon: '✕',  desc: 'Appears instantly' },
  { id: 'fadeIn',       label: 'Fade In',        icon: '👁',  desc: 'Dissolve into view' },
  { id: 'slideInLeft',  label: 'Slide In Left',  icon: '⬅',  desc: 'Enters from the left' },
  { id: 'slideInRight', label: 'Slide In Right', icon: '➡',  desc: 'Enters from the right' },
  { id: 'slideInUp',    label: 'Slide In Up',    icon: '⬆',  desc: 'Rises from below' },
  { id: 'slideInDown',  label: 'Slide In Down',  icon: '⬇',  desc: 'Drops from above' },
  { id: 'zoomIn',       label: 'Zoom In',        icon: '🔍', desc: 'Scales up from nothing' },
  { id: 'bounceIn',     label: 'Bounce In',      icon: '🏀', desc: 'Springs into place' },
  { id: 'flipInX',      label: 'Flip In',        icon: '🔄', desc: 'Flips in on X axis' },
  { id: 'rubberBand',   label: 'Rubber Band',    icon: '🎸', desc: 'Stretches and snaps' },
];

export const REVEAL_EFFECTS = [
  { id: 'wipe-right',   label: '→ Wipe Right',   icon: '➡',  desc: 'Sweeps from left' },
  { id: 'wipe-down',    label: '↓ Wipe Down',    icon: '⬇',  desc: 'Sweeps from top' },
  { id: 'fade',         label: '✦ Fade In',      icon: '👁',  desc: 'Dissolve into view' },
  { id: 'zoom',         label: '⊕ Zoom In',      icon: '🔍', desc: 'Scales up from center' },
  { id: 'scribble',     label: '✏ Scribble',     icon: '✏',  desc: 'Hand-drawn outline' },
];

const KEYFRAMES_CSS = `
@keyframes wb-fadeIn       { from{opacity:0}to{opacity:1} }
@keyframes wb-slideInLeft  { from{opacity:0;transform:translateX(-60px)}to{opacity:1;transform:translateX(0)} }
@keyframes wb-slideInRight { from{opacity:0;transform:translateX(60px)}to{opacity:1;transform:translateX(0)} }
@keyframes wb-slideInUp    { from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:translateY(0)} }
@keyframes wb-slideInDown  { from{opacity:0;transform:translateY(-60px)}to{opacity:1;transform:translateY(0)} }
@keyframes wb-zoomIn       { from{opacity:0;transform:scale(0.3)}to{opacity:1;transform:scale(1)} }
@keyframes wb-bounceIn     {
  0%{opacity:0;transform:scale(0.3)} 50%{opacity:1;transform:scale(1.12)}
  70%{transform:scale(0.92)} 85%{transform:scale(1.05)} 100%{transform:scale(1)}
}
@keyframes wb-flipInX {
  from{opacity:0;transform:perspective(400px) rotateX(90deg)}
  to{opacity:1;transform:perspective(400px) rotateX(0deg)}
}
@keyframes wb-rubberBand {
  0%{transform:scaleX(1)} 30%{transform:scaleX(1.25) scaleY(0.75)}
  40%{transform:scaleX(0.75) scaleY(1.25)} 60%{transform:scaleX(1.15) scaleY(0.85)}
  80%{transform:scaleX(0.95) scaleY(1.05)} 100%{transform:scaleX(1)}
}
@keyframes wb-sheetUp { from{transform:translateY(100%)}to{transform:translateY(0)} }
@keyframes wb-sheetDown { from{transform:translateY(0)}to{transform:translateY(100%)} }
/* Custom scrollbar for submenu */
.wb-submenu-scroll::-webkit-scrollbar { width: 4px; }
.wb-submenu-scroll::-webkit-scrollbar-track { background: transparent; }
.wb-submenu-scroll::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
.wb-submenu-scroll::-webkit-scrollbar-thumb:hover { background: #475569; }
`;

let injected = false;
function ensureKeyframes() {
  if (injected) return;
  injected = true;
  const s = document.createElement('style');
  s.textContent = KEYFRAMES_CSS;
  document.head.appendChild(s);
}

export function getEntryEffectStyle(effectId, durationSec = 0.6) {
  if (!effectId || effectId === 'none') return {};
  const map = {
    fadeIn:'wb-fadeIn', slideInLeft:'wb-slideInLeft', slideInRight:'wb-slideInRight',
    slideInUp:'wb-slideInUp', slideInDown:'wb-slideInDown', zoomIn:'wb-zoomIn',
    bounceIn:'wb-bounceIn', flipInX:'wb-flipInX', rubberBand:'wb-rubberBand',
  };
  const name = map[effectId];
  if (!name) return {};
  return { animation: `${name} ${durationSec}s cubic-bezier(0.22,1,0.36,1) both` };
}

// ─── Desktop flyout context menu ────────────────────────────────────────────
function DesktopMenu({ x, y, graphicId, graphic, currentEffect, onEffectClick, currentReveal, isImageGraphic, onRevealClick, onDelete, onDuplicate, onFlipH, onFlipV, onCrop, onClose }) {
  const menuRef     = useRef(null);
  const [showEffects, setShowEffects] = useState(false);
  const [showReveal, setShowReveal]   = useState(false);
  const [showFlip, setShowFlip]       = useState(false);
  const [subPos, setSubPos]           = useState({ top: -4, left: '100%' });
  const effectRowRef = useRef(null);
  const revealRowRef = useRef(null);
  const flipRowRef   = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) onClose(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [onClose]);

  // Position menu so it stays in viewport
  const menuW = 220, subW = 240, subMaxH = 340;
  const vw = window.innerWidth, vh = window.innerHeight;
  const adjX = x + menuW > vw ? x - menuW : x;
  const adjY = y + 260 > vh ? Math.max(10, y - 260) : y;

  const handleEffectRowEnter = () => {
    if (!effectRowRef.current) return;
    const rect = effectRowRef.current.getBoundingClientRect();
    const goLeft = adjX + menuW + subW > vw;
    // Clamp top so submenu doesn't go below viewport
    let top = rect.top - (adjY); // relative to menu
    const estimatedSubH = Math.min(subMaxH, ENTRY_EFFECTS.length * 58 + 40);
    if (adjY + top + estimatedSubH > vh) {
      top = Math.max(4, vh - adjY - estimatedSubH - 8);
    }
    setSubPos({ top, [goLeft ? 'right' : 'left']: menuW });
    setShowEffects(true);
  };

  const itemBase = {
    padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center',
    gap: 9, borderRadius: 6, margin: '2px 4px', transition: 'background 0.1s', position: 'relative',
  };

  return createPortal((
    <div ref={menuRef} onContextMenu={e => e.preventDefault()}
      style={{
        position: 'fixed', top: adjY, left: adjX, zIndex: 9999,
        background: '#1e293b', border: '1px solid #334155', borderRadius: 10,
        boxShadow: '0 12px 40px rgba(0,0,0,0.55)', minWidth: menuW,
        fontFamily: 'system-ui,sans-serif', fontSize: 13, color: '#e2e8f0',
        overflow: 'visible', userSelect: 'none',
        animation: 'wb-fadeIn 0.12s ease both',
      }}>

      {/* Header */}
      <div style={{ padding: '8px 14px 4px', color: '#64748b', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {graphic?.name ?? 'Object'}
      </div>
      <Divider />

      {/* Effects row */}
      <div ref={effectRowRef}
        onMouseEnter={handleEffectRowEnter}
        onMouseLeave={() => setShowEffects(false)}
        style={{ ...itemBase, background: showEffects ? '#2d3f55' : '' }}>
        <span style={{ fontSize: 16 }}>✨</span>
        <span style={{ flex: 1 }}>Entry Effect</span>
        <span style={{ color: '#64748b', fontSize: 11, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentEffect !== 'none' ? ENTRY_EFFECTS.find(e => e.id === currentEffect)?.label : 'None'}
        </span>
        <span style={{ color: '#64748b', fontSize: 10, marginLeft: 4 }}>▶</span>

        {/* Flyout submenu */}
        {showEffects && (
          <div
            className="wb-submenu-scroll"
            onMouseEnter={() => setShowEffects(true)}
            onMouseLeave={() => setShowEffects(false)}
            style={{
              position: 'fixed',
              top: adjY + subPos.top,
              ...(subPos.left !== undefined
                ? { left: adjX + (typeof subPos.left === 'number' ? subPos.left : menuW) }
                : { right: window.innerWidth - adjX }),
              background: '#1e293b', border: '1px solid #334155', borderRadius: 10,
              boxShadow: '0 12px 40px rgba(0,0,0,0.55)', minWidth: subW,
              zIndex: 10000, animation: 'wb-fadeIn 0.1s ease both',
              maxHeight: subMaxH, overflowY: 'auto', overflowX: 'hidden',
            }}>
            <div style={{ padding: '8px 14px 4px', color: '#64748b', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', position: 'sticky', top: 0, background: '#1e293b', zIndex: 1 }}>
              Entry Animation
            </div>
            <div style={{ height: 1, background: '#334155', marginBottom: 4 }} />
            {ENTRY_EFFECTS.map(eff => {
              const isActive = currentEffect === eff.id;
              return (
                <div key={eff.id} onClick={() => onEffectClick(eff.id)}
                  onMouseEnter={e => e.currentTarget.style.background = '#2d3f55'}
                  onMouseLeave={e => e.currentTarget.style.background = isActive ? 'rgba(59,130,246,0.18)' : ''}
                  style={{
                    ...itemBase, margin: '1px 4px',
                    background: isActive ? 'rgba(59,130,246,0.18)' : '',
                    borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
                  }}>
                  <span style={{ fontSize: 15, width: 22, textAlign: 'center', flexShrink: 0 }}>{eff.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: isActive ? 700 : 500, color: isActive ? '#93c5fd' : '#e2e8f0' }}>{eff.label}</div>
                    <div style={{ color: '#64748b', fontSize: 11, marginTop: 1 }}>{eff.desc}</div>
                  </div>
                  {isActive && <span style={{ color: '#3b82f6', fontSize: 14, flexShrink: 0 }}>✓</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Divider />

      {/* Reveal Effect (for images only) */}
      {isImageGraphic && (
        <>
          <div ref={revealRowRef}
            onMouseEnter={() => setShowReveal(true)}
            onMouseLeave={() => setShowReveal(false)}
            style={{ ...itemBase, background: showReveal ? '#2d3f55' : '' }}>
            <span style={{ fontSize: 16 }}>✏</span>
            <span style={{ flex: 1 }}>Reveal Effect</span>
            <span style={{ color: '#64748b', fontSize: 11, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentReveal ? REVEAL_EFFECTS.find(e => e.id === currentReveal)?.label : 'Wipe Right'}
            </span>
            <span style={{ color: '#64748b', fontSize: 10, marginLeft: 4 }}>▶</span>

            {/* Flyout submenu for reveal effects */}
            {showReveal && (
              <div
                className="wb-submenu-scroll"
                onMouseEnter={() => setShowReveal(true)}
                onMouseLeave={() => setShowReveal(false)}
                style={{
                  position: 'fixed',
                  top: adjY + subPos.top,
                  ...(subPos.left !== undefined
                    ? { left: adjX + (typeof subPos.left === 'number' ? subPos.left : menuW) }
                    : { right: window.innerWidth - adjX }),
                  background: '#1e293b', border: '1px solid #334155', borderRadius: 10,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.55)', minWidth: subW,
                  zIndex: 10000, animation: 'wb-fadeIn 0.1s ease both',
                  maxHeight: subMaxH, overflowY: 'auto', overflowX: 'hidden',
                }}>
                <div style={{ padding: '8px 14px 4px', color: '#64748b', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', position: 'sticky', top: 0, background: '#1e293b', zIndex: 1 }}>
                  Image Reveal
                </div>
                <div style={{ height: 1, background: '#334155', marginBottom: 4 }} />
                {REVEAL_EFFECTS.map(eff => {
                  const isActive = currentReveal === eff.id;
                  return (
                    <div key={eff.id} onClick={() => onRevealClick(eff.id)}
                      onMouseEnter={e => e.currentTarget.style.background = '#2d3f55'}
                      onMouseLeave={e => e.currentTarget.style.background = isActive ? 'rgba(59,130,246,0.18)' : ''}
                      style={{
                        ...itemBase, margin: '1px 4px',
                        background: isActive ? 'rgba(59,130,246,0.18)' : '',
                        borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
                      }}>
                      <span style={{ fontSize: 15, width: 22, textAlign: 'center', flexShrink: 0 }}>{eff.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: isActive ? 700 : 500, color: isActive ? '#93c5fd' : '#e2e8f0' }}>{eff.label}</div>
                        <div style={{ color: '#64748b', fontSize: 11, marginTop: 1 }}>{eff.desc}</div>
                      </div>
                      {isActive && <span style={{ color: '#3b82f6', fontSize: 14, flexShrink: 0 }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Divider />
        </>
      )}

      {/* Flip submenu */}
      <div ref={flipRowRef}
        onMouseEnter={() => setShowFlip(true)}
        onMouseLeave={() => setShowFlip(false)}
        style={{ ...itemBase, background: showFlip ? '#2d3f55' : '' }}>
        <span style={{ fontSize: 16 }}>↔</span>
        <span style={{ flex: 1 }}>Flip</span>
        <span style={{ color: '#64748b', fontSize: 10, marginLeft: 4 }}>▶</span>

        {showFlip && (() => {
          const flipSubW = 180;
          const rowEl = flipRowRef.current;
          const rowRect = rowEl ? rowEl.getBoundingClientRect() : { top: 0 };
          const goLeft = adjX + menuW + flipSubW > window.innerWidth;
          const subTop = rowRect.top;
          return (
            <div
              onMouseEnter={() => setShowFlip(true)}
              onMouseLeave={() => setShowFlip(false)}
              style={{
                position: 'fixed',
                top: subTop,
                ...(goLeft ? { right: window.innerWidth - adjX } : { left: adjX + menuW }),
                background: '#1e293b', border: '1px solid #334155', borderRadius: 10,
                boxShadow: '0 12px 40px rgba(0,0,0,0.55)', minWidth: flipSubW,
                zIndex: 10000, animation: 'wb-fadeIn 0.1s ease both',
                overflow: 'hidden',
              }}>
              {[
                { icon: '↔', label: 'Horizontal Flip', action: onFlipH },
                { icon: '↕', label: 'Vertical Flip',   action: onFlipV },
              ].map(item => (
                <div key={item.label} onClick={item.action}
                  onMouseEnter={e => e.currentTarget.style.background = '#2d3f55'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                  style={{ ...itemBase, margin: '2px 4px' }}>
                  <span style={{ fontSize: 15 }}>{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Crop (images only) */}
      {isImageGraphic && (
        <MenuItem icon="✂️" label="Crop & Rotate" onClick={() => { onCrop(); onClose(); }} />
      )}

      <Divider />

      {/* Duplicate */}
      <MenuItem icon="⧉" label="Duplicate" onClick={onDuplicate} />

      <Divider />

      {/* Delete */}
      <MenuItem icon="🗑" label="Delete" hint="Del" onClick={onDelete} danger />
    </div>
  ), document.body);
}

// ─── Mobile bottom sheet ─────────────────────────────────────────────────────
function MobileSheet({ graphicId, graphic, currentEffect, onEffectClick, currentReveal, isImageGraphic, onRevealClick, onDelete, onDuplicate, onFlipH, onFlipV, onCrop, onClose }) {
  const [view, setView] = useState('main'); // 'main' | 'effects' | 'reveal' | 'flip'
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef(null);

  const close = () => {
    setClosing(true);
    setTimeout(onClose, 250);
  };

  // Close on backdrop tap
  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) close();
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const itemStyle = {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '14px 20px', cursor: 'pointer',
    fontFamily: 'system-ui,sans-serif', fontSize: 15,
    color: '#e2e8f0', borderBottom: '1px solid #1e293b',
    transition: 'background 0.1s', userSelect: 'none',
  };

  return createPortal((
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.45)',
        animation: closing ? 'wb-fadeIn 0.2s ease reverse both' : 'wb-fadeIn 0.2s ease both',
      }}>
      <div
        ref={sheetRef}
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: '#0f172a', borderRadius: '16px 16px 0 0',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
          animation: closing ? 'wb-sheetDown 0.25s ease both' : 'wb-sheetUp 0.3s cubic-bezier(0.22,1,0.36,1) both',
          overflow: 'hidden',
          maxHeight: '80vh',
          display: 'flex', flexDirection: 'column',
        }}>

        {/* Handle bar */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, background: '#334155', borderRadius: 2 }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 12px' }}>
          {view !== 'main' ? (
            <button onClick={() => setView('main')}
              style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 15, cursor: 'pointer', padding: '4px 0', fontFamily: 'system-ui', display: 'flex', alignItems: 'center', gap: 4 }}>
              ‹ Back
            </button>
          ) : (
            <span style={{ fontFamily: 'system-ui', fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>
              {graphic?.name ?? 'Object'}
            </span>
          )}
          <button onClick={close}
            style={{ background: '#1e293b', border: 'none', color: '#94a3b8', width: 28, height: 28, borderRadius: '50%', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ✕
          </button>
        </div>

        {/* Main view */}
        {view === 'main' && (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {/* Effects row */}
            <div
              onTouchEnd={() => setView('effects')}
              onClick={() => setView('effects')}
              style={{ ...itemStyle, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 20 }}>✨</span>
                <div>
                  <div style={{ fontWeight: 600 }}>Entry Effect</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {currentEffect !== 'none' ? ENTRY_EFFECTS.find(e => e.id === currentEffect)?.label : 'None set'}
                  </div>
                </div>
              </div>
              <span style={{ color: '#64748b', fontSize: 18 }}>›</span>
            </div>

            {/* Reveal Effect (for images only) */}
            {isImageGraphic && (
              <div
                onTouchEnd={() => setView('reveal')}
                onClick={() => setView('reveal')}
                style={{ ...itemStyle, justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 20 }}>✏</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>Reveal Effect</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      {currentReveal ? REVEAL_EFFECTS.find(e => e.id === currentReveal)?.label : 'Wipe Right'}
                    </div>
                  </div>
                </div>
                <span style={{ color: '#64748b', fontSize: 18 }}>›</span>
              </div>
            )}

            {/* Flip */}
            <div onTouchEnd={() => setView('flip')} onClick={() => setView('flip')}
              style={{ ...itemStyle, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 20 }}>↔</span>
                <span style={{ fontWeight: 500 }}>Flip</span>
              </div>
              <span style={{ color: '#64748b', fontSize: 18 }}>›</span>
            </div>

            {/* Crop (images only) */}
            {isImageGraphic && (
              <div onTouchEnd={() => { onCrop(); close(); }} onClick={() => { onCrop(); close(); }} style={itemStyle}>
                <span style={{ fontSize: 20 }}>✂️</span>
                <span style={{ fontWeight: 500 }}>Crop & Rotate</span>
              </div>
            )}

            {/* Duplicate */}
            <div onTouchEnd={() => { onDuplicate(); close(); }} onClick={() => { onDuplicate(); close(); }} style={itemStyle}>
              <span style={{ fontSize: 20 }}>⧉</span>
              <span style={{ fontWeight: 500 }}>Duplicate</span>
            </div>

            {/* Delete */}
            <div
              onTouchEnd={() => { onDelete(); }}
              onClick={() => { onDelete(); }}
              style={{ ...itemStyle, color: '#f87171', borderBottom: 'none' }}>
              <span style={{ fontSize: 20 }}>🗑</span>
              <span style={{ fontWeight: 600 }}>Delete</span>
            </div>
          </div>
        )}

        {/* Effects grid view */}
        {view === 'effects' && (
          <div style={{ overflowY: 'auto', flex: 1, padding: '0 0 20px' }}>
            <div style={{ padding: '0 16px 8px', color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              Choose Entry Animation
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, padding: '0 12px' }}>
              {ENTRY_EFFECTS.map(eff => {
                const isActive = currentEffect === eff.id;
                return (
                  <div key={eff.id}
                    onClick={() => { onEffectClick(eff.id); close(); }}
                    onTouchEnd={() => { onEffectClick(eff.id); close(); }}
                    style={{
                      background: isActive ? 'rgba(59,130,246,0.2)' : '#1e293b',
                      border: isActive ? '2px solid #3b82f6' : '2px solid #334155',
                      borderRadius: 12, padding: '14px 12px',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column',
                      alignItems: 'flex-start', gap: 6, userSelect: 'none',
                      transition: 'all 0.15s',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontSize: 22 }}>{eff.icon}</span>
                      {isActive && <span style={{ color: '#3b82f6', fontSize: 16 }}>✓</span>}
                    </div>
                    <div style={{ fontFamily: 'system-ui', fontSize: 13, fontWeight: isActive ? 700 : 600, color: isActive ? '#93c5fd' : '#e2e8f0' }}>
                      {eff.label}
                    </div>
                    <div style={{ fontFamily: 'system-ui', fontSize: 11, color: '#64748b', lineHeight: 1.3 }}>
                      {eff.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Reveal grid view (for images only) */}
        {view === 'reveal' && isImageGraphic && (
          <div style={{ overflowY: 'auto', flex: 1, padding: '0 0 20px' }}>
            <div style={{ padding: '0 16px 8px', color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              Choose Image Reveal
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, padding: '0 12px' }}>
              {REVEAL_EFFECTS.map(eff => {
                const isActive = currentReveal === eff.id;
                return (
                  <div key={eff.id}
                    onClick={() => { onRevealClick(eff.id); close(); }}
                    onTouchEnd={() => { onRevealClick(eff.id); close(); }}
                    style={{
                      background: isActive ? 'rgba(59,130,246,0.2)' : '#1e293b',
                      border: isActive ? '2px solid #3b82f6' : '2px solid #334155',
                      borderRadius: 12, padding: '14px 12px',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column',
                      alignItems: 'flex-start', gap: 6, userSelect: 'none',
                      transition: 'all 0.15s',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontSize: 22 }}>{eff.icon}</span>
                      {isActive && <span style={{ color: '#3b82f6', fontSize: 16 }}>✓</span>}
                    </div>
                    <div style={{ fontFamily: 'system-ui', fontSize: 13, fontWeight: isActive ? 700 : 600, color: isActive ? '#93c5fd' : '#e2e8f0' }}>
                      {eff.label}
                    </div>
                    <div style={{ fontFamily: 'system-ui', fontSize: 11, color: '#64748b', lineHeight: 1.3 }}>
                      {eff.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Flip view */}
        {view === 'flip' && (
          <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0 20px' }}>
            {[
              { icon: '↔', label: 'Horizontal Flip', desc: 'Mirror left ↔ right', action: onFlipH },
              { icon: '↕', label: 'Vertical Flip',   desc: 'Mirror top ↕ bottom', action: onFlipV },
            ].map(item => (
              <div key={item.label}
                onClick={() => { item.action(); close(); }}
                onTouchEnd={() => { item.action(); close(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '15px 20px', cursor: 'pointer',
                  fontFamily: 'system-ui', fontSize: 15,
                  color: '#e2e8f0', borderBottom: '1px solid #1e293b',
                  transition: 'background 0.1s', userSelect: 'none',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#1e293b'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                <span style={{ fontSize: 24, width: 32, textAlign: 'center' }}>{item.icon}</span>
                <div>
                  <div style={{ fontWeight: 600 }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  ), document.body);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function Divider() {
  return <div style={{ height: 1, background: '#334155', margin: '4px 0' }} />;
}

function MenuItem({ icon, label, hint, onClick, danger }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center',
        gap: 9, borderRadius: 6, margin: '2px 4px', transition: 'background 0.1s',
        background: hovered ? (danger ? 'rgba(239,68,68,0.12)' : '#2d3f55') : '',
        color: danger ? '#f87171' : '#e2e8f0',
      }}>
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span style={{ flex: 1, fontWeight: danger ? 600 : 400 }}>{label}</span>
      {hint && <span style={{ color: '#64748b', fontSize: 11 }}>{hint}</span>}
    </div>
  );
}

// ─── Crop Modal ───────────────────────────────────────────────────────────────
function CropModal({ graphic, onSave, onClose }) {
  const imgRef    = useRef(null);
  const canvasRef = useRef(null);
  const dragRef   = useRef(null);

  const initCrop = graphic.cropRect ?? { x: 0, y: 0, w: 1, h: 1 };
  const [crop, setCrop]         = useState(initCrop);
  const [rotation, setRotation] = useState(graphic.cropRotation ?? 0);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    const img = imgRef.current;
    const cv  = canvasRef.current;
    if (!img || !cv || !imgLoaded) return;
    const W = cv.width, H = cv.height;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, -W / 2, -H / 2, W, H);
    ctx.restore();

    const cx = crop.x * W, cy = crop.y * H, cw = crop.w * W, ch = crop.h * H;

    // Dim area outside crop
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.fillRect(0, 0, W, cy);
    ctx.fillRect(0, cy + ch, W, H - cy - ch);
    ctx.fillRect(0, cy, cx, ch);
    ctx.fillRect(cx + cw, cy, W - cx - cw, ch);

    // Crop border
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, cw, ch);

    // Corner handles
    const HS = 10;
    ctx.fillStyle = '#3b82f6';
    [[cx, cy], [cx + cw - HS, cy], [cx, cy + ch - HS], [cx + cw - HS, cy + ch - HS]]
      .forEach(([hx, hy]) => ctx.fillRect(hx, hy, HS, HS));

    // Rule-of-thirds
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(cx + (cw / 3) * i, cy); ctx.lineTo(cx + (cw / 3) * i, cy + ch); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy + (ch / 3) * i); ctx.lineTo(cx + cw, cy + (ch / 3) * i); ctx.stroke();
    }
  }, [crop, rotation, imgLoaded]);

  const onCanvasMouseDown = (e) => {
    const cv = canvasRef.current;
    const rect = cv.getBoundingClientRect();
    const W = cv.width, H = cv.height;
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const my = (e.clientY - rect.top)  * (H / rect.height);
    const cx = crop.x * W, cy = crop.y * H, cw = crop.w * W, ch = crop.h * H;
    const HS = 16;

    let mode = null;
    if (Math.abs(mx - cx) < HS && Math.abs(my - cy) < HS)                   mode = 'nw';
    else if (Math.abs(mx - (cx+cw)) < HS && Math.abs(my - cy) < HS)          mode = 'ne';
    else if (Math.abs(mx - cx) < HS && Math.abs(my - (cy+ch)) < HS)          mode = 'sw';
    else if (Math.abs(mx - (cx+cw)) < HS && Math.abs(my - (cy+ch)) < HS)     mode = 'se';
    else if (mx > cx && mx < cx+cw && my > cy && my < cy+ch)                  mode = 'move';
    if (!mode) return;

    dragRef.current = { mode, startMx: mx, startMy: my, startCrop: { ...crop } };

    const onMove = (me) => {
      const r = cv.getBoundingClientRect();
      const nx = (me.clientX - r.left) * (W / r.width);
      const ny = (me.clientY - r.top)  * (H / r.height);
      const dx = (nx - dragRef.current.startMx) / W;
      const dy = (ny - dragRef.current.startMy) / H;
      const sc = dragRef.current.startCrop;
      const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const MIN = 0.05;
      setCrop(() => {
        let { x, y, w, h } = sc;
        if (mode === 'move') { x = cl(x+dx, 0, 1-w); y = cl(y+dy, 0, 1-h); }
        if (mode === 'nw')   { const nx2 = cl(x+dx, 0, x+w-MIN); y = cl(y+dy, 0, y+h-MIN); w += x-nx2; h += sc.y-y; x = nx2; }
        if (mode === 'ne')   { w = cl(w+dx, MIN, 1-x); y = cl(y+dy, 0, y+h-MIN); h += sc.y-y; }
        if (mode === 'sw')   { const nx2 = cl(x+dx, 0, x+w-MIN); w += x-nx2; x = nx2; h = cl(h+dy, MIN, 1-y); }
        if (mode === 'se')   { w = cl(w+dx, MIN, 1-x); h = cl(h+dy, MIN, 1-y); }
        return { x, y, w, h };
      });
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return createPortal((
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui,sans-serif',
      animation: 'wb-fadeIn 0.18s ease both',
    }}>
      <img ref={imgRef} src={graphic.src} crossOrigin="anonymous"
        style={{ display: 'none' }} onLoad={() => setImgLoaded(true)} />

      <div style={{
        background: '#0f172a', border: '1px solid #334155',
        borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
        width: 560, maxWidth: '96vw', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid #1e293b',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>✂️</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Crop & Rotate</span>
          </div>
          <button onClick={onClose} style={{
            background: '#1e293b', border: 'none', color: '#94a3b8',
            width: 30, height: 30, borderRadius: '50%', fontSize: 16,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Canvas */}
        <div style={{ padding: '16px 20px 8px', display: 'flex', justifyContent: 'center' }}>
          <canvas ref={canvasRef} width={500} height={300}
            onMouseDown={onCanvasMouseDown}
            style={{
              width: '100%', maxWidth: 500, height: 300,
              borderRadius: 8, cursor: 'crosshair',
              background: '#1e293b', border: '1px solid #334155',
            }}
          />
        </div>

        {/* Rotation */}
        <div style={{ padding: '8px 20px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>🔄 Rotate</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[-90, -45, 45, 90].map(deg => (
                <button key={deg} onClick={() => setRotation(r => Math.max(-180, Math.min(180, r + deg)))}
                  style={{
                    padding: '3px 9px', background: '#1e293b',
                    border: '1px solid #334155', borderRadius: 5,
                    color: '#94a3b8', fontSize: 12, cursor: 'pointer',
                  }}>
                  {deg > 0 ? '+' : ''}{deg}°
                </button>
              ))}
              <span style={{ color: '#60a5fa', fontSize: 13, fontWeight: 700, minWidth: 42, textAlign: 'right' }}>
                {rotation}°
              </span>
            </div>
          </div>
          <input type="range" min={-180} max={180} value={rotation}
            onChange={e => setRotation(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#3b82f6' }} />
        </div>

        {/* Crop info chips */}
        <div style={{ padding: '0 20px 14px', display: 'flex', gap: 8 }}>
          {[
            { label: 'X', val: Math.round(crop.x * 100) + '%' },
            { label: 'Y', val: Math.round(crop.y * 100) + '%' },
            { label: 'W', val: Math.round(crop.w * 100) + '%' },
            { label: 'H', val: Math.round(crop.h * 100) + '%' },
          ].map(({ label, val }) => (
            <div key={label} style={{
              flex: 1, background: '#1e293b', borderRadius: 6, padding: '6px 10px',
              border: '1px solid #334155', textAlign: 'center',
            }}>
              <div style={{ color: '#64748b', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
              <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700, marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 20px', borderTop: '1px solid #1e293b', gap: 10,
        }}>
          <button onClick={() => { setCrop({ x: 0, y: 0, w: 1, h: 1 }); setRotation(0); }}
            style={{
              padding: '8px 16px', background: 'none',
              border: '1px solid #334155', borderRadius: 7,
              color: '#94a3b8', fontSize: 13, cursor: 'pointer',
            }}>Reset</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{
              padding: '8px 18px', background: '#1e293b',
              border: '1px solid #334155', borderRadius: 7,
              color: '#94a3b8', fontSize: 13, cursor: 'pointer',
            }}>Cancel</button>
            <button onClick={() => onSave(crop, rotation)} style={{
              padding: '8px 22px', background: '#3b82f6',
              border: 'none', borderRadius: 7,
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>Apply</button>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}

// ─── Main export ─────────────────────────────────────────────────────────────
export default function ContextMenu({ x, y, graphicId, onClose }) {
  const isMobile           = useMobile();
  const deleteGraphic      = useStore(s => s.deleteGraphic);
  const updateGraphicProps = useStore(s => s.updateGraphicProps);
  const getSelectedScene   = useStore(s => s.getSelectedScene);

  const [cropOpen, setCropOpen] = useState(false);

  ensureKeyframes();

  const scene          = getSelectedScene();
  const graphic        = scene?.graphics.find(g => g.id === graphicId);
  const currentEffect  = graphic?.entryEffect ?? 'none';
  const currentReveal  = graphic?.revealEffect ?? 'wipe-right';
  const isImageGraphic = graphic?.type === 'image';

  const handleEffectClick = (effectId) => {
    updateGraphicProps(graphicId, { entryEffect: effectId });
    onClose();
  };

  const handleRevealClick = (revealId) => {
    updateGraphicProps(graphicId, { revealEffect: revealId });
    onClose();
  };

  const handleDelete = () => { deleteGraphic(graphicId); onClose(); };
  const handleDuplicate = () => { useStore.getState().duplicateGraphic(graphicId); };

  const handleFlipH = () => {
    updateGraphicProps(graphicId, { flipX: !(graphic?.flipX ?? false) });
    onClose();
  };

  const handleFlipV = () => {
    updateGraphicProps(graphicId, { flipY: !(graphic?.flipY ?? false) });
    onClose();
  };

  const handleCropSave = (cropRect, cropRotation) => {
    updateGraphicProps(graphicId, { cropRect, cropRotation });
    setCropOpen(false);
    onClose();
  };

  const sharedProps = {
    graphicId, graphic,
    currentEffect, onEffectClick: handleEffectClick,
    currentReveal, isImageGraphic, onRevealClick: handleRevealClick,
    onDelete: handleDelete, onDuplicate: handleDuplicate,
    onFlipH: handleFlipH, onFlipV: handleFlipV,
    onCrop: () => { setCropOpen(true); },
    onClose,
  };

  return (
    <>
      {isMobile
        ? <MobileSheet {...sharedProps} />
        : <DesktopMenu x={x} y={y} {...sharedProps} />
      }
      {cropOpen && isImageGraphic && (
        <CropModal graphic={graphic} onSave={handleCropSave} onClose={() => { setCropOpen(false); onClose(); }} />
      )}
    </>
  );
}