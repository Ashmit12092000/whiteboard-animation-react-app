/**
 * CameraEasingPreview.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Easing picker with live animated preview.
 * Uses ReactDOM.createPortal so the dropdown renders at document.body —
 * never clipped by overflow:hidden parent containers.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Easing, EASING_NAMES } from './cameraUtils';

const EASING_DESC = {
  linear:           'Constant speed, no acceleration',
  easeIn:           'Starts slow, accelerates into motion',
  easeOut:          'Starts fast, decelerates to a stop',
  easeInOut:        'Slow start and end, fast in the middle',
  easeInCubic:      'Strong slow start with sharp acceleration',
  easeOutCubic:     'Sharp start, decelerates smoothly',
  easeInOutCubic:   'Strong ease in both directions',
  cinematic:        'Slight overshoot then settles — film-like',
  smoothStep:       'S-curve, very smooth and natural',
  smootherStep:     'Even smoother S-curve, ultra-polished',
  spring:           'Bouncy spring overshoot before settling',
};

// ─── Static mini curve (canvas) ───────────────────────────────────────────────
function CurveCanvas({ easingName, width = 48, height = 30, active }) {
  const ref = useRef(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width  = width  * dpr;
    c.height = height * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const pad = 5;
    const W = width - pad * 2;
    const H = height - pad * 2;
    const fn = Easing[easingName] ?? Easing.easeInOut;

    let minV = 0, maxV = 1;
    for (let i = 0; i <= 60; i++) {
      const v = fn(i / 60);
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const range = maxV - minV || 1;
    const sx = (t, v) => ({ x: pad + t * W, y: pad + H - ((v - minV) / range) * H });

    // guide lines
    ctx.strokeStyle = active ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 3]);
    const b = sx(0, minV), t2 = sx(0, maxV);
    ctx.beginPath(); ctx.moveTo(pad, b.y); ctx.lineTo(pad + W, b.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad, t2.y); ctx.lineTo(pad + W, t2.y); ctx.stroke();
    ctx.setLineDash([]);

    // curve
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      const { x, y } = sx(t, fn(t));
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = active ? '#f59e0b' : 'rgba(148,163,184,0.65)';
    ctx.lineWidth   = active ? 2 : 1.5;
    ctx.stroke();

    // dots
    [sx(0, fn(0)), sx(1, fn(1))].forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, active ? 2.5 : 2, 0, Math.PI * 2);
      ctx.fillStyle = active ? '#fbbf24' : 'rgba(148,163,184,0.7)';
      ctx.fill();
    });
  }, [easingName, active, width, height]);

  return <canvas ref={ref} style={{ width, height, display: 'block', flexShrink: 0 }} />;
}

// ─── Animated curve with riding dot ──────────────────────────────────────────
function AnimatedCurve({ easingName, width = 120, height = 56, playing }) {
  const ref    = useRef(null);
  const rafRef = useRef(null);
  const t0Ref  = useRef(null);
  const DUR    = 1300;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width  = width  * dpr;
    c.height = height * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);

    const pad = 6, W = width - pad * 2, H = height - pad * 2;
    const fn = Easing[easingName] ?? Easing.easeInOut;

    let minV = 0, maxV = 1;
    for (let i = 0; i <= 60; i++) { const v = fn(i / 60); if (v < minV) minV = v; if (v > maxV) maxV = v; }
    const range = maxV - minV || 1;
    const sx = (t, v) => ({ x: pad + t * W, y: pad + H - ((v - minV) / range) * H });

    function base() {
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(245,158,11,0.12)'; ctx.lineWidth = 0.5; ctx.setLineDash([2, 3]);
      const b = sx(0, minV), t2 = sx(0, maxV);
      ctx.beginPath(); ctx.moveTo(pad, b.y); ctx.lineTo(pad + W, b.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad, t2.y); ctx.lineTo(pad + W, t2.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      for (let i = 0; i <= 80; i++) { const tt = i / 80; const p = sx(tt, fn(tt)); i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); }
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.stroke();
    }

    function drawDot(progress) {
      base();
      const t = Math.max(0, Math.min(1, progress));
      const p = sx(t, fn(t));
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 9);
      g.addColorStop(0, 'rgba(251,191,36,0.55)'); g.addColorStop(1, 'rgba(251,191,36,0)');
      ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fillStyle = '#fbbf24'; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
    }

    if (!playing) { base(); return; }

    t0Ref.current = null;
    const tick = (now) => {
      if (!t0Ref.current) t0Ref.current = now;
      const phase = (now - t0Ref.current) % (DUR + 350);
      drawDot(phase < DUR ? phase / DUR : 1);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [easingName, playing, width, height]);

  return <canvas ref={ref} style={{ width, height, display: 'block', borderRadius: 4 }} />;
}

// ─── Camera viewport minimap ──────────────────────────────────────────────────
function CameraBoxPreview({ easingName, width = 120, height = 70, playing }) {
  const ref    = useRef(null);
  const rafRef = useRef(null);
  const t0Ref  = useRef(null);
  const DUR    = 1300;

  const FROM = { cx: 0.42, cy: 0.48, z: 1.0 };
  const TO   = { cx: 0.62, cy: 0.36, z: 1.55 };

  const BLOBS = [
    { x: 0.08, y: 0.18, w: 0.22, h: 0.18, c: '#1d4ed8' },
    { x: 0.45, y: 0.12, w: 0.26, h: 0.15, c: '#065f46' },
    { x: 0.20, y: 0.55, w: 0.18, h: 0.22, c: '#4c1d95' },
    { x: 0.60, y: 0.50, w: 0.20, h: 0.17, c: '#78350f' },
    { x: 0.72, y: 0.22, w: 0.14, h: 0.20, c: '#1e3a5f' },
    { x: 0.10, y: 0.72, w: 0.16, h: 0.14, c: '#831843' },
    { x: 0.52, y: 0.72, w: 0.22, h: 0.14, c: '#064e3b' },
  ];

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width  = width  * dpr;
    c.height = height * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    const fn = Easing[easingName] ?? Easing.easeInOut;

    function drawScene() {
      ctx.fillStyle = '#0a0f1a'; ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(30,41,59,0.9)'; ctx.lineWidth = 0.5;
      for (let x = 0; x < width; x += 10) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
      for (let y = 0; y < height; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
      BLOBS.forEach(b => {
        ctx.fillStyle = b.c;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(b.x * width, b.y * height, b.w * width, b.h * height, 2);
        else ctx.rect(b.x * width, b.y * height, b.w * width, b.h * height);
        ctx.fill();
      });
    }

    function drawAt(progress) {
      const et = fn(Math.max(0, Math.min(1, progress)));
      const cx = FROM.cx + (TO.cx - FROM.cx) * et;
      const cy = FROM.cy + (TO.cy - FROM.cy) * et;
      const cz = FROM.z  + (TO.z  - FROM.z)  * et;

      drawScene();

      const vpW = width  / cz;
      const vpH = height / cz;
      const vpX = cx * width  - vpW / 2;
      const vpY = cy * height - vpH / 2;

      // dark overlay
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, width, height);

      // redraw scene clipped to viewport
      ctx.save();
      ctx.beginPath(); ctx.rect(vpX, vpY, vpW, vpH); ctx.clip();
      drawScene();
      ctx.restore();

      // viewport border
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.5;
      ctx.strokeRect(vpX, vpY, vpW, vpH);

      // corner ticks
      const tk = 5; ctx.lineWidth = 2; ctx.strokeStyle = '#fbbf24';
      [[vpX, vpY, 1, 1], [vpX + vpW, vpY, -1, 1], [vpX, vpY + vpH, 1, -1], [vpX + vpW, vpY + vpH, -1, -1]].forEach(([ox, oy, dx, dy]) => {
        ctx.beginPath(); ctx.moveTo(ox + dx * tk, oy); ctx.lineTo(ox, oy); ctx.lineTo(ox, oy + dy * tk); ctx.stroke();
      });

      // "CAM" label
      ctx.fillStyle = '#f59e0b'; ctx.font = `bold ${Math.max(7, vpW * 0.12)}px monospace`;
      ctx.fillText('CAM', vpX + 3, vpY + Math.max(9, vpW * 0.14));
    }

    if (!playing) { drawAt(0); return; }

    t0Ref.current = null;
    const tick = (now) => {
      if (!t0Ref.current) t0Ref.current = now;
      const phase = (now - t0Ref.current) % (DUR + 400);
      drawAt(phase < DUR ? phase / DUR : 1);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [easingName, playing, width, height]);

  return <canvas ref={ref} style={{ width, height, display: 'block', borderRadius: 4 }} />;
}

// ─── Single option row ────────────────────────────────────────────────────────
function EasingOption({ name, isActive, onSelect, onHover }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={() => onSelect(name)}
      onMouseEnter={() => { setHov(true);  onHover(name); }}
      onMouseLeave={() => { setHov(false); onHover(null); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
        cursor: 'pointer',
        background: isActive ? 'rgba(245,158,11,0.12)' : hov ? 'rgba(255,255,255,0.04)' : 'transparent',
        borderLeft: `2px solid ${isActive ? '#f59e0b' : 'transparent'}`,
        transition: 'background 0.1s',
      }}
    >
      <CurveCanvas easingName={name} width={44} height={28} active={isActive || hov} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? '#fbbf24' : hov ? '#e2e8f0' : '#94a3b8' }}>
          {name}
        </div>
        <div style={{ fontSize: 9, color: '#334155', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {EASING_DESC[name] ?? ''}
        </div>
      </div>
      {isActive && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />}
    </div>
  );
}

// ─── Portal dropdown ──────────────────────────────────────────────────────────
function DropdownPortal({ triggerRef, onClose, children }) {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r   = el.getBoundingClientRect();
    const dropH = 310; // approximate dropdown height
    // Prefer opening upward (above the timeline bar)
    const spaceAbove = r.top;
    const spaceBelow = window.innerHeight - r.bottom;
    const goUp = spaceAbove > dropH || spaceAbove > spaceBelow;

    setPos({
      left:   Math.min(r.left, window.innerWidth - 360),
      top:    goUp ? undefined : r.bottom + 4,
      bottom: goUp ? window.innerHeight - r.top + 4 : undefined,
    });

    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [triggerRef, onClose]);

  if (!pos) return null;

  return createPortal(
    <>
      {/* backdrop */}
      <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
      <div style={{
        position: 'fixed',
        left:   pos.left,
        top:    pos.top,
        bottom: pos.bottom,
        zIndex: 9999,
        display: 'flex',
        background: '#0d1526',
        border: '1px solid #1e293b',
        borderRadius: 8,
        boxShadow: '0 16px 48px rgba(0,0,0,0.8), 0 0 0 1px rgba(245,158,11,0.08)',
        overflow: 'hidden',
        width: 360,
      }}>
        {children}
      </div>
    </>,
    document.body
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function CameraEasingPreview({ value, onChange }) {
  const [open,        setOpen]        = useState(false);
  const [hoveredName, setHoveredName] = useState(null);
  const triggerRef = useRef(null);

  const previewName = hoveredName ?? value ?? 'cinematic';

  const close = useCallback(() => { setOpen(false); setHoveredName(null); }, []);

  const handleSelect = useCallback((name) => {
    onChange(name);
    close();
  }, [onChange, close]);

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {/* ── Trigger button ── */}
      <button
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: open ? '#243048' : '#1a2236',
          border: `1px solid ${open ? '#f59e0b' : '#f59e0b55'}`,
          borderRadius: 4, color: '#cbd5e1', fontSize: 10,
          cursor: 'pointer', padding: '2px 6px 2px 4px',
          outline: 'none', transition: 'all 0.1s',
          minWidth: 100,
        }}
      >
        <CurveCanvas easingName={value ?? 'cinematic'} width={26} height={16} active />
        <span style={{ flex: 1, textAlign: 'left', color: '#e2e8f0' }}>{value ?? 'cinematic'}</span>
        <svg width="8" height="5" viewBox="0 0 8 5" style={{ flexShrink: 0, opacity: 0.5, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M0 0L4 5L8 0" stroke="#f59e0b" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* ── Portal dropdown ── */}
      {open && (
        <DropdownPortal triggerRef={triggerRef} onClose={close}>
          {/* Left: list */}
          <div style={{ width: 210, maxHeight: 310, overflowY: 'auto', borderRight: '1px solid #1e293b', flexShrink: 0 }}>
            <div style={{ padding: '6px 8px 3px', fontSize: 9, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: 1, position: 'sticky', top: 0, background: '#0d1526', zIndex: 1 }}>
              Easing
            </div>
            {EASING_NAMES.map(name => (
              <EasingOption
                key={name}
                name={name}
                isActive={name === value}
                onSelect={handleSelect}
                onHover={setHoveredName}
              />
            ))}
          </div>

          {/* Right: live preview */}
          <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8, background: '#080d16', minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: 1 }}>
              Live Preview
            </div>

            {/* Camera box */}
            <CameraBoxPreview easingName={previewName} playing={open} width={128} height={72} />

            {/* Animated curve */}
            <AnimatedCurve easingName={previewName} playing={open} width={128} height={54} />

            {/* Label */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24' }}>{previewName}</div>
              <div style={{ fontSize: 9, color: '#475569', marginTop: 2, lineHeight: 1.5 }}>{EASING_DESC[previewName] ?? ''}</div>
            </div>
          </div>
        </DropdownPortal>
      )}
    </div>
  );
}