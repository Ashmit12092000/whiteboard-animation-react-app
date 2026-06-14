// @ts-nocheck
import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import { HAND_OPTIONS, resolveHandOption } from '../../assets';
import { Field, styles } from './SettingsModals';

// ─── Hand Panel ─────────────────────────────────────────────────────────────────
export function HandPanelModal() {
  const project           = useStore(s => s.project);
  const updateProjectSettings = useStore(s => s.updateProjectSettings);
  const closeHandPanel    = useStore(s => s.closeHandPanel);
  const addCustomHand     = useStore(s => s.addCustomHand);
  const removeCustomHand  = useStore(s => s.removeCustomHand);

  const customHands = project?.customHands ?? [];
  const handFileRef = useRef(null);
  const [uploadingHand, setUploadingHand] = useState(false);

  const [handId, setHandId] = useState(project?.handId ?? 'hand_pencil_svg');

  const [pendingHandConfig, setPendingHandConfig] = useState(
    project?.handConfig ?? { scale: 1, rotation: 0, flipX: false, offsetX: 0, offsetY: 0 }
  );

  const [showHandCustomizer, setShowHandCustomizer] = useState(false);

  const handleHandChange = (id) => {
    setHandId(id);
    setPendingHandConfig({ scale: 1, rotation: 0, flipX: false, offsetX: 0, offsetY: 0 });
  };

  const handleHandFiles = async (files) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setUploadingHand(true);
    try {
      const src = await readAsDataURL(file);
      const { w, h } = await getImageDimensions(src);
      const newHand = {
        id: `custom_${crypto.randomUUID()}`,
        label: file.name.replace(/\.[^.]+$/, '') || 'Custom Hand',
        src,
        isSvg: false,
        isCustom: true,
        nativeW: w,
        nativeH: h,
        tipX: Math.round(w / 2),
        tipY: Math.round(h / 2),
        displayPx: 240,
      };
      addCustomHand(newHand);
      handleHandChange(newHand.id);
    } finally {
      setUploadingHand(false);
    }
  };

  const handleHandFileInput = (e) => {
    handleHandFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };

  const handleRemoveCustomHand = (id) => {
    removeCustomHand(id);
    if (handId === id) handleHandChange('hand_pencil_svg');
  };

  // "Customize Hand" opens the customizer; customizer Save commits everything then closes both
  const handleCustomize = () => setShowHandCustomizer(true);

  const handleCustomizerSave = (cfg) => {
    updateProjectSettings({ handId, handConfig: cfg });
    setShowHandCustomizer(false);
    closeHandPanel();
  };

  const handleClose = () => closeHandPanel();

  return (
    <>
      {/* Custom scrollable overlay — doesn't use the shared Overlay so we can control height */}
      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.8)',
          zIndex: 1000,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          padding: '40px 20px',
          overflowY: 'auto',
        }}
        onClick={e => e.target === e.currentTarget && handleClose()}
      >
        <div style={{
          background: '#111827',
          border: '1px solid #1e293b',
          borderRadius: 12,
          padding: 'clamp(16px, 5vw, 28px)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          width: '100%',
          maxWidth: 460,
          animation: 'modalIn 0.2s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          <h2 style={styles.title}>✋ Hand Panel</h2>

          <Field label="Animator Hand">
            <HandPicker
              value={handId}
              onChange={handleHandChange}
              customHands={customHands}
              onRemoveCustom={handleRemoveCustomHand}
            />
            <input
              ref={handFileRef}
              type="file"
              accept="image/*"
              onChange={handleHandFileInput}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => handFileRef.current?.click()}
              disabled={uploadingHand}
              style={{
                marginTop: 8, width: '100%', padding: '8px 0',
                background: '#1e293b', border: '1.5px dashed #334155',
                borderRadius: 8, color: '#94a3b8', cursor: uploadingHand ? 'wait' : 'pointer',
                fontWeight: 700, fontSize: 12,
              }}
            >
              {uploadingHand ? 'Uploading…' : '⬆ Upload Custom Hand Image'}
            </button>
          </Field>

          {/* Config summary */}
          {handId && (
            <div style={{
              marginBottom: 20,
              padding: '7px 12px',
              background: '#0f172a',
              border: '1px solid #1e3a5f',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 11,
              color: '#64748b',
            }}>
              <span style={{ color: '#3b82f6', fontSize: 13 }}>✦</span>
              <span>
                Size: <b style={{ color: '#94a3b8' }}>{Math.round(pendingHandConfig.scale * 100)}%</b>
                {' · '}Rotation: <b style={{ color: '#94a3b8' }}>{pendingHandConfig.rotation}°</b>
                {' · '}Flip: <b style={{ color: '#94a3b8' }}>{pendingHandConfig.flipX ? 'Yes' : 'No'}</b>
                {(pendingHandConfig.offsetX !== 0 || pendingHandConfig.offsetY !== 0) && (
                  <> · Offset: <b style={{ color: '#94a3b8' }}>{Math.round(pendingHandConfig.offsetX)}, {Math.round(pendingHandConfig.offsetY)}</b></>
                )}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleClose} style={styles.btnSec}>Close</button>
            <button onClick={handleCustomize} style={styles.btnDone}>Customize Hand →</button>
          </div>
        </div>
      </div>

      {showHandCustomizer && (
        <HandCustomizerModal
          handId={handId}
          customHands={customHands}
          initialConfig={pendingHandConfig}
          onSave={handleCustomizerSave}
          onBack={() => setShowHandCustomizer(false)}
        />
      )}
    </>
  );
}

