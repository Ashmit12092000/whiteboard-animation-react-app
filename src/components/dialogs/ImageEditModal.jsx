import { useState, useEffect, useMemo } from 'react';

const PRESETS = [
  { name: 'Normal', f: { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, blur: 0 } },
  { name: 'Vivid',  f: { brightness: 110, contrast: 125, saturation: 150, grayscale: 0, blur: 0 } },
  { name: 'Muted',  f: { brightness: 95,  contrast: 88,  saturation: 55,  grayscale: 0, blur: 0 } },
  { name: 'B&W',    f: { brightness: 100, contrast: 115, saturation: 0,   grayscale: 100, blur: 0 } },
  { name: 'Warm',   f: { brightness: 108, contrast: 105, saturation: 130, grayscale: 0, blur: 0 } },
  { name: 'Cool',   f: { brightness: 100, contrast: 100, saturation: 75,  grayscale: 0, blur: 0 } },
  { name: 'Soft',   f: { brightness: 112, contrast: 82,  saturation: 88,  grayscale: 0, blur: 0.8 } },
  { name: 'Drama',  f: { brightness: 88,  contrast: 148, saturation: 72,  grayscale: 0, blur: 0 } },
];

const DEFAULT_F = PRESETS[0].f;
const MAX_W = 440;
const MAX_H = 320;
const MIN_CROP = 20;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function buildCss(f) {
  return [
    `brightness(${f.brightness}%)`,
    `contrast(${f.contrast}%)`,
    `saturate(${f.saturation}%)`,
    f.grayscale > 0 && `grayscale(${f.grayscale}%)`,
    f.blur > 0      && `blur(${f.blur}px)`,
  ].filter(Boolean).join(' ') || 'none';
}

