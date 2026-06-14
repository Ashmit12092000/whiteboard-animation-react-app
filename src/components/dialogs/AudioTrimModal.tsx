// @ts-nocheck
import { useRef, useState, useCallback, useEffect } from 'react';
import { useStore } from '../../store';
import { MIN_AUDIO_TRIM_FRAC } from '../../store';

const BAR_H     = 48;
const PREVIEW_W = 560; // logical width of preview bar

export default function AudioTrimModal({ track, onClose }) {
  const updateAudioTrack = useStore(s => s.updateAudioTrack);
  const commitHistory    = useStore(s => s.commitHistory);

  const originalStart = track.trimStart ?? 0;
  const originalEnd   = track.trimEnd   ?? 1;

  const [trimStart, setTrimStart] = useState(originalStart);
  const [trimEnd,   setTrimEnd]   = useState(originalEnd);

  const fullDuration = track.duration || 0;

  const barRef = useRef(null);
  const dragging = useRef(null); // 'left' | 'right' | null

  // ── Waveform: decode track.src on mount (skip for TTS / sourceless tracks) ──
  const [waveform, setWaveform] = useState(null); // Float32Array of peaks, or null
  const [loadingWave, setLoadingWave] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!track.src || track.type === 'tts') return;
    setLoadingWave(true);
    (async () => {
      try {
        const resp = await fetch(track.src);
        const buf  = await resp.arrayBuffer();
        const ctx  = new (window.AudioContext || window.webkitAudioContext)();
        const decoded = await ctx.decodeAudioData(buf);
        if (cancelled) return;
        const data = decoded.getChannelData(0);
        const SAMPLES = 220;
        const step = Math.max(1, Math.floor(data.length / SAMPLES));
        const peaks = new Float32Array(SAMPLES);
        for (let i = 0; i < SAMPLES; i++) {
          let max = 0;
          for (let j = 0; j < step; j++) {
            const v = Math.abs(data[i * step + j] || 0);
            if (v > max) max = v;
          }
          peaks[i] = max;
        }
        setWaveform(peaks);
        ctx.close();
      } catch {
        // Waveform is purely cosmetic — silently fall back to a plain bar.
      } finally {
        if (!cancelled) setLoadingWave(false);
      }
    })();
    return () => { cancelled = true; };
  }, [track.src, track.type]);

  // Convert px to fraction within the bar
  const pxToFrac = useCallback((px) => Math.max(0, Math.min(1, px / PREVIEW_W)), []);

  const getBarFrac = (e) => {
    const rect = barRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return pxToFrac((clientX - rect.left) * (PREVIEW_W / rect.width));
  };

  const onHandleDown = useCallback((side) => (e) => {
    e.preventDefault();
    dragging.current = side;

    const onMove = (ev) => {
      if (!dragging.current || !barRef.current) return;
      const f = getBarFrac(ev);
      if (dragging.current === 'left') {
        setTrimStart(prev => {
          const max = trimEnd - MIN_AUDIO_TRIM_FRAC;
          return parseFloat(Math.min(f, max).toFixed(4));
        });
      } else {
        setTrimEnd(prev => {
          const min = trimStart + MIN_AUDIO_TRIM_FRAC;
          return parseFloat(Math.max(f, min).toFixed(4));
        });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimStart, trimEnd]);

  const apply = () => {
    commitHistory();
    updateAudioTrack(track.id, {
      trimStart: parseFloat(trimStart.toFixed(4)),
      trimEnd:   parseFloat(trimEnd.toFixed(4)),
    });
    onClose();
  };

  const reset = () => {
    setTrimStart(originalStart);
    setTrimEnd(originalEnd);
  };

  const leftPx  = trimStart * PREVIEW_W;
  const rightPx = trimEnd   * PREVIEW_W;
  const midW    = rightPx - leftPx;

  const startSec = trimStart * fullDuration;
  const endSec   = trimEnd   * fullDuration;
  const durSec   = Math.max(0, endSec - startSec);

  const startTrimmed = trimStart > 0.001;
  const endTrimmed   = trimEnd   < 0.999;

  const typeLabel = track.type === 'tts' ? '🔊 TTS Track' : track.type === 'music' ? '🎵 Music Track' : '🎙 Voice Track';

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
            <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 14 }}>Trim Audio</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{typeLabel} · {track.name}</div>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Visual trim bar */}
        <div style={{ padding: '20px 24px 10px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>
            Drag handles to trim · Source length: {fullDuration.toFixed(2)}s
          </div>

          <div
            ref={barRef}
            style={{ position: 'relative', height: BAR_H + 24, userSelect: 'none', cursor: 'default' }}
          >
            {/* Background track */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: 12, height: BAR_H, background: '#1e293b', borderRadius: 6, overflow: 'hidden' }}>
              {/* Waveform */}
              {waveform && (
                <svg width="100%" height={BAR_H} viewBox={`0 0 ${PREVIEW_W} ${BAR_H}`} preserveAspectRatio="none" style={{ display: 'block', position: 'absolute', inset: 0, opacity: 0.55 }}>
                  {Array.from(waveform).map((v, i) => {
                    const x = (i / waveform.length) * PREVIEW_W;
                    const h = Math.max(1, v * BAR_H);
                    return <rect key={i} x={x} y={(BAR_H - h) / 2} width={Math.max(1, PREVIEW_W / waveform.length - 0.5)} height={h} fill="#fbbf24" />;
                  })}
                </svg>
              )}
              {!waveform && !loadingWave && track.type === 'tts' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#475569' }}>
                  🔊 Generated speech
                </div>
              )}
            </div>

            {/* Trimmed-off left region */}
            {leftPx > 0 && (
              <div style={{
                position: 'absolute', left: 0, width: leftPx, top: 12, height: BAR_H,
                background: 'repeating-linear-gradient(-45deg, #0f172a, #0f172a 4px, #1a2540 4px, #1a2540 8px)',
                borderRadius: '6px 0 0 6px', opacity: 0.85,
              }} />
            )}

            {/* Active region outline */}
            <div style={{
              position: 'absolute', left: leftPx, width: Math.max(4, midW), top: 12, height: BAR_H,
              border: '2px solid #f59e0b', boxShadow: '0 2px 12px rgba(245,158,11,0.35)',
              borderRadius: 4, boxSizing: 'border-box', pointerEvents: 'none',
            }}>
              <span style={{ position: 'absolute', left: 8, right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 700, color: '#fbbf24', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                {durSec.toFixed(2)}s
              </span>
            </div>

            {/* Trimmed-off right region */}
            {rightPx < PREVIEW_W && (
              <div style={{
                position: 'absolute', left: rightPx, right: 0, top: 12, height: BAR_H,
                background: 'repeating-linear-gradient(-45deg, #0f172a, #0f172a 4px, #1a2540 4px, #1a2540 8px)',
                borderRadius: '0 6px 6px 0', opacity: 0.85,
              }} />
            )}

            {/* Left (start) handle */}
            <div
              onMouseDown={onHandleDown('left')}
              onTouchStart={onHandleDown('left')}
              style={{
                position: 'absolute', left: leftPx, top: 6, transform: 'translateX(-50%)',
                width: 14, height: BAR_H + 12, borderRadius: 4,
                background: '#fbbf24', cursor: 'ew-resize', zIndex: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ width: 2, height: 18, background: 'rgba(0,0,0,0.4)', borderRadius: 1 }} />
            </div>

            {/* Right (end) handle */}
            <div
              onMouseDown={onHandleDown('right')}
              onTouchStart={onHandleDown('right')}
              style={{
                position: 'absolute', left: rightPx, top: 6, transform: 'translateX(-50%)',
                width: 14, height: BAR_H + 12, borderRadius: 4,
                background: '#fbbf24', cursor: 'ew-resize', zIndex: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ width: 2, height: 18, background: 'rgba(0,0,0,0.4)', borderRadius: 1 }} />
            </div>

            {/* Time labels */}
            <div style={{ position: 'absolute', left: 0, bottom: 0, fontSize: 9, color: '#475569', fontFamily: 'monospace' }}>0s</div>
            <div style={{ position: 'absolute', right: 0, bottom: 0, fontSize: 9, color: '#475569', fontFamily: 'monospace' }}>{fullDuration.toFixed(2)}s</div>
            {startTrimmed && (
              <div style={{ position: 'absolute', left: leftPx, bottom: 0, fontSize: 9, color: '#fbbf24', fontFamily: 'monospace', transform: 'translateX(-50%)' }}>
                {startSec.toFixed(2)}s
              </div>
            )}
            {endTrimmed && (
              <div style={{ position: 'absolute', left: rightPx, bottom: 0, fontSize: 9, color: '#fbbf24', fontFamily: 'monospace', transform: 'translateX(-50%)' }}>
                {endSec.toFixed(2)}s
              </div>
            )}
          </div>
        </div>

        {/* Numeric controls */}
        <div style={{ display: 'flex', gap: 12, padding: '10px 24px 18px' }}>
          <NumberField
            label="Trim Start"
            value={startSec}
            min={0}
            max={Math.max(0, endSec - MIN_AUDIO_TRIM_FRAC * fullDuration)}
            onChange={(v) => setTrimStart(parseFloat((fullDuration > 0 ? v / fullDuration : 0).toFixed(4)))}
            unit="s"
          />
          <NumberField
            label="Duration"
            value={durSec}
            min={MIN_AUDIO_TRIM_FRAC * fullDuration}
            max={Math.max(0, fullDuration - startSec)}
            onChange={(v) => setTrimEnd(parseFloat((fullDuration > 0 ? (startSec + v) / fullDuration : 1).toFixed(4)))}
            unit="s"
          />
          <NumberField
            label="Trim End"
            value={endSec}
            min={Math.min(fullDuration, startSec + MIN_AUDIO_TRIM_FRAC * fullDuration)}
            max={fullDuration}
            onChange={(v) => setTrimEnd(parseFloat((fullDuration > 0 ? v / fullDuration : 1).toFixed(4)))}
            unit="s"
            dimColor="#f59e0b"
          />
        </div>

        {/* Info badges */}
        <div style={{ display: 'flex', gap: 8, padding: '0 24px 14px', flexWrap: 'wrap' }}>
          <Badge color="#f59e0b" label="Active" value={`${durSec.toFixed(2)}s`} />
          {startTrimmed && <Badge color="#64748b" label="Trim Start" value={`−${startSec.toFixed(2)}s`} />}
          {endTrimmed   && <Badge color="#64748b" label="Trim End"   value={`−${(fullDuration - endSec).toFixed(2)}s`} />}
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
            style={{ padding: '8px 22px', background: '#f59e0b', border: 'none', borderRadius: 7, color: '#1a1208', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}
            onMouseEnter={e => e.currentTarget.style.background = '#fbbf24'}
            onMouseLeave={e => e.currentTarget.style.background = '#f59e0b'}
          >Apply Trim</button>
        </div>
      </div>
    </div>
  );
}

function NumberField({ label, value, min, max, onChange, unit = '', dimColor }) {
  const [raw, setRaw] = useState(value.toFixed(2));
  useEffect(() => setRaw(value.toFixed(2)), [value]);

  const commit = () => {
    const n = parseFloat(raw);
    if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
    else setRaw(value.toFixed(2));
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