// ─── Hand Customizer Modal ─────────────────────────────────────────────────────
function HandCustomizerModal({ handId, customHands, initialConfig, onSave, onBack }) {
  const [scale,    setScale]    = useState(initialConfig.scale    ?? 1);
  const [rotation, setRotation] = useState(initialConfig.rotation ?? 0);
  const [flipX,    setFlipX]    = useState(initialConfig.flipX    ?? false);
  // Drag offset: how far the user has moved the hand image relative to default position
  const [offsetX,  setOffsetX]  = useState(initialConfig.offsetX  ?? 0);
  const [offsetY,  setOffsetY]  = useState(initialConfig.offsetY  ?? 0);

  const canvasRef  = useRef(null);
  const dragState  = useRef(null); // { startMouseX, startMouseY, startOffsetX, startOffsetY }

  const handOpt = resolveHandOption(handId, customHands);
  const PUB     = import.meta.env.BASE_URL.replace(/\/$/, '') || '';
  const imgSrc  = handOpt.isCustom ? handOpt.src : (handOpt.isSvg ? `${PUB}/hand-pencil.svg` : handOpt.src);

  const baseW  = handOpt.displayPx;
  const baseH  = baseW * (handOpt.nativeH / handOpt.nativeW);
  const dispW  = baseW * scale;
  const dispH  = baseH * scale;

  const tipFX = handOpt.tipX / handOpt.nativeW;
  const tipFY = handOpt.tipY / handOpt.nativeH;

  // Canvas dimensions (will be measured from ref, but we use these as layout hints)
  const CANVAS_W = 540;
  const CANVAS_H = 300;

  // Anchor = canvas center (where blue dot sits)
  const anchorX = CANVAS_W / 2;
  const anchorY = CANVAS_H / 2;

  // Default position: tip at anchor. User drag adds offsetX/offsetY on top.
  const imgLeft = anchorX - tipFX * dispW + offsetX;
  const imgTop  = anchorY - tipFY * dispH + offsetY;

  // ── Drag logic ──────────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    dragState.current = {
      startMouseX:  e.clientX,
      startMouseY:  e.clientY,
      startOffsetX: offsetX,
      startOffsetY: offsetY,
    };
  }, [offsetX, offsetY]);

  useEffect(() => {
    const onMove = (e) => {
      if (!dragState.current) return;
      const dx = e.clientX - dragState.current.startMouseX;
      const dy = e.clientY - dragState.current.startMouseY;
      setOffsetX(dragState.current.startOffsetX + dx);
      setOffsetY(dragState.current.startOffsetY + dy);
    };
    const onUp = () => { dragState.current = null; };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    // Touch support
    const onTouchMove = (e) => {
      if (!dragState.current) return;
      e.preventDefault();
      const t = e.touches[0];
      const dx = t.clientX - dragState.current.startMouseX;
      const dy = t.clientY - dragState.current.startMouseY;
      setOffsetX(dragState.current.startOffsetX + dx);
      setOffsetY(dragState.current.startOffsetY + dy);
    };
    const onTouchStart = (e) => {
      const t = e.touches[0];
      dragState.current = {
        startMouseX:  t.clientX,
        startMouseY:  t.clientY,
        startOffsetX: offsetX,
        startOffsetY: offsetY,
      };
    };
    const onTouchEnd = () => { dragState.current = null; };

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [offsetX, offsetY]);

  const handleSave = () => {
    onSave({ scale, rotation, flipX, offsetX, offsetY });
  };

  const handleReset = () => {
    setScale(1); setRotation(0); setFlipX(false); setOffsetX(0); setOffsetY(0);
  };

  // Is tip currently close to anchor?
  const currentTipX = imgLeft + tipFX * dispW;
  const currentTipY = imgTop  + tipFY * dispH;
  const dist = Math.hypot(currentTipX - anchorX, currentTipY - anchorY);
  const isAligned = dist < 8;

  return (
    <div style={{
      position:  'fixed', inset: 0,
      background: 'rgba(0,0,0,0.85)',
      display:   'flex', alignItems: 'center', justifyContent: 'center',
      zIndex:    9999,
      padding:   20,
    }}
      onClick={e => { if (e.target === e.currentTarget) onBack(); }}
    >
      <div style={{
        background:   '#0f172a',
        border:       '1px solid #1e293b',
        borderRadius: 14,
        padding:      24,
        width:        600,
        maxWidth:     '96vw',
        boxShadow:    '0 24px 60px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ ...styles.title, marginBottom: 0 }}>✋ Customize Hand</h2>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {/* Hint bar */}
        <div style={{
          marginBottom: 12,
          padding: '6px 12px',
          background: '#0a1929',
          border: '1px solid #1e3a5f',
          borderRadius: 6,
          fontSize: 11,
          color: '#64748b',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>🖱</span>
          <span>Drag the hand to align the pen tip to the <span style={{ color: '#3b82f6', fontWeight: 700 }}>blue dot</span>. Use the controls below to resize, rotate, or flip.</span>
        </div>

        {/* Demo Canvas */}
        <div
          ref={canvasRef}
          style={{
            position:     'relative',
            width:        '100%',
            height:       CANVAS_H,
            background:   '#ffffff',
            borderRadius: 8,
            overflow:     'hidden',
            marginBottom: 16,
            border:       `2px solid ${isAligned ? '#22c55e' : '#1e3a5f'}`,
            boxSizing:    'border-box',
            cursor:       'grab',
            transition:   'border-color 0.2s',
            userSelect:   'none',
          }}
          onMouseDown={onMouseDown}
        >
          {/* Vertical crosshair */}
          <div style={{
            position: 'absolute', left: anchorX - 1, top: 0,
            width: 2, height: CANVAS_H,
            background: 'rgba(59,130,246,0.18)',
            pointerEvents: 'none',
          }} />
          {/* Horizontal crosshair */}
          <div style={{
            position: 'absolute', left: 0, top: anchorY - 1,
            width: '100%', height: 2,
            background: 'rgba(59,130,246,0.18)',
            pointerEvents: 'none',
          }} />

          {/* Blue anchor dot */}
          <div style={{
            position:     'absolute',
            left:         anchorX - 6, top: anchorY - 6,
            width:        12, height: 12,
            borderRadius: '50%',
            background:   '#3b82f6',
            border:       '2px solid #fff',
            boxShadow:    '0 0 0 3px rgba(59,130,246,0.3)',
            zIndex:       10,
            pointerEvents:'none',
          }} />

          {/* Aligned badge */}
          {isAligned && (
            <div style={{
              position: 'absolute', top: 8, right: 8,
              padding: '3px 8px',
              background: '#14532d',
              border: '1px solid #22c55e',
              borderRadius: 20,
              fontSize: 10, color: '#4ade80', fontWeight: 700,
              zIndex: 10, pointerEvents: 'none',
            }}>
              ✓ Tip aligned
            </div>
          )}

          {/* Bottom label */}
          <div style={{
            position: 'absolute', bottom: 8, left: 10,
            fontSize: 10, color: '#64748b',
            background: 'rgba(15,23,42,0.65)',
            padding: '2px 8px', borderRadius: 4,
            pointerEvents: 'none',
          }}>
            Drag hand • Pen tip → blue dot
          </div>

          {/* The draggable hand image */}
          <img
            src={imgSrc}
            alt="Hand"
            draggable={false}
            style={{
              position:        'absolute',
              left:            imgLeft,
              top:             imgTop,
              width:           dispW,
              height:          dispH,
              transformOrigin: `${tipFX * 100}% ${tipFY * 100}%`,
              transform:       `rotate(${rotation}deg) scaleX(${flipX ? -1 : 1})`,
              pointerEvents:   'none',
              userSelect:      'none',
            }}
          />
        </div>

        {/* Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
          {/* Size */}
          <ControlCard label="Size" value={`${Math.round(scale * 100)}%`}>
            <input
              type="range" min={0.4} max={2.0} step={0.05}
              value={scale}
              onChange={e => setScale(parseFloat(e.target.value))}
              style={sliderStyle}
            />
            <div style={sliderHints}><span>40%</span><span>200%</span></div>
          </ControlCard>

          {/* Rotation */}
          <ControlCard label="Rotation" value={`${rotation}°`}>
            <input
              type="range" min={-90} max={90} step={1}
              value={rotation}
              onChange={e => setRotation(parseInt(e.target.value, 10))}
              style={sliderStyle}
            />
            <div style={sliderHints}><span>-90°</span><span>+90°</span></div>
          </ControlCard>

          {/* Flip + Reset */}
          <ControlCard label="Mirror / Flip" value={flipX ? 'Flipped ↔' : 'Normal'}>
            <button
              onClick={() => setFlipX(v => !v)}
              style={{
                width: '100%', padding: '9px 0', marginTop: 4,
                background: flipX ? '#1e3a5f' : '#1e293b',
                border: `2px solid ${flipX ? '#3b82f6' : '#334155'}`,
                borderRadius: 7, color: flipX ? '#93c5fd' : '#64748b',
                cursor: 'pointer', fontWeight: 700, fontSize: 12,
                transition: 'all 0.15s',
              }}
            >
              {flipX ? '↔ Flipped' : '→ Flip Hand'}
            </button>
            <button
              onClick={handleReset}
              style={{
                width: '100%', padding: '5px 0', marginTop: 6,
                background: 'transparent',
                border: '1px solid #1e293b',
                borderRadius: 6, color: '#475569',
                cursor: 'pointer', fontSize: 11,
              }}
            >
              Reset All
            </button>
          </ControlCard>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onBack} style={styles.btnSec}>← Back</button>
          <button onClick={handleSave} style={styles.btnPri}>✓ Save &amp; Apply</button>
        </div>
      </div>
    </div>
  );
}

// ─── ControlCard ──────────────────────────────────────────────────────────────
function ControlCard({ label, value, children }) {
  return (
    <div style={{
      background: '#1e293b', border: '1px solid #334155',
      borderRadius: 8, padding: '10px 12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {label}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>{value}</span>
      </div>
      {children}
    </div>
  );
}

const sliderStyle = { width: '100%', accentColor: '#3b82f6', cursor: 'pointer' };
const sliderHints = { display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#475569', marginTop: 4 };

// ─── Hand Picker ──────────────────────────────────────────────────────────────
function HandPicker({ value, onChange, customHands = [], onRemoveCustom }) {
  const allOptions = [...HAND_OPTIONS, ...customHands];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {allOptions.map(opt => {
        const isSelected = value === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            title={opt.label}
            style={{
              position: 'relative', padding: 0, borderRadius: 8, cursor: 'pointer',
              border: `2px solid ${isSelected ? '#3b82f6' : '#334155'}`,
              background: isSelected ? '#1e3a5f' : '#0f172a',
              overflow: 'hidden', aspectRatio: '4/3',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'flex-end',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = '#475569'; }}
            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = '#334155'; }}
          >
            <HandThumb opt={opt} />
            <div style={{
              width: '100%', padding: '3px 4px',
              background: isSelected ? '#1d4ed8cc' : '#00000088',
              fontSize: 9, fontWeight: 700,
              color: isSelected ? '#93c5fd' : '#94a3b8',
              textAlign: 'center', letterSpacing: 0.5,
              textTransform: 'uppercase', flexShrink: 0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {opt.label}
            </div>
            {isSelected && (
              <div style={{
                position: 'absolute', top: 4, right: 4,
                width: 16, height: 16, borderRadius: '50%',
                background: '#3b82f6',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, color: '#fff', fontWeight: 900,
              }}>✓</div>
            )}
            {opt.isCustom && onRemoveCustom && (
              <div
                role="button"
                title="Remove custom hand"
                onClick={(e) => { e.stopPropagation(); onRemoveCustom(opt.id); }}
                style={{
                  position: 'absolute', top: 4, left: 4,
                  width: 16, height: 16, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.6)', border: '1px solid #475569',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: '#f87171', fontWeight: 900, cursor: 'pointer',
                }}
              >✕</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── HandThumb ────────────────────────────────────────────────────────────────
const PUB = import.meta.env.BASE_URL.replace(/\/$/, '') || '';

function HandThumb({ opt }) {
  const [errored, setErrored] = useState(false);
  const imgSrc = opt.isCustom ? opt.src : (opt.isSvg ? `${PUB}/hand-pencil.svg` : opt.src);

  if (errored) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, opacity: 0.4 }}>✋</div>
    );
  }
  return (
    <img src={imgSrc} alt={opt.label} onError={() => setErrored(true)}
      style={{ flex: 1, width: '100%', objectFit: 'contain', padding: 6, boxSizing: 'border-box', minHeight: 0 }}
    />
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 400, h: 400 });
    img.src = src;
  });
}