export default function ImageEditModal({ item, revealEffect, onConfirm, onCancel }) {
  const { dw, dh } = useMemo(() => {
    const r = item.h / item.w;
    if (item.w / item.h >= MAX_W / MAX_H) return { dw: MAX_W, dh: Math.round(MAX_W * r) };
    return { dw: Math.round(MAX_H / r), dh: MAX_H };
  }, [item.w, item.h]);

  const [crop,        setCrop]        = useState({ x: 0, y: 0, w: dw, h: dh });
  const [filters,     setFilters]     = useState({ ...DEFAULT_F });
  const [preset,      setPreset]      = useState('Normal');
  const [dragging,    setDragging]    = useState(null);
  const [applying,    setApplying]    = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const { type, sx, sy, sb } = dragging;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      let { x, y, w, h } = sb;

      if (type === 'move') {
        x = clamp(sb.x + dx, 0, dw - sb.w);
        y = clamp(sb.y + dy, 0, dh - sb.h);
      } else {
        if (type.includes('w')) { const nx = clamp(sb.x + dx, 0, sb.x + sb.w - MIN_CROP); w = sb.w + sb.x - nx; x = nx; }
        if (type.includes('e')) { w = clamp(sb.w + dx, MIN_CROP, dw - x); }
        if (type.includes('n')) { const ny = clamp(sb.y + dy, 0, sb.y + sb.h - MIN_CROP); h = sb.h + sb.y - ny; y = ny; }
        if (type.includes('s')) { h = clamp(sb.h + dy, MIN_CROP, dh - y); }
      }
      setCrop({ x, y, w, h });
    };
    const onUp = () => setDragging(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',  onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, dw, dh]);

  const drag = (type) => (e) => { e.preventDefault(); e.stopPropagation(); setDragging({ type, sx: e.clientX, sy: e.clientY, sb: { ...crop } }); };

  const applyPreset = (p) => { setFilters({ ...p.f }); setPreset(p.name); };
  const setF = (key, val) => { setFilters(prev => ({ ...prev, [key]: val })); setPreset(null); };

  const handleConfirm = () => {
    setApplying(true);
    const scaleX = item.w / dw;
    const scaleY = item.h / dh;
    const cx = Math.round(crop.x * scaleX);
    const cy = Math.round(crop.y * scaleY);
    const cw = Math.round(crop.w * scaleX);
    const ch = Math.round(crop.h * scaleY);

    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext('2d');
      const css = buildCss(filters);
      if (css !== 'none') ctx.filter = css;
      ctx.drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);
      onConfirm({ ...item, src: canvas.toDataURL('image/png'), w: cw, h: ch });
    };
    img.src = item.src;
  };

  const filterCss = buildCss(filters);

  const HANDLE_BASE = {
    position: 'absolute', width: 10, height: 10,
    background: '#ffffff', border: '1.5px solid #1e293b',
    borderRadius: 2, zIndex: 3,
  };
  const EDGE_BASE = { ...HANDLE_BASE, width: 8, height: 8 };

  const corners = [
    { type: 'nw', top: -5, left: -5,   cursor: 'nw-resize' },
    { type: 'ne', top: -5, right: -5,  cursor: 'ne-resize' },
    { type: 'sw', bottom: -5, left: -5, cursor: 'sw-resize' },
    { type: 'se', bottom: -5, right: -5, cursor: 'se-resize' },
  ];
  const edges = [
    { type: 'n', top: -4,    left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' },
    { type: 's', bottom: -4, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' },
    { type: 'w', left: -4,   top: '50%',  transform: 'translateY(-50%)', cursor: 'w-resize' },
    { type: 'e', right: -4,  top: '50%',  transform: 'translateY(-50%)', cursor: 'e-resize' },
  ];

  const SLIDERS = [
    { key: 'brightness', label: 'Brightness', min: 0,  max: 200, step: 1,   unit: '%' },
    { key: 'contrast',   label: 'Contrast',   min: 0,  max: 200, step: 1,   unit: '%' },
    { key: 'saturation', label: 'Saturation', min: 0,  max: 200, step: 1,   unit: '%' },
    { key: 'grayscale',  label: 'Grayscale',  min: 0,  max: 100, step: 1,   unit: '%' },
    { key: 'blur',       label: 'Blur',       min: 0,  max: 10,  step: 0.1, unit: 'px' },
  ];

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12,
          width: '100%', maxWidth: 860, maxHeight: '95vh',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid #1e293b',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>✂️ Crop & Filter</span>
            <span style={{
              fontSize: 11, color: '#94a3b8', background: '#1e293b',
              padding: '2px 8px', borderRadius: 4, maxWidth: 200,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{item.name}</span>
          </div>
          <button
            onClick={onCancel}
            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 18, cursor: 'pointer', padding: '2px 8px', borderRadius: 4 }}
            onMouseEnter={e => e.currentTarget.style.color = '#f1f5f9'}
            onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
          >✕</button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

          {/* Crop area */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#070d1a', padding: 24, overflow: 'hidden',
            minWidth: 0, gap: 10,
          }}>
            <div style={{ position: 'relative', width: dw, height: dh, flexShrink: 0, userSelect: 'none' }}>

              {/* Image */}
              <img
                src={item.src} alt="" draggable={false}
                style={{ width: dw, height: dh, display: 'block', objectFit: 'fill', filter: filterCss, userSelect: 'none', pointerEvents: 'none' }}
              />

              {/* Dark overlay outside crop rect */}
              {[
                { top: 0, left: 0, right: 0, height: crop.y },
                { top: crop.y + crop.h, left: 0, right: 0, bottom: 0 },
                { top: crop.y, left: 0, width: crop.x, height: crop.h },
                { top: crop.y, left: crop.x + crop.w, right: 0, height: crop.h },
              ].map((s, i) => (
                <div key={i} style={{ position: 'absolute', background: 'rgba(0,0,0,0.55)', pointerEvents: 'none', ...s }} />
              ))}

              {/* Crop rectangle */}
              <div
                onMouseDown={drag('move')}
                style={{
                  position: 'absolute', left: crop.x, top: crop.y, width: crop.w, height: crop.h,
                  border: '1.5px solid rgba(255,255,255,0.9)', boxSizing: 'border-box',
                  cursor: 'move', zIndex: 2,
                }}
              >
                {/* Rule-of-thirds */}
                {[1/3, 2/3].flatMap((f, i) => [
                  <div key={`v${i}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${f*100}%`, width: 1, background: 'rgba(255,255,255,0.2)', pointerEvents: 'none' }} />,
                  <div key={`h${i}`} style={{ position: 'absolute', left: 0, right: 0, top: `${f*100}%`, height: 1, background: 'rgba(255,255,255,0.2)', pointerEvents: 'none' }} />,
                ])}

                {/* Corner handles */}
                {corners.map(c => (
                  <div key={c.type} onMouseDown={drag(c.type)} style={{ ...HANDLE_BASE, ...c }} />
                ))}
                {/* Edge handles */}
                {edges.map(e => (
                  <div key={e.type} onMouseDown={drag(e.type)} style={{ ...EDGE_BASE, ...e }} />
                ))}
              </div>
            </div>

            {/* Crop size + reset */}
            <div style={{
              fontSize: 11, color: '#64748b', background: '#0f172a',
              padding: '4px 12px', borderRadius: 5, border: '1px solid #1e293b',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span>{Math.round(crop.w * item.w / dw)} × {Math.round(crop.h * item.h / dh)} px</span>
              <button
                onClick={() => setCrop({ x: 0, y: 0, w: dw, h: dh })}
                style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 11, cursor: 'pointer', padding: 0 }}
              >
                Reset crop
              </button>
            </div>
          </div>

          {/* ── Filters panel ── */}
          <div style={{
            width: 260, flexShrink: 0, borderLeft: '1px solid #1e293b',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>

              {/* Presets */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 }}>Presets</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                  {PRESETS.map(p => (
                    <button
                      key={p.name}
                      onClick={() => applyPreset(p)}
                      style={{
                        padding: '7px 0', fontSize: 10, fontWeight: 600,
                        background: preset === p.name ? '#3b82f620' : '#1e293b',
                        border: `1px solid ${preset === p.name ? '#3b82f6' : '#334155'}`,
                        borderRadius: 6, cursor: 'pointer',
                        color: preset === p.name ? '#60a5fa' : '#94a3b8',
                        transition: 'all 0.12s',
                      }}
                    >{p.name}</button>
                  ))}
                </div>
              </div>

              {/* Adjustment sliders */}
              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12 }}>Adjustments</div>
              {SLIDERS.map(({ key, label, min, max, step, unit }) => (
                <div key={key} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{label}</span>
                    <span style={{ fontSize: 11, color: '#64748b', fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'right' }}>
                      {Number.isInteger(step) ? filters[key] : filters[key].toFixed(1)}{unit}
                    </span>
                  </div>
                  <input
                    type="range" min={min} max={max} step={step}
                    value={filters[key]}
                    onChange={e => setF(key, parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: '#3b82f6' }}
                  />
                </div>
              ))}

              <button
                onClick={() => { setFilters({ ...DEFAULT_F }); setPreset('Normal'); }}
                style={{
                  width: '100%', padding: '7px 0', marginTop: 2,
                  fontSize: 11, fontWeight: 600,
                  background: '#1e293b', border: '1px solid #334155',
                  borderRadius: 6, color: '#94a3b8', cursor: 'pointer',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#475569'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#334155'}
              >↩ Reset All</button>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #1e293b',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: 10, flexShrink: 0,
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 20px', fontSize: 12, fontWeight: 600,
              background: '#1e293b', border: '1px solid #334155',
              borderRadius: 7, color: '#94a3b8', cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#475569'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#334155'}
          >Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={applying}
            style={{
              padding: '8px 22px', fontSize: 12, fontWeight: 700,
              background: applying ? '#1d4ed8' : '#2563eb',
              border: 'none', borderRadius: 7, color: '#fff',
              cursor: applying ? 'wait' : 'pointer',
              opacity: applying ? 0.8 : 1,
            }}
          >
            {applying ? 'Processing…' : '+ Add to Canvas'}
          </button>
        </div>
      </div>
    </div>
  );
}
