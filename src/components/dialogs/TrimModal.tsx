// @ts-nocheck
import { useRef, useState, useCallback, useEffect } from 'react';
import { useStore } from '../../store';

const MIN_DUR   = 0.1;
const BAR_H     = 48;
const PREVIEW_W = 560; // logical width of preview bar

export default function TrimModal({ graphic, onClose }) {
  const setGraphicDuration = useStore(s => s.setGraphicDuration);
  const updateGraphicProps = useStore(s => s.updateGraphicProps);

  const originalDuration = graphic.duration;
  const originalDelay    = graphic.delay ?? 0;

  const [delay,    setDelay]    = useState(originalDelay);
  const [duration, setDuration] = useState(originalDuration);

  // Total allocated = delay + duration (constant reference for the bar)
  const totalRef = useRef(originalDelay + originalDuration);
  const total    = totalRef.current;

  const barRef = useRef(null);

  // Drag state: 'left' | 'right' | null
  const dragging = useRef(null);

  // Convert px to seconds within the bar
  const pxToS = useCallback((px) => (px / PREVIEW_W) * total, [total]);

  const getBarX = (e) => {
    const rect = barRef.current.getBoundingClientRect();
    const scaleX = PREVIEW_W / rect.width;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return (clientX - rect.left) * scaleX;
  };

  const onMouseDown = useCallback((side) => (e) => {
    e.preventDefault();
    dragging.current = side;

    const onMove = (ev) => {
      if (!dragging.current || !barRef.current) return;
      const x = getBarX(ev);
      const s = Math.max(0, Math.min(total, pxToS(x)));

      if (dragging.current === 'left') {
        // Trim start: increase delay, shrink duration (can't push past right handle)
        const newDelay = Math.min(s, delay + duration - MIN_DUR);
        const newDur   = Math.max(MIN_DUR, (delay + duration) - newDelay);
        setDelay(parseFloat(newDelay.toFixed(3)));
        setDuration(parseFloat(newDur.toFixed(3)));
      } else {
        // Trim end: shrink duration (right handle position = delay + duration)
        const newEnd = Math.max(delay + MIN_DUR, s);
        const newDur = Math.max(MIN_DUR, newEnd - delay);
        setDuration(parseFloat(newDur.toFixed(3)));
      }
    };

    const onUp = () => {
      dragging.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend',  onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend',  onUp);
  }, [delay, duration, pxToS, total]);

  const apply = () => {
    updateGraphicProps(graphic.id, { delay: parseFloat(delay.toFixed(3)) });
    setGraphicDuration(graphic.id, parseFloat(duration.toFixed(3)));
    onClose();
  };

  const reset = () => {
    setDelay(originalDelay);
    setDuration(originalDuration);
  };

  // Bar pixel positions
  const leftPx  = (delay / total) * PREVIEW_W;
  const rightPx = ((delay + duration) / total) * PREVIEW_W;
  const midW    = rightPx - leftPx;

  const delayTrimmed    = delay > 0.001;
  const durationTrimmed = duration < originalDuration - 0.001;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, width: '100%', maxWidth: 620, boxShadow: '0 24px 64px rgba(0,0,0,0.6)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid #1e293b' }}>
          <span style={{ fontSize: 18 }}>✂</span>
          <div>
            <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 14 }}>Trim Track</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{graphic.name || graphic.rawText || graphic.type}</div>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Visual trim bar */}
        <div style={{ padding: '20px 24px 10px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>
            Drag handles to trim · Total slot: {total.toFixed(2)}s
          </div>

          {/* Bar container */}
          <div
            ref={barRef}
            style={{ position: 'relative', height: BAR_H + 24, userSelect: 'none', cursor: 'default' }}
          >
            {/* Background track */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: 12, height: BAR_H, background: '#1e293b', borderRadius: 6 }} />

            {/* Trimmed-off left region */}
            {leftPx > 0 && (
              <div style={{
                position: 'absolute', left: 0, width: leftPx, top: 12, height: BAR_H,
                background: 'repeating-linear-gradient(-45deg, #0f172a, #0f172a 4px, #1a2540 4px, #1a2540 8px)',
                borderRadius: '6px 0 0 6px', opacity: 0.8,
              }} />
            )}

            {/* Active region */}
            <div style={{
              position: 'absolute', left: leftPx, width: Math.max(4, midW), top: 12, height: BAR_H,
              background: 'linear-gradient(90deg, #2563eb, #3b82f6)',
              borderRadius: 4, overflow: 'hidden',
              boxShadow: '0 2px 12px rgba(59,130,246,0.4)',
            }}>
              <span style={{ position: 'absolute', left: 8, right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>
                {duration.toFixed(2)}s
              </span>
            </div>

            {/* Trimmed-off right region */}
            {rightPx < PREVIEW_W && (
              <div style={{
                position: 'absolute', left: rightPx, right: 0, top: 12, height: BAR_H,
                background: 'repeating-linear-gradient(-45deg, #0f172a, #0f172a 4px, #1a2540 4px, #1a2540 8px)',
                borderRadius: '0 6px 6px 0', opacity: 0.8,
              }} />
            )}

            {/* Left (start) handle */}
            <div
              onMouseDown={onMouseDown('left')}
              onTouchStart={onMouseDown('left')}
              style={{
                position: 'absolute', left: leftPx, top: 6, transform: 'translateX(-50%)',
                width: 14, height: BAR_H + 12, borderRadius: 4,
                background: '#60a5fa', cursor: 'ew-resize', zIndex: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ width: 2, height: 18, background: 'rgba(255,255,255,0.6)', borderRadius: 1 }} />
            </div>

            {/* Right (end) handle */}
            <div
              onMouseDown={onMouseDown('right')}
              onTouchStart={onMouseDown('right')}
              style={{
                position: 'absolute', left: rightPx, top: 6, transform: 'translateX(-50%)',
                width: 14, height: BAR_H + 12, borderRadius: 4,
                background: '#60a5fa', cursor: 'ew-resize', zIndex: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ width: 2, height: 18, background: 'rgba(255,255,255,0.6)', borderRadius: 1 }} />
            </div>

            {/* Time labels */}
            <div style={{ position: 'absolute', left: 0, bottom: 0, fontSize: 9, color: '#475569', fontFamily: 'monospace' }}>0s</div>
            <div style={{ position: 'absolute', right: 0, bottom: 0, fontSize: 9, color: '#475569', fontFamily: 'monospace' }}>{total.toFixed(2)}s</div>
            {delayTrimmed && (
              <div style={{ position: 'absolute', left: leftPx, bottom: 0, fontSize: 9, color: '#60a5fa', fontFamily: 'monospace', transform: 'translateX(-50%)' }}>
                {delay.toFixed(2)}s
              </div>
            )}
            {durationTrimmed && (
              <div style={{ position: 'absolute', left: rightPx, bottom: 0, fontSize: 9, color: '#60a5fa', fontFamily: 'monospace', transform: 'translateX(-50%)' }}>
                {(delay + duration).toFixed(2)}s
              </div>
            )}
          </div>
        </div>

        {/* Numeric controls */}
        <div style={{ display: 'flex', gap: 12, padding: '10px 24px 18px' }}>
          <NumberField
            label="Trim Start (delay)"
            value={delay}
            min={0}
            max={parseFloat((delay + duration - MIN_DUR).toFixed(3))}
            onChange={(v) => {
              const newDelay = v;
              const newDur   = Math.max(MIN_DUR, (originalDelay + originalDuration) - newDelay);
              setDelay(newDelay);
              setDuration(parseFloat(newDur.toFixed(3)));
            }}
            unit="s"
          />
          <NumberField
            label="Duration"
            value={duration}
            min={MIN_DUR}
            max={parseFloat((originalDelay + originalDuration - delay).toFixed(3))}
            onChange={(v) => setDuration(v)}
            unit="s"
          />
          <NumberField
            label="Trim End"
            value={parseFloat((originalDuration - duration + delay - originalDelay).toFixed(3))}
            min={0}
            max={parseFloat((originalDuration + originalDelay - delay - MIN_DUR).toFixed(3))}
            onChange={(v) => {
              const newDur = Math.max(MIN_DUR, originalDuration - v + originalDelay - delay);
              setDuration(parseFloat(newDur.toFixed(3)));
            }}
            unit="s"
            dimColor="#f59e0b"
          />
        </div>

        {/* Info badges */}
        <div style={{ display: 'flex', gap: 8, padding: '0 24px 14px', flexWrap: 'wrap' }}>
          <Badge color="#3b82f6" label="Active" value={`${duration.toFixed(2)}s`} />
          {delayTrimmed    && <Badge color="#f59e0b" label="Trim Start" value={`−${delay.toFixed(2)}s`} />}
          {durationTrimmed && <Badge color="#f59e0b" label="Trim End"   value={`−${(originalDuration - duration + originalDelay - delay).toFixed(2)}s`} />}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 24px 20px', borderTop: '1px solid #1e293b' }}>
          <button
            onClick={reset}
            style={{ padding: '8px 16px', background: '#1e293b', border: '1px solid #334155', borderRadius: 7, color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
            onMouseEnter={e => e.currentTarget.style.background = '#334155'}
            onMouseLeave={e => e.currentTarget.style.background = '#1e293b'}
          >↺ Reset</button>
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', background: 'none', border: '1px solid #334155', borderRadius: 7, color: '#64748b', fontSize: 12, cursor: 'pointer' }}
          >Cancel</button>
          <button
            onClick={apply}
            style={{ padding: '8px 22px', background: '#3b82f6', border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}
            onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
            onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
          >Apply Trim</button>
        </div>
      </div>
    </div>
  );
}

function NumberField({ label, value, min, max, onChange, unit = '', dimColor }) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => setRaw(String(value)), [value]);

  const commit = () => {
    const n = parseFloat(raw);
    if (!isNaN(n)) onChange(parseFloat(Math.min(max, Math.max(min, n)).toFixed(3)));
    else setRaw(String(value));
  };

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: dimColor || '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, overflow: 'hidden' }}>
        <input
          type="number"
          min={min} max={max} step={0.1}
          value={raw}
          onChange={e => setRaw(e.target.value)}
          onBlur={commit}
          onKeyDown={e => e.key === 'Enter' && commit()}
          style={{ flex: 1, background: 'none', border: 'none', color: dimColor || '#e2e8f0', fontSize: 13, padding: '7px 8px', outline: 'none', minWidth: 0 }}
        />
        <span style={{ paddingRight: 8, fontSize: 11, color: '#475569' }}>{unit}</span>
      </div>
    </div>
  );
}

function Badge({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: `${color}15`, border: `1px solid ${color}40`, borderRadius: 5, padding: '3px 8px' }}>
      <span style={{ fontSize: 10, color: '#64748b' }}>{label}:</span>
      <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}
